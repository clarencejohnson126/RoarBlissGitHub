"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import styles from "./community.module.css";

type Post = {
  id: string;
  user_id: string;
  prediction_id: string;
  audio_url: string;
  display_name: string;
  comment: string;
  created_at: string;
};
type Track = { id: string; url: string; createdAt: string };

/** The community wall: a composer (signed-in users post one of their finished tracks with a
 *  description) + the public feed. Posting re-posts (upsert) if the track was already shared. */
export default function CommunityWall() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [trackId, setTrackId] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [copied, setCopied] = useState("");

  const loadFeed = useCallback(async () => {
    try {
      const r = await fetch("/api/community", { cache: "no-store" });
      if (r.ok) setPosts(((await r.json()) as { posts: Post[] }).posts);
      else setPosts([]);
    } catch {
      setPosts([]);
    }
  }, []);

  useEffect(() => {
    loadFeed();
    const sb = supabaseBrowser();
    sb.auth.getSession().then(async ({ data }) => {
      const tok = data.session?.access_token ?? null;
      setToken(tok);
      setUserId(data.session?.user?.id ?? null);
      if (!tok) return;
      try {
        const r = await fetch("/api/me/tracks", { headers: { Authorization: `Bearer ${tok}` } });
        if (r.ok) {
          const t = ((await r.json()) as { tracks: Track[] }).tracks;
          setTracks(t);
          if (t.length) setTrackId(t[0].id);
        }
      } catch {
        /* composer just stays empty */
      }
    });
  }, [loadFeed]);

  const submit = async () => {
    if (!token || !trackId || !comment.trim()) return;
    setBusy(true);
    setError("");
    setOk("");
    try {
      const r = await fetch("/api/community", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ predictionId: trackId, comment: comment.trim() }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        setError(j.error || "Could not post — try again.");
      } else {
        setOk("Posted to the wall.");
        setComment("");
        await loadFeed();
      }
    } catch {
      setError("Could not post — try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!token) return;
    await fetch(`/api/community?id=${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    await loadFeed();
  };

  const share = async (p: Post) => {
    const url = `${window.location.origin}/t/${p.prediction_id}`;
    const text = `"${p.comment.slice(0, 120)}" — a battle speech made on Roar Bliss`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Roar Bliss", text, url });
        return;
      } catch {
        /* fall through to clipboard */
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(p.id);
    setTimeout(() => setCopied(""), 2000);
  };

  return (
    <>
      <div className={styles.composer}>
        <div className={styles.composerTitle}>Post your roar</div>
        {token ? (
          tracks.length ? (
            <>
              <select className={styles.field} value={trackId} onChange={(e) => setTrackId(e.target.value)}>
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    Speech from {new Date(t.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </option>
                ))}
              </select>
              <textarea
                className={styles.field}
                placeholder="What is this speech about? Your battle, your why — tell the wall. (max 600 characters)"
                maxLength={600}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <div className={styles.composerRow}>
                <span className={styles.hint}>Posting makes this track public on the wall and via its share link.</span>
                <button className={styles.btnGold} disabled={busy || !comment.trim()} onClick={submit}>
                  {busy ? "Posting…" : "Post to the wall"}
                </button>
              </div>
              {error && <p className={styles.error}>{error}</p>}
              {ok && <p className={styles.ok}>{ok}</p>}
            </>
          ) : (
            <p className={styles.hint}>
              No finished speeches yet — <Link href="/create" style={{ color: "var(--color-gold)" }}>create your first one</Link> and post it here.
            </p>
          )
        ) : (
          <p className={styles.hint}>
            <Link href="/dashboard" style={{ color: "var(--color-gold)" }}>Sign in</Link> to post one of your speeches with your story.
          </p>
        )}
      </div>

      {posts === null ? (
        <div className={styles.empty}>Loading the wall…</div>
      ) : posts.length === 0 ? (
        <div className={styles.empty}>
          The wall is waiting for its first roar.
          <div style={{ marginTop: "1rem" }}>
            <Link href="/create" className={styles.btnGhost}>Create your speech</Link>
          </div>
        </div>
      ) : (
        posts.map((p) => (
          <article key={p.id} className={styles.post}>
            <div className={styles.postHead}>
              <span className={styles.postName}>{p.display_name}</span>
              <span className={styles.postDate}>
                {new Date(p.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            </div>
            <p className={styles.postComment}>{p.comment}</p>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio className={styles.postAudio} controls preload="none" src={p.audio_url} />
            <div className={styles.postActions}>
              <button className={styles.btnGhost} onClick={() => share(p)}>
                {copied === p.id ? "Link copied ✓" : "Share"}
              </button>
              <Link className={styles.btnGhost} href="/create">Create your own</Link>
              {userId === p.user_id && (
                <button className={styles.btnGhost} onClick={() => remove(p.id)} style={{ opacity: 0.7 }}>
                  Delete
                </button>
              )}
            </div>
          </article>
        ))
      )}
    </>
  );
}
