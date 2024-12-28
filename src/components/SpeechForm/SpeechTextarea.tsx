import React from 'react';

interface SpeechTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const SpeechTextarea = ({ value, onChange, placeholder }: SpeechTextareaProps) => {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-40 px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/30 resize-none"
    />
  );
};