-- Existing accounts pre-date onboarding. Mark them complete once; accounts created after deployment keep the default FALSE.
UPDATE users SET onboarding_completed=TRUE WHERE onboarding_completed=FALSE;
CREATE INDEX IF NOT EXISTS users_display_name_lower_idx ON users((LOWER(display_name)));
CREATE INDEX IF NOT EXISTS rooms_name_lower_idx ON rooms((LOWER(name)));
CREATE INDEX IF NOT EXISTS user_locations_city_lower_idx ON user_locations((LOWER(city)));
