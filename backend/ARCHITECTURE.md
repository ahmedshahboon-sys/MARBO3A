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

## Group 0/1 ownership audit — 2026-09-15

The stability audit confirmed that compatibility wrappers can still shadow later explicit registrations because Express resolves matching routes in registration order. A route appearing in an explicit router therefore does not by itself prove runtime ownership.

Closed during this audit:

- `/api/notifications/unread-count` had duplicate compatibility registrations in `v1-social-extra.mjs` and `social-experience.mjs`. The later duplicate was retired; `v1-social-extra.mjs` is the single transitional owner until the notification domain is migrated explicitly. `tests/architecture.test.mjs` guards against reintroducing the duplicate.
- The comment-preview regression test no longer uses an unrelated notification route as a source-code boundary.

Known transitional overlaps that must not be deleted blindly:

- `/api/chats` exists in multiple historical/explicit layers with different response enrichment and privacy behavior. It requires a dedicated messaging-domain migration and runtime regression coverage before retirement of any owner.
- `/api/admin/readiness` exists in more than one compatibility layer with non-identical readiness checks. It requires an admin/operations-domain migration rather than route-order surgery.

Rules for the remaining migration:

1. Establish the current runtime winner and compare response/authorization semantics.
2. Move the desired behavior into one explicit domain owner.
3. Add integration/regression coverage for the complete response contract and authorization.
4. Remove only the now-shadowed registration, then retire the historical module only when all of its remaining routes have owners.
5. Never change bootstrap order merely to make a newer route win; ordering changes can alter middleware and security semantics across unrelated domains.
