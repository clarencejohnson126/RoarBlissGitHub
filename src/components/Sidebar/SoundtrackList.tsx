import React from 'react';
import { Music } from 'lucide-react';
import { soundtracks } from '../../data/soundtracks';

interface SoundtrackListProps {
  selectedSoundtrack: string;
  onSelect: (id: string) => void;
}

export const SoundtrackList = ({ selectedSoundtrack, onSelect }: SoundtrackListProps) => {
  return (
    <div className="space-y-2">
      {soundtracks.map((soundtrack) => (
        <button
          key={soundtrack.id}
          onClick={() => onSelect(soundtrack.id)}
          className={`w-full flex items-center px-3 py-2 rounded-md text-sm ${
            selectedSoundtrack === soundtrack.id
              ? 'bg-purple-500/20 text-purple-300'
              : 'text-gray-300 hover:bg-gray-700/50'
          }`}
        >
          <Music className="w-4 h-4 mr-2" />
          {soundtrack.name}
        </button>
      ))}
    </div>
  );
};