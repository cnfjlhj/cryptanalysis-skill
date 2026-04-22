#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '../..');
const DEFAULT_REFERENCE_PATH = path.join(
  ROOT_DIR,
  'docs',
  'cryptanalysis-benchmark',
  'trials',
  'eprint-2013-676',
  'calibration-reference.present80-rkdiff.json'
);
const DEFAULT_EMIT_SCRIPT_PATH = path.join(ROOT_DIR, 'scripts', 'cryptanalysis-benchmark', 'emit-milp-lp.js');
const DEFAULT_SOLVE_SCRIPT_PATH = path.join(ROOT_DIR, 'scripts', 'cryptanalysis-benchmark', 'run-highs-mip.py');
const DEFAULT_VERDICT_SCRIPT_PATH = path.join(ROOT_DIR, 'scripts', 'cryptanalysis-benchmark', 'render-verdict.js');
const DEFAULT_REPORT_SCRIPT_PATH = path.join(ROOT_DIR, 'scripts', 'cryptanalysis-benchmark', 'render-calibration-report.js');

function parseArgs(argv) {
  const options = {
    referencePath: DEFAULT_REFERENCE_PATH,
    caseId: '',
    outputDir: '',
    runLabel: '',
    sboxModel: '',
    solverSummaryInputPath: '',
    timeLimit: 60,
    threads: 4,
    mipHeuristicEffort: null,
    randomSeed: null,
    report: true,
    reportLatexEngine: 'pdflatex',
    quiet: false,
    help: false
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

    if ((current === '--output-dir' || current === '--out-dir') && next) {
      options.outputDir = path.resolve(next);
      index += 1;
      continue;
    }

    if ((current === '--run-label' || current === '--label') && next) {
      options.runLabel = String(next);
      index += 1;
      continue;
    }

    if ((current === '--sbox-model' || current === '--sbox-semantics') && next) {
      options.sboxModel = String(next).trim().toLowerCase();
      index += 1;
      continue;
    }

    if ((current === '--solver-summary-input' || current === '--solver-summary-path') && next) {
      options.solverSummaryInputPath = path.resolve(next);
      index += 1;
      continue;
    }

    if (current === '--time-limit' && next) {
      options.timeLimit = parseFloatValue(next, current);
      index += 1;
      continue;
    }

    if (current === '--threads' && next) {
      options.threads = parseIntegerValue(next, current);
      index += 1;
      continue;
    }

    if (current === '--mip-heuristic-effort' && next) {
      options.mipHeuristicEffort = parseFloatValue(next, current);
      index += 1;
      continue;
    }

    if (current === '--random-seed' && next) {
      options.randomSeed = parseIntegerValue(next, current);
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

    if (current === '--quiet') {
      options.quiet = true;
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
    '  node scripts/cryptanalysis-benchmark/run-calibration-case.js --case-id <id>',
    '',
    'Options:',
    '  --reference <path>            Calibration reference JSON',
    '  --case-id <id>               Reference case id',
    '  --output-dir <path>          Optional output directory for this run',
    '  --run-label <text>           Optional run label used in filenames and verdict text',
    '  --sbox-model <mode>          Optional override for emitter S-box lane',
    '  --solver-summary-input <path> Reuse an existing solver summary instead of solving locally',
    '  --time-limit <seconds>       Local solve time limit when not reusing a summary',
    '  --threads <n>                Local solve thread count when not reusing a summary',
    '  --mip-heuristic-effort <x>   Optional local HiGHS heuristic effort override',
    '  --random-seed <n>            Optional local HiGHS random seed override',
    '  --no-report                  Skip the .tex/.pdf report layer',
    '  --report-latex-engine <name> Report build engine passed to latexmk, default: pdflatex',
    '  --quiet                      Pass through to the local solver lane'
  ].join('\n'));
}

function parseIntegerValue(value, flagName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Expected an integer for ${flagName}, got: ${value}`);
  }
  return parsed;
}

function parseFloatValue(value, flagName) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected a finite number for ${flagName}, got: ${value}`);
  }
  return parsed;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sanitizeLabel(label) {
  return String(label || '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function resolveMaybeRelative(baseDir, targetPath) {
  if (!targetPath) {
    return '';
  }
  return path.isAbsolute(targetPath) ? targetPath : path.resolve(baseDir, targetPath);
}

function defaultRunLabel(options, selectedCase, usingExternalSummary) {
  if (options.runLabel) {
    return sanitizeLabel(options.runLabel);
  }
  if (usingExternalSummary) {
    return sanitizeLabel(path.basename(options.solverSummaryInputPath, '.json')) || 'reused-summary';
  }
  const timePart = `local-highs-${String(options.timeLimit).replace(/\./g, 'p')}s`;
  return sanitizeLabel(timePart || selectedCase.case_id);
}

function buildOutputDir(options, resolvedOutputRoot, selectedCase, runLabel) {
  if (options.outputDir) {
    return options.outputDir;
  }
  return path.join(resolvedOutputRoot, 'calibration-runs', selectedCase.case_id, runLabel);
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT_DIR,
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    throw new Error([
      `Command failed: ${command} ${args.join(' ')}`,
      result.stderr || result.stdout || '(no output)'
    ].join('\n'));
  }

  return result.stdout.trim();
}

function copyFile(sourcePath, targetPath) {
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

function relativeToRoot(targetPath) {
  if (!targetPath) {
    return '';
  }
  return path.relative(ROOT_DIR, targetPath);
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

  const referencePath = path.resolve(options.referencePath);
  const referenceDir = path.dirname(referencePath);
  const reference = readJson(referencePath);
  const selectedCase = (reference.cases || []).find((entry) => entry.case_id === options.caseId);
  if (!selectedCase) {
    throw new Error(`Case not found in reference set: ${options.caseId}`);
  }

  const defaults = reference.emission_defaults || {};
  const instantiationPath = resolveMaybeRelative(referenceDir, defaults.instantiation_path);
  const primitiveSpecPath = resolveMaybeRelative(referenceDir, defaults.primitive_spec_path);
  const localSemanticsPath = resolveMaybeRelative(referenceDir, defaults.local_semantics_path);
  const resolvedOutputRoot = resolveMaybeRelative(referenceDir, defaults.output_root || '.');
  const usingExternalSummary = Boolean(options.solverSummaryInputPath);
  const runLabel = defaultRunLabel(options, selectedCase, usingExternalSummary);
  const outputDir = buildOutputDir(options, resolvedOutputRoot, selectedCase, runLabel);
  const sboxModel = options.sboxModel
    || selectedCase.expected_sbox_model
    || defaults.default_sbox_model
    || 'cdp';
  const unitId = selectedCase.expected_unit_id || defaults.unit_id || 'p1_compute_12r_lower_bound_model';
  const baseName = `${selectedCase.case_id}.${runLabel}`;

  ensureDir(outputDir);

  const lpPath = path.join(outputDir, `${baseName}.lp`);
  const emissionSummaryPath = path.join(outputDir, `${baseName}.emission-summary.json`);
  const solverSummaryPath = path.join(outputDir, `${baseName}.solver-summary.json`);
  const solutionPath = path.join(outputDir, `${baseName}.sol`);
  const logPath = path.join(outputDir, `${baseName}.log`);
  const verdictPath = path.join(outputDir, `${baseName}.verdict.json`);
  const ledgerPath = path.join(outputDir, `${baseName}.ledger.csv`);
  const manifestPath = path.join(outputDir, `${baseName}.manifest.json`);
  const reportTexPath = path.join(outputDir, `${baseName}.report.tex`);
  const reportPdfPath = path.join(outputDir, `${baseName}.report.pdf`);

  const emitArgs = [
    DEFAULT_EMIT_SCRIPT_PATH,
    '--instantiation', instantiationPath,
    '--primitive-spec', primitiveSpecPath,
    '--local-semantics', localSemanticsPath,
    '--unit-id', unitId,
    '--output', lpPath,
    '--summary-output', emissionSummaryPath,
    '--sbox-model', sboxModel
  ];

  if (Number.isInteger(selectedCase.round_end)) {
    emitArgs.push('--round-end', String(selectedCase.round_end));
  }

  runCommand('node', emitArgs, { cwd: ROOT_DIR });

  if (usingExternalSummary) {
    copyFile(options.solverSummaryInputPath, solverSummaryPath);
  } else {
    const solveArgs = [
      DEFAULT_SOLVE_SCRIPT_PATH,
      '--model', lpPath,
      '--summary-output', solverSummaryPath,
      '--solution-output', solutionPath,
      '--log-output', logPath,
      '--time-limit', String(options.timeLimit),
      '--threads', String(options.threads)
    ];

    if (options.mipHeuristicEffort !== null) {
      solveArgs.push('--mip-heuristic-effort', String(options.mipHeuristicEffort));
    }

    if (options.randomSeed !== null) {
      solveArgs.push('--random-seed', String(options.randomSeed));
    }

    if (options.quiet) {
      solveArgs.push('--quiet');
    }

    runCommand('python3', solveArgs, { cwd: ROOT_DIR });
  }

  runCommand('node', [
    DEFAULT_VERDICT_SCRIPT_PATH,
    '--reference', referencePath,
    '--case-id', selectedCase.case_id,
    '--solver-summary', solverSummaryPath,
    '--emission-summary', emissionSummaryPath,
    '--run-label', runLabel,
    '--output', verdictPath,
    '--ledger-row-output', ledgerPath
  ], { cwd: ROOT_DIR });

  const verdict = readJson(verdictPath);
  const manifest = {
    referencePath,
    caseId: selectedCase.case_id,
    runLabel,
    outputDir,
    mode: usingExternalSummary ? 'emit-plus-verdict-from-existing-summary' : 'emit-solve-verdict-local',
    emission: {
      instantiationPath,
      primitiveSpecPath,
      localSemanticsPath,
      unitId,
      roundEnd: Number.isInteger(selectedCase.round_end) ? selectedCase.round_end : null,
      sboxModel,
      lpPath,
      summaryPath: emissionSummaryPath
    },
    solver: usingExternalSummary
      ? {
          reusedSummaryPath: options.solverSummaryInputPath,
          copiedSummaryPath: solverSummaryPath
        }
      : {
          modelPath: lpPath,
          summaryPath: solverSummaryPath,
          solutionPath,
          logPath,
          timeLimitSeconds: options.timeLimit,
          threads: options.threads,
          mipHeuristicEffort: options.mipHeuristicEffort,
          randomSeed: options.randomSeed
        },
    verdict: {
      verdictPath,
      ledgerPath,
      verdictLabel: verdict.verdictLabel,
      dominantMismatchStage: verdict.dominantMismatchStage,
      nextAction: verdict.nextAction
    }
  };

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  if (options.report) {
    runCommand('node', [
      DEFAULT_REPORT_SCRIPT_PATH,
      '--manifest', manifestPath,
      '--output-tex', reportTexPath,
      '--output-pdf', reportPdfPath,
      '--latex-engine', options.reportLatexEngine
    ], { cwd: ROOT_DIR });

    manifest.report = {
      texPath: reportTexPath,
      pdfPath: reportPdfPath,
      latexEngine: options.reportLatexEngine
    };

    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }

  manifest.manifestPath = manifestPath;

  const display = {
    ...manifest,
    outputDir: relativeToRoot(outputDir),
    manifestPath: relativeToRoot(manifestPath),
    emission: {
      ...manifest.emission,
      lpPath: relativeToRoot(lpPath),
      summaryPath: relativeToRoot(emissionSummaryPath)
    },
    solver: usingExternalSummary
      ? {
          reusedSummaryPath: relativeToRoot(options.solverSummaryInputPath),
          copiedSummaryPath: relativeToRoot(solverSummaryPath)
        }
      : {
          ...manifest.solver,
          modelPath: relativeToRoot(lpPath),
          summaryPath: relativeToRoot(solverSummaryPath),
          solutionPath: relativeToRoot(solutionPath),
          logPath: relativeToRoot(logPath)
        },
    verdict: {
      ...manifest.verdict,
      verdictPath: relativeToRoot(verdictPath),
      ledgerPath: relativeToRoot(ledgerPath)
    },
    report: manifest.report
      ? {
          ...manifest.report,
          texPath: relativeToRoot(manifest.report.texPath),
          pdfPath: relativeToRoot(manifest.report.pdfPath)
        }
      : undefined
  };

  console.log(JSON.stringify(display, null, 2));
}

main();
