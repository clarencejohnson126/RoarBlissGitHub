import React from 'react';
import { ChevronRight } from 'lucide-react';

interface SidebarSectionProps {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export const SidebarSection = ({
  title,
  isOpen,
  onToggle,
  children
}: SidebarSectionProps) => {
  return (
    <div className="border-b border-white/5">
      <button
        onClick={onToggle}
        className="w-full px-3 py-2 flex items-center justify-between text-white/80 hover:bg-white/5 transition-colors"
      >
        <span className="text-sm font-medium">{title}</span>
        <ChevronRight
          className={`w-4 h-4 transition-transform ${
            isOpen ? 'transform rotate-90' : ''
          }`}
        />
      </button>
      {isOpen && (
        <div className="bg-white/5">
          {children}
        </div>
      )}
    </div>
  );
};