#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '../..');
const EXAMPLES_DIR = path.join(ROOT_DIR, 'docs', 'cryptanalysis-benchmark', 'examples');
const TRIAL_DIR = path.join(
  ROOT_DIR,
  'docs',
  'cryptanalysis-benchmark',
  'trials',
  'eprint-2013-676'
);

const PREPARE_INTAKE_PATH = path.join(ROOT_DIR, 'scripts', 'cryptanalysis-benchmark', 'prepare-analysis-intake.js');
const RESOLVE_ATTACHMENTS_PATH = path.join(ROOT_DIR, 'scripts', 'cryptanalysis-benchmark', 'resolve-semantic-attachments.js');
const GENERATE_INSTANTIATION_PATH = path.join(
  ROOT_DIR,
  'scripts',
  'cryptanalysis-benchmark',
  'generate-model-instantiation-from-ir.js'
);
const RUN_CALIBRATION_PATH = path.join(ROOT_DIR, 'scripts', 'cryptanalysis-benchmark', 'run-calibration-case.js');

const DEFAULT_BUNDLE_PATH = path.join(EXAMPLES_DIR, 'eprint-2013-676.present80-r5.bundle.json');
const DEFAULT_ALGORITHM_DESCRIPTION_PATH = path.join(
  EXAMPLES_DIR,
  'eprint-2013-676.present80.algorithm-description.v0.json'
);
const DEFAULT_STRUCTURAL_IR_PATH = path.join(TRIAL_DIR, 'structural-ir.present80.r5.v0.json');
const DEFAULT_PRIMITIVE_SPEC_PATH = path.join(TRIAL_DIR, 'primitive-spec.present80.full.json');
const DEFAULT_LOCAL_SEMANTICS_PATH = path.join(TRIAL_DIR, 'local-semantics.present-sbox.cdp.json');
const DEFAULT_SOLVER_SUMMARY_PATH = path.join(
  ROOT_DIR,
  'fixtures',
  'solver-summaries',
  'present80-r5-serverc.summary.json'
);
const DEFAULT_OUTPUT_DIR = path.join(
  ROOT_DIR,
  'outputs',
  'cryptanalysis-full-chain',
  'present80-r5-ir-v0'
);

function parseArgs(argv) {
  const options = {
    bundlePath: DEFAULT_BUNDLE_PATH,
    algorithmDescriptionPath: DEFAULT_ALGORITHM_DESCRIPTION_PATH,
    structuralIrPath: DEFAULT_STRUCTURAL_IR_PATH,
    primitiveSpecPath: DEFAULT_PRIMITIVE_SPEC_PATH,
    localSemanticsPath: DEFAULT_LOCAL_SEMANTICS_PATH,
    solverSummaryInputPath: DEFAULT_SOLVER_SUMMARY_PATH,
    outputDir: DEFAULT_OUTPUT_DIR,
    runLabel: 'serverC-reused-proof',
    report: true,
    reportLatexEngine: 'pdflatex',
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

    if ((current === '--algorithm-description' || current === '--algorithm-description-path') && next) {
      options.algorithmDescriptionPath = path.resolve(next);
      index += 1;
      continue;
    }

    if ((current === '--structural-ir' || current === '--structural-ir-path') && next) {
      options.structuralIrPath = path.resolve(next);
      index += 1;
      continue;
    }

    if ((current === '--primitive-spec' || current === '--primitive-spec-path') && next) {
      options.primitiveSpecPath = path.resolve(next);
      index += 1;
      continue;
    }

    if ((current === '--local-semantics' || current === '--local-semantics-path') && next) {
      options.localSemanticsPath = path.resolve(next);
      index += 1;
      continue;
    }

    if ((current === '--solver-summary-input' || current === '--solver-summary-path') && next) {
      options.solverSummaryInputPath = path.resolve(next);
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
    '  node scripts/cryptanalysis-benchmark/run-cryptanalysis-full-chain-demo.js',
    '',
    'Options:',
    '  --bundle <path>                 Input bundle JSON',
    '  --algorithm-description <path>  Curated algorithm-description JSON',
    '  --structural-ir <path>          Structural IR JSON',
    '  --primitive-spec <path>         Primitive spec JSON',
    '  --local-semantics <path>        Local semantics JSON',
    '  --solver-summary-input <path>   Existing solver summary reused by the report lane',
    '  --output-dir <path>             Output directory',
    '  --run-label <text>              Calibration run label',
    '  --report-latex-engine <name>    latexmk engine for the calibration report',
    '  --no-report                     Skip PDF generation'
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

function buildGeneratedReference(referencePath, instantiationPath, primitiveSpecPath, localSemanticsPath, outputRoot) {
  return {
    reference_set_id: 'eprint-2013-676-present80-r5-full-chain-demo-v0',
    paper_id: 'eprint-2013-676',
    paper_title: 'Automatic Security Evaluation and (Related-key) Differential Characteristic Search: Application to SIMON, PRESENT, LBlock, DES(L) and Other Bit-oriented Block Ciphers',
    primitive_family: 'spn',
    attack_family: 'related_key_differential',
    bundle_complete: 'preferred',
    primitive_spec_ok: true,
    attack_spec_ok: true,
    backend_target: 'milp',
    default_mismatch_stage: 'validation_gap',
    default_next_action: 'If the generated lane drifts from the paper checkpoint, repair the curated structural artifacts or the deterministic lowering logic before extending scope.',
    emission_defaults: {
      instantiation_path: path.relative(path.dirname(referencePath), instantiationPath),
      primitive_spec_path: primitiveSpecPath,
      local_semantics_path: localSemanticsPath,
      unit_id: 'p1_compute_5r_lower_bound_model',
      default_sbox_model: 'cdp',
      output_root: outputRoot
    },
    cases: [
      {
        case_id: 'present80-table4-r5-full-chain-demo-v0',
        description: 'Full-chain demo lane from normalized bundle to generated instantiation for the PRESENT-80 5-round checkpoint.',
        claim_kind: 'exact_minimum',
        objective_direction: 'minimize',
        expected_value: 3,
        expected_claim: 'Table 4 reports that the minimum number of active S-boxes for 5-round PRESENT-80 is 3.',
        paper_location: 'Appendix A.1, Table 4',
        round_end: 5,
        expected_sbox_model: 'exact',
        expected_unit_id: 'p1_compute_5r_lower_bound_model',
        tolerance: 1e-9,
        next_action_on_unresolved: 'The current full-chain demo should stay at the PRESENT r5 checkpoint until more structural layers are automated.'
      }
    ]
  };
}

function buildChineseSummary(summary) {
  const lines = [
    '# 密码分析全链路演示说明',
    '',
    `生成时间: ${summary.generatedAt}`,
    '',
    '## 1. 当前打通的主线',
    '',
    '```text',
    'input bundle',
    '  -> intake normalization',
    '  -> algorithm description',
    '  -> structural IR',
    '  -> semantic attachment',
    '  -> model instantiation',
    '  -> backend emission / solve',
    '  -> verdict / report',
    '```',
    '',
    '## 2. 本次演示的真实状态',
    '',
    '- `input normalization`：本次由 `prepare-analysis-intake.js` 从 bundle 产出 request draft 和 intake cards。',
    '- `algorithm description`：当前仍使用人工校验过的 curated 示例，不是假装已经对任意论文自动抽取。',
    '- `structural IR`：当前仍使用人工校验过的 curated PRESENT r5 结构化 IR。',
    '- `semantic attachment`：本次运行时重新解析并产出，可机器检查 `resolved/missing/ambiguous`。',
    '- `model instantiation`：本次运行时从 IR + semantic attachment 确定性生成。',
    '- `backend / report`：已用生成出来的 instantiation 跑通 emission + verdict + PDF。',
    '',
    '## 3. 结果摘要',
    '',
    `- 顶层 case: ${summary.caseId}`,
    `- verdict: ${summary.verdictLabel}`,
    `- observed claim: ${summary.observedClaim}`,
    `- report pdf: ${summary.reportPdfPath || 'n/a'}`,
    '',
    '## 4. 关键产物',
    '',
    `- bundle: ${summary.bundlePath}`,
    `- intake request draft: ${summary.requestDraftPath}`,
    `- primitive intake card: ${summary.primitiveCardPath}`,
    `- attack intake card: ${summary.attackCardPath}`,
    `- algorithm description: ${summary.algorithmDescriptionPath}`,
    `- structural IR: ${summary.structuralIrPath}`,
    `- semantic attachment: ${summary.semanticAttachmentPath}`,
    `- model instantiation: ${summary.instantiationPath}`,
    `- generated reference: ${summary.generatedReferencePath}`,
    `- calibration manifest: ${summary.manifestPath}`,
    `- verdict json: ${summary.verdictPath}`,
    `- report pdf: ${summary.reportPdfPath || 'n/a'}`,
    '',
    '## 5. 现阶段边界',
    '',
    '- 现在真正自动化并经过验证的是：`semantic attachment -> model instantiation -> emission/verdict/report`。',
    '- 现在仍然是 curated 的是：`algorithm description -> structural IR`。',
    '- 所以这个 skill 已经可以做“可演示的密码分析闭环”，但还不能诚实地声称“任意论文自动变 solver-ready 模型”。',
    ''
  ];

  return `${lines.join('\n')}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const outputDir = path.resolve(options.outputDir);
  const intakeDir = path.join(outputDir, '01-intake');
  const normalizedDir = path.join(outputDir, '02-normalized');
  const backendDir = path.join(outputDir, '03-backend');
  ensureDir(outputDir);

  const intakeSummary = runJsonCommand('node', [
    PREPARE_INTAKE_PATH,
    '--bundle', options.bundlePath,
    '--output-dir', intakeDir
  ], ROOT_DIR);

  const algorithmDescriptionCopyPath = path.join(normalizedDir, 'algorithm-description.json');
  const structuralIrCopyPath = path.join(normalizedDir, 'structural-ir.json');
  const semanticAttachmentOutputPath = path.join(normalizedDir, 'semantic-attachment.generated.json');
  const instantiationOutputPath = path.join(normalizedDir, 'model-instantiation.generated.json');
  const generatedReferencePath = path.join(outputDir, 'generated-reference.json');
  const zhSummaryPath = path.join(outputDir, 'pipeline-summary.zh.md');
  const summaryJsonPath = path.join(outputDir, 'full-chain-summary.json');

  copyFile(options.algorithmDescriptionPath, algorithmDescriptionCopyPath);
  copyFile(options.structuralIrPath, structuralIrCopyPath);

  const semanticAttachmentManifest = runJsonCommand('node', [
    RESOLVE_ATTACHMENTS_PATH,
    '--ir', structuralIrCopyPath,
    '--local-semantics', options.localSemanticsPath,
    '--output', semanticAttachmentOutputPath
  ], ROOT_DIR);

  const instantiationSummary = runJsonCommand('node', [
    GENERATE_INSTANTIATION_PATH,
    '--structural-ir', structuralIrCopyPath,
    '--semantic-attachment', semanticAttachmentOutputPath,
    '--primitive-spec', options.primitiveSpecPath,
    '--output', instantiationOutputPath
  ], ROOT_DIR);

  const generatedReference = buildGeneratedReference(
    generatedReferencePath,
    instantiationOutputPath,
    options.primitiveSpecPath,
    options.localSemanticsPath,
    '03-backend'
  );
  writeJson(generatedReferencePath, generatedReference);

  const calibrationArgs = [
    RUN_CALIBRATION_PATH,
    '--reference', generatedReferencePath,
    '--case-id', 'present80-table4-r5-full-chain-demo-v0',
    '--solver-summary-input', options.solverSummaryInputPath,
    '--run-label', options.runLabel
  ];

  if (!options.report) {
    calibrationArgs.push('--no-report');
  } else {
    calibrationArgs.push('--report-latex-engine', options.reportLatexEngine);
  }

  const calibrationManifest = runJsonCommand('node', calibrationArgs, ROOT_DIR);
  const verdict = readJson(path.join(ROOT_DIR, calibrationManifest.verdict.verdictPath));

  const summary = {
    generatedAt: new Date().toISOString(),
    outputDir: relativeToRoot(outputDir),
    intakeReadyForRouting: intakeSummary.readyForRouting,
    bundlePath: relativeToRoot(options.bundlePath),
    requestDraftPath: intakeSummary.requestDraftPath,
    primitiveCardPath: intakeSummary.primitiveCardPath,
    attackCardPath: intakeSummary.attackCardPath,
    algorithmDescriptionPath: relativeToRoot(algorithmDescriptionCopyPath),
    structuralIrPath: relativeToRoot(structuralIrCopyPath),
    semanticAttachmentPath: relativeToRoot(semanticAttachmentOutputPath),
    instantiationPath: instantiationSummary.outputPath,
    generatedReferencePath: relativeToRoot(generatedReferencePath),
    caseId: calibrationManifest.caseId,
    runLabel: calibrationManifest.runLabel,
    verdictLabel: calibrationManifest.verdict.verdictLabel,
    observedClaim: verdict.observedClaim,
    manifestPath: calibrationManifest.manifestPath,
    verdictPath: calibrationManifest.verdict.verdictPath,
    reportPdfPath: calibrationManifest.report ? calibrationManifest.report.pdfPath : '',
    reportTexPath: calibrationManifest.report ? calibrationManifest.report.texPath : '',
    notes: {
      algorithmDescriptionStatus: 'curated-example',
      structuralIrStatus: 'curated-example',
      semanticAttachmentStatus: semanticAttachmentManifest.resolution_summary?.ready_for_model_instantiation
        ? 'generated-this-run-and-ready'
        : 'generated-this-run-but-not-ready',
      modelInstantiationStatus: 'generated-this-run',
      backendStatus: options.solverSummaryInputPath ? 'report-from-generated-instantiation-plus-reused-solver-summary' : 'local-solve'
    }
  };

  writeJson(summaryJsonPath, summary);
  writeText(zhSummaryPath, buildChineseSummary(summary));

  console.log(JSON.stringify({
    generatedAt: summary.generatedAt,
    outputDir: summary.outputDir,
    summaryJsonPath: relativeToRoot(summaryJsonPath),
    zhSummaryPath: relativeToRoot(zhSummaryPath),
    intakeReadyForRouting: summary.intakeReadyForRouting,
    semanticAttachmentPath: summary.semanticAttachmentPath,
    instantiationPath: summary.instantiationPath,
    manifestPath: summary.manifestPath,
    verdictPath: summary.verdictPath,
    reportPdfPath: summary.reportPdfPath,
    verdictLabel: summary.verdictLabel,
    observedClaim: summary.observedClaim
  }, null, 2));
}

main();
