#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function runCommand(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8'
  });

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return result;
}

function run() {
  const repoRoot = path.join(__dirname, '..');
  const generatorPath = path.join(
    repoRoot,
    'scripts',
    'cryptanalysis-benchmark',
    'generate-model-instantiation-from-ir.js'
  );
  const emitPath = path.join(repoRoot, 'scripts', 'cryptanalysis-benchmark', 'emit-milp-lp.js');
  const trialDir = path.join(
    repoRoot,
    'docs',
    'cryptanalysis-benchmark',
    'trials',
    'eprint-2013-676'
  );
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cryptanalysis-model-instantiation-'));
  const generatedPath = path.join(tempDir, 'model-instantiation.present80.r5.v0.json');
  const generatedLpPath = path.join(tempDir, 'present80-r5-generated.lp');
  const generatedSummaryPath = path.join(tempDir, 'present80-r5-generated.summary.json');
  const legacyLpPath = path.join(tempDir, 'present80-r5-legacy.lp');
  const legacySummaryPath = path.join(tempDir, 'present80-r5-legacy.summary.json');

  const generate = runCommand('node', [
    generatorPath,
    '--structural-ir', path.join(trialDir, 'structural-ir.present80.r5.v0.json'),
    '--semantic-attachment', path.join(trialDir, 'semantic-attachment.present80.r5.v0.json'),
    '--primitive-spec', path.join(trialDir, 'primitive-spec.present80.full.json'),
    '--output', generatedPath
  ], repoRoot);

  const generatedSummary = JSON.parse(generate.stdout);
  assert.strictEqual(generatedSummary.unitId, 'p1_compute_5r_lower_bound_model');
  assert.strictEqual(generatedSummary.roundEnd, 5);
  assert.strictEqual(generatedSummary.variableFamilyCount, 10);
  assert.strictEqual(generatedSummary.constraintBlockCount, 12);

  const generatedInstantiation = JSON.parse(fs.readFileSync(generatedPath, 'utf8'));
  assert.strictEqual(generatedInstantiation.instantiation_id, 'present80-r5-rkdiff-lower-bound-instantiation-v0');
  assert.strictEqual(generatedInstantiation.execution_units.length, 1);
  assert.strictEqual(generatedInstantiation.execution_units[0].round_scope.to_round, 5);
  assert.strictEqual(generatedInstantiation.execution_units[0].expected_output.expected_value, 3);

  const encSboxBlock = generatedInstantiation.constraint_blocks.find((entry) => entry.block_id === 'encryption_sbox_cdp');
  assert.ok(encSboxBlock);
  assert.deepStrictEqual(encSboxBlock.local_rule_pack_refs, ['present-sbox-xor-diff-cdp-v1']);

  runCommand('node', [
    emitPath,
    '--instantiation', generatedPath,
    '--primitive-spec', path.join(trialDir, 'primitive-spec.present80.full.json'),
    '--local-semantics', path.join(trialDir, 'local-semantics.present-sbox.cdp.json'),
    '--unit-id', 'p1_compute_5r_lower_bound_model',
    '--sbox-model', 'exact',
    '--output', generatedLpPath,
    '--summary-output', generatedSummaryPath
  ], repoRoot);

  runCommand('node', [
    emitPath,
    '--instantiation', path.join(trialDir, 'model-instantiation.present80-rkdiff24.json'),
    '--primitive-spec', path.join(trialDir, 'primitive-spec.present80.full.json'),
    '--local-semantics', path.join(trialDir, 'local-semantics.present-sbox.cdp.json'),
    '--unit-id', 'p1_compute_12r_lower_bound_model',
    '--round-end', '5',
    '--sbox-model', 'exact',
    '--output', legacyLpPath,
    '--summary-output', legacySummaryPath
  ], repoRoot);

  const generatedLp = fs.readFileSync(generatedLpPath, 'utf8');
  const legacyLp = fs.readFileSync(legacyLpPath, 'utf8');
  assert.strictEqual(generatedLp, legacyLp);

  const generatedEmissionSummary = JSON.parse(fs.readFileSync(generatedSummaryPath, 'utf8'));
  const legacyEmissionSummary = JSON.parse(fs.readFileSync(legacySummaryPath, 'utf8'));
  assert.strictEqual(generatedEmissionSummary.variableCount, legacyEmissionSummary.variableCount);
  assert.strictEqual(generatedEmissionSummary.constraintCount, legacyEmissionSummary.constraintCount);
  assert.strictEqual(generatedEmissionSummary.effectiveRoundEnd, 5);
  assert.strictEqual(generatedEmissionSummary.effectiveUpdateEnd, 4);
  assert.strictEqual(generatedEmissionSummary.sboxModel, 'exact');

  console.log('✅ cryptanalysis model-instantiation generator checks passed');
}

run();
