import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { SidebarSection } from './SidebarSection';
import type { SpeechInput } from '../../types';

interface SidebarProps {
  formData: SpeechInput;
  onChange: (updates: Partial<SpeechInput>) => void;
  selectedSpeaker: string;
  onSpeakerSelect: (speakerId: string) => void;
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
}

export const Sidebar = ({
  formData,
  onChange,
  selectedSpeaker,
  onSpeakerSelect,
  selectedCategory,
  onSelectCategory
}: SidebarProps) => {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    speech: false,
    media: false,
    voice: false,
    categories: false,
    language: false,
    dialect: false
  });

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="w-64 bg-gray-900/40 backdrop-blur-sm border-l border-white/10 h-full overflow-y-auto">
      <div className="p-4 border-b border-white/10">
        <h2 className="text-lg font-semibold text-white">Navigation</h2>
      </div>

      <SidebarSection
        title="Create Speech"
        isOpen={openSections.speech}
        onToggle={() => {
          toggleSection('speech');
          scrollToSection('create-speech');
        }}
      />

      <SidebarSection
        title="Add Media"
        isOpen={openSections.media}
        onToggle={() => {
          toggleSection('media');
          scrollToSection('add-media');
        }}
      />

      <SidebarSection
        title="Voice Speakers"
        isOpen={openSections.voice}
        onToggle={() => {
          toggleSection('voice');
          scrollToSection('voice-speakers');
        }}
      />

      <SidebarSection
        title="Categories"
        isOpen={openSections.categories}
        onToggle={() => {
          toggleSection('categories');
          scrollToSection('categories');
        }}
      />
    </div>
  );
};