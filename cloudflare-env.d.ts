declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    TEAM_DOMAIN?: string;
    POLICY_AUD?: string;
  }
}
