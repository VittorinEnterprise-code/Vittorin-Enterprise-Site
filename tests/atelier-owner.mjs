export async function getAuthorizedAdmin() {
  return globalThis.__ATELIER_TEST_RUNTIME__.owner ? { user: { email: "owner@example.test" }, reason: null } : { user: null, reason: "unauthenticated" };
}
