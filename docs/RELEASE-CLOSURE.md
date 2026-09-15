# MARBO3A Release Closure

## Candidate identity
A release candidate is exactly one immutable Git commit. Record its full SHA before any runtime validation. Do not validate one SHA and deploy another.

## Release states
- SOURCE_READY — Groups 0–15 source scope and release tooling are present.
- E2E_PENDING — one or more Group 14 runtime rows are NOT_RUN/BLOCKED.
- RELEASE_CANDIDATE — all P0 Group 14 rows have real PASS evidence for this exact SHA.
- PRODUCTION_READY — release candidate plus encrypted offsite backup/restore proof, rollback revision, production secrets/config preflight and explicit owner deployment approval.
- RELEASED — exact approved SHA deployed and post-deploy smoke/health checks passed.

The repository must never claim PRODUCTION_READY or RELEASED from source inspection, an open PR, or a successful build alone.

## Mandatory gates
1. Stacked PR chain is integrated in order or intentionally flattened with equivalent diff review.
2. CI may remain paused while the owner has it disabled; this is an explicit unresolved release gate, not a PASS.
3. Group 14 matrix has real PASS evidence for P0 auth/privacy/data-integrity paths.
4. Calls and Room Voice have two-user/two-device/two-network audio/media evidence including TURN/ICE selected-pair evidence.
5. PWA install/update/offline/push is proven on Android and iPhone.
6. Database migration plan is reviewed; concurrent index migration is executed outside a transaction.
7. Encrypted offsite backup exists and isolated restore verification passes.
8. Rollback target is known and recoverable.
9. Production environment contains non-placeholder DB, TURN, VAPID/OAuth and backup configuration as applicable.
10. Owner explicitly authorizes Production deployment.

## Post-deploy acceptance
For the exact deployed SHA: public home, `/api/health`, maintenance state, auth boundary, representative authenticated social/chat flow, realtime connectivity, TURN health, database/Redis health, operation-log request IDs, disk capacity and service status must be checked. Any P0 regression triggers rollback/maintenance rather than a release-ready claim.

## Current status
SOURCE_READY after Group 15 source closure.
E2E_PENDING because Group 14 runtime/device/network evidence has not been executed in an authorized candidate environment and CI is intentionally paused.
PRODUCTION_READY: NO.
RELEASED: NO.
