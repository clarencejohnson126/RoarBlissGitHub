import React from 'react';
import { Music, Video, Link } from 'lucide-react';
import { SpeechInput } from './SpeechInput';
import { VoiceSelector } from './VoiceSelector';
import { MediaUpload } from '../media/MediaUpload';
import { useSpeechGeneration } from '../../hooks/useSpeechGeneration';
import type { SpeechInput as SpeechInputType } from '../../types';

interface SpeechFormProps {
  formData: SpeechInputType;
  onChange: (updates: Partial<SpeechInputType>) => void;
  selectedSpeaker: string;
  onSpeakerSelect: (speakerId: string) => void;
}

export const SpeechForm = ({ 
  formData, 
  onChange, 
  selectedSpeaker, 
  onSpeakerSelect 
}: SpeechFormProps) => {
  const { generateSpeech, isGenerating } = useSpeechGeneration();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const text = formData.customText || `Hello ${formData.name}, let's achieve your goal of ${formData.goal}. Remember, with dedication and perseverance, anything is possible.`;
    
    try {
      await generateSpeech(text, selectedSpeaker, formData.language);
    } catch (error) {
      console.error('Failed to generate speech:', error);
      alert('Failed to generate speech. Please try again.');
    }
  };

  const handleMediaUpload = (url: string) => {
    // Handle the uploaded media URL
    console.log('Media uploaded:', url);
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-6xl mx-auto p-6">
      <div className="bg-gradient-to-br from-purple-600/20 to-teal-500/20 rounded-xl p-8 backdrop-blur-sm">
        <h1 className="text-2xl font-bold text-white mb-8">Create Your Motivational Speech</h1>
        <p className="text-white/80 mb-8">Transform your goals into powerful words of inspiration</p>

        <div className="grid grid-cols-2 gap-8">
          {/* Left Column - Input Fields */}
          <div className="space-y-6">
            <SpeechInput
              label="Your Name"
              value={formData.name || ''}
              onChange={(value) => onChange({ ...formData, name: value })}
              placeholder="Enter your name"
              required
            />

            <SpeechInput
              label="Your Goal"
              value={formData.goal || ''}
              onChange={(value) => onChange({ ...formData, goal: value })}
              placeholder="What do you wish to achieve?"
              required
            />

            <VoiceSelector
              selectedSpeaker={selectedSpeaker}
              onSpeakerSelect={onSpeakerSelect}
            />
          </div>

          {/* Right Column - Custom Message */}
          <div>
            <label className="block text-white text-sm font-medium mb-2">Custom Message (Optional)</label>
            <textarea
              value={formData.customText || ''}
              onChange={(e) => onChange({ ...formData, customText: e.target.value })}
              placeholder="Add your custom motivational message..."
              className="w-full h-[180px] px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none"
            />
          </div>
        </div>

        {/* Media Upload Section */}
        <div className="mt-8">
          <label className="block text-white text-sm font-medium mb-4">Add Media</label>
          <MediaUpload onUpload={handleMediaUpload} />
        </div>

        {/* Generate Button */}
        <div className="mt-8">
          <button
            type="submit"
            disabled={isGenerating}
            className={`w-full py-3 px-4 bg-gradient-to-r from-purple-500 to-teal-500 text-white rounded-lg font-medium transition-all ${
              isGenerating 
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:from-purple-600 hover:to-teal-600'
            }`}
          >
            {isGenerating ? 'Generating Speech...' : 'Generate Speech'}
          </button>
        </div>
      </div>
    </form>
  );
};