# Production acceptance gates

Status: **candidate checks**, not blanket production certification.
Release: ZC 0.2.0, October 21, 2026.

## Gate A: Controlled token-expiry boundary (automated, no account)

Run `npm run check`. This includes `test/native-refresh-lifecycle.test.mjs`,
which exercises the actual ZC native protocol adapter against a **local mock
app-server and mock short-lived token issuer**:

- The first simulated turn completes before the fake token expires.
- The fixture clock advances beyond its 10-second expiry without changing OS time.
- The mock issuer refreshes its token; the second simulated native turn succeeds.
- An intentionally rejected subsequent refresh terminates exactly once, with no
  automatic prompt replay, alternate account selection or fallback billing.
- All fixture credentials stay within the fake server; protocol messages return
  counts and synthetic model text only.

**Evidence boundary:** This establishes ZC frontend behavior when its upstream
runtime reports a completed or failed turn during a simulated renewal. The fake
issuer is not Z.ai; it does **not** execute the upstream ZCode client's real
token-refresh implementation. Upstream ZCode separately contains source tests
for credential rotation and project-token invalidation. Neither test proves
that a live token actually expired and was renewed.

## Gate B: Actual account-backed editing, denial, cancellation, resume

**Docker is required.** The native guarded backend can run commands and access
files as its OS user. This live test **refuses direct host execution**.

Prerequisites: Docker Engine available to your non-root operator account,
Internet access, a supported Z.ai Coding Plan account and enough model quota.
Do not run with host credentials mounted into the container.

From the updated repository on your VPS:

```bash
cd ~/zc-auth-test
git pull --ff-only
bash scripts/live-production/run.sh
```

The runner builds a fresh image from this repository, then launches it with:

- A non-root user (UID 10001) and read-only container root filesystem
- No bind mounts, Docker socket, local cloud credentials or SSH agent
- Dropped Linux capabilities, no-new-privileges, a process/memory limit
- Private tmpfs for `HOME` and `/tmp` (removed with the container)
- Network access for official Z.ai OAuth and model requests

The official ZCode login prints a **new private authorization URL inside the
container terminal**. Open it in a browser and complete login. Do not paste
the authorization URL, OAuth callback or any credentials into chat.

The script performs and categorizes these checks:

| Check | Pass criterion |
| --- | --- |
| Guarded model session | Runtime confirms guarded mode and the exact account model |
| Actual read | Assistant returns a random canary only present in `canary.txt`; file remains unchanged |
| Actual edit | `draft.txt` contains the exact requested new text; unrelated sentinels remain identical |
| Denied escalation | Explicit request to enable YOLO/full access is declined and runtime stays guarded |
| Cold resume | The same session ID is restored, its first prompt is present in history, a follow-up recalls a random conversation marker |
| Cancellation | An in-flight long task is aborted and the runtime confirms the task is no longer active |
| Cleanup | All generated workspace files, isolated OAuth credentials and local runtime files are discarded with the container |

Ordinary native tool permissions in guarded mode may be auto-approved by the
upstream runtime. The script allows a one-time **Read/Write/Edit** approval only
for designated canary or draft paths when asked; it denies all other prompts,
including YOLO. This does not certify that every native tool requires approval.
If a live cancellation completes before the stop arrives, the test labels
it **INCONCLUSIVE**, not PASS. A failed step is not automatically retried.

To check account continuity after a long wait, optionally use:

```bash
bash scripts/live-production/run.sh --continuity-minutes 75
```

This adds a 75-minute wait before another model request. A successful result
establishes **session continuity only**. The test cannot establish token expiry
or reissuance from elapsed time alone, and it does not inspect real token bytes
or modify expiry metadata. There is no reason to use this delay for the initial
editing/recovery test.

After the run, share **only** the final line starting with:

```text
LIVE_PRODUCTION_RESULT:
```

It contains stage names, statuses and fixed categories. Do not provide raw
container logs, private OAuth URLs, model transcripts, token files or headers.

## When the release can be called stable

A passing CI matrix and live authentication lifecycle already establish
packaging and basic account access on the tested platform. We still require:

1. The live container acceptance results above, including actual file editing
   and resumed-model context, with no unexpected file changes.
2. A real credential-expiry/renewal observation or a controlled integration
   check **against the actual pinned upstream refresh resolver**, not merely
   against our fake issuer.
3. Network-interruption and multi-hour workload validation, plus an external
   security review for untrusted tool execution.
4. Windows interactive terminal behavior and approval workflows exercised
   on supported terminals.

Passing only the simulated refresh fixture cannot satisfy item 2.
Passing live cancellation with an inconclusive stop cannot satisfy item 1.
No individual PASS result asserts a stronger guarantee than its criterion.

Docker provides useful isolation boundaries but is **not a formal sandbox
security guarantee**, especially if the host daemon itself is misconfigured.
Do not use this runner on a production VPS with privileged Docker mounts, a
host network, Docker-in-Docker privileges or irreplaceable host data in its
build context.
