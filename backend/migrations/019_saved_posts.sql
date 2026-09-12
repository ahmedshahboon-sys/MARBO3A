CREATE TABLE IF NOT EXISTS post_saves(
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id,post_id)
);
CREATE INDEX IF NOT EXISTS post_saves_user_created_idx ON post_saves(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS post_saves_post_idx ON post_saves(post_id);
