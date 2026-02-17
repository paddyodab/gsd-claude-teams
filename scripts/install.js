#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HOME = process.env.HOME || process.env.USERPROFILE;
const GSD_DIR = path.join(HOME, '.claude', 'get-shit-done');
const GSD_VANILLA = path.join(HOME, '.claude', 'get-shit-done-vanilla');
const TEAM_CMD_DIR = path.join(HOME, '.claude', 'commands', 'team');

const REPO_ROOT = path.resolve(__dirname, '..');
const ADAPTED_GSD = path.join(REPO_ROOT, 'adapted', 'get-shit-done');
const TEAM_CMDS_SRC = path.join(REPO_ROOT, 'commands', 'team');

const uninstall = process.argv.includes('--uninstall');

function log(msg) { console.log(`  ${msg}`); }
function header(msg) { console.log(`\n${msg}`); }

// --- Uninstall ---
if (uninstall) {
  header('Uninstalling gsd-claude-teams...');

  // Remove symlink
  try {
    const stat = fs.lstatSync(GSD_DIR);
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(GSD_DIR);
      log('Removed symlink: ~/.claude/get-shit-done');
    } else {
      log('~/.claude/get-shit-done is not a symlink — skipping (not our install?)');
    }
  } catch {
    log('~/.claude/get-shit-done not found — nothing to remove');
  }

  // Restore vanilla
  if (fs.existsSync(GSD_VANILLA)) {
    fs.renameSync(GSD_VANILLA, GSD_DIR);
    log('Restored vanilla GSD from backup');
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

// 1. Check adapted files exist (sanity check)
if (!fs.existsSync(ADAPTED_GSD)) {
  log('ERROR: adapted/get-shit-done not found in repo.');
  log('Run: node scripts/transform.js first');
  process.exit(1);
}

// 2. Check vanilla GSD
let gsdStat;
try {
  gsdStat = fs.lstatSync(GSD_DIR);
} catch {
  gsdStat = null;
}

if (!gsdStat) {
  header('Vanilla GSD not found at ~/.claude/get-shit-done/');
  log('Install it first:');
  log('  npx get-shit-done-cc@latest');
  log('Then re-run this script.');
  process.exit(1);
}

// 3. Already installed?
if (gsdStat.isSymbolicLink()) {
  const target = fs.readlinkSync(GSD_DIR);
  const resolvedTarget = path.resolve(path.dirname(GSD_DIR), target);
  if (resolvedTarget === ADAPTED_GSD) {
    log('Already installed — symlink points to adapted/');
    log('Checking team commands...');
    // Fall through to copy team commands (idempotent)
  } else {
    log(`WARNING: ~/.claude/get-shit-done is a symlink to: ${target}`);
    log('This is unexpected. Remove it manually and re-run.');
    process.exit(1);
  }
} else {
  // 4. Backup vanilla
  if (fs.existsSync(GSD_VANILLA)) {
    log('Vanilla backup already exists at ~/.claude/get-shit-done-vanilla/');
    log('If this is stale, remove it and re-run.');
    process.exit(1);
  }
  fs.renameSync(GSD_DIR, GSD_VANILLA);
  log('Backed up vanilla GSD → ~/.claude/get-shit-done-vanilla/');

  // 5. Create symlink
  fs.symlinkSync(ADAPTED_GSD, GSD_DIR);
  log(`Symlinked: ~/.claude/get-shit-done → ${ADAPTED_GSD}`);
}

// 6. Copy team commands
fs.mkdirSync(TEAM_CMD_DIR, { recursive: true });
const cmds = fs.readdirSync(TEAM_CMDS_SRC).filter(f => f.endsWith('.md'));
for (const cmd of cmds) {
  fs.copyFileSync(path.join(TEAM_CMDS_SRC, cmd), path.join(TEAM_CMD_DIR, cmd));
}
log(`Installed ${cmds.length} team commands → ~/.claude/commands/team/`);

// 7. Smoke test
header('Running smoke test...');
try {
  const result = execSync(`node "${path.join(GSD_DIR, 'bin', 'gsd-tools.cjs')}" state-path`, {
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
