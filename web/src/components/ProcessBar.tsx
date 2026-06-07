"use client";

import React from "react";

const ICON = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const STEPS = [
  {
    label: "Upload Audio",
    icon: (
      <svg {...ICON}><path d="M12 13v8" /><path d="m8 17 4-4 4 4" /><path d="M20 16.7A5 5 0 0 0 18 7h-1.3A8 8 0 1 0 4 15.2" /></svg>
    ),
  },
  {
    label: "Choose Your Battle",
    icon: (
      <svg {...ICON}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></svg>
    ),
  },
  {
    label: "Personalize",
    icon: (
      <svg {...ICON}><line x1="4" y1="8" x2="20" y2="8" /><line x1="4" y1="16" x2="20" y2="16" /><circle cx="9" cy="8" r="2.4" fill="currentColor" stroke="none" /><circle cx="15" cy="16" r="2.4" fill="currentColor" stroke="none" /></svg>
    ),
  },
  {
    label: "Generate",
    icon: (
      <svg {...ICON}><line x1="3" y1="12" x2="3" y2="12.01" /><line x1="7" y1="8" x2="7" y2="16" /><line x1="11" y1="5" x2="11" y2="19" /><line x1="15" y1="9" x2="15" y2="15" /><line x1="19" y1="7" x2="19" y2="17" /></svg>
    ),
  },
];

export default function ProcessBar({ onStep }: { onStep?: () => void }) {
  return (
    <div className="process-wrap">
      <div className="process-bar">
        {STEPS.map((s, i) => (
          <React.Fragment key={s.label}>
            <button
              type="button"
              onClick={onStep}
              className="process-step"
              style={{ background: "none", border: "none", cursor: onStep ? "pointer" : "default" }}
            >
              <span className="process-step-icon">{s.icon}</span>
              {s.label}
            </button>
            {i < STEPS.length - 1 && (
              <span className="process-sep" aria-hidden>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
              </span>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
