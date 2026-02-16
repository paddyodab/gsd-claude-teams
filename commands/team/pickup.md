---
name: team:pickup
description: Pick up a phase from another developer — checkout, set up state, and get briefed
argument-hint: "<phase-number>"
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
---
<objective>
Onboard a developer onto a phase that someone else started (or that's unassigned). Sets up the developer's state, checks out the right branch, and provides a briefing on what's been done and what's next.

This is the counterpart to /team:handoff.
</objective>

<context>
Arguments: $ARGUMENTS

Required: phase number to pick up.
</context>

<process>

## Step 1: Identify the picking-up developer

Check if developer is already set in config:
```bash
node ~/.claude/get-shit-done/bin/gsd-tools.cjs state-path
```

If no developer is configured, ask for their name and run the /team:assign setup flow:
- Set developer in config.json
- Create STATE_{dev}.md if needed
- Create symlinks

## Step 2: Find the phase

```bash
node ~/.claude/get-shit-done/bin/gsd-tools.cjs find-phase <phase>
```

If the phase doesn't exist: "Phase <N> not found. Run /team:status to see available phases."

## Step 3: Check for existing branch

Look for a branch associated with this phase:
```bash
git branch -a | grep -i "phase.*<phase-number>"
```

Also check the ROADMAP or phase artifacts for branch references:
```bash
grep -r "branch" .planning/phases/<phase-dir>/ 2>/dev/null
```

If a branch exists:
```bash
git checkout <branch-name>
git pull origin <branch-name>
```

If no branch: ask if they want to create one or work on the current branch.

## Step 4: Read previous developer's state

Look for other developers' STATE files to understand phase history:
```bash
ls .planning/STATE_*.md 2>/dev/null
```

For each STATE file, check if it references this phase. Extract:
- What plans were completed
- Key decisions made
- Blockers encountered
- Where they left off

## Step 5: Read phase artifacts

Gather the briefing material:

```bash
# Phase research
cat .planning/phases/<phase-dir>/*-RESEARCH.md 2>/dev/null

# Completed plans and summaries
ls .planning/phases/<phase-dir>/*-PLAN.md 2>/dev/null
ls .planning/phases/<phase-dir>/*-SUMMARY.md 2>/dev/null

# Verification results
cat .planning/phases/<phase-dir>/*-VERIFICATION.md 2>/dev/null

# Phase context
cat .planning/phases/<phase-dir>/*-CONTEXT.md 2>/dev/null
```

## Step 6: Update new developer's state

Update the picking-up developer's STATE file to reflect they're now on this phase:

```bash
node ~/.claude/get-shit-done/bin/gsd-tools.cjs state patch \
  --"Current Phase" "<phase-number>" \
  --"Current Phase Name" "<phase-name>" \
  --"Status" "picking up from <previous-developer>"
```

## Step 7: Present briefing

Format a concise briefing:

```
# Phase <N>: <name> — Pickup Briefing

## Previous work
Developer: <previous-dev> (or "unassigned")
Plans completed: <list>
Plans remaining: <list>

## Key decisions
<from previous developer's STATE and SUMMARY files>

## Blockers / watch-outs
<any unresolved blockers or notes>

## Your starting point
Current plan: <N>-<NN>
Branch: <branch-name>
State file: STATE_<you>.md

## Suggested next action
<Based on phase state — plan, execute, or verify>
```

## Step 8: Confirm readiness

Ask: "Ready to start working on Phase <N>? Run /gsd:progress to see the full picture, or /gsd:execute-phase <N> to pick up execution."

</process>
