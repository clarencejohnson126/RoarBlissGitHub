import React from 'react';
import { Quote, SpeechInput } from '../../types';
import { SpeechForm } from '../SpeechForm/SpeechForm';
import { SidebarMenu } from '../Sidebar/SidebarMenu';

interface DashboardProps {
  currentQuote: Quote | null;
  onSelectCategory: (category: string) => void;
  selectedCategory: string;
  formData: SpeechInput;
  onFormChange: (updates: Partial<SpeechInput>) => void;
  selectedSpeaker: string;
  onSpeakerSelect: (speakerId: string) => void;
  selectedSoundtrack: string;
  onSoundtrackSelect: (id: string) => void;
}

export const Dashboard = ({
  currentQuote,
  onSelectCategory,
  selectedCategory,
  formData,
  onFormChange,
  selectedSpeaker,
  onSpeakerSelect,
  selectedSoundtrack,
  onSoundtrackSelect,
}: DashboardProps) => {
  return (
    <div className="flex h-full">
      <SidebarMenu
        formData={formData}
        onChange={onFormChange}
        selectedSpeaker={selectedSpeaker}
        onSpeakerSelect={onSpeakerSelect}
        selectedCategory={selectedCategory}
        onSelectCategory={onSelectCategory}
        selectedSoundtrack={selectedSoundtrack}
        onSoundtrackSelect={onSoundtrackSelect}
      />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-8 p-6">
          {currentQuote && (
            <div className="bg-white/10 rounded-lg p-6 backdrop-blur-sm">
              <blockquote className="text-white">
                <p className="text-lg font-medium">"{currentQuote.text}"</p>
                <footer className="mt-2 text-white/70">— {currentQuote.author}</footer>
              </blockquote>
            </div>
          )}

          <SpeechForm
            formData={formData}
            onChange={onFormChange}
            selectedSpeaker={selectedSpeaker}
            onSpeakerSelect={onSpeakerSelect}
            selectedSoundtrack={selectedSoundtrack}
            onSoundtrackSelect={onSoundtrackSelect}
          />
        </div>
      </main>
    </div>
  );
};