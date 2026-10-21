# Maintaining and publishing ZC

Canonical repository: https://github.com/imthesniper/zai-cli

The imported baseline is `Misbah-Engr/zai-cli@d7e88b2676d279b207e70dedb123b9eaf9999036`, including its macOS canonical-path repair. The repository migration preserves the source license and NOTICE. No private account files, source workspaces, or model conversations belong in a release.

## Source changes

Use a focused branch and reviewed pull request. Do not force-push the default branch or replace tags. The old repository-creation helper is disabled so it cannot publish to an unrelated account/repository. For local inspection commands, `git --no-pager` or `GH_PAGER=cat` avoids an unexpected pager.

## Required checks

Run `npm run check`, the real runtime public-entry verification, packaging/install checks, and the Quality matrix on Linux, macOS, and Windows. POSIX PTY tests exercise the real frontend with a synthetic runtime. A green fixture run does not prove live inference, token renewal, or eight-hour task reliability.

Review actual model/tool activity, denial and approval, cancellation, restart recovery, authentication renewal, and terminal behavior before upgrading stability claims. Keep pending items in `RELEASE-READINESS.md`. Do not remove failed tests merely to publish.

## Distribution

`npm pack` creates the application tarball. The `files` allowlist excludes tests, local state, keys, and unrelated files. `scripts/package-release.py` builds an installation ZIP with the tarball, POSIX and Windows installers, quickstart text, and SHA-256 checksums. The managed installer downloads its private Node engine and dependencies at installation time.

CI artifacts are build results, not an npm registry publication. A stable GitHub Release, npm publication, signing, or provenance attestation must be an explicit maintainer action after the corresponding release gates pass. Do not label an artifact code-signed merely because it has a checksum.
