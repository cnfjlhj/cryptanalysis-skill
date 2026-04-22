# serverC Execution Lane

Date: 2026-04-22
Status: Active

## Purpose

This note records how `serverC` fits into the cryptanalysis workflow.

`serverC` is not the reason to run validation.
It is the remote execution lane we can use when local execution becomes too slow or when a heavier compute box is more appropriate.

## Confirmed Access Surface

- SSH alias:
  - `serverC`
- remote wrapper:
  - local SSH wrapper or equivalent helper

The local host policy card for `serverC` marks it as:

- a shared research compute machine
- a shared `8x4090` GPU box
- a host where GPU fairness and tmux hygiene matter

## Confirmed Runtime Facts

The following facts were confirmed by a read-only probe on 2026-04-22:

- remote hostname alias: `serverC`
- remote working directory on login: `<serverc-user-home>`
- `python3` exists at `/usr/bin/python3`
- no MILP solver binary was found in PATH for:
  - `highs`
  - `gurobi_cl`
  - `cbc`
  - `glpsol`
  - `scip`
- no Python MILP package was found for:
  - `highspy`
  - `gurobipy`
  - `pulp`
  - `ortools`
  - `pyomo`
  - `mip`

Resource snapshot from the same probe:

- CPU:
  - `256` logical CPUs
  - `AMD EPYC 9554 64-Core Processor`
- memory:
  - total about `503 GiB`
  - available about `377 GiB`
- GPUs:
  - `8 x RTX 4090`
  - at probe time, only GPUs `3` and `4` looked mostly idle

## What This Means For Cryptanalysis

`serverC` is a real remote execution option, but not an immediate drop-in replacement for the current local HiGHS lane.

Right now:

- it is suitable for:
  - long-running shared-box experiments
  - remote tmux sessions
  - CPU-heavy preprocessing
  - GPU-backed model services or LLM-related auxiliary tasks
- it is not yet solver-ready for the current MILP validation lane because the solver stack is missing

So the practical conclusion is:

```text
serverC is available as an execution lane
  but
current MILP validation still needs remote environment provisioning
before this host can help with PRESENT-80 lower-bound runs
```

## Repo-local Probe Command

Use:

```bash
node scripts/cryptanalysis-benchmark/probe-serverc.js
```

This command:

- goes through the local ssh wrapper
- probes `serverC`
- reports host, CPU, memory, GPU occupancy, solver commands, and Python MILP packages

## Integration Rule

For this repository, `serverC` should be treated as:

- the preferred remote lane for heavy shared-box experiments
- not a place to silently start long jobs without checking GPU occupancy
- not a place to assume solver availability

If we later want to use it for MILP validation, the next required step is explicit remote provisioning of one of:

- `highs` / `highspy`
- `gurobi_cl` / `gurobipy`
- another accepted MILP backend

That provisioning is a remote-state change and should be treated as a separate confirmed action.
