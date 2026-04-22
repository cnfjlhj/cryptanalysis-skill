#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function run() {
  const repoRoot = path.join(__dirname, '..');
  const scriptPath = path.join(repoRoot, 'scripts', 'cryptanalysis-benchmark', 'run-cryptanalysis-demo.js');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cryptanalysis-demo-'));

  const allOutputDir = path.join(tempDir, 'all');
  const allResult = spawnSync('node', [
    scriptPath,
    '--demo', 'all',
    '--output-dir', allOutputDir,
    '--no-report'
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.strictEqual(allResult.status, 0, allResult.stderr || allResult.stdout);
  const allSummary = JSON.parse(allResult.stdout);
  assert.strictEqual(allSummary.demoName, 'all');
  assert.strictEqual(allSummary.caseRuns.length, 4);
  const observed = Object.fromEntries(allSummary.caseRuns.map((entry) => [entry.demoCase, entry.observedStatus]));
  assert.strictEqual(observed.completed, 'completed');
  assert.strictEqual(observed.needs_calibration, 'needs-calibration');
  assert.strictEqual(observed.unsupported, 'unsupported-current-scope');
  assert.strictEqual(observed.limited, 'limited');
  assert.ok(fs.existsSync(path.join(repoRoot, allSummary.summaryJsonPath)));
  assert.ok(fs.existsSync(path.join(repoRoot, allSummary.summaryMdPath)));

  const oneOutputDir = path.join(tempDir, 'single');
  const oneResult = spawnSync('node', [
    scriptPath,
    '--demo', 'completed',
    '--output-dir', oneOutputDir,
    '--no-report'
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.strictEqual(oneResult.status, 0, oneResult.stderr || oneResult.stdout);
  const oneSummary = JSON.parse(oneResult.stdout);
  assert.strictEqual(oneSummary.caseRuns.length, 1);
  assert.strictEqual(oneSummary.caseRuns[0].observedStatus, 'completed');

  console.log('✅ cryptanalysis demo runner checks passed');
}

run();
