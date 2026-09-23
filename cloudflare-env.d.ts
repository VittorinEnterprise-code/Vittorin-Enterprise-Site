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
  }
}
