import React from 'react';
import { Play } from 'lucide-react';
import type { Speaker } from '../../types';

interface SpeakerCardProps {
  speaker: Speaker;
  isSelected?: boolean;
  onSelect: () => void;
  onPreview: () => void;
}

export const SpeakerCard = ({ speaker, isSelected, onSelect, onPreview }: SpeakerCardProps) => {
  const { name, description, gradient, accentColor } = speaker;
  const initial = name.charAt(0);

  return (
    <div 
      className={`${gradient} rounded-xl p-4 transform transition-all duration-300 hover:scale-105 hover:shadow-xl ${
        isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900' : ''
      }`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 mr-4">
          <h3 className="text-white font-semibold text-lg truncate">{name}</h3>
          <p className="text-white/80 text-sm line-clamp-2">{description}</p>
        </div>
        <div className={`w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-xl shrink-0 border-2 border-${accentColor}-300/50`}>
          {initial}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onSelect}
          className={`flex-1 py-2.5 px-4 bg-white/20 hover:bg-white/30 rounded-lg text-white flex items-center justify-center gap-2 transition-colors ${
            isSelected ? 'bg-white/40' : ''
          }`}
        >
          <span className="font-medium">{isSelected ? 'Selected' : 'Select Voice'}</span>
        </button>
        <button
          onClick={onPreview}
          className="py-2.5 px-4 bg-white/20 hover:bg-white/30 rounded-lg text-white flex items-center justify-center transition-colors"
        >
          <Play className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};