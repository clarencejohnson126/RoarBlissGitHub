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
    "User-Agent": "roar-bliss/1.0 (+https://roarbliss.com)",
    ...extra,
  };
}

/**
 * Retry transient failures with exponential backoff + jitter. Retries ONLY on 429 / 5xx / network
 * errors — never on a 4xx (those are validation/auth and won't get better). Honors Retry-After.
 * On the final attempt it returns the (still-bad) Response so the caller can read the error body.
 */
async function fetchWithRetry(url: string, init: RequestInit, retries = 4): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, init);
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await backoff(attempt, res.headers.get("retry-after"));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e; // network/DNS/timeout
      if (attempt >= retries) throw e;
      await backoff(attempt, null);
    }
  }
}

function backoff(attempt: number, retryAfter: string | null): Promise<void> {
  const ra = retryAfter ? Number(retryAfter) * 1000 : 0;
  const base = ra > 0 ? Math.min(15_000, ra) : Math.min(8_000, 400 * 2 ** attempt);
  return new Promise((r) => setTimeout(r, base + Math.random() * 250));
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
  // Production must NEVER float on "latest": a cog push would change live behavior instantly,
  // with no test gate. Refuse loudly instead of silently serving an unapproved version.
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("REPLICATE_MODEL_VERSION is not pinned — refusing to follow 'latest' in production.");
  }
  if (cachedVersion) return cachedVersion;
  const res = await fetchWithRetry(`${API}/models/${MODEL}`, { headers: headers(), cache: "no-store" });
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
  // Voice engine. The web ALWAYS sends 'omnivoice' — the shipped in-cog engine. The cog's other
  // choices remain valid enum values but are not used in production (ElevenLabs is fully out).
  tts_provider?: "auto" | "elevenlabs" | "chatterbox" | "omnivoice" | "replicate";
  // Per-prediction secrets (Replicate has no model-level env vars). Server-side only; the model
  // declares these as Cog Secret inputs, so Replicate masks them in logs.
  anthropic_api_key?: string;
  hf_token?: string;
  replicate_api_token?: string;
  blob_token?: string;
  // Core feature 1 — how much of the audio becomes the user's. 25/50/75 keep the original speaker and
  // replace that share of the spoken timeline; 100 = a fully new script in the cloned voice (full_voice).
  personalization?: 25 | 50 | 75 | 100;
  mode?: "auto" | "personalize" | "full_voice"; // legacy override; 'auto' derives the path from personalization
  // Core feature 2 — target language for the generated lines (the cloned timbre is kept, source can be any language).
  language?: string;
  // Core feature 3 — EITHER a free-form prompt (the planner parses it) OR a one-click tone/template.
  prompt?: string; // free-form: "write exactly how you want it"; takes precedence over the structured fields
  tone?: string; // one-click mood/template tag, e.g. "fighter", "reflective", "grief", "confident"
  // Advanced voice/mix knobs (optional; the cog defaults are correct for the standard upload+clone flow).
  clone_source_voices?: boolean; // false = only use extra_voice_ids over the upload-as-bed (instrumental + chosen voice)
  extra_voice_ids?: string; // comma-separated permanent voice IDs (instrumental/translation EL path)
  el_model?: string; // ElevenLabs model: eleven_multilingual_v2 (validated) | eleven_v3
  // Instrumental / library-voice path: a public URL to the chosen library voice's clone reference clip.
  // When set, the cog clones THIS voice (OmniVoice) and lays it over the uploaded bed (RULE #1: bed
  // untouched). It is also the backend authority's fallback when the source has no clonable speaker.
  voice_reference_url?: string;
  music_gain_db?: number; // bed loudness relative to the voice (0 = at voice level)
  duck_db?: number; // sidechain duck depth under the voice
  voice_speed?: number; // <1 = slower/more deliberate
  output_seconds?: number; // cap output length (0 = full source length)
  min_voices?: number; // full_voice cloning: hint pyannote to find ≥N speakers
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
  const res = await fetchWithRetry(`${API}/predictions`, {
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

/** Cancel a running prediction (e.g. a run we can no longer bill). Best-effort; throws on hard errors. */
export async function cancelPrediction(id: string): Promise<void> {
  const res = await fetchWithRetry(`${API}/predictions/${id}/cancel`, {
    method: "POST",
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Replicate cancelPrediction ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

export async function getPrediction(id: string): Promise<Prediction> {
  const res = await fetchWithRetry(`${API}/predictions/${id}`, {
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
