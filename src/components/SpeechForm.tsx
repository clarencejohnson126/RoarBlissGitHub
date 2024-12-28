import React from 'react';
import { Upload } from 'lucide-react';
import type { SpeechInput } from '../types';
import { speakers } from '../data/speakers';

interface SpeechFormProps {
  formData: SpeechInput;
  onChange: (formData: SpeechInput) => void;
}

export const SpeechForm = ({ formData, onChange }: SpeechFormProps) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement speech generation
    console.log('Form submitted:', formData);
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700">Your Name</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => onChange({ ...formData, name: e.target.value })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Your Goal</label>
        <input
          type="text"
          value={formData.goal}
          onChange={(e) => onChange({ ...formData, goal: e.target.value })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Keywords</label>
        <input
          type="text"
          placeholder="Enter keywords separated by commas"
          onChange={(e) => onChange({ ...formData, keywords: e.target.value.split(',').map(k => k.trim()) })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Speech Source</label>
        <div className="mt-2 space-x-4">
          <label className="inline-flex items-center">
            <input
              type="radio"
              value="library"
              checked={formData.speechSource === 'library'}
              onChange={(e) => onChange({ ...formData, speechSource: e.target.value as 'library' | 'custom' })}
              className="form-radio text-purple-600"
            />
            <span className="ml-2">Choose from Library</span>
          </label>
          <label className="inline-flex items-center">
            <input
              type="radio"
              value="custom"
              checked={formData.speechSource === 'custom'}
              onChange={(e) => onChange({ ...formData, speechSource: e.target.value as 'library' | 'custom' })}
              className="form-radio text-purple-600"
            />
            <span className="ml-2">Upload Custom</span>
          </label>
        </div>
      </div>

      {formData.speechSource === 'library' ? (
        <div>
          <label className="block text-sm font-medium text-gray-700">Select Speech</label>
          <select
            value={formData.libraryChoice}
            onChange={(e) => onChange({ ...formData, libraryChoice: e.target.value })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500"
          >
            <option value="les-brown">Les Brown Classic</option>
            <option value="tony-robbins">Tony Robbins Energy</option>
          </select>
        </div>
      ) : (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <Upload className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-1 text-sm text-gray-600">
            Drag and drop your speech file here, or click to upload
          </p>
          <input
            type="file"
            accept=".txt"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                  onChange({ ...formData, customText: e.target?.result as string });
                };
                reader.readAsText(file);
              }
            }}
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">Voice</label>
        <select
          value={formData.voice}
          onChange={(e) => onChange({ ...formData, voice: e.target.value })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500"
        >
          {speakers.map((speaker) => (
            <option key={speaker.id} value={speaker.id}>
              {speaker.name}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        className="w-full py-3 px-4 border border-transparent rounded-md shadow-sm text-white bg-gradient-to-r from-purple-600 to-teal-400 hover:from-purple-700 hover:to-teal-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
      >
        Generate My Speech
      </button>
    </form>
  );
};