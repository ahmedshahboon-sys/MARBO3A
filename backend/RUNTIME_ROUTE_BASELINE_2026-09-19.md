# MARBO3A Group 0 — Runtime Route Ownership Baseline

Date: 2026-09-19  
Verified main baseline: `3456838e77e9c82e9c05f75871f7b8dba623e883`  
Composition root: `backend/server-v3.mjs`

## Result

The runtime-aware inventory found **387 route registrations** and **44 duplicate ownership keys** on the verified baseline.

Registration order is modeled from the real composition mechanism: the historical `http.createServer` wrappers execute in reverse bootstrap import order, then `server-v3.mjs` restores the native creator and registers the explicit route registry. Express first-match behavior makes the first registration the effective winner.

The compatibility allowlist is intentionally temporary. It freezes the exact owner set for every known duplicate. CI fails when:
- a new duplicate appears;
- an owner is added to an existing duplicate;
- an expected duplicate disappears without the allowlist being updated as part of an intentional migration;
- a runtime owner file disappears.

## Current duplicate ownership

| Route | Effective winner | Shadowed owners | Migration risk |
| --- | --- | --- | --- |
| `DELETE /api/account/sessions/:id` | `session-control.mjs` | `core-extensions.mjs` | HIGH |
| `DELETE /api/friends/:userId` | `closure-routes.mjs` | `routes/core-social.mjs` | NORMAL |
| `GET /api/account/sessions` | `session-control.mjs` | `core-extensions.mjs` | HIGH |
| `GET /api/admin/advanced/analytics` | `routes/stability-overrides.mjs` | `routes/group-o-admin.mjs` | NORMAL |
| `GET /api/admin/readiness` | `closure-routes.mjs` | `v1-social-extra.mjs`<br>`routes/core-admin-control.mjs` | HIGH |
| `GET /api/admin/system` | `core-extensions.mjs` | `routes/core-admin-control.mjs` | NORMAL |
| `GET /api/chats` | `message-media-fix.mjs` | `v1-social-extra.mjs`<br>`routes/fgh-social.mjs`<br>`routes/core-messaging.mjs` | HIGH |
| `GET /api/chats/:id/messages` | `message-media-fix.mjs` | `routes/core-messaging.mjs` | HIGH |
| `GET /api/feed` | `r1-core-experience.mjs` | `fgh-regression-hotfix.mjs`<br>`fgh-privacy-compat.mjs`<br>`feed-extensions.mjs` | NORMAL |
| `GET /api/feed/:id/comments` | `r1-core-experience.mjs` | `feed-extensions.mjs` | NORMAL |
| `GET /api/feed/:id/comments/preview` | `r1-core-experience.mjs` | `social-experience.mjs` | NORMAL |
| `GET /api/feed/:id/reactions` | `r1-core-experience.mjs` | `social-experience.mjs` | NORMAL |
| `GET /api/map/cities` | `real-map.mjs` | `security-p0.mjs`<br>`routes/core-location.mjs` | NORMAL |
| `GET /api/map/people` | `real-map.mjs` | `security-p0.mjs` | NORMAL |
| `GET /api/map/places` | `real-map.mjs` | `instrumentation.mjs` | NORMAL |
| `GET /api/public/feed` | `r1-core-experience.mjs` | `guest-explore.mjs` | NORMAL |
| `GET /api/rooms/:id/messages` | `message-media-fix.mjs` | `routes/core-messaging.mjs` | HIGH |
| `GET /api/rooms/:id/voice/state` | `r1-core-experience.mjs` | `room-voice.mjs` | REALTIME |
| `GET /api/social/profile/:username` | `fgh-regression-hotfix.mjs` | `fgh-privacy-compat.mjs`<br>`feed-extensions.mjs` | NORMAL |
| `GET /api/stories` | `ijkl-experience.mjs` | `stories.mjs` | NORMAL |
| `GET /api/typing/:kind/:scopeId` | `experience-v2.mjs` | `core-extensions.mjs` | REALTIME |
| `PATCH /api/admin/users/:id/status` | `audit-completion.mjs` | `session-control.mjs` | HIGH |
| `PATCH /api/rooms/:id/settings` | `ijkl-experience.mjs` | `core-extensions.mjs` | NORMAL |
| `POST /api/account/change-password` | `security-completion.mjs` | `core-extensions.mjs` | HIGH |
| `POST /api/account/logout-all` | `session-control.mjs` | `core-extensions.mjs` | HIGH |
| `POST /api/admin/reports/:id/action` | `audit-completion.mjs` | `core-extensions.mjs` | HIGH |
| `POST /api/auth/reset-password` | `security-completion.mjs` | `platform-extra.mjs` | HIGH |
| `POST /api/chats/with/:userId` | `release-hardening.mjs` | `routes/core-messaging.mjs` | HIGH |
| `POST /api/direct-messages/:id/forward` | `message-media-fix.mjs` | `routes/core-messaging.mjs` | HIGH |
| `POST /api/feed/:id/comments` | `r1-core-experience.mjs` | `feed-extensions.mjs` | NORMAL |
| `POST /api/invites/:token/redeem` | `ijkl-room-guard.mjs` | `core-extensions.mjs` | NORMAL |
| `POST /api/live/:id/join` | `routes/live-hardening.mjs` | `routes/live.mjs` | REALTIME |
| `POST /api/live/:id/messages` | `routes/live-hardening.mjs` | `routes/live.mjs` | REALTIME |
| `POST /api/live/:id/reactions` | `routes/live-hardening.mjs` | `routes/live.mjs` | REALTIME |
| `POST /api/live/:id/signals` | `routes/live-hardening.mjs` | `routes/live.mjs` | REALTIME |
| `POST /api/messages/:id/forward` | `message-media-fix.mjs` | `routes/core-messaging.mjs` | HIGH |
| `POST /api/profile/location` | `real-map.mjs` | `instrumentation.mjs` | NORMAL |
| `POST /api/reports` | `platform-extra.mjs` | `routes/auth-session.mjs` | NORMAL |
| `POST /api/rooms/:id/voice/heartbeat` | `r1-core-experience.mjs` | `room-voice.mjs` | REALTIME |
| `POST /api/rooms/:id/voice/join` | `r1-voice-preserve-mute.mjs` | `r1-core-experience.mjs`<br>`room-voice.mjs` | REALTIME |
| `POST /api/rooms/:id/voice/role` | `r1-core-experience.mjs` | `room-voice.mjs` | REALTIME |
| `POST /api/typing/:kind/:scopeId` | `experience-v2.mjs` | `core-extensions.mjs` | REALTIME |
| `POST /api/uploads` | `experience-v2.mjs` | `security-p0.mjs`<br>`core-extensions.mjs` | HIGH |
| `PUT /api/feed/:id/reaction` | `r1-core-experience.mjs` | `social-experience.mjs` | NORMAL |

## Group 1 priority queue

The following overlaps must be consolidated before the architecture can be considered safe:
- chats, direct-message and room-message ownership, especially both forward endpoints;
- `/api/chats/with/:userId`;
- account sessions and logout-all;
- password-reset/change-password ownership;
- admin readiness and high-risk admin moderation actions;
- generic upload ownership.

Realtime/voice/live duplicates are recorded here but are migrated/tested with their dedicated realtime groups unless a Group 1 ownership dependency requires earlier movement.

## Guard

Run locally:

```bash
cd backend
npm run test:routes
```

The command always writes a JSON inventory (default: `/tmp/marbo3a-runtime-route-inventory.json`) containing method, path, source file, registration order, current winner and duplicate owner list.

No Production behavior was changed by this baseline.
