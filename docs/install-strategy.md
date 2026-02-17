# Install Strategy Research

How to deploy gsd-claude-teams so developers can set up with one command instead of manual symlink swapping. Internal company use — not publishing to npm.

## Prerequisites

Vanilla GSD must be installed first:
```bash
npx get-shit-done-cc@latest
# Interactive: asks global vs project, claude vs opencode vs gemini, etc.
```

This puts vanilla GSD at `~/.claude/get-shit-done/`. The team adaptation layers on top of that.

## Current Manual Process (what we're automating)

```bash
# 1. Install vanilla GSD (if not already)
npx get-shit-done-cc@latest

# 2. Clone gsd-claude-teams
git clone <repo-url>

# 3. Backup vanilla GSD
mv ~/.claude/get-shit-done ~/.claude/get-shit-done-vanilla

# 4. Symlink adapted files
ln -s /path/to/gsd-claude-teams/adapted/get-shit-done ~/.claude/get-shit-done

# 5. Install team commands
mkdir -p ~/.claude/commands/team
cp /path/to/gsd-claude-teams/commands/team/*.md ~/.claude/commands/team/

# 6. Verify
node ~/.claude/get-shit-done/bin/gsd-tools.cjs state-path
```

Uninstall:
```bash
rm ~/.claude/get-shit-done
mv ~/.claude/get-shit-done-vanilla ~/.claude/get-shit-done
rm ~/.claude/commands/team/{assign,status,handoff,pickup}.md
```

---

## Option A: Install Script (symlink-based)

**What it is:** A `scripts/install.js` in the gsd-claude-teams repo that automates the manual process above. Clone the repo, run one command.

**Install experience:**
```bash
git clone <gsd-claude-teams-repo>
node gsd-claude-teams/scripts/install.js
```

**What the script does:**
1. Checks if vanilla GSD exists at `~/.claude/get-shit-done/`
2. If it's already a symlink to adapted/, says "already installed"
3. If it's a real directory, moves it to `~/.claude/get-shit-done-vanilla/`
4. Creates symlink: `~/.claude/get-shit-done → <repo>/adapted/get-shit-done`
5. Copies `commands/team/*.md` to `~/.claude/commands/team/`
6. Runs smoke test: `node gsd-tools.cjs state-path`
7. Prints summary

**Uninstall:** `node gsd-claude-teams/scripts/install.js --uninstall`
- Removes symlink
- Restores vanilla from backup
- Removes team commands

### Pros
- Simple to build (~50-80 lines of JS)
- Mirrors GSD's own install.js pattern — familiar to anyone who's installed GSD
- Symlink means adapted/ updates are instant — `git pull` on gsd-claude-teams and you're running the latest
- No build step for consumers
- Uninstall is clean — vanilla GSD restored exactly

### Cons
- **Replaces vanilla GSD entirely.** You can't run vanilla GSD and adapted GSD side by side. If adapted has a bug, you have to uninstall or fix it.
- **Requires the gsd-claude-teams repo to stay cloned.** The symlink points into the repo. Delete the repo, GSD breaks. This means every developer needs the repo on their machine permanently.
- **GSD updates are a two-step process.** Update vanilla GSD (it goes into the backup), then pull gsd-claude-teams (which has its own submodule update + transform cycle). If someone runs `gsd-install --claude` it overwrites the symlink with a fresh vanilla install.
- **Path coupling.** If a developer moves the gsd-claude-teams repo, the symlink breaks. Fixable by re-running install, but it's a papercut.

### Risk Assessment
Low risk for internal use. The failure mode is "GSD stops working" which is immediately obvious and fixable with uninstall. No data loss, no subtle bugs.

### Upgrade Story
```bash
cd gsd-claude-teams
git pull                          # pulls updated adapted/ files
# Done — symlink already points here
```

If upstream GSD has a new version (maintainer workflow):
```bash
cd gsd-claude-teams
git submodule update --remote     # pull latest GSD
node scripts/transform.js         # regenerate adapted/
git add adapted/ && git commit    # commit the update
git push                          # everyone gets it on next pull
```

---

## Option B: Copy-based Install with Update Hook

**What it is:** Instead of symlinking, copy the adapted files into `~/.claude/get-shit-done/` directly. Use a version marker to detect when updates are available. Integrate with GSD's existing `/gsd:reapply-patches` pattern.

**Install experience:**
```bash
git clone <gsd-claude-teams-repo>
node gsd-claude-teams/scripts/install.js
```

**What the script does:**
1. Checks if vanilla GSD exists at `~/.claude/get-shit-done/`
2. Backs up vanilla to `~/.claude/get-shit-done-vanilla/`
3. **Copies** (not symlinks) adapted files to `~/.claude/get-shit-done/`
4. Copies team commands to `~/.claude/commands/team/`
5. Writes a version marker: `~/.claude/get-shit-done/.gsd-teams-version` with the git commit hash
6. Runs smoke test

**Update:** `node gsd-claude-teams/scripts/install.js --update`
- Pulls latest gsd-claude-teams
- Re-copies adapted files over the existing install
- Updates version marker

**Uninstall:** Same as Option A — restore from backup.

### Pros
- **No repo dependency at runtime.** Once installed, you can delete or move the gsd-claude-teams repo and GSD keeps working. The files are real copies, not symlinks.
- **Survives repo moves, renames, disk changes.** More robust for developers who reorganize their filesystem.
- **Version marker enables update detection.** `/team:status` could check the marker and warn if an update is available.
- **Compatible with GSD's own update flow.** If someone runs `/gsd:update`, it overwrites with vanilla — then `install.js --update` re-applies the team layer. This is similar to `/gsd:reapply-patches`.

### Cons
- **Updates require an explicit step.** `git pull` on gsd-claude-teams doesn't automatically update the installed files. Developer has to run `install.js --update`. This is the same pattern as vanilla GSD though.
- **Slightly more complex install script.** Need to handle recursive copy, preserve permissions, deal with partial updates.
- **Divergence risk.** If someone manually edits files in `~/.claude/get-shit-done/`, those edits get overwritten on update. Same risk as vanilla GSD though.
- **Duplicate storage.** The adapted files exist in the repo AND in `~/.claude/`. Minor — it's ~5MB total.

### Risk Assessment
Low risk. Same failure mode as Option A. The copy approach is actually more resilient — no dangling symlinks.

### Upgrade Story
```bash
cd gsd-claude-teams
git pull
node scripts/install.js --update
```

If upstream GSD has a new version (maintainer workflow): same as Option A.

---

## Option C: npm Package (private registry or git-based)

**What it is:** Package gsd-claude-teams as an npm module. Install via npm (from private registry, GitHub Packages, or direct git URL). Post-install hook does the setup.

**Install experience:**
```bash
# From git URL (no registry needed)
npm install -g git+https://github.com/<org>/gsd-claude-teams.git

# Or from GitHub Packages (if you set up a private registry)
npm install -g @yourorg/gsd-claude-teams
```

**What post-install does:**
Same as Option B — copies adapted files, installs commands, writes version marker.

**Update:** `npm update -g gsd-claude-teams`

### Pros
- **Familiar developer experience.** `npm install -g` is second nature.
- **Version management is built in.** npm handles versions, changelogs, rollback.
- **Works with git URLs — no npm registry needed.** `npm install -g git+ssh://...` installs directly from your private GitHub repo.
- **Clean uninstall.** `npm uninstall -g gsd-claude-teams` triggers pre-uninstall hook that restores vanilla.
- **No repo clone required.** The package contains everything. Developers don't need to keep a local clone.

### Cons
- **More packaging work.** Need package.json, post-install/pre-uninstall hooks, proper file structure. Maybe 2-3 hours of work.
- **npm lifecycle hooks are finicky.** Post-install scripts sometimes get blocked by npm security settings (`--ignore-scripts`). Developers may need to run the install script manually anyway.
- **Git URL installs are slow.** npm clones the whole repo, runs install. Not terrible but not instant.
- **Overkill for internal use.** If it's 3-5 people at a company, the ceremony of npm packaging may not be worth it.
- **GSD update interaction is the same problem.** Still need to handle the case where `/gsd:update` overwrites the adapted files.

### Risk Assessment
Low-medium. The npm packaging adds a layer of indirection that can mask issues. If the post-install hook fails silently, the developer might think they're running adapted GSD when they're not.

### Upgrade Story
```bash
npm update -g gsd-claude-teams
```

Maintainer workflow: same transform process, then `npm version patch && git push`.

---

## Comparison

| Factor | A: Symlink | B: Copy + Hook | C: npm Package |
|--------|-----------|---------------|----------------|
| **Setup effort** | ~50 lines | ~100 lines | ~200 lines + package.json |
| **Install command** | `git clone` + `node install.js` | Same | `npm install -g git+<url>` |
| **Runtime repo dependency** | Yes (symlink) | No (copied) | No (copied) |
| **Update flow** | `git pull` (instant) | `git pull` + `install --update` | `npm update -g` |
| **Resilience** | Breaks if repo moves | Robust | Robust |
| **GSD update compat** | Overwrites symlink | Overwrites copies | Overwrites copies |
| **Uninstall** | Clean | Clean | Clean |
| **Best for** | Solo/small team, dev machines | Internal teams, shared onboarding | Wider distribution |

---

## Recommendation

For internal company use with a small team:

**Start with Option A (symlink).** It's what we're already doing manually. The install script just automates it. Instant updates via `git pull`. If the team is 2-5 people who all understand the setup, this is the right level of ceremony.

**Graduate to Option B if** any of these become true:
- Developers keep breaking their setup by moving repos or running `/gsd:update`
- Onboarding new developers is friction-heavy
- You want the gsd-claude-teams repo to be optional after install (not everyone needs to keep it cloned)

**Option C makes sense only if** you're distributing beyond your immediate team or want npm's version management. For internal use, it's overhead without proportional benefit.

---

## The `/gsd:update` Problem (all options)

When someone runs `/gsd:update`, vanilla GSD's installer overwrites `~/.claude/get-shit-done/` with fresh vanilla files. This breaks the team adaptation regardless of install method.

**Mitigations:**
1. **Document it:** "After running `/gsd:update`, re-run `node install.js`"
2. **Hook into it:** Add a post-update hook or wrapper around `/gsd:update` that re-applies the team layer
3. **Detect it:** `/team:status` checks for the version marker and warns if the team layer is missing
4. **Prevent it:** Override `/gsd:update` with a team-aware version that updates vanilla inside the submodule, re-runs transform, and re-installs

Option 4 is the cleanest long-term but requires maintaining a custom `/gsd:update` command.
