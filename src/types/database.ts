export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      speeches: {
        Row: {
          id: string
          user_id: string
          text: string
          voice_id: string
          audio_url: string | null
          created_at: string
          category: string | null
          name: string
          goal: string | null
          keywords: string[] | null
          language: string
          dialect: string
          soundtrack: string
        }
        Insert: {
          id?: string
          user_id: string
          text: string
          voice_id: string
          audio_url?: string | null
          created_at?: string
          category?: string | null
          name: string
          goal?: string | null
          keywords?: string[] | null
          language?: string
          dialect?: string
          soundtrack?: string
        }
        Update: {
          id?: string
          user_id?: string
          text?: string
          voice_id?: string
          audio_url?: string | null
          created_at?: string
          category?: string | null
          name?: string
          goal?: string | null
          keywords?: string[] | null
          language?: string
          dialect?: string
          soundtrack?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}