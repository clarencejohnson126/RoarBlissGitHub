import { useState } from 'react';
import type { SpeechInput } from '../types';

const initialFormData: SpeechInput = {
  name: '',
  goal: '',
  keywords: [],
  speechSource: 'library',
  voice: 'tony-robbins',
  language: 'en',
  dialect: 'en-US',
  soundtrack: 'none',
  category: 'success',
};

export const useFormData = () => {
  const [formData, setFormData] = useState<SpeechInput>(initialFormData);

  const updateFormData = (updates: Partial<SpeechInput>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const resetForm = () => {
    setFormData(initialFormData);
  };

  return {
    formData,
    updateFormData,
    resetForm,
  };
};