export const SESSION_COOKIE_NAME = "dystoppia_uid";

function isLikelyIpv4Host(host: string) {
  // Examples: "13.68.151.233", "13.68.151.233:80"
  return /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(host.trim());
}

function shouldUseSecureCookies() {
  const override = process.env.COOKIE_SECURE;
  if (override === "1") return true;
  if (override === "0") return false;

  if (process.env.NODE_ENV !== "production") return false;

  const appHost = (process.env.APP_HOST ?? "").trim().toLowerCase();

  // Common "bind" style in Caddy: ":80" / "0.0.0.0:80" means HTTP only.
  if (appHost.startsWith(":") || appHost.endsWith(":80") || appHost.includes(":80,")) {
    return false;
  }

  // If the deployment is accessed directly via raw IP, it's often HTTP-only (no public cert).
  // Default to non-secure cookies unless explicitly overridden via COOKIE_SECURE=1.
  if (isLikelyIpv4Host(appHost) && !appHost.endsWith(":443")) {
    return false;
  }

  // Default secure in production.
  return true;
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: shouldUseSecureCookies(),
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  };
}
