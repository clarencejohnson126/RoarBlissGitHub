"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CreateFlowData, EMPTY_FLOW } from "./createData";

const KEY = "roarbliss_create_flow";

type Ctx = {
  data: CreateFlowData;
  update: (patch: Partial<CreateFlowData>) => void;
  toggleArray: (field: keyof CreateFlowData, value: string, max?: number) => void;
  file: File | null;
  setFile: (f: File | null) => void;
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
  const [sessionId, setSessionId] = useState("");
  const [step, setStep] = useState(0);
  const loaded = useRef(false);

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
    setSessionId("");
    setStep(0);
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <FlowCtx.Provider value={{ data, update, toggleArray, file, setFile, sessionId, setSessionId, step, setStep, next, back, reset }}>
      {children}
    </FlowCtx.Provider>
  );
}
