/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { createLocalFileStorage, sha256Hex } from "@/lib/bookStorage";

const encode = (s: string) => new TextEncoder().encode(s);

describe("bookStorage (local filesystem)", () => {
  let root: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "book-store-"));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("stores and retrieves bytes by (userId, sha256)", async () => {
    const storage = createLocalFileStorage(root);
    const bytes = encode("hello world");
    const hash = sha256Hex(bytes);
    const uri = await storage.put("user-1", hash, bytes);
    const back = await storage.get(uri);
    expect(new TextDecoder().decode(back)).toBe("hello world");
  });

  it("rejects malformed hashes to avoid path traversal", async () => {
    const storage = createLocalFileStorage(root);
    await expect(storage.put("u", "../evil", encode("x"))).rejects.toThrow("invalid_sha256");
  });

  it("delete removes the underlying file", async () => {
    const storage = createLocalFileStorage(root);
    const bytes = encode("data");
    const uri = await storage.put("user-2", sha256Hex(bytes), bytes);
    await storage.delete(uri);
    await expect(storage.get(uri)).rejects.toThrow();
  });

  it("sha256Hex is deterministic", () => {
    const a = sha256Hex(encode("same"));
    const b = sha256Hex(encode("same"));
    const c = sha256Hex(encode("different"));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});
