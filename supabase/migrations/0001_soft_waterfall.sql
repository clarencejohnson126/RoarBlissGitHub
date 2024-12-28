/*
  # Create speeches table and policies

  1. New Tables
    - `speeches`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `text` (text)
      - `voice_id` (text)
      - `audio_url` (text, nullable)
      - `created_at` (timestamptz)
      - `category` (text, nullable)
      - `name` (text)
      - `goal` (text, nullable)
      - `keywords` (text[], nullable)
      - `language` (text, default 'en')
      - `dialect` (text, default 'en-US')
      - `soundtrack` (text, default 'none')

  2. Security
    - Enable RLS on speeches table
    - Add policies for CRUD operations
*/

-- Create speeches table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'speeches') THEN
    CREATE TABLE speeches (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES auth.users NOT NULL,
      text text NOT NULL,
      voice_id text NOT NULL,
      audio_url text,
      created_at timestamptz DEFAULT now(),
      category text,
      name text NOT NULL,
      goal text,
      keywords text[],
      language text DEFAULT 'en',
      dialect text DEFAULT 'en-US',
      soundtrack text DEFAULT 'none'
    );
  END IF;
END $$;

-- Enable RLS if not already enabled
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'speeches' 
    AND rowsecurity = true
  ) THEN
    ALTER TABLE speeches ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Drop existing policies if they exist and create new ones
DO $$ 
BEGIN
  -- Read policy
  DROP POLICY IF EXISTS "Users can read own speeches" ON speeches;
  CREATE POLICY "Users can read own speeches"
    ON speeches
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

  -- Insert policy
  DROP POLICY IF EXISTS "Users can create speeches" ON speeches;
  CREATE POLICY "Users can create speeches"
    ON speeches
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

  -- Update policy
  DROP POLICY IF EXISTS "Users can update own speeches" ON speeches;
  CREATE POLICY "Users can update own speeches"
    ON speeches
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

  -- Delete policy
  DROP POLICY IF EXISTS "Users can delete own speeches" ON speeches;
  CREATE POLICY "Users can delete own speeches"
    ON speeches
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);
END $$;