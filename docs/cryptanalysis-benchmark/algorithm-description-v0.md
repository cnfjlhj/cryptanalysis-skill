# Algorithm Description v0

## Purpose

This document defines the pre-IR layer for the `cryptanalysis` workflow.

Its job is not to replace the primitive spec, the attack spec, or the solver model.
Its job is to normalize raw research materials into a reviewable, machine-friendly
"algorithm description" that still preserves paper-facing meaning.

In the intended long-term workflow:

```text
raw materials
  -> algorithm description
  -> structural IR
  -> local semantic refinement
  -> backend model
  -> solve / verify
  -> cryptanalysis report
```

## Why This Layer Exists

The current repository already has:

- intake bundle and request layers
- primitive spec
- attack spec
- model instantiation
- local semantics
- solver / verdict / report

What is still missing is a stable, paper-facing layer that answers:

```text
What primitive is being analyzed?
What exact attack goal is being considered?
What paper claim or checkpoint is being compared?
What facts came directly from sources?
What facts were inferred?
What is still missing before IR construction can be trusted?
```

That missing layer is what this document calls `algorithm description`.

## Boundary

`algorithm description` is not:

- the raw paper text
- the final structural IR
- the full primitive spec
- the final backend model

It is the layer that turns raw materials into a compact but semantically explicit
problem statement for later compilation.

## Design Principles

1. Keep paper meaning visible.
   The description must still be understandable to a human reviewer who wants to know
   what claim is being checked and how the task is framed.

2. Separate explicit facts from inferred facts.
   The system must not silently treat inferences as if they were directly stated.

3. Be rich enough for IR projection.
   The description must contain enough structure that the next stage can project it
   into state nodes, operator nodes, round scopes, and analysis semantics.

4. Preserve unresolved gaps.
   If key details are still missing, the description must carry those gaps forward
   instead of pretending the task is complete.

## Minimal Sections

Every `algorithm description` should contain these sections:

### 1. Source Materials

What evidence the description was built from.

Examples:

- attack paper
- primitive paper or standard
- code repository
- appendix
- user note

### 2. Primitive Overview

The basic identity of the target primitive:

- primitive name and variant
- family
- block / key / state sizes
- round count
- high-level round structure
- high-level key schedule structure

This section is still descriptive.
It is not yet the full operator-level primitive spec.

### 3. Analysis Task

The cryptanalytic task being posed:

- attack family
- security goal
- semantic domain
- granularity
- exactness goal
- target rounds
- objective metric
- scenario flags

This is the part that turns "we have a paper" into "we are checking this exact analysis target."

### 4. Validation Anchor

The concrete paper-facing checkpoint that later solving will compare against.

Examples:

- table entry
- theorem statement
- claimed lower bound
- claimed data complexity
- claimed distinguisher rounds

Without this section, solving may run, but verification becomes ambiguous.

### 5. Structured Description Surface

This is the bridge to IR.

It should include a reviewable summary of:

- state containers
- round step sequence
- key schedule step sequence
- operator inventory

This is still not the final IR graph, but it should already reveal the structure
that the IR will later encode.

This surface may also carry three optional machine-facing annotations when the
primitive family needs them:

- `operation_parameters`
- `semantic_refinement_requirements`
- `schedule_indexing_model`

These annotations exist to prevent later IR projection from guessing hidden
constants, hidden nonlinear semantics, or hidden schedule movement.
They are still part of the paper-facing contract.
They are not backend-variable declarations and they are not the local rule packs
themselves.

#### 5a. Operation Parameters

Certain steps are structurally clear but still underspecified unless their local
constants are surfaced explicitly.

Typical examples:

- rotation amount for ARX steps
- modulus for modular addition
- S-box cell width and parallel count
- extracted register slice for key extraction
- named permutation identity

If later IR projection would otherwise have to re-read a prose summary to guess
such constants, the description should carry them in `operation_parameters`.

#### 5b. Semantic Refinement Requirements

Some steps are not fully analyzable from structure alone.

Examples:

- an S-box step under xor-differential analysis
- a modular addition step under xor-differential analysis

In those cases, the description should declare
`semantic_refinement_requirements` to say that a later stage must attach a
local rule pack or exact operator semantics.

This field is not the semantics implementation itself.
It is only the explicit contract that later compilation cannot stay purely
structural at that step.

#### 5c. Schedule Indexing Model

Key schedules are a recurring source of hidden assumptions.

Some primitives use a single fixed register that is mutated in place.
Others use a rolling queue or a cyclic slot-selection rule.

The `schedule_indexing_model` field exists to expose this round-to-round
movement explicitly so that later IR projection does not have to infer:

- whether storage is fixed or rolling
- which slot is selected in round `i`
- whether a step mutates a register in place
- when the "current round key" advances

### 6. Provenance and Gaps

This section explicitly records:

- source-grounded facts
- inferred facts
- unresolved questions
- blockers before trusted IR projection

This is mandatory, because the future system must distinguish
"not yet modeled" from "modeled and found secure/insecure."

## Relationship To Existing Repo Layers

```text
analysis bundle
  = raw intake packet

algorithm description
  = normalized paper-facing task statement before IR

primitive spec
  = operator-level structured primitive surface

attack spec
  = structured attack and validation target surface

model instantiation
  = backend-facing model assembly configuration
```

In practice, the future compiler path should look like:

```text
algorithm description
  -> primitive spec fragment extraction
  -> attack spec extraction
  -> structural IR projection
  -> local semantic refinement
  -> backend model assembly
```

## Current Scope

This `v0` format is intentionally narrow.

This revision keeps the format narrow by making the three new surfaces optional.
They expose hidden constants, hidden semantic hooks, and hidden schedule motion,
but they do not collapse `algorithm description` into `structural IR`, `local
semantics`, or a backend model.

It is designed to answer one practical question:

```text
Can we describe a symmetric-cryptanalysis task clearly enough
that later IR construction is no longer guesswork?
```

It does not claim to be a final standard.

## Review Checklist

An `algorithm description` is reviewable when:

1. the target primitive and variant are unambiguous
2. the attack family and analysis metric are explicit
3. the comparison target in the source paper is explicit
4. the main round structure is visible in structured form
5. operator parameters and schedule movement are explicit when later IR would otherwise have to guess them
6. required semantic-refinement hooks are declared when structure alone is not enough
7. inferences are separated from source-grounded facts
8. remaining blockers are listed explicitly

## Example

See:

`docs/cryptanalysis-benchmark/examples/eprint-2013-676.present80.algorithm-description.v0.json`
