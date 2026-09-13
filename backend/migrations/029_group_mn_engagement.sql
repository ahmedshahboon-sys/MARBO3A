CREATE TABLE IF NOT EXISTS polls(
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  closes_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poll_options(
  id BIGSERIAL PRIMARY KEY,
  poll_id BIGINT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  position SMALLINT NOT NULL DEFAULT 0,
  UNIQUE(poll_id,position)
);
CREATE INDEX IF NOT EXISTS poll_options_poll_idx ON poll_options(poll_id,position);

CREATE TABLE IF NOT EXISTS poll_votes(
  poll_id BIGINT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  option_id BIGINT NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(poll_id,user_id)
);
CREATE INDEX IF NOT EXISTS poll_votes_option_idx ON poll_votes(option_id);

CREATE TABLE IF NOT EXISTS saved_collections(
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS saved_collections_user_name_idx ON saved_collections(user_id,LOWER(name));
CREATE INDEX IF NOT EXISTS saved_collections_user_idx ON saved_collections(user_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS saved_collection_posts(
  collection_id BIGINT NOT NULL REFERENCES saved_collections(id) ON DELETE CASCADE,
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(collection_id,post_id)
);
CREATE INDEX IF NOT EXISTS saved_collection_posts_post_idx ON saved_collection_posts(post_id);

CREATE TABLE IF NOT EXISTS user_experience_preferences(
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  haptics_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  respect_reduced_motion BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS content_views(
  viewer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK(content_type IN('profile','post')),
  content_id BIGINT NOT NULL,
  viewed_on DATE NOT NULL DEFAULT CURRENT_DATE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(viewer_id,content_type,content_id,viewed_on)
);
CREATE INDEX IF NOT EXISTS content_views_owner_idx ON content_views(owner_id,content_type,viewed_at DESC);
CREATE INDEX IF NOT EXISTS content_views_content_idx ON content_views(content_type,content_id,viewed_at DESC);
