import React, { useState } from 'react';
import { Music, Video, Mic, Category, Globe } from 'lucide-react';
import { SidebarSection } from './SidebarSection';
import { SoundtrackSelector } from './SoundtrackSelector';
import { speakers } from '../../data/speakers';
import { categories } from '../../data/categories';
import { languages } from '../../data/languages';
import type { SpeechInput } from '../../types';

interface SidebarMenuProps {
  formData: SpeechInput;
  onChange: (updates: Partial<SpeechInput>) => void;
  selectedSpeaker: string;
  onSpeakerSelect: (speakerId: string) => void;
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  selectedSoundtrack: string;
  onSoundtrackSelect: (id: string) => void;
}

export const SidebarMenu = ({
  formData,
  onChange,
  selectedSpeaker,
  onSpeakerSelect,
  selectedCategory,
  onSelectCategory,
  selectedSoundtrack,
  onSoundtrackSelect
}: SidebarMenuProps) => {
  const [openSections, setOpenSections] = useState({
    voices: false,
    categories: false,
    languages: false,
    soundtrack: false
  });

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({
      ...Object.keys(prev).reduce((acc, key) => ({
        ...acc,
        [key]: key === section ? !prev[key as keyof typeof prev] : false
      }), {})
    }));
  };

  return (
    <div className="w-64 bg-gray-900/30 backdrop-blur-sm border-r border-white/5 h-full">
      <SidebarSection
        title="Voice Selection"
        isOpen={openSections.voices}
        onToggle={() => toggleSection('voices')}
      >
        <div className="py-2 space-y-1">
          {speakers.map(speaker => (
            <button
              key={speaker.id}
              onClick={() => onSpeakerSelect(speaker.id)}
              className={`w-full flex items-center gap-2 px-4 py-1.5 text-sm transition-colors ${
                selectedSpeaker === speaker.id
                  ? 'bg-purple-500/20 text-purple-300'
                  : 'text-white/70 hover:bg-white/10'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span className="truncate">{speaker.name}</span>
            </button>
          ))}
        </div>
      </SidebarSection>

      <SidebarSection
        title="Soundtrack"
        isOpen={openSections.soundtrack}
        onToggle={() => toggleSection('soundtrack')}
      >
        <SoundtrackSelector
          selectedSoundtrack={selectedSoundtrack}
          onSelect={onSoundtrackSelect}
        />
      </SidebarSection>

      <SidebarSection
        title="Categories"
        isOpen={openSections.categories}
        onToggle={() => toggleSection('categories')}
      >
        <div className="py-2 space-y-1">
          {categories.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => onSelectCategory(id)}
              className={`w-full flex items-center gap-2 px-4 py-1.5 text-sm transition-colors ${
                selectedCategory === id
                  ? 'bg-purple-500/20 text-purple-300'
                  : 'text-white/70 hover:bg-white/10'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
      </SidebarSection>

      <SidebarSection
        title="Languages"
        isOpen={openSections.languages}
        onToggle={() => toggleSection('languages')}
      >
        <div className="py-2 space-y-1">
          {languages.map(language => (
            <button
              key={language.code}
              onClick={() => onChange({ language: language.code })}
              className={`w-full flex items-center gap-2 px-4 py-1.5 text-sm transition-colors ${
                formData.language === language.code
                  ? 'bg-purple-500/20 text-purple-300'
                  : 'text-white/70 hover:bg-white/10'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span className="truncate">{language.name}</span>
            </button>
          ))}
        </div>
      </SidebarSection>
    </div>
  );
};