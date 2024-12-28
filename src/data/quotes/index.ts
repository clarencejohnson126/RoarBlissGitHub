import { successQuotes } from './success';
import { growthQuotes } from './growth';
import { confidenceQuotes } from './confidence';
import { mindsetQuotes } from './mindset';
import { leadershipQuotes } from './leadership';
import { careerQuotes } from './career';

export const quotesByCategory = {
  success: successQuotes,
  growth: growthQuotes,
  confidence: confidenceQuotes,
  mindset: mindsetQuotes,
  leadership: leadershipQuotes,
  career: careerQuotes,
} as const;