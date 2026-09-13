CREATE TABLE IF NOT EXISTS admin_system_settings(
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO admin_system_settings(key,value,description) VALUES
 ('registration_enabled','true'::jsonb,'Allow new account registration and registration OTP'),
 ('rooms_enabled','true'::jsonb,'Allow room discovery, creation and joining'),
 ('upload_max_mb','8'::jsonb,'Maximum uploaded file size in megabytes'),
 ('story_lifetime_hours','24'::jsonb,'Story lifetime in hours'),
 ('pinned_post_limit','1'::jsonb,'Maximum pinned posts supported by the current profile model')
ON CONFLICT(key) DO NOTHING;

CREATE TABLE IF NOT EXISTS feature_flags(
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT NOT NULL DEFAULT '',
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO feature_flags(key,enabled,description) VALUES
 ('engagement',TRUE,'Streaks, trending, polls, memories, collections and analytics'),
 ('map',TRUE,'People map and location surfaces'),
 ('calls',TRUE,'Direct audio and video calls'),
 ('voice_rooms',TRUE,'Room voice features'),
 ('guest_explore',TRUE,'Guest/public explore surfaces')
ON CONFLICT(key) DO NOTHING;

CREATE TABLE IF NOT EXISTS admin_change_audit(
  id BIGSERIAL PRIMARY KEY,
  admin_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_state JSONB,
  after_state JSONB,
  reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_change_audit_created_idx ON admin_change_audit(created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS admin_change_audit_admin_idx ON admin_change_audit(admin_id,created_at DESC);

CREATE TABLE IF NOT EXISTS usage_sessions(
  session_key TEXT PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  visitor_key TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  page_views INTEGER NOT NULL DEFAULT 0,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS usage_sessions_user_idx ON usage_sessions(user_id,last_seen_at DESC);
CREATE INDEX IF NOT EXISTS usage_sessions_seen_idx ON usage_sessions(last_seen_at DESC);

CREATE TABLE IF NOT EXISTS usage_page_views(
  id BIGSERIAL PRIMARY KEY,
  session_key TEXT NOT NULL REFERENCES usage_sessions(session_key) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  path TEXT NOT NULL,
  view_bucket TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_key,path,view_bucket)
);
CREATE INDEX IF NOT EXISTS usage_page_views_created_idx ON usage_page_views(created_at DESC);
CREATE INDEX IF NOT EXISTS usage_page_views_path_idx ON usage_page_views(path,created_at DESC);

CREATE TABLE IF NOT EXISTS platform_login_events(
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'session',
  source_ref TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS platform_login_events_created_idx ON platform_login_events(created_at DESC);
CREATE INDEX IF NOT EXISTS platform_login_events_user_idx ON platform_login_events(user_id,created_at DESC);

CREATE OR REPLACE FUNCTION marbo3a_track_session_login() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO platform_login_events(user_id,source,source_ref,created_at)
  VALUES(NEW.user_id,'session',md5(NEW.token_hash),NEW.created_at)
  ON CONFLICT(source_ref) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS durable_sessions_login_event ON durable_sessions;
CREATE TRIGGER durable_sessions_login_event
AFTER INSERT ON durable_sessions
FOR EACH ROW EXECUTE FUNCTION marbo3a_track_session_login();

INSERT INTO platform_login_events(user_id,source,source_ref,created_at)
SELECT user_id,'session_backfill',md5(token_hash),created_at
FROM durable_sessions
ON CONFLICT(source_ref) DO NOTHING;

CREATE TABLE IF NOT EXISTS admin_anomaly_alerts(
  id BIGSERIAL PRIMARY KEY,
  alert_type TEXT NOT NULL,
  window_key TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK(severity IN('info','warning','critical')),
  metric_value NUMERIC NOT NULL DEFAULT 0,
  threshold_value NUMERIC NOT NULL DEFAULT 0,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','acknowledged')),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  UNIQUE(alert_type,window_key)
);
CREATE INDEX IF NOT EXISTS admin_anomaly_alerts_status_idx ON admin_anomaly_alerts(status,detected_at DESC);
