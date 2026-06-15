/**
 * Server-authoritative audio duration (seconds) for a remote audio URL — used for BILLING.
 *
 * The client must NEVER be trusted to report its own upload length: a crafted POST could send
 * durationSec:1 and run a full 6-minute track for ~0.02 charged minutes (the #12 minute-bypass). We
 * measure the real file here instead. Returns null on ANY failure so the caller falls back to the safe
 * MAXIMUM (the 6-min cap) — billing can under-report only if it trusts the client, never if it trusts
 * this probe.
 *
 * music-metadata is pure-JS (no ffmpeg binary needed) and reads only the header for most formats, so a
 * normal ≤6-min upload is measured in ~1-2s. A hard timeout caps the worst case; an over-long/odd file
 * that can't be parsed in time falls back to the cap (which is also what the cog trims it to anyway).
 */
export async function probeAudioDurationSec(url: string, timeoutMs = 9000): Promise<number | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok || !res.body) return null;
    const size = Number(res.headers.get("content-length")) || undefined;
    const mimeType = res.headers.get("content-type") || undefined;
    // ESM-only package → dynamic import keeps this compatible regardless of the route's bundle format.
    const mm = await import("music-metadata");
    const meta = await mm.parseWebStream(res.body, { mimeType, size }, { duration: true });
    const dur = meta.format.duration;
    return typeof dur === "number" && Number.isFinite(dur) && dur > 0 ? dur : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    try {
      ctrl.abort();
    } catch {
      /* already settled */
    }
  }
}
