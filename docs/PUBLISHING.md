# Maintaining and publishing ZC

Canonical repository: https://github.com/imthesniper/zai-cli

The imported baseline is `Misbah-Engr/zai-cli@d7e88b2676d279b207e70dedb123b9eaf9999036`, including its macOS canonical-path repair. The repository migration preserves the source license and NOTICE. No private account files, source workspaces, or model conversations belong in a release.

## Source changes

Use a focused branch and reviewed pull request. Do not force-push the default branch or replace tags. The old repository-creation helper is disabled so it cannot publish to an unrelated account/repository. For local inspection commands, `git --no-pager` or `GH_PAGER=cat` avoids an unexpected pager.

## Required checks

Run `npm run check`, the real runtime public-entry verification, packaging/install checks, and the Quality matrix on Linux, macOS, and Windows. POSIX PTY tests exercise the real frontend with a synthetic runtime. A green fixture run does not prove live inference, token renewal, or eight-hour task reliability.

Review actual model/tool activity, denial and approval, cancellation, restart recovery, authentication renewal, and terminal behavior before upgrading stability claims. Keep pending items in `RELEASE-READINESS.md`. Do not remove failed tests merely to publish.

## v0.2.0 public preview

The maintainer has authorized **public release as an explicitly labeled GitHub prerelease**, despite the outstanding stable-release gates. This is not an assertion of audited security, token-expiry renewal or universal platform compatibility.

The `v0.2.0` public preview is deliberately published by a **one-time gated Quality job**, only when a reviewed squash merge on `main` starts with the commit title `release: ZC v0.2.0 public preview`. The job waits for the complete cross-platform verification matrix, dependency audit, disposable Docker image build, and installation bundle. It rebuilds the distributable from the exact commit, checks the ZIP, computes outer SHA-256 sums, creates the GitHub tag and prerelease, and attaches the installer ZIP, npm-format `.tgz`, and checksum text.

The release job fails closed rather than overwriting an existing release or moving its tag. Pull requests, unrelated merges, ordinary tags and npm installation do not publish. Publication is via GitHub's release API using the repository's short-lived Actions token with `contents: write` only for the publishing job. No developer token or secret needs to be shared in chat. The GitHub-hosted files are downloadable installation artifacts, not an npm registry package, signed executable, standalone offline binary, or supply-chain attestation.

Public documentation and release notes must state the precise Linux live results and what is not established, particularly real token-expiry renewal, OS-level sandboxing, interactive per-tool approvals, Windows/macOS live UI verification and independent security audit. See [the published notes](releases/v0.2.0.md).

## Distribution

`npm pack` creates the application tarball. The `files` allowlist excludes tests, local state, keys, and unrelated files. `scripts/package-release.py` builds an installation ZIP with the tarball, POSIX and Windows installers, quickstart text, and SHA-256 checksums. The managed installer downloads its private Node engine and dependencies at installation time.

CI artifacts are build results, not an npm registry publication. A stable GitHub Release, npm publication, signing, or provenance attestation must be an explicit maintainer action after the corresponding release gates pass. Do not label an artifact code-signed merely because it has a checksum.
