-- MARBO3A live broadcasting metadata and transient interaction state.
CREATE TABLE IF NOT EXISTS live_sessions(
  id BIGSERIAL PRIMARY KEY,
  host_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','ended')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  peak_viewers INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS live_sessions_active_idx ON live_sessions(status,started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS live_one_active_per_host_idx ON live_sessions(host_id) WHERE status='active';

CREATE TABLE IF NOT EXISTS live_viewers(
  session_id BIGINT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(session_id,user_id)
);
CREATE INDEX IF NOT EXISTS live_viewers_seen_idx ON live_viewers(session_id,last_seen_at DESC);

CREATE TABLE IF NOT EXISTS live_signals(
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN('offer','answer','ice')),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS live_signals_recipient_idx ON live_signals(session_id,recipient_id,id);

CREATE TABLE IF NOT EXISTS live_messages(
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS live_messages_session_idx ON live_messages(session_id,id DESC);

CREATE TABLE IF NOT EXISTS live_reactions(
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS live_reactions_session_idx ON live_reactions(session_id,id DESC);
