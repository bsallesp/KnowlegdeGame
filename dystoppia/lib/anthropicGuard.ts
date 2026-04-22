import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export function hasAnthropicApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export function requireAnthropicKey(endpoint: string): NextResponse | null {
  if (hasAnthropicApiKey()) return null;
  logger.error(endpoint, "ANTHROPIC_API_KEY is not configured");
  return NextResponse.json(
    {
      error: "anthropic_not_configured",
      message:
        process.env.NODE_ENV === "production"
          ? "This feature is temporarily unavailable."
          : "ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server.",
    },
    { status: 503 },
  );
}
