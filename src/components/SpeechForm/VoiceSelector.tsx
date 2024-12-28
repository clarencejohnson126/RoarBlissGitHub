import React from 'react';
import { speakers } from '../../data/speakers';
import { Speaker } from '../../types';

interface VoiceSelectorProps {
  selectedSpeaker: string;
  onSpeakerSelect: (speakerId: string) => void;
}

export const VoiceSelector = ({ selectedSpeaker, onSpeakerSelect }: VoiceSelectorProps) => {
  const renderSpeakerCard = (speaker: Speaker) => {
    const isSelected = selectedSpeaker === speaker.id;
    
    return (
      <button
        key={speaker.id}
        onClick={() => onSpeakerSelect(speaker.id)}
        className={`flex flex-col items-start p-4 rounded-lg transition-all ${
          speaker.gradient
        } ${
          isSelected 
            ? 'ring-2 ring-white/50 transform scale-[1.02]' 
            : 'hover:transform hover:scale-[1.02]'
        }`}
      >
        <h3 className="text-lg font-semibold text-white mb-1">{speaker.name}</h3>
        <p className="text-sm text-white/80">{speaker.description}</p>
      </button>
    );
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-white">Voice Style</label>
      <div className="grid grid-cols-2 gap-4">
        {speakers.map(renderSpeakerCard)}
      </div>
    </div>
  );
};