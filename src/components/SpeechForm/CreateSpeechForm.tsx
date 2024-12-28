import React from 'react';
import { Music, Video, Link } from 'lucide-react';
import { SpeechInput } from './SpeechInput';
import { MediaUpload } from './MediaUpload';
import { SpeechCategories } from './SpeechCategories';
import { VoiceSelector } from './VoiceSelector';

interface CreateSpeechFormProps {
  formData: any;
  onChange: (updates: any) => void;
}

export const CreateSpeechForm = ({ formData, onChange }: CreateSpeechFormProps) => {
  return (
    <div className="space-y-8">
      <div className="bg-white/10 rounded-xl p-6 backdrop-blur-sm">
        <h1 className="text-2xl font-bold text-white mb-6">Create Your Motivational Speech</h1>
        
        <div className="space-y-6">
          <SpeechInput
            label="Your Name"
            value={formData.name || ''}
            onChange={(value) => onChange({ ...formData, name: value })}
            placeholder="Enter your name"
          />

          <SpeechInput
            label="Your Goal"
            value={formData.goal || ''}
            onChange={(value) => onChange({ ...formData, goal: value })}
            placeholder="What do you wish to achieve?"
          />

          <VoiceSelector
            value={formData.voiceStyle || ''}
            onChange={(value) => onChange({ ...formData, voiceStyle: value })}
          />

          <div className="space-y-4">
            <label className="block text-sm font-medium text-white">Add Media</label>
            <div className="grid grid-cols-3 gap-4">
              <MediaUpload icon={Music} label="Upload Audio" onUpload={(file) => {}} />
              <MediaUpload icon={Video} label="Upload Video" onUpload={(file) => {}} />
              <MediaUpload icon={Link} label="Add URL Link" onUpload={(url) => {}} />
            </div>
          </div>
        </div>
      </div>

      <SpeechCategories
        selectedCategory={formData.category || ''}
        onSelectCategory={(category) => onChange({ ...formData, category: category })}
      />

      <button
        type="submit"
        className="w-full py-3 px-4 bg-gradient-to-r from-purple-500 to-teal-500 text-white rounded-lg font-medium hover:from-purple-600 hover:to-teal-600 transition-colors"
      >
        Generate Speech
      </button>
    </div>
  );
};