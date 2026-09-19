# Group 10 — CI / Supply Chain / Deploy Hardening

## Enforced by code

- Every GitHub Action reference is pinned to a full commit SHA.
- CI checks the exact checked-out commit against GITHUB_SHA; jobs must not reset to a moving origin/main.
- CodeQL scans JavaScript/TypeScript.
- Dependency policy: High/Critical fails CI; Moderate is reported as a warning.
- Secret scanning is current-tree, high-confidence, redacted-by-design: findings print only file, line, and rule.
- Static security scanning rejects production eval, new Function, production child_process, request-controlled filesystem paths, unsafe browser secret storage, visible unguarded admin routes, and dynamic SQL template interpolation except uppercase constant substitutions.
- Dependabot watches backend npm, frontend npm, and GitHub Actions.
- Production deploy requires an explicit immutable 40-character release SHA that must already be reachable from origin/main.
- SSH trust comes only from the pinned MARBO3A_DEPLOY_KNOWN_HOSTS secret; runtime ssh-keyscan is forbidden.
- The deploy workflow rejects root as the SSH user. Use a dedicated deployment account with only the permissions needed for /opt/marbo3a, Docker Compose, and the approved operational scripts.
- Rollback resets to the exact previous commit SHA and verifies the resulting HEAD.

## Repository settings still required from the owner

The connected GitHub integration can read repository state but cannot mutate administration settings. At Group 10 implementation time, the API reported main.protected=false and no repository rulesets.

Before Production release, enable protection for main in GitHub:

1. Require a pull request before merging.
2. Require the green checks: MARBO3A CI, MARBO3A Backend Foundation, MARBO3A Operations Contracts, and MARBO3A Security.
3. Block force pushes and branch deletion.
4. Require conversation resolution if available.
5. Keep the production Environment and configure required reviewer approval if the plan/account supports it.

## Required deployment secrets

- MARBO3A_DEPLOY_SSH_KEY
- MARBO3A_DEPLOY_HOST
- MARBO3A_DEPLOY_USER — must not be root.
- MARBO3A_DEPLOY_PATH — normally /opt/marbo3a.
- MARBO3A_DEPLOY_KNOWN_HOSTS — exact pinned known_hosts line(s) captured out-of-band from the trusted server console/provider, not with runtime ssh-keyscan.

Store the full OpenSSH known_hosts entry. Verify its fingerprint out-of-band when provisioning the secret.
