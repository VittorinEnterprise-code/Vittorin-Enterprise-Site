import { env } from "cloudflare:workers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { headers } from "next/headers";

export type CloudflareAccessUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

export type CloudflareAccessResult =
  | { user: CloudflareAccessUser; reason: null }
  | { user: null; reason: "unauthenticated" | "misconfigured" };

export const CLOUDFLARE_ACCESS_LOGOUT_PATH = "/cdn-cgi/access/logout";

const ACCESS_ASSERTION_HEADER = "cf-access-jwt-assertion";
const SITE_USER_ID_HEADER = "oai-authenticated-user-id";
const SITE_USER_EMAIL_HEADER = "oai-authenticated-user-email";
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function getCloudflareAccessUser(): Promise<CloudflareAccessResult> {
  const requestHeaders = await headers();
  const siteUser = isSitesValidationEnvironment()
    ? getSiteAuthenticatedUser(requestHeaders)
    : null;
  if (siteUser) return { user: siteUser, reason: null };

  const teamDomain = normalizeTeamDomain(env.TEAM_DOMAIN);
  const policyAudience = env.POLICY_AUD?.trim();

  if (!teamDomain || !policyAudience) {
    console.error("cloudflare_access_configuration_missing");
    return { user: null, reason: "misconfigured" };
  }

  const token = requestHeaders.get(ACCESS_ASSERTION_HEADER);
  if (!token) return { user: null, reason: "unauthenticated" };

  try {
    let keySet = keySets.get(teamDomain);
    if (!keySet) {
      keySet = createRemoteJWKSet(
        new URL(`${teamDomain}/cdn-cgi/access/certs`),
      );
      keySets.set(teamDomain, keySet);
    }

    const { payload } = await jwtVerify(token, keySet, {
      issuer: teamDomain,
      audience: policyAudience,
    });
    const email = typeof payload.email === "string" ? payload.email.trim() : "";
    const userId = typeof payload.sub === "string" ? payload.sub : "";
    if (!email || !userId) return { user: null, reason: "unauthenticated" };

    const fullName = typeof payload.name === "string" ? payload.name.trim() : null;
    return {
      user: {
        userId,
        email,
        fullName: fullName || null,
        displayName: fullName || email,
      },
      reason: null,
    };
  } catch (error) {
    console.warn(
      "cloudflare_access_token_invalid",
      error instanceof Error ? error.name : "unknown_error",
    );
    return { user: null, reason: "unauthenticated" };
  }
}

export async function isSitesAuthenticatedRequest() {
  return isSitesValidationEnvironment() && Boolean(
    getSiteAuthenticatedUser(await headers()),
  );
}

function isSitesValidationEnvironment() {
  return env.SITES_VALIDATION_AUTH === "1";
}

function getSiteAuthenticatedUser(
  requestHeaders: Headers,
): CloudflareAccessUser | null {
  const userId = requestHeaders.get(SITE_USER_ID_HEADER)?.trim();
  const email = requestHeaders.get(SITE_USER_EMAIL_HEADER)?.trim();
  if (!userId || !email) return null;

  return {
    userId,
    email,
    fullName: null,
    displayName: email,
  };
}

function normalizeTeamDomain(value: string | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;

  try {
    const url = new URL(
      candidate.includes("://") ? candidate : `https://${candidate}`,
    );
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !url.hostname.endsWith(".cloudflareaccess.com")
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}
