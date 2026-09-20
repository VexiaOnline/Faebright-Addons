#!/usr/bin/env node
/**
 * check-updates.js
 *
 * Dev tool: compares the addons installed in a WoW client against the catalog
 * and reports which ones are OUTDATED.
 *
 * It reads each installed addon's .faebright.json metadata file inside
 * Interface/AddOns/<folder>/ and matches it to the catalog via detailUrl.
 * The launcher writes that metadata on install; once it records "version",
 * this tool (and the launcher UI) can detect updates. Missing versions are
 * reported as UNKNOWN.
 *
 * Usage:
 *   node scripts/check-updates.js --path "/path/to/WoW" [--catalog addons.json]
 *
 * Exit code 1 when any addon is outdated (useful for CI).
 */
'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--path') out.gamePath = args[++i];
    else if (args[i] === '--catalog') out.catalog = args[++i];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.gamePath) {
  console.error('Usage: node scripts/check-updates.js --path <WoW_dir> [--catalog addons.json]');
  process.exit(2);
}

const catalogPath = path.resolve(args.catalog || path.join(__dirname, '..', 'addons.json'));
if (!fs.existsSync(catalogPath)) {
  console.error('Catalog not found at', catalogPath, '- run node scripts/build-catalog.js first');
  process.exit(2);
}
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const byDetailUrl = new Map(catalog.map((a) => [a.detailUrl, a]));

const addonsDir = path.join(args.gamePath, 'Interface', 'AddOns');
if (!fs.existsSync(addonsDir)) {
  console.error(`Interface/AddOns not found at ${addonsDir}`);
  process.exit(2);
}

let outdated = 0;
let upToDate = 0;
let unknown = 0;
let noMeta = 0;
const rows = [];

for (const folder of fs.readdirSync(addonsDir)) {
  if (folder.startsWith('.')) continue;
  const metaPath = path.join(addonsDir, folder, '.faebright.json');
  if (!fs.existsSync(metaPath)) {
    noMeta++;
    continue;
  }

  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch (e) {
    unknown++;
    rows.push(`UNKNOWN   ${folder.padEnd(32)} corrupt .faebright.json`);
    continue;
  }

  const entry = byDetailUrl.get(meta.detailUrl);
  const storedVersion = meta.version;

  if (!entry) {
    unknown++;
    rows.push(`UNKNOWN   ${folder.padEnd(32)} not in catalog`);
    continue;
  }
  if (!storedVersion) {
    unknown++;
    rows.push(`UNKNOWN   ${folder.padEnd(32)} no version recorded (reinstall to record one)`);
    continue;
  }
  if (String(storedVersion) === String(entry.version)) {
    upToDate++;
    rows.push(`OK        ${folder.padEnd(32)} v${storedVersion}`);
    continue;
  }

  outdated++;
  rows.push(`OUTDATED  ${folder.padEnd(32)} installed v${storedVersion} -> v${entry.version}`);
}

console.log(rows.length ? rows.join('\n') : 'No addons with metadata found.');
console.log(`\n${outdated} outdated, ${upToDate} up to date, ${unknown} unknown, ${noMeta} without metadata.`);
process.exit(outdated === 0 ? 0 : 1);