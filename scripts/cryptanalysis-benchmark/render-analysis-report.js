#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '../..');

function parseArgs(argv) {
  const options = {
    resultPath: '',
    outputTexPath: '',
    outputPdfPath: '',
    latexEngine: 'pdflatex',
    noCompilePdf: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if ((current === '--result' || current === '--result-path') && next) {
      options.resultPath = path.resolve(next);
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
    '  node scripts/cryptanalysis-benchmark/render-analysis-report.js --result <path>',
    '',
    'Options:',
    '  --result <path>          Top-level analysis result JSON',
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

function kvRows(rows) {
  return rows.map(([key, value]) => `${escapeLatex(key)} & ${escapeLatexLine(value)} \\\\`).join('\n');
}

function statusColor(status) {
  switch (status) {
    case 'completed':
      return 'green!15';
    case 'needs-calibration':
      return 'yellow!20';
    case 'unsupported-current-scope':
      return 'red!15';
    default:
      return 'gray!15';
  }
}

function statusSummaryText(result) {
  const verdictLabel = result.outcome?.paperVerdictLabel || '';

  if (result.status === 'completed') {
    if (verdictLabel) {
      return `A solver-backed run completed and returned the paper-facing verdict ${verdictLabel}.`;
    }
    return 'A structured analysis run completed successfully.';
  }

  if (result.status === 'needs-calibration') {
    return 'The request is plausible, but it exceeds the currently validated lane and needs calibration before trusted analysis can proceed.';
  }

  if (result.status === 'unsupported-current-scope') {
    return 'The request falls outside the currently supported cryptanalysis scope.';
  }

  return 'The bundle is not yet complete enough to freeze the analysis target, so the result remains intake-limited.';
}

function arrayToBlock(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 'none';
  }
  return values.join('\n');
}

function buildTex(resultPath, result) {
  const route = result.route || {};
  const request = result.normalizedRequest || {};
  const outcome = result.outcome || {};
  const capability = result.currentCapability || {};
  const artifacts = result.artifacts || {};

  const summaryRows = [
    ['Request ID', result.requestId || 'n/a'],
    ['Top-level Status', result.status || 'n/a'],
    ['Selected Mode', route.selectedMode || 'n/a'],
    ['Paper Verdict', outcome.paperVerdictLabel || 'n/a'],
    ['Next Action', outcome.nextAction || 'n/a']
  ];

  const requestRows = [
    ['Bundle State', request.bundleState || 'n/a'],
    ['Paper ID', request.paperId || 'n/a'],
    ['Primitive', request.primitiveId || 'n/a'],
    ['Primitive Family', request.primitiveFamily || 'n/a'],
    ['Attack Family', request.attackFamily || 'n/a'],
    ['Difference Model', request.differenceModel || 'n/a'],
    ['Target Case ID', request.targetCaseId || 'n/a'],
    ['Round End', request.roundEnd ?? 'n/a'],
    ['S-box Model', request.sboxModel || 'n/a']
  ];

  const routeRows = [
    ['Route Reason', route.reason || 'n/a'],
    ['Matched Current Scope', route.matchedCurrentScope === true ? 'yes' : 'no'],
    ['Validated Lane ID', route.validatedLaneId || 'n/a'],
    ['Missing Fields', arrayToBlock(outcome.missingFields)],
    ['Calibration Need', outcome.calibrationNeed || 'n/a']
  ];

  const artifactRows = [
    ['Analysis Result JSON', resultPath],
    ['Input Bundle JSON', artifacts.bundleCopyPath || 'n/a'],
    ['Intake Result JSON', artifacts.intakeResultPath || 'n/a'],
    ['Primitive Intake Card', artifacts.primitiveCardPath || 'n/a'],
    ['Attack Intake Card', artifacts.attackCardPath || 'n/a'],
    ['Copied Request JSON', artifacts.requestCopyPath || 'n/a'],
    ['Top-level Report TEX', artifacts.topLevelReportTexPath || 'n/a'],
    ['Top-level Report PDF', artifacts.topLevelReportPdfPath || 'n/a'],
    ['Delegated Manifest', artifacts.delegatedManifestPath || 'n/a'],
    ['Delegated Verdict', artifacts.delegatedVerdictPath || 'n/a'],
    ['Delegated Calibration PDF', artifacts.delegatedCalibrationReportPdfPath || 'n/a']
  ];

  const scopeRows = [
    ['Scope Summary', capability.scopeSummary || 'n/a'],
    ['Current Ceiling', arrayToBlock(capability.currentCeiling)],
    ['Supported Checkpoints', arrayToBlock(capability.supportedCheckpointCaseIds)],
    ['Known Limits', arrayToBlock(capability.knownLimits)]
  ];

  return String.raw`\documentclass[11pt]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[a4paper,margin=1in]{geometry}
\usepackage[table]{xcolor}
\usepackage{hyperref}
\usepackage{array}
\usepackage{url}
\hypersetup{colorlinks=true,linkcolor=black,urlcolor=blue}
\setlength{\parskip}{0.6em}
\setlength{\parindent}{0pt}
\begin{document}

{\LARGE \textbf{Cryptanalysis Analysis Report}}\par
{\large Request ${escapeLatex(result.requestId || 'analysis')}}\par
\vspace{0.5em}
Generated at ${escapeLatex(result.generatedAt || new Date().toISOString())}.

\vspace{0.75em}
\colorbox{${statusColor(result.status)}}{\parbox{\dimexpr\linewidth-2\fboxsep}{
\textbf{Top-level Status: ${escapeLatex(result.status || 'unknown')}}\\
${escapeLatex(statusSummaryText(result))}
}}

\section*{Executive Summary}
This is the user-facing report emitted by the top-level \texttt{cryptanalysis} skill.
It records what the system understood, which route it selected, and what the current repository can honestly claim from this request.

\begin{tabular}{>{\bfseries}p{0.26\linewidth} p{0.68\linewidth}}
${kvRows(summaryRows)}
\end{tabular}

\section*{Normalized Request}
\begin{tabular}{>{\bfseries}p{0.26\linewidth} p{0.68\linewidth}}
${kvRows(requestRows)}
\end{tabular}

\paragraph{Source Bundle}
${escapeLatexLine(arrayToBlock(result.bundle?.sourceBundle))}

\paragraph{User Notes}
${escapeLatexLine(result.bundle?.notes || 'none')}

\section*{Routing Decision}
\begin{tabular}{>{\bfseries}p{0.26\linewidth} p{0.68\linewidth}}
${kvRows(routeRows)}
\end{tabular}

\paragraph{Outcome Summary}
${escapeLatexLine(outcome.summary || 'n/a')}

\section*{Artifacts}
\begin{tabular}{>{\bfseries}p{0.26\linewidth} p{0.68\linewidth}}
${kvRows(artifactRows)}
\end{tabular}

\section*{Current Capability Boundary}
\begin{tabular}{>{\bfseries}p{0.26\linewidth} p{0.68\linewidth}}
${kvRows(scopeRows)}
\end{tabular}

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

  if (!options.resultPath) {
    throw new Error('Missing required argument: --result');
  }

  const resultPath = path.resolve(options.resultPath);
  const resultDir = path.dirname(resultPath);
  const result = readJson(resultPath);
  const baseName = `${result.requestId || 'cryptanalysis'}.analysis-report`;
  const outputTexPath = options.outputTexPath || path.join(resultDir, `${baseName}.tex`);
  const outputPdfPath = options.outputPdfPath || path.join(resultDir, `${baseName}.pdf`);

  ensureDir(path.dirname(outputTexPath));
  ensureDir(path.dirname(outputPdfPath));

  const texContent = buildTex(resultPath, result);
  fs.writeFileSync(outputTexPath, texContent, 'utf8');

  if (!options.noCompilePdf) {
    compilePdf(outputTexPath, options.latexEngine, outputPdfPath);
  }

  console.log(JSON.stringify({
    resultPath: relativeToRoot(resultPath),
    outputTexPath: relativeToRoot(outputTexPath),
    outputPdfPath: options.noCompilePdf ? '' : relativeToRoot(outputPdfPath),
    latexEngine: options.latexEngine,
    compiledPdf: !options.noCompilePdf
  }, null, 2));
}

main();
