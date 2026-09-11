CREATE TABLE IF NOT EXISTS debug_sessions(
  id UUID PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent TEXT,
  viewport TEXT,
  event_count INT NOT NULL DEFAULT 0,
  error_count INT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS debug_session_events(
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES debug_sessions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS debug_session_events_session_idx ON debug_session_events(session_id,id DESC);
