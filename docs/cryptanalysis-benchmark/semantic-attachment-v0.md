# Semantic Attachment v0

## Purpose

This document defines the missing bridge between:

```text
structural IR
  -> semantic attachment
  -> model instantiation
  -> backend emission
```

`structural IR` can already say:

- what operator templates exist
- what parameters they carry
- which templates require semantic refinement

But it still cannot say, deterministically:

- which local rule pack satisfies each requirement
- whether the current repository actually has that rule pack
- whether the requirement is resolved, ambiguous, or missing

That is what `semantic attachment` records.

## Boundary

`semantic attachment` is not:

- the local rule pack itself
- the backend model
- the emitted MILP / SAT / SMT instance

It is:

- a deterministic resolution manifest
- a bridge from IR requirements to available local rule packs
- the place where unresolved semantic debt becomes explicit

## Core Output

Every `semantic attachment` artifact should say:

```text
which IR template asked for semantic refinement
which rule family was requested
which local rule packs were loaded
which packs matched
which pack was selected, if any
whether the requirement is resolved / missing / ambiguous
whether the current IR is semantically ready for model instantiation
```

## Matching Axes

`semantic attachment v0` should only use explicit machine-readable axes.

Current matching axes:

1. `operator_type`
2. `semantic_domain`
3. `rule_family`
4. `component_name` or alias when present
5. input / output width

If matching would require paper-specific guessing or hidden code branches, the
attachment should fail honestly instead.

## Status Vocabulary

Each requirement-level attachment should use one of:

- `resolved`
- `missing`
- `ambiguous`

Meaning:

- `resolved`: exactly one compatible local rule pack was found
- `missing`: no compatible rule pack exists in the loaded set
- `ambiguous`: more than one compatible rule pack exists and v0 cannot choose

## Relationship To Local Rule Packs

A local rule pack remains the operator-level semantics artifact.

Examples:

- PRESENT S-box xor-differential CDP inequalities
- future Speck `add_mod` xor-differential inequalities

The attachment layer does not duplicate those inequalities.
It only points to the right pack and records the matching basis.

## Relationship To Model Instantiation

Model instantiation still happens later.

In the intended long-term workflow:

```text
structural IR
  -> semantic attachment
  -> model-instantiation templates / blocks
  -> backend emission
```

What `semantic attachment v0` guarantees:

- semantic requirements are visible
- available rule packs are visible
- missing rule packs are visible

What it does not guarantee yet:

- executable unrolling of indexing relations
- automatic generation of backend constraint blocks
- deterministic binding-role synthesis for every operator family

## Current Use

This layer is already useful even before full automation because it lets the
repository distinguish:

```text
frontend is clear, but semantics are missing
```

from:

```text
semantics exist, but backend stitching is missing
```

That separation is necessary if the skill is supposed to fail honestly.
