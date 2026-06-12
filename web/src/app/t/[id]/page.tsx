import Link from "next/link";
import { notFound } from "next/navigation";
import { getTrackByPredictionId } from "@/lib/scale-guard";

/**
 * /t/<predictionId> — public share page for a finished track. Every shared track is a landing page:
 * the visitor hears a REAL personalized speech and gets one button to make their own.
 * Only finished tracks resolve; the durable blob URL comes from the job row (random suffix, so the
 * page is the only way to reach it from the id).
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const title = "A battle speech made for one person — Roar Bliss";
  const description = "Listen to a personalized motivational speech, then create your own in minutes.";
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "music.song",
      url: `/t/${id}`,
      siteName: "Roar Bliss",
      images: [{ url: "/images/roarbliss-hero.png", width: 1200, height: 630, alt: "Roar Bliss — your story, your battle, your roar" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/images/roarbliss-hero.png"],
    },
  };
}

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9]{10,40}$/.test(id)) notFound();
  const track = await getTrackByPredictionId(id);
  const url = track?.output_url || (track ? `/api/audio?id=${id}` : null);
  if (!url) notFound();

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#08090D", color: "#E8E3D8", padding: "2rem" }}>
      <div style={{ maxWidth: 560, width: "100%", textAlign: "center" }}>
        <span style={{ letterSpacing: "0.2em", textTransform: "uppercase", fontSize: 12, color: "#D6A84F" }}>Roar Bliss</span>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: "2rem", margin: "0.75rem 0 0.5rem" }}>
          This speech was made for one person.
        </h1>
        <p style={{ color: "#B9B1A3", marginBottom: "2rem" }}>
          Their name. Their fight. Their voice of war. Listen — then hear your own.
        </p>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio controls preload="metadata" src={url} style={{ width: "100%", marginBottom: "2rem" }} />
        <div>
          <Link
            href="/create"
            style={{ background: "#D6A84F", color: "#1a130a", padding: "14px 32px", borderRadius: 8, textDecoration: "none", fontWeight: 700 }}
          >
            Create my own speech — free
          </Link>
        </div>
        <p style={{ fontSize: 12, color: "#8a8170", marginTop: "1.5rem" }}>
          Your first 45-second preview is free. No account needed to start.
        </p>
      </div>
    </main>
  );
}
