# Pass / Fail Rubric

## Purpose

This rubric is for judging whether the benchmark packet and the first paper trials are mature enough to justify a real skill.

Paper agreement is necessary but not sufficient.

## Status Labels

Use exactly one primary outcome label per trial:

- `paper-consistent`
- `backend-consistent`
- `locally-verified`
- `heuristic-only`
- `schema-break`
- `unresolved`

## Consistency Meanings

### `paper-consistent`

The produced result matches the chosen published target within the declared exactness regime.

### `backend-consistent`

Different backend formulations agree with each other, but paper agreement is still incomplete or unconfirmed.

### `locally-verified`

Local operator semantics have been independently checked, but the full paper-level result is not yet aligned.

### `heuristic-only`

The run depends on approximations or hand-wavy assumptions that are not strong enough for a paper-faithful claim.

### `schema-break`

The paper cannot be represented cleanly without changing the packet's current schemas.

### `unresolved`

The attempt failed or stalled, and the failure mode is not yet localized.

## Gate A: Input Stability

Pass if:

- the raw bundle can be enumerated clearly
- missing inputs are visible rather than guessed away

Fail if:

- the workflow depends on silent assumptions about where the primitive definition came from

## Gate B: Parsing Correctness

Pass if:

- round structure
- state width
- operation order
- attack family
- validation target

are all explicitly traceable to source evidence.

Fail if any of those are guessed without evidence.

## Gate C: Local Semantics Correctness

Pass if every important local rule is marked as one of:

- exact
- approximate
- upper_bound
- unknown

Fail if exactness is blurred or omitted.

## Gate D: End-to-End Result Quality

Pass if the benchmark reproduces at least one published target or clearly explains why it diverged.

Fail if the output is just "solver ran" or "model generated" without paper-facing interpretation.

## Gate E: Failure Attribution

Every failed or partial trial must assign the first dominant mismatch to one of:

- `parsing`
- `local_semantics`
- `global_stitching`
- `backend_choice`
- `paper_ambiguity`
- `validation_gap`

If none can be assigned, the trial remains `unresolved`.

## Skill Freeze Threshold

Do not freeze the final skill until all three are true:

1. at least 3 wave-1 papers avoid `schema-break`
2. at least 2 wave-1 papers reach `paper-consistent`
3. at least 2 repeated failure modes appear in the ledger
