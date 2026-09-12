ALTER TABLE rtc_calls ADD COLUMN IF NOT EXISTS caller_heartbeat_at TIMESTAMPTZ;
ALTER TABLE rtc_calls ADD COLUMN IF NOT EXISTS callee_heartbeat_at TIMESTAMPTZ;
UPDATE rtc_calls SET caller_heartbeat_at=COALESCE(caller_heartbeat_at,created_at),callee_heartbeat_at=COALESCE(callee_heartbeat_at,answered_at) WHERE status IN('ringing','answered');
ALTER TABLE room_voice_presence ADD COLUMN IF NOT EXISTS speaking BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS room_voice_presence_live_idx ON room_voice_presence(room_id,last_seen DESC);
