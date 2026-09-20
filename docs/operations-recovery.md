# MARBO3A database recovery objectives

This document defines recovery objectives and verification requirements. It is not a claim that a production backup exists until the server-side checks have passed.

## Objectives

- Database RPO target: **6 hours or less**, backed by the encrypted systemd backup timer.
- Database RTO target: **60 minutes or less** when the VPS, Docker runtime, PostgreSQL image, offsite backup mount, and age identity are available.
- Backup retention default: **14 days** for encrypted dumps and checksum manifests.
- Restore verification target: **weekly**, into a temporary isolated database only.
- Deployment rollback target: exact immutable previous Git SHA; rollback must never use a moving branch reference.

These are operational objectives, not an SLA. Actual RPO/RTO must be measured from production backup and restore drill timestamps.

## Required production configuration

`BACKUP_AGE_RECIPIENT` must be a valid public age recipient. `BACKUP_AGE_IDENTITY` must point to the private identity outside the repository. `BACKUP_OFFSITE_DIR` must point to a separately managed or mounted offsite destination. `BACKUP_REQUIRE_OFFSITE=true` is the production default.

A backup is successful only after encryption, checksum creation, offsite copy, and checksum verification of the copied encrypted object.

## Restore drill

`ops/verify-latest-backup.sh` selects the newest encrypted backup from the offsite destination and delegates to `ops/verify-backup-restore.sh`. The restore verifier decrypts to a temporary file, creates a temporary PostgreSQL database, restores into it, runs table/user sanity checks, drops the temporary database, and records a successful restore verification timestamp.

The verifier never targets the production database.

## Scheduling

- `marbo3a-backup.timer`: 00:15, 06:15, 12:15, 18:15 server local time, with randomized delay.
- `marbo3a-restore-drill.timer`: Sunday 03:30 server local time, with randomized delay.
- Timers are installed only by explicit execution of `ops/install-backup-schedule.sh`; repository changes do not modify the live server automatically.

## Release rollback

`ops/deploy-production.sh` requires an immutable release SHA and restores the exact previous SHA after a failed release. The application remains in maintenance mode if exact rollback cannot be proven. Database schema changes must therefore remain forward-safe; application rollback is not a database downgrade mechanism.

## Release gate evidence

Before a production release, record:

1. newest encrypted offsite backup timestamp;
2. newest successful restore drill timestamp;
3. backup timer and restore timer status;
4. measured restore drill duration;
5. exact release SHA;
6. exact rollback SHA.

A missing offsite backup or missing restore drill is a release blocker.
