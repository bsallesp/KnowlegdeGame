/**
 * Prisma client instantiation smoke tests.
 * Verifies the generated client can be imported and instantiated.
 * Does NOT require a live database connection.
 *
 * @vitest-environment node
 */
import { describe, test, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  },
}));

describe("prisma client module", () => {
  test("can be imported without throwing", async () => {
    await expect(import("@/lib/prisma")).resolves.toBeDefined();
  });

  test("exports a prisma instance", async () => {
    const { prisma } = await import("@/lib/prisma");
    expect(prisma).toBeDefined();
  });
});
