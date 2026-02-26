#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HOME = process.env.HOME || process.env.USERPROFILE;
const GSD_DIR = path.join(HOME, '.claude', 'get-shit-done');
const GSD_VANILLA = path.join(HOME, '.claude', 'get-shit-done-vanilla');
const TEAM_CMD_DIR = path.join(HOME, '.claude', 'commands', 'team');
const MANIFEST_FILE = '.gsd-teams-manifest.json';

const REPO_ROOT = path.resolve(__dirname, '..');
const ADAPTED_DIR = path.join(REPO_ROOT, 'adapted');
const TEAM_CMDS_SRC = path.join(REPO_ROOT, 'commands', 'team');

const uninstall = process.argv.includes('--uninstall');

function log(msg) { console.log(`  ${msg}`); }
function header(msg) { console.log(`\n${msg}`); }

/**
 * Recursively copy a directory tree.
 */
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Recursively delete a directory (rm -rf equivalent).
 */
function rmSync(target) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

/**
 * Walk a directory and return all file paths relative to it.
 */
function walkRelative(dir, base) {
  base = base || dir;
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walkRelative(full, base));
    } else {
      results.push(path.relative(base, full));
    }
  }
  return results;
}

/**
 * Check if GSD_DIR is our install (has manifest).
 */
function isOurInstall() {
  return fs.existsSync(path.join(GSD_DIR, MANIFEST_FILE));
}

// --- Uninstall ---
if (uninstall) {
  header('Uninstalling gsd-claude-teams...');

  // Remove GSD dir (symlink or our merged directory)
  try {
    const stat = fs.lstatSync(GSD_DIR);
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(GSD_DIR);
      log('Removed symlink: ~/.claude/get-shit-done');
    } else if (stat.isDirectory() && isOurInstall()) {
      rmSync(GSD_DIR);
      log('Removed merged install: ~/.claude/get-shit-done');
    } else {
      log('~/.claude/get-shit-done exists but is not our install — skipping');
      log('(no .gsd-teams-manifest.json found)');
    }
  } catch {
    log('~/.claude/get-shit-done not found — nothing to remove');
  }

  // Restore vanilla
  if (fs.existsSync(GSD_VANILLA)) {
    if (!fs.existsSync(GSD_DIR)) {
      fs.renameSync(GSD_VANILLA, GSD_DIR);
      log('Restored vanilla GSD from backup');
    } else {
      log('~/.claude/get-shit-done still exists — cannot restore vanilla backup');
    }
  } else {
    log('No vanilla backup found at ~/.claude/get-shit-done-vanilla');
    log('Run: npx get-shit-done-cc@latest to reinstall vanilla GSD');
  }

  // Remove team commands
  const teamCmds = ['assign.md', 'status.md', 'handoff.md', 'pickup.md'];
  for (const cmd of teamCmds) {
    const target = path.join(TEAM_CMD_DIR, cmd);
    if (fs.existsSync(target)) fs.unlinkSync(target);
  }
  log('Removed team commands from ~/.claude/commands/team/');

  header('Done. Vanilla GSD restored.\n');
  process.exit(0);
}

// --- Install ---
header('Installing gsd-claude-teams...');

// 1. Check adapted files exist
if (!fs.existsSync(ADAPTED_DIR)) {
  log('ERROR: adapted/ directory not found in repo.');
  log('Run: node scripts/transform.js first');
  process.exit(1);
}

// 2. Check current state
let gsdStat;
try {
  gsdStat = fs.lstatSync(GSD_DIR);
} catch {
  gsdStat = null;
}

if (!gsdStat) {
  // No GSD at all — need vanilla installed first
  if (!fs.existsSync(GSD_VANILLA)) {
    header('Vanilla GSD not found at ~/.claude/get-shit-done/');
    log('Install it first:');
    log('  npx get-shit-done-cc@latest');
    log('Then re-run this script.');
    process.exit(1);
  }
  // Vanilla backup exists but GSD_DIR is gone (maybe mid-reinstall) — we can proceed
  log('Using existing vanilla backup as base');
}

// 3. Determine if we need to back up vanilla
if (gsdStat) {
  if (gsdStat.isSymbolicLink()) {
    // Old-style symlink install — remove it, we'll use the backup
    log('Found old symlink install — removing');
    fs.unlinkSync(GSD_DIR);
    if (!fs.existsSync(GSD_VANILLA)) {
      log('ERROR: Old symlink removed but no vanilla backup found');
      log('Run: npx get-shit-done-cc@latest and then re-run this script');
      process.exit(1);
    }
  } else if (isOurInstall()) {
    // Re-install — our merged directory exists, just rebuild it
    log('Existing gsd-teams install detected — rebuilding');
    rmSync(GSD_DIR);
  } else {
    // Fresh vanilla directory — back it up
    if (fs.existsSync(GSD_VANILLA)) {
      log('Vanilla backup already exists at ~/.claude/get-shit-done-vanilla/');
      log('If this is stale, remove it and re-run.');
      process.exit(1);
    }
    fs.renameSync(GSD_DIR, GSD_VANILLA);
    log('Backed up vanilla GSD → ~/.claude/get-shit-done-vanilla/');
  }
}

// 4. Copy vanilla as base
log('Copying vanilla GSD as base...');
copyDirSync(GSD_VANILLA, GSD_DIR);

// 5. Overlay adapted files
log('Overlaying adapted patches...');
const adaptedFiles = walkRelative(ADAPTED_DIR);
for (const relPath of adaptedFiles) {
  const src = path.join(ADAPTED_DIR, relPath);
  const dest = path.join(GSD_DIR, relPath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}
log(`Overlaid ${adaptedFiles.length} adapted files`);

// 6. Write manifest
const manifest = {
  installedAt: new Date().toISOString(),
  repoRoot: REPO_ROOT,
  overlaidFiles: adaptedFiles,
};
fs.writeFileSync(
  path.join(GSD_DIR, MANIFEST_FILE),
  JSON.stringify(manifest, null, 2) + '\n'
);
log('Wrote .gsd-teams-manifest.json');

// 7. Copy team commands
fs.mkdirSync(TEAM_CMD_DIR, { recursive: true });
const cmds = fs.readdirSync(TEAM_CMDS_SRC).filter(f => f.endsWith('.md'));
for (const cmd of cmds) {
  fs.copyFileSync(path.join(TEAM_CMDS_SRC, cmd), path.join(TEAM_CMD_DIR, cmd));
}
log(`Installed ${cmds.length} team commands → ~/.claude/commands/team/`);

// 8. Smoke test
header('Running smoke test...');
try {
  const result = execSync(`node "${path.join(GSD_DIR, 'bin', 'gsd-tools.cjs')}" state`, {
    encoding: 'utf8',
    timeout: 10000,
  });
  log(`state-path output: ${result.trim()}`);
  log('Smoke test passed');
} catch (err) {
  log('WARNING: Smoke test failed — state-path command errored');
  log(err.message.split('\n')[0]);
  log('Install completed but something may be off. Check manually.');
}

header('Done! gsd-claude-teams is installed.\n');
log('To update:  cd gsd-claude-teams && git pull');
log('To remove:  node scripts/install.js --uninstall\n');
