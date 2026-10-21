# Installation and recovery

## Separate stores

| Data | POSIX default | Windows default |
| --- | --- | --- |
| ZC settings and visible transcripts | `~/.local/state/zc`, or `ZC_HOME` | `%LOCALAPPDATA%\StrikingLions\zc`, or `ZC_HOME` |
| Managed engines and program releases | `~/.local/share/zc` (respects `XDG_DATA_HOME`) | `%LOCALAPPDATA%\StrikingLions\ZC` |
| Managed launcher | `~/.local/bin/zc` | `%USERPROFILE%\.local\bin\zc.cmd` |
| Upstream account/provider state | `~/.zcode/v2` unless overridden | `%USERPROFILE%\.zcode\v2` unless overridden |

Windows paths are case-insensitive on typical installations: the ZC state and managed-program base share the same parent directory there. Remove only `engines` and `releases` to remove program bytes, not that entire parent when retaining preferences and transcripts.

Upstream sessions and tools may use additional paths and environment overrides. ZC does not migrate or delete that state. See the pinned client's configuration guide in its installed package.

## Choosing an installation

An npm-prefix installation requires an existing compatible Node and uses npm's normal executable shim. A managed-engine installation installs a private engine and a versioned application under the paths above. Do not alternate installation methods blindly: use `command -v zc` or `Get-Command zc.cmd` to check which launcher is selected.

The managed installer downloads Node from `nodejs.org`, checks its archive hash against the release's HTTPS checksum manifest, and installs the pinned runtime with lifecycle scripts disabled. It retains the previous launcher and ZC configuration in the new release directory. No account login is performed by the installer. The managed program needs npm-registry access on first install. It does not bundle platform binaries in the source repository.

## Rollback

Close active ZC and runtime sessions intentionally. In the retained release directory, inspect `previous-launcher` on POSIX or `previous-launcher.cmd` on Windows, and `previous-zc-config.json`. A POSIX backup may be a symlink: preserve that link rather than copying its target bytes. A launcher-only rollback does not undo an upstream database migration or a file edit.

For an npm installation, reinstall the last known working package archive using the same prefix. Do not clear the credential store. For managed installations, restore the reviewed previous launcher to its original path and, only if needed, restore the saved preferences with the release's `scripts/restore-config.mjs`. Keep the current release until the restored launcher has been verified.

## Troubleshooting download/install failures

`ENOENT` for a tarball means that path is absent on the machine running npm. A download on a laptop is not automatically present on an SSH server. Transfer the file before installing.

`ECONNRESET` is a connection failure, not evidence of an invalid account token. Retry the same pinned package with normal HTTPS verification. Do not switch off `strict-ssl`.

`ENOTEMPTY` during npm replacement can involve a leftover staging directory. Close competing installers, identify the exact destination in the error, and preserve that directory in a backup before retrying. Do not recursively delete all of `node_modules`, the npm cache, or `~/.zcode` as a blanket response.

## macOS and SSH

The app uses Control-key shortcuts. Configure terminal forwarding of Option/Alt where needed, or use Ctrl+J for a newline. Application mouse reporting and OSC 52 clipboard transfer depend on Terminal and tmux support. Native selection remains available with `/mouse off`. An SSH disconnect can terminate foreground tasks; ZC is not an unattended background scheduler.

For login on a remote machine, run `zc login --oauth --no-browser` there, open its new authorization URL privately on the local computer, and wait for the remote terminal result. Browser success alone is not proof a model request has worked.
