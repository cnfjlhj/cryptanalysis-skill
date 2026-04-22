#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '../..');
const ANALYSIS_RUNNER_PATH = path.join(ROOT_DIR, 'scripts', 'cryptanalysis-benchmark', 'run-cryptanalysis-analysis.js');
const DEFAULT_OUTPUT_DIR = path.join(ROOT_DIR, 'outputs', 'cryptanalysis-demo');
const EXAMPLES_DIR = path.join(ROOT_DIR, 'docs', 'cryptanalysis-benchmark', 'examples');

const DEMO_CASES = {
  completed: {
    label: 'Supported PRESENT-80 checkpoint',
    bundlePath: path.join(EXAMPLES_DIR, 'eprint-2013-676.present80-r5.bundle.json'),
    solverSummaryInputPath: path.join(
      ROOT_DIR,
      'fixtures',
      'solver-summaries',
      'present80-r5-serverc.summary.json'
    ),
    expectedStatus: 'completed'
  },
  needs_calibration: {
    label: 'Same area but outside validated checkpoint map',
    bundlePath: path.join(EXAMPLES_DIR, 'eprint-2013-676.present80-r24-extension.bundle.json'),
    expectedStatus: 'needs-calibration'
  },
  unsupported: {
    label: 'Current unsupported ARX scope example',
    bundlePath: path.join(EXAMPLES_DIR, 'eprint-2016-407.speck.bundle.json'),
    expectedStatus: 'unsupported-current-scope'
  },
  limited: {
    label: 'Intentionally incomplete framework-oriented bundle',
    bundlePath: path.join(EXAMPLES_DIR, 'eprint-2022-513.cascada.bundle.json'),
    expectedStatus: 'limited'
  }
};

function parseArgs(argv) {
  const options = {
    demoName: 'all',
    outputDir: DEFAULT_OUTPUT_DIR,
    report: true,
    reportLatexEngine: 'pdflatex',
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if ((current === '--demo' || current === '--case') && next) {
      options.demoName = String(next).trim();
      index += 1;
      continue;
    }

    if ((current === '--output-dir' || current === '--out-dir') && next) {
      options.outputDir = path.resolve(next);
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
    '  node scripts/cryptanalysis-benchmark/run-cryptanalysis-demo.js --demo <completed|needs_calibration|unsupported|limited|all>',
    '',
    'Options:',
    '  --demo <name>              Demo case name, default: all',
    '  --output-dir <path>        Optional output directory',
    '  --report-latex-engine <n>  latexmk engine for per-case reports',
    '  --no-report                Skip report generation for per-case runs'
  ].join('\n'));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, value, 'utf8');
}

function relativeToRoot(targetPath) {
  if (!targetPath) {
    return '';
  }
  return path.relative(ROOT_DIR, targetPath);
}

function selectDemoCases(name) {
  if (name === 'all') {
    return ['completed', 'needs_calibration', 'unsupported', 'limited'];
  }

  if (!DEMO_CASES[name]) {
    throw new Error(`Unknown demo name: ${name}`);
  }

  return [name];
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

function buildMarkdownSummary(summary) {
  const lines = [
    '# Cryptanalysis Demo Summary',
    '',
    `Generated at: ${summary.generatedAt}`,
    '',
    `Demo selection: ${summary.demoName}`,
    '',
    '| Demo Case | Expected Status | Observed Status | Bundle | Top-level PDF |',
    '| --- | --- | --- | --- | --- |'
  ];

  for (const entry of summary.caseRuns) {
    lines.push([
      `| ${entry.demoCase}`,
      entry.expectedStatus,
      entry.observedStatus,
      entry.bundlePath || 'n/a',
      entry.topLevelReportPdfPath || 'n/a',
      '|'
    ].join(' '));
  }

  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- `completed` shows the currently validated lane.');
  lines.push('- `needs-calibration` shows a plausible next-lane extension request.');
  lines.push('- `unsupported-current-scope` shows the current hard boundary.');
  lines.push('- `limited` shows the intake gate when the bundle is incomplete.');
  lines.push('');
  lines.push('## Output Directory');
  lines.push('');
  lines.push(summary.outputDir);
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const selectedCaseNames = selectDemoCases(options.demoName);
  const outputDir = path.resolve(options.outputDir);
  ensureDir(outputDir);

  const caseRuns = [];

  for (const demoCase of selectedCaseNames) {
    const definition = DEMO_CASES[demoCase];
    const caseOutputDir = path.join(outputDir, demoCase);
    const args = [
      ANALYSIS_RUNNER_PATH,
      '--bundle', definition.bundlePath,
      '--output-dir', caseOutputDir,
      '--run-label', demoCase
    ];

    if (definition.solverSummaryInputPath) {
      args.push('--solver-summary-input', definition.solverSummaryInputPath);
    }

    if (!options.report) {
      args.push('--no-report');
    } else {
      args.push('--report-latex-engine', options.reportLatexEngine);
    }

    const result = runJsonCommand('node', args, ROOT_DIR);
    caseRuns.push({
      demoCase,
      label: definition.label,
      expectedStatus: definition.expectedStatus,
      observedStatus: result.status,
      requestId: result.requestId,
      bundlePath: result.requestPath,
      topLevelReportPdfPath: result.artifacts.topLevelReportPdfPath,
      analysisResultPath: result.artifacts.analysisResultPath,
      delegatedCalibrationReportPdfPath: result.artifacts.delegatedCalibrationReportPdfPath
    });
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    demoName: options.demoName,
    outputDir: relativeToRoot(outputDir),
    caseRuns
  };

  const summaryJsonPath = path.join(outputDir, 'demo-summary.json');
  const summaryMdPath = path.join(outputDir, 'demo-summary.md');
  writeJson(summaryJsonPath, summary);
  writeText(summaryMdPath, buildMarkdownSummary(summary));

  console.log(JSON.stringify({
    generatedAt: summary.generatedAt,
    demoName: summary.demoName,
    outputDir: summary.outputDir,
    summaryJsonPath: relativeToRoot(summaryJsonPath),
    summaryMdPath: relativeToRoot(summaryMdPath),
    caseRuns
  }, null, 2));
}

main();
