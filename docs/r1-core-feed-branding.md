# R1 — Core Experience + Smart Feed + Branding

Scope completed on `feature/r1-core-feed-branding`:

- Smart feed ranking based on relationship, engagement, freshness, and seeded diversity.
- Sponsored post injection approximately every four organic posts, plus impression/click telemetry and admin campaign controls.
- Threaded comment replies and custom MARBO3A SVG reactions for posts and comments.
- Room voice recovery/reset path plus manager seat locks, forced mute/listener actions and kick controls.
- Marketplace coming-soon surfaces on Home, drawer navigation and a dedicated preview route.
- Canonical official brand mark wired to app chrome, PWA icon generation, OpenGraph and standalone maintenance gate.
- Additive database migration only; no destructive user-content migration.

Before Production deployment: merge through CI, deploy with the existing maintenance gate, apply migrations through the normal API startup path, then verify health, feed ranking, reactions/comments, voice navigation recovery, marketplace preview, brand assets and runtime logs.
