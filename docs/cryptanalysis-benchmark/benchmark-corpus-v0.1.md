# Cryptanalysis Benchmark Corpus v0.1

## Purpose

This corpus is the first real-paper benchmark set for the cryptanalysis automation packet.

The goal is not broad coverage.
The goal is to expose where the proposed pipeline breaks:

- parsing
- operator semantics
- global model stitching
- backend choice
- result interpretation

## Raw Input Rule

Every benchmark case starts from a `paper bundle`.

Minimum bundle:

- attack paper

Preferred bundle:

- attack paper
- primitive reference paper
- code repository
- appendix or supplementary material

## Wave 1: First Four Papers

These four papers are the first execution wave.

### P1

- Paper ID: `eprint-2013-676`
- Title: `Automatic Security Evaluation and (Related-key) Differential Characteristic Search for Bit-Oriented Block Ciphers`
- Link: <https://eprint.iacr.org/2013/676>
- Why: canonical early MILP benchmark for bit-oriented SPN-style modeling, especially local inequality extraction and end-to-end differential characteristic search.
- Primary stress points:
  - S-box local semantics
  - XOR semantics
  - bit permutation handling
  - convex-hull-driven inequality extraction

### P2

- Paper ID: `eprint-2014-747`
- Title: `Towards Finding the Best Characteristics of Some Bit-Oriented Block Ciphers and Automatic Enumeration of (Related-key) Differential and Linear Characteristics with Predefined Properties`
- Link: <https://eprint.iacr.org/2014/747>
- Why: extends the MILP lane into enumeration and predefined-property handling; useful for testing whether the schemas can capture more than one "single optimum trail" story.
- Primary stress points:
  - predefined property constraints
  - differential versus linear attack metadata
  - enumeration-oriented result tracking

### P3

- Paper ID: `eprint-2016-407`
- Title: `MILP-Based Automatic Search Algorithms for Differential and Linear Trails for Speck`
- Link: <https://eprint.iacr.org/2016/407>
- Why: forces the benchmark packet to handle ARX semantics rather than only SPN operator patterns.
- Primary stress points:
  - modular addition
  - rotation
  - XOR in ARX composition
  - SPN versus ARX schema fitness

### P4

- Paper ID: `eprint-2022-513`
- Title: `CASCADA: Characteristic Automated Search of Cryptographic Algorithms for Distinguishing Attacks`
- Link: <https://eprint.iacr.org/2022/513>
- Why: framework-oriented paper that stresses IR shape, bit-vector style normalization, and richer distinguishing-attack coverage.
- Primary stress points:
  - framework-level primitive description
  - bit-vector semantics
  - multi-attack normalization
  - report-layer consistency

## Wave 2: Expansion Papers

Only start wave 2 after wave 1 produces useful mismatch data.

### P5

- Paper ID: `eprint-2022-1147`
- Title: `Finding the Impossible: Automated Search for Full Impossible-Differential, Zero-Correlation, and Integral Attacks`
- Link: <https://eprint.iacr.org/2022/1147>
- Why: introduces non-basic attack families and stresses attack-spec richness.

### P6

- Paper ID: `eprint-2023-622`
- Title: `CLAASP: a Cryptographic Library for the Automated Analysis of Symmetric Primitives`
- Link: <https://eprint.iacr.org/2023/622>
- Why: useful for comparing our benchmark packet against an existing library-level abstraction.

### P7

- Paper ID: `eprint-2024-105`
- Title: `Differential cryptanalysis with SAT, SMT, MILP, and CP: a detailed comparison for bit-oriented primitives`
- Link: <https://eprint.iacr.org/2024/105>
- Why: directly stresses backend-plan realism and solver-choice reporting.

## Per-Paper Trial Checklist

For each paper, record at least the following:

1. What the raw bundle contained.
2. Whether `primitive_spec` could be extracted without schema changes.
3. Whether `attack_spec` could be extracted without schema changes.
4. Which operators required exact rules versus heuristic or approximate handling.
5. Which published result was chosen as the first validation target.
6. Whether the first mismatch was due to parsing, local semantics, stitching, backend, or paper ambiguity.

## Exit Condition For Skill Drafting

Do not freeze a real skill until:

1. at least 3 wave-1 papers are structurally normalized without schema collapse
2. at least 2 wave-1 papers reach a credible paper-consistent result
3. repeated failure modes are visible in the ledger
