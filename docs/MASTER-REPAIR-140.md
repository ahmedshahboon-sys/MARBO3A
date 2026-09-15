# MARBO3A Master Repair 140

Status: active repair round started 2026-09-15.
Base: 29ed2c3379b96581103b4ef1aee2244d344fc1cd.

Rules:
- Preserve existing behavior and official identity.
- Minimum safe fixes; no feature deletion for convenience.
- UI contract tail remains ui-v3-unified-scale.css -> ui-contract-lock.css -> ui-contract-additions.css.
- GitHub Actions intentionally not used while Actions are paused.
- Runtime-only claims (WebRTC/PWA/backup/device behavior) remain NEEDS RUNTIME VALIDATION until proven on the required environment.

Repair groups:
1. UI geometry, touch targets, typography, dialogs, icons, responsive, RTL, states and z-index.
2. Messaging ordering, voice notes/uploads, realtime/reconnect and multi-tab safety.
3. Map sequencing/presence/privacy and external-media fallback.
4. Stories, notifications/deep links, rooms and live lifecycle.
5. Calls/room voice/live WebRTC hardening plus runtime validation gates.
6. TV media compatibility/fallback.
7. Auth/session/privacy/security/IDOR/rate-limit/upload/XSS audits.
8. PWA cache/update/install/device validation.
9. Admin/debug/route ownership/observability.
10. Performance/database/media optimization.
11. Backup/offsite/restore operational gates.
12. Marketplace remains a separately scoped incomplete product area; do not fake completion without implementing its actual product/order/payment requirements.
13. Full route/button/state/deep-link/network/regression matrix.

This file is a repair ledger, not proof that runtime-only items are complete.
