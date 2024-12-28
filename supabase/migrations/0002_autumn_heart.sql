/*
  # Create media storage bucket
  
  1. Creates a new public storage bucket for media uploads
  2. Sets up RLS policies for authenticated users
*/

-- Create the media bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Create policies
DO $$ 
BEGIN
  -- Allow authenticated users to upload files
  DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
  CREATE POLICY "Allow authenticated uploads"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'media');

  -- Allow authenticated users to update their own files
  DROP POLICY IF EXISTS "Allow authenticated updates" ON storage.objects;
  CREATE POLICY "Allow authenticated updates"
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (bucket_id = 'media' AND auth.uid() = owner);

  -- Allow public read access
  DROP POLICY IF EXISTS "Allow public read access" ON storage.objects;
  CREATE POLICY "Allow public read access"
    ON storage.objects
    FOR SELECT
    TO public
    USING (bucket_id = 'media');

  -- Allow authenticated users to delete their own files
  DROP POLICY IF EXISTS "Allow authenticated deletes" ON storage.objects;
  CREATE POLICY "Allow authenticated deletes"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (bucket_id = 'media' AND auth.uid() = owner);
END $$;