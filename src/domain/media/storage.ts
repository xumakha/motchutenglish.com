import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { env } from "@/env";
import { AppError } from "@/server/errors";

// Port of LocalAssetStorage (application/libraries/AssetStorage.php): private files under
// writable/media, named by a random key, never served directly. Kept as a small interface so an
// object-storage driver can replace it later.

export interface AssetStorage {
  path(key: string): string;
  put(key: string, data: Uint8Array): Promise<void>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  size(key: string): Promise<number>;
  stream(key: string, range?: { start: number; end: number }): NodeJS.ReadableStream;
}

const KEY = /^[a-f0-9]{40}\.(jpg|jpeg|png|webp|mp3|ogg|wav)$/;

class LocalAssetStorage implements AssetStorage {
  private readonly root = resolve(process.cwd(), env().WRITABLE_DIR, "media");

  path(key: string): string {
    if (!KEY.test(key)) throw new AppError(422, "Mã media không hợp lệ.");
    return join(this.root, key);
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    const path = this.path(key);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    // "wx": never overwrite an existing file.
    await writeFile(path, data, { mode: 0o600, flag: "wx" });
  }

  async exists(key: string): Promise<boolean> {
    try {
      return (await stat(this.path(key))).isFile();
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }

  async size(key: string): Promise<number> {
    return (await stat(this.path(key))).size;
  }

  stream(key: string, range?: { start: number; end: number }) {
    return createReadStream(this.path(key), range);
  }
}

export function storage(): AssetStorage {
  // MEDIA_DRIVER only supports "local" today, as in the PHP app.
  return new LocalAssetStorage();
}
