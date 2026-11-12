#!/usr/bin/env node
/**
 * check-version.js
 * Verifies that:
 *   1. package.json "version" is valid semver
 *   2. CHANGELOG.md top entry matches that version
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// Read package version
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const version = pkg.version;

// Basic semver check
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error(`❌ package.json version "${version}" is not valid semver`);
  process.exit(1);
}

// Read CHANGELOG
let changelog = '';
try {
  changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
} catch {
  console.error('❌ CHANGELOG.md not found');
  process.exit(1);
}

// Find the first ## [x.y.z] heading
const match = changelog.match(/^##\s+\[([^\]]+)\]/m);
if (!match) {
  console.error('❌ No version entry found in CHANGELOG.md (expected ## [x.y.z])');
  process.exit(1);
}

const changelogVersion = match[1];
if (changelogVersion !== version) {
  console.error(
    `❌ Version mismatch: package.json="${version}" but CHANGELOG.md top entry="${changelogVersion}"`
  );
  process.exit(1);
}

process.stdout.write(`✅ Version check passed: ${version}\n`);
