#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '../..');
const ANALYSIS_RUNNER_PATH = path.join(ROOT_DIR, 'scripts', 'cryptanalysis-benchmark', 'run-cryptanalysis-analysis.js');
const EXAMPLES_DIR = path.join(ROOT_DIR, 'docs', 'cryptanalysis-benchmark', 'examples');
const DEFAULT_OUTPUT_DIR = path.join(ROOT_DIR, 'outputs', 'cryptanalysis-paper-drop');
const DEFAULT_SUPPORTED_SUMMARY = path.join(
  ROOT_DIR,
  'fixtures',
  'solver-summaries',
  'present80-r5-serverc.summary.json'
);

const PAPER_TEMPLATES = {
  'eprint-2013-676': {
    defaultVariant: 'supported',
    variants: {
      supported: path.join(EXAMPLES_DIR, 'eprint-2013-676.present80-r5.bundle.json'),
      extension_24r: path.join(EXAMPLES_DIR, 'eprint-2013-676.present80-r24-extension.bundle.json')
    }
  },
  'eprint-2014-747': {
    defaultVariant: 'default',
    variants: {
      default: path.join(EXAMPLES_DIR, 'eprint-2014-747.predefined-properties.bundle.json')
    }
  },
  'eprint-2016-407': {
    defaultVariant: 'default',
    variants: {
      default: path.join(EXAMPLES_DIR, 'eprint-2016-407.speck.bundle.json')
    }
  },
  'eprint-2022-513': {
    defaultVariant: 'default',
    variants: {
      default: path.join(EXAMPLES_DIR, 'eprint-2022-513.cascada.bundle.json')
    }
  }
};

function parseArgs(argv) {
  const options = {
    paperPath: '',
    primitivePaperPath: '',
    variant: '',
    outputDir: '',
    runLabel: '',
    report: true,
    reportLatexEngine: 'pdflatex',
    forceLocalSolve: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if ((current === '--paper' || current === '--paper-path') && next) {
      options.paperPath = path.resolve(next);
      index += 1;
      continue;
    }

    if ((current === '--primitive-paper' || current === '--primitive-paper-path') && next) {
      options.primitivePaperPath = path.resolve(next);
      index += 1;
      continue;
    }

    if ((current === '--variant' || current === '--profile') && next) {
      options.variant = String(next).trim();
      index += 1;
      continue;
    }

    if ((current === '--output-dir' || current === '--out-dir') && next) {
      options.outputDir = path.resolve(next);
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

    if (current === '--force-local-solve') {
      options.forceLocalSolve = true;
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
    '  node scripts/cryptanalysis-benchmark/run-cryptanalysis-paper.js --paper <path>',
    '',
    'Options:',
    '  --paper <path>                Attack paper file path',
    '  --primitive-paper <path>      Optional primitive paper file path',
    '  --variant <name>              Optional known-paper variant, e.g. supported or extension_24r',
    '  --output-dir <path>           Optional output directory',
    '  --run-label <text>            Optional run label',
    '  --report-latex-engine <name>  latexmk engine for reports',
    '  --no-report                   Skip report generation',
    '  --force-local-solve           Do not reuse the stable supported summary bootstrap'
  ].join('\n'));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function relativeToRoot(targetPath) {
  if (!targetPath) {
    return '';
  }
  return path.relative(ROOT_DIR, targetPath);
}

function sanitizeLabel(label) {
  return String(label || '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function detectPaperId(filePath) {
  const candidates = [
    path.basename(filePath),
    path.basename(path.dirname(filePath)),
    filePath
  ];

  for (const candidate of candidates) {
    const match = candidate.match(/eprint[-_](\d{4})[-_](\d+)/i);
    if (match) {
      return `eprint-${match[1]}-${match[2]}`;
    }
  }

  return '';
}

function buildFallbackBundle(paperPath, paperId) {
  return {
    bundle_id: sanitizeLabel(path.basename(paperPath, path.extname(paperPath))) || 'paper-drop',
    source_items: [
      {
        id: 'attack-paper',
        kind: 'attack_paper_file',
        label: path.basename(paperPath),
        role: 'attack-paper',
        path: relativeToRoot(paperPath),
        uri: ''
      }
    ],
    paper: {
      id: paperId || sanitizeLabel(path.basename(paperPath, path.extname(paperPath))),
      title: ''
    },
    notes: 'Fallback paper-entry bundle created from a local paper file without a known template.'
  };
}

function maybeFindSiblingPrimitivePaper(paperPath) {
  const dirPath = path.dirname(paperPath);
  const candidates = [
    'present-ches2007.pdf',
    'present-ches2007.txt'
  ];

  for (const candidate of candidates) {
    const fullPath = path.join(dirPath, candidate);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  return '';
}

function loadBundleTemplate(paperId, variant) {
  const config = PAPER_TEMPLATES[paperId];
  if (!config) {
    return null;
  }

  const chosenVariant = variant || config.defaultVariant;
  const templatePath = config.variants[chosenVariant];
  if (!templatePath) {
    throw new Error(`Unknown variant ${chosenVariant} for ${paperId}`);
  }

  return {
    bundle: readJson(templatePath),
    templatePath,
    chosenVariant
  };
}

function upsertSourceItem(items, role, nextItem) {
  const index = items.findIndex((entry) => entry && entry.role === role);
  if (index >= 0) {
    items[index] = {
      ...items[index],
      ...nextItem
    };
    return;
  }

  items.push(nextItem);
}

function prepareBundleFromPaper(options) {
  const paperId = detectPaperId(options.paperPath);
  const templateLoad = loadBundleTemplate(paperId, options.variant);
  const prepared = templateLoad
    ? JSON.parse(JSON.stringify(templateLoad.bundle))
    : buildFallbackBundle(options.paperPath, paperId);

  prepared.source_items = Array.isArray(prepared.source_items) ? prepared.source_items : [];
  upsertSourceItem(prepared.source_items, 'attack-paper', {
    id: 'attack-paper',
    kind: 'attack_paper_file',
    label: path.basename(options.paperPath),
    role: 'attack-paper',
    path: relativeToRoot(options.paperPath),
    uri: prepared.source_items.find((entry) => entry.role === 'attack-paper')?.uri || ''
  });

  const primitivePaperPath = options.primitivePaperPath || maybeFindSiblingPrimitivePaper(options.paperPath);
  if (primitivePaperPath) {
    upsertSourceItem(prepared.source_items, 'primitive-paper', {
      id: 'primitive-paper',
      kind: 'primitive_paper_file',
      label: path.basename(primitivePaperPath),
      role: 'primitive-paper',
      path: relativeToRoot(primitivePaperPath),
      uri: prepared.source_items.find((entry) => entry.role === 'primitive-paper')?.uri || ''
    });
  }

  if (!prepared.paper) {
    prepared.paper = {};
  }
  if (!prepared.paper.id && paperId) {
    prepared.paper.id = paperId;
  }

  return {
    paperId,
    chosenVariant: templateLoad ? templateLoad.chosenVariant : 'fallback',
    templatePath: templateLoad ? templateLoad.templatePath : '',
    bundle: prepared
  };
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

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (!options.paperPath) {
    throw new Error('Missing required argument: --paper');
  }

  const prepared = prepareBundleFromPaper(options);
  const runLabel = sanitizeLabel(options.runLabel || prepared.chosenVariant || 'paper-drop') || 'paper-drop';
  const outputDir = options.outputDir
    ? path.resolve(options.outputDir)
    : path.join(
        DEFAULT_OUTPUT_DIR,
        sanitizeLabel(prepared.paperId || path.basename(options.paperPath, path.extname(options.paperPath)) || 'unknown-paper'),
        runLabel
      );

  ensureDir(outputDir);

  const bundlePath = path.join(outputDir, 'paper-entry.bundle.json');
  writeJson(bundlePath, prepared.bundle);

  const args = [
    ANALYSIS_RUNNER_PATH,
    '--bundle', bundlePath,
    '--output-dir', outputDir,
    '--run-label', runLabel
  ];

  const shouldBootstrapSupportedSummary =
    prepared.paperId === 'eprint-2013-676'
    && prepared.chosenVariant === 'supported'
    && !options.forceLocalSolve
    && fs.existsSync(DEFAULT_SUPPORTED_SUMMARY);

  if (shouldBootstrapSupportedSummary) {
    args.push('--solver-summary-input', DEFAULT_SUPPORTED_SUMMARY);
  }

  if (!options.report) {
    args.push('--no-report');
  } else {
    args.push('--report-latex-engine', options.reportLatexEngine);
  }

  const result = runJsonCommand('node', args, ROOT_DIR);
  console.log(JSON.stringify({
    paperPath: relativeToRoot(options.paperPath),
    primitivePaperPath: options.primitivePaperPath ? relativeToRoot(options.primitivePaperPath) : '',
    paperId: prepared.paperId,
    chosenVariant: prepared.chosenVariant,
    templatePath: relativeToRoot(prepared.templatePath),
    bundlePath: relativeToRoot(bundlePath),
    reusedStableSummary: shouldBootstrapSupportedSummary,
    result
  }, null, 2));
}

main();
