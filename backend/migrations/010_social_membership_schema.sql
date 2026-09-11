ALTER TABLE users ADD COLUMN IF NOT EXISTS cover_url TEXT;
ALTER TABLE IF EXISTS user_settings ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'ar';

CREATE TABLE IF NOT EXISTS room_join_requests(
  id BIGSERIAL PRIMARY KEY,
  room_id BIGINT REFERENCES rooms(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(room_id,user_id)
);
DO $$ BEGIN
  ALTER TABLE room_join_requests ADD CONSTRAINT room_join_requests_status_check CHECK(status IN ('pending','accepted','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS room_join_requests_room_status_idx ON room_join_requests(room_id,status,id DESC);
