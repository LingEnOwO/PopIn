-- Add new columns to profiles table
ALTER TABLE profiles ADD COLUMN major TEXT;
ALTER TABLE profiles ADD COLUMN year SMALLINT;
ALTER TABLE profiles ADD COLUMN interest_tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN avatar_url TEXT;
ALTER TABLE profiles ADD COLUMN hosted_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN attendance_rate REAL NOT NULL DEFAULT 0;
