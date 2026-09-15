-- Additive room-directory controls for the public home rail.
-- These flags do not alter room membership, visibility or message history.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS rail_pinned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS rail_hidden BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS rooms_public_rail_idx ON rooms(rail_hidden,rail_pinned,id DESC) WHERE visibility='public';
