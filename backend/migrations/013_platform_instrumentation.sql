ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS operation_logs(
  id BIGSERIAL PRIMARY KEY,
  level TEXT NOT NULL DEFAULT 'INFO',
  category TEXT NOT NULL DEFAULT 'API',
  action TEXT NOT NULL,
  user_id BIGINT,
  username TEXT,
  method TEXT,
  path TEXT,
  status_code INTEGER,
  duration_ms INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS operation_logs_created_idx ON operation_logs(id DESC);

CREATE TABLE IF NOT EXISTS debug_events(
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT,
  source TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'ERROR',
  message TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS debug_events_created_idx ON debug_events(id DESC);

CREATE TABLE IF NOT EXISTS user_settings(
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'dark',
  notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  notification_sounds BOOLEAN NOT NULL DEFAULT TRUE,
  language TEXT NOT NULL DEFAULT 'ar',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_broadcasts(
  id BIGSERIAL PRIMARY KEY,
  admin_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'info',
  duration_ms INTEGER NOT NULL DEFAULT 5000,
  sound BOOLEAN NOT NULL DEFAULT FALSE,
  action_label TEXT,
  action_url TEXT,
  target_type TEXT NOT NULL DEFAULT 'all',
  target_id BIGINT,
  persist_until TIMESTAMPTZ,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_broadcasts_created_idx ON admin_broadcasts(id DESC);
