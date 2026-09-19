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

Group 1 route-ownership consolidation — 2026-09-19:

- Messaging list/history/forwarding and chat creation now have one canonical owner in `routes/core-messaging.mjs`; the old message-media and release-hardening registrations were retired after runtime authorization coverage was added.
- Session list/revoke/logout-other-devices remain canonical in `session-control.mjs`; the older `core-extensions.mjs` registrations were retired.
- Password reset/change-password remain canonical in `security-completion.mjs`; their weaker compatibility copies were retired.
- Admin readiness/system use `routes/core-admin-control.mjs`; audited user-status/report actions use `audit-completion.mjs`.
- Generic upload ownership is `experience-v2.mjs`.
- Privacy v2 and the legacy `/api/privacy` path share the same full privacy model through `routes/fgh-social.mjs`.
- The CI route-ownership guard freezes every remaining compatibility duplicate by exact owner set and fails on undeclared additions or owner drift.

Rules for the remaining migration:

1. Establish the current runtime winner and compare response/authorization semantics.
2. Move the desired behavior into one explicit domain owner.
3. Add integration/regression coverage for the complete response contract and authorization.
4. Remove only the now-shadowed registration, then retire the historical module only when all of its remaining routes have owners.
5. Never change bootstrap order merely to make a newer route win; ordering changes can alter middleware and security semantics across unrelated domains.

## Group 2 security/session audit — 2026-09-15

Security/session rules established in this round:

- `durable_sessions` is the authority for session validity and absolute expiry. Redis `session:*` entries are a cache and must not extend a session beyond `durable_sessions.expires_at`.
- Session creation is fail-closed: a token is not usable unless its durable row is written successfully. Session destruction and security revocation delete durable authorization first, then clear Redis cache entries.
- `user_sessions` is device metadata only (user-agent/IP/history). It must not be used as the source of truth for deciding whether a session exists or is revocable.
- `/api/account/sessions`, `/api/account/sessions/:id` and `/api/account/logout-all` are owned by `session-control.mjs`; the former `core-extensions.mjs` duplicates were retired in Group 1.
- `/api/auth/reset-password` and `/api/account/change-password` are owned by `security-completion.mjs`; the former `platform-extra.mjs`/`core-extensions.mjs` copies were retired in Group 1.
- `/api/admin/users/:id/status` and report-driven moderation are owned by `audit-completion.mjs`; the older status/report-action handlers were retired. Its revocation path remains durable-first.
- `request-foundation.mjs` owns request-wide security middleware that must execute before compatibility routes: origin/CORS checks, rate limits and OAuth-session normalization.
- Password-reset verification and 2FA verification are bounded-attempt challenges. Password-reset request responses intentionally do not reveal whether the supplied email exists.

Remaining migration rule: retire an allowlisted compatibility duplicate only after its effective runtime behavior and authorization are preserved in the selected owner and covered by regression/runtime tests.
