"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CreateFlowData, EMPTY_FLOW } from "./createData";
import { supabaseBrowser } from "@/lib/supabase-browser";

const KEY = "roarbliss_create_flow";

/** Who the current visitor is — drives tier-aware copy across every step (paid users must never see
 *  "45-second preview / create an account"). Loaded once from /api/me; null while loading. */
export type Entitlement = { authenticated: boolean; tier: string; minutesRemaining: number };

type Ctx = {
  data: CreateFlowData;
  /** null while /api/me is loading; treat as free/anonymous until it resolves. */
  entitlement: Entitlement | null;
  update: (patch: Partial<CreateFlowData>) => void;
  toggleArray: (field: keyof CreateFlowData, value: string, max?: number) => void;
  file: File | null;
  setFile: (f: File | null) => void;
  /** A saved-voice blob URL (from the dashboard "Use this voice") — used instead of a fresh upload. */
  presetAudioUrl: string;
  setPresetAudioUrl: (url: string) => void;
  /** Opt-in: copy this run's upload into the user's voice library before cleanup deletes it. */
  saveVoice: boolean;
  setSaveVoice: (v: boolean) => void;
  sessionId: string;
  setSessionId: (id: string) => void;
  step: number;
  setStep: (n: number) => void;
  next: () => void;
  back: () => void;
  reset: () => void;
};

const FlowCtx = createContext<Ctx | null>(null);

export function useCreateFlow(): Ctx {
  const ctx = useContext(FlowCtx);
  if (!ctx) throw new Error("useCreateFlow must be used within CreateFlowProvider");
  return ctx;
}

export default function CreateFlowProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<CreateFlowData>(EMPTY_FLOW);
  const [file, setFile] = useState<File | null>(null);
  const [presetAudioUrl, setPresetAudioUrl] = useState("");
  const [saveVoice, setSaveVoice] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [step, setStep] = useState(0);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const loaded = useRef(false);

  // Load the visitor's entitlement once (tier → paid). Every step reads this for truthful copy.
  useEffect(() => {
    (async () => {
      try {
        const { data: sess } = await supabaseBrowser().auth.getSession();
        const token = sess.session?.access_token;
        if (!token) {
          setEntitlement({ authenticated: false, tier: "", minutesRemaining: 0 });
          return;
        }
        const r = await fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } });
        const j = await r.json().catch(() => ({}));
        setEntitlement({
          authenticated: !!j.authenticated,
          tier: (j.tier as string) || "",
          minutesRemaining: Number(j.minutesRemaining) || 0,
        });
      } catch {
        setEntitlement({ authenticated: false, tier: "", minutesRemaining: 0 });
      }
    })();
  }, []);

  // restore persisted answers (not the File — can't serialize)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setData({ ...EMPTY_FLOW, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }, [data]);

  const update = useCallback((patch: Partial<CreateFlowData>) => setData((d) => ({ ...d, ...patch })), []);

  const toggleArray = useCallback((field: keyof CreateFlowData, value: string, max?: number) => {
    setData((d) => {
      const arr = (d[field] as string[]) ?? [];
      let next: string[];
      if (arr.includes(value)) next = arr.filter((v) => v !== value);
      else next = max && arr.length >= max ? [...arr.slice(1), value] : [...arr, value];
      return { ...d, [field]: next };
    });
  }, []);

  const next = useCallback(() => setStep((s) => Math.min(7, s + 1)), []);
  const back = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);
  const reset = useCallback(() => {
    setData(EMPTY_FLOW);
    setFile(null);
    setPresetAudioUrl("");
    setSaveVoice(false);
    setSessionId("");
    setStep(0);
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <FlowCtx.Provider value={{ data, entitlement, update, toggleArray, file, setFile, presetAudioUrl, setPresetAudioUrl, saveVoice, setSaveVoice, sessionId, setSessionId, step, setStep, next, back, reset }}>
      {children}
    </FlowCtx.Provider>
  );
}
