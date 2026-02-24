-- Allow null capacity to represent unlimited events
ALTER TABLE events ALTER COLUMN capacity DROP NOT NULL;
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_capacity_check;
ALTER TABLE events ADD CONSTRAINT events_capacity_check CHECK (capacity IS NULL OR capacity > 0);
