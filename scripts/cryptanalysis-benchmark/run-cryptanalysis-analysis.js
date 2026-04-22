#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  sanitizeLabel,
  normalizeRequest,
  collectMissingFields,
  buildIntakeQuestions,
  canonicalToken,
  prepareIntakeArtifacts
} = require('./lib/analysis-intake');

const ROOT_DIR = path.join(__dirname, '../..');
const DEFAULT_REFERENCE_PATH = path.join(
  ROOT_DIR,
  'docs',
  'cryptanalysis-benchmark',
  'trials',
  'eprint-2013-676',
  'calibration-reference.present80-rkdiff.json'
);
const DEFAULT_CALIBRATION_RUNNER_PATH = path.join(
  ROOT_DIR,
  'scripts',
  'cryptanalysis-benchmark',
  'run-calibration-case.js'
);
const DEFAULT_REPORT_RENDERER_PATH = path.join(
  ROOT_DIR,
  'scripts',
  'cryptanalysis-benchmark',
  'render-analysis-report.js'
);

function parseArgs(argv) {
  const options = {
    requestPath: '',
    bundlePath: '',
    outputDir: '',
    referencePath: DEFAULT_REFERENCE_PATH,
    solverSummaryInputPath: '',
    runLabel: '',
    report: true,
    reportLatexEngine: 'pdflatex',
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if ((current === '--request' || current === '--request-path') && next) {
      options.requestPath = path.resolve(next);
      index += 1;
      continue;
    }

    if ((current === '--bundle' || current === '--bundle-path') && next) {
      options.bundlePath = path.resolve(next);
      index += 1;
      continue;
    }

    if ((current === '--output-dir' || current === '--out-dir') && next) {
      options.outputDir = path.resolve(next);
      index += 1;
      continue;
    }

    if ((current === '--reference' || current === '--reference-path') && next) {
      options.referencePath = path.resolve(next);
      index += 1;
      continue;
    }

    if ((current === '--solver-summary-input' || current === '--solver-summary-path') && next) {
      options.solverSummaryInputPath = path.resolve(next);
      index += 1;
      continue;
    }

    if ((current === '--run-label' || current === '--label') && next) {
      options.runLabel = String(next).trim();
      index += 1;
      continue;
    }

    if ((current === '--report-latex-engine' || current === '--latex-engine') && next) {
      options.reportLatexEngine = String(next).trim();
      index += 1;
      continue;
    }

    if (current === '--no-report') {
      options.report = false;
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
    '  node scripts/cryptanalysis-benchmark/run-cryptanalysis-analysis.js --request <path>',
    '  node scripts/cryptanalysis-benchmark/run-cryptanalysis-analysis.js --bundle <path>',
    '',
    'Options:',
    '  --request <path>               Analysis request JSON',
    '  --bundle <path>                Raw analysis bundle JSON',
    '  --output-dir <path>            Optional output directory',
    '  --reference <path>             Calibration reference JSON for the current validated lane',
    '  --solver-summary-input <path>  Optional existing solver summary reused by the delegated run',
    '  --run-label <text>             Optional label for the run directory',
    '  --report-latex-engine <name>   latexmk engine for top-level and delegated reports',
    '  --no-report                    Skip top-level and delegated .tex/.pdf report generation'
  ].join('\n'));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function relativeToRoot(targetPath) {
  if (!targetPath) {
    return '';
  }
  return path.relative(ROOT_DIR, targetPath);
}

function runJsonCommand(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    throw new Error([
      `Command failed: ${command} ${args.join(' ')}`,
      result.stderr || result.stdout || '(no output)'
    ].join('\n'));
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Failed to parse JSON from ${command}: ${error.message}\n${result.stdout}`);
  }
}

function buildCapabilitySummary(reference) {
  return {
    scopeSummary: 'Current validated reuse scope is limited to the PRESENT-80 related-key differential MILP lane from ePrint 2013/676.',
    validatedLaneId: 'present80-rkdiff-eprint-2013-676',
    supportedCheckpointCaseIds: (reference.cases || []).map((entry) => entry.case_id),
    currentCeiling: [
      'Can run checkpoint-oriented solver-backed analysis inside the PRESENT-80 ePrint 2013/676 lane.',
      'Can emit structured JSON plus .tex/.pdf meeting artifacts.',
      'Can distinguish optimal-consistent, feasible-match-only, unresolved, and mismatch through the delegated verdict layer.'
    ],
    knownLimits: [
      'Does not yet provide general cryptanalysis coverage across arbitrary papers.',
      'Does not yet auto-normalize arbitrary raw papers into solver-ready models without clarification.',
      'Does not yet solver-certify the downstream 24-round PRESENT-80 claim in this repository.'
    ]
  };
}

function matchesCurrentScope(request) {
  const paperMatch = request.paperId === 'eprint_2013_676';
  const primitiveMatch = request.primitiveId === 'present-80';
  const familyMatch = request.primitiveFamily === 'spn';
  const attackMatch = request.attackFamily === 'related_key_differential';
  const differenceMatch = request.differenceModel === 'xor';

  return {
    matched: paperMatch && primitiveMatch && familyMatch && attackMatch && differenceMatch,
    details: {
      paperMatch,
      primitiveMatch,
      familyMatch,
      attackMatch,
      differenceMatch
    }
  };
}

function resolveSupportedCase(reference, request) {
  const cases = Array.isArray(reference.cases) ? reference.cases : [];

  if (request.targetCaseId) {
    const exact = cases.find((entry) => entry.case_id === request.targetCaseId);
    if (exact) {
      return { caseRecord: exact, reason: `Matched explicit case id ${request.targetCaseId}.` };
    }
    return {
      caseRecord: null,
      reason: `The request stayed inside the current lane but case id ${request.targetCaseId} is not in the validated checkpoint map.`
    };
  }

  let candidates = cases.slice();

  if (Number.isInteger(request.roundEnd)) {
    candidates = candidates.filter((entry) => entry.round_end === request.roundEnd);
  }

  if (request.sboxModel) {
    candidates = candidates.filter((entry) => canonicalToken(entry.expected_sbox_model) === request.sboxModel);
  }

  if (request.claimKind) {
    candidates = candidates.filter((entry) => canonicalToken(entry.claim_kind) === request.claimKind);
  }

  if (candidates.length === 1) {
    return {
      caseRecord: candidates[0],
      reason: `Matched one validated checkpoint by round and lane metadata: ${candidates[0].case_id}.`
    };
  }

  if (candidates.length > 1) {
    return {
      caseRecord: null,
      reason: 'Multiple validated checkpoints fit the request. Make the case id or lane metadata more explicit.'
    };
  }

  return {
    caseRecord: null,
    reason: 'The request is inside the same paper lane, but it does not map to a currently validated checkpoint.'
  };
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function displayResult(result) {
  const { _paths, ...rest } = result;
  return {
    ...rest,
    requestPath: relativeToRoot(rest.requestPath),
    artifacts: {
      ...rest.artifacts,
      bundleCopyPath: relativeToRoot(rest.artifacts.bundleCopyPath),
      intakeResultPath: relativeToRoot(rest.artifacts.intakeResultPath),
      primitiveCardPath: relativeToRoot(rest.artifacts.primitiveCardPath),
      attackCardPath: relativeToRoot(rest.artifacts.attackCardPath),
      requestCopyPath: relativeToRoot(rest.artifacts.requestCopyPath),
      analysisResultPath: relativeToRoot(rest.artifacts.analysisResultPath),
      topLevelReportTexPath: relativeToRoot(rest.artifacts.topLevelReportTexPath),
      topLevelReportPdfPath: relativeToRoot(rest.artifacts.topLevelReportPdfPath),
      delegatedManifestPath: relativeToRoot(rest.artifacts.delegatedManifestPath),
      delegatedVerdictPath: relativeToRoot(rest.artifacts.delegatedVerdictPath),
      delegatedLedgerPath: relativeToRoot(rest.artifacts.delegatedLedgerPath),
      delegatedCalibrationReportTexPath: relativeToRoot(rest.artifacts.delegatedCalibrationReportTexPath),
      delegatedCalibrationReportPdfPath: relativeToRoot(rest.artifacts.delegatedCalibrationReportPdfPath)
    }
  };
}

function buildBaseResult(options, requestPath, request, outputDir, capability) {
  const bundleCopyPath = path.join(outputDir, 'analysis-bundle.json');
  const intakeResultPath = path.join(outputDir, 'analysis-intake-result.json');
  const primitiveCardPath = path.join(outputDir, 'primitive-intake-card.json');
  const attackCardPath = path.join(outputDir, 'attack-intake-card.json');
  const requestCopyPath = path.join(outputDir, 'analysis-request.json');
  const analysisResultPath = path.join(outputDir, 'analysis-result.json');
  const topLevelReportTexPath = options.report ? path.join(outputDir, 'analysis-report.tex') : '';
  const topLevelReportPdfPath = options.report ? path.join(outputDir, 'analysis-report.pdf') : '';

  return {
    requestId: request.requestId,
    generatedAt: new Date().toISOString(),
    requestPath,
    bundle: {
      sourceBundle: request.sourceBundle,
      notes: request.notes
    },
    normalizedRequest: request,
    currentCapability: capability,
    route: {
      selectedMode: '',
      reason: '',
      matchedCurrentScope: false,
      validatedLaneId: capability.validatedLaneId
    },
    status: '',
    outcome: {
      summary: '',
      nextAction: '',
      missingFields: [],
      calibrationNeed: '',
      paperVerdictLabel: ''
    },
    artifacts: {
      bundleCopyPath: '',
      intakeResultPath: '',
      primitiveCardPath: '',
      attackCardPath: '',
      requestCopyPath,
      analysisResultPath,
      topLevelReportTexPath,
      topLevelReportPdfPath,
      delegatedManifestPath: '',
      delegatedVerdictPath: '',
      delegatedLedgerPath: '',
      delegatedCalibrationReportTexPath: '',
      delegatedCalibrationReportPdfPath: ''
    },
    runtime: {
      inputMode: options.bundlePath ? 'bundle' : 'request'
    },
    _paths: {
      bundleCopyPath,
      intakeResultPath,
      primitiveCardPath,
      attackCardPath
    }
  };
}

function maybeRenderTopLevelReport(options, result) {
  if (!options.report) {
    return;
  }

  runJsonCommand('node', [
    DEFAULT_REPORT_RENDERER_PATH,
    '--result', result.artifacts.analysisResultPath,
    '--output-tex', result.artifacts.topLevelReportTexPath,
    '--output-pdf', result.artifacts.topLevelReportPdfPath,
    '--latex-engine', options.reportLatexEngine
  ], ROOT_DIR);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (!options.requestPath) {
    if (!options.bundlePath) {
      throw new Error('Missing required argument: --request or --bundle');
    }
  }

  if (options.requestPath && options.bundlePath) {
    throw new Error('Use either --request or --bundle, not both.');
  }

  const inputPath = path.resolve(options.bundlePath || options.requestPath);
  const rawInput = readJson(inputPath);
  let request = null;
  let intakePrepared = null;

  if (options.bundlePath) {
    intakePrepared = prepareIntakeArtifacts(rawInput, inputPath);
    request = intakePrepared.requestDraft;
  } else {
    request = normalizeRequest(rawInput, inputPath);
  }

  const reference = readJson(options.referencePath);
  const capability = buildCapabilitySummary(reference);
  const runLabel = sanitizeLabel(options.runLabel || 'default') || 'default';
  const outputDir = options.outputDir
    || path.join(ROOT_DIR, 'outputs', 'cryptanalysis-analysis', request.requestId, runLabel);

  ensureDir(outputDir);

  const result = buildBaseResult(options, inputPath, request, outputDir, capability);
  result.requestPath = inputPath;

  if (intakePrepared) {
    result.artifacts.bundleCopyPath = result._paths.bundleCopyPath;
    result.artifacts.intakeResultPath = result._paths.intakeResultPath;
    result.artifacts.primitiveCardPath = result._paths.primitiveCardPath;
    result.artifacts.attackCardPath = result._paths.attackCardPath;

    writeJson(result.artifacts.bundleCopyPath, {
      ...rawInput,
      source_items: intakePrepared.intakeResult.sourceItems
    });
    writeJson(result.artifacts.intakeResultPath, intakePrepared.intakeResult);
    writeJson(result.artifacts.primitiveCardPath, intakePrepared.primitiveCard);
    writeJson(result.artifacts.attackCardPath, intakePrepared.attackCard);

    result.bundle.sourceBundle = intakePrepared.requestDraft.sourceBundle;
    result.bundle.notes = intakePrepared.requestDraft.notes;
    result.outcome.intakeWarnings = intakePrepared.intakeResult.warnings || [];
  }

  delete result._paths;

  writeJson(result.artifacts.requestCopyPath, request);

  const missingFields = collectMissingFields(request);
  if (missingFields.length > 0) {
    result.status = 'limited';
    result.route.selectedMode = 'intake';
    result.route.reason = 'The bundle is not frozen enough for trusted analysis routing.';
    result.outcome.summary = 'The request stayed in intake mode because critical analysis coordinates are still missing or ambiguous.';
    result.outcome.nextAction = 'Clarify the missing analysis coordinates, then rerun the top-level cryptanalysis entry.';
    result.outcome.missingFields = missingFields;
    result.outcome.calibrationNeed = 'undetermined';
    result.bundle.sourceBundle = request.sourceBundle;
    result.bundle.notes = request.notes;
    result.outcome.intakeQuestions = buildIntakeQuestions(missingFields);
    writeJson(result.artifacts.analysisResultPath, result);
    maybeRenderTopLevelReport(options, result);
    console.log(JSON.stringify(displayResult(result), null, 2));
    return;
  }

  const scopeDecision = matchesCurrentScope(request);
  result.route.matchedCurrentScope = scopeDecision.matched;

  if (!scopeDecision.matched) {
    result.status = 'unsupported-current-scope';
    result.route.selectedMode = 'scope-reject';
    result.route.reason = `The request does not fit the current validated lane: ${JSON.stringify(scopeDecision.details)}.`;
    result.outcome.summary = 'The bundle is coherent enough to understand, but it is outside the currently supported cryptanalysis lane.';
    result.outcome.nextAction = 'Open a new calibration lane for this primitive or attack family before claiming trusted analysis support.';
    result.outcome.calibrationNeed = 'new-lane-required';
    writeJson(result.artifacts.analysisResultPath, result);
    maybeRenderTopLevelReport(options, result);
    console.log(JSON.stringify(displayResult(result), null, 2));
    return;
  }

  const resolvedCase = resolveSupportedCase(reference, request);
  if (!resolvedCase.caseRecord) {
    result.status = 'needs-calibration';
    result.route.selectedMode = 'calibrate';
    result.route.reason = resolvedCase.reason;
    result.outcome.summary = 'The request stays inside the same paper lane, but it exceeds the currently validated checkpoint map.';
    result.outcome.nextAction = 'Create or tighten a calibration checkpoint for this target before treating the resulting lane as trusted.';
    result.outcome.calibrationNeed = 'existing-lane-extension-required';
    writeJson(result.artifacts.analysisResultPath, result);
    maybeRenderTopLevelReport(options, result);
    console.log(JSON.stringify(displayResult(result), null, 2));
    return;
  }

  const delegatedOutputDir = path.join(outputDir, 'delegated-calibration-run');
  const delegatedArgs = [
    DEFAULT_CALIBRATION_RUNNER_PATH,
    '--reference', options.referencePath,
    '--case-id', resolvedCase.caseRecord.case_id,
    '--output-dir', delegatedOutputDir,
    '--run-label', sanitizeLabel(options.runLabel || 'analysis')
  ];

  if (options.solverSummaryInputPath) {
    delegatedArgs.push('--solver-summary-input', options.solverSummaryInputPath);
  }
  if (!options.report) {
    delegatedArgs.push('--no-report');
  } else {
    delegatedArgs.push('--report-latex-engine', options.reportLatexEngine);
  }

  const delegatedDisplay = runJsonCommand('node', delegatedArgs, ROOT_DIR);
  const delegatedManifestPath = path.join(ROOT_DIR, delegatedDisplay.manifestPath);
  const delegatedManifest = readJson(delegatedManifestPath);
  const delegatedVerdictPath = path.join(ROOT_DIR, delegatedDisplay.verdict.verdictPath);
  const delegatedVerdict = readJson(delegatedVerdictPath);

  result.status = 'completed';
  result.route.selectedMode = 'calibrate';
  result.route.reason = resolvedCase.reason;
  result.outcome.summary = `Delegated to the current checkpoint-backed calibration lane and completed a solver-backed run for ${resolvedCase.caseRecord.case_id}.`;
  result.outcome.nextAction = delegatedVerdict.nextAction || delegatedManifest.verdict?.nextAction || '';
  result.outcome.calibrationNeed = 'satisfied-by-current-lane';
  result.outcome.paperVerdictLabel = delegatedVerdict.verdictLabel || '';
  result.outcome.caseId = resolvedCase.caseRecord.case_id;
  result.outcome.paperLocation = resolvedCase.caseRecord.paper_location || '';

  result.artifacts.delegatedManifestPath = delegatedManifestPath;
  result.artifacts.delegatedVerdictPath = delegatedVerdictPath;
  result.artifacts.delegatedLedgerPath = delegatedManifest.verdict?.ledgerPath || '';
  result.artifacts.delegatedCalibrationReportTexPath = delegatedManifest.report?.texPath || '';
  result.artifacts.delegatedCalibrationReportPdfPath = delegatedManifest.report?.pdfPath || '';

  writeJson(result.artifacts.analysisResultPath, result);
  maybeRenderTopLevelReport(options, result);
  console.log(JSON.stringify(displayResult(result), null, 2));
}

main();
