/**
 * Tiny SQLite-backed job queue.
 *
 * Why this exists: Qwen3-TTS local MLX server is single-instance. If two pipeline
 * runs are spawned concurrently they hang each other. This queue serializes jobs
 * so submissions never crash regardless of concurrency on the frontend.
 *
 * Schema:
 *   id           TEXT PRIMARY KEY (session id, e.g. "sess_1780265573254")
 *   status       TEXT  queued | running | done | failed
 *   email        TEXT  (optional) Resend will notify on completion
 *   form_json    TEXT  JSON of name/battlefield/struggle/family/location/champion
 *   input_path   TEXT  absolute path to uploaded mp3
 *   output_path  TEXT  absolute path to final mp3 (set when done)
 *   created_at   INTEGER unix epoch ms
 *   started_at   INTEGER
 *   completed_at INTEGER
 *   error        TEXT  (set when failed)
 */

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "jobs.db");

let dbInstance: Database.Database | null = null;

function db(): Database.Database {
  if (dbInstance) return dbInstance;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  dbInstance = new Database(DB_PATH);
  dbInstance.pragma("journal_mode = WAL");
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id           TEXT PRIMARY KEY,
      status       TEXT NOT NULL DEFAULT 'queued',
      email        TEXT,
      form_json    TEXT NOT NULL,
      input_path   TEXT NOT NULL,
      output_path  TEXT,
      created_at   INTEGER NOT NULL,
      started_at   INTEGER,
      completed_at INTEGER,
      error        TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
  `);
  return dbInstance;
}

export interface Job {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  email: string | null;
  form_json: string;
  input_path: string;
  output_path: string | null;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
  error: string | null;
}

export interface JobForm {
  name: string;
  battlefield: string;
  struggle: string;
  family: string;
  location: string;
  champion: string;
}

export function enqueueJob(args: {
  id: string;
  email: string | null;
  form: JobForm;
  inputPath: string;
}): void {
  db().prepare(`
    INSERT INTO jobs (id, status, email, form_json, input_path, created_at)
    VALUES (@id, 'queued', @email, @form_json, @input_path, @created_at)
  `).run({
    id: args.id,
    email: args.email,
    form_json: JSON.stringify(args.form),
    input_path: args.inputPath,
    created_at: Date.now(),
  });
}

export function getJob(id: string): Job | undefined {
  return db().prepare(`SELECT * FROM jobs WHERE id = ?`).get(id) as Job | undefined;
}

/**
 * Claim the next queued job (FIFO). Atomic: marks it 'running' so workers
 * never double-claim. Returns null if no queued jobs.
 */
export function claimNextJob(): Job | null {
  const tx = db().transaction(() => {
    const job = db().prepare(`
      SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1
    `).get() as Job | undefined;
    if (!job) return null;
    db().prepare(`
      UPDATE jobs SET status = 'running', started_at = ? WHERE id = ?
    `).run(Date.now(), job.id);
    return { ...job, status: "running" as const, started_at: Date.now() };
  });
  return tx();
}

export function markDone(id: string, outputPath: string): void {
  db().prepare(`
    UPDATE jobs SET status = 'done', output_path = ?, completed_at = ?
    WHERE id = ?
  `).run(outputPath, Date.now(), id);
}

export function markFailed(id: string, error: string): void {
  db().prepare(`
    UPDATE jobs SET status = 'failed', error = ?, completed_at = ?
    WHERE id = ?
  `).run(error.substring(0, 1000), Date.now(), id);
}

/** How many jobs are queued ahead of this one? Useful for "you are #3 in queue" UX. */
export function queuePositionAhead(id: string): number {
  const job = getJob(id);
  if (!job) return 0;
  if (job.status !== "queued") return 0;
  const row = db().prepare(`
    SELECT COUNT(*) AS n FROM jobs
    WHERE status IN ('queued','running') AND created_at < ?
  `).get(job.created_at) as { n: number };
  return row.n;
}
