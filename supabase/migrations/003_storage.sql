-- INFRA-02: Photo Upload Infrastructure
-- Creates storage buckets for avatars and event photos, and adds image_url to events.

-- Add image_url column to events table (needed by TF-04)
ALTER TABLE events ADD COLUMN image_url TEXT;

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('event-photos', 'event-photos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for avatars bucket
-- Files are stored as: avatars/{user_id}/{filename}
CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- RLS policies for event-photos bucket
-- Files are stored as: event-photos/{user_id}/{filename}
CREATE POLICY "Event photos are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'event-photos');

CREATE POLICY "Authenticated users can upload event photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'event-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own event photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'event-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
