CREATE TABLE IF NOT EXISTS post_media(
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS post_media_post_idx ON post_media(post_id,position,id);

DO $$ BEGIN
  ALTER TABLE rtc_calls DROP CONSTRAINT IF EXISTS rtc_calls_status_check;
  ALTER TABLE rtc_calls ADD CONSTRAINT rtc_calls_status_check CHECK(status IN ('ringing','answered','declined','ended','missed','cancelled','failed'));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS rtc_calls_user_created_idx ON rtc_calls(caller_id,created_at DESC);
CREATE INDEX IF NOT EXISTS rtc_calls_callee_created_idx ON rtc_calls(callee_id,created_at DESC);
CREATE INDEX IF NOT EXISTS rtc_calls_conversation_created_idx ON rtc_calls(conversation_id,created_at DESC);
