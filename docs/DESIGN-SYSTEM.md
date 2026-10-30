# ZC Terminal Design System

A coherent, accessible terminal UI for long developer sessions. This is a
post-v0.2.0 source improvement: the published v0.2.0 ZIP is unchanged.

## Principles

**Readability before decoration.** Build one clear visual hierarchy:

- Primary text: almost-white on graphite, deep ink on warm paper
- Secondary and tertiary text: quieter neutrals, not gray too faint to read
- Accent: a single softened blue, used for an active task, focus or selection
- Success: green only for confirmed success/guarded state
- Attention: amber for full access and warnings
- Error: muted red for errors and disconnections
- Borders: neutral, subordinate to code and explanations

Colors are semantic roles. No gradient, neon or arbitrary alternate colors
are applied to the entire status line or composer border. Structured output,
the user's text, and tool details use the same typography hierarchy.

The design takes lessons from established coding terminals, without copying
their exact colors: Codex's TUI conventions favor terminal-default foreground,
concise semantic emphasis, and a small status line
([Codex TUI style conventions](https://github.com/openai/codex/blob/main/AGENTS.md)).
Claude Code presents intentional dark/light, accessible, and ANSI-oriented
theme options. ZC keeps its own brand expression and ensures visual choices
do not change model execution or permissions.

## Palettes

| Role | Dark: Graphite | Light: Paper |
| --- | --- | --- |
| Background | `#13151A` | `#FAFAF7` |
| Primary | `#EDF0F5` | `#1B2533` |
| Secondary | `#B4BEC9` | `#586475` |
| Tertiary | `#96A1AD` | `#647387` |
| Border | `#8392A3` | `#7A8695` |
| Accent | `#A0C4FF` | `#185EA4` |
| Success | `#89D8B3` | `#18704A` |
| Warning | `#F0C985` | `#875700` |
| Error | `#F0ACAC` | `#A52C3E` |

Each functional text color has at least **4.5:1** relative luminance contrast
against its explicit theme background in automated tests. Borders meet
**3:1**. This checks palette ratios, not every possible terminal's font
rendering, display quality or actual visual accessibility.

**Auto** respects the terminal's own foreground and background. It uses
bold, dim and standard ANSI semantic colors rather than guessing what the
terminal background should be and painting over it. **Mono** is deliberately
uncolored; selected text can still use inverse video for readability.
`NO_COLOR` takes precedence over any chosen color theme.

## Theme selection

Run `/theme` to open the live preview. Arrow keys or mouse selection
change a temporary preview, including the sample primary/secondary text and
semantic states. Enter saves the theme; Escape exits without saving. Direct
commands `/theme dark`, `/theme light`, `/theme auto`, and `/theme mono`
still work. Visual switching is allowed while a model turn is running,
because it never alters the upstream model, permissions, files or prompt.

Themes can switch from mono back to color without restarting. A failed
configuration write leaves the previously saved theme in place.

## Timers that scale with the task

The same helper formats the status timer, active tools and completed
tool duration. It uses up to two time units for stable compact width:

| Elapsed | Display |
| --- | --- |
| 42 seconds | `42s` |
| 65 seconds | `1m 05s` |
| 3,720 seconds | `1h 02m` |
| 97,200 seconds | `1d 03h` |

On a narrow terminal, ZC shortens the *status description*, not the elapsed
time. Active-turn elapsed time comes from a monotonic process clock, so
adjusting the computer's wall-clock time does not make the timer jump.
Time units do **not** measure how close a model is to completion, and
they do not imply that a quiet or disconnected runtime is healthy. Use
`/status` to inspect uncertain tasks and Escape for an explicit stop.

## Quality safeguards

The UI tests check:

- Contrast ratios on each named theme, not merely whether color codes exist
- 36×14 through wide displays, ANSI/no-color output and theme preview
- No stale monochrome flag when switching back to a color theme
- Cancellation of the live theme picker without a configuration change
- Exact duration threshold transitions, including hours and days
- No change to safety and permission modes during theme selection

This source change does not claim a new release, authenticated model test or
completion of any outstanding production-readiness gate.
