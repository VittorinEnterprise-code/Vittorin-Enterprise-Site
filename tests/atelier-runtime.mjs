export const env = globalThis.__ATELIER_TEST_RUNTIME__;
export const waitUntil = (promise) => promise.catch(() => {});
