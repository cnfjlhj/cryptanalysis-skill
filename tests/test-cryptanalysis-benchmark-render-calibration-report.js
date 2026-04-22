#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function run() {
  const repoRoot = path.join(__dirname, '..');
  const scriptPath = path.join(repoRoot, 'scripts', 'cryptanalysis-benchmark', 'render-calibration-report.js');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cryptanalysis-report-'));

  const verdictPath = path.join(tempDir, 'sample.verdict.json');
  const solverSummaryPath = path.join(tempDir, 'sample.solver-summary.json');
  const emissionSummaryPath = path.join(tempDir, 'sample.emission-summary.json');
  const ledgerPath = path.join(tempDir, 'sample.ledger.csv');
  const manifestPath = path.join(tempDir, 'sample.manifest.json');
  const outputTexPath = path.join(tempDir, 'sample.report.tex');
  const outputPdfPath = path.join(tempDir, 'sample.report.pdf');

  fs.writeFileSync(verdictPath, `${JSON.stringify({
    paperTitle: 'Sample PRESENT Calibration',
    caseId: 'present80-table4-r5-exact-v2',
    verdictLabel: 'optimal-consistent',
    supportMode: 'solver-certified-optimum',
    dominantMismatchStage: '',
    nextAction: '',
    expectedClaim: 'Table 4 reports a minimum active S-box count of 3.',
    observedClaim: 'Optimal objective 3 matches the published exact minimum 3.',
    solverEvidence: {
      modelStatusText: 'Optimal',
      objectiveValue: 3,
      certifiedLowerBound: 3,
      certifiedUpperBound: 3,
      mipGap: 0,
      generatedAt: '2026-04-22T08:30:00Z'
    },
    emissionEvidence: {
      effectiveRoundEnd: 5,
      sboxModel: 'exact',
      unitId: 'p1_compute_12r_lower_bound_model'
    }
  }, null, 2)}\n`, 'utf8');

  fs.writeFileSync(solverSummaryPath, `${JSON.stringify({
    model_status_text: 'Optimal',
    objective_function_value: 3,
    mip_dual_bound: 3,
    mip_gap: 0
  }, null, 2)}\n`, 'utf8');

  fs.writeFileSync(emissionSummaryPath, `${JSON.stringify({
    effectiveRoundEnd: 5,
    sboxModel: 'exact',
    unitId: 'p1_compute_12r_lower_bound_model'
  }, null, 2)}\n`, 'utf8');

  fs.writeFileSync(ledgerPath, 'paper_id,consistency_level\neprint-2013-676,optimal-consistent\n', 'utf8');

  fs.writeFileSync(manifestPath, `${JSON.stringify({
    caseId: 'present80-table4-r5-exact-v2',
    runLabel: 'sample-run',
    mode: 'emit-plus-verdict-from-existing-summary',
    emission: {
      roundEnd: 5,
      sboxModel: 'exact',
      unitId: 'p1_compute_12r_lower_bound_model',
      lpPath: path.join(tempDir, 'sample.lp'),
      summaryPath: emissionSummaryPath
    },
    solver: {
      summaryPath: solverSummaryPath,
      logPath: path.join(tempDir, 'sample.log'),
      solutionPath: path.join(tempDir, 'sample.sol')
    },
    verdict: {
      verdictPath,
      ledgerPath
    }
  }, null, 2)}\n`, 'utf8');

  const result = spawnSync('node', [
    scriptPath,
    '--manifest', manifestPath,
    '--output-tex', outputTexPath,
    '--output-pdf', outputPdfPath
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert.ok(fs.existsSync(outputTexPath), 'expected report .tex to exist');
  assert.ok(fs.existsSync(outputPdfPath), 'expected report .pdf to exist');

  const tex = fs.readFileSync(outputTexPath, 'utf8');
  assert.match(tex, /Cryptanalysis Calibration Report/);
  assert.match(tex, /Verdict: optimal-consistent/);
  assert.match(tex, /Observed Claim/);

  const summary = JSON.parse(result.stdout);
  assert.strictEqual(summary.compiledPdf, true);
  assert.ok(summary.outputTexPath.endsWith('sample.report.tex'));
  assert.ok(summary.outputPdfPath.endsWith('sample.report.pdf'));

  console.log('✅ cryptanalysis calibration report rendering checks passed');
}

run();
