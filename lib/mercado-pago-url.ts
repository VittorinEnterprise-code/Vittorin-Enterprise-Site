const MERCADO_PAGO_CHECKOUT_DOMAINS = [
  "mercadopago.com",
  "mercadopago.com.ar",
  "mercadopago.com.br",
  "mercadopago.cl",
  "mercadopago.com.co",
  "mercadopago.com.mx",
  "mercadopago.com.pe",
  "mercadopago.com.uy",
] as const;

export function trustedMercadoPagoCheckoutUrl(value: string | null | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const trustedHost = MERCADO_PAGO_CHECKOUT_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith("." + domain),
    );

    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !trustedHost
    ) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}
