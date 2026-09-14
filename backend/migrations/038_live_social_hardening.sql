-- MARBO3A live social hardening: moderation, slow mode and reports.
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS chat_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS slow_mode_seconds INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE live_sessions ADD CONSTRAINT live_slow_mode_range CHECK (slow_mode_seconds BETWEEN 0 AND 60);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS live_restrictions(
  session_id BIGINT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  can_chat BOOLEAN NOT NULL DEFAULT TRUE,
  blocked BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(session_id,user_id)
);

CREATE TABLE IF NOT EXISTS live_reports(
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  reporter_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT 'other',
  details TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id,reporter_id)
);

CREATE INDEX IF NOT EXISTS live_restrictions_blocked_idx ON live_restrictions(session_id,blocked);
CREATE INDEX IF NOT EXISTS live_reports_created_idx ON live_reports(created_at DESC);
