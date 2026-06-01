import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

/**
 * Streams generated audio (and log) files from public/output at REQUEST time.
 *
 * Why this route exists: Next.js 16's production server enumerates the public/ directory
 * once at startup, so files written AFTER boot (every personalized MP3 the worker produces)
 * are served as 404 by the static handler. Reading the file from disk here, per request,
 * makes runtime-generated outputs downloadable without restarting the server. Supports HTTP
 * range requests so the in-browser <audio> player can seek.
 */

export const dynamic = "force-dynamic";

const OUTPUT_DIR = path.join(process.cwd(), "public", "output");

function contentType(name: string): string {
  if (name.endsWith(".mp3")) return "audio/mpeg";
  if (name.endsWith(".wav")) return "audio/wav";
  if (name.endsWith(".txt")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  // Path-traversal guard: only ever serve a bare filename out of OUTPUT_DIR.
  const safe = path.basename(file);
  const full = path.join(OUTPUT_DIR, safe);
  if (path.dirname(full) !== OUTPUT_DIR || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
    return new Response("Not found", { status: 404 });
  }

  const total = fs.statSync(full).size;
  const ct = contentType(safe);
  const range = req.headers.get("range");

  if (range) {
    const m = /bytes=(\d+)-(\d*)/.exec(range);
    const start = m ? parseInt(m[1], 10) : 0;
    const end = m && m[2] ? Math.min(parseInt(m[2], 10), total - 1) : total - 1;
    if (isNaN(start) || start > end || start >= total) {
      return new Response("Range Not Satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${total}` },
      });
    }
    const fd = fs.openSync(full, "r");
    const len = end - start + 1;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, start);
    fs.closeSync(fd);
    return new Response(buf, {
      status: 206,
      headers: {
        "Content-Type": ct,
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(len),
        "Cache-Control": "no-store",
      },
    });
  }

  const buf = fs.readFileSync(full);
  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": ct,
      "Content-Length": String(total),
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    },
  });
}
