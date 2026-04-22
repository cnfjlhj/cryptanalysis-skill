#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function run() {
  const repoRoot = path.join(__dirname, '..');
  const scriptPath = path.join(repoRoot, 'scripts', 'cryptanalysis-benchmark', 'run-calibration-case.js');
  const referencePath = path.join(
    repoRoot,
    'docs',
    'cryptanalysis-benchmark',
    'trials',
    'eprint-2013-676',
    'calibration-reference.present80-rkdiff.json'
  );
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cryptanalysis-calibration-run-'));

  const outputDir5 = path.join(tempDir, 'r5');
  const run5 = spawnSync('node', [
    scriptPath,
    '--reference', referencePath,
    '--case-id', 'present80-table4-r5-exact-v2',
    '--solver-summary-input',
    path.join(
      repoRoot,
      'fixtures',
      'solver-summaries',
      'present80-r5-serverc.summary.json'
    ),
    '--run-label', 'serverC-ingest-r5',
    '--output-dir', outputDir5
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.strictEqual(run5.status, 0, run5.stderr || run5.stdout);
  const manifest5 = JSON.parse(run5.stdout);
  assert.strictEqual(manifest5.mode, 'emit-plus-verdict-from-existing-summary');
  assert.strictEqual(manifest5.verdict.verdictLabel, 'optimal-consistent');
  assert.ok(fs.existsSync(path.join(repoRoot, manifest5.emission.summaryPath)));
  assert.ok(fs.existsSync(path.join(repoRoot, manifest5.verdict.verdictPath)));
  assert.ok(fs.existsSync(path.join(repoRoot, manifest5.verdict.ledgerPath)));
  assert.ok(fs.existsSync(path.join(repoRoot, manifest5.report.texPath)));
  assert.ok(fs.existsSync(path.join(repoRoot, manifest5.report.pdfPath)));
  const verdict5 = JSON.parse(fs.readFileSync(path.join(repoRoot, manifest5.verdict.verdictPath), 'utf8'));
  assert.strictEqual(verdict5.emissionEvidence.sboxModel, 'exact');
  assert.strictEqual(verdict5.emissionEvidence.effectiveRoundEnd, 5);

  const outputDir12 = path.join(tempDir, 'r12');
  const run12 = spawnSync('node', [
    scriptPath,
    '--reference', referencePath,
    '--case-id', 'present80-12r-lower-bound-support',
    '--solver-summary-input',
    path.join(
      repoRoot,
      'fixtures',
      'solver-summaries',
      'present80-r12-local-highs-60s.summary.json'
    ),
    '--run-label', 'local-ingest-12r',
    '--output-dir', outputDir12
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.strictEqual(run12.status, 0, run12.stderr || run12.stdout);
  const manifest12 = JSON.parse(run12.stdout);
  assert.strictEqual(manifest12.verdict.verdictLabel, 'unresolved');
  const emission12 = JSON.parse(fs.readFileSync(path.join(repoRoot, manifest12.emission.summaryPath), 'utf8'));
  assert.strictEqual(emission12.effectiveRoundEnd, 12);
  assert.strictEqual(emission12.sboxModel, 'cdp');
  const verdict12 = JSON.parse(fs.readFileSync(path.join(repoRoot, manifest12.verdict.verdictPath), 'utf8'));
  assert.strictEqual(verdict12.emissionEvidence.effectiveRoundEnd, 12);
  assert.match(verdict12.observedClaim, /certified_lower_bound=1/);
  assert.ok(fs.existsSync(path.join(repoRoot, manifest12.report.texPath)));
  assert.ok(fs.existsSync(path.join(repoRoot, manifest12.report.pdfPath)));

  console.log('✅ cryptanalysis calibration case runner checks passed');
}

run();
