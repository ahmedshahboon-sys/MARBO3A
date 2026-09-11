ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_delete_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS room_invites(
  id BIGSERIAL PRIMARY KEY,
  room_id BIGINT REFERENCES rooms(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  max_uses INT NOT NULL DEFAULT 1,
  uses INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS room_invites_room_idx ON room_invites(room_id,expires_at DESC);

CREATE TABLE IF NOT EXISTS message_reactions(
  kind TEXT NOT NULL CHECK(kind IN('room','direct')),
  message_id BIGINT NOT NULL,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(kind,message_id,user_id,emoji)
);
CREATE INDEX IF NOT EXISTS reactions_message_idx ON message_reactions(kind,message_id);

CREATE TABLE IF NOT EXISTS message_pins(
  room_id BIGINT REFERENCES rooms(id) ON DELETE CASCADE,
  message_id BIGINT NOT NULL,
  pinned_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(room_id,message_id)
);

CREATE INDEX IF NOT EXISTS room_members_user_idx ON room_members(user_id,room_id);
CREATE INDEX IF NOT EXISTS room_bans_user_idx ON room_bans(user_id,room_id);
