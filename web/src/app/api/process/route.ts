import { NextResponse } from "next/server";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { enqueueJob } from "@/lib/queue";

const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB
// Tiered duration cap: free up to 60s, paid up to 6 min. The `paid` flag is set by the
// (future) auth/billing layer; until then it defaults to false → free tier.
const FREE_MAX_DURATION_S = 60;
const PAID_MAX_DURATION_S = 6 * 60;

function probeDurationSeconds(filePath: string): number | null {
  // Use ffprobe (already installed) to get audio duration without loading the file
  const result = spawnSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "csv=p=0",
    filePath,
  ], { encoding: "utf8" });
  if (result.status !== 0) return null;
  const dur = parseFloat(result.stdout.trim());
  return isFinite(dur) ? dur : null;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const name = formData.get("name") as string || "Warrior";
    const battlefield = formData.get("battlefield") as string || "General self-mastery";
    const struggle = formData.get("struggle") as string || "No details";
    const family = formData.get("family") as string || "Legacy";
    const location = formData.get("location") as string || "Mannheim, Germany";
    const champion = formData.get("champion") as string || "Eric Thomas";
    const email = formData.get("email") as string || "";  // optional, for Resend notification
    const paid = formData.get("paid") === "true";  // set by billing layer; false = free tier
    const maxDurationS = paid ? PAID_MAX_DURATION_S : FREE_MAX_DURATION_S;
    const file = formData.get("file") as File | null;

    // ── Upload caps (file size first — quick reject before we touch disk) ──
    if (file && file.size > 0 && file.size > MAX_FILE_BYTES) {
      return NextResponse.json({
        error: `Audio file is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed is ${MAX_FILE_BYTES / 1024 / 1024} MB.`,
      }, { status: 413 });
    }

    const sessionId = `sess_${Date.now()}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    const outputDir = path.join(process.cwd(), "public", "output");

    // Ensure upload and output directories exist
    fs.mkdirSync(uploadDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });

    const logFilePath = path.join(outputDir, `${sessionId}_logs.txt`);
    
    // Bootstrapping log
    const timestamp = new Date().toLocaleTimeString("en-GB", { hour12: false });
    fs.writeFileSync(logFilePath, `[${timestamp}] [ROAR BLISS CORE] Bootstrapping personalization pipeline...\n`, "utf-8");

    let inputFilePath = "";

    if (file && file.size > 0) {
      inputFilePath = path.join(uploadDir, `${sessionId}_input.mp3`);
      const buffer = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(inputFilePath, buffer);

      // Tiered duration cap (need the file on disk first for ffprobe)
      const duration = probeDurationSeconds(inputFilePath);
      if (duration !== null && duration > maxDurationS) {
        fs.unlinkSync(inputFilePath);
        const msg = paid
          ? `Audio is too long (${Math.round(duration)}s). Maximum is ${PAID_MAX_DURATION_S}s (6 minutes).`
          : `Free tracks are capped at ${FREE_MAX_DURATION_S}s. Your audio is ${Math.round(duration)}s — upgrade to personalize up to 6 minutes.`;
        return NextResponse.json({ error: msg, upgradeRequired: !paid }, { status: 413 });
      }
      if (duration === null) {
        fs.unlinkSync(inputFilePath);
        return NextResponse.json({
          error: `Could not read audio duration. Please upload a valid .mp3 or .wav file.`,
        }, { status: 400 });
      }

      const bootTime = new Date().toLocaleTimeString("en-GB", { hour12: false });
      fs.appendFileSync(logFilePath, `[${bootTime}] [STEM SPLITTER] Uploaded custom audio file: ${file.name} (${duration.toFixed(1)}s, ${(file.size/1024/1024).toFixed(1)}MB) saved successfully.\n`);
    } else {
      // Use preloaded fallback motivational track "I CAN DO THIS"
      const fallbackSource = path.join(process.cwd(), "..", "I CAN DO THIS - Powerful Motivational Speech.mp3");
      inputFilePath = path.join(uploadDir, `${sessionId}_input.mp3`);
      
      if (fs.existsSync(fallbackSource)) {
        fs.copyFileSync(fallbackSource, inputFilePath);
        const bootTime = new Date().toLocaleTimeString("en-GB", { hour12: false });
        fs.appendFileSync(logFilePath, `[${bootTime}] [STEM SPLITTER] Loading preloaded speech asset: "I CAN DO THIS"...\n`);
      } else {
        const bootTime = new Date().toLocaleTimeString("en-GB", { hour12: false });
        fs.appendFileSync(logFilePath, `[${bootTime}] [error] Preloaded fallback speech file not found at: ${fallbackSource}\n`);
        return NextResponse.json({ error: "Fallback motivational speech file missing." }, { status: 500 });
      }
    }

    // Enqueue the job — the `npm run worker` process drains the queue serially
    // (Qwen3 TTS is single-instance, so concurrent jobs would otherwise collide).
    enqueueJob({
      id: sessionId,
      email: email || null,
      form: { name, battlefield, struggle, family, location, champion },
      inputPath: inputFilePath,
    });

    const queuedTime = new Date().toLocaleTimeString("en-GB", { hour12: false });
    fs.appendFileSync(logFilePath, `[${queuedTime}] [QUEUE] Job queued. The worker will pick it up shortly.\n`);

    return NextResponse.json({ sessionId, status: "queued" });
  } catch (error: unknown) {
    console.error("Process API route error:", error);
    return NextResponse.json({ error: "Failed to initialize personalized process." }, { status: 500 });
  }
}
