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
export function isQualityFailed(jobScorecard: unknown, liveLogs: string | null | undefined): boolean {
  const stored = jobScorecard as Scorecard | null | undefined;
  // An explicit stored verdict wins. If it's absent (not yet written), read the live logs.
  if (stored && typeof stored.passed === "boolean") return stored.passed === false;
  return parseScorecard(liveLogs)?.passed === false;
}
