# MARBO3A UI Coherence — Group 9 Retirement Report

Date: 2026-09-19

Baseline for Group 9: `6da179225b253cc0efbc2320a27a914100610031`
Retirement checkpoint before this report: `988e2dbbdb6b796bddf4190094e7a0a3c1d99194`

## Before / After

| Metric | Before | After | Result |
| --- | ---: | ---: | --- |
| Global CSS imports in `app/layout.js` | 66 | 64 | -2 layers |
| Runtime global-style injectors | 2 | 0 | `InterfaceFixes` and `UiRoundFixes` retired |
| Total loaded style sources | 68 | 64 | -4 sources |
| Imported CSS bytes | 601,821 | 631,863 | +30,042 bytes because runtime rules moved into owned CSS |
| Runtime style-source JS bytes | 30,549 | 0 | -30,549 bytes |
| Approx. combined styling-source footprint | 632,370 | 631,863 | -507 bytes |
| `!important` declarations across loaded styling | 8,888 | 8,883 | -5 |
| Protected token definitions | 6 | 6 | ownership preserved |

The CSS-only byte count rose because visual rules that were previously injected from React were moved into the owned final CSS cascade. The combined styling source footprint still decreased slightly, while the number of independent cascade/runtime sources decreased materially.

## Retired files

- `app/InterfaceFixes.js` — runtime global CSS injection removed after its selectors moved to owned CSS.
- `app/UiRoundFixes.js` — runtime visual-repair injection removed after its selectors moved to owned CSS.
- `app/ui-contract-additions.css` — merged into `ui-contract-lock.css`; separate final-tail layer no longer required.
- `app/r1-brand-override.css` — legacy asset rewrite removed after remaining Auth/room references were changed to the approved PNG directly.

## Guardrails added

`verify-style-ownership.mjs` now rejects:

- return of any retired visual file above;
- runtime `<style jsx global>` inside application JavaScript;
- legacy brand asset paths in application JS/JSX/CSS;
- regression above 64 global CSS imports;
- new repair/fix/final/override filenames except the still-grandfathered `ui-v3-final-audit.css`.

## Intentionally retained compatibility debt

`ui-v3-final-audit.css` remains loaded for now. It still contains route-specific compatibility selectors whose removal requires route-by-route visual proof. Removing it only to improve the file count would violate the minimum-safe-fix rule.

## Functional scope

No API, database, permissions, WebRTC signaling, room logic, messaging logic or authentication behavior was intentionally changed by this retirement work.
