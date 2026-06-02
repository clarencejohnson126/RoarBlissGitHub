/**
 * Mints a short-lived client-upload token for Vercel Blob.
 *
 * Vercel serverless functions cap request bodies at 4.5 MB, so audio uploads CANNOT go through our
 * API route. Instead the browser uploads the file DIRECTLY to Vercel Blob (durable, no size limit),
 * and this route only authorizes that upload — the write token never reaches the client.
 */
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          "audio/mpeg",
          "audio/mp3",
          "audio/wav",
          "audio/x-wav",
          "audio/wave",
          "audio/ogg",
          "audio/webm",
          "audio/mp4",
          "audio/aac",
          "application/octet-stream",
        ],
        maximumSizeInBytes: 100 * 1024 * 1024, // 100 MB hard ceiling
        addRandomSuffix: true,
      }),
      // Nothing to persist server-side here; the client hands the resulting URL to /api/process.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
