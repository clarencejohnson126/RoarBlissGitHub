/**
 * Replicate API client (server-side only — uses the secret token).
 *
 * The whole Roar Bliss pipeline is one Replicate model (cog.yaml + predict.py). We call it via the
 * model-level predictions endpoint, which always runs the model's LATEST pushed version — so the web
 * shell never has to hardcode a version-ID. Push a new cog → the site uses it automatically.
 */
const API = "https://api.replicate.com/v1";
const MODEL = process.env.REPLICATE_MODEL || "clarencejohnson126/roar-bliss";

function token(): string {
  const t = process.env.REPLICATE_API_TOKEN;
  if (!t) throw new Error("REPLICATE_API_TOKEN is not set");
  return t;
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: `Bearer ${token()}`,
    "User-Agent": "roar-bliss/1.0 (+https://roar-bliss.vercel.app)",
    ...extra,
  };
}

// Private/user models can't use the /models/{owner}/{name}/predictions shortcut (that's for official
// models only — it 404s here). We resolve the latest version and use the version-based endpoint.
let cachedVersion: string | null = null;
async function latestVersionId(): Promise<string> {
  // Pin production to a known-good version: a new cog push (e.g. an optimization rebuild) creates a
  // new "latest" version, but production keeps serving REPLICATE_MODEL_VERSION until we bump it after
  // testing. Unset → follow the model's latest version automatically.
  const pinned = process.env.REPLICATE_MODEL_VERSION;
  if (pinned) return pinned;
  if (cachedVersion) return cachedVersion;
  const res = await fetch(`${API}/models/${MODEL}`, { headers: headers(), cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Replicate resolve version ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const d = (await res.json()) as { latest_version?: { id?: string } };
  const id = d.latest_version?.id;
  if (!id) throw new Error(`Model ${MODEL} has no pushed version yet.`);
  cachedVersion = id;
  return id;
}

export interface PredictionInput {
  audio: string; // a publicly fetchable URL (Vercel Blob upload, or the preloaded /public track)
  name: string;
  battlefield: string;
  struggle: string;
  family: string;
  location: string;
  champion: string;
  paid: boolean;
  // Per-prediction secrets (Replicate has no model-level env vars). Server-side only; the model
  // declares these as Cog Secret inputs, so Replicate masks them in logs.
  anthropic_api_key?: string;
  hf_token?: string;
  replicate_api_token?: string;
  blob_token?: string;
  elevenlabs_api_key?: string; // premium voice cloning — when set, the cog uses ElevenLabs over F5
  // Core feature 1 — how much of the audio becomes the user's. 25/50/75 keep the original speaker and
  // replace that share of the spoken timeline; 100 = a fully new script in the cloned voice (full_voice).
  personalization?: 25 | 50 | 75 | 100;
  mode?: "auto" | "personalize" | "full_voice"; // legacy override; 'auto' derives the path from personalization
  // Core feature 2 — target language for the generated lines (the cloned timbre is kept, source can be any language).
  language?: string;
}

export type PredictionStatus =
  | "starting"
  | "processing"
  | "succeeded"
  | "failed"
  | "canceled";

export interface Prediction {
  id: string;
  status: PredictionStatus;
  output: string | string[] | null;
  error: string | null;
  logs: string | null;
  input?: Record<string, unknown>;
}

/** Start a prediction on the model's latest version. Async when a webhook is given. */
export async function createPrediction(
  input: PredictionInput,
  webhook?: string,
): Promise<Prediction> {
  const version = await latestVersionId();
  const body: Record<string, unknown> = { version, input };
  if (webhook) {
    body.webhook = webhook;
    body.webhook_events_filter = ["completed"];
  }
  const res = await fetch(`${API}/predictions`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Replicate createPrediction ${res.status}: ${txt.slice(0, 400)}`);
  }
  return (await res.json()) as Prediction;
}

export async function getPrediction(id: string): Promise<Prediction> {
  const res = await fetch(`${API}/predictions/${id}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Replicate getPrediction ${res.status}: ${txt.slice(0, 200)}`);
  }
  return (await res.json()) as Prediction;
}

/** The model returns a single MP3; normalize whether it comes back as a string or a one-item array. */
export function outputUrl(p: { output: string | string[] | null }): string | null {
  if (!p.output) return null;
  return Array.isArray(p.output) ? p.output[p.output.length - 1] ?? null : p.output;
}
