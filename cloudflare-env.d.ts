declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    TEAM_DOMAIN?: string;
    POLICY_AUD?: string;
    DEPLOYMENT_ENV?: "production" | "staging";
    SITES_VALIDATION_AUTH?: string;
    PAYMENT_TEST_ENABLED?: string;
    MP_TEST_ACCESS_TOKEN?: string;
    MP_TEST_SELLER_USER_ID?: string;
    PAYMENTS_ENABLED?: "0" | "1";
    PUBLIC_SITE_URL?: string;
    MP_ACCESS_TOKEN?: string;
    MP_SELLER_USER_ID?: string;
    MP_APPLICATION_ID?: string;
    MP_WEBHOOK_SECRET?: string;
    PAYMENT_ORDER_TOKEN_SECRET?: string;
  }
}
