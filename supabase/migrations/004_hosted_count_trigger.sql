-- INFRA: Auto-update hosted_count on profiles when events are created/deleted

CREATE OR REPLACE FUNCTION public.update_hosted_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles SET hosted_count = hosted_count + 1 WHERE id = NEW.host_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles SET hosted_count = GREATEST(hosted_count - 1, 0) WHERE id = OLD.host_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_event_created_or_deleted
  AFTER INSERT OR DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION public.update_hosted_count();

-- Backfill existing data
UPDATE profiles p
SET hosted_count = (
  SELECT COUNT(*) FROM events e WHERE e.host_id = p.id
);
