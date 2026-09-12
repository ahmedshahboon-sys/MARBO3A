ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS location_label VARCHAR(120);

CREATE INDEX IF NOT EXISTS idx_posts_location_label
  ON posts (location_label)
  WHERE location_label IS NOT NULL AND location_label <> '';
