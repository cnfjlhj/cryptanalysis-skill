# Trial Notes: ePrint 2013/676

## Trial Goal

Run the first real normalization trial from the benchmark packet.

This trial does not implement a solver backend.
It tests whether the current benchmark packet can faithfully normalize one paper bundle into:

- `primitive_spec`
- `attack_spec`
- a first ledger entry

## Selected Bundle

### Attack Paper

- Title: `Automatic Security Evaluation and (Related-key) Differential Characteristic Search: Application to SIMON, PRESENT, LBlock, DES(L) and Other Bit-oriented Block Ciphers`
- Local files:
  - `eprint-2013-676.pdf`
  - `eprint-2013-676.txt`
- Link: <https://eprint.iacr.org/2013/676>

### Primitive Reference

- Title: `PRESENT: An Ultra-Lightweight Block Cipher`
- Local files:
  - `present-ches2007.pdf`
  - `present-ches2007.txt`
- Link: <https://www.iacr.org/archive/ches2007/47270450/47270450.pdf>

### Bundle Quality

Bundle completeness for this trial is `preferred`.

We have:

- attack paper
- primitive reference paper

We do not yet have:

- code
- appendix-specific scripts

## Chosen Primitive / Target

### Primitive

- `PRESENT-80`
- family: `spn`

### Validation Target

- claim: the probability of the best 24-round related-key differential characteristic of `PRESENT-80` is upper bounded by `2^-64`
- source evidence:
  - attack paper abstract
  - attack paper contribution list
  - attack paper Appendix A.1

## Evidence Extracted

### Primitive Structure

From the primitive paper:

- `PRESENT` is an SP-network with 31 rounds
- block size is 64 bits
- supported key sizes are 80 and 128 bits
- each round uses:
  - `addRoundKey`
  - `sBoxLayer`
  - `pLayer`
- the S-box is a 4-bit to 4-bit substitution applied 16 times in parallel
- the 80-bit key schedule updates the key register by:
  - rotation by 61 bits
  - S-box on the left-most 4 bits
  - xor of the round counter into bits `k19..k15`

### Attack Semantics

From the attack paper:

- the method is MILP-based
- the target is `related-key differential characteristic`, not full differential effect
- the upper bound is derived from lower bounds on the number of active S-boxes
- for `PRESENT-80`, the paper states at least 16 active S-boxes for any consecutive 12 rounds, and derives:

```text
(2^-2)^16 * (2^-2)^16 = 2^-64
```

### Local Semantics Clues

The paper gives two local S-box modeling lanes:

- logical-condition / CDP constraints
- convex-hull inequalities

For the `PRESENT` S-box, the paper explicitly lists CDP-style linear inequalities in Appendix lines around Fact 1 / Fact 2 of the extracted text.

## First Real Feedback

The first normalization attempt exposed a real packet defect:

- the selected claim is a `related-key` claim
- the original primitive schema had no structured `key_schedule_ops` surface
- the nonlinear 80-bit key schedule could only be written into free-text `notes`

That was a genuine benchmark finding, not a formatting issue.

## Iteration Update

This defect has now been fixed locally in the benchmark packet.

What changed:

- `primitive-spec.schema.json` now supports:
  - `key_schedule.register_name`
  - `key_schedule.round_key_output`
  - `key_schedule.ops`
- a new full primitive artifact exists:
  - `primitive-spec.present80.full.json`

Result:

- the packet can now represent both the encryption round and the nonlinear 80-bit key schedule in structured form
- the trial is no longer blocked at the schema surface

The next blocker is deeper:

- we still do not have a structured local-semantics artifact for turning the `PRESENT` S-box rules and CDP / convex-hull constraints into backend-ready constraint groups
- therefore this trial is not solver-ready yet

## Second Iteration Update

The CDP lane has now been made explicit in a structured local-semantics artifact:

- `local-semantics.present-sbox.cdp.json`

This rule pack captures:

- variable layout for the 4x4 `PRESENT` S-box
- the six CDP inequalities from Fact 2
- the fact that these constraints are `valid_cutting_off`, not a full exact characterization of all valid differential transitions

This means the trial now has:

- a usable primitive description
- a usable attack description
- a first usable local rule pack for the selected paper claim

## Third Iteration Update

The paper-level global stitching layer has now been made explicit in a structured artifact:

- `global-model-plan.present80-rkdiff24.json`

This plan captures:

- the fact that the related-key MILP includes:
  - encryption process
  - key schedule
  - key additions
- the 12-round lower-bound phase
- the split-strategy derivation used to reach the 24-round `2^-64` upper bound
- the provenance distinction between direct solver output and paper-level upper-bound derivation

## Third Iteration Blocker Snapshot

The next blocker is now execution-grade rather than representation-grade.

We still do not have:

- explicit activity-marker variables and their placement in the instantiated MILP
- an executable backend emitter for the global model plan
- a verification loop that can compare solver outputs against the paper's reported lower-bound / upper-bound chain

## Fourth Iteration Update

The execution-facing instantiation layer has now been made explicit in a structured artifact:

- shared schema:
  - `model-instantiation.schema.json`
- trial-specific artifact:
  - `model-instantiation.present80-rkdiff24.json`

This instantiation fixes the previously implicit backend surface by making the following items explicit:

- concrete variable families for:
  - encryption-state differences
  - round-key differences
  - 80-bit key-register differences
  - addRoundKey XOR dummy variables
  - activity markers for encryption and key-schedule S-boxes
- structural constraint blocks for:
  - round-key extraction
  - bit-level XOR propagation in addRoundKey
  - PRESENT S-box activity and bijective nonzero coupling
  - CDP valid cutting-off inequalities
  - pLayer wiring
  - key-schedule rotation
  - key-schedule top-nibble S-box
  - round-counter difference invariance
- the execution split between:
  - a 12-round solver-facing lower-bound unit
  - a 24-round derived upper-bound unit
- the output-capture contract for a later LP emitter / solver harness

Two modeling decisions are now recorded explicitly instead of being left implicit:

- for the 12-round lower-bound unit, the key schedule is modeled only through the updates needed to derive `K2` through `K12`
- XORing the round counter constant into `k19..k15` is treated as difference-invariant in XOR-difference space, so it becomes a copy constraint at the difference level

Result:

- the trial now has a backend-facing model-instantiation surface
- the dominant blocker is no longer generic backend design ambiguity
- the dominant blocker is now concrete LP emission and solver transcript capture

## Fifth Iteration Update

The execution surface is no longer only planned.

This trial now has:

- a concrete LP emitter:
  - `scripts/cryptanalysis-benchmark/emit-milp-lp.js`
- a concrete solver harness for the locally available `highspy` backend:
  - `scripts/cryptanalysis-benchmark/run-highs-mip.py`
- emitted artifacts:
  - `outputs/cryptanalysis-benchmark/eprint-2013-676/p1_compute_12r_lower_bound_model.lp`
  - `outputs/cryptanalysis-benchmark/eprint-2013-676/p1_compute_12r_lower_bound_model.summary.json`
- first solver-run artifacts:
  - `outputs/cryptanalysis-benchmark/eprint-2013-676/p1_compute_12r_lower_bound_model.highs-60s.summary.json`
  - `outputs/cryptanalysis-benchmark/eprint-2013-676/p1_compute_12r_lower_bound_model.highs-60s.sol`
  - `outputs/cryptanalysis-benchmark/eprint-2013-676/p1_compute_12r_lower_bound_model.highs-60s.log`

The emitted LP was accepted by HiGHS 1.14.0 without read-model failure.

The first 60-second local probe on `p1_compute_12r_lower_bound_model` produced:

- model status: `Time limit reached`
- primal feasible objective: `38`
- dual bound: `1`
- MIP gap: about `97.37%`

Interpretation:

- the LP artifact is solver-readable
- the current local run certifies only:

```text
1 <= N12 <= 38
```

where `N12` is the minimized 12-round active-S-box count in the instantiated model

- this is not enough to support the paper-facing premise `N12 >= 16`
- this is also not enough to refute the paper, because the run is incomplete and uses a different backend / budget than the paper's published setup

## Sixth Iteration Update

The remote execution lane is now explicit rather than only implied.

This trial now has a documented `serverC` execution surface:

- runbook:
  - `docs/cryptanalysis-benchmark/serverC-execution-lane.md`
- repo-local probe command:
  - `node scripts/cryptanalysis-benchmark/probe-serverc.js`

Confirmed remote facts:

- preferred SSH alias for reproducible notes: `serverC`
- remote hostname alias: `serverC`
- role: shared `8x4090` compute box
- remote `python3` exists
- current remote MILP stack is absent:
  - no `highs`
  - no `gurobi_cl`
  - no `cbc`
  - no `glpsol`
  - no `scip`
  - no `highspy`
  - no `gurobipy`

Interpretation:

- `serverC` is a valid execution lane for future long-running experiments
- it does not yet unblock the current MILP validation lane by itself
- for the selected `PRESENT-80` trial, the remote blocker is now very concrete:

```text
remote compute exists
  but
remote solver environment for MILP validation does not yet exist
```

## Current Dominant Blocker

The next blocker is no longer LP emission.

We still do not have:

- a paper-facing proof that the emitted 12-round model reaches the published lower bound `N12 >= 16`
- calibration evidence showing whether the current gap is caused mainly by:
  - insufficient solve budget
  - modeling/counting mismatch
  - backend differences versus the paper setup
- a derived 24-round upper-bound artifact driven by a verified lower-bound result rather than only the paper text
- a remote MILP-ready environment on `serverC` if we want to move this validation lane off the local machine

## Trial Outcome

- `primitive_spec`: `usable after schema iteration`
- `attack_spec`: `usable`
- `local_semantics`: `usable for selected CDP lane`
- `global_model_plan`: `usable for selected upper-bound lane`
- `model_instantiation`: `usable for MILP emission planning`
- `backend_emission`: `solver-readable LP emitted`
- `solver_probe`: `HiGHS 60-second run recorded but not paper-conclusive`
- current status label: `unresolved`
- current dominant mismatch stage: `validation_gap`

## Next Action

Before making any paper-consistency claim for this specific related-key target, the packet now needs:

1. calibration runs on smaller `PRESENT-80` related-key windows with published Table 4 reference points
2. a decision on whether the current 12-round gap is mainly:
   - solver-time limitation
   - model-faithfulness limitation
3. in parallel, decide whether to provision a MILP backend on `serverC` for longer remote runs
4. only after that, a longer or paper-comparable run for the 12-round lower-bound unit
5. only after `N12 >= 16` is locally supported, a derived 24-round upper-bound artifact tied to verified lower-bound evidence

The schema-level blocker, the first local-semantics blocker, the paper-shape blocker, and the backend-surface ambiguity are no longer dominant for this paper. The current bottleneck is paper-facing validation of the emitted 12-round model.
