import axios from 'axios';
import type { Quote } from '../types';
import { env } from '../config/env';

export class OpenAIService {
  private static API_URL = 'https://api.openai.com/v1/chat/completions';
  private static MODEL = 'gpt-4'; // Using GPT-4 for better dialect understanding

  private static async makeRequest(messages: any[], temperature = 0.7) {
    try {
      const response = await axios.post(
        this.API_URL,
        {
          model: this.MODEL,
          messages,
          temperature,
          max_tokens: 1000,
          presence_penalty: 0.6,
          frequency_penalty: 0.5,
        },
        {
          headers: {
            'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data.choices[0]?.message?.content;
    } catch (error) {
      console.error('OpenAI API Error:', error);
      throw new Error('Failed to generate content');
    }
  }

  static async generateDialectVariation(text: string, dialect: string): Promise<string> {
    const messages = [
      {
        role: "system",
        content: `You are an expert linguist specializing in ${dialect}. 
        Your task is to transform text into authentic ${dialect} while:
        1. Maintaining the original meaning and emotional impact
        2. Using genuine dialect-specific vocabulary and expressions
        3. Adapting grammar patterns typical of the dialect
        4. Preserving the motivational tone
        5. Ensuring natural flow and authenticity
        
        Important: The transformation should feel natural and authentic, not stereotypical or exaggerated.`
      },
      {
        role: "user",
        content: `Transform this motivational speech into authentic ${dialect}, maintaining its inspirational impact:

        "${text}"`
      }
    ];

    try {
      const variation = await this.makeRequest(messages, 0.8);
      if (!variation) throw new Error('No dialect variation generated');
      return variation;
    } catch (error) {
      console.error('Failed to generate dialect variation:', error);
      throw error;
    }
  }

  static async generateSpeech(params: {
    category: string;
    name?: string;
    goal?: string;
    keywords?: string[];
    dialect?: string;
  }): Promise<string> {
    const { category, name, goal, keywords, dialect } = params;

    const messages = [
      {
        role: "system",
        content: `You are a professional speech writer and dialect expert specializing in ${dialect || 'Standard English'}.
        Create an inspiring speech that:
        1. Uses authentic ${dialect || 'Standard English'} patterns and expressions
        2. Maintains a natural, conversational flow
        3. Incorporates cultural nuances appropriate to the dialect
        4. Delivers a powerful motivational message
        5. Feels personal and relatable`
      },
      {
        role: "user",
        content: `Generate an inspiring speech with these parameters:
        - Category: ${category}
        - Name: ${name || 'Friend'}
        - Goal: ${goal || 'achieving your dreams'}
        - Keywords: ${keywords?.join(', ') || 'motivation, success'}
        - Dialect: ${dialect || 'Standard English'}
        
        Make it personal, inspiring, and about 2-3 paragraphs long. Use authentic dialect patterns and expressions.`
      }
    ];

    try {
      const speech = await this.makeRequest(messages, 0.8);
      if (!speech) throw new Error('No speech generated');
      return speech;
    } catch (error) {
      console.error('Failed to generate speech:', error);
      throw error;
    }
  }

  // Other methods remain unchanged...
}