# Group 14 — Full E2E QA Matrix

Group 14 is the release-validation layer. Source contracts are useful, but they do not prove browser, network, media, database, PWA, or cross-user behavior.

## Status vocabulary
- PASS — executed successfully against the candidate release.
- FAIL — executed and failed; release blocker until classified/fixed.
- BLOCKED — environment/account/device dependency unavailable.
- NOT_RUN — no runtime execution evidence yet.

Never convert NOT_RUN/BLOCKED into PASS from source inspection alone.

## Required environments
1. Candidate stack with PostgreSQL, Redis, API, web, gate and Coturn.
2. Two normal users plus one admin test account.
3. Two real devices/browsers on different networks for calls and room/live media.
4. Android Chromium and iPhone Safari/PWA for install/update/push lifecycle.
5. A controlled backup destination and age identity for restore drill.

## Lifecycle matrix
| Area | Required E2E proof | Initial status |
|---|---|---|
| Auth/session | register/login/logout, expired/revoked session, password reset, 2FA, account restriction | NOT_RUN |
| Theme/UI | light/dark/system, RTL, mobile/desktop layout, approved logo, notification badge | NOT_RUN |
| Social | create/edit/delete post, privacy, block, comments/replies/reactions, saves, pin | NOT_RUN |
| Stories/media | image/video upload, fake MIME rejection, view/viewers, reaction/reply, delete/highlight | NOT_RUN |
| Messaging | direct chat, reply, forward, realtime delivery, voice note send/cancel, deleted source | NOT_RUN |
| Calls | audio/video both directions, offer/answer/ICE roles, block/privacy, TURN relay on different networks | BLOCKED |
| Rooms | join/request/invite, capacity/ban, messages/replies, pins/search/read/typing, moderation hierarchy | NOT_RUN |
| Room voice | join/speaker/listener, mute/kick/ban, reconnect, stale cleanup, two-network media | BLOCKED |
| Live | create/start/discover/watch/chat/reaction/moderation/end/reconnect/privacy/cross-live isolation | NOT_RUN |
| Map | city/precise sharing on/off, invalid coordinates, block/privacy, map feature flag | NOT_RUN |
| Admin | permissions, freeze/ban/revoke, settings/flags, maintenance, debug/operation logs | NOT_RUN |
| TV | list/detail/playback authorization, media errors, responsive player lifecycle | NOT_RUN |
| Guest | guest explore/profile/post/room boundaries, forbidden writes, transition to auth | NOT_RUN |
| PWA | installability, standalone launch, service-worker update, offline shell, push subscribe/unsubscribe | BLOCKED |
| Performance | representative feed/chat/notifications load, slow-request telemetry, DB EXPLAIN/ANALYZE | NOT_RUN |
| Backup/restore | encrypted offsite copy, checksum, isolated restore, key separation | BLOCKED |

## P0 release blockers
- Any auth/session bypass or privacy/block bypass.
- Cross-chat, cross-room, cross-live or cross-user data access.
- Data-loss/corruption during normal lifecycle.
- Calls advertised as ready without two-device/two-network audio/video proof.
- Backup advertised as offsite/verified without a real encrypted external copy and restore drill.
- PWA advertised as install/update/push complete without device proof.

## Execution record
For every runtime test capture: candidate commit, UTC timestamp, environment, account roles (never passwords/tokens), device/browser, network class, steps, expected result, actual result, request ID/error code, and PASS/FAIL/BLOCKED.

## Current Group 14 evidence
This branch only establishes the executable QA harness/contracts and the matrix. CI is intentionally paused by project-owner instruction. No Production deployment is authorized. Therefore all runtime rows remain NOT_RUN/BLOCKED until executed in an authorized candidate environment.
