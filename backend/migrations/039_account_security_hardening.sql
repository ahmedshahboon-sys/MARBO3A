CREATE TABLE IF NOT EXISTS two_factor_recovery_codes(
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS two_factor_recovery_codes_user_hash_uq
  ON two_factor_recovery_codes(user_id,code_hash);

CREATE INDEX IF NOT EXISTS two_factor_recovery_codes_available_idx
  ON two_factor_recovery_codes(user_id,id)
  WHERE used_at IS NULL;
