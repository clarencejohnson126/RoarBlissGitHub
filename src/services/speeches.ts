import { supabase } from '../lib/supabase';
import type { SpeechInput } from '../types';

export class SpeechesService {
  static async createSpeech(speech: SpeechInput, audioUrl: string) {
    const { data, error } = await supabase
      .from('speeches')
      .insert({
        text: speech.customText || '',
        voice_id: speech.voice,
        audio_url: audioUrl,
        name: speech.name,
        goal: speech.goal,
        keywords: speech.keywords,
        category: speech.category,
        language: speech.language,
        dialect: speech.dialect,
        soundtrack: speech.soundtrack
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async getUserSpeeches() {
    const { data, error } = await supabase
      .from('speeches')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  static async getSpeech(id: string) {
    const { data, error } = await supabase
      .from('speeches')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  static async updateSpeech(id: string, updates: Partial<SpeechInput>) {
    const { data, error } = await supabase
      .from('speeches')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async deleteSpeech(id: string) {
    const { error } = await supabase
      .from('speeches')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
}