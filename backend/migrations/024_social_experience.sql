CREATE TABLE IF NOT EXISTS post_reactions(
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL CHECK(reaction IN('like','laugh','angry','sad')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(post_id,user_id)
);
CREATE INDEX IF NOT EXISTS post_reactions_post_idx ON post_reactions(post_id,updated_at DESC);
INSERT INTO post_reactions(post_id,user_id,reaction)
SELECT post_id,user_id,'like' FROM post_likes
ON CONFLICT(post_id,user_id) DO NOTHING;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMPTZ;
