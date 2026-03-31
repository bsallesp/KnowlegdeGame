/**
 * Optional integration test: real Postgres (read-only probe).
 * Skipped unless INTEGRATION_DATABASE_URL is set (dev/staging URL recommended).
 *
 * @vitest-environment node
 */
import { describe, test, expect } from "vitest";
import pg from "pg";

const url = process.env.INTEGRATION_DATABASE_URL;

describe.skipIf(!url)("integration: database TCP + SELECT 1", () => {
  test("connects and queries", async () => {
    const client = new pg.Client({ connectionString: url! });
    await client.connect();
    const r = await client.query<{ one: number }>("SELECT 1::int AS one");
    expect(r.rows[0]?.one).toBe(1);
    await client.end();
  });
});
