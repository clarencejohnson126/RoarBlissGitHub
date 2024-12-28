import React from 'react';
import { LucideIcon } from 'lucide-react';

interface ActionButtonProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}

export const ActionButton = ({ icon: Icon, label, onClick }: ActionButtonProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 py-3 px-4 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors flex items-center justify-center gap-2"
    >
      <Icon className="w-5 h-5" />
      {label}
    </button>
  );
};