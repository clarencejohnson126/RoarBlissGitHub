"use client";

import { useState } from "react";

/**
 * Private, per-track feedback. NOT a public testimonial — it posts to /api/feedback and is only ever
 * read by us (service role). The tags are a fixed vocabulary that maps each complaint to an evaluator
 * metric, so the learning loop gets a labeled signal, not a vibe.
 */
const TAGS: { key: string; label: string; good?: boolean }[] = [
  { key: "loved_it", label: "Loved it", good: true },
  { key: "voice_unclear", label: "Voice unclear" },
  { key: "volume_uneven", label: "Volume uneven" },
  { key: "not_like_speaker", label: "Didn't sound like them" },
  { key: "wrong_words", label: "Wrong words" },
  { key: "not_personal", label: "Not personal enough" },
  { key: "music_balance", label: "Music too loud / quiet" },
];

export default function FeedbackWidget({ predictionId, token }: { predictionId: string; token?: string | null }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggle = (k: string) => setTags((t) => (t.includes(k) ? t.filter((x) => x !== k) : [...t, k]));

  const submit = async () => {
    if (!rating && tags.length === 0 && !comment.trim()) return;
    setBusy(true);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ predictionId, rating, tags, comment }),
      });
      setSent(true);
    } catch {
      setSent(true); // never make the user feel it failed
    }
  };

  if (sent) {
    return <div style={{ fontSize: 13, color: "var(--color-gold, #D6A84F)" }}>Thank you — this directly trains the next track.</div>;
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ background: "none", border: "1px solid rgba(214,168,79,0.4)", color: "var(--color-gold, #D6A84F)",
          borderRadius: 8, padding: "6px 14px", fontSize: 13, cursor: "pointer" }}
      >
        Rate this track (private)
      </button>
    );
  }

  return (
    <div style={{ border: "1px solid rgba(214,168,79,0.25)", borderRadius: 10, padding: "0.9rem", background: "rgba(0,0,0,0.25)" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setRating(n)} aria-label={`${n} stars`}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: n <= rating ? "#D6A84F" : "#555" }}>★</button>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {TAGS.map((t) => (
          <button key={t.key} onClick={() => toggle(t.key)}
            style={{ borderRadius: 999, padding: "4px 11px", fontSize: 12, cursor: "pointer",
              border: `1px solid ${tags.includes(t.key) ? "#D6A84F" : "rgba(255,255,255,0.15)"}`,
              background: tags.includes(t.key) ? "rgba(214,168,79,0.18)" : "transparent",
              color: tags.includes(t.key) ? "#E8E3D8" : "#B9B1A3" }}>
            {t.label}
          </button>
        ))}
      </div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000}
        placeholder="Anything else? (private — only we read this)"
        style={{ width: "100%", minHeight: 56, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 8, color: "#fff", padding: "8px 10px", fontSize: 13, resize: "vertical", marginBottom: 10 }} />
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={submit} disabled={busy}
          style={{ background: "#D6A84F", color: "#1a130a", border: "none", borderRadius: 8, padding: "7px 18px", fontWeight: 700, cursor: "pointer" }}>
          {busy ? "Sending…" : "Send feedback"}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#8a8170", cursor: "pointer", fontSize: 13 }}>Cancel</button>
      </div>
    </div>
  );
}
