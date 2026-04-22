#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');

const DEFAULT_ALIAS = 'serverC';
const DEFAULT_WRAPPER = path.join(
  process.env.HOME || '',
  '.codex',
  'skills',
  'ssh-skill',
  'scripts',
  'codex_ssh.sh'
);

function parseArgs(argv) {
  const options = {
    alias: DEFAULT_ALIAS,
    wrapperPath: DEFAULT_WRAPPER,
    jsonOnly: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if ((current === '--alias' || current === '--host-alias') && next) {
      options.alias = String(next);
      index += 1;
      continue;
    }

    if ((current === '--wrapper' || current === '--wrapper-path') && next) {
      options.wrapperPath = path.resolve(next);
      index += 1;
      continue;
    }

    if (current === '--json-only') {
      options.jsonOnly = true;
      continue;
    }

    if (current === '--help' || current === '-h') {
      options.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${current}`);
  }

  return options;
}

function printHelp() {
  console.log([
    'Usage:',
    '  node scripts/cryptanalysis-benchmark/probe-serverc.js',
    '  node scripts/cryptanalysis-benchmark/probe-serverc.js --alias serverC',
    '',
    'Options:',
    '  --alias <name>            SSH alias to probe (default: serverC)',
    '  --wrapper <path>          codex_ssh.sh path',
    '  --json-only               Print only the parsed remote JSON summary'
  ].join('\n'));
}

function buildRemoteCommand() {
  return [
    'python3 - <<\'PY\'',
    'import json',
    'import os',
    'import shutil',
    'import socket',
    'import subprocess',
    '',
    'def run(command):',
    '    result = subprocess.run(command, shell=True, capture_output=True, text=True)',
    '    return {',
    '        "exit_code": result.returncode,',
    '        "stdout": result.stdout.strip(),',
    '        "stderr": result.stderr.strip()',
    '    }',
    '',
    'gpu_query = run("nvidia-smi --query-gpu=index,name,memory.total,memory.used,utilization.gpu --format=csv,noheader,nounits")',
    'gpus = []',
    'if gpu_query["exit_code"] == 0 and gpu_query["stdout"]:',
    '    for raw_line in gpu_query["stdout"].splitlines():',
    '        parts = [part.strip() for part in raw_line.split(",")]',
    '        if len(parts) != 5:',
    '            continue',
    '        try:',
    '            index, name, memory_total, memory_used, utilization = parts',
    '            gpus.append({',
    '                "index": int(index),',
    '                "name": name,',
    '                "memory_total_mib": int(memory_total),',
    '                "memory_used_mib": int(memory_used),',
    '                "utilization_gpu_percent": int(utilization)',
    '            })',
    '        except ValueError:',
    '            continue',
    '',
    'idle_gpu_indices = [',
    '    gpu["index"] for gpu in gpus',
    '    if gpu["memory_used_mib"] <= 1024 and gpu["utilization_gpu_percent"] <= 5',
    ']',
    '',
    'meminfo = {}',
    'try:',
    '    with open("/proc/meminfo", "r", encoding="utf-8") as handle:',
    '        for line in handle:',
    '            key, value = line.split(":", 1)',
    '            meminfo[key] = value.strip()',
    'except OSError:',
    '    pass',
    '',
    'def gib_from_meminfo(key):',
    '    raw = meminfo.get(key, "")',
    '    if not raw:',
    '        return None',
    '    number = raw.split()[0]',
    '    try:',
    '        return round(int(number) / 1024 / 1024, 2)',
    '    except ValueError:',
    '        return None',
    '',
    'modules = {}',
    'for name in ["highspy", "gurobipy", "pulp", "ortools", "pyomo", "mip"]:',
    '    try:',
    '        __import__(name)',
    '        modules[name] = True',
    '    except Exception:',
    '        modules[name] = False',
    '',
    'commands = {}',
    'for name in ["python3", "highs", "gurobi_cl", "cbc", "glpsol", "scip", "tmux"]:',
    '    commands[name] = shutil.which(name)',
    '',
    'summary = {',
    '    "hostname": socket.gethostname(),',
    '    "cwd": os.getcwd(),',
    '    "cpu_count": os.cpu_count(),',
    '    "memory_total_gib": gib_from_meminfo("MemTotal"),',
    '    "memory_available_gib": gib_from_meminfo("MemAvailable"),',
    '    "gpu_count": len(gpus),',
    '    "gpus": gpus,',
    '    "idle_gpu_indices": idle_gpu_indices,',
    '    "commands": commands,',
    '    "python_modules": modules',
    '}',
    'print(json.dumps(summary, ensure_ascii=True))',
    'PY'
  ].join('\n');
}

function parseWrapperJson(raw) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse ssh wrapper JSON: ${error.message}`);
  }
}

function parseRemoteJson(raw) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse remote probe JSON: ${error.message}`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const remoteCommand = buildRemoteCommand();
  const wrapped = spawnSync(options.wrapperPath, [
    'execute',
    options.alias,
    remoteCommand
  ], {
    encoding: 'utf8'
  });

  if (wrapped.status !== 0) {
    throw new Error(wrapped.stderr || wrapped.stdout || `ssh wrapper failed with status ${wrapped.status}`);
  }

  const wrapperJson = parseWrapperJson(wrapped.stdout);
  if (!wrapperJson.success) {
    throw new Error(`ssh wrapper reported failure: ${JSON.stringify(wrapperJson)}`);
  }

  const remoteSummary = parseRemoteJson(String(wrapperJson.stdout || '').trim());
  const output = {
    alias: options.alias,
    method: wrapperJson.method,
    fallback_reason: wrapperJson.fallback_reason || '',
    remote: remoteSummary
  };

  if (options.jsonOnly) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  console.log(`alias: ${output.alias}`);
  console.log(`method: ${output.method}`);
  if (output.fallback_reason) {
    console.log(`fallback_reason: ${output.fallback_reason}`);
  }
  console.log(`hostname: ${remoteSummary.hostname}`);
  console.log(`cwd: ${remoteSummary.cwd}`);
  console.log(`cpu_count: ${remoteSummary.cpu_count}`);
  console.log(`memory_total_gib: ${remoteSummary.memory_total_gib}`);
  console.log(`memory_available_gib: ${remoteSummary.memory_available_gib}`);
  console.log(`gpu_count: ${remoteSummary.gpu_count}`);
  console.log(`idle_gpu_indices: ${remoteSummary.idle_gpu_indices.join(',') || '(none)'}`);
  console.log('solver_commands:');
  for (const name of ['highs', 'gurobi_cl', 'cbc', 'glpsol', 'scip']) {
    console.log(`  ${name}: ${remoteSummary.commands[name] || 'MISSING'}`);
  }
  console.log('python_modules:');
  for (const [name, present] of Object.entries(remoteSummary.python_modules)) {
    console.log(`  ${name}: ${present ? 'FOUND' : 'MISSING'}`);
  }
  console.log('json:');
  console.log(JSON.stringify(output, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[probe-serverc] ${error.stack || error.message}`);
    process.exit(1);
  }
}
