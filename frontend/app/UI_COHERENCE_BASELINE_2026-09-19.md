# MARBO3A UI coherence repair — Group 0 baseline

Date: 2026-09-19
Execution branch: `fix/ui-coherence-master-round`
Base/origin-main SHA: `53974997ee9bf188aba3f2a39d03f0d239be8ffa`
Base commit: `Sync production server changes 2026-09-19`

## Repository state

- Default branch: `main`.
- The execution branch was created from the exact current `origin/main` SHA above.
- No production deployment or `main` mutation is part of Group 0.
- This execution context operates through the GitHub repository API rather than a local checked-out worktree, so a literal local `git status` is not available. The branch was created directly from the current main SHA with no divergence at creation.
- Rollback point: `53974997ee9bf188aba3f2a39d03f0d239be8ffa`.

## Frontend baseline commands

`frontend/package.json` exposes:
- `npm run build` -> `next build`.
- `prebuild` -> PWA generation plus route, interaction, style-ownership, group, brand, design, live-entry and deep-repair contracts.
- `npm run test:contracts` -> the same contract suite without the Next build.
- No lint script is currently defined.

The repository CI runs `npm ci --no-audit --no-fund` and `npm run build` for the frontend. The CI workflow is triggered for pull requests targeting `main`; Group 0 uses that path so the baseline is tested without touching production.

## Global stylesheet baseline

`frontend/app/layout.js` imports **66 global CSS files** in a fixed order.

The current final cascade tail is:
1. `ui-v3-unified-scale.css`
2. `ui-contract-lock.css`
3. `ui-contract-additions.css`

`verify-style-ownership.mjs` currently enforces that tail and reports the number of ordered layers, but it does not yet prevent protected token redefinition across owners.

## Current ownership map for the repair round

| Domain | Current/final owner for this round | Notes |
| --- | --- | --- |
| Tokens / Theme | `design-system.css` | Owns `--ui-font`, color tokens, typography scale, control heights, radii, shadows and light/dark tokens. |
| Header geometry | `ui-v3-unified-scale.css` -> migrate toward central app tokens | Current `--app-header-h` is 58px base / 56px <=430px. Legacy `--v3-header-h` remains in compatibility files. |
| Bottom Dock geometry | `ui-v3-unified-scale.css` -> migrate toward central app tokens | Current `--app-dock-h` is 62px base / 60px <=430px. Legacy `--v3-dock-h` remains in compatibility files. |
| Buttons / Inputs | `design-system.css` | Current product contract is 44px controls; later route layers still override smaller sizes. |
| Feed | `social-feed.css` + V3 route layers, with shared tokens from design system | Consolidation deferred to later groups. |
| Rooms | `ui-v3-room-community.css` / `room-chat.css` / `room-voice.css` | Geometry still depends on compatibility/final layers. |
| Direct Chat | `chat-social.css` / `ui-v3-chat.css` | `responsive-round.css` currently applies final viewport geometry. |
| Settings / Dialogs | `ui-v3-settings.css` + shared dialog rules | Runtime fixes still exist in `InterfaceFixes.js`. |
| Profile | `ui-v3-profile.css` | Runtime visual fixes still exist in `InterfaceFixes.js`. |
| Admin | `ui-v3-admin.css` / `r1-admin.css` | Final cleanup deferred. |
| Calls / Media Viewer | `calls.css` plus route/component-specific styles | Needs centralized z-index ownership in Group 3. |

## Confirmed sensitive conflicts before modification

### Header / dock variables

Legacy values are simultaneously present:
- `ui-v3.css`: `--v3-header-h:112px`, `--v3-dock-h:116px`.
- `ui-v3-reference.css`: `--v3-header-h:72px`, `--v3-dock-h:78px`.
- `ui-v3-mobile-parity.css` <=720px: `--v3-header-h:82px`, `--v3-dock-h:94px`.
- `ui-v3-unified-scale.css`: `--app-header-h:58px`, `--app-dock-h:62px`; <=430px becomes 56px / 60px.

This confirms two competing geometry families (`--v3-*` and `--app-*`) before Group 1/2 consolidation.

### Protected design tokens

- `--ui-font` is defined in `design-system.css` as the product font token.
- `--ui-accent` is defined in `design-system.css`; downstream files consume it.
- Existing ownership verification checks import order and required layers, but does not yet enforce single-definition ownership for protected tokens.

### Runtime/global styling

`InterfaceFixes.js` injects a large global style block at runtime, including settings overlay, search focus, chat bubbles, profile actions/QR, lightbox, messages/friends/profile polish and responsive overrides. It also contains many `!important` declarations and fixed dark color values. No rule is moved or removed in Group 0.

## Baseline risk observations

- 66 global CSS imports create a large cascade surface.
- Legacy and final geometry tokens coexist with materially different values.
- The current final scale still contains some interactive controls below the 44px design-system contract (for example 34px header actions and 36px dialog buttons), which must be resolved later without changing behavior in Group 0.
- Runtime CSS in `InterfaceFixes.js` remains a second styling authority.
- `STYLE_OWNERSHIP.md` documents compatibility layers, but ownership enforcement is currently narrower than the new repair brief requires.

## Group 0 success criteria

Group 0 is complete only when:
1. the branch is based on the recorded current main SHA;
2. the baseline document is committed;
3. a PR to `main` triggers CI;
4. frontend dependency install/build/contracts complete successfully, or any pre-existing failure is recorded before UI changes begin.

No UI behavior, API, database, route, permission or production configuration is changed by this baseline commit.
