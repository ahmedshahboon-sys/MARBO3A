-- MARBO3A TV foundation. Additive only.
CREATE TABLE IF NOT EXISTS tv_sources(
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'm3u' CHECK(kind IN('m3u','xtream')),
  base_url TEXT,
  username TEXT,
  password TEXT,
  m3u_url TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tv_channels(
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  logo_url TEXT,
  group_title TEXT,
  stream_url TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tv_channels_enabled_order_idx ON tv_channels(enabled,sort_order,id);
