-- Push Notification Support
-- Adds expo_push_token to profiles and reminder_sent_at to events

-- Add expo_push_token column to profiles (nullable, set by the client after permissions granted)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS expo_push_token TEXT;

-- Add reminder_sent_at to events for idempotent 15-minute reminders
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- Index to efficiently find events that need a reminder (used by event-reminders cron function)
CREATE INDEX IF NOT EXISTS idx_events_reminder
  ON events (start_time, status, reminder_sent_at);
