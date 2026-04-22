#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '../..');
const DEFAULT_REFERENCE_PATH = path.join(
  ROOT_DIR,
  'docs',
  'cryptanalysis-benchmark',
  'trials',
  'eprint-2013-676',
  'calibration-reference.present80-rkdiff.json'
);

function parseArgs(argv) {
  const options = {
    referencePath: DEFAULT_REFERENCE_PATH,
    caseId: '',
    solverSummaryPath: '',
    emissionSummaryPath: '',
    outputPath: '',
    ledgerRowOutputPath: '',
    runLabel: ''
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if ((current === '--reference' || current === '--reference-path') && next) {
      options.referencePath = path.resolve(next);
      index += 1;
      continue;
    }

    if ((current === '--case' || current === '--case-id') && next) {
      options.caseId = String(next);
      index += 1;
      continue;
    }

    if ((current === '--solver-summary' || current === '--solver-summary-path') && next) {
      options.solverSummaryPath = path.resolve(next);
      index += 1;
      continue;
    }

    if ((current === '--emission-summary' || current === '--emission-summary-path') && next) {
      options.emissionSummaryPath = path.resolve(next);
      index += 1;
      continue;
    }

    if ((current === '--output' || current === '--output-path') && next) {
      options.outputPath = path.resolve(next);
      index += 1;
      continue;
    }

    if ((current === '--ledger-row-output' || current === '--ledger-output') && next) {
      options.ledgerRowOutputPath = path.resolve(next);
      index += 1;
      continue;
    }

    if ((current === '--run-label' || current === '--label') && next) {
      options.runLabel = String(next);
      index += 1;
      continue;
    }

    if (current === '--help' || current === '-h') {
      options.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${current}`);
  }

  return options;
}

function printHelp() {
  console.log([
    'Usage:',
    '  node scripts/cryptanalysis-benchmark/render-verdict.js --case <id> --solver-summary <path>',
    '',
    'Options:',
    '  --reference <path>         Calibration reference JSON',
    '  --case-id <id>            Reference case id',
    '  --solver-summary <path>   Solver summary JSON from run-highs-mip.py',
    '  --emission-summary <path> Optional emission summary JSON from emit-milp-lp.js',
    '  --output <path>           Optional verdict JSON output path',
    '  --ledger-row-output <path> Optional CSV file with one header row and one data row',
    '  --run-label <text>        Optional free-form run label'
  ].join('\n'));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function nearlyEqual(left, right, tolerance) {
  return Math.abs(left - right) <= tolerance;
}

function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (!/[",\n]/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function findCase(reference, caseId) {
  const cases = Array.isArray(reference.cases) ? reference.cases : [];
  const selected = cases.find((entry) => entry.case_id === caseId);
  if (!selected) {
    throw new Error(`Case not found in reference set: ${caseId}`);
  }
  return selected;
}

function validateEmissionSummary(selectedCase, emissionSummary) {
  if (!emissionSummary) {
    return;
  }

  if (
    Number.isInteger(selectedCase.round_end) &&
    Number.isInteger(emissionSummary.effectiveRoundEnd) &&
    emissionSummary.effectiveRoundEnd !== selectedCase.round_end
  ) {
    throw new Error(
      `Emission summary round mismatch: expected ${selectedCase.round_end}, got ${emissionSummary.effectiveRoundEnd}`
    );
  }

  if (
    selectedCase.expected_unit_id &&
    emissionSummary.unitId &&
    emissionSummary.unitId !== selectedCase.expected_unit_id
  ) {
    throw new Error(
      `Emission summary unit mismatch: expected ${selectedCase.expected_unit_id}, got ${emissionSummary.unitId}`
    );
  }

  if (
    selectedCase.expected_sbox_model &&
    emissionSummary.sboxModel &&
    emissionSummary.sboxModel !== selectedCase.expected_sbox_model
  ) {
    throw new Error(
      `Emission summary S-box model mismatch: expected ${selectedCase.expected_sbox_model}, got ${emissionSummary.sboxModel}`
    );
  }
}

function buildSolverEvidence(summary, objectiveDirection) {
  const objectiveValue = isFiniteNumber(summary.objective_function_value)
    ? summary.objective_function_value
    : null;
  const dualBound = isFiniteNumber(summary.mip_dual_bound) ? summary.mip_dual_bound : null;
  const isOptimal = typeof summary.model_status_code === 'string'
    && summary.model_status_code.includes('Optimal');
  const hasFeasibleObjective = objectiveValue !== null;
  const modelStatusText = summary.model_status_text || summary.model_status_code || 'unknown';

  const evidence = {
    readOk: summary.read_status === 'HighsStatus.kOk',
    solveOk: summary.solve_status === 'HighsStatus.kOk' || summary.solve_status === 'HighsStatus.kWarning',
    isOptimal,
    modelStatusCode: summary.model_status_code || '',
    modelStatusText,
    objectiveValue,
    dualBound,
    mipGap: isFiniteNumber(summary.mip_gap) ? summary.mip_gap : null,
    primalSolutionStatus: summary.primal_solution_status,
    generatedAt: summary.generated_at || null,
    certifiedLowerBound: null,
    certifiedUpperBound: null
  };

  if (objectiveDirection === 'minimize') {
    evidence.certifiedLowerBound = dualBound;
    evidence.certifiedUpperBound = hasFeasibleObjective ? objectiveValue : null;
  } else if (objectiveDirection === 'maximize') {
    evidence.certifiedLowerBound = hasFeasibleObjective ? objectiveValue : null;
    evidence.certifiedUpperBound = dualBound;
  } else {
    throw new Error(`Unsupported objective direction: ${objectiveDirection}`);
  }

  if (isOptimal && objectiveValue !== null) {
    evidence.certifiedLowerBound = objectiveValue;
    evidence.certifiedUpperBound = objectiveValue;
  }

  return evidence;
}

function contradictsExactMinimum(selectedCase, evidence, tolerance) {
  const expectedValue = selectedCase.expected_value;
  if (selectedCase.objective_direction === 'minimize') {
    if (evidence.certifiedUpperBound !== null && evidence.certifiedUpperBound < expectedValue - tolerance) {
      return true;
    }
    if (evidence.certifiedLowerBound !== null && evidence.certifiedLowerBound > expectedValue + tolerance) {
      return true;
    }
    return false;
  }

  if (evidence.certifiedLowerBound !== null && evidence.certifiedLowerBound > expectedValue + tolerance) {
    return true;
  }
  if (evidence.certifiedUpperBound !== null && evidence.certifiedUpperBound < expectedValue - tolerance) {
    return true;
  }
  return false;
}

function contradictsLowerBound(selectedCase, evidence, tolerance) {
  const expectedValue = selectedCase.expected_value;
  if (selectedCase.objective_direction === 'minimize') {
    return evidence.certifiedUpperBound !== null && evidence.certifiedUpperBound < expectedValue - tolerance;
  }
  return evidence.certifiedLowerBound !== null && evidence.certifiedLowerBound > expectedValue + tolerance;
}

function evaluateExactMinimum(selectedCase, evidence, tolerance) {
  const expectedValue = selectedCase.expected_value;

  if (evidence.isOptimal && evidence.objectiveValue !== null) {
    if (nearlyEqual(evidence.objectiveValue, expectedValue, tolerance)) {
      return {
        verdictLabel: 'optimal-consistent',
        mismatchStage: '',
        nextAction: '',
        supportMode: 'solver-certified-optimum',
        summaryText: `Optimal objective ${formatNumber(evidence.objectiveValue)} matches the published exact minimum ${formatNumber(expectedValue)}.`
      };
    }

    return {
      verdictLabel: 'mismatch',
      mismatchStage: selectedCase.mismatch_stage || 'validation_gap',
      nextAction: selectedCase.next_action_on_mismatch || 'Audit the local semantics and counting model before trusting this lane.',
      supportMode: 'solver-certified-optimum',
      summaryText: `Optimal objective ${formatNumber(evidence.objectiveValue)} contradicts the published exact minimum ${formatNumber(expectedValue)}.`
    };
  }

  if (contradictsExactMinimum(selectedCase, evidence, tolerance)) {
    return {
      verdictLabel: 'mismatch',
      mismatchStage: selectedCase.mismatch_stage || 'validation_gap',
      nextAction: selectedCase.next_action_on_mismatch || 'Audit the local semantics and counting model before trusting this lane.',
      supportMode: 'bound-contradiction',
      summaryText: `Current solver bounds already contradict the published exact minimum ${formatNumber(expectedValue)}.`
    };
  }

  if (evidence.objectiveValue !== null && nearlyEqual(evidence.objectiveValue, expectedValue, tolerance)) {
    return {
      verdictLabel: 'feasible-match-only',
      mismatchStage: selectedCase.partial_mismatch_stage || 'validation_gap',
      nextAction: selectedCase.next_action_on_partial || selectedCase.next_action_on_unresolved || 'Increase solve confidence before trusting this checkpoint.',
      supportMode: 'matching-feasible-solution',
      summaryText: `A feasible objective ${formatNumber(evidence.objectiveValue)} matches the published exact minimum ${formatNumber(expectedValue)}, but optimality is not certified.`
    };
  }

  return {
    verdictLabel: 'unresolved',
    mismatchStage: deriveUnresolvedStage(selectedCase, evidence),
    nextAction: selectedCase.next_action_on_unresolved || 'Keep tightening the calibration lane until the checkpoint is either certified or contradicted.',
    supportMode: 'insufficient-evidence',
    summaryText: `Current solver evidence does not yet certify or contradict the published exact minimum ${formatNumber(expectedValue)}.`
  };
}

function evaluateLowerBound(selectedCase, evidence, tolerance) {
  const expectedValue = selectedCase.expected_value;

  if (contradictsLowerBound(selectedCase, evidence, tolerance)) {
    return {
      verdictLabel: 'mismatch',
      mismatchStage: selectedCase.mismatch_stage || 'validation_gap',
      nextAction: selectedCase.next_action_on_mismatch || 'Audit the model because a concrete solution already violates the paper lower-bound claim.',
      supportMode: 'counterexample',
      summaryText: `A concrete feasible objective ${formatNumber(evidence.certifiedUpperBound)} violates the published lower-bound claim >= ${formatNumber(expectedValue)}.`
    };
  }

  if (selectedCase.objective_direction === 'minimize') {
    if (evidence.certifiedLowerBound !== null && evidence.certifiedLowerBound >= expectedValue - tolerance) {
      return {
        verdictLabel: 'optimal-consistent',
        mismatchStage: '',
        nextAction: '',
        supportMode: evidence.isOptimal ? 'solver-certified-optimum' : 'solver-certified-bound',
        summaryText: `The certified lower bound ${formatNumber(evidence.certifiedLowerBound)} supports the published claim >= ${formatNumber(expectedValue)}.`
      };
    }
  } else if (evidence.certifiedUpperBound !== null && evidence.certifiedUpperBound <= expectedValue + tolerance) {
    return {
      verdictLabel: 'optimal-consistent',
      mismatchStage: '',
      nextAction: '',
      supportMode: evidence.isOptimal ? 'solver-certified-optimum' : 'solver-certified-bound',
      summaryText: `The certified upper bound ${formatNumber(evidence.certifiedUpperBound)} supports the published claim <= ${formatNumber(expectedValue)}.`
    };
  }

  return {
    verdictLabel: 'unresolved',
    mismatchStage: deriveUnresolvedStage(selectedCase, evidence),
    nextAction: selectedCase.next_action_on_unresolved || 'Raise the certified bound before promoting the paper-level derivation.',
    supportMode: 'insufficient-evidence',
    summaryText: `Current solver evidence does not yet certify the published lower-bound claim >= ${formatNumber(expectedValue)}.`
  };
}

function deriveUnresolvedStage(selectedCase, evidence) {
  if (!evidence.readOk || !evidence.solveOk) {
    return 'backend_choice';
  }
  return selectedCase.unresolved_stage || selectedCase.mismatch_stage || 'validation_gap';
}

function formatNumber(value) {
  if (!isFiniteNumber(value)) {
    return 'n/a';
  }
  if (Math.abs(value - Math.round(value)) <= 1e-9) {
    return String(Math.round(value));
  }
  return String(Number(value.toFixed(6)));
}

function buildObservedClaim(selectedCase, evidence, summaryResult, emissionSummary, runLabel, solverSummary) {
  const fragments = [];
  if (runLabel) {
    fragments.push(`run=${runLabel}`);
  }
  if (selectedCase.round_end) {
    fragments.push(`round_end=${selectedCase.round_end}`);
  }
  if (emissionSummary && emissionSummary.sboxModel) {
    fragments.push(`sbox_model=${emissionSummary.sboxModel}`);
  }
  fragments.push(`solver_status=${evidence.modelStatusText}`);
  if (evidence.objectiveValue !== null) {
    fragments.push(`objective=${formatNumber(evidence.objectiveValue)}`);
  }
  if (evidence.certifiedLowerBound !== null && !nearlyEqual(evidence.certifiedLowerBound, evidence.objectiveValue ?? NaN, 1e-9)) {
    fragments.push(`certified_lower_bound=${formatNumber(evidence.certifiedLowerBound)}`);
  }
  if (evidence.certifiedUpperBound !== null && !nearlyEqual(evidence.certifiedUpperBound, evidence.objectiveValue ?? NaN, 1e-9)) {
    fragments.push(`certified_upper_bound=${formatNumber(evidence.certifiedUpperBound)}`);
  }
  if (evidence.mipGap !== null) {
    fragments.push(`mip_gap=${Number(evidence.mipGap.toFixed(6))}`);
  }
  if (solverSummary.solution_output_path) {
    fragments.push(`solution=${solverSummary.solution_output_path}`);
  }
  return `${summaryResult.summaryText} (${fragments.join('; ')})`;
}

function buildMismatchNotes(selectedCase, evidence, emissionSummary, summaryResult) {
  const notes = [summaryResult.summaryText];
  if (selectedCase.paper_location) {
    notes.push(`paper_location=${selectedCase.paper_location}`);
  }
  if (emissionSummary && emissionSummary.outputPath) {
    notes.push(`lp=${emissionSummary.outputPath}`);
  }
  if (evidence.certifiedLowerBound !== null || evidence.certifiedUpperBound !== null) {
    notes.push(
      `bounds=[${formatNumber(evidence.certifiedLowerBound)}, ${formatNumber(evidence.certifiedUpperBound)}]`
    );
  }
  return notes.join(' ');
}

function buildLedgerRow(reference, selectedCase, solverSummary, emissionSummary, summaryResult, observedClaim) {
  return {
    paper_id: reference.paper_id || '',
    paper_title: reference.paper_title || '',
    primitive_family: reference.primitive_family || '',
    attack_family: reference.attack_family || '',
    bundle_complete: reference.bundle_complete || '',
    primitive_spec_ok: reference.primitive_spec_ok ? 'yes' : 'no',
    attack_spec_ok: reference.attack_spec_ok ? 'yes' : 'no',
    backend_target: reference.backend_target || '',
    expected_claim: selectedCase.expected_claim || '',
    obtained_claim: observedClaim,
    consistency_level: summaryResult.verdictLabel,
    mismatch_stage: summaryResult.mismatchStage || '',
    mismatch_notes: summaryResult.mismatchStage
      ? buildMismatchNotes(selectedCase, buildSolverEvidence(solverSummary, selectedCase.objective_direction), emissionSummary, summaryResult)
      : '',
    next_action: summaryResult.nextAction || '',
    last_run_utc: solverSummary.generated_at || ''
  };
}

function toCsv(row) {
  const headers = [
    'paper_id',
    'paper_title',
    'primitive_family',
    'attack_family',
    'bundle_complete',
    'primitive_spec_ok',
    'attack_spec_ok',
    'backend_target',
    'expected_claim',
    'obtained_claim',
    'consistency_level',
    'mismatch_stage',
    'mismatch_notes',
    'next_action',
    'last_run_utc'
  ];

  const values = headers.map((header) => csvEscape(row[header]));
  return `${headers.join(',')}\n${values.join(',')}\n`;
}

function mapLegacyConsistency(verdictLabel) {
  if (verdictLabel === 'optimal-consistent') {
    return 'paper-consistent';
  }
  if (verdictLabel === 'feasible-match-only') {
    return 'heuristic-only';
  }
  return 'unresolved';
}

function evaluateCase(reference, selectedCase, solverSummary, emissionSummary, runLabel) {
  validateEmissionSummary(selectedCase, emissionSummary);

  const tolerance = isFiniteNumber(selectedCase.tolerance) ? selectedCase.tolerance : 1e-9;
  const evidence = buildSolverEvidence(solverSummary, selectedCase.objective_direction || 'minimize');
  let summaryResult;

  if (selectedCase.claim_kind === 'exact_minimum') {
    summaryResult = evaluateExactMinimum(selectedCase, evidence, tolerance);
  } else if (selectedCase.claim_kind === 'lower_bound') {
    summaryResult = evaluateLowerBound(selectedCase, evidence, tolerance);
  } else {
    throw new Error(`Unsupported claim kind: ${selectedCase.claim_kind}`);
  }

  const observedClaim = buildObservedClaim(
    selectedCase,
    evidence,
    summaryResult,
    emissionSummary,
    runLabel,
    solverSummary
  );

  const ledgerRow = buildLedgerRow(
    reference,
    selectedCase,
    solverSummary,
    emissionSummary,
    summaryResult,
    observedClaim
  );

  return {
    referenceSetId: reference.reference_set_id || '',
    caseId: selectedCase.case_id,
    description: selectedCase.description || '',
    runLabel,
    paperId: reference.paper_id || '',
    paperTitle: reference.paper_title || '',
    paperLocation: selectedCase.paper_location || '',
    expectedClaim: selectedCase.expected_claim || '',
    expectedValue: selectedCase.expected_value,
    claimKind: selectedCase.claim_kind,
    objectiveDirection: selectedCase.objective_direction,
    verdictLabel: summaryResult.verdictLabel,
    legacyConsistencyLevel: mapLegacyConsistency(summaryResult.verdictLabel),
    dominantMismatchStage: summaryResult.mismatchStage || '',
    supportMode: summaryResult.supportMode,
    nextAction: summaryResult.nextAction || '',
    observedClaim,
    solverEvidence: {
      modelStatusCode: evidence.modelStatusCode,
      modelStatusText: evidence.modelStatusText,
      objectiveValue: evidence.objectiveValue,
      certifiedLowerBound: evidence.certifiedLowerBound,
      certifiedUpperBound: evidence.certifiedUpperBound,
      mipGap: evidence.mipGap,
      generatedAt: evidence.generatedAt
    },
    emissionEvidence: emissionSummary
      ? {
          unitId: emissionSummary.unitId || '',
          effectiveRoundEnd: Number.isInteger(emissionSummary.effectiveRoundEnd)
            ? emissionSummary.effectiveRoundEnd
            : (Number.isInteger(selectedCase.round_end) ? selectedCase.round_end : null),
          sboxModel: emissionSummary.sboxModel || '',
          outputPath: emissionSummary.outputPath || ''
        }
      : null,
    ledgerRow
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (!options.caseId) {
    throw new Error('Missing required argument: --case-id');
  }
  if (!options.solverSummaryPath) {
    throw new Error('Missing required argument: --solver-summary');
  }

  const reference = readJson(options.referencePath);
  const selectedCase = findCase(reference, options.caseId);
  const solverSummary = readJson(options.solverSummaryPath);
  const emissionSummary = options.emissionSummaryPath
    ? readJson(options.emissionSummaryPath)
    : null;

  const verdict = evaluateCase(
    reference,
    selectedCase,
    solverSummary,
    emissionSummary,
    options.runLabel
  );

  if (options.outputPath) {
    ensureParentDir(options.outputPath);
    fs.writeFileSync(options.outputPath, `${JSON.stringify(verdict, null, 2)}\n`, 'utf8');
  }

  if (options.ledgerRowOutputPath) {
    ensureParentDir(options.ledgerRowOutputPath);
    fs.writeFileSync(options.ledgerRowOutputPath, toCsv(verdict.ledgerRow), 'utf8');
  }

  console.log(JSON.stringify(verdict, null, 2));
}

main();
