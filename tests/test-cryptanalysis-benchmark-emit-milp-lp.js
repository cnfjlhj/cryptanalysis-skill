#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function run() {
  const repoRoot = path.join(__dirname, '..');
  const scriptPath = path.join(repoRoot, 'scripts', 'cryptanalysis-benchmark', 'emit-milp-lp.js');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cryptanalysis-benchmark-lp-'));
  const outputPath = path.join(tempDir, 'present80.lp');
  const summaryPath = path.join(tempDir, 'present80.summary.json');
  const output6Path = path.join(tempDir, 'present80-r6.lp');
  const summary6Path = path.join(tempDir, 'present80-r6.summary.json');
  const output4ExactPath = path.join(tempDir, 'present80-r4-exact.lp');
  const summary4ExactPath = path.join(tempDir, 'present80-r4-exact.summary.json');
  const output4Ch6Path = path.join(tempDir, 'present80-r4-ch6.lp');
  const summary4Ch6Path = path.join(tempDir, 'present80-r4-ch6.summary.json');

  const result = spawnSync('node', [
    scriptPath,
    '--output', outputPath,
    '--summary-output', summaryPath
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert.ok(fs.existsSync(outputPath), 'expected LP file to be created');
  assert.ok(fs.existsSync(summaryPath), 'expected summary JSON to be created');

  const summary = JSON.parse(result.stdout);
  assert.strictEqual(summary.unitId, 'p1_compute_12r_lower_bound_model');
  assert.strictEqual(summary.outputPath, outputPath);
  assert.ok(summary.variableCount > 6000, 'expected a non-trivial binary variable set');
  assert.ok(summary.constraintCount > 10000, 'expected a non-trivial constraint set');

  const lp = fs.readFileSync(outputPath, 'utf8');
  assert.match(lp, /^Minimize/m);
  assert.match(lp, /^Subject To/m);
  assert.match(lp, /^Binary$/m);
  assert.match(lp, /^End$/m);
  assert.match(lp, /initial_key_register_nonzero:/);
  assert.match(lp, /encryption_sbox_cdp_r1_s0_cdp_1:/);
  assert.match(lp, /key_schedule_rotate_left_61_u1_b0:/);
  assert.match(lp, /obj: .*ae_r1_s0/);
  assert.match(lp, /obj: .*ak_u1/);

  const summaryFile = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  assert.strictEqual(summaryFile.constraintCount, summary.constraintCount);
  assert.strictEqual(summaryFile.variableCount, summary.variableCount);
  assert.strictEqual(summaryFile.effectiveRoundEnd, 12);
  assert.strictEqual(summaryFile.effectiveUpdateEnd, 11);
  assert.strictEqual(summaryFile.sboxModel, 'cdp');

  const truncated = spawnSync('node', [
    scriptPath,
    '--round-end', '6',
    '--output', output6Path,
    '--summary-output', summary6Path
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.strictEqual(truncated.status, 0, truncated.stderr || truncated.stdout);
  assert.ok(fs.existsSync(output6Path), 'expected truncated LP file to be created');
  assert.ok(fs.existsSync(summary6Path), 'expected truncated summary JSON to be created');

  const summary6 = JSON.parse(truncated.stdout);
  assert.strictEqual(summary6.effectiveRoundEnd, 6);
  assert.strictEqual(summary6.effectiveUpdateEnd, 5);
  assert.ok(summary6.variableCount < summary.variableCount, 'expected truncated model to have fewer variables');
  assert.ok(summary6.constraintCount < summary.constraintCount, 'expected truncated model to have fewer constraints');

  const lp6 = fs.readFileSync(output6Path, 'utf8');
  assert.match(lp6, /obj: .*ae_r6_s15/);
  assert.match(lp6, /obj: .*ak_u5/);
  assert.doesNotMatch(lp6, /ae_r7_s0/);
  assert.doesNotMatch(lp6, /sa_r7_b0/);
  assert.doesNotMatch(lp6, /ak_u6/);
  assert.match(lp6, /s_r7_b0/);

  const exact = spawnSync('node', [
    scriptPath,
    '--round-end', '4',
    '--sbox-model', 'exact',
    '--output', output4ExactPath,
    '--summary-output', summary4ExactPath
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.strictEqual(exact.status, 0, exact.stderr || exact.stdout);
  assert.ok(fs.existsSync(output4ExactPath), 'expected exact LP file to be created');
  assert.ok(fs.existsSync(summary4ExactPath), 'expected exact summary JSON to be created');

  const summary4Exact = JSON.parse(exact.stdout);
  assert.strictEqual(summary4Exact.effectiveRoundEnd, 4);
  assert.strictEqual(summary4Exact.sboxModel, 'exact');
  assert.ok(summary4Exact.variableCount > summary6.variableCount, 'expected exact model to add selector variables');

  const lp4Exact = fs.readFileSync(output4ExactPath, 'utf8');
  assert.match(lp4Exact, /encryption_sbox_cdp_r1_s0_transition_onehot:/);
  assert.match(lp4Exact, /encryption_sbox_cdp_r1_s0_t_i0_o0/);
  assert.match(lp4Exact, /key_schedule_sbox_cdp_u1_transition_onehot:/);
  assert.doesNotMatch(lp4Exact, /encryption_sbox_cdp_r1_s0_cdp_1:/);

  const ch6 = spawnSync('node', [
    scriptPath,
    '--round-end', '4',
    '--sbox-model', 'ch6',
    '--output', output4Ch6Path,
    '--summary-output', summary4Ch6Path
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.strictEqual(ch6.status, 0, ch6.stderr || ch6.stdout);
  assert.ok(fs.existsSync(output4Ch6Path), 'expected ch6 LP file to be created');
  assert.ok(fs.existsSync(summary4Ch6Path), 'expected ch6 summary JSON to be created');

  const summary4Ch6 = JSON.parse(ch6.stdout);
  assert.strictEqual(summary4Ch6.sboxModel, 'ch6');

  const lp4Ch6 = fs.readFileSync(output4Ch6Path, 'utf8');
  assert.match(lp4Ch6, /encryption_sbox_cdp_r1_s0_ch6_1:/);
  assert.match(lp4Ch6, /key_schedule_sbox_cdp_u1_ch6_6:/);
  assert.match(lp4Ch6, /encryption_sbox_cdp_r1_s0_cdp_1:/);

  console.log('✅ cryptanalysis benchmark LP emitter checks passed');
}

run();
