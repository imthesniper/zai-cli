# Release readiness

Release: ZC 0.2.0. Review date: October 21, 2026.

## Evidence

The source baseline contains 235 regression tests and the macOS canonical-path repair. A first run on the new repository installed the actual pinned dependency on Linux, macOS, and Windows. It exposed a test expectation that assumed no runtime was installed; that expectation is now derived from installation health, while authentication must remain explicitly unverified by `doctor`.

The current Quality workflow is the authoritative CI result for each exact commit. It runs frontend checks, package installation and launcher tests, and actual runtime version verification. POSIX terminal exercises use synthetic sessions. Managed-installer checks use isolated runner homes; no personal account credentials are provided to CI.

Historical records under `VALIDATION-0.1.*` and `VALIDATION.md` describe their original build environments, not certification of this repository or later commits. Consult workflow logs rather than interpreting older test counts as new runs.

## Remaining gates for a stable production claim

- Live account-backed edit/test/deny/cancel/resume behavior through this exact packaged version.
- Token renewal and multi-hour operation under real network interruptions.
- Interactive Windows terminal and mouse/clipboard behavior across supported emulators.
- A third-party security review and OS-level isolation, neither of which this CLI supplies.

Earlier user sessions demonstrated account-backed file reads, follow-up history, resumed history, and native shell activity in 0.1.x. They do not establish these properties for every platform or every later build.

A repository push, a green CI matrix, and a completed model turn are different facts. This release remains an integration release until the outstanding live gates have evidence. There is no claim of an npm publication, code signing, unlimited subscription access, or unattended uptime.
