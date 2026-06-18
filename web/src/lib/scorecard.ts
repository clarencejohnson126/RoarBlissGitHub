/**
 * Shared delivery-gate scorecard parsing — used by BOTH the webhook (which bills/emails) AND the
 * user-facing serve paths (/api/process/status, /api/audio). Keeping one implementation means the
 * "is this take good enough to show the user?" verdict can never drift between the gate and the player.
 *
 * The cog scores the FINISHED file against its own source and prints one JSON line: `[[SCORECARD]] {…}`.
 */
export type Scorecard = { passed: boolean | null; failures: string[]; measured?: unknown };

/**
 * Parse the LAST [[SCORECARD]] line out of a cog log blob. A retried run logs more than once → last wins.
 * The whole scorecard is the JSON object on one line, so a greedy match to end-of-line is correct.
 * Returns null when there is no parseable scorecard (older cog, truncated logs) → callers fail OPEN.
 */
export function parseScorecard(logs: string | null | undefined): Scorecard | null {
  if (!logs) return null;
  const matches = [...logs.matchAll(/\[\[SCORECARD\]\]\s*(\{.*\})\s*$/gm)];
  const last = matches[matches.length - 1];
  if (!last) return null;
  try {
    const d = JSON.parse(last[1]);
    return {
      passed: typeof d.passed === "boolean" ? d.passed : null,
      failures: Array.isArray(d.failures) ? d.failures : [],
      measured: d.measured,
    };
  } catch {
    return null;
  }
}

/**
 * The user-facing delivery verdict for a FINISHED (Replicate-`succeeded`) prediction.
 *
 * FAIL-OPEN by contract: returns true (quality failed → do NOT serve) ONLY on an explicit
 * `passed === false`. The verdict is read first from the persisted job scorecard (authoritative, written
 * by the webhook), and falls back to the cog's [[SCORECARD]] line in the LIVE logs — this closes the
 * webhook-vs-poll race, where a fast status poll can see Replicate `succeeded` before the webhook has
 * persisted the verdict. A missing/garbled scorecard on BOTH sources never blocks a good run.
 */
// BLOCK CORSET (founder, 2026-06-18): we accept ANY input mp3 — a poor result from a poor SOURCE is a FAQ
// topic, not our block. The ONLY failures that block delivery are real OUTPUT catastrophes. Everything else
// (clipping/0-dBFS peak, loudness, dropouts, hiss, true-peak, language accent) is ADVISORY — it ships.
// Keep this in sync with predict.py's deliver-gate DEAL_BREAKERS. ONE source of truth for all serve paths.
export const DEAL_BREAKERS = new Set<string>([
  "content_present", "no_dead_air",        // empty / total-silence audio
  "intelligibility", "no_swallowed_line",  // gibberish speech
  "music_stability", "music_continuity",   // the loudness rollercoaster
  "no_repetition", "full_replacement",     // degenerate / untranslated text
]);

export function isQualityFailed(jobScorecard: unknown, liveLogs: string | null | undefined): boolean {
  const stored = jobScorecard as Scorecard | null | undefined;
  // Prefer the stored verdict's failures (authoritative, written by the webhook); fall back to the live
  // log's scorecard (closes the webhook-vs-poll race). No scorecard on either side → fail OPEN (never block).
  const sc = stored && Array.isArray(stored.failures) ? stored : parseScorecard(liveLogs);
  if (!sc || !Array.isArray(sc.failures)) return false;
  return sc.failures.some((f) => DEAL_BREAKERS.has(f));
}
