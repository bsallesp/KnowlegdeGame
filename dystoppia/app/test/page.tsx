import { headers } from "next/headers";

type DatabaseState = "up" | "down" | "unknown";

interface HealthPayload {
  ok?: boolean;
  db?: DatabaseState;
}

interface ProbeResult {
  backendAccessible: boolean;
  databaseState: DatabaseState;
  endpoint: string;
  httpStatus: number | null;
  detail: string;
}

async function probeHealthEndpoint(): Promise<ProbeResult> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host?.includes("localhost") || host?.startsWith("127.0.0.1") ? "http" : "https");

  const endpoint = host ? `${protocol}://${host}/api/health` : "/api/health";

  if (!host) {
    return {
      backendAccessible: false,
      databaseState: "unknown",
      endpoint,
      httpStatus: null,
      detail: "The page could not infer the current host, so the backend health endpoint was not checked.",
    };
  }

  try {
    const response = await fetch(endpoint, { cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as HealthPayload;
    const databaseState = body.db ?? "unknown";

    return {
      backendAccessible: true,
      databaseState,
      endpoint,
      httpStatus: response.status,
      detail:
        databaseState === "up"
          ? "The backend replied and reported the database as available."
          : databaseState === "down"
            ? "The backend replied, but the database health probe failed."
            : `The backend replied with HTTP ${response.status}, but the database state could not be confirmed.`,
    };
  } catch (error) {
    return {
      backendAccessible: false,
      databaseState: "unknown",
      endpoint,
      httpStatus: null,
      detail:
        error instanceof Error
          ? `The page could not reach the backend health endpoint: ${error.message}`
          : "The page could not reach the backend health endpoint.",
    };
  }
}

function getStatusTone(active: boolean) {
  return active
    ? {
        border: "rgba(96, 165, 250, 0.35)",
        background: "rgba(56, 189, 248, 0.12)",
        text: "#60A5FA",
      }
    : {
        border: "rgba(249, 115, 22, 0.35)",
        background: "rgba(249, 115, 22, 0.12)",
        text: "#F97316",
      };
}

function StatusCard({
  label,
  value,
  active,
}: {
  label: string;
  value: string;
  active: boolean;
}) {
  const tone = getStatusTone(active);

  return (
    <div
      className="rounded-2xl border p-5"
      style={{
        borderColor: tone.border,
        background: tone.background,
      }}
    >
      <p className="text-xs uppercase tracking-[0.25em]" style={{ color: "#9494B8" }}>
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold" style={{ color: tone.text }}>
        {value}
      </p>
    </div>
  );
}

export default async function TestPage() {
  const probe = await probeHealthEndpoint();
  const databaseAccessible = probe.databaseState === "up";
  const databaseLabel =
    probe.databaseState === "up"
      ? "Database accessible"
      : probe.databaseState === "down"
        ? "Database unavailable"
        : "Database not confirmed";

  return (
    <main
      className="min-h-screen px-6 py-16"
      style={{
        background:
          "radial-gradient(circle at top, rgba(129, 140, 248, 0.16), transparent 42%), #09090E",
      }}
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <section
          className="rounded-[32px] border p-8 shadow-2xl"
          style={{
            borderColor: "rgba(46, 46, 64, 0.9)",
            backgroundColor: "rgba(18, 18, 26, 0.92)",
            boxShadow: "0 24px 80px rgba(0, 0, 0, 0.35)",
          }}
        >
          <p className="text-xs uppercase tracking-[0.35em]" style={{ color: "#818CF8" }}>
            Connectivity check
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight" style={{ color: "#EEEEFF" }}>
            /test
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6" style={{ color: "#9494B8" }}>
            This page performs a live request to <code>/api/health</code> to confirm whether the
            backend is reachable and whether the database is responding through the public health
            probe.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <StatusCard
              label="Backend"
              value={probe.backendAccessible ? "Backend accessible" : "Backend unavailable"}
              active={probe.backendAccessible}
            />
            <StatusCard
              label="Database"
              value={databaseLabel}
              active={databaseAccessible}
            />
          </div>

          <div
            className="mt-8 rounded-2xl border p-5 text-sm leading-6"
            style={{
              borderColor: "rgba(46, 46, 64, 0.95)",
              backgroundColor: "rgba(9, 9, 14, 0.72)",
              color: "#9494B8",
            }}
          >
            <p>{probe.detail}</p>
            <p className="mt-3">
              Checked endpoint: <code>{probe.endpoint}</code>
            </p>
            <p className="mt-2">
              Health endpoint HTTP status: <strong>{probe.httpStatus ?? "no response"}</strong>
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href="/api/health"
                className="rounded-xl px-4 py-2 text-sm font-medium no-underline transition-opacity hover:opacity-90"
                style={{ backgroundColor: "#818CF8", color: "#09090E" }}
              >
                Open raw health JSON
              </a>
              <a
                href="/"
                className="rounded-xl border px-4 py-2 text-sm font-medium no-underline transition-opacity hover:opacity-90"
                style={{ borderColor: "#2E2E40", color: "#EEEEFF" }}
              >
                Back home
              </a>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

