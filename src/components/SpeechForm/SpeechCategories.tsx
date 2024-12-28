import React from 'react';
import { 
  Zap, 
  TrendingUp, 
  Crown, 
  Brain, 
  Sparkles, 
  Briefcase, 
  Heart, 
  Target 
} from 'lucide-react';

interface SpeechCategoriesProps {
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
}

export const SpeechCategories = ({ selectedCategory, onSelectCategory }: SpeechCategoriesProps) => {
  const categories = [
    { id: 'success', icon: Zap, label: 'Success' },
    { id: 'growth', icon: TrendingUp, label: 'Growth' },
    { id: 'confidence', icon: Crown, label: 'Confidence' },
    { id: 'mindset', icon: Brain, label: 'Mindset' },
    { id: 'leadership', icon: Sparkles, label: 'Leadership' },
    { id: 'career', icon: Briefcase, label: 'Career' },
    { id: 'inspiration', icon: Heart, label: 'Inspiration' },
    { id: 'perseverance', icon: Target, label: 'Perseverance' },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium text-white">Speech Category</h2>
      <div className="grid grid-cols-4 gap-4">
        {categories.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => onSelectCategory(id)}
            className={`flex items-center gap-2 p-3 rounded-lg transition-colors ${
              selectedCategory === id
                ? 'bg-purple-500/20 text-purple-300'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};