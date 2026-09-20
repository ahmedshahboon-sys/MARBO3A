# MARBO3A product feature truth

This document separates release-scope features from previews so the UI never implies functionality that is not available.

## Core release features

These are release-scope product surfaces and must keep a working UI-to-runtime contract:

- authentication and account access;
- profiles;
- feed, posts, media, comments and reactions;
- friends and discovery/search;
- notifications;
- direct messages and message requests;
- blocks and privacy;
- rooms and voice rooms;
- calls;
- live;
- reports and admin moderation;
- PWA manifest/service worker.

The Group 13 CI contract verifies the primary UI surfaces and their API/runtime markers. Deeper authorization, browser, realtime and E2E behavior remains covered by the dedicated security/runtime groups and the final E2E gate.

## Marketplace

Status: **Preview / Coming Soon**.

The current Marketplace route is informational only. There is no production claim of checkout, order placement, payment, wallet, merchant onboarding, fulfillment, or commerce readiness.

Required user-facing truth:

- navigation says **المتاجر · قريبًا**;
- home card says it is coming soon;
- Marketplace page carries a PREVIEW state;
- the page explicitly states that real selling and payment are not available now;
- Marketplace CTAs only explain the future plan and must not look like transactional actions.

Do not implement a full commerce system as part of this repair round unless it is separately scoped.

## Future / non-blocking features

The following are not release blockers and must not be described as completed:

- Passkeys/WebAuthn beyond any explicitly implemented account path;
- advanced commerce;
- full marketplace payments/wallet/fulfillment.

## Truth rule

A product surface must be one of:

1. implemented and wired to its runtime contract;
2. explicitly marked Preview / Coming Soon;
3. hidden from the primary experience.

No dead CTA, TODO/FIXME product surface, fake transaction button, or misleading readiness claim is allowed.
