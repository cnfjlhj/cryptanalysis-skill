#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function run() {
  const repoRoot = path.join(__dirname, '..');
  const scriptPath = path.join(repoRoot, 'scripts', 'cryptanalysis-benchmark', 'render-verdict.js');
  const referencePath = path.join(
    repoRoot,
    'docs',
    'cryptanalysis-benchmark',
    'trials',
    'eprint-2013-676',
    'calibration-reference.present80-rkdiff.json'
  );
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cryptanalysis-verdict-'));

  const optimalOutputPath = path.join(tempDir, 'r5.verdict.json');
  const optimalLedgerPath = path.join(tempDir, 'r5.ledger.csv');
  const optimal = spawnSync('node', [
    scriptPath,
    '--reference', referencePath,
    '--case-id', 'present80-table4-r5-exact-v2',
    '--solver-summary',
    path.join(
      repoRoot,
      'fixtures',
      'solver-summaries',
      'present80-r5-serverc.summary.json'
    ),
    '--run-label', 'serverC-highs-tuned-300s',
    '--output', optimalOutputPath,
    '--ledger-row-output', optimalLedgerPath
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.strictEqual(optimal.status, 0, optimal.stderr || optimal.stdout);
  assert.ok(fs.existsSync(optimalOutputPath), 'expected optimal verdict JSON to be created');
  assert.ok(fs.existsSync(optimalLedgerPath), 'expected optimal ledger CSV to be created');
  const optimalVerdict = JSON.parse(optimal.stdout);
  assert.strictEqual(optimalVerdict.verdictLabel, 'optimal-consistent');
  assert.strictEqual(optimalVerdict.legacyConsistencyLevel, 'paper-consistent');
  assert.strictEqual(optimalVerdict.dominantMismatchStage, '');
  assert.strictEqual(optimalVerdict.solverEvidence.objectiveValue, 3.0000000000000004);
  assert.match(optimalVerdict.observedClaim, /objective=3/);
  const optimalLedger = fs.readFileSync(optimalLedgerPath, 'utf8');
  assert.match(optimalLedger, /consistency_level/);
  assert.match(optimalLedger, /optimal-consistent/);

  const feasible = spawnSync('node', [
    scriptPath,
    '--reference', referencePath,
    '--case-id', 'present80-table4-r6-exact-v2',
    '--solver-summary',
    path.join(
      repoRoot,
      'fixtures',
      'solver-summaries',
      'present80-r6-serverc-seed2.summary.json'
    ),
    '--run-label', 'serverC-highs-tuned-300s-seed2'
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.strictEqual(feasible.status, 0, feasible.stderr || feasible.stdout);
  const feasibleVerdict = JSON.parse(feasible.stdout);
  assert.strictEqual(feasibleVerdict.verdictLabel, 'feasible-match-only');
  assert.strictEqual(feasibleVerdict.dominantMismatchStage, 'validation_gap');
  assert.strictEqual(feasibleVerdict.legacyConsistencyLevel, 'heuristic-only');
  assert.match(feasibleVerdict.observedClaim, /objective=5/);
  assert.match(feasibleVerdict.observedClaim, /certified_lower_bound=1/);

  const unresolved = spawnSync('node', [
    scriptPath,
    '--reference', referencePath,
    '--case-id', 'present80-12r-lower-bound-support',
    '--solver-summary',
    path.join(
      repoRoot,
      'fixtures',
      'solver-summaries',
      'present80-r12-local-highs-60s.summary.json'
    ),
    '--emission-summary',
    path.join(
      repoRoot,
      'fixtures',
      'emission-summaries',
      'present80-r12-local.summary.json'
    ),
    '--run-label', 'local-highs-60s'
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.strictEqual(unresolved.status, 0, unresolved.stderr || unresolved.stdout);
  const unresolvedVerdict = JSON.parse(unresolved.stdout);
  assert.strictEqual(unresolvedVerdict.verdictLabel, 'unresolved');
  assert.strictEqual(unresolvedVerdict.dominantMismatchStage, 'validation_gap');
  assert.strictEqual(unresolvedVerdict.emissionEvidence.effectiveRoundEnd, 12);
  assert.match(unresolvedVerdict.observedClaim, /objective=38/);
  assert.match(unresolvedVerdict.observedClaim, /certified_lower_bound=1/);

  const fakeMismatchSummaryPath = path.join(tempDir, 'fake-r6-mismatch.summary.json');
  fs.writeFileSync(fakeMismatchSummaryPath, `${JSON.stringify({
    model_path: '/tmp/fake-r6.lp',
    time_limit_seconds: 300,
    threads: 1,
    read_status: 'HighsStatus.kOk',
    solve_status: 'HighsStatus.kWarning',
    model_status_code: 'HighsModelStatus.kTimeLimit',
    model_status_text: 'Time limit reached',
    objective_function_value: 4,
    mip_dual_bound: 1,
    mip_gap: 0.75,
    primal_solution_status: 2,
    generated_at: '2026-04-22T05:40:00Z'
  }, null, 2)}\n`, 'utf8');

  const mismatch = spawnSync('node', [
    scriptPath,
    '--reference', referencePath,
    '--case-id', 'present80-table4-r6-exact-v2',
    '--solver-summary', fakeMismatchSummaryPath,
    '--run-label', 'fake-mismatch'
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.strictEqual(mismatch.status, 0, mismatch.stderr || mismatch.stdout);
  const mismatchVerdict = JSON.parse(mismatch.stdout);
  assert.strictEqual(mismatchVerdict.verdictLabel, 'mismatch');
  assert.strictEqual(mismatchVerdict.dominantMismatchStage, 'validation_gap');
  assert.match(mismatchVerdict.observedClaim, /objective=4/);

  console.log('✅ cryptanalysis verdict rendering checks passed');
}

run();
