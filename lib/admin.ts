import {
  getCloudflareAccessUser,
  isSitesAuthenticatedRequest,
  type CloudflareAccessUser,
} from "@/lib/cloudflare-access";

export const ADMIN_EMAIL = "vittorinoenterprise@gmail.com";

export type AdminAccessResult =
  | { user: CloudflareAccessUser; reason: null }
  | {
      user: CloudflareAccessUser | null;
      reason: "unauthenticated" | "forbidden" | "misconfigured";
    };

export async function getAuthorizedAdmin(): Promise<AdminAccessResult> {
  const identity = await getCloudflareAccessUser();
  if (identity.reason) return identity;

  const { user } = identity;
  // In the private Sites environment, the Site access policy is the admin
  // boundary. Production continues to require the Cloudflare Access e-mail.
  if (await isSitesAuthenticatedRequest()) {
    return { user, reason: null };
  }

  if (user.email.trim().toLowerCase() !== ADMIN_EMAIL) {
    return { user, reason: "forbidden" as const };
  }
  return { user, reason: null };
}
