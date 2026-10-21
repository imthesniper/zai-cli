# Release readiness

Release: ZC 0.2.0. Review date: October 21, 2026.

## Evidence

The source baseline contains 235 regression tests and the macOS canonical-path repair. A first run on the new repository installed the actual pinned dependency on Linux, macOS, and Windows. It exposed a test expectation that assumed no runtime was installed; that expectation is now derived from installation health, while authentication must remain explicitly unverified by `doctor`.

The current Quality workflow is the authoritative CI result for each exact commit. It runs frontend checks, package installation and launcher tests, and actual runtime version verification. POSIX terminal exercises use synthetic sessions. Managed-installer checks use isolated runner homes; no personal account credentials are provided to CI.

Historical records under `VALIDATION-0.1.*` and `VALIDATION.md` describe their original build environments, not certification of this repository or later commits. Consult workflow logs rather than interpreting older test counts as new runs.

## Live Z.ai authentication validation, October 21, 2026

The project operator supplied sanitized output from a **Linux VPS** using a separate, private ZCode test profile. These are **operator-observed live results**, not tests that GitHub CI ran with personal credentials.

The initial positive run on the native implementation associated with `main` commit `428ead29` reported:

- Successful interactive Z.ai OAuth login for the configured account-backed `account:zai-individual-coding-plan/GLM-5.3` model.
- A successful authenticated response through the pinned upstream `native-stream` headless client.
- **Two consecutive successful authenticated responses** through ZC's default `native` app-server backend, using the pinned managed runtime.
- Successful deletion of the test profile's *local credentials file*. The old post-deletion check returned `UNCLASSIFIED_EXIT`, which was **not** accepted as evidence of revocation.

After [PR #13](https://github.com/imthesniper/zai-cli/pull/13) updated the test harness, the same operator resumed the already signed-out, private profile and reported:

- The redirected local credential file was absent; an independently responding native app-server catalog no longer exposed the account model as usable; and an authenticated upstream headless request failed. Together the test classified this as `LOCAL_ACCOUNT_ACCESS_BLOCKED`.
- A second fresh OAuth login completed.
- A subsequent **authenticated default-native model response** completed after re-login.
- The final temporary local credentials were cleared and the isolated profile cleaned up.

The above evidence spans **two continued runs and two implementation commits**, not one uninterrupted full-flow test under exactly the same tree. PR #13 changed the test harness and not the native model authentication integration.

**What this establishes:** on that tested account and Linux environment, native account login, repeated authenticated model access, removal of local account access, and restoration after re-login worked. The general README's authentication claims may mention this demonstrated lifecycle.

**What this does not establish:** Z.ai revoked its server-side OAuth tokens, a browser session was signed out, a token actually reached its expiry time, a new token was issued after expiry, or a multi-hour session survived expiry and network interruptions. Neither GitHub Actions nor this live flow tested automatic expiry-driven renewal.

### Related upstream test coverage

The pinned upstream public client `zcode-app-cli@3.15.3-37` includes [shared OAuth tests](https://github.com/kingsword09/zcode-cli/blob/v3.15.3-37/test/runtime/shared-oauth.test.ts) exercising per-model-request project-token resolution, account changes, invalidation after logout, and protected credential migration. Its [app-server auth tests](https://github.com/kingsword09/zcode-cli/blob/v3.15.3-37/test/runtime/app-server-auth.test.ts) check that standalone app-server turns use freshly rotated local credentials. These are **upstream fixture tests inspected in source**, not an observed live Z.ai token-expiry cycle and not tests executed by this repository's CI.

To validate actual automatic renewal, a separate controlled integration test would need to simulate expiry and verify successful reissuance through the real managed runtime without logging or altering personal credentials. Live proof would additionally require observing an authentic expiry/refresh transition, not merely waiting an arbitrary duration between successful requests. Until then, expiry-driven renewal remains unverified.

## New reproducible production acceptance tests (candidate)

The repository now includes `test/native-refresh-lifecycle.test.mjs` with a deliberately **fake, short-lived token issuer** and protocol server. It tests ZC's observable behavior when the issuer transparently renews or rejects a token: no prompt replay, no fallback billing and no credential leakage into emitted events. This is an isolated simulation. It does **not** execute the pinned upstream client's actual token refresh resolver and does not demonstrate a live token expiring.

The [production acceptance guide](PRODUCTION-GATES.md) also includes a new opt-in live test in a non-root disposable Docker container, intended for the operator to run with fresh Z.ai authorization. It checks a unique file read, exact file editing with unaffected sentinels, denial of the explicit YOLO/full-access escalation, cold session recovery with a conversation marker, and attempted cancellation. The runner refuses host execution and mounts no host directories. **These live coding results are pending until an operator supplies their output.**

The simulated expiry fixture, the Docker source and cross-platform CI are verification of test infrastructure, not a substitute for observed full editing/permission or real expiry-based renewal. Keep the release marked **integration preview** until the [remaining gates](#remaining-gates-for-a-stable-production-claim) are independently satisfied.

## Remaining gates for a stable production claim

- Live account-backed edit/test/deny/cancel/resume behavior through this exact packaged version.
- Token renewal and multi-hour operation under real network interruptions.
- Interactive Windows terminal and mouse/clipboard behavior across supported emulators.
- A third-party security review and OS-level isolation, neither of which this CLI supplies.

Earlier user sessions demonstrated account-backed file reads, follow-up history, resumed history, and native shell activity in 0.1.x. They do not establish these properties for every platform or every later build.

A repository push, a green CI matrix, and a completed model turn are different facts. This release remains an integration release until the outstanding live gates have evidence. There is no claim of an npm publication, code signing, unlimited subscription access, or unattended uptime.
