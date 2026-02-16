# .planning/ Path Analysis

Which paths need per-developer isolation vs. staying shared.

## Shared (stay at `.planning/`)

These are project-level artifacts that all developers read. One copy, on main.

| Path | Purpose |
|------|---------|
| `.planning/PROJECT.md` | Project description and key decisions |
| `.planning/REQUIREMENTS.md` | Requirements specification |
| `.planning/ROADMAP.md` | Phase breakdown with ownership (team layer adds owner fields) |
| `.planning/config.json` | GSD settings (+ new `developer` field for team use) |
| `.planning/research/` | Project-level research (STACK, ARCHITECTURE, etc.) |

## Per-Developer (need isolation)

These are execution-state artifacts. Two developers running different phases would clobber each other.

| Path | Isolated As | Purpose |
|------|-------------|---------|
| `.planning/STATE.md` | `.planning/STATE_{dev}.md` | Global position tracker — per-dev view |
| `.planning/agent-history.json` | `.planning/agent-history_{dev}.json` | Tracks which agents ran |
| `.planning/current-agent-id.txt` | `.planning/current-agent-id_{dev}.txt` | Currently running agent |
| `.planning/debug/` | `.planning/debug_{dev}/` | Debug session state |
| `.planning/todos/` | Shared — low conflict | Ideas captured during sessions |

## Phase-Scoped (naturally isolated)

These live under `.planning/phases/{nn}-{slug}/` and are already phase-specific. If each developer works a different phase, these don't conflict.

| Path Pattern | Purpose |
|-------------|---------|
| `.planning/phases/XX-name/XX-RESEARCH.md` | Phase research |
| `.planning/phases/XX-name/XX-NN-PLAN.md` | Execution plans |
| `.planning/phases/XX-name/XX-NN-SUMMARY.md` | Completion summaries |
| `.planning/phases/XX-name/XX-VERIFICATION.md` | Phase verification |
| `.planning/phases/XX-name/XX-CONTEXT.md` | Phase context |

---

## Chosen Strategy: Per-Developer State Files (STATE_{dev}.md)

Each developer gets their own state file. All state files are committed so decisions and context are visible to the whole team. A merged `STATE.md` can be generated for a unified project view.

### Why This Over Other Options

- **Branch-only isolation (rejected)**: STATE.md rebasing conflicts are constant friction, not just at merge time
- **Gitignoring state (rejected)**: Loses accumulated decisions and cross-phase context — the most valuable parts of STATE.md
- **Per-developer state dirs (rejected)**: Deeper path changes than needed. `STATE_{dev}.md` achieves isolation without restructuring directories

### How It Works

1. `config.json` gets a `developer` field (set by `/team:assign` or manually)
2. `gsd-tools.cjs` resolves `STATE_{developer}.md` instead of `STATE.md`
3. Each developer's state file tracks their phase position, velocity, decisions, session info
4. All `STATE_*.md` files are committed — everyone can see everyone's state
5. `/team:status` reads all `STATE_*.md` files for a unified project view

---

## Transform Specification

### Touch Point 1: gsd-tools.cjs (the chokepoint)

**File:** `get-shit-done/bin/gsd-tools.cjs` (187KB bundled JS)

Every state operation builds the path the same way:
```js
const statePath = path.join(cwd, '.planning', 'STATE.md');
```

~15 occurrences. All need to resolve to:
```js
const developer = getDeveloper(); // from config.json or env
const stateFile = developer ? `STATE_${developer}.md` : 'STATE.md';
const statePath = path.join(cwd, '.planning', stateFile);
```

**Functions that read/write STATE.md via gsd-tools.cjs:**
- `state load` — reads STATE.md
- `state get [section]` — reads a section
- `state patch --field val` — batch updates
- `state advance-plan` — increments current plan
- `state update-progress` — recalculates progress bar
- `state record-metric` — adds performance metric
- `state add-decision` — adds decision
- `state add-blocker` / `state resolve-blocker` — blocker management
- `state record-session` — updates session info
- `state-snapshot` — structured parse
- `init` commands that `--include state`

**Developer resolution order:**
1. `--developer` CLI flag (explicit override)
2. `GSD_DEVELOPER` environment variable
3. `developer` field in `.planning/config.json`
4. Fallback to `STATE.md` (solo developer — backwards compatible)

### Touch Point 2: Markdown prompts (raw cat/read references)

~10-15 references across workflows and agents that bypass gsd-tools.cjs:

```bash
# These need substitution:
cat .planning/STATE.md 2>/dev/null
@.planning/STATE.md          # Claude Code file include syntax
```

Replace with:
```bash
cat .planning/STATE_${DEVELOPER}.md 2>/dev/null
@.planning/STATE_${DEVELOPER}.md
```

Where `${DEVELOPER}` is resolved from config.json at transform time.

**Files with raw STATE.md reads (need prompt transformation):**
- `agents/gsd-executor.md` (lines 27-32)
- `agents/gsd-planner.md` (lines 841-846)
- `workflows/transition.md` (line 28)
- `workflows/execute-plan.md` (line 6)
- `workflows/execute-phase.md` (line 10)
- `workflows/resume-project.md` (lines 38, 253-279)
- `commands/gsd/*.md` — `@.planning/STATE.md` file includes (~15 commands)

### Touch Point 3: Git commit commands

gsd-tools.cjs commit commands include STATE.md in file lists:

```bash
node gsd-tools.cjs commit "docs(...): ..." --files .planning/STATE.md .planning/ROADMAP.md
```

These need to reference `STATE_{developer}.md` instead.

**Files with commit commands referencing STATE.md:**
- `workflows/execute-plan.md` (line 393)
- `workflows/execute-phase.md` (line 368)
- `workflows/discuss-phase.md` (line 426)
- `workflows/new-milestone.md` (lines 74, 324)
- `workflows/complete-milestone.md` (line 595)
- `agents/gsd-executor.md` (line 402)
- `references/planning-config.md` (lines 43, 59)
- `references/git-integration.md` (line 132)

### Touch Point 4: agent-history.json and current-agent-id.txt

Same pattern, fewer references (~5 total):

```bash
# In workflows/execute-plan.md:
.planning/agent-history.json    → .planning/agent-history_{developer}.json
.planning/current-agent-id.txt  → .planning/current-agent-id_{developer}.txt
```

### Touch Point 5: Absolute paths in generated plans (handoff cleanup only)

GSD's planner bakes absolute paths into PLAN.md files:

```markdown
# execution_context — points to plan creator's GSD install
@/Users/paddyodabb/.claude/get-shit-done/workflows/execute-plan.md

# task actions — points to plan creator's repo checkout
cd /Users/paddyodabb/my-projects/GitHub/survey-services

# summaries — absolute paths in artifact lists
✓ /Users/paddyodabb/my-projects/GitHub/survey-services/apps/pipeline-back/app/main.py
```

**This is NOT a pre-execution transform.** The person who plans a phase also executes it — the absolute paths are correct for them. These paths only become a readability problem after execution, when the artifacts are committed to the repo.

**Fix: `/team:handoff` normalizes paths before creating the PR:**
- `@/Users/{anyone}/.claude/get-shit-done/...` → `@~/.claude/get-shit-done/...`
- `/Users/{anyone}/.../repo-name/some/path` → `some/path` (repo-relative)

This is cosmetic cleanup, not functional. If someone needs to re-execute a plan (unusual), they'd re-plan on their own machine.

**Edge case:** If someone plans a phase but hands it off unexecuted, the receiver should re-plan. Their environment may differ, and the absolute paths definitely will.

---

## Build Script Requirements

A `scripts/transform.js` that:

1. Reads `original/get-shit-done/` as source
2. Copies to `adapted/` with these transformations:
   - In `gsd-tools.cjs`: Patch statePath resolution to use developer-aware filename
   - In `*.md` files: Replace `STATE.md` → `STATE_${DEVELOPER}.md` where it's a file path (not prose description)
   - In `*.md` files: Replace `agent-history.json` → `agent-history_${DEVELOPER}.json`
   - In `*.md` files: Replace `current-agent-id.txt` → `current-agent-id_${DEVELOPER}.txt`
3. Preserves everything else unchanged
4. Can be re-run when upstream GSD updates (submodule pull + re-transform)

**The regex must be careful:** "STATE.md" appears in prose ("Update STATE.md with...") and in paths (`.planning/STATE.md`, `--files .planning/STATE.md`). The transform should only replace path-context references, not prose mentions. Prose mentions can stay as-is — they're instructions to the LLM, not file operations.

Actually, replacing prose mentions too is fine and arguably better — it tells the LLM to look for the right file name. The only references to leave alone are in CHANGELOG.md, README.md, and USER-GUIDE.md (documentation, not operational).

---

## Backwards Compatibility

When `developer` is not set in config.json:
- gsd-tools.cjs falls back to `STATE.md`
- Transform script uses `STATE.md` (no suffix)
- Solo developer experience is identical to vanilla GSD

This means gsd-claude-teams can be used by a single developer with zero overhead. The team features activate when you set a developer name.
