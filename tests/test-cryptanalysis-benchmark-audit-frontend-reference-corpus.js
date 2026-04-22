#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function run() {
  const repoRoot = path.join(__dirname, '..');
  const scriptPath = path.join(
    repoRoot,
    'scripts',
    'cryptanalysis-benchmark',
    'audit-frontend-reference-corpus.js'
  );
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cryptanalysis-frontend-corpus-'));

  const result = spawnSync('node', [
    scriptPath,
    '--output-dir', tempDir
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  const summary = JSON.parse(result.stdout);
  assert.strictEqual(summary.totals.totalCases, 4);
  assert.strictEqual(summary.totals.bundleAvailable, 4);
  assert.strictEqual(summary.totals.algorithmDescriptionGolden, 2);
  assert.strictEqual(summary.totals.structuralIrGolden, 2);
  assert.strictEqual(summary.totals.executionBacked, 1);
  assert.strictEqual(summary.totals.semanticBlocked, 1);
  assert.strictEqual(summary.totals.bundleOnly, 2);

  const byPaper = Object.fromEntries(summary.cases.map((entry) => [entry.paperId, entry]));
  assert.strictEqual(byPaper['eprint-2013-676'].currentFrontendCeiling, 'structural_ir_ready');
  assert.strictEqual(byPaper['eprint-2013-676'].downstreamStatus, 'execution_backed');
  assert.strictEqual(byPaper['eprint-2016-407'].downstreamStatus, 'semantic_blocked');
  assert.strictEqual(byPaper['eprint-2014-747'].currentFrontendCeiling, 'bundle_only');
  assert.strictEqual(byPaper['eprint-2022-513'].algorithmDescriptionStatus, 'missing');
  assert.ok(summary.cases.every((entry) => entry.validationErrors.length === 0));
  assert.ok(summary.cases.every((entry) => entry.missingArtifactPaths.length === 0));

  assert.ok(fs.existsSync(path.join(tempDir, 'frontend-reference-corpus-summary.json')));
  assert.ok(fs.existsSync(path.join(tempDir, 'frontend-reference-corpus-summary.md')));

  console.log('✅ cryptanalysis frontend reference corpus audit checks passed');
}

run();
