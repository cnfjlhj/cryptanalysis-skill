#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function run() {
  const repoRoot = path.join(__dirname, '..');
  const scriptPath = path.join(repoRoot, 'scripts', 'cryptanalysis-benchmark', 'resolve-semantic-attachments.js');
  const presentIrPath = path.join(
    repoRoot,
    'docs',
    'cryptanalysis-benchmark',
    'trials',
    'eprint-2013-676',
    'structural-ir.present80.r5.v0.json'
  );
  const speckIrPath = path.join(
    repoRoot,
    'docs',
    'cryptanalysis-benchmark',
    'trials',
    'eprint-2016-407',
    'structural-ir.speck32-64.r9.v0.json'
  );
  const presentPackPath = path.join(
    repoRoot,
    'docs',
    'cryptanalysis-benchmark',
    'trials',
    'eprint-2013-676',
    'local-semantics.present-sbox.cdp.json'
  );

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cryptanalysis-semantic-attachment-'));
  const presentOutputPath = path.join(tempDir, 'present-attachment.json');
  const speckOutputPath = path.join(tempDir, 'speck-attachment.json');

  const present = spawnSync('node', [
    scriptPath,
    '--ir', presentIrPath,
    '--local-semantics', presentPackPath,
    '--output', presentOutputPath
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.strictEqual(present.status, 0, present.stderr || present.stdout);
  assert.ok(fs.existsSync(presentOutputPath), 'expected present attachment manifest to be written');
  const presentManifest = JSON.parse(present.stdout);
  assert.strictEqual(presentManifest.resolution_summary.total_requirements, 2);
  assert.strictEqual(presentManifest.resolution_summary.resolved_count, 2);
  assert.strictEqual(presentManifest.resolution_summary.missing_count, 0);
  assert.strictEqual(presentManifest.resolution_summary.ready_for_model_instantiation, true);
  assert.deepStrictEqual(
    presentManifest.template_attachments.map((entry) => entry.selected_rule_pack_ref),
    ['present-sbox-xor-diff-cdp-v1', 'present-sbox-xor-diff-cdp-v1']
  );

  const speck = spawnSync('node', [
    scriptPath,
    '--ir', speckIrPath,
    '--local-semantics', presentPackPath,
    '--output', speckOutputPath
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.strictEqual(speck.status, 0, speck.stderr || speck.stdout);
  assert.ok(fs.existsSync(speckOutputPath), 'expected speck attachment manifest to be written');
  const speckManifest = JSON.parse(speck.stdout);
  assert.strictEqual(speckManifest.resolution_summary.total_requirements, 2);
  assert.strictEqual(speckManifest.resolution_summary.resolved_count, 0);
  assert.strictEqual(speckManifest.resolution_summary.missing_count, 2);
  assert.strictEqual(speckManifest.resolution_summary.ready_for_model_instantiation, false);
  assert.deepStrictEqual(
    speckManifest.template_attachments.map((entry) => entry.resolution_status),
    ['missing', 'missing']
  );

  console.log('✅ cryptanalysis semantic attachment resolver checks passed');
}

run();
