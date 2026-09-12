-- Username is a permanent account identity and must be unique regardless of letter case.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_ci_unique_idx ON users((LOWER(username)));
