import React from 'react';

interface SpeechInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}

export const SpeechInput = ({ 
  label, 
  value, 
  onChange, 
  placeholder,
  required 
}: SpeechInputProps) => {
  return (
    <div>
      <label className="block text-sm font-medium text-white mb-1">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
      />
    </div>
  );
};