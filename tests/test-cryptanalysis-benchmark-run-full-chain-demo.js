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
    'run-cryptanalysis-full-chain-demo.js'
  );
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cryptanalysis-full-chain-'));

  const result = spawnSync('node', [
    scriptPath,
    '--output-dir', tempDir,
    '--no-report'
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  const brief = JSON.parse(result.stdout);
  const summaryJsonPath = path.join(repoRoot, brief.summaryJsonPath);
  assert.ok(fs.existsSync(summaryJsonPath));
  const summary = JSON.parse(fs.readFileSync(summaryJsonPath, 'utf8'));
  assert.strictEqual(summary.intakeReadyForRouting, true);
  assert.strictEqual(summary.verdictLabel, 'optimal-consistent');
  assert.ok(summary.semanticAttachmentPath.endsWith('02-normalized/semantic-attachment.generated.json'));
  assert.ok(summary.instantiationPath.endsWith('02-normalized/model-instantiation.generated.json'));
  assert.ok(summary.manifestPath.includes('03-backend'));
  assert.ok(fs.existsSync(path.join(repoRoot, brief.zhSummaryPath)));
  assert.ok(fs.existsSync(path.join(repoRoot, summary.semanticAttachmentPath)));
  assert.ok(fs.existsSync(path.join(repoRoot, summary.instantiationPath)));
  assert.ok(fs.existsSync(path.join(repoRoot, summary.manifestPath)));
  assert.ok(fs.existsSync(path.join(repoRoot, summary.verdictPath)));
  assert.strictEqual(brief.reportPdfPath, '');

  console.log('✅ cryptanalysis full-chain demo checks passed');
}

run();
