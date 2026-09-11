ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE users SET role='admin' WHERE LOWER(username)='ahmed' AND role<>'admin';
DO $$ BEGIN ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('user','moderator','admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS user_mutes(
  muter_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  muted_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(muter_id,muted_id),
  CHECK(muter_id<>muted_id)
);
CREATE TABLE IF NOT EXISTS account_security_events(
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS account_security_events_user_idx ON account_security_events(user_id,id DESC);
