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
  const body: Record<string, unknown> = { input };
  if (webhook) {
    body.webhook = webhook;
    body.webhook_events_filter = ["completed"];
  }
  const res = await fetch(`${API}/models/${MODEL}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
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
    headers: { Authorization: `Bearer ${token()}` },
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
