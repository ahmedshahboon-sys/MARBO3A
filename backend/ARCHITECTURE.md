# MARBO3A backend ownership

`server-v3.mjs` is the production composition root. New code must not patch `http.createServer`.

## Explicit domains

- `routes/auth-registration.mjs` — registration and verification entry flows.
- `routes/auth-session.mjs` — login, current session and logout/session ownership.
- `routes/core-social.mjs` — friends, search, notifications and core profile social actions.
- `routes/core-feed.mjs` — canonical smart/public feed, post reactions, threaded comments/replies and authenticated social-profile feed.
- `routes/core-stories.mjs` — canonical Stories & Media lifecycle: rail discovery, create/view/viewers, reactions/replies, mutes, highlights, expiry and safe owned-media cleanup.
- `routes/core-messaging.mjs` — direct conversation/message core API.
- `routes/core-calls.mjs` — canonical audio/video call lifecycle, signaling authorization and TURN/ICE configuration.
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

## Group 4 core social lifecycle — 2026-09-19

- `routes/core-feed.mjs` is the canonical owner for the smart authenticated feed, public feed, post reactions, threaded comments/replies, comment reactions and `/api/social/profile/:username`.
- The Group 4 migration retired the shadowed feed/profile registrations from `r1-core-experience.mjs`, `social-experience.mjs`, `feed-extensions.mjs`, `fgh-privacy-compat.mjs`, `guest-explore.mjs` and the obsolete `fgh-regression-hotfix.mjs` wrapper.
- Authenticated feed candidates now exclude disabled accounts and both directions of user blocks before ranking/pagination. Public feed candidates exclude disabled accounts before ranking.
- Direct post/deep-link interaction privacy remains fail-closed through `r1-safety.mjs` as defense in depth; inaccessible posts return `POST_NOT_FOUND` rather than leaking their existence.
- `routes/core-social.mjs` is the sole friend-removal owner and excludes blocked accounts from search, incoming/friend lists and suggestions.
- Social profile detail and mutual-friend endpoints reject blocked relationships; mutual-friend visibility follows `who_can_see_friends`; deleted posts cannot be re-pinned.
- `scripts/group4-social-lifecycle.mjs` exercises feed visibility, public IDs/deep links, block/privacy boundaries, reactions, threaded comments, saved visibility, pin cleanup and audited friend removal against a live CI database.

## Group 5 Stories & Media — 2026-09-19

- `routes/core-stories.mjs` is the single explicit owner for the Stories lifecycle. The historical `stories.mjs` wrapper and story registrations in `ijkl-experience.mjs` are retired.
- Story visibility is fail-closed across account privacy, per-story privacy, accepted friendships and bidirectional user blocks. Mutes remove accounts from the rail without mutating their content.
- Story creation accepts only MARBO3A-owned upload URLs, including date-segment storage paths, and validates image/video URL extensions against the declared media kind. Text stories always discard media fields.
- Video upload preserves real container-signature validation (MP4/MOV `ftyp`, WebM EBML) and discards invalid disk files.
- Reaction changes replace stale reaction notifications; deleting a reaction removes its notification. Story replies obey `who_can_reply_story` and deliver through direct messages.
- Non-highlighted expired stories are soft-deleted and their owned media is removed when it is not referenced elsewhere. Highlighted stories survive expiry; removing an expired highlight allows normal expiry cleanup.
- Manual story deletion transactionally clears highlights and story notifications, then removes orphaned owned media safely.
- `scripts/group5-stories-media.mjs` and the Group 5 frontend contract cover upload → create → privacy/block/mute → view/viewers → reaction/reply → highlight/expiry → delete, plus responsive viewer and Live rail integration.

## Group 6 Messaging & Calls — 2026-09-19

- `routes/core-messaging.mjs` is the single owner for room/direct message reads, rich sends, replies, attachments/voice notes, search, edit/delete and forwarding. The historical `direct-extensions.mjs` wrapper is retired.
- Direct sends re-check conversation membership, target account state, bidirectional block state, pending incoming message requests and `who_can_message` on every send, including already-existing conversations.
- Reply targets must belong to the same room/conversation and must not be deleted. Forwarding requires access to the source scope and authorization in the destination scope.
- `routes/core-calls.mjs` is the explicit owner for audio/video call creation, incoming/history/config, answer/decline/end/fail and SDP/ICE signaling. The historical `calls.mjs` wrapper is retired.
- Calls respect bidirectional blocks and `who_can_call` (everyone/friends/friends_of_friends/nobody). Signaling is accepted only while a call is active, offer/answer roles are enforced, and privacy/block rules are re-checked during signaling and signal reads.
- TURN credentials remain ephemeral. CI validates `TURN_EXTERNAL_IP` fallback URLs on both UDP and TCP port 3478 without exposing `TURN_SECRET`.
- `scripts/group6-messaging-calls.mjs` exercises text/rich/voice messaging, cross-conversation reply rejection, forwarding scope, pending requests, block/privacy changes, call roles, terminal signaling and TURN fallback against a live CI database.

