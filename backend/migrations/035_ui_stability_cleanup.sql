-- MARBO3A UI stability cleanup.
-- Legacy imports used Unix epoch/very old values for unknown last-seen timestamps.
-- Treat those values as unknown so clients never render 1970-style presence dates.
UPDATE users
SET last_seen_at=NULL
WHERE last_seen_at IS NOT NULL
  AND last_seen_at < TIMESTAMPTZ '2020-01-01 00:00:00+00';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_last_seen_sane;
ALTER TABLE users
  ADD CONSTRAINT users_last_seen_sane
  CHECK(last_seen_at IS NULL OR last_seen_at >= TIMESTAMPTZ '2020-01-01 00:00:00+00')
  NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT users_last_seen_sane;
