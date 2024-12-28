import React from 'react';
import { languages } from '../../data/languages';

interface LanguageListProps {
  selectedLanguage: string;
  onSelect: (code: string) => void;
}

export const LanguageList = ({ selectedLanguage, onSelect }: LanguageListProps) => {
  return (
    <div className="space-y-2">
      {languages.map((language) => {
        const [flag, ...nameParts] = language.name.split(' ');
        const name = nameParts.join(' ');
        
        return (
          <button
            key={language.code}
            onClick={() => onSelect(language.code)}
            className={`w-full flex items-center px-3 py-2 rounded-md text-sm ${
              selectedLanguage === language.code
                ? 'bg-purple-500/20 text-purple-300'
                : 'text-gray-300 hover:bg-gray-700/50'
            }`}
          >
            <span className="mr-2 text-base" role="img" aria-label={`${name} flag`}>
              {flag}
            </span>
            <span>{name}</span>
          </button>
        );
      })}
    </div>
  );
};