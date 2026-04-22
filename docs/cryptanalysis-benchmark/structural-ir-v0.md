# Structural IR v0

## 1. Purpose

This document defines the first draft of a `structural IR` layer for the
`cryptanalysis` workflow.

Its job is to sit between:

```text
algorithm description
  -> structural IR
  -> local semantic refinement
  -> backend model
```

The `algorithm description` is still paper-facing.
The `structural IR` is the first machine-oriented layer.

`structural IR v0` does not yet encode solver inequalities, probabilities,
convex hull facets, or backend syntax.
It only makes the structure explicit enough that later semantic modules can
attach the right rules.

## 2. Why This Layer Is Separate

The current pain point is that "primitive description", "analysis target",
"operator semantics", and "backend constraints" are still too easy to mix.

The intended split is:

```text
algorithm description
  = what primitive and what paper-facing task are we talking about

structural IR
  = what state objects, operation nodes, and round dependencies exist

local semantic refinement
  = what each operation means under xor differential / linear / integral / ...

backend model
  = the concrete MILP / SAT / SMT / CP instance
```

If these layers collapse into one blob, the workflow becomes brittle.

## 3. Boundary

`structural IR v0` is not:

- raw paper text
- a primitive spec replacement
- a backend model
- a semantic rule pack
- a solver transcript

It is:

- an explicit graph-like task surface
- typed enough for later operator-wise refinement
- independent of a single backend
- reviewable against the source algorithm description

## 4. Core Design Requirements

### 4.1 Preserve primitive structure

The IR must show:

- state containers
- round-local operation order
- key schedule structure
- cross-round data dependencies

### 4.2 Preserve analysis intent

The IR must carry:

- semantic domain
- granularity
- objective metric
- round scope
- scenario flags

### 4.3 Leave room for refinement

The IR must not hard-code one semantic encoding.
Instead, it should expose slots where later refinement attaches.

Examples:

- an `sbox` node may later attach xor-differential rules
- an `add_mod` node may later attach exact or approximate ARX rules
- a `permute_bits` node may later attach only wiring, not weight

### 4.4 Keep paper verification visible

The IR must retain a binding to the source claim so that later solving is still
traceable to a paper-facing checkpoint.

## 5. IR Objects

The current schema uses the following object families:

```text
top-level identity
analysis_context
index_domains
state_families
operator_templates
indexing_relations
dataflow_edges
observation_points
provenance_and_gaps
```

### 5.1 Top-Level Identity

Global identity for the IR packet.

Current top-level fields:

```text
ir_id
source_algorithm_description_id
status
```

### 5.2 `analysis_context`

This is the IR copy of the attack/task surface.

Suggested fields:

```text
primitive_id
attack_family
semantic_domain
granularity
exactness_goal
objective_metric
objective_direction
target_round_start
target_round_end
scenario_flags
validation_anchor_ref
```

This keeps the IR reusable across multiple backends while preventing the backend
from having to reinterpret raw paper text.

### 5.3 `index_domains`

Named index spaces used by the IR.

Typical examples:

- encryption rounds
- round boundaries
- key-schedule updates
- bit positions
- S-box slots
- rolling-queue slots

These make "what repeats over what" explicit before any backend unrolling.

### 5.4 `state_families`

Explicit containers that later operator templates read from or write to.

These come from `structured_description.state_containers`, but the IR makes
their graph role more explicit.

Suggested fields:

```text
family_id
role
container_kind
width_bits
index_domain_refs
summary
```

Examples:

- full encryption-state boundaries
- left / right branch families
- round-key families
- key-register families
- rolling schedule-word arrays

### 5.5 `operator_templates`

The main structural units.

Every operation in the algorithm description becomes a reusable operator
template expanded later across one or more index domains.

Suggested fields:

```text
template_id
name
op_type
repeat_domain_refs
input_family_refs
output_family_refs
operator_parameters
semantic_tags
refinement_requirements
indexing_relation_refs
summary
evidence
```

Important point:

`refinement_requirements` do not contain inequalities yet.
They only declare what kind of semantic refinement must be attached later.

Examples:

```text
refinement_requirements = []
```

for a pure permutation template,

or

```text
refinement_requirements = [
  {
    "domain": "xor_differential",
    "rule_family": "arx_add_mod_xor_differential"
  }
]
```

for an ARX modular-add template.

This is also where `algorithm description.operation_parameters` become explicit
machine-facing operator parameters rather than prose-only constants.

### 5.6 `indexing_relations`

This object family is the bridge from
`structured_description.schedule_indexing_model` into IR.

It captures schedule or container movement that is more structured than a free
text summary but still earlier than backend unrolling.

Suggested fields:

```text
relation_id
style
domain_ref
family_refs
selection_rule
advancement_rule
summary
```

Typical uses:

- a fixed register updated in place
- a cyclic queue whose active slot is `i mod 3`
- a fixed slice extracted as the current round key

### 5.7 `dataflow_edges`

Directed dependencies between operator templates and state families.

Suggested fields:

```text
edge_id
from_kind
from_ref
to_kind
to_ref
summary
```

This is where permutations, branch flow, key extraction, and round-to-round
carryover become explicit instead of hiding inside prose.

### 5.8 `observation_points`

Paper-facing checkpoints and objective surfaces carried into the graph layer.

Suggested fields:

```text
point_id
ref_kind
ref
role
summary
```

Without this, a solver result can exist but still be hard to interpret.

### 5.9 `provenance_and_gaps`

The IR must keep the explicit/inferred distinction and still record what is
not attached yet.

Suggested fields:

```text
derived_from
semantic_layers_not_yet_attached
blocking_gaps
ready_for_semantic_refinement
```

## 6. Projection From Algorithm Description

The intended compilation path is:

```text
algorithm description
  -> top-level identity + analysis_context
  -> index_domains
  -> state_families
  -> operator_templates
  -> indexing_relations
  -> dataflow_edges
  -> observation_points
  -> provenance_and_gaps
```

Field-by-field mapping:

```text
source_materials
  -> provenance_and_gaps.derived_from

primitive_overview
  -> top-level identity + analysis_context + index_domains + state_families

analysis_task
  -> analysis_context

validation_anchor
  -> analysis_context.validation_anchor_ref + observation_points

structured_description.state_containers
  -> state_families

structured_description.round_steps
  -> encryption operator_templates + dataflow_edges

structured_description.key_schedule_steps
  -> key-schedule operator_templates + dataflow_edges

structured_description.round_steps[].operation_parameters
  -> operator_templates[].operator_parameters

structured_description.key_schedule_steps[].operation_parameters
  -> operator_templates[].operator_parameters

structured_description.round_steps[].semantic_refinement_requirements
  -> operator_templates[].refinement_requirements

structured_description.key_schedule_steps[].semantic_refinement_requirements
  -> operator_templates[].refinement_requirements

structured_description.schedule_indexing_model
  -> indexing_relations + index_domains + state_families

structured_description.*[].indexing_effect
  -> operator_templates[].indexing_relation_refs + dataflow_edges summaries

provenance_and_gaps
  -> provenance_and_gaps + IR trust status
```

## 7. What v0 Must Make Explicit

At minimum, `structural IR v0` must make these things machine-visible:

```text
1. what the state objects are
2. what the key-related objects are
3. what operation happens in what order
4. what crosses round boundaries
5. what claim is being validated
6. what semantic family later refinement should attach
7. what constant or slice parameters each operator instance family carries
8. what schedule or queue movement governs key evolution
```

If any of these remain hidden in free text, the IR is too weak.

## 8. PRESENT Projection Sketch

For PRESENT-80, the projection now looks like:

```text
state_families
  - encryption-state boundaries
  - round_key family
  - master-key-register family

operator_templates per encryption round
  - key_add
  - sbox
  - permute_bits

operator_templates per key-schedule round
  - extract_bits
  - rotate_left
  - sbox
  - xor

indexing_relations
  - fixed_register(master_key_register)
```

This is structurally regular, bit-oriented, and schedule movement is still
in-place rather than queue-based.

## 9. Speck Projection Sketch

For Speck-32/64, the projection should look different enough to prove the IR
is not SPN-only:

```text
state_families
  - left/right branch boundaries
  - round_key family
  - rolling schedule-word family
  - round-index constant family

operator_templates per encryption round
  - rotate_right(left_word, 7)
  - add_mod(word, word)
  - xor_with_round_key
  - rotate_left(right_word, 2)
  - xor_branches

operator_templates per key-schedule round
  - rotate_right(l_i, 7)
  - add_mod(k_i, rotated_l_i)
  - xor_round_index
  - rotate_left(k_i, 2)
  - xor_key_update

indexing_relations
  - rolling_queue(schedule_l_words, active_slot = i mod 3)
```

The important difference is that ARX structure introduces:

- word-level containers
- modular-add nodes
- round-index constants used as key-schedule data
- separate branch-level flow rather than SPN cell flow

## 10. Where Local Semantic Refinement Starts

`structural IR v0` stops before the following questions are answered:

```text
How exactly is xor differential through add_mod encoded?
How many inequalities are used for this sbox or ARX addition?
Is the refinement exact, approximate, or upper-bound only?
Which backend receives the translated constraints?
```

Those belong to `local semantic refinement`.

In other words:

```text
IR node says: "this is a 16-bit add_mod node in xor differential analysis"
refinement layer says: "attach this exact or approximate rule pack"
backend layer says: "emit these MILP or SAT constraints"
```

## 11. What Still Remains Weak

This revision closes three major gaps, but several things still remain weak:

### 11.1 port-level mappings are still summary-heavy

The IR now names operator parameters and schedule movement, but
`dataflow_edges.summary` still carries too much meaning for:

- exact port names
- exact slice mappings
- exact boundary-to-boundary transfer rules

### 11.2 index expansion is not yet executable

The IR can now say:

- this schedule is a fixed register
- this schedule is a rolling queue
- this slot is selected by `i mod 3`

But it does not yet provide the executable expansion procedure that turns those
relations into fully instantiated round-local graph objects.

### 11.3 refinement requirements are declared, not resolved

The IR can now say which operator template needs which local semantic family.
It still does not answer:

- where the rule pack is stored
- how the rule pack is selected deterministically
- how exact vs approximate variants are chosen

## 12. Recommended Next Step

The next practical step is:

```text
structural IR example set
  -> local semantic refinement attachment rules
  -> explicit resolver from refinement requirement to rule pack
  -> only then backend model assembly
```

In concrete terms:

1. bind `sbox` and `add_mod` templates to concrete local-semantics descriptors
2. define how `indexing_relations` expand into round-local graph instances
3. keep backend emission out of scope until those two contracts are stable
