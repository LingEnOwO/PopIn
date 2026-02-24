-- Allow events with unlimited capacity (NULL) and set default capacity to 10 for limited events
ALTER TABLE events
  ALTER COLUMN capacity DROP NOT NULL,
  ALTER COLUMN capacity SET DEFAULT 10;

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_capacity_check;

ALTER TABLE events
  ADD CONSTRAINT events_capacity_check CHECK (capacity IS NULL OR capacity > 0);
