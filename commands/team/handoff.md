---
name: team:handoff
description: Verify work, normalize paths in committed artifacts, and create a PR to main
argument-hint: "[phase-number]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
---
<objective>
Prepare completed or in-progress work for merging to main. This is the "I'm done with this phase (or pausing it)" workflow. It ensures artifacts are clean, paths are normalized, and a PR is created for review.

Three steps: verify → normalize → PR.
</objective>

<context>
Arguments: $ARGUMENTS

Optional phase number. If not provided, uses the current phase from the developer's STATE file.
</context>

<process>

## Step 1: Identify developer and phase

Read developer from config:
```bash
node ~/.claude/get-shit-done/bin/gsd-tools.cjs state-path
```

Extract developer name from the state path (STATE_pat.md → pat). If no developer set, ask the user.

Determine phase:
- If phase argument provided, use it
- Otherwise, read current phase from the developer's STATE file

Verify the phase directory exists:
```bash
node ~/.claude/get-shit-done/bin/gsd-tools.cjs find-phase <phase>
```

## Step 2: Pre-flight checks

Verify we're on a feature branch (not main/master):
```bash
git branch --show-current
```

If on main: warn the user. Handoff works best from a feature branch. Ask if they want to create one now.

Check for uncommitted changes:
```bash
git status --porcelain
```

If there are uncommitted changes: ask the user if they want to commit first. Don't auto-commit — they may want to be selective.

## Step 3: Verify work (lightweight)

Run a quick verification check. This is NOT the full /gsd:verify-work — it's a sanity check:

1. Check that SUMMARY.md files exist for completed plans:
   ```bash
   ls .planning/phases/<phase-dir>/*-SUMMARY.md 2>/dev/null
   ```

2. Check that the STATE file reflects the phase work:
   ```bash
   cat "$(node ~/.claude/get-shit-done/bin/gsd-tools.cjs state-path)"
   ```

3. Report: "Found N summaries for M plans. STATE shows phase at plan X of Y."

If summaries are missing for completed plans, warn but don't block. The developer may be handing off mid-phase.

## Step 4: Normalize absolute paths in artifacts

This is the cosmetic cleanup. Scan committed planning artifacts for absolute paths and normalize them.

### 4a: Find files to clean

```bash
# Phase-specific artifacts
ls .planning/phases/<phase-dir>/*.md

# STATE file
echo "$(node ~/.claude/get-shit-done/bin/gsd-tools.cjs state-path)"
```

### 4b: Normalize paths

For each file, apply these replacements:

**GSD install paths** (execution_context references):
```
@/Users/<anyone>/.claude/get-shit-done/... → @~/.claude/get-shit-done/...
```
Pattern: `@/Users/[^/]+/.claude/get-shit-done/` → `@~/.claude/get-shit-done/`

**Repository absolute paths** (task actions, file lists):
```
/Users/<anyone>/.../<repo-name>/some/path → some/path
```

To find the repo root for normalization:
```bash
git rev-parse --show-toplevel
```
Then strip that prefix from any absolute paths that start with it.

**Home directory references** (other contexts):
```
/Users/<anyone>/... → ~/...
```

### 4c: Apply changes

Use Edit tool to apply normalizations in each affected file. Show the user what changed:

```
Normalized paths in:
  .planning/phases/03-api/03-01-SUMMARY.md (4 paths)
  .planning/phases/03-api/03-02-PLAN.md (2 paths)
  .planning/STATE_pat.md (1 path)
```

If no absolute paths found: "No absolute paths to normalize — artifacts are clean."

## Step 5: Commit normalization changes

If any paths were normalized:
```bash
git add .planning/
git commit -m "chore: normalize absolute paths in phase <N> artifacts for handoff"
```

## Step 6: Create PR

Push the branch and create a PR:

```bash
git push -u origin $(git branch --show-current)
```

Create the PR with a summary of the phase work:

```bash
gh pr create --title "Phase <N>: <phase-name> — <developer>" --body "$(cat <<'EOF'
## Phase <N>: <phase-name>

**Developer:** <developer>
**Status:** <completed|in-progress>

### What was done
<bulleted list from SUMMARY files or STATE decisions>

### Artifacts
- STATE_<developer>.md — updated with phase progress
- <list of SUMMARY, PLAN, VERIFICATION files>

### Path normalization
<N> absolute paths normalized to relative/home paths for readability.

### Next steps
<from STATE file — what comes next>
EOF
)"
```

## Step 7: Report

```
Handoff complete.

PR: <url>
Branch: <branch-name>
Developer: <name>
Phase: <N> — <name>
Status: <completed|in-progress>
Paths normalized: <N> files, <M> replacements

Next: Reviewer merges PR. Another developer can /team:pickup <phase> to continue.
```

</process>
