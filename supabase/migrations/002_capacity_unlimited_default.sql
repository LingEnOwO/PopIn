-- Make event capacity optional. NULL means unlimited.
ALTER TABLE events
  ALTER COLUMN capacity DROP NOT NULL,
  ALTER COLUMN capacity DROP DEFAULT;

-- Keep validation only when a finite capacity is provided.
ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_capacity_check;

ALTER TABLE events
  ADD CONSTRAINT events_capacity_check
  CHECK (capacity IS NULL OR capacity > 0);