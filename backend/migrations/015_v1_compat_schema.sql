CREATE TABLE IF NOT EXISTS durable_sessions(
  token_hash TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS durable_sessions_user_idx ON durable_sessions(user_id,expires_at DESC);

CREATE TABLE IF NOT EXISTS direct_message_reads(
  conversation_id BIGINT NOT NULL REFERENCES direct_conversations(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_message_id BIGINT,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(conversation_id,user_id)
);

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS pinned_message_id BIGINT;
CREATE INDEX IF NOT EXISTS room_members_user_room_idx ON room_members(user_id,room_id);
CREATE INDEX IF NOT EXISTS dm_conversation_sender_idx ON direct_messages(conversation_id,sender_id,id DESC);
CREATE INDEX IF NOT EXISTS users_search_idx ON users((LOWER(username)),(LOWER(display_name)));
