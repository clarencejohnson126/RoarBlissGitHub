import { Zap, TrendingUp, Crown, Brain, Sparkles, Briefcase } from 'lucide-react';

export const categories = [
  { id: 'success', icon: Zap, label: 'Success' },
  { id: 'growth', icon: TrendingUp, label: 'Growth' },
  { id: 'confidence', icon: Crown, label: 'Confidence' },
  { id: 'mindset', icon: Brain, label: 'Mindset' },
  { id: 'leadership', icon: Sparkles, label: 'Leadership' },
  { id: 'career', icon: Briefcase, label: 'Career' }
] as const;