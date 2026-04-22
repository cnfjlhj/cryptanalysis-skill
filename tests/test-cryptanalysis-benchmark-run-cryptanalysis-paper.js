#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function run() {
  const repoRoot = path.join(__dirname, '..');
  const scriptPath = path.join(repoRoot, 'scripts', 'cryptanalysis-benchmark', 'run-cryptanalysis-paper.js');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cryptanalysis-paper-'));

  const supportedOutputDir = path.join(tempDir, 'supported');
  const supported = spawnSync('node', [
    scriptPath,
    '--paper',
    path.join(
      repoRoot,
      'docs',
      'cryptanalysis-benchmark',
      'trials',
      'eprint-2013-676',
      'eprint-2013-676.pdf'
    ),
    '--output-dir', supportedOutputDir
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.strictEqual(supported.status, 0, supported.stderr || supported.stdout);
  const supportedResult = JSON.parse(supported.stdout);
  assert.strictEqual(supportedResult.paperId, 'eprint-2013-676');
  assert.strictEqual(supportedResult.chosenVariant, 'supported');
  assert.strictEqual(supportedResult.reusedStableSummary, true);
  assert.strictEqual(supportedResult.result.status, 'completed');
  assert.ok(fs.existsSync(path.join(repoRoot, supportedResult.bundlePath)));
  assert.ok(fs.existsSync(path.join(repoRoot, supportedResult.result.artifacts.analysisResultPath)));

  const extensionOutputDir = path.join(tempDir, 'extension');
  const extension = spawnSync('node', [
    scriptPath,
    '--paper',
    path.join(
      repoRoot,
      'docs',
      'cryptanalysis-benchmark',
      'trials',
      'eprint-2013-676',
      'eprint-2013-676.pdf'
    ),
    '--variant', 'extension_24r',
    '--output-dir', extensionOutputDir,
    '--no-report'
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.strictEqual(extension.status, 0, extension.stderr || extension.stdout);
  const extensionResult = JSON.parse(extension.stdout);
  assert.strictEqual(extensionResult.chosenVariant, 'extension_24r');
  assert.strictEqual(extensionResult.result.status, 'needs-calibration');

  const unknownPaperPath = path.join(tempDir, 'mystery-paper.pdf');
  fs.writeFileSync(unknownPaperPath, 'placeholder', 'utf8');
  const unknownOutputDir = path.join(tempDir, 'unknown');
  const unknown = spawnSync('node', [
    scriptPath,
    '--paper', unknownPaperPath,
    '--output-dir', unknownOutputDir,
    '--no-report'
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.strictEqual(unknown.status, 0, unknown.stderr || unknown.stdout);
  const unknownResult = JSON.parse(unknown.stdout);
  assert.strictEqual(unknownResult.chosenVariant, 'fallback');
  assert.strictEqual(unknownResult.result.status, 'limited');
  assert.ok(fs.existsSync(path.join(repoRoot, unknownResult.bundlePath)));

  console.log('✅ cryptanalysis paper-entry runner checks passed');
}

run();
