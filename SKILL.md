---
name: cryptanalysis
description: Use when the user wants direct symmetric cryptanalysis from a paper bundle or algorithm description, and the system must either run the currently supported analysis lane or return an honest structured limit report.
---

# Cryptanalysis

This is the user-facing cryptanalysis skill.

Use this when the user means:

- "analyze this cryptographic construction or paper"
- "do the cryptanalysis workflow on this bundle"
- "tell me what the current system can conclude from these materials"

Do not expose `cryptanalysis-calibration` as the only public surface when the user is asking for direct analysis.
`cryptanalysis-calibration` is the internal trust and execution backbone.

## Core Principle

The skill does not pretend that every paper can already be solved automatically.

It must do one of four honest things:

1. run a currently supported lane end to end
2. return `limited` when the bundle is not complete enough
3. return `needs-calibration` when the request is plausible but exceeds the validated lane
4. return `unsupported-current-scope` when the request is outside the current scope

Every path should still return a structured result.
The current public artifact set is:

- `analysis-result.json`
- `analysis-report.tex`
- `analysis-report.pdf`

For the current PRESENT-80 modeled demo lane, the repository can also emit a
full-chain artifact tree containing:

- intake artifacts
- curated `algorithm description`
- curated `structural IR`
- generated `semantic attachment`
- generated `model instantiation`
- backend manifest / verdict / PDF

## Input Contract

The conversational input may start as any subset of:

- attack paper PDF or LaTeX
- primitive reference paper or standard
- appendix or supplementary material
- code repository
- claimed result table
- user notes
- a partial algorithm description

Current explicit first-stage input artifacts:

- raw `analysis-bundle` packet
- derived `analysis-request.draft.json`
- primitive intake card
- attack intake card

Normalize the bundle until you can freeze:

- primitive and exact variant
- attack family
- difference model
- target claim or checkpoint
- comparison point

If these are still ambiguous, stop pretending analysis happened.
Return `limited` and ask for the missing pieces.

## Current Maximum Capability

The current ceiling is narrow and must be stated explicitly:

- domain: symmetric cryptanalysis
- validated paper lane: `ePrint 2013/676`
- primitive: `PRESENT-80`
- primitive family: `spn`
- attack family: `related_key_differential`
- backend shape: HiGHS-backed MILP lane

What the repository can currently do best:

- run published-checkpoint-oriented calibration analysis inside that lane
- materialize a demo-grade full chain:
  - `input normalization` = automated
  - `algorithm description` = curated example
  - `structural IR` = curated example
  - `semantic attachment` = generated
  - `model instantiation` = generated
  - `backend emission / verdict / report` = generated
- produce structured verdicts:
  - `optimal-consistent`
  - `feasible-match-only`
  - `unresolved`
  - `mismatch`
- emit `.tex` and `.pdf` reports

What it cannot honestly claim yet:

- generic cryptanalysis for arbitrary papers
- automatic solver-ready normalization from arbitrary raw input without manual clarification
- broad transfer beyond the current PRESENT-80 lane
- solver-certified validation of the downstream 24-round paper claim

## Route Selection

```text
raw bundle
  -> completeness gate
  -> if incomplete: limited
  -> if outside supported scope: unsupported-current-scope
  -> if inside same area but outside validated case map: needs-calibration
  -> if inside validated case map: run current analysis backbone
```

## Current Execution Backbone

Today this skill is backed by the calibration lane because that is the trustworthy ceiling.

Primary internal pieces:

- `skills/cryptanalysis-calibration/SKILL.md`
- `scripts/cryptanalysis-benchmark/run-cryptanalysis-analysis.js`
- `scripts/cryptanalysis-benchmark/run-calibration-case.js`
- `scripts/cryptanalysis-benchmark/render-analysis-report.js`
- `scripts/cryptanalysis-benchmark/render-calibration-report.js`

## Execution Lanes

### Local

Use local execution for:

- intake normalization
- supported checkpoint reruns
- unit tests
- short HiGHS runs

### serverC

Use `serverC` explicitly when a longer HiGHS run is needed.
Do not hide the fact that the run moved to a remote machine.

Current remote baseline information lives in:

- `skills/cryptanalysis-calibration/SKILL.md`

## Current Full-Chain Demo Lane

The strongest honest demo path today is the PRESENT-80 5-round checkpoint lane.

Primary entry:

- `scripts/cryptanalysis-benchmark/run-cryptanalysis-full-chain-demo.js`

That wrapper produces a single output tree with this explicit shape:

```text
input bundle
  -> intake normalization
  -> algorithm description
  -> structural IR
  -> semantic attachment
  -> model instantiation
  -> backend emission / solve
  -> verdict / report
```

Important honesty rule:

- `algorithm description -> structural IR` is still curated today
- `semantic attachment -> model instantiation -> report` is now deterministic
- do not claim that arbitrary-paper full automation already exists

## Frontend Reference System

The frontend layers are now tracked by an explicit reference corpus rather than
by scattered notes.

Primary assets:

- `docs/cryptanalysis-benchmark/frontend-reference-v0.md`
- `docs/cryptanalysis-benchmark/frontend-reference.schema.json`
- `docs/cryptanalysis-benchmark/references/frontend/`
- `scripts/cryptanalysis-benchmark/audit-frontend-reference-corpus.js`

Use this corpus to answer:

- which wave-1 papers only have bundles
- which papers already have golden `algorithm description`
- which papers already have golden `structural IR`
- whether a paper is frontend-ready but downstream-blocked

This is the current evolution mechanism for the weak frontend stages.

## Required Output Shape

Top-level result statuses:

- `completed`
- `limited`
- `needs-calibration`
- `unsupported-current-scope`

Nested paper-facing verdict labels when a solver-backed run actually happens:

- `optimal-consistent`
- `feasible-match-only`
- `unresolved`
- `mismatch`

## Minimum Honest Behavior

Never collapse "we do not support this yet" into a vague apology.

Return:

- what was understood
- which route was selected
- whether the request is inside current scope
- what artifacts were produced
- what the next action should be

That honesty is part of the skill contract, not an optional note.
