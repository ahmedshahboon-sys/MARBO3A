ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pinned_post_id BIGINT REFERENCES posts(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE profile_privacy ADD COLUMN IF NOT EXISTS birth_visibility TEXT NOT NULL DEFAULT 'age' CHECK(birth_visibility IN('full','age','hidden'));
ALTER TABLE profile_privacy ADD COLUMN IF NOT EXISTS who_can_see_posts TEXT NOT NULL DEFAULT 'everyone' CHECK(who_can_see_posts IN('everyone','friends','friends_of_friends','nobody'));
ALTER TABLE profile_privacy ADD COLUMN IF NOT EXISTS who_can_see_story TEXT NOT NULL DEFAULT 'everyone' CHECK(who_can_see_story IN('everyone','friends','friends_of_friends','nobody'));
ALTER TABLE profile_privacy ADD COLUMN IF NOT EXISTS who_can_reply_story TEXT NOT NULL DEFAULT 'friends' CHECK(who_can_reply_story IN('everyone','friends','friends_of_friends','nobody'));
ALTER TABLE profile_privacy ADD COLUMN IF NOT EXISTS who_can_call TEXT NOT NULL DEFAULT 'friends' CHECK(who_can_call IN('everyone','friends','friends_of_friends','nobody'));
ALTER TABLE profile_privacy ADD COLUMN IF NOT EXISTS who_can_see_friends TEXT NOT NULL DEFAULT 'friends' CHECK(who_can_see_friends IN('everyone','friends','friends_of_friends','nobody'));
ALTER TABLE profile_privacy ADD COLUMN IF NOT EXISTS who_can_invite_room TEXT NOT NULL DEFAULT 'friends' CHECK(who_can_invite_room IN('everyone','friends','friends_of_friends','nobody'));
ALTER TABLE profile_privacy ADD COLUMN IF NOT EXISTS show_online BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE profile_privacy ADD COLUMN IF NOT EXISTS read_receipts BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE profile_privacy ADD COLUMN IF NOT EXISTS message_requests_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS message_requests(
  id BIGSERIAL PRIMARY KEY,
  requester_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK(requester_id<>recipient_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS message_requests_pair_idx ON message_requests(requester_id,recipient_id);
CREATE INDEX IF NOT EXISTS message_requests_recipient_idx ON message_requests(recipient_id,status,id DESC);

CREATE TABLE IF NOT EXISTS user_badges(
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge TEXT NOT NULL CHECK(badge IN('verified','admin','veteran','active')),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id,badge)
);

INSERT INTO user_badges(user_id,badge)
SELECT id,'admin' FROM users WHERE role='admin'
ON CONFLICT DO NOTHING;

INSERT INTO user_badges(user_id,badge)
SELECT id,'verified' FROM users WHERE verified=TRUE
ON CONFLICT DO NOTHING;
