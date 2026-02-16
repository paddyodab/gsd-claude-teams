---
name: team:status
description: Show unified project status across all developers
argument-hint: "[--developer <name>]"
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
---
<objective>
Read all STATE_*.md files and present a unified view of who's working on what, phase progress, blockers, and recent decisions. Quick situational awareness for the whole team.
</objective>

<context>
Arguments: $ARGUMENTS

Optional: `--developer <name>` to show only one developer's state.
</context>

<process>

## Step 1: Discover state files

```bash
ls .planning/STATE_*.md 2>/dev/null
```

If no STATE_*.md files found, check for plain STATE.md (solo developer mode):
```bash
ls .planning/STATE.md 2>/dev/null
```

If nothing exists: "No state files found. Run /gsd:new-project to initialize, or /team:assign to set up a developer."

## Step 2: Read config for context

```bash
node ~/.claude/get-shit-done/bin/gsd-tools.cjs state load --raw
```

Get project name and current roadmap overview:
```bash
cat .planning/PROJECT.md 2>/dev/null | head -5
node ~/.claude/get-shit-done/bin/gsd-tools.cjs phases list --raw 2>/dev/null
```

## Step 3: Parse each state file

For each STATE_*.md file (or filtered to --developer if specified):

Extract from the file:
- **Developer name** (from filename: STATE_pat.md → pat)
- **Current Phase** (field: `**Current Phase:**`)
- **Current Phase Name** (field: `**Current Phase Name:**`)
- **Current Plan** (field: `**Current Plan:**`)
- **Status** (field: `**Status:**`)
- **Velocity** (field: `**Velocity:**`)
- **Blockers** (section: `## Blockers`)
- **Recent Decisions** (last 3 from `## Accumulated Context > ### Decisions`)
- **Last Session** (field: `**Last Session:**` or `**Updated:**`)

## Step 4: Present unified view

Format output as a team dashboard:

```
# Team Status: {project name}

## Developer: pat
Phase: 3 — API Integration
Plan: 3-02 (of 4)
Status: executing
Velocity: 2.1 plans/session
Blockers: none
Last active: 2026-02-16

## Developer: dustin
Phase: 5 — Frontend Polish
Plan: 5-01 (of 2)
Status: planning
Blockers: Waiting on API spec from Phase 3
Last active: 2026-02-15

---
Phases overview:
  1-2: ✅ complete
  3: pat (executing)
  4: unassigned
  5: dustin (planning)
  6-7: future
```

Adapt the format based on what data is actually available. Don't fabricate fields that aren't in the state files.

## Step 5: Flag issues

After the dashboard, note any concerns:
- Developers stuck on the same phase for multiple sessions
- Blockers that reference another developer's phase (cross-dependency)
- Phases with no one assigned
- Multiple developers assigned to the same phase (potential conflict)

Keep it brief — just flag, don't prescribe solutions.

</process>
