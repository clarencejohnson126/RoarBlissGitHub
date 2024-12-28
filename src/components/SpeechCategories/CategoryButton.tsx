import React from 'react';
import { LucideIcon } from 'lucide-react';

interface CategoryButtonProps {
  icon: LucideIcon;
  label: string;
  isSelected?: boolean;
  onClick: () => void;
  onGenerateQuote: () => void;
}

export const CategoryButton = ({ 
  icon: Icon, 
  label, 
  isSelected, 
  onClick,
  onGenerateQuote 
}: CategoryButtonProps) => {
  const handleClick = (e: React.MouseEvent) => {
    if (e.altKey || e.ctrlKey) {
      onGenerateQuote();
    } else {
      onClick();
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors relative group ${
        isSelected
          ? 'bg-purple-500/20 text-purple-300'
          : 'text-white/70 hover:bg-white/10'
      }`}
    >
      <Icon className="w-5 h-5" />
      <span>{label}</span>
      <span className="absolute bottom-0 left-0 right-0 text-xs text-white/40 opacity-0 group-hover:opacity-100 transition-opacity text-center pb-1">
        Ctrl/Alt + Click for quote
      </span>
    </button>
  );
};