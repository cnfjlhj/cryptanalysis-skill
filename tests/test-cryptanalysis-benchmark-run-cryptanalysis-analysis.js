#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function run() {
  const repoRoot = path.join(__dirname, '..');
  const scriptPath = path.join(repoRoot, 'scripts', 'cryptanalysis-benchmark', 'run-cryptanalysis-analysis.js');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cryptanalysis-analysis-'));

  const supportedRequestPath = path.join(tempDir, 'supported-request.json');
  writeJson(supportedRequestPath, {
    requestId: 'present80-r5-supported',
    bundleState: 'frozen-bundle',
    paperId: 'eprint-2013-676',
    primitiveFamily: 'spn',
    primitiveId: 'PRESENT-80',
    attackFamily: 'related_key_differential',
    differenceModel: 'xor',
    targetCaseId: 'present80-table4-r5-exact-v2',
    sourceBundle: ['attack-paper', 'primitive-reference'],
    notes: 'Supported checkpoint rerun using an existing serverC summary.'
  });

  const supportedOutputDir = path.join(tempDir, 'supported-output');
  const supported = spawnSync('node', [
    scriptPath,
    '--request', supportedRequestPath,
    '--output-dir', supportedOutputDir,
    '--run-label', 'supported',
    '--solver-summary-input',
    path.join(
      repoRoot,
      'fixtures',
      'solver-summaries',
      'present80-r5-serverc.summary.json'
    )
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.strictEqual(supported.status, 0, supported.stderr || supported.stdout);
  const supportedResult = JSON.parse(supported.stdout);
  assert.strictEqual(supportedResult.status, 'completed');
  assert.strictEqual(supportedResult.route.selectedMode, 'calibrate');
  assert.strictEqual(supportedResult.outcome.paperVerdictLabel, 'optimal-consistent');
  assert.ok(fs.existsSync(path.join(repoRoot, supportedResult.artifacts.analysisResultPath)));
  assert.ok(fs.existsSync(path.join(repoRoot, supportedResult.artifacts.topLevelReportTexPath)));
  assert.ok(fs.existsSync(path.join(repoRoot, supportedResult.artifacts.topLevelReportPdfPath)));
  assert.ok(fs.existsSync(path.join(repoRoot, supportedResult.artifacts.delegatedManifestPath)));
  assert.ok(fs.existsSync(path.join(repoRoot, supportedResult.artifacts.delegatedVerdictPath)));
  assert.ok(fs.existsSync(path.join(repoRoot, supportedResult.artifacts.delegatedCalibrationReportPdfPath)));

  const needsCalibrationRequestPath = path.join(tempDir, 'needs-calibration-request.json');
  writeJson(needsCalibrationRequestPath, {
    requestId: 'present80-r24-extension',
    bundleState: 'frozen-bundle',
    paperId: 'eprint-2013-676',
    primitiveFamily: 'spn',
    primitiveId: 'present80',
    attackFamily: 'related-key-differential',
    differenceModel: 'xor_differential',
    roundEnd: 24,
    targetClaim: 'Need the 24-round claim, not a currently validated checkpoint.',
    sourceBundle: ['attack-paper']
  });

  const needsCalibrationOutputDir = path.join(tempDir, 'needs-calibration-output');
  const needsCalibration = spawnSync('node', [
    scriptPath,
    '--request', needsCalibrationRequestPath,
    '--output-dir', needsCalibrationOutputDir,
    '--run-label', 'needs-calibration'
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.strictEqual(needsCalibration.status, 0, needsCalibration.stderr || needsCalibration.stdout);
  const needsCalibrationResult = JSON.parse(needsCalibration.stdout);
  assert.strictEqual(needsCalibrationResult.status, 'needs-calibration');
  assert.strictEqual(needsCalibrationResult.route.selectedMode, 'calibrate');
  assert.strictEqual(needsCalibrationResult.outcome.paperVerdictLabel, '');
  assert.ok(fs.existsSync(path.join(repoRoot, needsCalibrationResult.artifacts.analysisResultPath)));
  assert.ok(fs.existsSync(path.join(repoRoot, needsCalibrationResult.artifacts.topLevelReportPdfPath)));
  assert.strictEqual(needsCalibrationResult.artifacts.delegatedManifestPath, '');

  const unsupportedRequestPath = path.join(tempDir, 'unsupported-request.json');
  writeJson(unsupportedRequestPath, {
    requestId: 'simon-unsupported',
    bundleState: 'frozen-bundle',
    paperId: 'eprint-2013-676',
    primitiveFamily: 'feistel',
    primitiveId: 'SIMON-32/64',
    attackFamily: 'related_key_differential',
    differenceModel: 'xor',
    targetClaim: 'Check a SIMON related-key differential lane.',
    sourceBundle: ['attack-paper']
  });

  const unsupportedOutputDir = path.join(tempDir, 'unsupported-output');
  const unsupported = spawnSync('node', [
    scriptPath,
    '--request', unsupportedRequestPath,
    '--output-dir', unsupportedOutputDir,
    '--run-label', 'unsupported'
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.strictEqual(unsupported.status, 0, unsupported.stderr || unsupported.stdout);
  const unsupportedResult = JSON.parse(unsupported.stdout);
  assert.strictEqual(unsupportedResult.status, 'unsupported-current-scope');
  assert.strictEqual(unsupportedResult.route.selectedMode, 'scope-reject');
  assert.ok(fs.existsSync(path.join(repoRoot, unsupportedResult.artifacts.analysisResultPath)));
  assert.ok(fs.existsSync(path.join(repoRoot, unsupportedResult.artifacts.topLevelReportTexPath)));
  assert.ok(fs.existsSync(path.join(repoRoot, unsupportedResult.artifacts.topLevelReportPdfPath)));

  const limitedRequestPath = path.join(tempDir, 'limited-request.json');
  writeJson(limitedRequestPath, {
    requestId: 'limited-intake',
    bundleState: 'raw-input',
    primitiveId: 'PRESENT-80'
  });

  const limitedOutputDir = path.join(tempDir, 'limited-output');
  const limited = spawnSync('node', [
    scriptPath,
    '--request', limitedRequestPath,
    '--output-dir', limitedOutputDir,
    '--run-label', 'limited'
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.strictEqual(limited.status, 0, limited.stderr || limited.stdout);
  const limitedResult = JSON.parse(limited.stdout);
  assert.strictEqual(limitedResult.status, 'limited');
  assert.strictEqual(limitedResult.route.selectedMode, 'intake');
  assert.ok(Array.isArray(limitedResult.outcome.missingFields));
  assert.ok(limitedResult.outcome.missingFields.length >= 1);
  assert.ok(fs.existsSync(path.join(repoRoot, limitedResult.artifacts.topLevelReportPdfPath)));

  const noReportRequestPath = path.join(tempDir, 'no-report-request.json');
  writeJson(noReportRequestPath, {
    requestId: 'present80-no-report',
    bundleState: 'frozen_bundle',
    paperId: 'eprint-2013-676',
    primitiveFamily: 'spn',
    primitiveId: 'PRESENT-80',
    attackFamily: 'related_key_differential',
    differenceModel: 'xor',
    targetCaseId: 'present80-table4-r5-exact-v2'
  });

  const noReportOutputDir = path.join(tempDir, 'no-report-output');
  const noReport = spawnSync('node', [
    scriptPath,
    '--request', noReportRequestPath,
    '--output-dir', noReportOutputDir,
    '--run-label', 'no-report',
    '--solver-summary-input',
    path.join(
      repoRoot,
      'fixtures',
      'solver-summaries',
      'present80-r5-serverc.summary.json'
    ),
    '--no-report'
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.strictEqual(noReport.status, 0, noReport.stderr || noReport.stdout);
  const noReportResult = JSON.parse(noReport.stdout);
  assert.strictEqual(noReportResult.status, 'completed');
  assert.strictEqual(noReportResult.artifacts.topLevelReportTexPath, '');
  assert.strictEqual(noReportResult.artifacts.topLevelReportPdfPath, '');
  assert.strictEqual(noReportResult.artifacts.delegatedCalibrationReportPdfPath, '');

  const bundleSupportedPath = path.join(tempDir, 'bundle-supported.json');
  writeJson(bundleSupportedPath, {
    bundle_id: 'bundle-supported',
    source_items: [
      {
        id: 'attack-paper',
        kind: 'attack_paper_pdf',
        label: 'eprint 2013/676 pdf'
      },
      {
        id: 'primitive-paper',
        kind: 'primitive_paper_pdf',
        label: 'PRESENT CHES 2007 pdf'
      }
    ],
    paper: {
      id: 'eprint-2013-676'
    },
    primitive: {
      id: 'PRESENT-80',
      family: 'spn'
    },
    attack: {
      family: 'related_key_differential',
      difference_model: 'xor'
    },
    target: {
      case_id: 'present80-table4-r5-exact-v2',
      round_end: 5,
      sbox_model: 'exact'
    }
  });

  const bundleSupportedOutputDir = path.join(tempDir, 'bundle-supported-output');
  const bundleSupported = spawnSync('node', [
    scriptPath,
    '--bundle', bundleSupportedPath,
    '--output-dir', bundleSupportedOutputDir,
    '--run-label', 'bundle-supported',
    '--solver-summary-input',
    path.join(
      repoRoot,
      'fixtures',
      'solver-summaries',
      'present80-r5-serverc.summary.json'
    )
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.strictEqual(bundleSupported.status, 0, bundleSupported.stderr || bundleSupported.stdout);
  const bundleSupportedResult = JSON.parse(bundleSupported.stdout);
  assert.strictEqual(bundleSupportedResult.runtime.inputMode, 'bundle');
  assert.strictEqual(bundleSupportedResult.status, 'completed');
  assert.ok(fs.existsSync(path.join(repoRoot, bundleSupportedResult.artifacts.bundleCopyPath)));
  assert.ok(fs.existsSync(path.join(repoRoot, bundleSupportedResult.artifacts.intakeResultPath)));
  assert.ok(fs.existsSync(path.join(repoRoot, bundleSupportedResult.artifacts.primitiveCardPath)));
  assert.ok(fs.existsSync(path.join(repoRoot, bundleSupportedResult.artifacts.attackCardPath)));
  assert.ok(fs.existsSync(path.join(repoRoot, bundleSupportedResult.artifacts.topLevelReportPdfPath)));

  const bundleLimitedPath = path.join(tempDir, 'bundle-limited.json');
  writeJson(bundleLimitedPath, {
    bundle_id: 'bundle-limited',
    source_items: [
      {
        id: 'attack-paper',
        kind: 'attack_paper_pdf',
        label: 'some attack paper'
      }
    ],
    primitive: {
      id: 'PRESENT-80'
    }
  });

  const bundleLimitedOutputDir = path.join(tempDir, 'bundle-limited-output');
  const bundleLimited = spawnSync('node', [
    scriptPath,
    '--bundle', bundleLimitedPath,
    '--output-dir', bundleLimitedOutputDir,
    '--run-label', 'bundle-limited'
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.strictEqual(bundleLimited.status, 0, bundleLimited.stderr || bundleLimited.stdout);
  const bundleLimitedResult = JSON.parse(bundleLimited.stdout);
  assert.strictEqual(bundleLimitedResult.runtime.inputMode, 'bundle');
  assert.strictEqual(bundleLimitedResult.status, 'limited');
  assert.ok(Array.isArray(bundleLimitedResult.outcome.intakeWarnings));
  assert.ok(fs.existsSync(path.join(repoRoot, bundleLimitedResult.artifacts.bundleCopyPath)));
  assert.ok(fs.existsSync(path.join(repoRoot, bundleLimitedResult.artifacts.intakeResultPath)));
  assert.ok(fs.existsSync(path.join(repoRoot, bundleLimitedResult.artifacts.topLevelReportPdfPath)));

  console.log('✅ top-level cryptanalysis analysis runner checks passed');
}

run();
