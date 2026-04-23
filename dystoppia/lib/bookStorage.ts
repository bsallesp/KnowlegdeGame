import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";

// Storage abstraction for uploaded book originals.
// Local-FS implementation today; the same interface can swap to Azure Blob (container `books`
// on the existing `dystoppiast` storage account) without touching callers.

export interface BookStorage {
  put(userId: string, sha256: string, bytes: Uint8Array): Promise<string>;
  get(uri: string): Promise<Uint8Array>;
  delete(uri: string): Promise<void>;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function createLocalFileStorage(rootDir?: string): BookStorage {
  const base = rootDir ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "tmp", "books");

  return {
    async put(userId, sha256, bytes) {
      assertSafeHash(sha256);
      const dir = path.join(base, userId);
      await fs.mkdir(dir, { recursive: true });
      const fullPath = path.join(dir, sha256);
      await fs.writeFile(fullPath, bytes);
      return `file://${fullPath.replace(/\\/g, "/")}`;
    },

    async get(uri) {
      const fullPath = uriToPath(uri);
      return new Uint8Array(await fs.readFile(fullPath));
    },

    async delete(uri) {
      const fullPath = uriToPath(uri);
      await fs.unlink(fullPath).catch(() => {});
    },
  };
}

function uriToPath(uri: string): string {
  if (!uri.startsWith("file://")) throw new Error("unsupported_storage_uri");
  return uri.slice("file://".length);
}

function assertSafeHash(sha256: string): void {
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("invalid_sha256");
}
