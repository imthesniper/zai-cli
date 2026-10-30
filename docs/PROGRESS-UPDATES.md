# Understand what ZC is doing during long tasks

ZC is a terminal frontend over the pinned upstream ZCode runtime. The runtime
runs the agent and tools; ZC displays the events it sends. An agent can run many
commands without writing explanatory text between them. The frontend cannot
truthfully invent why the model chose those commands.

## What now appears automatically

ZC uses the upstream legacy-v1 `session/event` stream:

- A tool card appears when a command or other tool is scheduled and shows its
  **exact command or path** when provided.
- A supported human-readable `description` emitted **by the upstream runtime**
  is shown as `Purpose (runtime): ...`. No description is synthesized when
  that field is absent. This field describes what the runtime reported; it is
  not a transcript of the model's internal reasoning.
- While the tool runs, a live elapsed timer and any bounded numerical output
  counters reported by the runtime are shown directly below it. Tool progress
  never implies completion or success.
- On completion, the card shows a recognized exit code and output byte count
  where the upstream result actually supplies them. If only an opaque result
  is received it says `Result received (expand for details)`. Expand a tool row
  with **Ctrl+O** or a click to inspect the full result; it may contain private
  paths, source code, or logs, so ZC does not automatically print it.
- Actual assistant-visible text is streamed as generated; final answers still
  appear as usual.

**No fake commentary:** ZC does not transform private `reasoning_delta` into
a public explanation and does not pretend the agent said something it did not.
A long sequence of commands with no assistant text is possible even with the
new tool timeline.

## Tell the agent to communicate like a collaborator

The upstream ZCode Agent reads the user and workspace **`AGENTS.md`** files.
For an opt-in instruction that encourages the kind of narration seen in
Codex and Claude Code, add the following section to your existing
`~/.zcode/AGENTS.md` or your project's `AGENTS.md`:

```markdown
## Progress communication

When beginning a nontrivial task, tell the user what you will inspect or
change and what outcome you are checking.

Before a significant batch of shell or file operations, provide a brief,
user-visible sentence about its immediate purpose. After important tool
results, explain what they established, what remains uncertain, and the next
step. Do not wait for the entire task to finish before communicating.

For long investigations, post concise progress when there is real evidence
or a change of direction. Avoid noise for trivial commands and do not
fabricate activity, results, risks, or completed work.

Keep status updates separate from private internal reasoning. Do not expose
secrets, token values, private credentials or irrelevant raw logs.
```

Do not replace an existing `AGENTS.md` wholesale or write into another user's
home. The upstream model may not always follow these instructions; tool events
are still displayed independently when the model remains silent.

## What progress updates do not establish

- That Z.ai's server is responding quickly or the model has not become stuck
- That a shell command is safe, finished, or did not modify files
- That the tool actually ran when its status is only `queued`
- That an hour-long investigation has a useful conclusion
- That private model reasoning can be or should be reconstructed

Use `/status` to inspect an unusually long task, and Escape to explicitly
stop it. The runtime status inspector does not silently stop or replay a task.
Keep ZC's guarded mode and workspace access limitations in mind: guarded
execution is not a host OS sandbox.
