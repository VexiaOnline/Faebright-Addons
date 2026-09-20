#!/usr/bin/env node
/**
 * build-catalog.js
 *
 * Scans every ./addons/<slug>/addon.json manifest and generates the
 * launcher's addons.json catalog at the repo root.
 *
 * Every manifest MUST declare a semver-style "version" — the launcher uses it
 * to report "Update Available" for installed addons.
 *
 * Usage:  node scripts/build-catalog.js
 * Output: addons.json (repo root, overwritten)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REPO_CONFIG = path.join(ROOT, 'repo.config.json');
const ADDONS_DIR = path.join(ROOT, 'addons');
const OUT = path.join(ROOT, 'addons.json');

// Expansion keys supported by the launcher (order defines downloadUrl priority).
const EXPANSIONS = ['wotlk', 'tbc', 'classic'];
const SEMVER = /^\d+\.\d+(\.\d+)*$/;
const SLUG = /^[a-z0-9][a-z0-9_]*$/;

let failed = false;
function fail(msg) {
  failed = true;
  console.error(`[build-catalog] ERROR: ${msg}`);
}
function warn(msg) {
  console.warn(`[build-catalog] warning: ${msg}`);
}

function buildEntry(dir) {
  const slug = path.basename(dir);
  const manifestPath = path.join(dir, 'addon.json');

  if (!fs.existsSync(manifestPath)) {
    warn(`${slug}: missing addon.json, skipping`);
    return null;
  }

  let m;
  try {
    m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    fail(`${slug}: invalid JSON in addon.json (${e.message})`);
    return null;
  }

  if (typeof m.title !== 'string' || !m.title) {
    fail(`${slug}: "title" is required`);
    return null;
  }
  if (typeof m.version !== 'string' || !SEMVER.test(m.version)) {
    fail(`${slug}: "version" must be a semantic version like "1.0.0" (got "${m.version}")`);
    return null;
  }
  if (!m.downloads || typeof m.downloads !== 'object') {
    fail(`${slug}: "downloads" is required`);
    return null;
  }

  const downloads = {};
  let primary = null;
  for (const exp of EXPANSIONS) {
    const file = m.downloads[exp];
    if (!file) {
      downloads[exp] = null;
      continue;
    }
    const url = `${base}/${slug}/${file}`;
    downloads[exp] = url;
    if (!primary) primary = url;
  }
  if (!primary) {
    fail(`${slug}: no expansion downloads declared — add at least one zip`);
    return null;
  }

  const today = new Date().toISOString().slice(0, 10);
  const logo = m.logo && typeof m.logo === 'string' ? m.logo : 'logo.webp';

  return {
    slug,
    title: m.title,
    description: m.description || '',
    author: m.author || 'Unknown',
    image: `${base}/${slug}/${logo}`,
    detailUrl: `${gitBase}/${slug}`,
    version: m.version,
    gameVersion: m.gameVersion || '3.3.5',
    downloadCount: m.downloadCount || 0,
    lastUpdate: m.lastUpdate || today,
    uploadDate: m.uploadDate || today,
    downloadUrl: primary,
    downloads
  };
}

function main() {
  if (!fs.existsSync(REPO_CONFIG)) {
    fail(`missing repo.config.json — edit it with your GitHub repo details first`);
    return;
  }
  if (!fs.existsSync(ADDONS_DIR)) {
    fail('addons/ directory not found');
    return;
  }

  global.base = '';
  global.gitBase = '';
  let repo = null;
  try {
    repo = JSON.parse(fs.readFileSync(REPO_CONFIG, 'utf8'));
    if (!repo.owner || !repo.repo) throw new Error('owner and repo are required');
    global.base = `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/${repo.branch}/addons`;
    global.gitBase = `https://github.com/${repo.owner}/${repo.repo}/tree/${repo.branch}/addons`;
  } catch (e) {
    fail(`invalid repo.config.json (${e.message})`);
    return;
  }

  if (repo.owner === 'YOUR_GITHUB_USERNAME') {
    warn('repo.config.json still uses the placeholder owner — the catalog URLs will be placeholders');
  }

  const entries = [];
  for (const name of fs.readdirSync(ADDONS_DIR)) {
    if (name.startsWith('.')) continue;
    const dir = path.join(ADDONS_DIR, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    if (!SLUG.test(name)) {
      warn(`folder "${name}" is not a valid slug (lowercase, digits, underscores) — skipping`);
      continue;
    }
    const entry = buildEntry(dir);
    if (entry) entries.push(entry);
  }

  entries.sort((a, b) => a.title.localeCompare(b.title));
  fs.writeFileSync(OUT, JSON.stringify(entries, null, 2) + '\n');

  if (failed) {
    console.error(`\n[build-catalog] finished with errors — ${entries.length} valid addons written to addons.json, fix the errors above before committing.`);
    process.exitCode = 1;
  } else {
    console.log(`[build-catalog] wrote ${entries.length} addons to addons.json`);
  }
}

main();