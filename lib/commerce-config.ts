import { env } from "cloudflare:workers";

export type CommerceConfiguration = {
  accessToken: string;
  sellerUserId: string;
  applicationId: string;
  webhookSecret: string;
  orderTokenSecret: string;
  publicSiteUrl: string;
};

function normalizedPublicSiteUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function getCommerceConfiguration(): CommerceConfiguration | null {
  if (
    env.DEPLOYMENT_ENV !== "production" ||
    env.SITES_VALIDATION_AUTH === "1" ||
    !env.DB
  ) {
    return null;
  }

  const accessToken = env.MP_ACCESS_TOKEN?.trim() || "";
  const sellerUserId = env.MP_SELLER_USER_ID?.trim() || "";
  const applicationId = env.MP_APPLICATION_ID?.trim() || "";
  const webhookSecret = env.MP_WEBHOOK_SECRET?.trim() || "";
  const orderTokenSecret = env.PAYMENT_ORDER_TOKEN_SECRET?.trim() || "";
  const publicSiteUrl = normalizedPublicSiteUrl(env.PUBLIC_SITE_URL);

  if (
    !accessToken ||
    !/^\d{1,32}$/.test(sellerUserId) ||
    !/^\d{1,32}$/.test(applicationId) ||
    webhookSecret.length < 16 ||
    orderTokenSecret.length < 32 ||
    !publicSiteUrl
  ) {
    return null;
  }

  return {
    accessToken,
    sellerUserId,
    applicationId,
    webhookSecret,
    orderTokenSecret,
    publicSiteUrl,
  };
}

export function isProductionCommerceEnabled() {
  return env.PAYMENTS_ENABLED === "1" && getCommerceConfiguration() !== null;
}

export function requireCommerceConfiguration() {
  const configuration = getCommerceConfiguration();
  if (!configuration) {
    throw new CommerceUnavailableError("O serviço de pagamentos está temporariamente indisponível.");
  }
  return configuration;
}

export function requireNewOrderConfiguration() {
  const configuration = requireCommerceConfiguration();
  if (env.PAYMENTS_ENABLED !== "1") {
    throw new CommerceUnavailableError("As compras estão temporariamente desativadas.");
  }
  return configuration;
}

export class CommerceUnavailableError extends Error {
  readonly status = 503;

  constructor(message = "As compras ainda não foram ativadas.") {
    super(message);
    this.name = "CommerceUnavailableError";
  }
}
