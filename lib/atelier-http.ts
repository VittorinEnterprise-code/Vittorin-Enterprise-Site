import { getAuthorizedAdmin } from "./admin";

export async function requireAtelierOwner() {
  const access = await getAuthorizedAdmin();
  return access.reason ? Response.json({ error: "Entre com a conta proprietária para continuar." }, { status: access.reason === "unauthenticated" ? 401 : access.reason === "misconfigured" ? 503 : 403, headers: { "cache-control": "no-store" } }) : null;
}
export function atelierMutationAllowed(request: Request) {
  const site = request.headers.get("sec-fetch-site"), origin = request.headers.get("origin");
  return (!site || site === "same-origin" || site === "none") && Boolean(origin && origin === new URL(request.url).origin);
}
export function atelierJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store, private", "referrer-policy": "no-referrer", "x-robots-tag": "noindex, nofollow, noarchive" } });
}
