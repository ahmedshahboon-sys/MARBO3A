# MARBO3A backend ownership

`server-v3.mjs` is the production composition root. New code must not patch `http.createServer`.

## Explicit domains

- `routes/auth-registration.mjs` — registration and verification entry flows.
- `routes/auth-session.mjs` — login, current session and logout/session ownership.
- `routes/core-social.mjs` — friends, search, notifications and core profile social actions.
- `routes/core-messaging.mjs` — direct conversation/message core API.
- `routes/core-rooms.mjs` — room membership/core room API.
- `routes/core-admin-rooms.mjs` — role-protected room administration.
- `routes/core-location.mjs` — core user location API.
- `routes/core-presence.mjs` — username availability and presence fallback API.
- `realtime.mjs` — the only Socket.IO server, realtime rooms, typing and realtime presence.
- `runtime.mjs` — the only long-lived PostgreSQL pool, Redis client, auth/session helpers and realtime emit access.

`routes/index.mjs` is the explicit route registry.

## Transitional compatibility registry

`bootstrap.mjs` contains historical modules whose filenames reflect delivery stages rather than domains. Their import order is frozen because some still register compatibility routes during the single boot-time registration pass. `server-v3.mjs` immediately restores Node's native `http.createServer` afterwards.

Do not add new stage/completion/hardening modules. Migrate a historical module only after its routes have explicit ownership and regression coverage; then remove it from `bootstrap.mjs` and delete it. `experience-stage1.mjs` and `realtime-v2.mjs` are the first retired modules under this rule.
