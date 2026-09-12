CREATE TABLE IF NOT EXISTS social_identities(
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider IN('google','facebook')),
  provider_user_id TEXT NOT NULL,
  provider_email TEXT,
  provider_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS social_identities_provider_subject_uq ON social_identities(provider,provider_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS social_identities_user_provider_uq ON social_identities(user_id,provider);
CREATE INDEX IF NOT EXISTS social_identities_user_idx ON social_identities(user_id,id DESC);
