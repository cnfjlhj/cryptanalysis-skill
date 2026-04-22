#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { prepareIntakeArtifacts } = require('../scripts/cryptanalysis-benchmark/lib/analysis-intake');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function run() {
  const repoRoot = path.join(__dirname, '..');
  const examplesDir = path.join(repoRoot, 'docs', 'cryptanalysis-benchmark', 'examples');

  const p1Path = path.join(examplesDir, 'eprint-2013-676.present80-r5.bundle.json');
  const p1 = prepareIntakeArtifacts(readJson(p1Path), p1Path);
  assert.strictEqual(p1.requestDraft.bundleState, 'frozen-bundle');
  assert.strictEqual(p1.intakeResult.readyForRouting, true);
  assert.strictEqual(p1.primitiveCard.status, 'identified');
  assert.strictEqual(p1.attackCard.status, 'identified');

  const p2Path = path.join(examplesDir, 'eprint-2014-747.predefined-properties.bundle.json');
  const p2 = prepareIntakeArtifacts(readJson(p2Path), p2Path);
  assert.strictEqual(p2.requestDraft.bundleState, 'frozen-bundle');
  assert.strictEqual(p2.intakeResult.readyForRouting, true);
  assert.strictEqual(p2.requestDraft.paperId, 'eprint_2014_747');
  assert.strictEqual(p2.requestDraft.attackFamily, 'related_key_differential');

  const p3Path = path.join(examplesDir, 'eprint-2016-407.speck.bundle.json');
  const p3 = prepareIntakeArtifacts(readJson(p3Path), p3Path);
  assert.strictEqual(p3.requestDraft.bundleState, 'frozen-bundle');
  assert.strictEqual(p3.intakeResult.readyForRouting, true);
  assert.strictEqual(p3.requestDraft.primitiveFamily, 'arx');

  const p4Path = path.join(examplesDir, 'eprint-2022-513.cascada.bundle.json');
  const p4 = prepareIntakeArtifacts(readJson(p4Path), p4Path);
  assert.strictEqual(p4.requestDraft.bundleState, 'incomplete-bundle');
  assert.strictEqual(p4.intakeResult.readyForRouting, false);
  assert.ok(p4.intakeResult.missingFields.includes('primitiveId'));
  assert.ok(p4.intakeResult.missingFields.includes('attackFamily'));

  console.log('✅ cryptanalysis intake example bundle checks passed');
}

run();
