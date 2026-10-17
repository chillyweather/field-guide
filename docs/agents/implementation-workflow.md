# Claude Code issue-implementation workflow

This is a vendor-specific development instruction for Claude Code.
It applies when the operator asks Claude Code to implement an issue or another code change.
When Codex is invoked as the reviewer in step 3, it only reviews and must not run this workflow or edit files.

Once the operator asks for an implementation, the whole sequence below is authorized, including the merge.
Do not end the turn between steps; stop early only for the cases listed under "When to stop and ask".

## 1. Implement in a new worktree

Always start in a new Git worktree on a new branch cut from the current `origin/main`.
Never implement in the main checkout, and never reuse a worktree left by another task.
Name the branch `task/<issue-number>-<short-slug>` (or `task/<short-slug>` when there is no issue).
The repository root has no dependencies. A sub-package with its own `package.json` gets `npm install` inside the worktree before its tests run.
The implementation is written by the model currently selected in Claude Code (Opus by default).
Do not hand the implementation to a different model, to Codex, or to a subagent running another model.

## 2. Prove it locally and open the PR

Run `npm run check` in the worktree, plus `npm test` in every sub-package the change touches, and make them pass before pushing.
This is the whole gate: there is no CI, so nothing after the push catches what the local run missed.
The gate is offline. Live Jev or vision calls (the probes, the spike runner) cost money and need keys: run them only when the issue asks for them, and report what they spent.
Push the branch and open a PR against `main` whose description references the issue (`Closes #<n>`).
When the change touches the plugin UI or `code.js`, list in the PR description what the operator should check by hand in Figma, since no agent can run the plugin there.

## 3. Independent Codex review

From the worktree, with the PR branch checked out, run:

```
codex review --base main -c model="gpt-6.1-sol" -c model_reasoning_effort="high"
```

Use `model="gpt-6-astra"` when the operator asks for Astra.
Always pass the model and the effort explicitly; the operator's global Codex config has different defaults.
If the model is rejected, run `codex debug models` to read the current catalog and report the mismatch instead of silently choosing another model.
Show the operator Codex's findings verbatim.

## 4. Triage, fix, and re-review

Verify each finding against the code before acting on it.
Fix the findings that are real, in the same worktree, with the currently selected Claude Code model.
For each finding that is rejected, give a one-line reason.
Run the gate from step 2, push, and run the same Codex command again.
Repeat until Codex reports nothing new that is real, for at most three review rounds.
If the third round still produces real findings, stop and report them.

## 5. Bring the PR up to date

If checks are configured on the PR, watch them until they finish; when one fails, read its log, fix the cause, and push. Never retry blindly and never bypass a check.
If `main` moved and the branch conflicts or is out of date, bring it up to date and run the gate again.
A fix pushed after the last clean review gets one more Codex pass when it changes behavior, not only tests or formatting.

## 6. Merge and clean up

When the gate passes and the last review is clean, squash-merge the PR (`gh pr merge --squash --delete-branch`) with a Conventional Commits subject (`feat: …`, `fix(sheet): …`), matching the linear history on `main`.
Confirm the PR is merged and the commit is on `origin/main`.
Remove the worktree and the local branch.
Finish with a short report: what was implemented, what Codex found and how each finding was resolved, and the merged PR link.

## When to stop and ask

- A test in `test.js` that encodes a measured live behaviour has to change for the change to pass.
- A Codex finding requires a product or scope decision rather than a fix.
- Three review rounds did not converge.
- Verifying the change needs live API calls the issue did not ask for.
- The merge is blocked by branch protection or a conflict that cannot be resolved without changing behavior.

In each case, state what was found, give one recommended next action, and leave the PR open.
