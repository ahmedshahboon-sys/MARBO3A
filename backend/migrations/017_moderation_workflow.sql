ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolution_action TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolution_note TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS moderation_actions(
  id BIGSERIAL PRIMARY KEY,
  report_id BIGINT REFERENCES reports(id) ON DELETE SET NULL,
  admin_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL,
  target_id BIGINT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS moderation_actions_report_idx ON moderation_actions(report_id,id DESC);
CREATE INDEX IF NOT EXISTS moderation_actions_target_idx ON moderation_actions(target_type,target_id,id DESC);
CREATE INDEX IF NOT EXISTS moderation_actions_admin_idx ON moderation_actions(admin_id,id DESC);
