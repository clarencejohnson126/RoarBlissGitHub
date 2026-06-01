#!/usr/bin/env node
/**
 * Job queue worker.
 *
 * Runs alongside `next dev`. Polls the SQLite job queue once per second,
 * picks the oldest queued job, spawns the Python pipeline, marks done/failed,
 * sends Resend email if user provided one.
 *
 * Start with:   npm run worker
 *
 * Single-instance via a lock file (worker.lock) — second instance refuses to start.
 */

import Database from "better-sqlite3";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Resend } from "resend";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WEB_ROOT = path.resolve(__dirname, "..");
const PROJECT_ROOT = path.resolve(WEB_ROOT, "..");
const DATA_DIR = path.join(WEB_ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "jobs.db");
const LOCK_PATH = path.join(DATA_DIR, "worker.lock");
const OUTPUT_DIR = path.join(WEB_ROOT, "public", "output");

const PYTHON_PATH = fs.existsSync(path.join(PROJECT_ROOT, "poc", "venv", "bin", "python"))
  ? path.join(PROJECT_ROOT, "poc", "venv", "bin", "python")
  : "python3";
const SCRIPT_PATH = path.join(PROJECT_ROOT, "poc", "orchestrator", "run_pipeline_for_web.py");

// ── Load env from .env.local (resend / anthropic / hf) ─────────────────
const envPath = path.join(WEB_ROOT, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2];
  }
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// ── Single-instance lock ───────────────────────────────────────────────
fs.mkdirSync(DATA_DIR, { recursive: true });
if (fs.existsSync(LOCK_PATH)) {
  const otherPid = parseInt(fs.readFileSync(LOCK_PATH, "utf8"), 10);
  try {
    process.kill(otherPid, 0);  // signal 0 = check alive
    console.error(`[worker] another worker is already running (PID ${otherPid}). Exiting.`);
    process.exit(1);
  } catch {
    // stale lock — overwrite
    console.warn(`[worker] stale lock for PID ${otherPid}; taking over.`);
  }
}
fs.writeFileSync(LOCK_PATH, String(process.pid));
process.on("exit", () => {
  try { if (fs.readFileSync(LOCK_PATH, "utf8") === String(process.pid)) fs.unlinkSync(LOCK_PATH); } catch {}
});
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

// ── DB ─────────────────────────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'queued',
    email TEXT, form_json TEXT NOT NULL, input_path TEXT NOT NULL,
    output_path TEXT, created_at INTEGER NOT NULL,
    started_at INTEGER, completed_at INTEGER, error TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
`);

console.log(`[worker] started (PID ${process.pid})`);
console.log(`[worker] db: ${DB_PATH}`);
console.log(`[worker] python: ${PYTHON_PATH}`);
console.log(`[worker] resend: ${resend ? "enabled" : "DISABLED (no RESEND_API_KEY)"}`);

// ── Main loop ──────────────────────────────────────────────────────────
async function runOne() {
  const claim = db.transaction(() => {
    const job = db.prepare(`SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`).get();
    if (!job) return null;
    db.prepare(`UPDATE jobs SET status = 'running', started_at = ? WHERE id = ?`).run(Date.now(), job.id);
    return job;
  });
  const job = claim();
  if (!job) return false;

  console.log(`[worker] ↻ running job ${job.id}`);
  const form = JSON.parse(job.form_json);

  const args = [
    SCRIPT_PATH,
    "--input", job.input_path,
    "--name", form.name || "Warrior",
    "--battlefield", form.battlefield || "",
    "--struggle", form.struggle || "",
    "--family", form.family || "",
    "--location", form.location || "",
    "--champion", form.champion || "Eric Thomas",
    "--output-dir", OUTPUT_DIR,
    "--session-id", job.id,
    "--window-ms", "180000",
  ];

  await new Promise((resolve) => {
    const proc = spawn(PYTHON_PATH, args, { env: process.env, stdio: "inherit" });
    proc.on("close", async (code) => {
      const outputMp3 = path.join(OUTPUT_DIR, `${job.id}_full.mp3`);
      if (code === 0 && fs.existsSync(outputMp3)) {
        db.prepare(`UPDATE jobs SET status='done', output_path=?, completed_at=? WHERE id=?`)
          .run(outputMp3, Date.now(), job.id);
        console.log(`[worker] ✓ done ${job.id}`);
        await sendDoneEmail(job, form);
      } else {
        const err = `Pipeline exited with code ${code}; output mp3 ${fs.existsSync(outputMp3) ? "exists" : "missing"}`;
        db.prepare(`UPDATE jobs SET status='failed', error=?, completed_at=? WHERE id=?`)
          .run(err, Date.now(), job.id);
        console.error(`[worker] ✗ failed ${job.id}: ${err}`);
        await sendFailedEmail(job, form, err);
      }
      resolve(null);
    });
  });
  return true;
}

async function sendDoneEmail(job, form) {
  if (!resend || !job.email) return;
  const downloadUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/output/${job.id}_full.mp3`;
  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "Roar Bliss <onboarding@resend.dev>",
      to: job.email,
      subject: `Your personalized Roar Bliss track is ready, ${form.name || "Warrior"}`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#0a0a0c;color:#e6e6e8;border-radius:12px">
          <h2 style="color:#ffd54a;margin:0 0 16px">🎧 Your battle hymn is ready.</h2>
          <p>Hey ${form.name || "Warrior"}, the AI just finished crafting your personalized motivational track.</p>
          <p style="margin:24px 0;text-align:center">
            <a href="${downloadUrl}" style="background:#ffd54a;color:#0a0a0c;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold">▶  Listen now</a>
          </p>
          <p style="font-size:13px;color:#888;margin-top:32px">Built fresh from your audio + your story. The voice clones the original speaker, the music stays untouched, and the personalized moments are surgically placed inside.</p>
          <p style="font-size:11px;color:#555;margin-top:24px">Roar Bliss • You received this because you started a session at <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}" style="color:#888">roarbliss</a>.</p>
        </div>`,
    });
    console.log(`[worker] 📧 sent done email to ${job.email}`);
  } catch (ex) {
    console.error(`[worker] resend error:`, ex);
  }
}

async function sendFailedEmail(job, form, error) {
  if (!resend || !job.email) return;
  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "Roar Bliss <onboarding@resend.dev>",
      to: job.email,
      subject: `Roar Bliss hit a snag with your track`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#0a0a0c;color:#e6e6e8;border-radius:12px">
          <h2 style="color:#ff6b6b;margin:0 0 16px">⚠️ Pipeline error</h2>
          <p>Hey ${form.name || "Warrior"} — the personalization for your audio didn't complete this time.</p>
          <p style="font-family:monospace;background:#1a1a1d;padding:12px;border-radius:6px;font-size:12px">${error.substring(0, 200)}</p>
          <p style="margin-top:24px">Hit reply and we'll look at it. Or try again with a different audio — usually it works on the second pass.</p>
        </div>`,
    });
    console.log(`[worker] 📧 sent failure email to ${job.email}`);
  } catch (ex) {
    console.error(`[worker] resend error:`, ex);
  }
}

// Poll loop — process one job at a time, sleep 1s between
async function loop() {
  while (true) {
    const ran = await runOne();
    if (!ran) await new Promise((r) => setTimeout(r, 1000));
  }
}

loop().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
