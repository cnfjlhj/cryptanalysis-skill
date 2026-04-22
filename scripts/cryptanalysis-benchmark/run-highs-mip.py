#!/usr/bin/env python3

import argparse
import datetime
import json
from pathlib import Path

from highspy import Highs


def parse_args():
    parser = argparse.ArgumentParser(
        description='Run a HiGHS MILP solve against an emitted LP model and persist a small result summary.'
    )
    parser.add_argument(
        '--model',
        dest='model_path',
        required=True,
        help='Path to the LP model to solve'
    )
    parser.add_argument(
        '--summary-output',
        dest='summary_output_path',
        default='',
        help='Optional JSON summary output path'
    )
    parser.add_argument(
        '--solution-output',
        dest='solution_output_path',
        default='',
        help='Optional solver solution output path'
    )
    parser.add_argument(
        '--time-limit',
        dest='time_limit',
        type=float,
        default=60.0,
        help='Time limit in seconds'
    )
    parser.add_argument(
        '--threads',
        dest='threads',
        type=int,
        default=4,
        help='Maximum HiGHS thread count'
    )
    parser.add_argument(
        '--mip-heuristic-effort',
        dest='mip_heuristic_effort',
        type=float,
        default=None,
        help='Optional HiGHS mip_heuristic_effort override'
    )
    parser.add_argument(
        '--random-seed',
        dest='random_seed',
        type=int,
        default=None,
        help='Optional HiGHS random_seed override'
    )
    parser.add_argument(
        '--log-output',
        dest='log_output_path',
        default='',
        help='Optional HiGHS log file path'
    )
    parser.add_argument(
        '--quiet',
        dest='quiet',
        action='store_true',
        help='Disable solver console output'
    )
    return parser.parse_args()


def ensure_parent_dir(file_path):
    Path(file_path).parent.mkdir(parents=True, exist_ok=True)


def read_info_field(info, field_name):
    return getattr(info, field_name) if hasattr(info, field_name) else None


def main():
    args = parse_args()
    model_path = Path(args.model_path).resolve()
    if not model_path.exists():
        raise SystemExit(f'model not found: {model_path}')

    highs = Highs()
    highs.setOptionValue('output_flag', not args.quiet)
    highs.setOptionValue('threads', args.threads)
    highs.setOptionValue('time_limit', args.time_limit)
    if args.mip_heuristic_effort is not None:
        highs.setOptionValue('mip_heuristic_effort', args.mip_heuristic_effort)
    if args.random_seed is not None:
        highs.setOptionValue('random_seed', args.random_seed)
    if args.log_output_path:
        ensure_parent_dir(args.log_output_path)
        highs.setOptionValue('log_file', str(Path(args.log_output_path).resolve()))

    read_status = highs.readModel(str(model_path))
    solve_status = highs.solve()
    model_status = highs.getModelStatus()
    info = highs.getInfo()

    summary = {
        'model_path': str(model_path),
        'time_limit_seconds': args.time_limit,
        'threads': args.threads,
        'mip_heuristic_effort': args.mip_heuristic_effort,
        'random_seed': args.random_seed,
        'read_status': str(read_status),
        'solve_status': str(solve_status),
        'model_status_code': str(model_status),
        'model_status_text': highs.modelStatusToString(model_status),
        'num_rows': highs.getNumRow(),
        'num_cols': highs.getNumCol(),
        'objective_function_value': read_info_field(info, 'objective_function_value'),
        'mip_dual_bound': read_info_field(info, 'mip_dual_bound'),
        'mip_gap': read_info_field(info, 'mip_gap'),
        'mip_node_count': read_info_field(info, 'mip_node_count'),
        'simplex_iteration_count': read_info_field(info, 'simplex_iteration_count'),
        'primal_solution_status': read_info_field(info, 'primal_solution_status'),
        'dual_solution_status': read_info_field(info, 'dual_solution_status'),
        'max_integrality_violation': read_info_field(info, 'max_integrality_violation'),
        'generated_at': datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z')
    }

    if args.solution_output_path:
        ensure_parent_dir(args.solution_output_path)
        try:
            highs.writeSolution(str(Path(args.solution_output_path).resolve()), 0)
            summary['solution_output_path'] = str(Path(args.solution_output_path).resolve())
        except Exception as exc:  # pragma: no cover - environment-dependent path
            summary['solution_output_error'] = str(exc)

    if args.log_output_path:
        summary['log_output_path'] = str(Path(args.log_output_path).resolve())

    if args.summary_output_path:
        ensure_parent_dir(args.summary_output_path)
        Path(args.summary_output_path).write_text(
            json.dumps(summary, indent=2) + '\n',
            encoding='utf-8'
        )

    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
