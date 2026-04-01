/**
 * Runs once per Node server process (Next.js instrumentation hook).
 * Loads Application Insights before other server code when the connection string is set.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.APPLICATIONINSIGHTS_CONNECTION_STRING?.trim()) return;
  try {
    await import("./lib/appInsightsServer");
  } catch (e) {
    console.error("[instrumentation] Application Insights failed to start:", e);
  }
}
