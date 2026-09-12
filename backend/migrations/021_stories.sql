CREATE TABLE IF NOT EXISTS stories(
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN('text','image','video')),
  text_body TEXT NOT NULL DEFAULT '',
  media_url TEXT,
  media_type TEXT,
  privacy TEXT NOT NULL DEFAULT 'friends' CHECK(privacy IN('everyone','friends')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW()+INTERVAL '24 hours'),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS stories_active_idx ON stories(expires_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS stories_user_idx ON stories(user_id,id DESC);

CREATE TABLE IF NOT EXISTS story_views(
  story_id BIGINT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  viewer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(story_id,viewer_id)
);
CREATE INDEX IF NOT EXISTS story_views_story_idx ON story_views(story_id,viewed_at DESC);
