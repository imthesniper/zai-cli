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

The program generates a **fresh Z.ai authorization URL in your own terminal** twice. After the first login, the test first checks a response through ZC's **guarded native-stream backend** (a control path using the upstream public headless client), then checks the default **native app-server backend** using the same account and temporary profile. If the control succeeds but native fails, this isolates an integration problem. It does not silently change your normal ZC backend.

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

- Uses `zc exec` with the native backend, a temporary empty workspace, explicit model, and read-only policy, after an account control request through the guarded native-stream backend. The guarded stream backend is **not** a strict read-only sandbox; run this only in a disposable workspace.
- Does not test write approval, CLI OS isolation, or unattended execution
- Does not reproduce automatic expiry by mocking elapsed time
- Tests deletion of the temporary local credential file, not an official remote logout or revocation
- Does not give this assistant remote control over your own login, logout, or filesystem
- A fully automated refresh test requires an isolated mock token server or a separately observed real expiry cycle with sanitized metrics

## Interpreting an early failure

A result of `PASS login 1` followed by `FAIL ...` is **not** proof that the OAuth token expired. Earlier versions of this test labeled almost every error `OTHER_FAILURE` and never tried a control backend. Use the current main-branch test so that account-model failure can be distinguished from default ZC adapter failure. The test deliberately does not print raw stderr or HTTP response bodies, which may contain authentication material.

The source-level native app-server integration rejects `interaction/requestProviderRuntimeHeaders`, but the pinned upstream app-server is configured for `standalone` local auth by default. That callback rejection alone does **not** establish the cause of the observed failure. The live differential test is needed.
