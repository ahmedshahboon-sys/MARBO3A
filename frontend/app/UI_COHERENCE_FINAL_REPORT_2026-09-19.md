# MARBO3A UI Coherence Master Repair — Final Closure Report

Date: 2026-09-19
PR: #103
Execution branch: `fix/ui-coherence-master-round`
Base main at start: `53974997ee9bf188aba3f2a39d03f0d239be8ffa`
Verified Group 10 head: `ddff4d2fd50fe7498bd11ab264a0c24c2e8c20f3`

## Final gate

The complete 0→10 repair sequence is closed with a green automated gate on the verified Group 10 head:

- MARBO3A CI run #855: success.
- Backend Foundation run #366: success.
- Operations Contracts run #284: success.
- Frontend build: success.
- Explicit frontend contract suite: success.
- Responsive browser matrix: success.
- Runtime Browser + PWA smoke: success.
- Generated PWA assets: success.
- Backend test suite, migration verification and API integration smoke: success.
- Foundation migrations/integration smoke: success.

## Visual/runtime coverage

Responsive geometry is checked in real headless Chrome at:

- 320×568
- 360×640
- 390×844
- 412×915
- 768×1024
- 1024×768
- 1366×768
- 1920×1080

The matrix runs in both Light and Dark with simulated phone safe areas.

The final runtime browser closure additionally starts the production Next build and checks public runtime surfaces for:

- horizontal overflow;
- console/runtime exceptions and hydration failure signals;
- same-origin missing/failed frontend assets;
- keyboard Tab entry into interactive content;
- basic form labeling;
- manifest/PWA assets;
- browser and standalone-mode behavior;
- service-worker registration contract/runtime capability.

## Functional regression evidence

Authenticated production credentials are intentionally not stored or exposed in CI. Therefore, the closure does not claim a live-user manual E2E session for every authenticated route.

Instead, regression coverage is provided by the existing backend/frontend suites that remain green, including contracts for:

- auth/session ownership and durable sessions;
- registration/login controls;
- posts/feed/comments/reactions;
- friend/social interactions;
- direct-message delivery/forwarding/reply ownership;
- call privacy, active-call signaling roles and TURN configuration;
- rooms, capacity, bans, invites, moderation hierarchy and scoped room messaging;
- voice presence/moderation/reconnect behavior;
- notifications/navigation contracts;
- settings/theme contracts;
- Admin control, advanced Admin policy, destructive-action reason/audit ordering;
- TV/Admin dangerous-action dialogs;
- PWA/guest/public route behavior.

Residual coverage gap: a post-deploy authenticated manual smoke with a disposable Test account remains useful for end-to-end camera/microphone permission behavior and real-device WebRTC media. This is a coverage limitation, not a known Critical/High defect.

## Groups completed

### Group 0 — baseline and CI
End checkpoint: `c2be0051a876a4c03fd34c6b2d8d250f5eb7b425`

Repaired pre-existing CI blockers without weakening production security behavior, including native TV deletion prompt, stale test matchers, durable-session smoke setup and historical migration-prefix handling.

### Group 1 — CSS ownership/design system
Start: `c2be0051a876a4c03fd34c6b2d8d250f5eb7b425`
End: `22bd567cceea99a3eedb4ed78ec8d40f64f10098`

Established shared-token ownership, namespace guards and documented compatibility debt.

### Group 2 — responsive geometry/safe areas
Start: `22bd567cceea99a3eedb4ed78ec8d40f64f10098`
End: `58ae39798225241d6772e288305bfc825cf8f629`

Unified app header/dock geometry, safe areas, visual viewport behavior, minimum interaction targets and the Chrome responsive matrix.

### Group 3 — overlays/stacking
Start: `58ae39798225241d6772e288305bfc825cf8f629`
End: `ea85a43de86577a4ca2817f802cc4cffef584fac`

Centralized z-index ladder, focus trap, Escape routing, focus restoration, scroll lock and critical overlay ordering.

### Group 4 — header/navigation/dock
Start: `ea85a43de86577a4ca2817f802cc4cffef584fac`
End: `31b0b8ed03f2dcf2db81ab2b8ce1c35d0fdd8487`

Made route policy the functional source of truth for global header/dock/drawer visibility and immersive live behavior.

### Group 5 — theme/font
Start: `31b0b8ed03f2dcf2db81ab2b8ce1c35d0fdd8487`
End: `4ce8daa61154d5518cfffcc2f0eac708d675555c`

Bootstrapped theme/font before first paint, made Readex explicit, and converted shared surfaces toward theme tokens with Light/Dark parity contracts.

### Group 6 — core social surfaces
Start: `4ce8daa61154d5518cfffcc2f0eac708d675555c`
End: `84a3bf3edea47ff40ee3381a102fdcc93846fa12`

Hardened core social page geometry and removed broad centering behavior that affected main surfaces.

### Group 7 — chat/rooms/voice/calls
Start: `84a3bf3edea47ff40ee3381a102fdcc93846fa12`
End: `003d978241a2362e9af9920d9fb03a778f7388af`

Aligned keyboard/VisualViewport behavior, scroll ownership, room voice controls and call visual viewport without changing WebRTC signaling/media logic.

### Group 8 — admin/settings/secondary
Start: `003d978241a2362e9af9920d9fb03a778f7388af`
End: `6da179225b253cc0efbc2320a27a914100610031`

Made Admin/Advanced/TV/Settings controls responsive and touch-safe while preserving permissions/APIs/destructive-action dialogs.

### Group 9 — temporary layer retirement
Start: `6da179225b253cc0efbc2320a27a914100610031`
End: `11afcad947323b7319b79163a8a9e6de6604f9c6`

Retired runtime global CSS injectors and obsolete visual layers. Global CSS imports moved from 66 to 64; runtime global-style injectors moved from 2 to 0. Guards prevent retired layers/runtime global CSS/legacy brand paths from returning.

### Group 10 — final validation/closure
Start: `11afcad947323b7319b79163a8a9e6de6604f9c6`
Verified end: `ddff4d2fd50fe7498bd11ab264a0c24c2e8c20f3`

Added explicit final frontend contracts, runtime production-build browser smoke, Console/Hydration/Network/Focus/PWA verification and closed all automated gates.

## Rollback map

Each group is a linear commit range. Safe source rollback is the checkpoint immediately before that group:

| Group | Roll back source to |
| --- | --- |
| 0 | `53974997ee9bf188aba3f2a39d03f0d239be8ffa` |
| 1 | `c2be0051a876a4c03fd34c6b2d8d250f5eb7b425` |
| 2 | `22bd567cceea99a3eedb4ed78ec8d40f64f10098` |
| 3 | `58ae39798225241d6772e288305bfc825cf8f629` |
| 4 | `ea85a43de86577a4ca2817f802cc4cffef584fac` |
| 5 | `31b0b8ed03f2dcf2db81ab2b8ce1c35d0fdd8487` |
| 6 | `4ce8daa61154d5518cfffcc2f0eac708d675555c` |
| 7 | `84a3bf3edea47ff40ee3381a102fdcc93846fa12` |
| 8 | `003d978241a2362e9af9920d9fb03a778f7388af` |
| 9 | `6da179225b253cc0efbc2320a27a914100610031` |
| 10 | `11afcad947323b7319b79163a8a9e6de6604f9c6` |

Database migrations in this round were not renamed. Historical applied migration filenames remain immutable.

## Remaining risk / deferred work

- No known Critical or High visual blocker remains in the automated closure matrix.
- `ui-v3-final-audit.css` remains as documented compatibility debt; it was not deleted merely to reduce file count.
- A disposable-account, real-device post-deploy smoke remains recommended for camera/mic permission prompts and real network WebRTC media.
- Production deployment was not performed by the repair branch itself.

## Merge/deploy condition

This report is intended to be merged only while the latest PR head remains green. Deployment must pull the resulting `main` commit, preserve production `.env`/persistent data, rebuild containers, and run health/smoke checks before considering Production updated.
