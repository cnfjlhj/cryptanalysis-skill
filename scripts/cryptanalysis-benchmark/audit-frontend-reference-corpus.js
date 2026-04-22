#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '../..');
const DEFAULT_REFERENCE_DIR = path.join(
  ROOT_DIR,
  'docs',
  'cryptanalysis-benchmark',
  'references',
  'frontend'
);
const DEFAULT_OUTPUT_DIR = path.join(
  ROOT_DIR,
  'outputs',
  'cryptanalysis-benchmark',
  'frontend-reference-corpus-v0'
);

const LAYER_STATUSES = new Set(['missing', 'available', 'golden']);
const DOWNSTREAM_STATUSES = new Set(['none', 'semantic_only', 'semantic_blocked', 'execution_backed']);
const FRONTEND_CEILINGS = new Set(['bundle_only', 'algorithm_description_ready', 'structural_ir_ready']);

function parseArgs(argv) {
  const options = {
    referenceDir: DEFAULT_REFERENCE_DIR,
    outputDir: DEFAULT_OUTPUT_DIR,
    noWrite: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if ((current === '--reference-dir' || current === '--dir') && next) {
      options.referenceDir = path.resolve(next);
      index += 1;
      continue;
    }

    if ((current === '--output-dir' || current === '--out-dir') && next) {
      options.outputDir = path.resolve(next);
      index += 1;
      continue;
    }

    if (current === '--no-write') {
      options.noWrite = true;
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
    '  node scripts/cryptanalysis-benchmark/audit-frontend-reference-corpus.js',
    '',
    'Options:',
    '  --reference-dir <path>   Frontend reference manifest directory',
    '  --output-dir <path>      Output directory for summary artifacts',
    '  --no-write               Print JSON only, skip summary files'
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function relativeToRoot(targetPath) {
  if (!targetPath) {
    return '';
  }
  return path.relative(ROOT_DIR, targetPath);
}

function artifactExists(artifactPath) {
  if (!artifactPath) {
    return false;
  }
  return fs.existsSync(path.join(ROOT_DIR, artifactPath));
}

function validateArtifactRef(artifact, label) {
  const errors = [];

  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    errors.push(`${label} must be an object`);
    return errors;
  }

  if (!artifact.label || typeof artifact.label !== 'string') {
    errors.push(`${label}.label must be a non-empty string`);
  }

  if (!artifact.path || typeof artifact.path !== 'string') {
    errors.push(`${label}.path must be a non-empty string`);
  }

  return errors;
}

function validateLayerRecord(layer, label) {
  const errors = [];

  if (!layer || typeof layer !== 'object' || Array.isArray(layer)) {
    errors.push(`${label} must be an object`);
    return errors;
  }

  if (!LAYER_STATUSES.has(layer.status)) {
    errors.push(`${label}.status must be one of ${[...LAYER_STATUSES].join(', ')}`);
  }

  if (!Array.isArray(layer.artifacts)) {
    errors.push(`${label}.artifacts must be an array`);
  } else {
    layer.artifacts.forEach((artifact, index) => {
      errors.push(...validateArtifactRef(artifact, `${label}.artifacts[${index}]`));
    });
  }

  return errors;
}

function validateDownstreamRecord(record, label) {
  const errors = [];

  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    errors.push(`${label} must be an object`);
    return errors;
  }

  if (!DOWNSTREAM_STATUSES.has(record.status)) {
    errors.push(`${label}.status must be one of ${[...DOWNSTREAM_STATUSES].join(', ')}`);
  }

  if (!Array.isArray(record.artifacts)) {
    errors.push(`${label}.artifacts must be an array`);
  } else {
    record.artifacts.forEach((artifact, index) => {
      errors.push(...validateArtifactRef(artifact, `${label}.artifacts[${index}]`));
    });
  }

  return errors;
}

function validateManifest(manifest) {
  const errors = [];
  const requiredStrings = [
    'reference_id',
    'status',
    'paper_id',
    'paper_title',
    'wave',
    'primitive_family',
    'attack_family',
    'current_frontend_ceiling',
    'next_priority'
  ];

  requiredStrings.forEach((key) => {
    if (!manifest[key] || typeof manifest[key] !== 'string') {
      errors.push(`${key} must be a non-empty string`);
    }
  });

  if (manifest.status !== 'active') {
    errors.push('status must be "active"');
  }

  if (!FRONTEND_CEILINGS.has(manifest.current_frontend_ceiling)) {
    errors.push(`current_frontend_ceiling must be one of ${[...FRONTEND_CEILINGS].join(', ')}`);
  }

  if (!Array.isArray(manifest.stress_points) || manifest.stress_points.length === 0) {
    errors.push('stress_points must be a non-empty array');
  }

  if (!Array.isArray(manifest.known_gaps)) {
    errors.push('known_gaps must be an array');
  }

  errors.push(...validateArtifactRef(manifest.raw_bundle, 'raw_bundle'));

  const layers = manifest.frontend_layers;
  if (!layers || typeof layers !== 'object' || Array.isArray(layers)) {
    errors.push('frontend_layers must be an object');
  } else {
    errors.push(...validateLayerRecord(layers.input_normalization, 'frontend_layers.input_normalization'));
    errors.push(...validateLayerRecord(layers.algorithm_description, 'frontend_layers.algorithm_description'));
    errors.push(...validateLayerRecord(layers.structural_ir, 'frontend_layers.structural_ir'));
  }

  errors.push(...validateDownstreamRecord(manifest.downstream_status, 'downstream_status'));

  return errors;
}

function collectArtifactExistence(manifest) {
  const checks = [];

  checks.push({
    label: 'raw_bundle',
    path: manifest.raw_bundle.path,
    exists: artifactExists(manifest.raw_bundle.path)
  });

  const layers = manifest.frontend_layers || {};
  for (const [layerName, layer] of Object.entries(layers)) {
    if (!layer || !Array.isArray(layer.artifacts)) {
      continue;
    }
    for (const artifact of layer.artifacts) {
      checks.push({
        label: `${layerName}:${artifact.label}`,
        path: artifact.path,
        exists: artifactExists(artifact.path)
      });
    }
  }

  const downstream = manifest.downstream_status || {};
  for (const artifact of downstream.artifacts || []) {
    checks.push({
      label: `downstream:${artifact.label}`,
      path: artifact.path,
      exists: artifactExists(artifact.path)
    });
  }

  return checks;
}

function listManifestPaths(referenceDir) {
  if (!fs.existsSync(referenceDir)) {
    throw new Error(`Reference directory not found: ${referenceDir}`);
  }

  return fs.readdirSync(referenceDir)
    .filter((entry) => entry.endsWith('.json'))
    .sort()
    .map((entry) => path.join(referenceDir, entry));
}

function summarizeManifest(manifestPath) {
  const manifest = readJson(manifestPath);
  const validationErrors = validateManifest(manifest);
  const artifactChecks = collectArtifactExistence(manifest);
  const missingArtifactPaths = artifactChecks.filter((entry) => !entry.exists).map((entry) => entry.path);
  const layerStatus = manifest.frontend_layers;

  return {
    manifestPath: relativeToRoot(manifestPath),
    referenceId: manifest.reference_id,
    paperId: manifest.paper_id,
    primitiveFamily: manifest.primitive_family,
    attackFamily: manifest.attack_family,
    inputNormalizationStatus: layerStatus.input_normalization.status,
    algorithmDescriptionStatus: layerStatus.algorithm_description.status,
    structuralIrStatus: layerStatus.structural_ir.status,
    downstreamStatus: manifest.downstream_status.status,
    currentFrontendCeiling: manifest.current_frontend_ceiling,
    nextPriority: manifest.next_priority,
    validationErrors,
    missingArtifactPaths
  };
}

function buildSummary(referenceDir) {
  const manifestPaths = listManifestPaths(referenceDir);
  const cases = manifestPaths.map(summarizeManifest);

  const count = (predicate) => cases.filter(predicate).length;

  return {
    generatedAt: new Date().toISOString(),
    referenceDir: relativeToRoot(referenceDir),
    totals: {
      totalCases: cases.length,
      validCases: count((entry) => entry.validationErrors.length === 0 && entry.missingArtifactPaths.length === 0),
      bundleAvailable: count((entry) => entry.inputNormalizationStatus !== 'missing'),
      algorithmDescriptionAvailable: count((entry) => entry.algorithmDescriptionStatus !== 'missing'),
      algorithmDescriptionGolden: count((entry) => entry.algorithmDescriptionStatus === 'golden'),
      structuralIrAvailable: count((entry) => entry.structuralIrStatus !== 'missing'),
      structuralIrGolden: count((entry) => entry.structuralIrStatus === 'golden'),
      executionBacked: count((entry) => entry.downstreamStatus === 'execution_backed'),
      semanticBlocked: count((entry) => entry.downstreamStatus === 'semantic_blocked'),
      bundleOnly: count((entry) => entry.currentFrontendCeiling === 'bundle_only')
    },
    cases
  };
}

function buildMarkdown(summary) {
  const lines = [
    '# Frontend Reference Corpus Audit',
    '',
    `Generated at: ${summary.generatedAt}`,
    '',
    `Reference dir: ${summary.referenceDir}`,
    '',
    '## Totals',
    '',
    `- total cases: ${summary.totals.totalCases}`,
    `- valid cases: ${summary.totals.validCases}`,
    `- bundle available: ${summary.totals.bundleAvailable}`,
    `- algorithm description available: ${summary.totals.algorithmDescriptionAvailable}`,
    `- algorithm description golden: ${summary.totals.algorithmDescriptionGolden}`,
    `- structural IR available: ${summary.totals.structuralIrAvailable}`,
    `- structural IR golden: ${summary.totals.structuralIrGolden}`,
    `- execution backed: ${summary.totals.executionBacked}`,
    `- semantic blocked: ${summary.totals.semanticBlocked}`,
    `- bundle only: ${summary.totals.bundleOnly}`,
    '',
    '## Case Table',
    '',
    '| Paper | Primitive | Input | Algorithm Description | Structural IR | Downstream | Ceiling |',
    '| --- | --- | --- | --- | --- | --- | --- |'
  ];

  for (const entry of summary.cases) {
    lines.push(
      `| ${entry.paperId} | ${entry.primitiveFamily} | ${entry.inputNormalizationStatus} | `
      + `${entry.algorithmDescriptionStatus} | ${entry.structuralIrStatus} | `
      + `${entry.downstreamStatus} | ${entry.currentFrontendCeiling} |`
    );
  }

  lines.push('', '## Next Priorities', '');
  summary.cases.forEach((entry) => {
    lines.push(`- ${entry.paperId}: ${entry.nextPriority}`);
  });

  const casesWithIssues = summary.cases.filter((entry) => entry.validationErrors.length > 0 || entry.missingArtifactPaths.length > 0);
  lines.push('', '## Issues', '');
  if (casesWithIssues.length === 0) {
    lines.push('- none');
  } else {
    for (const entry of casesWithIssues) {
      lines.push(`- ${entry.paperId}:`);
      if (entry.validationErrors.length > 0) {
        entry.validationErrors.forEach((error) => lines.push(`  validation: ${error}`));
      }
      if (entry.missingArtifactPaths.length > 0) {
        entry.missingArtifactPaths.forEach((item) => lines.push(`  missing path: ${item}`));
      }
    }
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const summary = buildSummary(options.referenceDir);

  if (!options.noWrite) {
    const summaryJsonPath = path.join(options.outputDir, 'frontend-reference-corpus-summary.json');
    const summaryMdPath = path.join(options.outputDir, 'frontend-reference-corpus-summary.md');
    writeJson(summaryJsonPath, summary);
    writeText(summaryMdPath, buildMarkdown(summary));
  }

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main();
