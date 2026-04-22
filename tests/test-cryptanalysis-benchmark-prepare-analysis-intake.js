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
  const scriptPath = path.join(repoRoot, 'scripts', 'cryptanalysis-benchmark', 'prepare-analysis-intake.js');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cryptanalysis-intake-'));

  const completeBundlePath = path.join(tempDir, 'complete-bundle.json');
  writeJson(completeBundlePath, {
    bundle_id: 'present80-r5-bundle',
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
      id: 'eprint-2013-676',
      title: 'Automatic Security Evaluation and (Related-key) Differential Characteristic Search'
    },
    primitive: {
      id: 'PRESENT-80',
      family: 'spn',
      block_size_bits: 64,
      key_size_bits: 80,
      round_count_claimed: 31
    },
    attack: {
      family: 'related_key_differential',
      difference_model: 'xor',
      claim_kind: 'characteristic'
    },
    target: {
      case_id: 'present80-table4-r5-exact-v2',
      claim: 'Table 4 reports 5-round minimum active S-box count 3.',
      comparison_point: 'Appendix A.1 Table 4',
      round_end: 5,
      sbox_model: 'exact'
    },
    notes: 'Complete enough for current routing.'
  });

  const completeOutputDir = path.join(tempDir, 'complete-output');
  const complete = spawnSync('node', [
    scriptPath,
    '--bundle', completeBundlePath,
    '--output-dir', completeOutputDir
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.strictEqual(complete.status, 0, complete.stderr || complete.stdout);
  const completeSummary = JSON.parse(complete.stdout);
  assert.strictEqual(completeSummary.bundleState, 'frozen-bundle');
  assert.strictEqual(completeSummary.readyForRouting, true);
  const completeDraft = JSON.parse(fs.readFileSync(path.join(repoRoot, completeSummary.requestDraftPath), 'utf8'));
  assert.strictEqual(completeDraft.requestId, 'present80-r5-bundle');
  assert.strictEqual(completeDraft.targetCaseId, 'present80-table4-r5-exact-v2');
  const completeIntake = JSON.parse(fs.readFileSync(path.join(repoRoot, completeSummary.intakeResultPath), 'utf8'));
  assert.strictEqual(completeIntake.readyForRouting, true);
  assert.strictEqual(completeIntake.primitiveCard.status, 'identified');
  assert.strictEqual(completeIntake.attackCard.status, 'identified');

  const incompleteBundlePath = path.join(tempDir, 'incomplete-bundle.json');
  writeJson(incompleteBundlePath, {
    bundle_id: 'partial-bundle',
    source_items: [
      {
        id: 'attack-paper',
        kind: 'attack_paper_pdf',
        label: 'unknown attack paper'
      }
    ],
    primitive: {
      id: 'PRESENT-80'
    }
  });

  const incompleteOutputDir = path.join(tempDir, 'incomplete-output');
  const incomplete = spawnSync('node', [
    scriptPath,
    '--bundle', incompleteBundlePath,
    '--output-dir', incompleteOutputDir
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.strictEqual(incomplete.status, 0, incomplete.stderr || incomplete.stdout);
  const incompleteSummary = JSON.parse(incomplete.stdout);
  assert.strictEqual(incompleteSummary.bundleState, 'incomplete-bundle');
  assert.strictEqual(incompleteSummary.readyForRouting, false);
  const incompleteIntake = JSON.parse(fs.readFileSync(path.join(repoRoot, incompleteSummary.intakeResultPath), 'utf8'));
  assert.ok(incompleteIntake.missingFields.includes('paperId'));
  assert.ok(incompleteIntake.missingFields.includes('primitiveFamily'));
  assert.ok(Array.isArray(incompleteIntake.intakeQuestions));
  assert.ok(incompleteIntake.intakeQuestions.length >= 1);

  console.log('✅ cryptanalysis intake preparation checks passed');
}

run();
