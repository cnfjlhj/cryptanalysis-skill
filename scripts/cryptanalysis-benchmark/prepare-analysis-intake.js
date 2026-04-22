#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  prepareIntakeArtifacts,
  sanitizeLabel
} = require('./lib/analysis-intake');

const ROOT_DIR = path.join(__dirname, '../..');

function parseArgs(argv) {
  const options = {
    bundlePath: '',
    outputDir: '',
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

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
    '  node scripts/cryptanalysis-benchmark/prepare-analysis-intake.js --bundle <path>',
    '',
    'Options:',
    '  --bundle <path>         Raw analysis bundle JSON',
    '  --output-dir <path>     Optional output directory for intake artifacts'
  ].join('\n'));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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

  if (!options.bundlePath) {
    throw new Error('Missing required argument: --bundle');
  }

  const bundlePath = path.resolve(options.bundlePath);
  const bundle = readJson(bundlePath);
  const prepared = prepareIntakeArtifacts(bundle, bundlePath);
  const outputDir = options.outputDir
    || path.join(ROOT_DIR, 'outputs', 'cryptanalysis-intake', sanitizeLabel(prepared.requestDraft.requestId || 'bundle'));

  ensureDir(outputDir);

  const bundleCopyPath = path.join(outputDir, 'analysis-bundle.json');
  const requestDraftPath = path.join(outputDir, 'analysis-request.draft.json');
  const primitiveCardPath = path.join(outputDir, 'primitive-intake-card.json');
  const attackCardPath = path.join(outputDir, 'attack-intake-card.json');
  const intakeResultPath = path.join(outputDir, 'analysis-intake-result.json');

  writeJson(bundleCopyPath, {
    ...bundle,
    source_items: prepared.intakeResult.sourceItems
  });
  writeJson(requestDraftPath, prepared.requestDraft);
  writeJson(primitiveCardPath, prepared.primitiveCard);
  writeJson(attackCardPath, prepared.attackCard);
  writeJson(intakeResultPath, prepared.intakeResult);

  console.log(JSON.stringify({
    bundlePath: relativeToRoot(bundlePath),
    outputDir: relativeToRoot(outputDir),
    bundleCopyPath: relativeToRoot(bundleCopyPath),
    requestDraftPath: relativeToRoot(requestDraftPath),
    primitiveCardPath: relativeToRoot(primitiveCardPath),
    attackCardPath: relativeToRoot(attackCardPath),
    intakeResultPath: relativeToRoot(intakeResultPath),
    bundleState: prepared.requestDraft.bundleState,
    readyForRouting: prepared.intakeResult.readyForRouting
  }, null, 2));
}

main();
