import React from 'react';
import { ChevronDown } from 'lucide-react';

interface CategoryDropdownProps {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export const CategoryDropdown = ({ title, isOpen, onToggle, children }: CategoryDropdownProps) => {
  return (
    <div className="border-b border-white/10">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-white/5"
      >
        <span className="font-medium text-white">{title}</span>
        <ChevronDown
          className={`w-5 h-5 text-white/70 transition-transform ${
            isOpen ? 'transform rotate-180' : ''
          }`}
        />
      </button>
      {isOpen && (
        <div className="px-4 py-2 bg-white/5">{children}</div>
      )}
    </div>
  );
};