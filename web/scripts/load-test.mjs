#!/usr/bin/env node
/**
 * Roar Bliss — load test. Measures how the stack handles concurrency.
 *
 * Modes:
 *   web       (DEFAULT, FREE, SAFE)  GET a read endpoint (default "/") → tests the Vercel/Next +
 *                                    Supabase tier under concurrency. No generation, no cost.
 *   accept    (cheap, ~no GPU)       POST /api/process with unique deviceIds → tests the ACCEPTANCE
 *                                    layer + the free-tier gate behaviour under load. NOTE: the
 *                                    free gate is per-device/IP, so from one IP most requests after
 *                                    the first return 402 — that's expected; this measures the gate
 *                                    + route, not full generation.
 *   generate  (⚠️ COSTS MONEY)       POST real runs (each ≈ $0.10–0.30 GPU + ElevenLabs/Claude).
 *                                    Requires --confirm. Use only on a STAGING env with the free
 *                                    gate disabled (or it will 402 after the first run per IP).
 *
 * Usage:
 *   node web/scripts/load-test.mjs --url http://localhost:3007 --n 200 --concurrency 50
 *   node web/scripts/load-test.mjs --mode web --path /api/me --n 300 --concurrency 100
 *   node web/scripts/load-test.mjs --mode accept --n 50 --concurrency 25
 *   node web/scripts/load-test.mjs --mode generate --n 5 --concurrency 5 --poll --confirm
 *
 * Flags: --url (or env BASE_URL), --n total, --concurrency, --mode, --path, --poll, --confirm,
 *        --timeout <s> (per request, default 30 for web/accept), --poll-timeout <s> (default 600).
 */

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = args[i + 1];
  return v && !v.startsWith("--") ? v : true;
};

const BASE = String(flag("url", process.env.BASE_URL || "http://localhost:3007")).replace(/\/$/, "");
const N = parseInt(flag("n", "100"), 10);
const CONC = parseInt(flag("concurrency", "50"), 10);
const MODE = String(flag("mode", "web"));
const PATH = String(flag("path", "/"));
const POLL = flag("poll", false) === true;
const CONFIRM = flag("confirm", false) === true;
const REQ_TIMEOUT = parseInt(flag("timeout", "30"), 10) * 1000;
const POLL_TIMEOUT = parseInt(flag("poll-timeout", "600"), 10) * 1000;
const RUN = Math.random().toString(36).slice(2, 8);

if (MODE === "generate" && !CONFIRM) {
  console.error(
    `\n⚠️  mode=generate triggers ${N} REAL runs (≈ $${(N * 0.2).toFixed(2)} GPU + ElevenLabs/Claude).\n` +
      `    Re-run with --confirm if you really mean it (ideally on staging with the free gate off).\n`,
  );
  process.exit(1);
}

function body(i) {
  return JSON.stringify({
    name: "LoadTest",
    battlefield: "Discipline",
    struggle: "load testing the pipeline",
    language: "English",
    personalization: 75,
    prompt: "",
    tone: "",
    deviceId: `loadtest-${RUN}-${i}`, // unique per request (free gate is per-device OR IP)
  });
}

function classify(status) {
  if (status === 0) return "neterr";
  if (status >= 200 && status < 300) return "2xx";
  if (status === 401) return "401-auth";
  if (status === 402) return "402-gate/credits";
  if (status === 429) return "429-ratelimit";
  if (status >= 500) return "5xx";
  return `${Math.floor(status / 100)}xx`;
}

async function pollStatus(id) {
  const t0 = Date.now();
  while (Date.now() - t0 < POLL_TIMEOUT) {
    try {
      const r = await fetch(`${BASE}/api/process/status?id=${encodeURIComponent(id)}`);
      const j = await r.json().catch(() => ({}));
      if (j.status === "done") return { status: "done", ms: Date.now() - t0 };
      if (j.status === "failed") return { status: "failed", ms: Date.now() - t0 };
    } catch {
      /* keep polling */
    }
    await new Promise((res) => setTimeout(res, 5000));
  }
  return { status: "timeout", ms: Date.now() - t0 };
}

async function runOne(i) {
  const start = Date.now();
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), REQ_TIMEOUT);
  try {
    let res;
    if (MODE === "web") {
      res = await fetch(`${BASE}${PATH}`, { signal: ctrl.signal });
    } else {
      res = await fetch(`${BASE}/api/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body(i),
        signal: ctrl.signal,
      });
    }
    clearTimeout(to);
    const ms = Date.now() - start;
    const out = { status: res.status, ms, klass: classify(res.status) };
    if (MODE === "generate" && POLL && res.ok) {
      const j = await res.json().catch(() => ({}));
      if (j.id) out.e2e = await pollStatus(j.id);
    }
    return out;
  } catch (e) {
    clearTimeout(to);
    return { status: 0, ms: Date.now() - start, klass: e.name === "AbortError" ? "timeout" : "neterr" };
  }
}

async function pool(total, concurrency, fn) {
  const results = new Array(total);
  let next = 0;
  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= total) return;
      results[i] = await fn(i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
  return results;
}

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

(async () => {
  console.log(
    `\n▶ Load test: mode=${MODE} ${MODE === "web" ? `path=${PATH} ` : ""}n=${N} concurrency=${CONC} → ${BASE}\n`,
  );
  const t0 = Date.now();
  const results = await pool(N, CONC, runOne);
  const wall = (Date.now() - t0) / 1000;

  const byClass = {};
  for (const r of results) byClass[r.klass] = (byClass[r.klass] || 0) + 1;
  const lat = results.map((r) => r.ms).sort((a, b) => a - b);
  const ok = results.filter((r) => r.klass === "2xx").length;

  console.log(`── Results ──────────────────────────────────`);
  console.log(`wall time      : ${wall.toFixed(1)}s`);
  console.log(`throughput     : ${(N / wall).toFixed(1)} req/s`);
  console.log(`success (2xx)  : ${ok}/${N} (${((ok / N) * 100).toFixed(1)}%)`);
  console.log(`status breakdown:`);
  for (const [k, v] of Object.entries(byClass).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${k.padEnd(18)} ${v}`);
  }
  console.log(`latency (ms)   : min ${lat[0]} · p50 ${pct(lat, 50)} · p90 ${pct(lat, 90)} · p95 ${pct(lat, 95)} · p99 ${pct(lat, 99)} · max ${lat[lat.length - 1]}`);

  if (MODE === "generate" && POLL) {
    const e2e = results.filter((r) => r.e2e).map((r) => r.e2e);
    const done = e2e.filter((e) => e.status === "done");
    const e2eMs = done.map((e) => e.ms).sort((a, b) => a - b);
    console.log(`\n── End-to-end (generation) ──`);
    console.log(`completed      : ${done.length}/${e2e.length}`);
    console.log(`failed/timeout : ${e2e.filter((e) => e.status !== "done").length}`);
    if (e2eMs.length)
      console.log(`e2e time (s)   : p50 ${(pct(e2eMs, 50) / 1000).toFixed(0)} · p95 ${(pct(e2eMs, 95) / 1000).toFixed(0)} · max ${(e2eMs[e2eMs.length - 1] / 1000).toFixed(0)}`);
  }

  console.log(`\nReminder: external caps (ElevenLabs concurrency, Anthropic RPM/TPM, Replicate max instances)`);
  console.log(`are the real ceilings — watch for 429s/5xx climbing as concurrency rises.\n`);
})();
