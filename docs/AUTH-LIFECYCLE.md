# Live authentication lifecycle test

This is an **opt-in, interactive** test. It makes real Z.ai model requests and consumes your account quota. Automated CI does **not** log into your account.

The login URL is dynamically created by the official ZCode runtime for each OAuth attempt. A static URL from GitHub or this chat cannot complete a login. Run the command below in your own terminal and open the URL printed there **privately**.

## Prerequisites

- Node.js 24.14 or later
- A Git checkout of this repository
- An interactive terminal (for SSH, keep the SSH session open)
- Internet access to npm and Z.ai
- An account entitled to the selected model

From the repository root:

```bash
npm ci --ignore-scripts --no-audit --no-fund
node scripts/auth-lifecycle-check.mjs
```

On Windows PowerShell:

```powershell
npm.cmd ci --ignore-scripts --no-audit --no-fund
node scripts/auth-lifecycle-check.mjs
```

By default this uses the previously tested model `account:zai-individual-coding-plan/GLM-5.3`. Select a different model only if your account offers it:

```bash
node scripts/auth-lifecycle-check.mjs --model 'account:zai-individual-coding-plan/GLM-5.3'
```

By default, the program generates a **fresh Z.ai authorization URL in your own terminal** twice on a successful full lifecycle. After the first login, the test first checks a response through ZC's **guarded native-stream backend** (a control path using the upstream public headless client), then checks the default **native app-server backend** in its normal guarded (\`ask\`) mode using the same account and temporary profile. This removes the earlier confounder where the control ran guarded while app-server ran read-only/plan. The native check has a separate phase probe, which reports startup, catalog, selection, request, and completion without returning raw logs. If the control succeeds but native fails, this isolates an integration problem. It does not silently change your normal ZC backend.

After successful account checks, the test **deletes only the redirected credentials file in the disposable profile** and tests whether a new request is denied. The pinned upstream public CLI does not document a `logout` command, so this tests local sign-out, **not remote token or OAuth-session revocation**. Then a second login checks whether signing in again restores access. The test clears the disposable profile and deletes it.

The script uses a new private temporary directory, overriding the login, provider, user settings, session, and home paths for subprocesses. It strips common inherited credentials. This isolation follows the public ZCode CLI environment-variable contract; it is **not an OS security sandbox**. Run under an unprivileged user and avoid untrusted plugins or hooks. It does not intentionally touch your existing `~/.zcode` account, project files, or conversation histories.

For an optional delayed second request, use `--delay-seconds 3600` (up to one hour). **Do not claim automatic token renewal just because the delayed request succeeds.** Without observing a token actually expire and refresh, these checks establish only login/logout/re-login functionality and repeated account access, not expiry-driven renewal. Z.ai may change token lifetimes or auth behavior.

## What to share

After the script completes, send only its final line beginning:

```text
SHARE ONLY THIS RESULT:
```

It contains stage names and success/failure categories, not tokens or authorization URLs. Never paste full terminal logs, callback URLs, credentials, or raw HTTP headers.

A failing stage is a blocker, not permission to bypass authentication. Do not repeat login indefinitely. Report a failure category with OS, Node version, and ZC version. The normal login is not reset by this test.

## Boundaries

- Uses the native backend in guarded mode, a private empty workspace, and an explicit model, after an account control request through the guarded native-stream backend. All ZC permission prompts are denied. The guarded stream backend is **not** a strict read-only sandbox; run this only in a disposable workspace.
- Does not test write approval, CLI OS isolation, or unattended execution
- Does not reproduce automatic expiry by mocking elapsed time
- Tests deletion of the temporary local credential file, not an official remote logout or revocation
- Does not give this assistant remote control over your own login, logout, or filesystem
- A fully automated refresh test requires an isolated mock token server or a separately observed real expiry cycle with sanitized metrics

## Interpreting an early failure

A result of `PASS login 1` followed by `FAIL ...` is **not** proof that the OAuth token expired. Earlier versions of this test labeled almost every error `OTHER_FAILURE` and never tried a control backend. Use the current main-branch test so that account-model failure can be distinguished from default ZC adapter failure. The test deliberately does not print raw stderr or HTTP response bodies, which may contain authentication material.

The source-level native app-server integration rejects `interaction/requestProviderRuntimeHeaders`, but the pinned upstream app-server is configured for `standalone` local auth by default. That callback rejection alone does **not** establish the cause of the observed failure. The live differential test is needed. An earlier live comparison confirmed account access in the guarded stream backend but reported an unclassified exit from native in read-only/plan mode. The revised probe tests the product's normal guarded app-server mode and emits a fixed category plus the stage of failure. This is diagnosis, not a declaration that default native is fixed.

## Native phase results

If you see `FAIL initial authenticated request through default native: phase=...`, the reported phase names are:

- `session_start`: launch, create or subscribe to the app-server session.
- `model_catalog`: inspect account-advertised models in the session.
- `model_select`: request and verify the exact chosen model.
- `request`: submit and await an account-backed turn.
- `response`: verify the marker in the assistant answer.

The result may also include `modelAdvertised` and `providerHeaderRequests`. They report whether the exact model was available in the runtime catalog and whether native asked the client for an authentication-header callback. No token, OAuth link, raw stderr, account ID, or private workspace content is included. A callback count of zero does **not** prove authentication succeeded or failed. The app-server uses standalone local authentication.


## Native catalog selection correction (candidate)

The native UI now keeps the bare `providerId/modelId` reference when upstream also advertises individual reasoning levels. The upstream display catalog has a default reasoning level, but its structured selection validator requires the reasoning level to be present. ZC's bare picker reference is an alias for the runtime-advertised default, not permission to send an incomplete structured selection.

For an exact `--model` explicitly provided by the operator, ZC may ask the upstream app-server to validate that selection even if the frontend's projected picker omits it. This does not select a substitute model. It requires a matching `session/setModel` confirmation from the runtime **before** any model request. A runtime-advertised disabled model remains forbidden, and ordinary picker selection still requires catalog membership. A runtime rejection stops the test; it is not retried with a different backend or billed API.

These changes address two ZC-side selection guards, but they are **not** evidence that the live Z.ai app-server will advertise or acknowledge the model after standalone login. A new isolated live test is required before removing the production-readiness caveat.

## Distinguishing a native model-selection failure

The isolated live run confirmed `modelAdvertised=true` but failed at `phase=model_select category=OTHER`. The prior diagnostic did not distinguish the exact upstream `session/setModel` request from its result projection. The current test now reports:

- `selectedAtStart`: whether the runtime snapshot already showed the exact model before ZC attempted a change
- `setModelRpcSent`: whether a session/model mutation was requested
- `setModelRpcAcknowledged`: whether the runtime replied successfully
- `setModelRpcRejected`: whether it rejected that request

ZC now skips a redundant `session/setModel` mutation **only when an authoritative `session/read` confirms the exact requested model**. It still rejects disabled models and requires an exact runtime-confirmed model before sending a prompt.

If the RPC rejects, the remaining error is in runtime validation or integration; no account credential is automatically replaced. If the RPC accepts but model selection still fails, investigate model projection/confirmation handling. These flags are local, fixed-schema diagnostics and do not include raw protocol frames.


## Model selection investigation and current correction

The October 21 live tests established that an isolated Z.ai login can complete a GLM-5.3 request through the official headless native-stream client. In the default ZC app-server, GLM-5.3 appeared in the catalog, but `session/setModel` was rejected. A later experiment supplied the bare model in `session/create`; the live runtime rejected that call with RPC code `-32603` before establishing a session. That **create-time experiment is not the normal launch path anymore**.

Inspection of upstream `provider-registry-selection.ts` and `session-facade.ts` revealed a specific validation mismatch. Listing a model does not validate a structured selection. The structured `setModel` path invokes Registry validation, which can reject `reasoning-level-missing`. The earlier ZC request supplied only `providerId` and `modelId`, even though upstream publishes valid reasoning levels and a default level.

The current candidate fixes this by resolving an unsuffixed `provider/model` to the **runtime-advertised default reasoning level**, then submitting the full `{providerId, modelId, options: {reasoningLevel}}` structure through `session/setModel`. Explicit `$reasoningLevel` selections are passed unchanged. If the runtime advertises reasoning levels without a valid default, the unsuffixed model is marked unavailable and the user must pick an explicit listed level. ZC rejects any disabled model and never falls back to API-key billing.

Unit and subprocess tests include a strict fake app-server that lists GLM-5.3 but intentionally rejects bare structured selections and create-time model assignment. The corrected default launch must pass against this fixture before it can be released. **This does not prove that the real account-backed app-server or automatic token renewal works**. Only the next opt-in live test can establish real account inference.

## Keep a diagnostic login on your VPS only if you explicitly choose to

Previous iterations disposed of the temporary credential profile on each failed test, forcing another Z.ai OAuth authorization every time. To avoid that, you may opt into a **private persistent test profile**:

```bash
node scripts/auth-lifecycle-check.mjs --keep-on-failure
```

On POSIX, this uses `~/.local/state/zc-auth-lifecycle-profile`, requiring it to be a user-owned directory with mode `0700`. It keeps the isolated credentials if any test stage fails. Run the **same command** after pulling a repair to reuse that temporary account, rather than requesting login again. On complete success, the script clears its disposable test profile. The `SHARE ONLY THIS RESULT` output contains no credential paths or authentication tokens.

**Security tradeoff:** `--keep-on-failure` deliberately stores credentials on disk between test runs. It is opt-in, intended for a trusted, unprivileged, single-user VPS. Do not use it on a shared or untrusted host. Inspect and securely delete the named test directory after diagnosis if you do not complete a successful cleanup. The normal `~/.zcode` account remains separate.

Without the flag, the test keeps its previous behavior: it creates a temporary isolated directory and deletes it at exit, including after failure. The CLI never performs server-side OAuth revocation on your behalf. A successful logout/re-login cycle does **not** establish token-expiration renewal.
