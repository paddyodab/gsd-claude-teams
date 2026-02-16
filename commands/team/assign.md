---
name: team:assign
description: Claim a phase as a developer — sets developer name, creates state files, and optionally creates a branch
argument-hint: "<developer-name> [phase-number]"
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
Set up a developer's working environment for team-based GSD work.

Creates per-developer state isolation so multiple developers can work on different phases without clobbering each other's STATE.md, agent-history.json, or current-agent-id.txt.
</objective>

<context>
Arguments: $ARGUMENTS

Expected: `<developer-name>` and optionally `<phase-number>`
Example: `/team:assign pat 3` or `/team:assign pat`
</context>

<process>

## Step 1: Parse arguments

Extract developer name (required) and phase number (optional) from $ARGUMENTS.

If no developer name provided, ask the user.

Developer name should be lowercase, short (e.g., "pat", "dustin", "alex"). No spaces.

## Step 2: Set developer in config.json

Read `.planning/config.json`. Add or update the `developer` field:

```bash
# Read current config
node gsd-tools.cjs config-get developer --raw 2>/dev/null

# If config.json exists, update it. If not, create it.
```

Read `.planning/config.json`, parse as JSON, set `"developer": "<name>"`, write it back. Preserve all existing fields.

If `.planning/config.json` doesn't exist, run:
```bash
node gsd-tools.cjs config-ensure-section
```
Then set the developer field.

## Step 3: Create per-developer state file

Check if `.planning/STATE_<developer>.md` exists.

- If it doesn't exist but `.planning/STATE.md` does: copy STATE.md as the starting point
  ```bash
  cp .planning/STATE.md .planning/STATE_<developer>.md
  ```
- If neither exists: this is fine — GSD will create state on first operation
- If it already exists: leave it alone, it has accumulated context

## Step 4: Create STATE.md symlink

The symlink lets `@.planning/STATE.md` file includes (which can't be dynamic) resolve to the right developer's state.

```bash
# Back up existing STATE.md if it's a regular file (not already a symlink)
if [ -f .planning/STATE.md ] && [ ! -L .planning/STATE.md ]; then
  # Only back up if we haven't already copied it to STATE_<developer>.md
  echo "Note: .planning/STATE.md is a regular file. It was used as the base for STATE_<developer>.md."
fi

# Create symlink (force overwrite if one exists)
ln -sf STATE_<developer>.md .planning/STATE.md
```

Verify the symlink works:
```bash
ls -la .planning/STATE.md
```

## Step 5: Create per-developer agent tracking files (if needed)

Same pattern for agent-history and current-agent-id:

```bash
# Only if originals exist — these are created on first use anyway
if [ -f .planning/agent-history.json ] && [ ! -L .planning/agent-history.json ]; then
  cp .planning/agent-history.json .planning/agent-history_<developer>.json 2>/dev/null || true
fi
ln -sf agent-history_<developer>.json .planning/agent-history.json

# current-agent-id.txt is ephemeral — just symlink, no copy needed
ln -sf current-agent-id_<developer>.txt .planning/current-agent-id.txt
```

## Step 6: Claim phase (if phase number provided)

If a phase number was provided:

1. Verify the phase exists: `node gsd-tools.cjs find-phase <phase>`
2. Update the developer's STATE file to set current phase
3. Optionally create a feature branch using the configured branching strategy:
   ```bash
   # Read branch template from config
   node gsd-tools.cjs config-get phase_branch_template --raw
   # Default: gsd/phase-{phase}-{slug}
   # Create branch: git checkout -b <branch-name>
   ```

Ask the user if they want a feature branch created. If branching_strategy is 'none' in config, skip this.

## Step 7: Confirm setup

Print a summary:

```
Developer: <name>
State file: .planning/STATE_<name>.md
Symlink: STATE.md -> STATE_<name>.md
Config: developer = "<name>"
Phase: <N> (if claimed) or "none claimed"
Branch: <branch> (if created) or "on current branch"
```

State what the developer can do next:
- If phase claimed: "Run /gsd:plan-phase <N> to plan your phase, or /gsd:execute-phase <N> if plans exist."
- If no phase: "Run /gsd:progress to see available phases."

</process>
