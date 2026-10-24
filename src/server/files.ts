import "server-only";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

// Helpers for routes that stream files or generated chunks.

export const toWebStream = (node: NodeJS.ReadableStream) =>
  Readable.toWeb(node as Readable) as unknown as ReadableStream<Uint8Array>;

export function chunksToStream(chunks: AsyncIterable<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iterator = chunks[Symbol.asyncIterator]();
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(value));
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}

export async function fileResponse(path: string, headers: Record<string, string>) {
  const { size } = await stat(path);
  return new Response(toWebStream(createReadStream(path)), {
    headers: { ...headers, "Content-Length": String(size) },
  });
}

/** One "bytes=start-end" range within size, or null (multi-range is not supported). */
export function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | "invalid" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return "invalid";
  let start: number;
  let end: number;
  if (m[1] === "") {
    const suffix = Number(m[2]);
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start > end || start >= size) return "invalid";
  return { start, end };
}
