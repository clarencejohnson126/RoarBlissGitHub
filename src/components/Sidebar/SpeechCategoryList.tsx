import React from 'react';
import { Loader2 } from 'lucide-react';
import { useSpeechGeneration } from '../../hooks/useSpeechGeneration';
import { useQuoteGeneration } from '../../hooks/useQuoteGeneration';
import { categories } from '../../data/categories';

interface SpeechCategoryListProps {
  selectedCategory: string;
  onSelect: (category: string) => void;
  selectedSpeaker: string;
}

export const SpeechCategoryList = ({ 
  selectedCategory, 
  onSelect, 
  selectedSpeaker 
}: SpeechCategoryListProps) => {
  const { generateSpeech } = useSpeechGeneration();
  const { generateQuote, isLoading } = useQuoteGeneration();

  const handleCategoryClick = async (categoryId: string) => {
    onSelect(categoryId);
    const quote = await generateQuote(categoryId);
    if (quote && selectedSpeaker) {
      await generateSpeech(quote.text, selectedSpeaker);
    }
  };

  return (
    <div className="space-y-2">
      {categories.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          onClick={() => handleCategoryClick(id)}
          disabled={isLoading}
          className={`w-full flex items-center px-3 py-2 rounded-md text-sm ${
            selectedCategory === id
              ? 'bg-purple-500/20 text-purple-300'
              : 'text-gray-300 hover:bg-gray-700/50'
          } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {isLoading && selectedCategory === id ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Icon className="w-4 h-4 mr-2" />
          )}
          {label}
        </button>
      ))}
    </div>
  );
};