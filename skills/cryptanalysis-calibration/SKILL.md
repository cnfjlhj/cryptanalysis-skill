---
name: cryptanalysis-calibration
description: Use when building, calibrating, or using a confidence-gated symmetric-cryptanalysis analysis lane, especially when you need to decide between reusing an existing lane and running a new calibration.
---

# Cryptanalysis Calibration

Use this skill when the task is to take symmetric-cryptanalysis materials and either:

- use an already validated analysis lane
- or calibrate a new lane before trusting it

This skill is not a paper-reproduction machine.
Calibration is a trust gate, not the end goal.
The end goal is to use a trusted lane for actual analysis.

## Operating Modes

This skill has two explicit modes:

### `analyze`

Use `analyze` when the request stays inside an already validated lane.

Goal:

- spend trust that has already been earned
- analyze new materials without redoing the entire paper-calibration loop

Allowed only when all of the following are true:

- the primitive family matches an already validated lane
- the attack family and difference model match an already validated lane
- the local semantics lane is already known and accepted
- the current task does not require a new trust claim outside that lane

### `calibrate`

Use `calibrate` when the lane is new, drifting, or too weakly supported to trust.

Goal:

- earn trust for a lane
- tighten or repair trust before later analysis uses it

Use this mode when any of the following are true:

- the primitive or attack family is new
- the semantics lane is not yet trusted
- the current result would extend beyond what the lane has already been validated to support
- prior runs are only `feasible-match-only`, `unresolved`, or `mismatch`

## Routing Rule

Default to this decision rule:

```text
raw bundle
  -> does this hit an already validated lane?
     yes -> analyze
     no  -> calibrate
```

Do not default straight to paper reproduction.
Only enter `calibrate` when trust must be earned or repaired.

## Calibrate Workflow

```text
raw bundle
  -> completeness gate
  -> frozen bundle
  -> primitive_spec / attack_spec
  -> calibration reference case
  -> local semantics lane selection
  -> global model plan / model instantiation
  -> LP or MILP emission
  -> solver run
  -> published small-round calibration verdict
  -> ledger row
  -> report.tex
  -> report.pdf
  -> only then trust larger-round analysis
```

## Analyze Workflow

```text
raw bundle
  -> completeness gate
  -> lane match against validated scope
  -> choose known local semantics lane
  -> run analysis with the trusted lane
  -> label output with inherited confidence
  -> optional report.tex / report.pdf
  -> if trust boundary is exceeded, fall back to calibrate
```

## Input Contract

Accepted raw inputs can include any subset of:

- attack paper PDF, LaTeX, or extracted text
- primitive reference paper or standard
- appendix or supplementary material
- code repository or proof-of-concept scripts
- claimed result table
- user notes about the target claim

Treat the bundle as one of three states:

- `raw-input`
  evidence exists but nothing is normalized yet
- `incomplete-bundle`
  core semantics or comparison targets are still missing or ambiguous
- `frozen-bundle`
  the target primitive, attack family, difference type, round window, and paper-facing comparison point are explicit enough to model

Rules:

- Do not require the user to prewrite a clean algorithm description.
- `primitive_spec` and `attack_spec` are derived artifacts, not prerequisites.
- If the bundle is incomplete, stop and ask for the missing material before emitting solver claims.
- Do not silently guess critical semantics such as key schedule behavior, round truncation meaning, or the exact quantity being optimized.

## Mandatory Gates

### 1. Completeness Gate

Before modeling, lock all of the following:

- primitive and exact variant
- attack family and difference model
- target claim
- published comparison point
- round window to calibrate first
- available source bundle items

If any of these remain ambiguous, the output state is `incomplete-bundle`, not `analysis`.

### 2. Published Calibration Gate

Before reporting any large-round result as meaningful from a new or changed lane, reproduce or tightly match at least one published small-round reference point from the same paper lane.

Paper agreement is necessary but not sufficient.
No published calibration match means the lane is still untrusted.

### 3. Honesty Gate

Always distinguish:

- solver-certified optimum
- feasible match without optimality proof
- unresolved run
- actual mismatch

Do not flatten these into one generic "success".

## Workflow Rules

1. Start from the paper bundle, not from a polished downstream schema.
2. Route first:
   - if the request stays within validated scope, prefer `analyze`
   - if the request exceeds validated scope, switch to `calibrate`
3. Normalize into:
   - `primitive_spec`
   - `attack_spec`
   - local semantics rule pack
   - global model plan
   - model instantiation
4. Make the local semantics lane explicit.
   - Example: `cdp`, `ch6`, or `exact` for the PRESENT S-box differential lane.
5. Emit the backend model only after the variable families and constraint blocks are explicit.
6. Calibrate on published small-round checkpoints before attempting the paper's main round claim for a new lane.
7. If local execution is too slow, switch to the remote execution lane explicitly rather than pretending the result is blocked by theory.
8. Only after calibration is credible may the lane be reused in `analyze` mode.

## Non-Goal

Do not turn every task into full paper reproduction.

This skill should feel like:

- analyze by default when trust already exists
- calibrate only when trust does not yet exist

Not like:

- rebuild the entire benchmark packet every time a new input arrives

## Execution Lanes

### Local Lane

Use the local machine for:

- schema iteration
- emitter debugging
- unit tests
- short calibration runs

Current emitter and runner:

- `node scripts/cryptanalysis-benchmark/emit-milp-lp.js`
- `python3 scripts/cryptanalysis-benchmark/run-highs-mip.py`
- `node scripts/cryptanalysis-benchmark/run-calibration-case.js`
- `node scripts/cryptanalysis-benchmark/render-calibration-report.js`

Current useful flags:

- emitter:
  - `--instantiation`
  - `--primitive-spec`
  - `--local-semantics`
  - `--unit-id`
  - `--round-end`
  - `--sbox-model cdp|ch6|exact`
- runner:
  - `--time-limit`
  - `--threads`
  - `--mip-heuristic-effort`
  - `--random-seed`

### serverC Lane

Use `serverC` when:

- local runs are too slow
- a longer MILP run is needed
- the experiment is CPU-heavy enough to justify the shared box

Current validated remote baseline:

- remote host: `serverC`
- HiGHS binary:
  - `<serverc-user-home>/.local/bin/highs`
- Python environment:
  - `<serverc-user-home>/.venvs/cryptanalysis-highspy-py310`
- installed solver package:
  - `highspy==1.14.0`

Current useful tuning baseline for calibration runs:

- `--threads 1`
- `--mip-heuristic-effort 1.0`
- `--time-limit 300`
- explicit `--random-seed`

Treat `serverC` as an explicit execution lane.
Do not hide remote-state assumptions or silently launch long jobs on a shared box.

## Output Labels

Use exactly one of the following result labels for the paper-facing status:

- `optimal-consistent`
  objective matches the published reference and the solver certified optimality
- `feasible-match-only`
  a feasible solution matches the published reference but optimality is not certified
- `unresolved`
  the lane ran but the result is still not enough to judge consistency
- `mismatch`
  the calibrated result conflicts with the paper or the semantics are likely wrong

## Current Validated Scope

This beta skill is currently validated only for:

- symmetric cryptanalysis
- solver-backed calibration workflows
- the PRESENT-80 related-key XOR-differential lane from `ePrint 2013/676`
- bit-oriented SPN modeling with explicit small-round calibration

This means:

- `analyze` is only trustworthy inside that narrow lane today
- anything materially outside that lane must still fall back to `calibrate`

Current calibration evidence:

- published Table 4 checkpoints:
  - `4r -> 2`
  - `5r -> 3`
  - `6r -> 5`
- current observed status:
  - `exact` lane reaches `4r -> 2`
  - `exact` lane reaches `5r -> 3` on `serverC` with `HighsModelStatus.kOptimal`
  - `exact` lane found `6r -> 5` on `serverC`, but only under time limit, so this is `feasible-match-only`
  - `cdp` and `ch6` were not sufficient for faithful calibration on this lane

## Promotion Policy

Do not upgrade this skill because the workflow looks elegant on paper.
Upgrade only when a real lane has produced evidence strong enough for reuse.

Current promotion state:

- `beta`

Promotion ladder:

### `beta`

This level is allowed when all of the following are true:

- one real paper bundle has gone through the full loop from raw input to paper-facing verdict
- the completeness gate and calibration gate are explicit
- at least one published small-round checkpoint has been matched on a solver-backed lane
- failure states are reported honestly as `optimal-consistent`, `feasible-match-only`, `unresolved`, or `mismatch`

This is the current state of this skill.

### `usable-v1`

Upgrade from `beta` to `usable-v1` only when all of the following are true:

- one primary lane is no longer just "can run", but is tight enough to trust for routine calibration work
- the current lane has a stronger calibration chain than a single easy checkpoint
- the verdict logic is explicit and reusable instead of living only in notes or human memory
- intake questions for incomplete bundles are explicit enough to freeze a bundle repeatedly
- at least one second transfer sample has been run to small-round calibration, so the workflow is not only a PRESENT-specific artifact

Practical reading for the current repository:

- `PRESENT-80` should be tightened beyond the current `6r` feasible match
- the `12r >= 16` lane should be materially better grounded
- a second nearby paper should survive the same completeness -> calibration -> verdict path

### `general`

Upgrade from `usable-v1` to `general` only when all of the following are true:

- more than one primitive or attack family has been validated
- local semantics handling is no longer mostly one-off manual work
- transfer to new papers does not require reinventing the workflow contract each time
- the stop conditions for `unresolved` and `mismatch` are stable across multiple papers

`general` does not mean "all of cryptography".
It only means the workflow has shown repeatable behavior across multiple validated lanes.

## Known Limits

- This is not a final cryptanalysis skill for all papers.
- This is not yet a broad analyze-first skill across many cipher families.
- This does not cover public-key cryptography, MPC, FHE, ZK, or side-channel work.
- Local semantics are still partly hand-curated rather than automatically synthesized.
- Convex-hull generation is not generic yet.
- The PRESENT-80 `6r -> 5` match is not yet certified optimal.
- The downstream `12r >= 16` and `24r -> 2^-64` claims are not yet validated by a fully certified local chain.

## Files To Know

- `docs/requirements/2026-04-22-cryptanalysis-benchmark-packet.md`
- `docs/cryptanalysis-benchmark/trials/eprint-2013-676/trial-notes.md`
- `docs/cryptanalysis-benchmark/trials/eprint-2013-676/primitive-spec.present80.full.json`
- `docs/cryptanalysis-benchmark/trials/eprint-2013-676/attack-spec.present80-rkdiff24.json`
- `docs/cryptanalysis-benchmark/trials/eprint-2013-676/local-semantics.present-sbox.cdp.json`
- `docs/cryptanalysis-benchmark/trials/eprint-2013-676/global-model-plan.present80-rkdiff24.json`
- `docs/cryptanalysis-benchmark/trials/eprint-2013-676/model-instantiation.present80-rkdiff24.json`
- `docs/cryptanalysis-benchmark/trials/eprint-2013-676/calibration-reference.present80-rkdiff.json`
- `scripts/cryptanalysis-benchmark/emit-milp-lp.js`
- `scripts/cryptanalysis-benchmark/run-highs-mip.py`
- `scripts/cryptanalysis-benchmark/render-verdict.js`
- `scripts/cryptanalysis-benchmark/run-calibration-case.js`
- `scripts/cryptanalysis-benchmark/render-calibration-report.js`
- `tests/test-cryptanalysis-benchmark-emit-milp-lp.js`
- `tests/test-cryptanalysis-benchmark-render-verdict.js`
- `tests/test-cryptanalysis-benchmark-run-calibration-case.js`
- `tests/test-cryptanalysis-benchmark-render-calibration-report.js`
- `fixtures/solver-summaries/present80-r5-serverc.summary.json`
- `fixtures/solver-summaries/present80-r6-serverc.summary.json`
- `fixtures/solver-summaries/present80-r6-serverc-seed2.summary.json`
- `outputs/cryptanalysis-benchmark/eprint-2013-676/verdicts/`
- `outputs/cryptanalysis-benchmark/eprint-2013-676/calibration-runs/`

## Review Standard

If this skill is used on a new paper family, the first question is not "can we emit a model?"

The first question is:

```text
can we reach a published small-round checkpoint
with a modeling lane that we can actually explain?
```

If the answer is no, keep iterating on the lane.
Do not promote the pipeline into a general skill yet.
