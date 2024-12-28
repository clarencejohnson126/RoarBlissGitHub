import React from 'react';
import { LucideIcon } from 'lucide-react';

interface MediaButtonProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export const MediaButton = ({ icon: Icon, label, onClick, disabled }: MediaButtonProps) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-lg transition-colors ${
        disabled
          ? 'border-white/10 text-white/40 cursor-not-allowed'
          : 'border-white/20 hover:border-white/40 text-white'
      }`}
    >
      <Icon className="w-6 h-6 mb-2" />
      <span className="text-sm">{label}</span>
    </button>
  );
};