-- Set unlimited capacity (NULL) as the default for new events
-- 0 remains disallowed by the existing CHECK constraint: capacity IS NULL OR capacity > 0
ALTER TABLE events
  ALTER COLUMN capacity SET DEFAULT NULL;
