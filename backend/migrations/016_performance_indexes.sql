CREATE INDEX IF NOT EXISTS user_sessions_user_last_idx ON user_sessions(user_id,last_seen DESC);
CREATE INDEX IF NOT EXISTS visitor_presence_last_seen_idx ON visitor_presence(last_seen DESC);
CREATE INDEX IF NOT EXISTS rtc_call_signals_created_idx ON rtc_call_signals(created_at);
CREATE INDEX IF NOT EXISTS room_voice_signals_created_idx ON room_voice_signals(created_at);
CREATE INDEX IF NOT EXISTS reports_reporter_created_idx ON reports(reporter_id,created_at DESC);
