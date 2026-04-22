# Frontend Reference v0

## Purpose

This document defines the machine-readable reference layer for the weak frontend
stages of the `cryptanalysis` workflow:

```text
raw materials / bundle
  -> input normalization
  -> algorithm description
  -> structural IR
```

The current repository already has stronger downstream pieces for selected
lanes. What is still weak is the ability to explain, case by case, how far the
frontend has actually progressed for a given paper.

The job of a `frontend reference` manifest is to make that explicit.

## Why This Layer Exists

Without a dedicated reference system, the repository falls into a bad pattern:

- one paper has a curated `algorithm description`
- another paper has only a bundle
- a third paper has a partial IR
- the real status lives only in chat memory or scattered notes

That is not enough for a skill that is supposed to evolve.

The `frontend reference` layer exists so the repository can answer:

```text
For paper X, what raw bundle exists?
Has input normalization been exercised?
Do we have a curated algorithm description?
Do we have a curated structural IR?
Is there any downstream semantic or execution evidence?
What is the next highest-value missing layer?
```

## Boundary

`frontend reference` is not:

- the raw bundle itself
- the actual algorithm description payload
- the actual structural IR payload
- the backend model or solver transcript

It is:

- the index and status surface for those artifacts
- the coverage map that allows the skill to evolve by adding references
- the audit target that a script can validate

## Design Principles

1. Be explicit about what exists today.
   Do not infer support just because a paper is listed in a corpus document.

2. Distinguish layers.
   A paper with a bundle only is not equivalent to a paper with a gold
   algorithm description and structural IR.

3. Preserve honesty about downstream readiness.
   Some papers may have frontend assets but still lack local semantics or
   execution support.

4. Make extension cheap.
   Adding a new paper should mean adding one more manifest, not inventing a new
   status-report format.

## Core Object Model

Each manifest records:

- paper identity
- wave membership
- primitive family
- attack family
- stress points
- raw bundle artifact
- current layer status for:
  - input normalization
  - algorithm description
  - structural IR
- optional downstream artifacts
- current ceiling
- next priority
- known gaps

## Status Semantics

### Layer Status

Each frontend layer uses a small explicit status set:

- `missing`
  no artifact exists yet
- `available`
  an artifact exists and is intentionally tracked
- `golden`
  the artifact exists and is treated as a curated reference

### Downstream Status

The optional downstream summary uses:

- `none`
- `semantic_only`
- `semantic_blocked`
- `execution_backed`

This keeps the frontend reference layer honest about where the paper currently
stops.

## Current Use

The immediate use is wave-1 corpus tracking:

- `eprint-2013-676`
- `eprint-2014-747`
- `eprint-2016-407`
- `eprint-2022-513`

The point is not that all of them are already strong.
The point is that the repository can now say, with a script rather than with
memory:

- which layers exist
- which layers are missing
- where the next frontend investment should go
