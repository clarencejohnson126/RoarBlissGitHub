import { useState, useCallback } from 'react';
import { OpenAIService } from '../services/openai';
import { quotesByCategory } from '../data/quotes';
import type { Quote } from '../types';

export const useQuoteGeneration = () => {
  const [currentQuote, setCurrentQuote] = useState<Quote | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getRandomQuote = (category: keyof typeof quotesByCategory): Quote => {
    const quotes = quotesByCategory[category];
    const randomIndex = Math.floor(Math.random() * quotes.length);
    return quotes[randomIndex];
  };

  const generateQuote = useCallback(async (category: keyof typeof quotesByCategory) => {
    setIsLoading(true);
    setError(null);

    try {
      // Try AI generation first
      const quote = await OpenAIService.generateQuote(category);
      setCurrentQuote(quote);
      return quote;
    } catch (error) {
      // Fallback to static quotes
      const fallbackQuote = getRandomQuote(category);
      setCurrentQuote(fallbackQuote);
      return fallbackQuote;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    currentQuote,
    isLoading,
    error,
    generateQuote,
  };
};