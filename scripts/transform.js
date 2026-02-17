#!/usr/bin/env node

/**
 * GSD Teams Transform Script
 *
 * Copies original/get-shit-done/ → adapted/ with per-developer state isolation.
 * Re-run after pulling upstream GSD updates (git submodule update).
 *
 * Touch points:
 *   1. gsd-tools.cjs — inject getDeveloper() + resolveStatePath(), patch 15 statePath assignments
 *   2. Markdown files — route raw cat/@ STATE.md references through gsd-tools.cjs
 *   3. Markdown files — route agent-history.json and current-agent-id.txt through gsd-tools.cjs
 *   4. gsd-tools.cjs — patch the single current-agent-id.txt reference
 *
 * Touch point 5 (absolute paths) is handled at runtime by /team:handoff, not here.
 */

const fs = require('fs');
const path = require('path');

const SOURCE = path.resolve(__dirname, '..', 'original', 'get-shit-done');
const DEST = path.resolve(__dirname, '..', 'adapted');

// Documentation files — don't transform references in these
const SKIP_TRANSFORM = new Set(['CHANGELOG.md', 'README.md', 'USER-GUIDE.md', 'LICENSE']);

// ─── gsd-tools.cjs patches ──────────────────────────────────────────────────

// Helper function to inject at the top of gsd-tools.cjs (after the existing requires)
const GET_DEVELOPER_FN = `
// ─── GSD Teams: per-developer state isolation ────────────────────────────────
function getDeveloper() {
  // CLI flag: --developer <name>
  const flagIdx = process.argv.indexOf('--developer');
  if (flagIdx !== -1 && process.argv[flagIdx + 1]) {
    return process.argv[flagIdx + 1];
  }
  // Environment variable
  if (process.env.GSD_DEVELOPER) {
    return process.env.GSD_DEVELOPER;
  }
  // config.json developer field
  try {
    const cfgRaw = fs.readFileSync(path.join(process.cwd(), '.planning', 'config.json'), 'utf-8');
    const cfg = JSON.parse(cfgRaw);
    if (cfg.developer) return cfg.developer;
  } catch {}
  return null;
}

function resolveStatePath(baseDir) {
  const dev = getDeveloper();
  const stateFile = dev ? \`STATE_\${dev}.md\` : 'STATE.md';
  return path.join(baseDir, stateFile);
}

function resolveAgentHistoryPath(baseDir) {
  const dev = getDeveloper();
  const file = dev ? \`agent-history_\${dev}.json\` : 'agent-history.json';
  return path.join(baseDir, file);
}

function resolveCurrentAgentIdPath(baseDir) {
  const dev = getDeveloper();
  const file = dev ? \`current-agent-id_\${dev}.txt\` : 'current-agent-id.txt';
  return path.join(baseDir, file);
}
// ─── End GSD Teams injection ─────────────────────────────────────────────────
`;

// New CLI subcommand to expose state path to shell scripts
const STATE_PATH_CMD = `
  // ─── GSD Teams: expose resolved paths to shell ──────────────────────────────
  if (command === 'state-path') {
    process.stdout.write(resolveStatePath(path.join(cwd, '.planning')));
    process.exit(0);
  }
  if (command === 'agent-history-path') {
    process.stdout.write(resolveAgentHistoryPath(path.join(cwd, '.planning')));
    process.exit(0);
  }
  if (command === 'current-agent-id-path') {
    process.stdout.write(resolveCurrentAgentIdPath(path.join(cwd, '.planning')));
    process.exit(0);
  }
`;

function patchGsdTools(content) {
  let patched = content;
  let stats = { statePathReplacements: 0, injectedHelpers: false, injectedCommands: false, agentIdReplacement: false };

  // 1. Inject getDeveloper() + helpers after the top-level require block
  //    Must inject at module scope (after the 3 top-level requires), NOT after
  //    inline require() calls deep in functions (which would scope our helpers wrong)
  const topLevelRequireMarker = "const { execSync } = require('child_process');";
  const markerIdx = patched.indexOf(topLevelRequireMarker);
  if (markerIdx === -1) {
    throw new Error('Could not find top-level require block in gsd-tools.cjs');
  }
  const endOfRequireLine = patched.indexOf('\n', markerIdx);
  patched = patched.slice(0, endOfRequireLine + 1) + GET_DEVELOPER_FN + patched.slice(endOfRequireLine + 1);
  stats.injectedHelpers = true;

  // 2. Replace all `const statePath = path.join(cwd, '.planning', 'STATE.md');`
  //    with `const statePath = resolveStatePath(path.join(cwd, '.planning'));`
  const statePathPattern1 = /const statePath = path\.join\(cwd, '\.planning', 'STATE\.md'\);/g;
  patched = patched.replace(statePathPattern1, (match) => {
    stats.statePathReplacements++;
    return "const statePath = resolveStatePath(path.join(cwd, '.planning'));";
  });

  // Handle the one case using planningDir instead of cwd
  const statePathPattern2 = /const statePath = path\.join\(planningDir, 'STATE\.md'\);/g;
  patched = patched.replace(statePathPattern2, (match) => {
    stats.statePathReplacements++;
    return "const statePath = resolveStatePath(planningDir);";
  });

  // 3. Replace current-agent-id.txt reference
  const agentIdPattern = /path\.join\(cwd, '\.planning', 'current-agent-id\.txt'\)/g;
  patched = patched.replace(agentIdPattern, (match) => {
    stats.agentIdReplacement = true;
    return "resolveCurrentAgentIdPath(path.join(cwd, '.planning'))";
  });

  // 4. Inject state-path/agent-history-path/current-agent-id-path CLI commands
  //    Inject before the switch(command) dispatch
  const dispatchMarker = "switch (command) {";
  const dispatchIdx = patched.indexOf(dispatchMarker);
  if (dispatchIdx === -1) {
    throw new Error('Could not find switch(command) dispatch in gsd-tools.cjs');
  }
  patched = patched.slice(0, dispatchIdx) + STATE_PATH_CMD + '\n  ' + patched.slice(dispatchIdx);
  stats.injectedCommands = true;

  return { patched, stats };
}

// ─── Markdown patches ────────────────────────────────────────────────────────

// Full path to gsd-tools.cjs as used in GSD's own markdown files
const GSD_TOOLS = '~/.claude/get-shit-done/bin/gsd-tools.cjs';

function patchMarkdown(content, filePath) {
  let patched = content;
  const relPath = path.relative(SOURCE, filePath);
  let changes = 0;

  // Replace shell cat/read commands for STATE.md with gsd-tools.cjs resolution
  // Pattern: cat .planning/STATE.md → cat "$(node ~/.claude/.../gsd-tools.cjs state-path)"
  patched = patched.replace(
    /cat\s+\.planning\/STATE\.md(\s+2>\/dev\/null)?/g,
    (match, devnull) => { changes++; return `cat "$(node ${GSD_TOOLS} state-path)"${devnull || ''}`; }
  );

  // @.planning/STATE.md file includes — left as-is.
  // These resolve at Claude Code prompt load time before any shell runs.
  // /team:assign creates a symlink STATE.md → STATE_{dev}.md to make them work.

  // Replace --files .planning/STATE.md in commit commands
  patched = patched.replace(
    /(--files\s+(?:[^\n]*?))(\.planning\/STATE\.md)/g,
    (match, prefix, stateRef) => { changes++; return `${prefix}"$(node ${GSD_TOOLS} state-path)"`; }
  );

  // Replace agent-history.json references in bash contexts
  patched = patched.replace(
    /\.planning\/agent-history\.json/g,
    () => { changes++; return `"$(node ${GSD_TOOLS} agent-history-path)"`; }
  );

  // Replace current-agent-id.txt references in bash contexts
  patched = patched.replace(
    /\.planning\/current-agent-id\.txt/g,
    () => { changes++; return `"$(node ${GSD_TOOLS} current-agent-id-path)"`; }
  );

  return { patched, changes, relPath };
}

// ─── File walking & copying ──────────────────────────────────────────────────

function walkDir(dir) {
  const entries = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    if (entry.isDirectory()) {
      entries.push(...walkDir(fullPath));
    } else {
      entries.push(fullPath);
    }
  }
  return entries;
}

function transform() {
  console.log('GSD Teams Transform');
  console.log('===================');
  console.log(`Source: ${SOURCE}`);
  console.log(`Dest:   ${DEST}`);
  console.log('');

  if (!fs.existsSync(SOURCE)) {
    console.error('ERROR: Source directory not found. Run: git submodule update --init');
    process.exit(1);
  }

  // Clean destination
  if (fs.existsSync(DEST)) {
    fs.rmSync(DEST, { recursive: true });
  }

  const files = walkDir(SOURCE);
  let mdPatched = 0;
  let mdSkipped = 0;
  let copied = 0;
  let toolsStats = null;

  for (const srcPath of files) {
    const relPath = path.relative(SOURCE, srcPath);
    const destPath = path.join(DEST, relPath);
    const destDir = path.dirname(destPath);
    const fileName = path.basename(srcPath);

    // Ensure destination directory exists
    fs.mkdirSync(destDir, { recursive: true });

    // gsd-tools.cjs gets special treatment
    if (fileName === 'gsd-tools.cjs') {
      const content = fs.readFileSync(srcPath, 'utf-8');
      const { patched, stats } = patchGsdTools(content);
      fs.writeFileSync(destPath, patched, 'utf-8');
      toolsStats = stats;
      console.log(`  PATCHED  ${relPath}`);
      console.log(`           → ${stats.statePathReplacements} statePath replacements`);
      console.log(`           → injected getDeveloper() + resolve helpers`);
      console.log(`           → injected state-path/agent-history-path/current-agent-id-path commands`);
      console.log(`           → agent-id replacement: ${stats.agentIdReplacement}`);
      continue;
    }

    // Markdown files get path transforms (unless they're documentation)
    if (fileName.endsWith('.md') && !SKIP_TRANSFORM.has(fileName)) {
      const content = fs.readFileSync(srcPath, 'utf-8');
      const { patched, changes } = patchMarkdown(content, srcPath);
      fs.writeFileSync(destPath, patched, 'utf-8');
      if (changes > 0) {
        mdPatched++;
        console.log(`  PATCHED  ${relPath} (${changes} changes)`);
      } else {
        mdSkipped++;
      }
      continue;
    }

    // Everything else: straight copy
    fs.copyFileSync(srcPath, destPath);
    copied++;
  }

  // Validation
  console.log('');
  console.log('Summary');
  console.log('-------');
  console.log(`Total files:      ${files.length}`);
  console.log(`Straight copies:  ${copied}`);
  console.log(`MD patched:       ${mdPatched}`);
  console.log(`MD unchanged:     ${mdSkipped}`);

  if (toolsStats) {
    if (toolsStats.statePathReplacements !== 15) {
      console.error(`\nWARNING: Expected 15 statePath replacements, got ${toolsStats.statePathReplacements}`);
      console.error('The upstream gsd-tools.cjs may have changed. Review manually.');
    } else {
      console.log(`\ngsd-tools.cjs:    ✓ 15/15 statePath replacements`);
    }
  } else {
    console.error('\nWARNING: gsd-tools.cjs not found in source!');
  }

  console.log('\nDone. Adapted files are in adapted/');
}

transform();
