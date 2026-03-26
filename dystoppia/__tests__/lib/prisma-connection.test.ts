/**
 * Prisma / SQLite connection smoke tests
 *
 * These tests verify that the native better-sqlite3 bindings are compiled
 * and loadable for the current Node.js version. They do NOT mock the adapter —
 * that is intentional. A build environment mismatch (e.g. bindings compiled
 * for a different Node.js ABI) would cause these to fail immediately, surfacing
 * the problem before it reaches production.
 *
 * @vitest-environment node
 */
import { describe, test, expect } from "vitest";

describe("better-sqlite3 native bindings", () => {
  test("better-sqlite3 module loads without throwing", () => {
    expect(() => require("better-sqlite3")).not.toThrow();
  });

  test("can create an in-memory SQLite database", () => {
    const Database = require("better-sqlite3");
    expect(() => new Database(":memory:")).not.toThrow();
  });

  test("can execute a basic query on in-memory DB", () => {
    const Database = require("better-sqlite3");
    const db = new Database(":memory:");
    const result = db.prepare("SELECT 1 AS value").get();
    expect(result.value).toBe(1);
    db.close();
  });
});

describe("@prisma/adapter-better-sqlite3", () => {
  test("adapter module loads without throwing", () => {
    expect(() => require("@prisma/adapter-better-sqlite3")).not.toThrow();
  });

  test("PrismaBetterSqlite3 adapter can be instantiated with an in-memory URL", () => {
    const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
    expect(() => new PrismaBetterSqlite3({ url: "file::memory:" })).not.toThrow();
  });
});

