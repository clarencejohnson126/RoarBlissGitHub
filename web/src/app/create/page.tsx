"use client";

import { useEffect, useState } from "react";
import CreateFlowProvider, { useCreateFlow } from "@/components/create/CreateFlowProvider";
import WizardTopBar from "@/components/create/WizardTopBar";
import QuickCreate from "@/components/create/QuickCreate";
import StepName from "@/components/create/StepName";
import StepBattle from "@/components/create/StepBattle";
import StepCurrentState from "@/components/create/StepCurrentState";
import StepSpeechStyle from "@/components/create/StepSpeechStyle";
import StepFinalDetails from "@/components/create/StepFinalDetails";
import StepAudioUpload from "@/components/create/StepAudioUpload";
import StepGenerating from "@/components/create/StepGenerating";
import StepPreviewResult from "@/components/create/StepPreviewResult";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Depth, Intensity } from "@/components/create/createData";

const STEPS = [
  StepName,
  StepBattle,
  StepCurrentState,
  StepSpeechStyle,
  StepFinalDetails,
  StepAudioUpload,
  StepGenerating,
  StepPreviewResult,
];

function CreateRouter() {
  const { step, setStep, update } = useCreateFlow();
  const [mode, setMode] = useState<"loading" | "quick" | "wizard">("loading");

  useEffect(() => {
    const forceFull = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("full");
    if (forceFull) {
      setMode("wizard");
      return;
    }
    (async () => {
      try {
        const { data: sess } = await supabaseBrowser().auth.getSession();
        const token = sess.session?.access_token;
        if (!token) {
          setMode("wizard");
          return;
        }
        const r = await fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } });
        const me = await r.json();
        const p = me?.profile as Record<string, unknown> | null | undefined;
        const nickname = (p?.nickname as string) || (p?.userName as string) || "";
        if (p && nickname) {
          const people = p.people as string | undefined;
          update({
            userName: nickname,
            selectedBattles: Array.isArray(p.battles) ? (p.battles as string[]) : [],
            reasonForFighting: Array.isArray(p.reasonForFighting)
              ? (p.reasonForFighting as string[])
              : people
                ? people.split(",").map((s) => s.trim()).filter(Boolean)
                : [],
            neededEmotions: Array.isArray(p.neededEmotions) ? (p.neededEmotions as string[]) : [],
            lifePressure: Array.isArray(p.lifePressure) ? (p.lifePressure as string[]) : [],
            primaryTone: (p.primaryTone as string) || (p.tone as string) || "",
            secondaryTone: (p.secondaryTone as string) || "",
            intensity: (p.intensity as Intensity) || "medium",
            personalizationDepth: (p.depth as Depth) || 75,
            language: (p.language as string) || "English",
          });
          setMode("quick");
        } else {
          setMode("wizard");
        }
      } catch {
        setMode("wizard");
      }
    })();
  }, [update]);

  if (mode === "loading") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0c",
          color: "var(--color-smoke)",
          fontFamily: "var(--font-serif)",
          fontSize: "1.1rem",
        }}
      >
        Loading your studio…
      </div>
    );
  }

  if (mode === "quick" && step < 6) {
    return <QuickCreate onFullSetup={() => { setStep(0); setMode("wizard"); }} />;
  }

  const Active = STEPS[step] ?? STEPS[0];
  return <Active key={step} />;
}

export default function CreatePage() {
  return (
    <CreateFlowProvider>
      <WizardTopBar />
      <CreateRouter />
    </CreateFlowProvider>
  );
}
