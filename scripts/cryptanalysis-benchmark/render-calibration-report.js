#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '../..');

function parseArgs(argv) {
  const options = {
    manifestPath: '',
    outputTexPath: '',
    outputPdfPath: '',
    latexEngine: 'pdflatex',
    noCompilePdf: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if ((current === '--manifest' || current === '--manifest-path') && next) {
      options.manifestPath = path.resolve(next);
      index += 1;
      continue;
    }

    if ((current === '--output-tex' || current === '--tex-output') && next) {
      options.outputTexPath = path.resolve(next);
      index += 1;
      continue;
    }

    if ((current === '--output-pdf' || current === '--pdf-output') && next) {
      options.outputPdfPath = path.resolve(next);
      index += 1;
      continue;
    }

    if ((current === '--latex-engine' || current === '--pdf-engine') && next) {
      options.latexEngine = String(next).trim();
      index += 1;
      continue;
    }

    if (current === '--no-compile-pdf') {
      options.noCompilePdf = true;
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
    '  node scripts/cryptanalysis-benchmark/render-calibration-report.js --manifest <path>',
    '',
    'Options:',
    '  --manifest <path>        Calibration run manifest JSON',
    '  --output-tex <path>      Optional .tex output path',
    '  --output-pdf <path>      Optional .pdf output path',
    '  --latex-engine <name>    latexmk engine name, default: pdflatex',
    '  --no-compile-pdf         Only write .tex, skip PDF compilation'
  ].join('\n'));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function resolveMaybeRelative(baseDir, targetPath) {
  if (!targetPath) {
    return '';
  }
  return path.isAbsolute(targetPath) ? targetPath : path.resolve(baseDir, targetPath);
}

function relativeToRoot(targetPath) {
  return path.relative(ROOT_DIR, targetPath);
}

function escapeLatex(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([{}$&#_%])/g, '\\$1')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/~/g, '\\textasciitilde{}');
}

function escapeLatexLine(value) {
  return escapeLatex(value).replace(/\n/g, '\\\\\n');
}

function verdictColor(verdictLabel) {
  switch (verdictLabel) {
    case 'optimal-consistent':
      return 'green!15';
    case 'feasible-match-only':
      return 'yellow!20';
    case 'mismatch':
      return 'red!15';
    default:
      return 'gray!15';
  }
}

function verdictSummaryText(verdictLabel) {
  switch (verdictLabel) {
    case 'optimal-consistent':
      return 'The current run matches the published checkpoint with solver-certified optimality.';
    case 'feasible-match-only':
      return 'The current run matches the published checkpoint with a feasible solution, but optimality is not certified.';
    case 'mismatch':
      return 'The current run contradicts the published checkpoint or the lane semantics look wrong.';
    default:
      return 'The current run is still unresolved and should not be used as a trusted basis for broader claims.';
  }
}

function kvRows(rows) {
  return rows.map(([key, value]) => `${escapeLatex(key)} & ${escapeLatexLine(value)} \\\\`).join('\n');
}

function buildTex(manifestPath, manifest, verdict, solverSummary, emissionSummary, ledgerCsvPath) {
  const reportTitle = 'Cryptanalysis Calibration Report';
  const verdictLabel = verdict.verdictLabel || 'unresolved';
  const solverEvidence = verdict.solverEvidence || {};
  const emissionEvidence = verdict.emissionEvidence || {};
  const reportDate = solverEvidence.generatedAt || new Date().toISOString();
  const ledgerRowExists = ledgerCsvPath && fs.existsSync(ledgerCsvPath);

  const summaryRows = [
    ['Paper', verdict.paperTitle || manifest.caseId],
    ['Case ID', verdict.caseId || manifest.caseId],
    ['Run Label', manifest.runLabel || 'n/a'],
    ['Runner Mode', manifest.mode || 'n/a'],
    ['Verdict', verdictLabel],
    ['Support Mode', verdict.supportMode || 'n/a'],
    ['Dominant Mismatch Stage', verdict.dominantMismatchStage || 'none'],
    ['Next Action', verdict.nextAction || 'none']
  ];

  const evidenceRows = [
    ['Expected Claim', verdict.expectedClaim || 'n/a'],
    ['Observed Claim', verdict.observedClaim || 'n/a'],
    ['Solver Status', solverEvidence.modelStatusText || 'n/a'],
    ['Objective Value', solverEvidence.objectiveValue ?? 'n/a'],
    ['Certified Lower Bound', solverEvidence.certifiedLowerBound ?? 'n/a'],
    ['Certified Upper Bound', solverEvidence.certifiedUpperBound ?? 'n/a'],
    ['MIP Gap', solverEvidence.mipGap ?? 'n/a'],
    ['Round End', emissionEvidence.effectiveRoundEnd ?? manifest.emission?.roundEnd ?? 'n/a'],
    ['S-box Model', emissionEvidence.sboxModel || manifest.emission?.sboxModel || 'n/a'],
    ['Unit ID', emissionEvidence.unitId || manifest.emission?.unitId || 'n/a']
  ];

  const artifactRows = [
    ['Manifest JSON', manifestPath],
    ['Verdict JSON', manifest.verdict?.verdictPath || 'n/a'],
    ['Solver Summary JSON', manifest.solver?.summaryPath || manifest.solver?.copiedSummaryPath || 'n/a'],
    ['Emission Summary JSON', manifest.emission?.summaryPath || 'n/a'],
    ['Ledger CSV', ledgerCsvPath && ledgerRowExists ? ledgerCsvPath : 'n/a'],
    ['LP Artifact', manifest.emission?.lpPath || 'n/a'],
    ['Solver Log', manifest.solver?.logPath || 'n/a'],
    ['Solver Solution', manifest.solver?.solutionPath || 'n/a']
  ];

  const notesBlock = verdict.nextAction
    ? `\\paragraph{Recommended Next Action} ${escapeLatexLine(verdict.nextAction)}`
    : '';

  return String.raw`\documentclass[11pt]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[a4paper,margin=1in]{geometry}
\usepackage[table]{xcolor}
\usepackage{hyperref}
\usepackage{longtable}
\usepackage{array}
\usepackage{url}
\hypersetup{colorlinks=true,linkcolor=black,urlcolor=blue}
\setlength{\parskip}{0.6em}
\setlength{\parindent}{0pt}
\begin{document}

{\LARGE \textbf{${escapeLatex(reportTitle)}}}\par
{\large ${escapeLatex(verdict.paperTitle || manifest.caseId || 'Calibration Run')}}\par
\vspace{0.5em}
Generated from skill artifacts on ${escapeLatex(reportDate)}.

\vspace{0.75em}
\colorbox{${verdictColor(verdictLabel)}}{\parbox{\dimexpr\linewidth-2\fboxsep}{
\textbf{Verdict: ${escapeLatex(verdictLabel)}}\\
${escapeLatex(verdictSummaryText(verdictLabel))}
}}

\section*{Executive Summary}
This report was generated automatically from the calibration run manifest and verdict artifacts.
It is intended for meeting review and should be read as a confidence-tagged status report, not as a claim that every lane is already fully trusted.

\begin{tabular}{>{\bfseries}p{0.26\linewidth} p{0.68\linewidth}}
${kvRows(summaryRows)}
\end{tabular}

\section*{Claim And Evidence}
\begin{tabular}{>{\bfseries}p{0.26\linewidth} p{0.68\linewidth}}
${kvRows(evidenceRows)}
\end{tabular}

\paragraph{Observed Claim}
${escapeLatexLine(verdict.observedClaim || 'n/a')}

\paragraph{Interpretation}
${escapeLatexLine(verdictSummaryText(verdictLabel))}

${notesBlock}

\section*{Artifacts}
\begin{tabular}{>{\bfseries}p{0.26\linewidth} p{0.68\linewidth}}
${kvRows(artifactRows)}
\end{tabular}

\section*{Workflow Reminder}
This skill operates in two modes:
\begin{itemize}
\item \texttt{analyze}: reuse an already validated lane and inherit its trust boundary.
\item \texttt{calibrate}: earn or repair trust before broader analysis uses the lane.
\end{itemize}
The current report reflects the output of one concrete run inside that governed workflow.

\end{document}
`;
}

function compilePdf(texPath, latexEngine, outputPdfPath) {
  const texDir = path.dirname(texPath);
  const texName = path.basename(texPath);
  const jobname = path.basename(outputPdfPath, '.pdf');
  const result = spawnSync('latexmk', [
    `-${latexEngine}`,
    '-interaction=nonstopmode',
    '-halt-on-error',
    '-file-line-error',
    `-jobname=${jobname}`,
    texName
  ], {
    cwd: texDir,
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    throw new Error([
      `latexmk failed for ${texPath}`,
      result.stderr || result.stdout || '(no output)'
    ].join('\n'));
  }

  cleanupLatexAuxiliary(texDir, jobname);
}

function cleanupLatexAuxiliary(outputDir, jobname) {
  const suffixes = ['.aux', '.fdb_latexmk', '.fls', '.out', '.log', '.toc'];
  for (const suffix of suffixes) {
    const filePath = path.join(outputDir, `${jobname}${suffix}`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (!options.manifestPath) {
    throw new Error('Missing required argument: --manifest');
  }

  const manifestPath = path.resolve(options.manifestPath);
  const manifestDir = path.dirname(manifestPath);
  const manifest = readJson(manifestPath);

  const verdictPath = resolveMaybeRelative(manifestDir, manifest.verdict?.verdictPath);
  if (!verdictPath || !fs.existsSync(verdictPath)) {
    throw new Error(`Verdict JSON not found for manifest: ${manifestPath}`);
  }

  const solverSummaryPath = resolveMaybeRelative(
    manifestDir,
    manifest.solver?.summaryPath || manifest.solver?.copiedSummaryPath || manifest.solver?.reusedSummaryPath
  );
  const emissionSummaryPath = resolveMaybeRelative(manifestDir, manifest.emission?.summaryPath);
  const ledgerCsvPath = resolveMaybeRelative(manifestDir, manifest.verdict?.ledgerPath);
  const verdict = readJson(verdictPath);
  const solverSummary = solverSummaryPath && fs.existsSync(solverSummaryPath) ? readJson(solverSummaryPath) : {};
  const emissionSummary = emissionSummaryPath && fs.existsSync(emissionSummaryPath) ? readJson(emissionSummaryPath) : {};

  const baseName = `${manifest.caseId || 'calibration-run'}.${manifest.runLabel || 'report'}.report`;
  const outputTexPath = options.outputTexPath || path.join(manifestDir, `${baseName}.tex`);
  const outputPdfPath = options.outputPdfPath || path.join(manifestDir, `${baseName}.pdf`);

  ensureDir(path.dirname(outputTexPath));
  ensureDir(path.dirname(outputPdfPath));

  const texContent = buildTex(manifestPath, manifest, verdict, solverSummary, emissionSummary, ledgerCsvPath);
  fs.writeFileSync(outputTexPath, texContent, 'utf8');

  if (!options.noCompilePdf) {
    compilePdf(outputTexPath, options.latexEngine, outputPdfPath);
  }

  const summary = {
    manifestPath: relativeToRoot(manifestPath),
    verdictPath: relativeToRoot(verdictPath),
    outputTexPath: relativeToRoot(outputTexPath),
    outputPdfPath: options.noCompilePdf ? '' : relativeToRoot(outputPdfPath),
    latexEngine: options.latexEngine,
    compiledPdf: !options.noCompilePdf
  };

  console.log(JSON.stringify(summary, null, 2));
}

main();
