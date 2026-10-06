import { and, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { ensureDatabaseSchema, getD1Binding, getDb } from "@/db";
import {
  paymentInventoryReservations,
  paymentOrderItems,
  paymentOrders,
  paymentWebhookEvents,
  products,
} from "@/db/schema";
import {
  type CommerceConfiguration,
  getCommerceConfiguration,
  isProductionCommerceEnabled,
  requireCommerceConfiguration,
  requireNewOrderConfiguration,
} from "@/lib/commerce-config";
import {
  createMercadoPagoOrder,
  cancelMercadoPagoOrder,
  getMercadoPagoOrder,
  isDefinitiveMercadoPagoCreateRejection,
  MercadoPagoHttpError,
  MercadoPagoResponseError,
  searchMercadoPagoOrdersByExternalReference,
  type MercadoPagoOrder,
  refundMercadoPagoOrder,
  validatedCheckoutUrl,
  verifyMercadoPagoSeller,
} from "@/lib/mercado-pago";
import {
  hmacSha256Hex,
  mapMercadoPagoOrderState,
  sha256Hex,
  timingSafeHexEqual,
  verifyMercadoPagoSignature,
} from "@/lib/payment-security";

export { isProductionCommerceEnabled };

type PaymentOrderRow = typeof paymentOrders.$inferSelect;
type ProductRow = typeof products.$inferSelect;

export type PublicCheckoutProduct = Pick<
  ProductRow,
  | "id"
  | "name"
  | "slug"
  | "subtitle"
  | "description"
  | "imageUrl"
  | "priceCents"
  | "currency"
  | "inventoryMode"
  | "stockQuantity"
>;

export type PublicPaymentOrder = {
  id: string;
  status: PaymentOrderRow["status"];
  statusDetail: string;
  totalCents: number;
  currency: "BRL";
  checkoutUrl: string | null;
  fulfillmentStatus: PaymentOrderRow["fulfillmentStatus"];
  createdAt: number;
  updatedAt: number;
  publicToken?: string;
};

export class CommerceError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "CommerceError";
  }
}

const STALE_CREATION_RECOVERY_MS = 2 * 60 * 1000;
const CREATION_RECOVERY_THROTTLE_MS = 60 * 1000;

export async function getPublicCheckoutProductBySlug(slug: string) {
  await ensureDatabaseSchema();
  const db = getDb();
  let product = await db.select().from(products).where(eq(products.slug, slug)).get();
  const configuration = getCommerceConfiguration();
  if (product && configuration) {
    await recoverOneStaleUncreatedOrder(configuration, product.id);
    product = await db.select().from(products).where(eq(products.id, product.id)).get();
  }
  if (
    !product ||
    product.archived ||
    !product.isVisible ||
    !product.isSellable ||
    product.status !== "available" ||
    product.priceCents <= 0
  ) {
    return null;
  }
  return toPublicCheckoutProduct(product);
}

function toPublicCheckoutProduct(product: ProductRow): PublicCheckoutProduct {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    subtitle: product.subtitle,
    description: product.description,
    imageUrl: product.imageUrl,
    priceCents: product.priceCents,
    currency: product.currency,
    inventoryMode: product.inventoryMode,
    stockQuantity: product.stockQuantity,
  };
}

export async function createCommerceOrder(input: {
  requestId: string;
  email: string;
  items: Array<{ productId: string; quantity: number }>;
}) {
  const configuration = requireNewOrderConfiguration();
  await ensureDatabaseSchema();
  await recoverOneStaleUncreatedOrder(configuration);

  const normalizedItems = [...input.items]
    .map((item) => ({ productId: item.productId, quantity: item.quantity }))
    .sort((left, right) => left.productId.localeCompare(right.productId));
  const buyerEmail = input.email.trim().toLowerCase();
  const requestFingerprint = await sha256Hex(JSON.stringify({ buyerEmail, items: normalizedItems }));
  const publicToken = await orderPublicToken(configuration, input.requestId);
  const publicTokenHash = await sha256Hex(publicToken);
  const db = getDb();

  const existing = await db.select().from(paymentOrders)
    .where(eq(paymentOrders.idempotencyKey, input.requestId)).get();
  if (existing) {
    if (existing.requestFingerprint !== requestFingerprint) {
      throw new CommerceError(
        409,
        "Esta tentativa de compra já foi usada com outros dados.",
        "idempotency_conflict",
      );
    }
    return resumeExistingOrder(configuration, existing, publicToken);
  }

  const ids = normalizedItems.map((item) => item.productId);
  const productRows = await db.select().from(products).where(inArray(products.id, ids));
  const productById = new Map(productRows.map((product) => [product.id, product]));
  const snapshots = normalizedItems.map((item) => {
    const product = productById.get(item.productId);
    if (
      !product ||
      product.archived ||
      !product.isVisible ||
      !product.isSellable ||
      product.status !== "available" ||
      product.priceCents <= 0 ||
      product.currency !== "BRL"
    ) {
      throw new CommerceError(
        409,
        "Um dos produtos não está disponível para compra.",
        "product_unavailable",
      );
    }
    if (product.inventoryMode === "finite" && product.stockQuantity < item.quantity) {
      throw new CommerceError(409, "Estoque insuficiente para esta compra.", "insufficient_stock");
    }
    const totalCents = product.priceCents * item.quantity;
    if (!Number.isSafeInteger(totalCents)) {
      throw new CommerceError(400, "O valor do pedido é inválido.", "amount_invalid");
    }
    return { product, quantity: item.quantity, totalCents, itemId: crypto.randomUUID() };
  });
  const totalCents = snapshots.reduce((total, item) => total + item.totalCents, 0);
  if (!Number.isSafeInteger(totalCents) || totalCents < 100 || totalCents > 10_000_000) {
    throw new CommerceError(400, "O valor total do pedido é inválido.", "amount_invalid");
  }

  const now = Date.now();
  const database = getD1Binding();
  const statements: D1PreparedStatement[] = [
    database.prepare(`INSERT INTO payment_orders (
      id, idempotency_key, request_fingerprint, public_token_hash, buyer_email,
      status, status_detail, currency, total_cents, fulfillment_status,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'creating', 'creating', 'BRL', ?, 'pending', ?, ?)`)
      .bind(
        input.requestId,
        input.requestId,
        requestFingerprint,
        publicTokenHash,
        buyerEmail,
        totalCents,
        now,
        now,
      ),
  ];

  for (const snapshot of snapshots) {
    statements.push(
      database.prepare(`INSERT INTO payment_order_items (
        id, order_id, product_id, product_slug, product_name, sku,
        unit_price_cents, quantity, total_cents, fulfillment_mode, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          snapshot.itemId,
          input.requestId,
          snapshot.product.id,
          snapshot.product.slug,
          snapshot.product.name,
          snapshot.product.sku,
          snapshot.product.priceCents,
          snapshot.quantity,
          snapshot.totalCents,
          snapshot.product.fulfillmentMode,
          now,
        ),
      // A finite product with insufficient stock deliberately tries to insert
      // NULL into quantity. That constraint aborts the whole D1 batch, including
      // the order and every other reservation, so no partial cart can be sold.
      // The immutable commerce fields are compared with the snapshot too: a
      // concurrent Studio edit must make the buyer review the updated offer.
      database.prepare(`INSERT INTO payment_inventory_reservations (
        id, order_id, order_item_id, product_id, inventory_mode, quantity,
        status, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?,
        (SELECT CASE
          WHEN is_sellable = 1 AND is_visible = 1 AND status = 'available'
            AND archived = 0
            AND inventory_revision = ?
            AND price_cents = ?
            AND currency = ?
            AND inventory_mode = ?
            AND fulfillment_mode = ?
            AND sku = ?
            THEN inventory_mode
          ELSE NULL
        END FROM products WHERE id = ?),
        (SELECT CASE
          WHEN is_sellable = 1 AND is_visible = 1 AND status = 'available'
            AND archived = 0
            AND inventory_revision = ?
            AND price_cents = ?
            AND currency = ?
            AND inventory_mode = ?
            AND fulfillment_mode = ?
            AND sku = ?
            AND (inventory_mode = 'unlimited' OR stock_quantity >= ?)
            THEN ?
          ELSE NULL
        END FROM products WHERE id = ?),
        'reserved', ?, ?
      )`)
        .bind(
          crypto.randomUUID(),
          input.requestId,
          snapshot.itemId,
          snapshot.product.id,
          snapshot.product.inventoryRevision,
          snapshot.product.priceCents,
          snapshot.product.currency,
          snapshot.product.inventoryMode,
          snapshot.product.fulfillmentMode,
          snapshot.product.sku,
          snapshot.product.id,
          snapshot.product.inventoryRevision,
          snapshot.product.priceCents,
          snapshot.product.currency,
          snapshot.product.inventoryMode,
          snapshot.product.fulfillmentMode,
          snapshot.product.sku,
          snapshot.quantity,
          snapshot.quantity,
          snapshot.product.id,
          now,
          now,
        ),
    );
    if (snapshot.product.inventoryMode === "finite") {
      statements.push(
        database.prepare(`UPDATE products
          SET stock_quantity = stock_quantity - ?,
              inventory_revision = inventory_revision + 1
          WHERE id = ? AND inventory_mode = 'finite' AND archived = 0
            AND inventory_revision = ? AND price_cents = ? AND currency = ?
            AND fulfillment_mode = ? AND sku = ? AND stock_quantity >= ?`)
          .bind(
            snapshot.quantity,
            snapshot.product.id,
            snapshot.product.inventoryRevision,
            snapshot.product.priceCents,
            snapshot.product.currency,
            snapshot.product.fulfillmentMode,
            snapshot.product.sku,
            snapshot.quantity,
          ),
      );
    }
  }

  try {
    await database.batch(statements);
  } catch (error) {
    const concurrent = await db.select().from(paymentOrders)
      .where(eq(paymentOrders.idempotencyKey, input.requestId)).get();
    if (concurrent) {
      if (concurrent.requestFingerprint !== requestFingerprint) {
        throw new CommerceError(
          409,
          "Esta tentativa de compra já foi usada com outros dados.",
          "idempotency_conflict",
        );
      }
      return resumeExistingOrder(configuration, concurrent, publicToken);
    }
    const refreshedProducts = await db.select().from(products).where(inArray(products.id, ids));
    const refreshedById = new Map(refreshedProducts.map((product) => [product.id, product]));
    const unavailable = snapshots.some(({ product: snapshot }) => {
      const product = refreshedById.get(snapshot.id);
      return !product || product.archived || !product.isVisible || !product.isSellable ||
        product.status !== "available";
    });
    if (unavailable) {
      throw new CommerceError(
        409,
        "Um dos produtos não está disponível para compra.",
        "product_unavailable",
      );
    }
    const insufficient = refreshedProducts.some((product) => {
      const requested = normalizedItems.find((item) => item.productId === product.id);
      return requested && product.inventoryMode === "finite" &&
        product.stockQuantity < requested.quantity;
    });
    if (insufficient) {
      throw new CommerceError(409, "Estoque insuficiente para esta compra.", "insufficient_stock");
    }
    const productChanged = snapshots.some(({ product: snapshot }) => {
      const product = refreshedById.get(snapshot.id);
      return !product || product.inventoryRevision !== snapshot.inventoryRevision ||
        product.priceCents !== snapshot.priceCents || product.currency !== snapshot.currency ||
        product.inventoryMode !== snapshot.inventoryMode ||
        product.fulfillmentMode !== snapshot.fulfillmentMode || product.sku !== snapshot.sku;
    });
    if (productChanged) {
      throw new CommerceError(
        409,
        "Um produto mudou enquanto o pedido era preparado. Revise a compra.",
        "product_changed",
      );
    }
    throw error;
  }

  const localOrder = await db.select().from(paymentOrders)
    .where(eq(paymentOrders.id, input.requestId)).get();
  if (!localOrder) throw new Error("payment_order_disappeared");
  return submitOrderToProvider(configuration, localOrder, publicToken);
}

async function resumeExistingOrder(
  configuration: CommerceConfiguration,
  existing: PaymentOrderRow,
  publicToken: string,
) {
  if (existing.status === "failed") {
    // Repairs a reservation left by an older deployment that may have stopped
    // between persisting the failure and releasing its inventory.
    await releaseReservedInventory(existing.id);
    throw new CommerceError(
      409,
      "A tentativa anterior foi recusada. Inicie uma nova tentativa de pagamento.",
      "previous_attempt_failed",
    );
  }
  if (existing.checkoutUrl) return toPublicOrder(existing, publicToken);
  if (existing.status === "review") {
    return submitOrderToProvider(configuration, existing, publicToken);
  }
  if (existing.status === "creating") {
    if (Date.now() - existing.updatedAt.getTime() < 60_000) {
      throw new CommerceError(
        409,
        "Este pedido já está sendo preparado. Aguarde alguns instantes e tente novamente.",
        "creation_in_progress",
      );
    }

    const db = getDb();
    await db.update(paymentOrders).set({
      status: "review",
      statusDetail: "creation_uncertain",
      updatedAt: new Date(),
    }).where(and(
      eq(paymentOrders.id, existing.id),
      eq(paymentOrders.status, "creating"),
      isNull(paymentOrders.providerOrderId),
      isNull(paymentOrders.checkoutUrl),
    ));
    const refreshed = await db.select().from(paymentOrders)
      .where(eq(paymentOrders.id, existing.id)).get();
    if (!refreshed) throw new Error("payment_order_disappeared");
    if (refreshed.checkoutUrl) return toPublicOrder(refreshed, publicToken);
    if (refreshed.status === "review") {
      return submitOrderToProvider(configuration, refreshed, publicToken);
    }
    throw new CommerceError(
      409,
      "Este pedido ainda está sendo preparado. Aguarde alguns instantes.",
      "creation_in_progress",
    );
  }
  return toPublicOrder(existing, publicToken);
}

async function recoverOneStaleUncreatedOrder(
  configuration: CommerceConfiguration,
  productId?: string,
) {
  try {
    const db = getDb();
    const now = Date.now();
    const staleBefore = new Date(now - STALE_CREATION_RECOVERY_MS);
    const retryBefore = new Date(now - CREATION_RECOVERY_THROTTLE_MS);
    const commonFilter = and(
      inArray(paymentOrders.status, ["creating", "review"]),
      isNull(paymentOrders.providerOrderId),
      isNull(paymentOrders.checkoutUrl),
      lte(paymentOrders.createdAt, staleBefore),
      or(
        isNull(paymentOrders.lastVerifiedAt),
        lte(paymentOrders.lastVerifiedAt, retryBefore),
      ),
    );
    const candidates = productId
      ? await db.select({ id: paymentOrders.id })
          .from(paymentOrders)
          .innerJoin(
            paymentInventoryReservations,
            eq(paymentInventoryReservations.orderId, paymentOrders.id),
          )
          .where(and(
            commonFilter,
            eq(paymentInventoryReservations.productId, productId),
            eq(paymentInventoryReservations.status, "reserved"),
          ))
          .orderBy(paymentOrders.createdAt)
          .limit(1)
      : await db.select({ id: paymentOrders.id })
          .from(paymentOrders)
          .where(commonFilter)
          .orderBy(paymentOrders.createdAt)
          .limit(1);
    const candidateId = candidates[0]?.id;
    if (!candidateId) return;

    // Claim the recovery briefly so concurrent page views do not call the
    // provider for the same order. Retrying uses the original idempotency key.
    const claim = await db.update(paymentOrders).set({
      lastVerifiedAt: new Date(now),
    }).where(and(
      eq(paymentOrders.id, candidateId),
      inArray(paymentOrders.status, ["creating", "review"]),
      isNull(paymentOrders.providerOrderId),
      isNull(paymentOrders.checkoutUrl),
      or(
        isNull(paymentOrders.lastVerifiedAt),
        lte(paymentOrders.lastVerifiedAt, retryBefore),
      ),
    ));
    if ((claim.meta.changes ?? 0) === 0) return;

    const row = await db.select().from(paymentOrders)
      .where(eq(paymentOrders.id, candidateId)).get();
    if (!row || row.providerOrderId || row.checkoutUrl) return;
    await submitOrderToProvider(
      configuration,
      row,
      await orderPublicToken(configuration, row.id),
    );
  } catch (error) {
    console.warn(JSON.stringify({
      event: "commerce_stale_creation_recovery_failed",
      reason: safeProviderFailure(error),
    }));
  }
}

async function submitOrderToProvider(
  configuration: CommerceConfiguration,
  localOrder: PaymentOrderRow,
  publicToken: string,
) {
  const db = getDb();
  const itemRows = await db.select().from(paymentOrderItems)
    .where(eq(paymentOrderItems.orderId, localOrder.id))
    .orderBy(paymentOrderItems.productId, paymentOrderItems.id);
  if (
    itemRows.length === 0 ||
    itemRows.reduce((total, item) => total + item.totalCents, 0) !== localOrder.totalCents
  ) {
    throw new CommerceError(409, "O pedido local está incompleto.", "order_snapshot_invalid");
  }

  if (localOrder.status === "review") {
    try {
      const reconciled = await reconcileUncertainCreation(
        configuration,
        localOrder,
        publicToken,
      );
      if (reconciled) return reconciled;
    } catch (error) {
      console.warn(JSON.stringify({
        event: "commerce_order_reconciliation_failed",
        orderId: localOrder.id,
        reason: safeProviderFailure(error),
      }));
      throw new CommerceError(
        503,
        "A tentativa anterior ainda está sendo conciliada. Aguarde antes de tentar novamente.",
        "creation_uncertain",
      );
    }
  }

  let providerCreateStarted = false;
  try {
    await verifyMercadoPagoSeller(configuration);
    providerCreateStarted = true;
    const providerOrder = await createMercadoPagoOrder({
      configuration,
      idempotencyKey: localOrder.idempotencyKey,
      externalReference: localOrder.id,
      buyerEmail: localOrder.buyerEmail,
      totalCents: localOrder.totalCents,
      returnToken: publicToken,
      items: itemRows.map((item) => ({
        title: item.productName,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
      })),
    });
    return persistCreatedProviderOrder(configuration, localOrder, providerOrder, publicToken);
  } catch (error) {
    // Before the POST, configuration/account failures cannot have created a
    // charge. After it starts, only documented validation/authentication errors
    // are definitive. Idempotency conflicts, locks, timeouts, unknown codes,
    // and malformed 2xx responses remain uncertain and keep stock reserved.
    const definitive = !providerCreateStarted || isDefinitiveMercadoPagoCreateRejection(error);
    if (providerCreateStarted && !definitive) {
      try {
        const reconciled = await reconcileUncertainCreation(
          configuration,
          localOrder,
          publicToken,
        );
        if (reconciled) return reconciled;
      } catch (reconciliationError) {
        console.warn(JSON.stringify({
          event: "commerce_order_reconciliation_failed",
          orderId: localOrder.id,
          reason: safeProviderFailure(reconciliationError),
        }));
      }
    }
    if (definitive) {
      const failureApplied = await failUncreatedOrderAndReleaseInventory(
        localOrder.id,
        safeProviderFailure(error),
      );
      if (!failureApplied) {
        const concurrent = await db.select().from(paymentOrders)
          .where(eq(paymentOrders.id, localOrder.id)).get();
        if (concurrent?.checkoutUrl) return toPublicOrder(concurrent, publicToken);
      }
    } else {
      await db.update(paymentOrders).set({
        status: "review",
        statusDetail: "creation_uncertain",
        failureReason: safeProviderFailure(error),
        lastVerifiedAt: new Date(),
        updatedAt: new Date(),
      }).where(and(
        eq(paymentOrders.id, localOrder.id),
        isNull(paymentOrders.providerOrderId),
        isNull(paymentOrders.checkoutUrl),
        inArray(paymentOrders.status, ["creating", "review"]),
      ));
    }
    console.error(JSON.stringify({
      event: "commerce_order_create_failed",
      orderId: localOrder.id,
      definitive,
      reason: safeProviderFailure(error),
    }));
    throw new CommerceError(
      definitive ? 502 : 503,
      definitive
        ? "O Mercado Pago recusou a criação do pedido. Nenhuma cobrança foi iniciada."
        : "Não foi possível confirmar a criação do pedido. Não tente novamente com outro identificador.",
      definitive ? "provider_rejected" : "creation_uncertain",
    );
  }
}

async function reconcileUncertainCreation(
  configuration: CommerceConfiguration,
  localOrder: PaymentOrderRow,
  publicToken?: string,
) {
  const candidates = await searchMercadoPagoOrdersByExternalReference(
    configuration,
    localOrder.id,
    localOrder.createdAt,
  );
  if (candidates.length === 0) {
    await getDb().update(paymentOrders).set({
      lastVerifiedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(paymentOrders.id, localOrder.id));
    return null;
  }
  if (candidates.length !== 1) {
    await getDb().update(paymentOrders).set({
      status: "review",
      statusDetail: "creation_ambiguous",
      failureReason: "provider_order_ambiguous",
      lastVerifiedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(paymentOrders.id, localOrder.id));
    throw new MercadoPagoResponseError("provider_order_ambiguous");
  }

  const providerOrder = await getMercadoPagoOrder(configuration, candidates[0].id);
  return persistCreatedProviderOrder(configuration, localOrder, providerOrder, publicToken);
}

async function persistCreatedProviderOrder(
  configuration: CommerceConfiguration,
  localOrder: PaymentOrderRow,
  providerOrder: MercadoPagoOrder,
  publicToken?: string,
) {
  validateProviderOrder(configuration, providerOrder, {
    orderId: localOrder.id,
    totalCents: localOrder.totalCents,
    currency: localOrder.currency,
  });
  const state = mapMercadoPagoOrderState(providerOrder.status, providerOrder.status_detail);
  const checkoutUrl = providerOrder.checkout_url
    ? validatedCheckoutUrl(providerOrder)
    : null;
  if (!checkoutUrl && ["pending", "review"].includes(state.status)) {
    throw new MercadoPagoResponseError("checkout_url_missing");
  }
  await getDb().update(paymentOrders).set({
    ...(checkoutUrl ? { checkoutUrl } : {}),
    failureReason: null,
    updatedAt: new Date(),
  }).where(eq(paymentOrders.id, localOrder.id));
  const order = await applyAuthoritativeProviderOrder(configuration, localOrder, providerOrder);
  return publicToken ? { ...order, publicToken } : order;
}

export async function getPublicCommerceOrder(orderId: string, publicToken: string) {
  const configuration = requireCommerceConfiguration();
  await ensureDatabaseSchema();
  const row = await getDb().select().from(paymentOrders)
    .where(eq(paymentOrders.id, orderId)).get();
  if (!row || !(await validOrderPublicToken(configuration, row, publicToken))) {
    throw new CommerceError(404, "Pedido não encontrado.", "order_not_found");
  }
  const lastVerifiedAt = row.lastVerifiedAt?.getTime() ?? 0;
  if (
    !row.providerOrderId &&
    row.status === "review" &&
    Date.now() - lastVerifiedAt >= 10_000
  ) {
    try {
      const reconciled = await reconcileUncertainCreation(configuration, row);
      if (reconciled) return reconciled;
    } catch (error) {
      console.warn(JSON.stringify({
        event: "commerce_public_reconciliation_failed",
        orderId: row.id,
        reason: safeProviderFailure(error),
      }));
    }
  }
  if (
    row.providerOrderId &&
    ["pending", "review"].includes(row.status) &&
    Date.now() - lastVerifiedAt >= 10_000
  ) {
    try {
      const providerOrder = await getMercadoPagoOrder(configuration, row.providerOrderId);
      return await applyAuthoritativeProviderOrder(configuration, row, providerOrder);
    } catch (error) {
      // Webhook delivery remains primary. A temporary provider failure must not
      // hide the last locally confirmed state from the buyer.
      console.warn(JSON.stringify({
        event: "commerce_public_status_refresh_failed",
        orderId: row.id,
        reason: safeProviderFailure(error),
      }));
    }
  }
  return toPublicOrder(row);
}

export async function refreshCommerceOrder(orderId: string) {
  const configuration = requireCommerceConfiguration();
  await ensureDatabaseSchema();
  const db = getDb();
  const row = await db.select().from(paymentOrders).where(eq(paymentOrders.id, orderId)).get();
  if (!row) throw new CommerceError(404, "Pedido não encontrado.", "order_not_found");
  if (!row.providerOrderId) {
    const reconciled = await reconcileUncertainCreation(configuration, row);
    if (reconciled) return reconciled;
    throw new CommerceError(
      409,
      "A criação ainda não apareceu no Mercado Pago. Tente atualizar novamente mais tarde.",
      "provider_id_missing",
    );
  }
  const providerOrder = await getMercadoPagoOrder(configuration, row.providerOrderId);
  return applyAuthoritativeProviderOrder(configuration, row, providerOrder);
}

export async function cancelCommerceOrder(orderId: string) {
  const configuration = requireCommerceConfiguration();
  await ensureDatabaseSchema();
  const row = await getDb().select().from(paymentOrders).where(eq(paymentOrders.id, orderId)).get();
  if (!row) throw new CommerceError(404, "Pedido não encontrado.", "order_not_found");
  if (!row.providerOrderId) {
    throw new CommerceError(409, "O pedido ainda não possui referência no Mercado Pago.", "provider_id_missing");
  }
  if (!["pending", "review"].includes(row.status)) {
    throw new CommerceError(409, "Este pedido não pode mais ser cancelado.", "order_not_cancellable");
  }
  try {
    await cancelMercadoPagoOrder(
      configuration,
      row.providerOrderId,
      await operationIdempotencyKey(row.id, "cancel"),
    );
  } catch (error) {
    const current = await getMercadoPagoOrder(configuration, row.providerOrderId);
    const state = mapMercadoPagoOrderState(current.status, current.status_detail);
    if (state.status === "cancelled") {
      return applyAuthoritativeProviderOrder(configuration, row, current);
    }
    throw error;
  }
  const providerOrder = await getMercadoPagoOrder(configuration, row.providerOrderId);
  return applyAuthoritativeProviderOrder(configuration, row, providerOrder);
}

export async function refundCommerceOrder(orderId: string) {
  const configuration = requireCommerceConfiguration();
  await ensureDatabaseSchema();
  const row = await getDb().select().from(paymentOrders).where(eq(paymentOrders.id, orderId)).get();
  if (!row) throw new CommerceError(404, "Pedido não encontrado.", "order_not_found");
  if (!row.providerOrderId) {
    throw new CommerceError(409, "O pedido ainda não possui referência no Mercado Pago.", "provider_id_missing");
  }
  if (row.status !== "paid") {
    throw new CommerceError(409, "Somente pedidos pagos podem ser reembolsados.", "order_not_refundable");
  }
  try {
    await refundMercadoPagoOrder(
      configuration,
      row.providerOrderId,
      await operationIdempotencyKey(row.id, "refund"),
    );
  } catch (error) {
    const current = await getMercadoPagoOrder(configuration, row.providerOrderId);
    const state = mapMercadoPagoOrderState(current.status, current.status_detail);
    if (state.status === "refunded") {
      return applyAuthoritativeProviderOrder(configuration, row, current);
    }
    throw error;
  }
  const providerOrder = await getMercadoPagoOrder(configuration, row.providerOrderId);
  return applyAuthoritativeProviderOrder(configuration, row, providerOrder);
}

export async function completeCommerceFulfillment(orderId: string) {
  await ensureDatabaseSchema();
  const db = getDb();
  const row = await db.select().from(paymentOrders).where(eq(paymentOrders.id, orderId)).get();
  if (!row) throw new CommerceError(404, "Pedido não encontrado.", "order_not_found");
  if (row.status !== "paid" || !["ready", "completed"].includes(row.fulfillmentStatus)) {
    throw new CommerceError(
      409,
      "A entrega só pode ser concluída depois da confirmação do pagamento.",
      "fulfillment_not_ready",
    );
  }
  if (row.fulfillmentStatus !== "completed") {
    await db.update(paymentOrders).set({
      fulfillmentStatus: "completed",
      updatedAt: new Date(),
    }).where(eq(paymentOrders.id, orderId));
  }
  const updated = await db.select().from(paymentOrders).where(eq(paymentOrders.id, orderId)).get();
  if (!updated) throw new Error("payment_order_disappeared");
  return toPublicOrder(updated);
}

export async function processMercadoPagoWebhook(input: {
  signatureHeader: string | null;
  requestId: string | null;
  dataId: string;
  rawBody: string;
}) {
  const configuration = requireCommerceConfiguration();
  const signature = await verifyMercadoPagoSignature({
    secret: configuration.webhookSecret,
    signatureHeader: input.signatureHeader,
    requestId: input.requestId,
    dataId: input.dataId,
  });
  if (!signature.valid) {
    console.warn(JSON.stringify({ event: "mercado_pago_webhook_rejected", reason: signature.reason }));
    throw new CommerceError(401, "Assinatura inválida.", "signature_invalid");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(input.rawBody);
  } catch {
    throw new CommerceError(400, "Notificação inválida.", "webhook_json_invalid");
  }
  const parsed = webhookSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new CommerceError(400, "Notificação inválida.", "webhook_schema_invalid");
  }
  const body = parsed.data;
  if (
    body.type !== "order" ||
    body.data.id !== input.dataId ||
    !body.live_mode ||
    String(body.user_id) !== configuration.sellerUserId ||
    String(body.application_id) !== configuration.applicationId
  ) {
    throw new CommerceError(400, "Notificação não corresponde a esta loja.", "webhook_scope_invalid");
  }

  await ensureDatabaseSchema();
  const eventId = String(body.id);
  const payloadHash = await sha256Hex(input.rawBody);
  const db = getDb();
  const existingEvent = await db.select().from(paymentWebhookEvents)
    .where(eq(paymentWebhookEvents.id, eventId)).get();
  if (existingEvent?.payloadHash !== undefined && existingEvent.payloadHash !== payloadHash) {
    throw new CommerceError(409, "Notificação conflitante.", "webhook_event_conflict");
  }
  if (existingEvent?.status === "processed") return { duplicate: true };

  const now = Date.now();
  await getD1Binding().prepare(`INSERT INTO payment_webhook_events (
      id, provider_order_id, action, payload_hash, signature_variant,
      status, failure_reason, created_at, processed_at
    ) VALUES (?, ?, ?, ?, ?, 'received', NULL, ?, NULL)
    ON CONFLICT(id) DO UPDATE SET
      status = 'received', failure_reason = NULL, signature_variant = excluded.signature_variant`)
    .bind(eventId, body.data.id, body.action, payloadHash, signature.variant, now)
    .run();

  try {
    const providerOrder = await getMercadoPagoOrder(configuration, body.data.id);
    const localOrder = await db.select().from(paymentOrders).where(or(
      eq(paymentOrders.providerOrderId, body.data.id),
      eq(paymentOrders.id, providerOrder.external_reference ?? ""),
    )).get();
    if (!localOrder) {
      throw new CommerceError(404, "Pedido local não encontrado.", "local_order_not_found");
    }
    await applyAuthoritativeProviderOrder(configuration, localOrder, providerOrder);
    await db.update(paymentWebhookEvents).set({
      status: "processed",
      processedAt: new Date(),
      failureReason: null,
    }).where(eq(paymentWebhookEvents.id, eventId));
    console.info(JSON.stringify({
      event: "mercado_pago_webhook_processed",
      orderId: localOrder.id,
      action: body.action,
      signatureVariant: signature.variant,
    }));
    return { duplicate: false };
  } catch (error) {
    await db.update(paymentWebhookEvents).set({
      status: "rejected",
      failureReason: safeProviderFailure(error),
      processedAt: new Date(),
    }).where(eq(paymentWebhookEvents.id, eventId));
    throw error;
  }
}

export async function listCommerceOrdersForAdmin(limit = 100) {
  await ensureDatabaseSchema();
  const configuration = getCommerceConfiguration();
  if (configuration) await recoverOneStaleUncreatedOrder(configuration);
  const safeLimit = Math.min(200, Math.max(1, Math.trunc(limit)));
  return getDb().select({
    id: paymentOrders.id,
    buyerEmail: paymentOrders.buyerEmail,
    providerOrderId: paymentOrders.providerOrderId,
    status: paymentOrders.status,
    statusDetail: paymentOrders.statusDetail,
    totalCents: paymentOrders.totalCents,
    currency: paymentOrders.currency,
    fulfillmentStatus: paymentOrders.fulfillmentStatus,
    createdAt: paymentOrders.createdAt,
    updatedAt: paymentOrders.updatedAt,
  }).from(paymentOrders).orderBy(desc(paymentOrders.createdAt)).limit(safeLimit);
}

async function applyAuthoritativeProviderOrder(
  configuration: CommerceConfiguration,
  localOrder: PaymentOrderRow,
  providerOrder: MercadoPagoOrder,
) {
  validateProviderOrder(configuration, providerOrder, {
    orderId: localOrder.id,
    totalCents: localOrder.totalCents,
    currency: localOrder.currency,
    providerOrderId: localOrder.providerOrderId,
  });
  if (!providerOrder.status) {
    throw new MercadoPagoResponseError("provider_status_missing");
  }
  const state = mapMercadoPagoOrderState(providerOrder.status, providerOrder.status_detail);
  const db = getDb();
  const nonTerminalStatuses: PaymentOrderRow["status"][] = ["creating", "pending", "review"];
  const allowedCurrentStatuses: PaymentOrderRow["status"][] = state.status === "paid"
    ? [...nonTerminalStatuses, "paid"]
    : state.status === "refunded"
      ? ["creating", "pending", "review", "paid", "failed", "cancelled", "refunded"]
      : state.status === "failed"
        ? [
            ...nonTerminalStatuses,
            "failed",
            ...(state.detail === "charged_back" ? ["paid" as const] : []),
          ]
        : state.status === "cancelled"
          ? [...nonTerminalStatuses, "cancelled"]
          : state.status === "review" && state.detail === "partially_refunded"
            ? [...nonTerminalStatuses, "paid"]
            : nonTerminalStatuses;
  const mayAdvancePartialRefund = state.status === "refunded" ||
    state.detail === "charged_back" || state.detail === "partially_refunded";
  const now = Date.now();
  const database = getD1Binding();
  const fulfillmentExpression = state.fulfillmentReady
    ? "CASE WHEN fulfillment_status = 'pending' THEN 'ready' ELSE fulfillment_status END"
    : ["failed", "cancelled"].includes(state.status)
      ? "CASE WHEN fulfillment_status = 'completed' THEN fulfillment_status ELSE 'cancelled' END"
      : "fulfillment_status";
  const paidAtExpression = state.status === "paid" ? "COALESCE(paid_at, ?)" : "paid_at";
  const statusPlaceholders = allowedCurrentStatuses.map(() => "?").join(", ");
  const partialRefundGuard = mayAdvancePartialRefund
    ? ""
    : "AND status_detail <> 'partially_refunded'";
  const statements: D1PreparedStatement[] = [
    database.prepare(`UPDATE payment_orders
      SET provider_order_id = ?, provider_user_id = ?, provider_status = ?,
          provider_status_detail = ?, status = ?, status_detail = ?,
          fulfillment_status = ${fulfillmentExpression}, failure_reason = NULL,
          paid_at = ${paidAtExpression}, last_verified_at = ?, updated_at = ?
      WHERE id = ? AND status IN (${statusPlaceholders}) ${partialRefundGuard}`)
      .bind(
        providerOrder.id,
        String(providerOrder.user_id),
        providerOrder.status,
        providerOrder.status_detail ?? providerOrder.status,
        state.status,
        state.detail,
        ...(state.status === "paid" ? [now] : []),
        now,
        now,
        localOrder.id,
        ...allowedCurrentStatuses,
      ),
  ];

  if (state.status === "paid") {
    statements.push(
      database.prepare(`UPDATE payment_inventory_reservations
        SET status = 'committed', updated_at = ?
        WHERE order_id = ? AND status = 'reserved' AND EXISTS (
          SELECT 1 FROM payment_orders
          WHERE id = ? AND status = 'paid' AND provider_order_id = ?
        )`)
        .bind(now, localOrder.id, localOrder.id, providerOrder.id),
    );
  } else if (["failed", "cancelled"].includes(state.status)) {
    const reservations = await db.select({
      productId: paymentInventoryReservations.productId,
      inventoryMode: paymentInventoryReservations.inventoryMode,
      quantity: paymentInventoryReservations.quantity,
    }).from(paymentInventoryReservations).where(and(
      eq(paymentInventoryReservations.orderId, localOrder.id),
      eq(paymentInventoryReservations.status, "reserved"),
    ));
    for (const reservation of reservations) {
      if (reservation.inventoryMode === "finite") {
        statements.push(
          database.prepare(`UPDATE products
            SET stock_quantity = stock_quantity + ?,
                inventory_revision = inventory_revision + 1
            WHERE id = ? AND EXISTS (
              SELECT 1
              FROM payment_inventory_reservations AS reservation
              JOIN payment_orders AS payment_order ON payment_order.id = reservation.order_id
              WHERE reservation.order_id = ? AND reservation.product_id = ?
                AND reservation.status = 'reserved'
                AND payment_order.status = ? AND payment_order.provider_order_id = ?
            )`)
            .bind(
              reservation.quantity,
              reservation.productId,
              localOrder.id,
              reservation.productId,
              state.status,
              providerOrder.id,
            ),
        );
      }
    }
    statements.push(
      database.prepare(`UPDATE payment_inventory_reservations
        SET status = 'released', updated_at = ?
        WHERE order_id = ? AND status = 'reserved' AND EXISTS (
          SELECT 1 FROM payment_orders
          WHERE id = ? AND status = ? AND provider_order_id = ?
        )`)
        .bind(now, localOrder.id, localOrder.id, state.status, providerOrder.id),
    );
  }

  await database.batch(statements);

  const updated = await db.select().from(paymentOrders)
    .where(eq(paymentOrders.id, localOrder.id)).get();
  if (!updated) throw new Error("payment_order_disappeared");
  return toPublicOrder(updated);
}

function validateProviderOrder(
  configuration: CommerceConfiguration,
  providerOrder: MercadoPagoOrder,
  expected: {
    orderId: string;
    providerOrderId?: string | null;
    totalCents: number;
    currency: string;
  },
) {
  const providerAmount = typeof providerOrder.total_amount === "number"
    ? Math.round(providerOrder.total_amount * 100)
    : decimalStringToCents(providerOrder.total_amount);
  if (expected.providerOrderId && providerOrder.id !== expected.providerOrderId) {
    throw new MercadoPagoResponseError("provider_order_id_mismatch");
  }
  if (providerOrder.external_reference !== expected.orderId) {
    throw new MercadoPagoResponseError("external_reference_mismatch");
  }
  if (providerAmount !== expected.totalCents) {
    throw new MercadoPagoResponseError("total_amount_mismatch");
  }
  if (providerOrder.currency !== expected.currency) {
    throw new MercadoPagoResponseError("currency_mismatch");
  }
  if (!providerOrder.user_id || String(providerOrder.user_id) !== configuration.sellerUserId) {
    throw new MercadoPagoResponseError("seller_user_mismatch");
  }
  const applicationId = providerOrder.integration_data?.application_id;
  if (!applicationId || String(applicationId) !== configuration.applicationId) {
    throw new MercadoPagoResponseError("application_id_mismatch");
  }
  // The Orders API omits live_mode in some documented responses. An explicit
  // false is unsafe in production; absence is cross-checked by seller/app IDs
  // and the webhook independently requires live_mode=true.
  if (providerOrder.live_mode === false) {
    throw new MercadoPagoResponseError("live_mode_mismatch");
  }
}

function decimalStringToCents(value: string | null | undefined) {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(value ?? "");
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

async function orderPublicToken(configuration: CommerceConfiguration, orderId: string) {
  return hmacSha256Hex(configuration.orderTokenSecret, `payment-order:${orderId}`);
}

async function operationIdempotencyKey(orderId: string, action: "cancel" | "refund") {
  const digest = await sha256Hex(`${orderId}:${action}`);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

async function validOrderPublicToken(
  configuration: CommerceConfiguration,
  row: PaymentOrderRow,
  publicToken: string,
) {
  const expectedToken = await orderPublicToken(configuration, row.id);
  const tokenHash = await sha256Hex(publicToken);
  return timingSafeHexEqual(expectedToken, publicToken) &&
    timingSafeHexEqual(row.publicTokenHash, tokenHash);
}

function toPublicOrder(row: PaymentOrderRow, publicToken?: string): PublicPaymentOrder {
  return {
    id: row.id,
    status: row.status,
    statusDetail: row.statusDetail,
    totalCents: row.totalCents,
    currency: row.currency,
    checkoutUrl: row.checkoutUrl,
    fulfillmentStatus: row.fulfillmentStatus,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    ...(publicToken ? { publicToken } : {}),
  };
}

async function failUncreatedOrderAndReleaseInventory(orderId: string, failureReason: string) {
  const reservations = await getDb().select({
    productId: paymentInventoryReservations.productId,
    inventoryMode: paymentInventoryReservations.inventoryMode,
    quantity: paymentInventoryReservations.quantity,
  }).from(paymentInventoryReservations).where(and(
    eq(paymentInventoryReservations.orderId, orderId),
    eq(paymentInventoryReservations.status, "reserved"),
  ));
  const database = getD1Binding();
  const now = Date.now();
  const statements: D1PreparedStatement[] = [
    database.prepare(`UPDATE payment_orders
      SET status = 'failed', status_detail = 'provider_rejected',
          failure_reason = ?,
          fulfillment_status = CASE
            WHEN fulfillment_status = 'pending' THEN 'cancelled'
            ELSE fulfillment_status
          END,
          updated_at = ?
      WHERE id = ? AND provider_order_id IS NULL AND checkout_url IS NULL
        AND status IN ('creating', 'review')`)
      .bind(failureReason, now, orderId),
  ];

  for (const reservation of reservations) {
    if (reservation.inventoryMode === "finite") {
      statements.push(
        database.prepare(`UPDATE products
          SET stock_quantity = stock_quantity + ?,
              inventory_revision = inventory_revision + 1
          WHERE id = ? AND EXISTS (
            SELECT 1
            FROM payment_inventory_reservations AS reservation
            JOIN payment_orders AS payment_order ON payment_order.id = reservation.order_id
            WHERE reservation.order_id = ? AND reservation.product_id = ?
              AND reservation.status = 'reserved'
              AND payment_order.status = 'failed'
              AND payment_order.status_detail = 'provider_rejected'
              AND payment_order.provider_order_id IS NULL
              AND payment_order.checkout_url IS NULL
          )`)
          .bind(reservation.quantity, reservation.productId, orderId, reservation.productId),
      );
    }
  }

  statements.push(
    database.prepare(`UPDATE payment_inventory_reservations
      SET status = 'released', updated_at = ?
      WHERE order_id = ? AND status = 'reserved' AND EXISTS (
        SELECT 1 FROM payment_orders
        WHERE id = ? AND status = 'failed' AND status_detail = 'provider_rejected'
          AND provider_order_id IS NULL AND checkout_url IS NULL
      )`)
      .bind(now, orderId, orderId),
  );

  const results = await database.batch(statements);
  return (results[0]?.meta.changes ?? 0) > 0;
}

async function releaseReservations(
  orderId: string,
  reservations: Array<{
    productId: string;
    inventoryMode: "unlimited" | "finite";
    quantity: number;
  }>,
) {
  const database = getD1Binding();
  const now = Date.now();
  const statements: D1PreparedStatement[] = [];
  for (const reservation of reservations) {
    if (reservation.inventoryMode === "finite") {
      statements.push(
        database.prepare(`UPDATE products
          SET stock_quantity = stock_quantity + ?,
              inventory_revision = inventory_revision + 1
          WHERE id = ? AND EXISTS (
            SELECT 1 FROM payment_inventory_reservations
            WHERE order_id = ? AND product_id = ? AND status = 'reserved'
          )`)
          .bind(reservation.quantity, reservation.productId, orderId, reservation.productId),
      );
    }
  }
  statements.push(
    database.prepare(`UPDATE payment_inventory_reservations
      SET status = 'released', updated_at = ?
      WHERE order_id = ? AND status = 'reserved'`)
      .bind(now, orderId),
  );
  await database.batch(statements);
}

async function releaseReservedInventory(orderId: string) {
  const reservations = await getDb().select({
    productId: paymentInventoryReservations.productId,
    inventoryMode: paymentInventoryReservations.inventoryMode,
    quantity: paymentInventoryReservations.quantity,
  }).from(paymentInventoryReservations).where(and(
    eq(paymentInventoryReservations.orderId, orderId),
    eq(paymentInventoryReservations.status, "reserved"),
  ));
  if (reservations.length) await releaseReservations(orderId, reservations);
}

function safeProviderFailure(error: unknown) {
  if (error instanceof MercadoPagoHttpError) {
    return error.upstreamCode ?? `mercado_pago_http_${error.status}`;
  }
  if (error instanceof MercadoPagoResponseError) return error.reason;
  if (error instanceof z.ZodError) return "provider_response_schema";
  if (error instanceof CommerceError) return error.code;
  if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) {
    return "provider_timeout";
  }
  return "provider_unavailable";
}

const webhookSchema = z.object({
  id: z.union([z.string().trim().min(1).max(160), z.number().int()]),
  action: z.string().trim().min(1).max(100),
  api_version: z.string().trim().max(40).optional(),
  application_id: z.union([z.string().trim().min(1), z.number().int()]),
  live_mode: z.boolean(),
  type: z.literal("order"),
  user_id: z.union([z.string().trim().min(1), z.number().int()]),
  data: z.object({ id: z.string().trim().min(1).max(160) }),
}).passthrough();
