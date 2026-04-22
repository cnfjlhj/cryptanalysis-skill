#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '../..');
const DEFAULT_TRIAL_DIR = path.join(
  ROOT_DIR,
  'docs',
  'cryptanalysis-benchmark',
  'trials',
  'eprint-2013-676'
);
const DEFAULT_INSTANTIATION_PATH = path.join(
  DEFAULT_TRIAL_DIR,
  'model-instantiation.present80-rkdiff24.json'
);
const DEFAULT_PRIMITIVE_SPEC_PATH = path.join(
  DEFAULT_TRIAL_DIR,
  'primitive-spec.present80.full.json'
);
const DEFAULT_LOCAL_SEMANTICS_PATH = path.join(
  DEFAULT_TRIAL_DIR,
  'local-semantics.present-sbox.cdp.json'
);
const DEFAULT_OUTPUT_PATH = path.join(
  ROOT_DIR,
  'outputs',
  'cryptanalysis-benchmark',
  'eprint-2013-676',
  'p1_compute_12r_lower_bound_model.lp'
);

function parseArgs(argv) {
  const options = {
    instantiationPath: DEFAULT_INSTANTIATION_PATH,
    primitiveSpecPath: DEFAULT_PRIMITIVE_SPEC_PATH,
    localSemanticsPath: DEFAULT_LOCAL_SEMANTICS_PATH,
    outputPath: DEFAULT_OUTPUT_PATH,
    summaryOutputPath: '',
    unitId: 'p1_compute_12r_lower_bound_model',
    roundEnd: null,
    sboxModel: 'cdp'
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if ((current === '--instantiation' || current === '--instantiation-path') && next) {
      options.instantiationPath = path.resolve(next);
      index += 1;
      continue;
    }

    if ((current === '--primitive-spec' || current === '--primitive-spec-path') && next) {
      options.primitiveSpecPath = path.resolve(next);
      index += 1;
      continue;
    }

    if ((current === '--local-semantics' || current === '--local-semantics-path') && next) {
      options.localSemanticsPath = path.resolve(next);
      index += 1;
      continue;
    }

    if ((current === '--output' || current === '--output-path') && next) {
      options.outputPath = path.resolve(next);
      index += 1;
      continue;
    }

    if ((current === '--summary-output' || current === '--summary-output-path') && next) {
      options.summaryOutputPath = path.resolve(next);
      index += 1;
      continue;
    }

    if ((current === '--unit' || current === '--unit-id') && next) {
      options.unitId = String(next);
      index += 1;
      continue;
    }

    if ((current === '--round-end' || current === '--rounds') && next) {
      options.roundEnd = parsePositiveInteger(next, current);
      index += 1;
      continue;
    }

    if ((current === '--sbox-model' || current === '--sbox-semantics') && next) {
      options.sboxModel = parseSboxModel(next);
      index += 1;
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
    '  node scripts/cryptanalysis-benchmark/emit-milp-lp.js',
    '  node scripts/cryptanalysis-benchmark/emit-milp-lp.js --output /tmp/present.lp',
    '',
    'Options:',
    '  --instantiation <path>      Model-instantiation JSON',
    '  --primitive-spec <path>     Primitive spec JSON',
    '  --local-semantics <path>    Local semantics JSON',
    '  --output <path>             Output LP file path',
    '  --summary-output <path>     Optional summary JSON path',
    '  --unit-id <id>              Solver unit to emit',
    '  --round-end <n>             Truncate the solver unit to rounds 1..n',
    '  --sbox-model <mode>         PRESENT S-box lane: cdp | ch6 | exact'
  ].join('\n'));
}

function parsePositiveInteger(value, flagName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer for ${flagName}, got: ${value}`);
  }
  return parsed;
}

function parseSboxModel(value) {
  const normalized = String(value).trim().toLowerCase();
  if (normalized !== 'cdp' && normalized !== 'exact' && normalized !== 'ch6') {
    throw new Error(`Expected --sbox-model to be one of "cdp", "exact", or "ch6", got: ${value}`);
  }
  return normalized;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function formatName(pattern, indices) {
  return pattern.replace(/\{([^}]+)\}/g, (match, key) => {
    if (!Object.prototype.hasOwnProperty.call(indices, key)) {
      throw new Error(`Missing index "${key}" for naming pattern ${pattern}`);
    }
    return String(indices[key]);
  });
}

function expandIndexTuples(dimensions) {
  const tuples = [];

  function visit(index, current) {
    if (index >= dimensions.length) {
      tuples.push({ ...current });
      return;
    }

    const dimension = dimensions[index];
    for (let value = dimension.start; value <= dimension.end; value += 1) {
      current[dimension.name] = value;
      visit(index + 1, current);
    }
  }

  visit(0, {});
  return tuples;
}

function buildVariableRegistry(unit, instantiation) {
  const familyById = new Map(instantiation.variable_families.map((family) => [family.family_id, family]));
  const registry = {
    allVariables: [],
    families: new Map(),
    extraVariables: new Set()
  };

  for (const familyId of unit.variable_family_refs) {
    const family = familyById.get(familyId);
    if (!family) {
      throw new Error(`Variable family not found in instantiation: ${familyId}`);
    }

    const tuples = expandIndexTuples(family.index_dimensions);
    const names = tuples.map((indices) => formatName(family.naming_pattern, indices));
    const nameByKey = new Map();

    for (let index = 0; index < tuples.length; index += 1) {
      const key = family.index_dimensions.map((dimension) => `${dimension.name}=${tuples[index][dimension.name]}`).join('|');
      nameByKey.set(key, names[index]);
    }

    registry.families.set(familyId, {
      definition: family,
      tuples,
      names,
      keyOf(indices) {
        return family.index_dimensions.map((dimension) => `${dimension.name}=${indices[dimension.name]}`).join('|');
      },
      get(indices) {
        const key = this.keyOf(indices);
        const name = nameByKey.get(key);
        if (!name) {
          throw new Error(`Variable instance not found for family=${familyId} indices=${JSON.stringify(indices)}`);
        }
        return name;
      }
    });

    registry.allVariables.push(...names);
  }

  return registry;
}

function addExtraBinaryVariable(registry, variable) {
  if (registry.extraVariables.has(variable)) {
    return;
  }
  registry.extraVariables.add(variable);
  registry.allVariables.push(variable);
}

function deriveScopedEmission(instantiation, unit, options) {
  const unitRoundScope = unit.round_scope || {};
  const fromRound = Number(unitRoundScope.from_round);
  const maxRoundEnd = Number(unitRoundScope.to_round);

  if (!Number.isInteger(fromRound) || !Number.isInteger(maxRoundEnd)) {
    throw new Error(`Execution unit is missing an integer round_scope: ${unit.unit_id}`);
  }
  if (fromRound !== 1) {
    throw new Error(`Round truncation currently expects a unit starting at round 1. Got from_round=${fromRound}`);
  }

  const effectiveRoundEnd = options.roundEnd === null ? maxRoundEnd : options.roundEnd;
  if (effectiveRoundEnd < fromRound || effectiveRoundEnd > maxRoundEnd) {
    throw new Error(
      `Requested --round-end ${effectiveRoundEnd} is outside the unit scope ${fromRound}..${maxRoundEnd}`
    );
  }

  const effectiveUpdateEnd = Math.max(0, effectiveRoundEnd - 1);
  const scopedVariableFamilies = instantiation.variable_families.map((family) => {
    const nextFamily = {
      ...family,
      index_dimensions: family.index_dimensions.map((dimension) => ({ ...dimension }))
    };

    for (const dimension of nextFamily.index_dimensions) {
      if (dimension.name === 'round') {
        const scopedRoundEnd = family.family_id === 'state_pre_round'
          ? effectiveRoundEnd + 1
          : effectiveRoundEnd;
        dimension.end = Math.min(Number(dimension.end), scopedRoundEnd);
      }

      if (dimension.name === 'update') {
        dimension.end = Math.min(Number(dimension.end), effectiveUpdateEnd);
      }
    }

    return nextFamily;
  });

  const scopedConstraintBlocks = instantiation.constraint_blocks.map((block) => {
    if (!block.instance_scope) {
      return block;
    }

    const nextBlock = {
      ...block,
      instance_scope: {
        ...block.instance_scope
      }
    };

    if (nextBlock.instance_scope.round_end !== undefined) {
      nextBlock.instance_scope.round_end = Math.min(
        Number(nextBlock.instance_scope.round_end),
        effectiveRoundEnd
      );
    }

    if (nextBlock.instance_scope.update_end !== undefined) {
      nextBlock.instance_scope.update_end = Math.min(
        Number(nextBlock.instance_scope.update_end),
        effectiveUpdateEnd
      );
    }

    return nextBlock;
  });

  const scopedUnit = {
    ...unit,
    round_scope: {
      ...unitRoundScope,
      to_round: effectiveRoundEnd
    },
    boundary_conditions: (unit.boundary_conditions || [])
      .filter((condition) => {
        const selector = condition.selector || {};
        if (selector.round !== undefined) {
          return Number(selector.round) <= effectiveRoundEnd;
        }
        if (selector.update !== undefined) {
          return Number(selector.update) <= effectiveUpdateEnd;
        }
        return true;
      })
      .map((condition) => ({
        ...condition,
        selector: condition.selector ? { ...condition.selector } : condition.selector
      }))
  };

  return {
    instantiation: {
      ...instantiation,
      variable_families: scopedVariableFamilies,
      constraint_blocks: scopedConstraintBlocks
    },
    unit: scopedUnit,
    effectiveRoundEnd,
    effectiveUpdateEnd
  };
}

function getRoundPermutation(primitiveSpec) {
  const permutationOp = primitiveSpec.round_function.ops.find((operation) => operation.op_type === 'permute_bits');
  if (!permutationOp || !permutationOp.params || !Array.isArray(permutationOp.params.mapping)) {
    throw new Error('Primitive spec is missing the round permute_bits mapping');
  }
  return permutationOp.params.mapping;
}

function getKeyRotateParams(primitiveSpec) {
  const rotateOp = (primitiveSpec.key_schedule && primitiveSpec.key_schedule.ops || [])
    .find((operation) => operation.op_type === 'rotate_left');
  if (!rotateOp || !rotateOp.params) {
    throw new Error('Primitive spec is missing the key-schedule rotate_left operation');
  }
  return {
    amount: Number(rotateOp.params.amount),
    widthBits: Number(rotateOp.params.width_bits)
  };
}

function parseHexNibble(value) {
  const parsed = Number.parseInt(String(value), 16);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xF) {
    throw new Error(`Invalid 4-bit S-box entry: ${value}`);
  }
  return parsed;
}

function getPrimarySboxTruthTable(primitiveSpec) {
  const sboxOp = (primitiveSpec.round_function && primitiveSpec.round_function.ops || [])
    .find((operation) => operation.op_type === 'sbox');
  const sboxHex = sboxOp && sboxOp.params && sboxOp.params.sbox_hex;
  if (!Array.isArray(sboxHex) || sboxHex.length !== 16) {
    throw new Error('Primitive spec is missing a 4-bit sbox_hex table');
  }
  return sboxHex.map(parseHexNibble);
}

function computeValidXorDifferentialTransitions(sboxTable) {
  const transitions = [];

  for (let inputDiff = 0; inputDiff < sboxTable.length; inputDiff += 1) {
    const outputs = new Set();
    for (let input = 0; input < sboxTable.length; input += 1) {
      outputs.add(sboxTable[input] ^ sboxTable[input ^ inputDiff]);
    }

    for (const outputDiff of [...outputs].sort((left, right) => left - right)) {
      transitions.push({
        inputDiff,
        outputDiff
      });
    }
  }

  return transitions;
}

function bitVectorFromInteger(value, width) {
  const bits = [];
  for (let index = width - 1; index >= 0; index -= 1) {
    bits.push((value >> index) & 1);
  }
  return bits;
}

function getPresentSelectedConvexHullInequalities() {
  return [
    { label: 'ch6_1', coefficients: [-2, 1, 1, 3, 1, -1, 1, 2], constant: 0 },
    { label: 'ch6_2', coefficients: [1, -2, -3, -2, 1, -4, 3, -3], constant: 10 },
    { label: 'ch6_3', coefficients: [2, -2, 3, -4, -1, -4, -4, 1], constant: 11 },
    { label: 'ch6_4', coefficients: [-1, -2, -2, -1, -1, 2, -1, 0], constant: 6 },
    { label: 'ch6_5', coefficients: [-2, 1, -2, -1, 1, -1, -2, 0], constant: 6 },
    { label: 'ch6_6', coefficients: [2, 1, 1, -3, 1, 2, 1, 2], constant: 0 }
  ];
}

function getRulePackById(localSemantics) {
  const map = new Map();
  map.set(localSemantics.rule_pack_id, localSemantics);
  return map;
}

function formatTerm(coefficient, variable, isFirst) {
  const abs = Math.abs(coefficient);
  const symbol = abs === 1 ? variable : `${abs} ${variable}`;

  if (isFirst) {
    if (coefficient < 0) {
      return `- ${symbol}`;
    }
    return symbol;
  }

  if (coefficient < 0) {
    return `- ${symbol}`;
  }

  return `+ ${symbol}`;
}

function formatLinearExpression(terms) {
  if (!terms || terms.length === 0) {
    return '0';
  }

  return terms
    .filter((term) => term.coefficient !== 0)
    .map((term, index) => formatTerm(term.coefficient, term.variable, index === 0))
    .join(' ');
}

function buildNibbleVariablesForEncryption(registry, familyId, round, sbox) {
  const family = registry.families.get(familyId);
  if (!family) {
    throw new Error(`Unknown family for encryption nibble: ${familyId}`);
  }

  const variables = [];
  // PRESENT defines wi = b4i+3 || b4i+2 || b4i+1 || b4i and the paper
  // states x3/y3 are the least-significant bits, so feed the nibble as MSB..LSB.
  for (let lane = 3; lane >= 0; lane -= 1) {
    variables.push(family.get({
      round,
      bit: 4 * sbox + lane
    }));
  }
  return variables;
}

function buildNibbleVariablesForKeySchedule(registry, familyId, update) {
  const family = registry.families.get(familyId);
  if (!family) {
    throw new Error(`Unknown family for key-schedule nibble: ${familyId}`);
  }

  const variables = [];
  // The key-schedule S-box is applied to k79||k78||k77||k76 with k76 as LSB.
  for (let lane = 79; lane >= 76; lane -= 1) {
    variables.push(family.get({
      update,
      bit: lane
    }));
  }
  return variables;
}

function addConstraint(lines, counters, name, terms, relation, rhs) {
  lines.push(` ${name}: ${formatLinearExpression(terms)} ${relation} ${rhs}`);
  counters.constraintCount += 1;
}

function addEquality(lines, counters, name, leftVariable, rightVariable) {
  addConstraint(lines, counters, name, [
    { coefficient: 1, variable: leftVariable },
    { coefficient: -1, variable: rightVariable }
  ], '=', 0);
}

function emitKeyExtractEquality(lines, counters, registry, block) {
  const sourceFamily = registry.families.get(block.binding_roles.source_register);
  const targetFamily = registry.families.get(block.binding_roles.target_round_key);

  for (let round = block.instance_scope.round_start; round <= block.instance_scope.round_end; round += 1) {
    for (let bit = block.instance_scope.bit_start; bit <= block.instance_scope.bit_end; bit += 1) {
      addEquality(
        lines,
        counters,
        `${block.block_id}_r${round}_b${bit}`,
        targetFamily.get({ round, bit }),
        sourceFamily.get({ round, bit: bit + 16 })
      );
    }
  }
}

function emitXorBitExact(lines, counters, registry, block) {
  const leftFamily = registry.families.get(block.binding_roles.lhs_input);
  const rightFamily = registry.families.get(block.binding_roles.rhs_input);
  const outputFamily = registry.families.get(block.binding_roles.output);
  const dummyFamily = registry.families.get(block.binding_roles.dummy);

  for (let round = block.instance_scope.round_start; round <= block.instance_scope.round_end; round += 1) {
    for (let bit = block.instance_scope.bit_start; bit <= block.instance_scope.bit_end; bit += 1) {
      const prefix = `${block.block_id}_r${round}_b${bit}`;
      const a = leftFamily.get({ round, bit });
      const b = rightFamily.get({ round, bit });
      const c = outputFamily.get({ round, bit });
      const d = dummyFamily.get({ round, bit });

      addConstraint(lines, counters, `${prefix}_cover`, [
        { coefficient: -1, variable: a },
        { coefficient: -1, variable: b },
        { coefficient: -1, variable: c },
        { coefficient: 2, variable: d }
      ], '<=', 0);
      addConstraint(lines, counters, `${prefix}_lhs`, [
        { coefficient: 1, variable: a },
        { coefficient: -1, variable: d }
      ], '<=', 0);
      addConstraint(lines, counters, `${prefix}_rhs`, [
        { coefficient: 1, variable: b },
        { coefficient: -1, variable: d }
      ], '<=', 0);
      addConstraint(lines, counters, `${prefix}_out`, [
        { coefficient: 1, variable: c },
        { coefficient: -1, variable: d }
      ], '<=', 0);
      addConstraint(lines, counters, `${prefix}_upper`, [
        { coefficient: 1, variable: a },
        { coefficient: 1, variable: b },
        { coefficient: 1, variable: c }
      ], '<=', 2);
    }
  }
}

function emitSboxActivity(lines, counters, registry, block) {
  const inputFamilyId = block.binding_roles.input_bits;
  const activityFamily = registry.families.get(block.binding_roles.activity);

  if (block.instance_scope.round_start !== undefined) {
    for (let round = block.instance_scope.round_start; round <= block.instance_scope.round_end; round += 1) {
      for (let sbox = block.instance_scope.sbox_start; sbox <= block.instance_scope.sbox_end; sbox += 1) {
        const activity = activityFamily.get({ round, sbox });
        const inputs = buildNibbleVariablesForEncryption(registry, inputFamilyId, round, sbox);
        const prefix = `${block.block_id}_r${round}_s${sbox}`;

        for (let lane = 0; lane < inputs.length; lane += 1) {
          addConstraint(lines, counters, `${prefix}_lane${lane}`, [
            { coefficient: 1, variable: inputs[lane] },
            { coefficient: -1, variable: activity }
          ], '<=', 0);
        }
        addConstraint(lines, counters, `${prefix}_summary`, [
          { coefficient: -1, variable: inputs[0] },
          { coefficient: -1, variable: inputs[1] },
          { coefficient: -1, variable: inputs[2] },
          { coefficient: -1, variable: inputs[3] },
          { coefficient: 1, variable: activity }
        ], '<=', 0);
      }
    }
    return;
  }

  for (let update = block.instance_scope.update_start; update <= block.instance_scope.update_end; update += 1) {
    const activity = activityFamily.get({ update });
    const inputs = buildNibbleVariablesForKeySchedule(registry, inputFamilyId, update);
    const prefix = `${block.block_id}_u${update}`;

    for (let lane = 0; lane < inputs.length; lane += 1) {
      addConstraint(lines, counters, `${prefix}_lane${lane}`, [
        { coefficient: 1, variable: inputs[lane] },
        { coefficient: -1, variable: activity }
      ], '<=', 0);
    }
    addConstraint(lines, counters, `${prefix}_summary`, [
      { coefficient: -1, variable: inputs[0] },
      { coefficient: -1, variable: inputs[1] },
      { coefficient: -1, variable: inputs[2] },
      { coefficient: -1, variable: inputs[3] },
      { coefficient: 1, variable: activity }
    ], '<=', 0);
  }
}

function emitSboxBijective(lines, counters, registry, block) {
  const inputFamilyId = block.binding_roles.input_bits;
  const outputFamilyId = block.binding_roles.output_bits;

  if (block.instance_scope.round_start !== undefined) {
    for (let round = block.instance_scope.round_start; round <= block.instance_scope.round_end; round += 1) {
      for (let sbox = block.instance_scope.sbox_start; sbox <= block.instance_scope.sbox_end; sbox += 1) {
        const inputs = buildNibbleVariablesForEncryption(registry, inputFamilyId, round, sbox);
        const outputs = buildNibbleVariablesForEncryption(registry, outputFamilyId, round, sbox);
        const prefix = `${block.block_id}_r${round}_s${sbox}`;

        addConstraint(lines, counters, `${prefix}_forward`, [
          { coefficient: 1, variable: inputs[0] },
          { coefficient: 1, variable: inputs[1] },
          { coefficient: 1, variable: inputs[2] },
          { coefficient: 1, variable: inputs[3] },
          { coefficient: -4, variable: outputs[0] },
          { coefficient: -4, variable: outputs[1] },
          { coefficient: -4, variable: outputs[2] },
          { coefficient: -4, variable: outputs[3] }
        ], '<=', 0);
        addConstraint(lines, counters, `${prefix}_backward`, [
          { coefficient: 1, variable: outputs[0] },
          { coefficient: 1, variable: outputs[1] },
          { coefficient: 1, variable: outputs[2] },
          { coefficient: 1, variable: outputs[3] },
          { coefficient: -4, variable: inputs[0] },
          { coefficient: -4, variable: inputs[1] },
          { coefficient: -4, variable: inputs[2] },
          { coefficient: -4, variable: inputs[3] }
        ], '<=', 0);
      }
    }
    return;
  }

  for (let update = block.instance_scope.update_start; update <= block.instance_scope.update_end; update += 1) {
    const inputs = buildNibbleVariablesForKeySchedule(registry, inputFamilyId, update);
    const outputs = buildNibbleVariablesForKeySchedule(registry, outputFamilyId, update);
    const prefix = `${block.block_id}_u${update}`;

    addConstraint(lines, counters, `${prefix}_forward`, [
      { coefficient: 1, variable: inputs[0] },
      { coefficient: 1, variable: inputs[1] },
      { coefficient: 1, variable: inputs[2] },
      { coefficient: 1, variable: inputs[3] },
      { coefficient: -4, variable: outputs[0] },
      { coefficient: -4, variable: outputs[1] },
      { coefficient: -4, variable: outputs[2] },
      { coefficient: -4, variable: outputs[3] }
    ], '<=', 0);
    addConstraint(lines, counters, `${prefix}_backward`, [
      { coefficient: 1, variable: outputs[0] },
      { coefficient: 1, variable: outputs[1] },
      { coefficient: 1, variable: outputs[2] },
      { coefficient: 1, variable: outputs[3] },
      { coefficient: -4, variable: inputs[0] },
      { coefficient: -4, variable: inputs[1] },
      { coefficient: -4, variable: inputs[2] },
      { coefficient: -4, variable: inputs[3] }
    ], '<=', 0);
  }
}

function emitSboxValidCuttingOff(lines, counters, registry, block, rulePacks) {
  const inputFamilyId = block.binding_roles.input_bits;
  const outputFamilyId = block.binding_roles.output_bits;
  const packId = (block.local_rule_pack_refs || [])[0];
  const rulePack = rulePacks.get(packId);
  if (!rulePack) {
    throw new Error(`Local rule pack not loaded for block ${block.block_id}: ${packId}`);
  }

  const inequalities = [];
  for (const group of rulePack.rule_groups) {
    inequalities.push(...group.inequalities);
  }

  function emitInstance(prefix, inputs, outputs) {
    for (const inequality of inequalities) {
      const terms = [];
      for (const [name, coefficient] of Object.entries(inequality.coefficients)) {
        let variable;
        if (/^x[0-3]$/.test(name)) {
          variable = inputs[Number(name.slice(1))];
        } else if (/^y[0-3]$/.test(name)) {
          variable = outputs[Number(name.slice(1))];
        } else {
          throw new Error(`Unsupported local-semantics variable name: ${name}`);
        }
        terms.push({ coefficient, variable });
      }
      addConstraint(
        lines,
        counters,
        `${prefix}_${inequality.label}`,
        terms,
        inequality.relation,
        -Number(inequality.constant)
      );
    }
  }

  if (block.instance_scope.round_start !== undefined) {
    for (let round = block.instance_scope.round_start; round <= block.instance_scope.round_end; round += 1) {
      for (let sbox = block.instance_scope.sbox_start; sbox <= block.instance_scope.sbox_end; sbox += 1) {
        emitInstance(
          `${block.block_id}_r${round}_s${sbox}`,
          buildNibbleVariablesForEncryption(registry, inputFamilyId, round, sbox),
          buildNibbleVariablesForEncryption(registry, outputFamilyId, round, sbox)
        );
      }
    }
    return;
  }

  for (let update = block.instance_scope.update_start; update <= block.instance_scope.update_end; update += 1) {
    emitInstance(
      `${block.block_id}_u${update}`,
      buildNibbleVariablesForKeySchedule(registry, inputFamilyId, update),
      buildNibbleVariablesForKeySchedule(registry, outputFamilyId, update)
    );
  }
}

function emitExactSboxTransitions(lines, counters, registry, block, validTransitions) {
  const inputFamilyId = block.binding_roles.input_bits;
  const outputFamilyId = block.binding_roles.output_bits;
  const activityFamily = block.binding_roles.activity
    ? registry.families.get(block.binding_roles.activity)
    : null;

  function emitInstance(prefix, inputs, outputs, activity) {
    const selectorVariables = validTransitions.map(({ inputDiff, outputDiff }) => {
      const selector = `${prefix}_t_i${inputDiff.toString(16)}_o${outputDiff.toString(16)}`;
      addExtraBinaryVariable(registry, selector);
      return selector;
    });

    addConstraint(
      lines,
      counters,
      `${prefix}_transition_onehot`,
      selectorVariables.map((variable) => ({ coefficient: 1, variable })),
      '=',
      1
    );

    for (let bitIndex = 0; bitIndex < inputs.length; bitIndex += 1) {
      const inputTerms = [{ coefficient: 1, variable: inputs[bitIndex] }];
      const outputTerms = [{ coefficient: 1, variable: outputs[bitIndex] }];

      for (let transitionIndex = 0; transitionIndex < validTransitions.length; transitionIndex += 1) {
        const selector = selectorVariables[transitionIndex];
        const inputBits = bitVectorFromInteger(validTransitions[transitionIndex].inputDiff, inputs.length);
        const outputBits = bitVectorFromInteger(validTransitions[transitionIndex].outputDiff, outputs.length);

        if (inputBits[bitIndex] === 1) {
          inputTerms.push({ coefficient: -1, variable: selector });
        }
        if (outputBits[bitIndex] === 1) {
          outputTerms.push({ coefficient: -1, variable: selector });
        }
      }

      addConstraint(lines, counters, `${prefix}_input_bit${bitIndex}`, inputTerms, '=', 0);
      addConstraint(lines, counters, `${prefix}_output_bit${bitIndex}`, outputTerms, '=', 0);
    }

    if (activity) {
      const activityTerms = [{ coefficient: 1, variable: activity }];
      for (let transitionIndex = 0; transitionIndex < validTransitions.length; transitionIndex += 1) {
        if (validTransitions[transitionIndex].inputDiff !== 0) {
          activityTerms.push({
            coefficient: -1,
            variable: selectorVariables[transitionIndex]
          });
        }
      }
      addConstraint(lines, counters, `${prefix}_activity_exact`, activityTerms, '=', 0);
    }
  }

  if (block.instance_scope.round_start !== undefined) {
    for (let round = block.instance_scope.round_start; round <= block.instance_scope.round_end; round += 1) {
      for (let sbox = block.instance_scope.sbox_start; sbox <= block.instance_scope.sbox_end; sbox += 1) {
        emitInstance(
          `${block.block_id}_r${round}_s${sbox}`,
          buildNibbleVariablesForEncryption(registry, inputFamilyId, round, sbox),
          buildNibbleVariablesForEncryption(registry, outputFamilyId, round, sbox),
          activityFamily ? activityFamily.get({ round, sbox }) : ''
        );
      }
    }
    return;
  }

  for (let update = block.instance_scope.update_start; update <= block.instance_scope.update_end; update += 1) {
    emitInstance(
      `${block.block_id}_u${update}`,
      buildNibbleVariablesForKeySchedule(registry, inputFamilyId, update),
      buildNibbleVariablesForKeySchedule(registry, outputFamilyId, update),
      activityFamily ? activityFamily.get({ update }) : ''
    );
  }
}

function emitPresentSelectedConvexHull(lines, counters, registry, block) {
  const inputFamilyId = block.binding_roles.input_bits;
  const outputFamilyId = block.binding_roles.output_bits;
  const inequalities = getPresentSelectedConvexHullInequalities();

  function emitInstance(prefix, inputs, outputs) {
    for (const inequality of inequalities) {
      const variables = [...inputs, ...outputs];
      const terms = variables.map((variable, index) => ({
        coefficient: inequality.coefficients[index],
        variable
      }));
      addConstraint(
        lines,
        counters,
        `${prefix}_${inequality.label}`,
        terms,
        '>=',
        -inequality.constant
      );
    }
  }

  if (block.instance_scope.round_start !== undefined) {
    for (let round = block.instance_scope.round_start; round <= block.instance_scope.round_end; round += 1) {
      for (let sbox = block.instance_scope.sbox_start; sbox <= block.instance_scope.sbox_end; sbox += 1) {
        emitInstance(
          `${block.block_id}_r${round}_s${sbox}`,
          buildNibbleVariablesForEncryption(registry, inputFamilyId, round, sbox),
          buildNibbleVariablesForEncryption(registry, outputFamilyId, round, sbox)
        );
      }
    }
    return;
  }

  for (let update = block.instance_scope.update_start; update <= block.instance_scope.update_end; update += 1) {
    emitInstance(
      `${block.block_id}_u${update}`,
      buildNibbleVariablesForKeySchedule(registry, inputFamilyId, update),
      buildNibbleVariablesForKeySchedule(registry, outputFamilyId, update)
    );
  }
}

function emitPermutationEquality(lines, counters, registry, block, permutation) {
  const sourceFamily = registry.families.get(block.binding_roles.source_bits);
  const targetFamily = registry.families.get(block.binding_roles.target_bits);

  for (let round = block.instance_scope.round_start; round <= block.instance_scope.round_end; round += 1) {
    for (let bit = block.instance_scope.bit_start; bit <= block.instance_scope.bit_end; bit += 1) {
      addEquality(
        lines,
        counters,
        `${block.block_id}_r${round}_b${bit}`,
        targetFamily.get({ round: round + 1, bit: permutation[bit] }),
        sourceFamily.get({ round, bit })
      );
    }
  }
}

function emitRotationEquality(lines, counters, registry, block, rotateParams) {
  const sourceFamily = registry.families.get(block.binding_roles.source_register);
  const targetFamily = registry.families.get(block.binding_roles.target_register);

  for (let update = block.instance_scope.update_start; update <= block.instance_scope.update_end; update += 1) {
    for (let bit = block.instance_scope.bit_start; bit <= block.instance_scope.bit_end; bit += 1) {
      addEquality(
        lines,
        counters,
        `${block.block_id}_u${update}_b${bit}`,
        targetFamily.get({ update, bit: (bit + rotateParams.amount) % rotateParams.widthBits }),
        sourceFamily.get({ round: update, bit })
      );
    }
  }
}

function emitRegisterCopyEquality(lines, counters, registry, block) {
  const sourceFamily = registry.families.get(block.binding_roles.source_register);
  const targetFamily = registry.families.get(block.binding_roles.target_register);

  for (let update = block.instance_scope.update_start; update <= block.instance_scope.update_end; update += 1) {
    for (let bit = block.instance_scope.bit_start; bit <= block.instance_scope.bit_end; bit += 1) {
      addEquality(
        lines,
        counters,
        `${block.block_id}_u${update}_b${bit}`,
        targetFamily.get({ update, bit }),
        sourceFamily.get({ update, bit })
      );
    }
  }
}

function emitConstantXorInvariance(lines, counters, registry, block) {
  const sourceFamily = registry.families.get(block.binding_roles.source_register);
  const targetFamily = registry.families.get(block.binding_roles.target_register);

  for (let update = block.instance_scope.update_start; update <= block.instance_scope.update_end; update += 1) {
    for (let bit = block.instance_scope.bit_start; bit <= block.instance_scope.bit_end; bit += 1) {
      addEquality(
        lines,
        counters,
        `${block.block_id}_u${update}_b${bit}`,
        targetFamily.get({ round: update + 1, bit }),
        sourceFamily.get({ update, bit })
      );
    }
  }
}

function emitBoundaryConditions(lines, counters, registry, unit) {
  for (const condition of unit.boundary_conditions || []) {
    if (condition.condition_type !== 'nonzero_sum') {
      throw new Error(`Unsupported boundary condition type: ${condition.condition_type}`);
    }

    const family = registry.families.get(condition.variable_family_ref);
    if (!family) {
      throw new Error(`Boundary condition references unknown family: ${condition.variable_family_ref}`);
    }

    const selector = condition.selector || {};
    const terms = [];
    const rangeKey = selector.round !== undefined ? 'round' : selector.update !== undefined ? 'update' : '';
    const fixedScope = rangeKey ? selector[rangeKey] : undefined;
    const bitStart = selector.bit_start !== undefined ? selector.bit_start : 0;
    const bitEnd = selector.bit_end !== undefined ? selector.bit_end : 0;

    for (let bit = bitStart; bit <= bitEnd; bit += 1) {
      const indices = { bit };
      if (rangeKey) {
        indices[rangeKey] = fixedScope;
      }
      terms.push({
        coefficient: 1,
        variable: family.get(indices)
      });
    }

    addConstraint(lines, counters, condition.condition_id, terms, condition.relation, Number(condition.value));
  }
}

function buildObjective(unit, registry) {
  const terms = [];

  for (const termRef of unit.objective.term_refs) {
    const family = registry.families.get(termRef.variable_family_ref);
    if (!family) {
      throw new Error(`Objective references unknown variable family: ${termRef.variable_family_ref}`);
    }

    for (const variable of family.names) {
      terms.push({ coefficient: 1, variable });
    }
  }

  return terms;
}

function emitUnitToLp(options) {
  const sourceInstantiation = readJson(options.instantiationPath);
  const primitiveSpec = readJson(options.primitiveSpecPath);
  const localSemantics = readJson(options.localSemanticsPath);

  const sourceUnit = (sourceInstantiation.execution_units || [])
    .find((candidate) => candidate.unit_id === options.unitId);
  if (!sourceUnit) {
    throw new Error(`Execution unit not found: ${options.unitId}`);
  }
  if (sourceUnit.unit_kind !== 'solver_model') {
    throw new Error(`Only solver_model units can be emitted to LP. Got: ${sourceUnit.unit_kind}`);
  }

  const {
    instantiation,
    unit,
    effectiveRoundEnd,
    effectiveUpdateEnd
  } = deriveScopedEmission(sourceInstantiation, sourceUnit, options);

  const registry = buildVariableRegistry(unit, instantiation);
  const permutation = getRoundPermutation(primitiveSpec);
  const rotateParams = getKeyRotateParams(primitiveSpec);
  const rulePacks = getRulePackById(localSemantics);
  const validSboxTransitions = options.sboxModel === 'exact'
    ? computeValidXorDifferentialTransitions(getPrimarySboxTruthTable(primitiveSpec))
    : [];

  const counters = {
    constraintCount: 0
  };
  const constraintLines = [];
  const blockById = new Map(instantiation.constraint_blocks.map((block) => [block.block_id, block]));

  for (const blockId of unit.constraint_block_refs) {
    const block = blockById.get(blockId);
    if (!block) {
      throw new Error(`Constraint block not found: ${blockId}`);
    }

    switch (block.family) {
      case 'key_extract_equality':
        emitKeyExtractEquality(constraintLines, counters, registry, block);
        break;
      case 'xor_bit_exact':
        emitXorBitExact(constraintLines, counters, registry, block);
        break;
      case 'sbox_activity_input_nonzero':
        emitSboxActivity(constraintLines, counters, registry, block);
        break;
      case 'sbox_bijective_nonzero':
        emitSboxBijective(constraintLines, counters, registry, block);
        break;
      case 'sbox_valid_cutting_off':
        if (options.sboxModel === 'exact') {
          emitExactSboxTransitions(constraintLines, counters, registry, block, validSboxTransitions);
        } else {
          emitSboxValidCuttingOff(constraintLines, counters, registry, block, rulePacks);
          if (options.sboxModel === 'ch6') {
            emitPresentSelectedConvexHull(constraintLines, counters, registry, block);
          }
        }
        break;
      case 'permutation_equality':
        emitPermutationEquality(constraintLines, counters, registry, block, permutation);
        break;
      case 'rotation_equality':
        emitRotationEquality(constraintLines, counters, registry, block, rotateParams);
        break;
      case 'register_copy_equality':
        emitRegisterCopyEquality(constraintLines, counters, registry, block);
        break;
      case 'constant_xor_invariance_copy':
        emitConstantXorInvariance(constraintLines, counters, registry, block);
        break;
      default:
        throw new Error(`Unsupported constraint block family: ${block.family}`);
    }
  }

  emitBoundaryConditions(constraintLines, counters, registry, unit);

  const objectiveTerms = buildObjective(unit, registry);
  const lpLines = [
    'Minimize',
    ` obj: ${formatLinearExpression(objectiveTerms)}`,
    'Subject To',
    ...constraintLines,
    'Binary',
    ...registry.allVariables.map((variable) => ` ${variable}`),
    'End',
    ''
  ];

  ensureParentDir(options.outputPath);
  fs.writeFileSync(options.outputPath, lpLines.join('\n'), 'utf8');

  const summary = {
    instantiationId: instantiation.instantiation_id,
    unitId: unit.unit_id,
    outputPath: options.outputPath,
    variableCount: registry.allVariables.length,
    binaryCount: registry.allVariables.length,
    objectiveTermCount: objectiveTerms.length,
    constraintCount: counters.constraintCount,
    primitiveId: instantiation.target_primitive_id,
    attackId: instantiation.target_attack_id,
    effectiveRoundEnd,
    effectiveUpdateEnd,
    sboxModel: options.sboxModel,
    generatedAt: new Date().toISOString()
  };

  if (options.summaryOutputPath) {
    ensureParentDir(options.summaryOutputPath);
    fs.writeFileSync(options.summaryOutputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  }

  return summary;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const summary = emitUnitToLp(options);
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main();
} else {
  module.exports = {
    emitUnitToLp
  };
}
