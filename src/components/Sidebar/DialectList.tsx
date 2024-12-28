import React from 'react';
import { MessageSquare } from 'lucide-react';
import { languages } from '../../data/languages';

interface DialectListProps {
  selectedLanguage: string;
  selectedDialect: string;
  onSelect: (code: string) => void;
}

export const DialectList = ({ selectedLanguage, selectedDialect, onSelect }: DialectListProps) => {
  const dialects = languages.find(l => l.code === selectedLanguage)?.dialects || [];

  return (
    <div className="space-y-2">
      {dialects.map((dialect) => (
        <button
          key={dialect.code}
          onClick={() => onSelect(dialect.code)}
          className={`w-full flex items-center px-3 py-2 rounded-md text-sm ${
            selectedDialect === dialect.code
              ? 'bg-purple-500/20 text-purple-300'
              : 'text-gray-300 hover:bg-gray-700/50'
          }`}
        >
          <MessageSquare className="w-4 h-4 mr-2" />
          {dialect.name}
        </button>
      ))}
    </div>
  );
};