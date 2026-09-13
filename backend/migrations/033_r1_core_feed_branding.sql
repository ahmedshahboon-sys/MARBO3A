-- R1: Smart feed, sponsored posts, threaded comments/reactions and room voice moderation.
-- Additive migration. No user content is deleted.

ALTER TABLE post_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id BIGINT REFERENCES post_comments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS post_comments_parent_idx
  ON post_comments(post_id,parent_comment_id,id ASC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS comment_reactions(
  comment_id BIGINT NOT NULL REFERENCES post_comments(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL CHECK(reaction IN('like','love','laugh','wow','sad','angry')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(comment_id,user_id)
);
CREATE INDEX IF NOT EXISTS comment_reactions_comment_idx
  ON comment_reactions(comment_id,updated_at DESC);

ALTER TABLE post_reactions DROP CONSTRAINT IF EXISTS post_reactions_reaction_check;
ALTER TABLE post_reactions
  ADD CONSTRAINT post_reactions_reaction_check
  CHECK(reaction IN('like','love','laugh','wow','sad','angry'));

CREATE TABLE IF NOT EXISTS sponsored_posts(
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'مموّل',
  destination_url TEXT,
  cta_label TEXT,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  weight INT NOT NULL DEFAULT 100 CHECK(weight BETWEEN 1 AND 1000),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(post_id)
);
CREATE INDEX IF NOT EXISTS sponsored_posts_active_idx
  ON sponsored_posts(active,starts_at,ends_at,weight DESC,id DESC);

CREATE TABLE IF NOT EXISTS sponsored_post_events(
  id BIGSERIAL PRIMARY KEY,
  sponsored_post_id BIGINT NOT NULL REFERENCES sponsored_posts(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  guest_uuid TEXT,
  event_type TEXT NOT NULL CHECK(event_type IN('impression','click')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sponsored_post_events_campaign_idx
  ON sponsored_post_events(sponsored_post_id,event_type,created_at DESC);
CREATE INDEX IF NOT EXISTS sponsored_post_events_user_idx
  ON sponsored_post_events(user_id,created_at DESC)
  WHERE user_id IS NOT NULL;

ALTER TABLE room_voice_presence
  ADD COLUMN IF NOT EXISTS forced_muted BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS room_voice_seat_locks(
  room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  seat_index INT NOT NULL CHECK(seat_index BETWEEN 1 AND 16),
  locked_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(room_id,seat_index)
);
