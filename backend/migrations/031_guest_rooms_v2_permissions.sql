-- Guest + Rooms V2 + Permissions Center foundation.
-- Additive only: no user content is deleted or rewritten.

CREATE TABLE IF NOT EXISTS guest_visitors(
  id BIGSERIAL PRIMARY KEY,
  guest_uuid TEXT NOT NULL UNIQUE,
  linked_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_ip INET,
  last_user_agent TEXT,
  device_type TEXT NOT NULL DEFAULT 'unknown',
  os_name TEXT NOT NULL DEFAULT 'unknown',
  browser_name TEXT NOT NULL DEFAULT 'unknown',
  visit_count INT NOT NULL DEFAULT 1,
  linked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS guest_visitors_last_seen_idx ON guest_visitors(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS guest_visitors_linked_user_idx ON guest_visitors(linked_user_id) WHERE linked_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS guest_activity(
  id BIGSERIAL PRIMARY KEY,
  guest_id BIGINT NOT NULL REFERENCES guest_visitors(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  path TEXT,
  room_id BIGINT REFERENCES rooms(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS guest_activity_guest_time_idx ON guest_activity(guest_id,created_at DESC);
CREATE INDEX IF NOT EXISTS guest_activity_room_time_idx ON guest_activity(room_id,created_at DESC) WHERE room_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS guest_room_presence(
  room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  guest_id BIGINT NOT NULL REFERENCES guest_visitors(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(room_id,guest_id)
);
CREATE INDEX IF NOT EXISTS guest_room_presence_live_idx ON guest_room_presence(room_id,last_seen DESC);

CREATE TABLE IF NOT EXISTS guest_room_voice_presence(
  room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  guest_id BIGINT NOT NULL REFERENCES guest_visitors(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(room_id,guest_id)
);
CREATE INDEX IF NOT EXISTS guest_room_voice_presence_live_idx ON guest_room_voice_presence(room_id,last_seen DESC);

CREATE TABLE IF NOT EXISTS guest_room_voice_signals(
  id BIGSERIAL PRIMARY KEY,
  room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  sender_user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  sender_guest_id BIGINT REFERENCES guest_visitors(id) ON DELETE CASCADE,
  recipient_user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  recipient_guest_id BIGINT REFERENCES guest_visitors(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN('offer','answer','ice')),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT guest_voice_one_sender CHECK((sender_user_id IS NOT NULL)::int + (sender_guest_id IS NOT NULL)::int = 1),
  CONSTRAINT guest_voice_one_recipient CHECK((recipient_user_id IS NOT NULL)::int + (recipient_guest_id IS NOT NULL)::int = 1)
);
CREATE INDEX IF NOT EXISTS guest_voice_to_user_idx ON guest_room_voice_signals(room_id,recipient_user_id,id) WHERE recipient_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS guest_voice_to_guest_idx ON guest_room_voice_signals(room_id,recipient_guest_id,id) WHERE recipient_guest_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS guest_voice_created_idx ON guest_room_voice_signals(created_at);

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS speaker_seat_count INT NOT NULL DEFAULT 8;
ALTER TABLE room_voice_presence ADD COLUMN IF NOT EXISTS seat_index INT;

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='rooms_speaker_seat_count_check') THEN
    ALTER TABLE rooms ADD CONSTRAINT rooms_speaker_seat_count_check CHECK(speaker_seat_count BETWEEN 1 AND 16);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='room_voice_presence_seat_index_check') THEN
    ALTER TABLE room_voice_presence ADD CONSTRAINT room_voice_presence_seat_index_check CHECK(seat_index IS NULL OR seat_index BETWEEN 1 AND 16);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS room_voice_active_seat_unique
  ON room_voice_presence(room_id,seat_index)
  WHERE seat_index IS NOT NULL AND role='speaker';
