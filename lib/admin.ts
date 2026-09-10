import {
  getCloudflareAccessUser,
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
  if (user.email.trim().toLowerCase() !== ADMIN_EMAIL) {
    return { user, reason: "forbidden" as const };
  }
  return { user, reason: null };
}
