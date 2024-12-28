import React from 'react';
import { Zap, TrendingUp, Crown, Brain, Sparkles, Briefcase } from 'lucide-react';
import { CategoryButton } from './CategoryButton';
import { useQuoteGeneration } from '../../hooks/useQuoteGeneration';

interface CategoryGridProps {
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
}

export const CategoryGrid = ({ selectedCategory, onSelectCategory }: CategoryGridProps) => {
  const { currentQuote, generateQuote } = useQuoteGeneration();

  const categories = [
    { id: 'success', icon: Zap, label: 'Success' },
    { id: 'growth', icon: TrendingUp, label: 'Growth' },
    { id: 'confidence', icon: Crown, label: 'Confidence' },
    { id: 'mindset', icon: Brain, label: 'Mindset' },
    { id: 'leadership', icon: Sparkles, label: 'Leadership' },
    { id: 'career', icon: Briefcase, label: 'Career' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        {categories.map((category) => (
          <CategoryButton
            key={category.id}
            icon={category.icon}
            label={category.label}
            isSelected={selectedCategory === category.id}
            onClick={() => onSelectCategory(category.id)}
            onGenerateQuote={() => generateQuote(category.id as keyof typeof quotesByCategory)}
          />
        ))}
      </div>
      
      {currentQuote && (
        <div className="bg-white/5 p-4 rounded-lg">
          <blockquote className="text-white/90">
            "{currentQuote.text}"
            <footer className="mt-2 text-white/60">
              — {currentQuote.author}
            </footer>
          </blockquote>
        </div>
      )}
    </div>
  );
};