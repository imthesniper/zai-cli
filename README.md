# ZC Workbench

**A coding workspace for your terminal. Install once. Start with `zc`.**

[![Quality](https://github.com/imthesniper/zai-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/imthesniper/zai-cli/actions/workflows/ci.yml)

ZC combines a multiline editor, searchable conversation history, tool activity, and explicit full-access controls with a pinned ZCode runtime. The runtime is installed as a dependency; users do not need a second `zcode` installation or a long startup command.

Independent software by **Striking Lions**, not affiliated with Z.ai, Anthropic, Apple, or OpenAI. An account with model access is required. This repository is the home of `@striking-lions/zc`; it does not claim that package is published to the npm registry.

**Release status:** 0.2.0 is available as a public GitHub preview, and remains an integration release rather than a stable, audited build. Automated checks cover frontend behavior, packaging, and runtime installation. An operator's live Linux VPS tests also confirmed Z.ai account login, repeated authenticated responses through the default native backend, loss of local account access after temporary credential removal, and successful re-login. These tests **do not** establish automatic renewal of an expired token, remote OAuth revocation, unattended long-running tasks, or every terminal. See [release readiness](docs/RELEASE-READINESS.md) for the exact evidence and remaining limits.

![ZC light interface](docs/workbench-light.png)

*Rendered by ZC using a synthetic conversation. [Dark preview](docs/workbench-dark.png).*

## Get ZC 0.2.0 public preview

**[Download ZC Workbench v0.2.0 from GitHub Releases](https://github.com/imthesniper/zai-cli/releases/tag/v0.2.0)**

Choose `zc-0.2.0-install.zip` for the cross-platform installation bundle, which includes the Node-managed installers, packaged application, a quickstart and checksums. Review the ZIP contents and [security boundaries](SECURITY.md) first. The installer needs an internet connection and an entitled Z.ai account.

**macOS / Linux:**

```bash
unzip zc-0.2.0-install.zip -d zc-0.2.0
cd zc-0.2.0
bash install.sh --add-path
```

**Windows PowerShell:**

```powershell
Expand-Archive .\zc-0.2.0-install.zip -DestinationPath .\zc-0.2.0
Set-Location .\zc-0.2.0
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -AddPath
```

Run the installers as your ordinary user, never using `sudo` or an administrator terminal. Reopen the terminal after adding PATH, then use `zc login` and `zc`. This is a **public preview**, not a code-signed binary or npm registry publication. [Read the release notes](docs/releases/v0.2.0.md) for what is and is not verified.

## Install

### macOS, Linux, and WSL

Prerequisites: Git, Node.js **24.14 or newer**, npm, and an interactive UTF-8 terminal. Check `node --version` before starting. Use Node's [official downloads](https://nodejs.org/en/download) when needed.

Install into your own directory, without `sudo`:

```bash
git clone https://github.com/imthesniper/zai-cli.git
cd zai-cli
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm pack
npm install --global --ignore-scripts --prefix "$HOME/.local" ./striking-lions-zc-0.2.0.tgz
export PATH="$HOME/.local/bin:$PATH"
zc --version
```

Keep the PATH line in your shell startup file (`~/.zshrc` for Zsh or `~/.bashrc` for Bash) if it is not already there. The packed installation is independent of the source checkout, so moving or deleting that checkout does not break `zc`.

### Windows

Use Windows Terminal with PowerShell, Git, and Node.js **24.14 or newer**. The `.cmd` commands avoid npm PowerShell shim-policy errors without changing your execution policy.

```powershell
git clone https://github.com/imthesniper/zai-cli.git
Set-Location zai-cli
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd run check
npm.cmd pack
npm.cmd install --global --ignore-scripts .\striking-lions-zc-0.2.0.tgz
zc.cmd --version
```

After each command, stop if it reports an error. Open a new terminal if npm's global bin directory is not yet on PATH. WSL users should use the Linux instructions inside WSL, not mix Windows and Linux Node installations.

### Managed engine installation

For a self-contained program directory with a private Node engine, pack the source as above and run one of the inspected installers:

```bash
bash install/install.sh --package "$PWD/striking-lions-zc-0.2.0.tgz" --add-path
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install\install.ps1 -Package "$PWD\striking-lions-zc-0.2.0.tgz" -AddPath
```

The PowerShell policy override affects only this installer process. Review the script before executing it. A downloadable installation bundle, when present under [Releases](https://github.com/imthesniper/zai-cli/releases), includes the packed application, installers, and checksums, so it does not need an existing Node installation.

Managed installation downloads Node **24.22.0**, verifies its archive against the official HTTPS checksum manifest, and installs the pinned runtime. It does not replace system Node or require administrator access. It needs internet access to Node and npm; it is not an offline binary or a code-signed installer. Programs go into a versioned user-owned directory, and the previous launcher and ZC settings are retained. Restart the terminal after PATH changes.

## Connect once, then work

At your normal shell prompt:

```bash
zc login
cd /path/to/your/project
zc
```

On an SSH server, run `zc login --oauth --no-browser` on the server and open the printed authorization URL privately on your own computer. Keep the login command running until the terminal confirms completion. Do not share the callback URL or credential files.

Inside ZC, use `/model` to select an account-backed model and reasoning level from the runtime's catalog. Review workspace trust before submitting a task. No API key needs to be copied into ZC for account login. Subscription limits and model entitlement still apply.

```text
Inspect the parser and its tests. Implement bounded buffering for incomplete frames,
keep the public interface unchanged, and run the relevant tests. Report the commands
actually run, summarize the diff, and distinguish verified results from assumptions.
```

Daily commands:

```bash
zc                         # Current project
zc /path/to/project        # Another project
zc resume                  # This project's last recorded conversation
zc --resume SESSION_ID     # An exact conversation
zc doctor                  # Local checks, not a live login or model test
zc demo                    # Explicitly simulated offline interface
zc --plain                 # Line-oriented alternative to the full-screen interface
```

For an **explicit account-backed model on a new session**, you can initialize it when the session is created:

```bash
zc --model 'account:zai-individual-coding-plan/GLM-5.3'
```

This requires an account entitled to that exact model. ZC creates the session, reads the runtime's advertised model and default reasoning level, and submits a **fully structured selection** through `session/setModel`. It accepts the selection only after the runtime acknowledges the exact model and reasoning level; it never guesses an effort, silently chooses another provider, or retries a rejected request. A model without a valid advertised default requires you to select an explicit reasoning level via `/model`. Initial and repeated account-backed native inference were verified on the operator's Linux VPS; editing, full workflow recovery, and real token-expiry renewal remain separate gates. See [authentication lifecycle testing](docs/AUTH-LIFECYCLE.md).

On your first upgrade from an older preview, `zc resume` may open the session picker. Choose the existing conversation. Old prompts are not automatically resubmitted.

## Verify account login, logout, and re-login

To run an **optional, live authentication lifecycle test** without logging out your normal ZCode profile, see [authentication lifecycle testing](docs/AUTH-LIFECYCLE.md). It generates authorization links in your own terminal and uses an isolated test profile. The test makes actual model requests and consumes quota.

This checks initial login, a second authenticated request, local logout and denial, then re-login. It does **not** certify automatic renewal after token expiration. Never send OAuth authorization links, callback codes, or credential files into an issue or chat.

## Test production-readiness workflows

The live account login/logout/re-login lifecycle has passed on a Linux VPS. Separate disposable Docker tests confirmed **real file reading and editing with unchanged sentinels, denied full-access escalation, cold conversation recovery, and cancellation of a verified running shell tool**. Individual tool-specific approval/denial prompts have not been observed, and genuine token-expiry renewal remains unverified. See [production acceptance gates](docs/PRODUCTION-GATES.md) for the evidence and limits.

```bash
bash scripts/live-production/run.sh
```

The optional `bash scripts/live-production/run.sh --cancellation-only` command repeats the now-verified cancellation acceptance check in a fresh, private container, without rerunning editing/history scenarios.

This test requires Docker and a fresh Z.ai login *inside* an isolated, non-root container with no host files mounted. It never runs agent-editing prompts directly against your VPS home. The automated suite also tests simulated token expiry/reissue using a **fake local issuer**. That simulation does not certify the official runtime's real token renewal after expiry.

## Permission modes and autonomous work

**Default native mode is guarded.** The historical `ask` name in ZC maps to the runtime's guarded mode, which may run ordinary commands without asking and uses runtime rules for additional confirmations. It does not mean approval before every edit or shell command.

For full access in the current native session, type this in the **ZC prompt box**:

```text
/mode yolo
```

The confirmation begins on **Deny**. Select **Enable YOLO** and press Enter. The status changes to **YOLO / FULL ACCESS** only after runtime acknowledgment. `/mode ask` returns to guarded mode. Stop an active turn with Escape before changing modes. YOLO is not saved as a global default, and resumed sessions begin guarded.

**There is no OS sandbox.** Shell commands and tools can reach anything available to your user account, including files outside the selected project. Do not run ZC as root or administrator. Use a disposable worktree, container, or VM without valuable credentials for untrusted code. Some upstream mandatory confirmations and planning restrictions still apply in YOLO. A prompt asking for eight hours of work is not a scheduler or an uptime guarantee.

`zc audit` starts with restricted file-reading tools and a security-review task. It does not execute tests or certify a repository as safe. Read [security boundaries](SECURITY.md) and [full-access behavior](docs/FULL-ACCESS.md).

## Editor, mouse, and history

| Control | Action |
| --- | --- |
| Click / drag inside the prompt | Position the caret / select text |
| Double-click a prompt word | Select the word |
| Shift + arrows, Home, End | Extend selection |
| Ctrl+A | Select the entire draft |
| Backspace, Delete, or typing | Remove or replace selected text |
| Ctrl+Z / Ctrl+Y | Undo / redo |
| Alt+Enter or Ctrl+J | Newline |
| Enter | Send when no dialog or active task blocks submission |
| Wheel, Page Up / Page Down | Scroll conversation, not prompt history |
| Ctrl+Home / Ctrl+End | Oldest retained history / live output |
| Ctrl+R | Explicit prompt-history picker |
| Ctrl+F or `/search words` | Search the local transcript archive |
| Ctrl+O or clicking a tool row | Expand tool output |
| Ctrl+C on a selection | Request terminal clipboard copy |
| Escape | Cancel a dialog or explicitly stop the current turn |
| Ctrl+C twice / `/quit` | Orderly exit |

Pasting does not submit a task or approve a dialog. Up/Down move through prompt lines rather than recalling old prompts. The draft limit is 64,000 characters.

On macOS, these are **Control**, not Command, shortcuts. Mouse reports and OSC 52 clipboard support depend on your terminal and SSH/tmux configuration. Use `/mouse off` for native terminal selection and `/export` for a reliable transcript file. ZC does not silently change tmux or terminal security settings.

Themes: enter **`/theme`** to preview `auto`, `dark`, `light`, and `mono` before applying one, or run `/theme dark` directly. Arrow keys and mouse preview; Enter saves; Escape restores the previous theme. Auto inherits your terminal's colors, dark uses a readable graphite palette, light uses paper/ink colors, and mono remains uncolored. The visual theme can change while the model is working. [Design system and contrast tests](docs/DESIGN-SYSTEM.md).

## Live tool activity and progress

The native workbench now shows live command status, elapsed time, and available
numeric output counters beneath each tool call instead of only showing a raw
result JSON object after expanding the tool. When the upstream ZCode runtime
provides a tool `description`, it appears as **Purpose (runtime)**. Completed
tools show reported exit codes and output byte counts where available; click
the card or use **Ctrl+O** for full output.

These are observed protocol facts, **not fabricated model explanations**.
Natural-language commentary before and after commands depends on the upstream
agent producing assistant text. See [progress communication](docs/PROGRESS-UPDATES.md)
for an optional `AGENTS.md` instruction that encourages that style without
revealing private internal reasoning. The underlying runtime and model are
still responsible for actually performing and explaining their work.

## Sessions, long tasks, and recovery

The native backend monitors quiet turns with session-status and event-history queries rather than automatically stopping a task because no text arrived. A failed health check is shown as **uncertain**. It is not relabeled as a successful task, and a prompt is not automatically replayed.

```text
/status       Inspect the current session
/reconnect    Reopen that session without resending a task
/sessions     Browse this project's conversations
/new          New conversation, without deleting files
/diff         Review Git changes, including pre-existing changes
/compact      Request runtime context compaction
/export       Export the retained visible transcript without overwriting a file
```

Use Escape for an explicit stop. Exiting the application can cancel active work. Runtime failures, connection problems, quota, and authentication renewal can still interrupt a task. Inspect the state before retrying side-effecting work.

The disk-backed visible transcript retains older pages beyond the screen's working set. Displayed assistant messages and tool results have size limits; `/export` includes retained history, not raw protocol or unlimited tool artifacts. Older text discarded by a prior version cannot be recreated unless the upstream resume snapshot supplies it.

## Upgrade, rollback, and uninstall

**Stop active tasks and close ZC before upgrading.** Update a clean source checkout with `git pull --ff-only`, repeat the install block, and check `zc --version`. Do not delete `~/.zcode` to repair an installation: it contains upstream account/session data.

Older previews with an external runtime override should run this once:

```bash
zc config managed
zc doctor
```

This selects the dependency supplied by ZC and preserves other preferences. Normal launches then need only `zc`.

For an npm installation, reinstall a previously retained `.tgz` to roll back. For the managed installer, the printed retained-release directory includes the previous launcher and `previous-zc-config.json`. Inspect those backups before restoring them; restoring program files does not rewind the upstream database or undo code changes. See [installation and recovery](docs/INSTALLATION.md).

Uninstall an npm-prefix installation using the same prefix:

```bash
npm uninstall --global --prefix "$HOME/.local" @striking-lions/zc
```

On Windows with npm's default prefix, use `npm.cmd uninstall --global @striking-lions/zc`. For a managed installation, remove only its `zc` launcher and versioned program directory after closing it. ZC preferences, local transcripts, and upstream credentials are separate; preserve them unless you explicitly intend to erase them. Paths and migration details are in [installation and recovery](docs/INSTALLATION.md).

## Troubleshooting

| Symptom | Action |
| --- | --- |
| `zc: command not found` | Open a new terminal; check `command -v zc` on POSIX or `Get-Command zc.cmd` in PowerShell. Confirm the installation prefix is on PATH. |
| Unsupported Node version | Use Node 24.14+ or the managed-engine installer. Do not repeatedly prepend `npx` to normal launches. |
| Runtime dependency missing or mismatched | Reinstall the complete package with dependencies, then `zc config managed`. Do not replace a private runtime file manually. |
| No model selected | Use `/model`; identifiers come from the runtime catalog. |
| `project_token_login_failed` | Run `zc doctor`, confirm the managed dependency, then one explicit `zc login --oauth --no-browser`. If it immediately fails again, retain the error and stop looping through logins. No token expiry is inferred from this generic error alone. |
| Uncertain/disconnected task | Use `/status` and inspect the conversation before `/reconnect`. Do not automatically repeat a write or shell task. |
| Mouse/clipboard does not work over SSH | Check terminal/tmux support; `/mouse off` and `/export` provide alternatives. |
| npm `ECONNRESET` or `ENOTEMPTY` | Preserve the exact error. Check connectivity or the specific staging-directory conflict. Do not disable TLS, use `--force`, or erase credentials as a workaround. |

Report problems through [GitHub Issues](https://github.com/imthesniper/zai-cli/issues) with OS, terminal, `zc --version`, and a sanitized `zc doctor` report. Omit prompts, source code, tokens, authorization URLs, and private logs unless deliberately sharing them. Security reports should follow [SECURITY.md](SECURITY.md), not a public issue containing exploit details or credentials.

## Scope and maintenance

The default backend is **native**, using the installed client's standalone authentication. Optional authenticated MCP services and unsupported desktop-only reverse requests are not implemented by this frontend. Unsupported interactions are rejected, not granted by YOLO consent. The older `native-stream` backend is a restricted compatibility path without ZC approval dialogs; it is not the recommended coding workflow.

Direct API access is a separate opt-in: `zc config backend zai` and a securely supplied `ZAI_API_KEY`. ZC does not silently switch to API billing. Account credentials remain owned by the runtime. Runtime telemetry, tools, hooks, and plugins have their own settings and data handling; [SECURITY.md](SECURITY.md) explains the boundary.

Development and release checks:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run check
node scripts/verify-runtime.mjs
python3 scripts/terminal-smoke.py  # POSIX only, synthetic model/runtime
npm pack
```

[Architecture](docs/ARCHITECTURE.md) | [Compatibility](docs/COMPATIBILITY.md) | [Release readiness](docs/RELEASE-READINESS.md) | [Publishing](docs/PUBLISHING.md) | [Changelog](CHANGELOG.md)
