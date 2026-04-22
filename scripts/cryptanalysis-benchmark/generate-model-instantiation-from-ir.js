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

const DEFAULT_STRUCTURAL_IR_PATH = path.join(
  DEFAULT_TRIAL_DIR,
  'structural-ir.present80.r5.v0.json'
);
const DEFAULT_SEMANTIC_ATTACHMENT_PATH = path.join(
  DEFAULT_TRIAL_DIR,
  'semantic-attachment.present80.r5.v0.json'
);
const DEFAULT_PRIMITIVE_SPEC_PATH = path.join(
  DEFAULT_TRIAL_DIR,
  'primitive-spec.present80.full.json'
);
const DEFAULT_OUTPUT_PATH = path.join(
  DEFAULT_TRIAL_DIR,
  'model-instantiation.present80.r5.v0.json'
);

const CHECKPOINT_EXPECTATIONS = new Map([
  [4, {
    expectedValue: 2,
    paperLocation: 'Appendix A.1, Table 4',
    expectedClaim: 'Table 4 reports that the minimum number of active S-boxes for 4-round PRESENT-80 is 2.'
  }],
  [5, {
    expectedValue: 3,
    paperLocation: 'Appendix A.1, Table 4',
    expectedClaim: 'Table 4 reports that the minimum number of active S-boxes for 5-round PRESENT-80 is 3.'
  }],
  [6, {
    expectedValue: 5,
    paperLocation: 'Appendix A.1, Table 4',
    expectedClaim: 'Table 4 reports that the minimum number of active S-boxes for 6-round PRESENT-80 is 5.'
  }],
  [12, {
    expectedValue: 16,
    paperLocation: 'Appendix A.1, Table 4 and the concluding paragraph immediately below it',
    expectedClaim: 'Appendix A.1 claims that any 12 consecutive rounds of PRESENT-80 have at least 16 active S-boxes.'
  }]
]);

function parseArgs(argv) {
  const options = {
    structuralIrPath: DEFAULT_STRUCTURAL_IR_PATH,
    semanticAttachmentPath: DEFAULT_SEMANTIC_ATTACHMENT_PATH,
    primitiveSpecPath: DEFAULT_PRIMITIVE_SPEC_PATH,
    outputPath: DEFAULT_OUTPUT_PATH,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if ((current === '--structural-ir' || current === '--structural-ir-path') && next) {
      options.structuralIrPath = path.resolve(next);
      index += 1;
      continue;
    }

    if ((current === '--semantic-attachment' || current === '--semantic-attachment-path') && next) {
      options.semanticAttachmentPath = path.resolve(next);
      index += 1;
      continue;
    }

    if ((current === '--primitive-spec' || current === '--primitive-spec-path') && next) {
      options.primitiveSpecPath = path.resolve(next);
      index += 1;
      continue;
    }

    if ((current === '--output' || current === '--output-path') && next) {
      options.outputPath = path.resolve(next);
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
    '  node scripts/cryptanalysis-benchmark/generate-model-instantiation-from-ir.js',
    '',
    'Options:',
    '  --structural-ir <path>         Structural IR JSON',
    '  --semantic-attachment <path>   Semantic attachment JSON',
    '  --primitive-spec <path>        Primitive spec JSON',
    '  --output <path>                Output model-instantiation JSON path'
  ].join('\n'));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function relativeToRoot(targetPath) {
  if (!targetPath) {
    return '';
  }
  return path.relative(ROOT_DIR, targetPath);
}

function getRoundTargets(structuralIr) {
  const context = structuralIr.analysis_context || {};
  const start = Number(context.target_round_start);
  const end = Number(context.target_round_end);

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
    throw new Error('Structural IR is missing a valid target_round_start/target_round_end scope.');
  }

  if (start !== 1) {
    throw new Error(`Only round scopes starting at 1 are currently supported. Got start=${start}.`);
  }

  return {
    roundStart: start,
    roundEnd: end,
    updateEnd: Math.max(0, end - 1)
  };
}

function getTemplateMap(structuralIr) {
  const templates = new Map();
  for (const template of structuralIr.operator_templates || []) {
    templates.set(template.template_id, template);
  }
  return templates;
}

function expectTemplate(templateMap, templateId, expectedOpType) {
  const template = templateMap.get(templateId);
  if (!template) {
    throw new Error(`Required operator template not found: ${templateId}`);
  }
  if (template.op_type !== expectedOpType) {
    throw new Error(
      `Template ${templateId} expected op_type=${expectedOpType}, got ${template.op_type || '(missing)'}`
    );
  }
  return template;
}

function getAttachmentMap(semanticAttachment) {
  const entries = new Map();
  for (const entry of semanticAttachment.template_attachments || []) {
    const key = `${entry.template_ref}:${entry.requirement_slot_id}`;
    entries.set(key, entry);
  }
  return entries;
}

function expectResolvedAttachment(attachmentMap, templateRef, slotId) {
  const key = `${templateRef}:${slotId}`;
  const entry = attachmentMap.get(key);
  if (!entry) {
    throw new Error(`Required semantic attachment not found: ${key}`);
  }
  if (entry.resolution_status !== 'resolved') {
    throw new Error(`Semantic attachment is not resolved: ${key}`);
  }
  if (!entry.selected_rule_pack_ref) {
    throw new Error(`Semantic attachment is missing selected_rule_pack_ref: ${key}`);
  }
  return entry;
}

function validatePrimitiveSpec(primitiveSpec) {
  if (primitiveSpec.primitive_id !== 'present80') {
    throw new Error(`Only primitive_id=present80 is currently supported. Got ${primitiveSpec.primitive_id || '(missing)'}`);
  }

  if (primitiveSpec.block_size_bits !== 64 || primitiveSpec.key_size_bits !== 80) {
    throw new Error('The current lowering only supports PRESENT-80 with block_size_bits=64 and key_size_bits=80.');
  }

  const roundOps = Array.isArray(primitiveSpec.round_function?.ops)
    ? primitiveSpec.round_function.ops
    : [];
  const keyOps = Array.isArray(primitiveSpec.key_schedule?.ops)
    ? primitiveSpec.key_schedule.ops
    : [];

  const player = roundOps.find((operation) => operation.op_type === 'permute_bits');
  const sbox = roundOps.find((operation) => operation.op_type === 'sbox');
  const rotate = keyOps.find((operation) => operation.op_type === 'rotate_left');
  const keySbox = keyOps.find((operation) => operation.op_type === 'sbox');

  if (!player || !Array.isArray(player.params?.mapping) || player.params.mapping.length !== 64) {
    throw new Error('Primitive spec is missing the 64-bit PRESENT pLayer mapping.');
  }

  if (!sbox || Number(sbox.params?.parallel_count) !== 16 || Number(sbox.params?.nibble_width_bits) !== 4) {
    throw new Error('Primitive spec is missing the expected PRESENT 16x4-bit round S-box description.');
  }

  if (!rotate || Number(rotate.params?.amount) !== 61 || Number(rotate.params?.width_bits) !== 80) {
    throw new Error('Primitive spec is missing the expected PRESENT key-schedule rotate_left(61) operation.');
  }

  if (!keySbox || Number(keySbox.params?.nibble_width_bits) !== 4) {
    throw new Error('Primitive spec is missing the expected PRESENT key-schedule S-box operation.');
  }
}

function validateSupportedLane(structuralIr, semanticAttachment, primitiveSpec) {
  const context = structuralIr.analysis_context || {};

  if (structuralIr.ir_id !== semanticAttachment.source_structural_ir_id) {
    throw new Error(
      `Semantic attachment source_structural_ir_id does not match structural IR. `
      + `expected ${structuralIr.ir_id}, got ${semanticAttachment.source_structural_ir_id || '(missing)'}`
    );
  }

  if (context.primitive_id !== 'present80') {
    throw new Error(`Only primitive_id=present80 is currently supported. Got ${context.primitive_id || '(missing)'}`);
  }

  if (context.attack_family !== 'related_key_differential') {
    throw new Error(
      `Only attack_family=related_key_differential is currently supported. Got ${context.attack_family || '(missing)'}`
    );
  }

  if (context.semantic_domain !== 'xor_differential') {
    throw new Error(
      `Only semantic_domain=xor_differential is currently supported. Got ${context.semantic_domain || '(missing)'}`
    );
  }

  if (context.granularity !== 'bit') {
    throw new Error(`Only bit-level IR is currently supported. Got ${context.granularity || '(missing)'}`);
  }

  if (semanticAttachment.resolution_summary?.ready_for_model_instantiation !== true) {
    throw new Error('Semantic attachment is not ready_for_model_instantiation.');
  }

  validatePrimitiveSpec(primitiveSpec);

  const templateMap = getTemplateMap(structuralIr);
  expectTemplate(templateMap, 'extract_round_key', 'extract_bits');
  expectTemplate(templateMap, 'enc_add_round_key', 'key_add');
  expectTemplate(templateMap, 'enc_sbox_layer', 'sbox');
  expectTemplate(templateMap, 'enc_player', 'permute_bits');
  expectTemplate(templateMap, 'ks_rotate_left_61', 'rotate_left');
  expectTemplate(templateMap, 'ks_top_nibble_sbox', 'sbox');
  expectTemplate(templateMap, 'ks_add_round_counter', 'xor');

  const attachmentMap = getAttachmentMap(semanticAttachment);
  const encSboxAttachment = expectResolvedAttachment(attachmentMap, 'enc_sbox_layer', 'enc_sbox_activity');
  const keySboxAttachment = expectResolvedAttachment(attachmentMap, 'ks_top_nibble_sbox', 'ks_sbox_related_key');

  return {
    encSboxAttachment,
    keySboxAttachment
  };
}

function buildSourceRefs(structuralIr, semanticAttachment, primitiveSpec) {
  const refs = Array.isArray(primitiveSpec.source_refs)
    ? primitiveSpec.source_refs.map((entry) => ({ ...entry }))
    : [];

  refs.push({
    kind: 'note',
    label: 'Structural IR input',
    location: structuralIr.ir_id
  });
  refs.push({
    kind: 'note',
    label: 'Semantic attachment input',
    location: semanticAttachment.attachment_id
  });

  return refs;
}

function buildVariableFamilies(roundEnd, updateEnd) {
  const families = [
    {
      family_id: 'state_pre_round',
      variable_kind: 'difference_bit',
      binary: true,
      naming_pattern: 's_r{round}_b{bit}',
      index_dimensions: [
        { name: 'round', start: 1, end: roundEnd + 1 },
        { name: 'bit', start: 0, end: 63 }
      ],
      semantic_role: 'Bit-level XOR-difference variables for the encryption state at the input boundary of each modeled round.'
    },
    {
      family_id: 'state_after_ark',
      variable_kind: 'difference_bit',
      binary: true,
      naming_pattern: 'sa_r{round}_b{bit}',
      index_dimensions: [
        { name: 'round', start: 1, end: roundEnd },
        { name: 'bit', start: 0, end: 63 }
      ],
      semantic_role: 'Bit-level state difference immediately after addRoundKey in each modeled round.'
    },
    {
      family_id: 'state_after_sbox',
      variable_kind: 'difference_bit',
      binary: true,
      naming_pattern: 'ss_r{round}_b{bit}',
      index_dimensions: [
        { name: 'round', start: 1, end: roundEnd },
        { name: 'bit', start: 0, end: 63 }
      ],
      semantic_role: 'Bit-level state difference immediately after the 16 parallel encryption S-boxes in each modeled round.'
    },
    {
      family_id: 'round_key_bits',
      variable_kind: 'difference_bit',
      binary: true,
      naming_pattern: 'rk_r{round}_b{bit}',
      index_dimensions: [
        { name: 'round', start: 1, end: roundEnd },
        { name: 'bit', start: 0, end: 63 }
      ],
      semantic_role: 'Bit-level XOR differences of round keys K1 through the task-scoped final round.'
    },
    {
      family_id: 'key_reg_pre_round',
      variable_kind: 'difference_bit',
      binary: true,
      naming_pattern: 'k_r{round}_b{bit}',
      index_dimensions: [
        { name: 'round', start: 1, end: roundEnd },
        { name: 'bit', start: 0, end: 79 }
      ],
      semantic_role: 'Bit-level XOR differences of the 80-bit key register before round-key extraction in each modeled round.'
    }
  ];

  if (updateEnd >= 1) {
    families.push(
      {
        family_id: 'key_reg_after_rotate',
        variable_kind: 'difference_bit',
        binary: true,
        naming_pattern: 'kr_u{update}_b{bit}',
        index_dimensions: [
          { name: 'update', start: 1, end: updateEnd },
          { name: 'bit', start: 0, end: 79 }
        ],
        semantic_role: 'Bit-level XOR differences after the key register is rotated left by 61 in each modeled update.'
      },
      {
        family_id: 'key_reg_after_sbox',
        variable_kind: 'difference_bit',
        binary: true,
        naming_pattern: 'ks_u{update}_b{bit}',
        index_dimensions: [
          { name: 'update', start: 1, end: updateEnd },
          { name: 'bit', start: 0, end: 79 }
        ],
        semantic_role: 'Bit-level XOR differences after the top nibble of the rotated key register passes through the PRESENT S-box.'
      },
      {
        family_id: 'ks_sbox_active',
        variable_kind: 'activity_marker',
        binary: true,
        naming_pattern: 'ak_u{update}',
        index_dimensions: [
          { name: 'update', start: 1, end: updateEnd }
        ],
        semantic_role: 'Activity markers for the single key-schedule S-box in each modeled update.'
      }
    );
  }

  families.push(
    {
      family_id: 'ark_xor_dummy',
      variable_kind: 'xor_dummy',
      binary: true,
      naming_pattern: 'dx_r{round}_b{bit}',
      index_dimensions: [
        { name: 'round', start: 1, end: roundEnd },
        { name: 'bit', start: 0, end: 63 }
      ],
      semantic_role: 'Bit-level dummy variables used by the XOR exactness constraints for addRoundKey.'
    },
    {
      family_id: 'enc_sbox_active',
      variable_kind: 'activity_marker',
      binary: true,
      naming_pattern: 'ae_r{round}_s{sbox}',
      index_dimensions: [
        { name: 'round', start: 1, end: roundEnd },
        { name: 'sbox', start: 0, end: 15 }
      ],
      semantic_role: 'Activity markers for the 16 encryption S-box instances in each modeled round.'
    }
  );

  return families;
}

function buildConstraintBlocks(unitId, roundEnd, updateEnd, encRulePackId, keyRulePackId) {
  const blocks = [
    {
      block_id: 'extract_round_keys',
      family: 'key_extract_equality',
      applies_to_unit_ids: [unitId],
      binding_roles: {
        source_register: 'key_reg_pre_round',
        target_round_key: 'round_key_bits'
      },
      instance_scope: {
        round_start: 1,
        round_end: roundEnd,
        bit_start: 0,
        bit_end: 63
      },
      index_mapping: {
        source_round: 'round',
        source_bit: 'bit + 16',
        target_round: 'round',
        target_bit: 'bit'
      },
      semantic_summary: 'Extract the left-most 64 bits of the PRESENT-80 key register as the round key for each modeled round.'
    },
    {
      block_id: 'encryption_addroundkey_xor',
      family: 'xor_bit_exact',
      applies_to_unit_ids: [unitId],
      binding_roles: {
        lhs_input: 'state_pre_round',
        rhs_input: 'round_key_bits',
        output: 'state_after_ark',
        dummy: 'ark_xor_dummy'
      },
      instance_scope: {
        round_start: 1,
        round_end: roundEnd,
        bit_start: 0,
        bit_end: 63
      },
      paper_equation_refs: [
        'Eq. (1)',
        'Sect. 2.2 bit-level upper bound a + b + c <= 2'
      ],
      semantic_summary: 'Apply exact bit-level XOR propagation constraints to each addRoundKey bit.'
    },
    {
      block_id: 'encryption_sbox_activity',
      family: 'sbox_activity_input_nonzero',
      applies_to_unit_ids: [unitId],
      binding_roles: {
        input_bits: 'state_after_ark',
        activity: 'enc_sbox_active'
      },
      instance_scope: {
        round_start: 1,
        round_end: roundEnd,
        sbox_start: 0,
        sbox_end: 15
      },
      index_mapping: {
        round: 'round',
        input_bit: '4 * sbox + lane',
        activity_index: 'round,sbox'
      },
      paper_equation_refs: [
        'Eq. (3)'
      ],
      semantic_summary: 'Mark an encryption S-box active iff its 4-bit input difference is nonzero.'
    },
    {
      block_id: 'encryption_sbox_bijective_link',
      family: 'sbox_bijective_nonzero',
      applies_to_unit_ids: [unitId],
      binding_roles: {
        input_bits: 'state_after_ark',
        output_bits: 'state_after_sbox'
      },
      instance_scope: {
        round_start: 1,
        round_end: roundEnd,
        sbox_start: 0,
        sbox_end: 15
      },
      index_mapping: {
        round: 'round',
        input_bit: '4 * sbox + lane',
        output_bit: '4 * sbox + lane'
      },
      paper_equation_refs: [
        'Eq. (4)'
      ],
      semantic_summary: 'Impose bijective nonzero-input/nonzero-output coupling for each 4x4 encryption S-box.',
      notes: 'Eq. (5) is intentionally omitted because the PRESENT S-box is bijective with branch number 2.'
    },
    {
      block_id: 'encryption_sbox_cdp',
      family: 'sbox_valid_cutting_off',
      applies_to_unit_ids: [unitId],
      binding_roles: {
        input_bits: 'state_after_ark',
        output_bits: 'state_after_sbox',
        activity: 'enc_sbox_active'
      },
      instance_scope: {
        round_start: 1,
        round_end: roundEnd,
        sbox_start: 0,
        sbox_end: 15
      },
      index_mapping: {
        round: 'round',
        input_bit: '4 * sbox + lane',
        output_bit: '4 * sbox + lane'
      },
      local_rule_pack_refs: [
        encRulePackId
      ],
      paper_equation_refs: [
        'Fact 1',
        'Fact 2',
        'Eqs. (7) to (10)'
      ],
      semantic_summary: 'Instantiate the attached PRESENT S-box local rule pack for each encryption S-box instance.'
    },
    {
      block_id: 'player_to_next_round',
      family: 'permutation_equality',
      applies_to_unit_ids: [unitId],
      binding_roles: {
        source_bits: 'state_after_sbox',
        target_bits: 'state_pre_round'
      },
      instance_scope: {
        round_start: 1,
        round_end: roundEnd,
        bit_start: 0,
        bit_end: 63
      },
      index_mapping: {
        source_round: 'round',
        source_bit: 'bit',
        target_round: 'round + 1',
        target_bit: 'pLayer(bit) from primitive-spec.present80.full.json'
      },
      semantic_summary: 'Wire each round through the PRESENT pLayer into the next round boundary.'
    }
  ];

  if (updateEnd >= 1) {
    blocks.push(
      {
        block_id: 'key_schedule_rotate_left_61',
        family: 'rotation_equality',
        applies_to_unit_ids: [unitId],
        binding_roles: {
          source_register: 'key_reg_pre_round',
          target_register: 'key_reg_after_rotate'
        },
        instance_scope: {
          update_start: 1,
          update_end: updateEnd,
          bit_start: 0,
          bit_end: 79
        },
        index_mapping: {
          source_round: 'update',
          target_update: 'update',
          target_bit: '(bit + 61) mod 80'
        },
        semantic_summary: 'Apply the 80-bit left rotation by 61 in the key-schedule updates needed for later round keys.'
      },
      {
        block_id: 'key_schedule_sbox_activity',
        family: 'sbox_activity_input_nonzero',
        applies_to_unit_ids: [unitId],
        binding_roles: {
          input_bits: 'key_reg_after_rotate',
          activity: 'ks_sbox_active'
        },
        instance_scope: {
          update_start: 1,
          update_end: updateEnd
        },
        index_mapping: {
          update: 'update',
          input_bit: '76 + lane',
          activity_index: 'update'
        },
        paper_equation_refs: [
          'Eq. (3)'
        ],
        semantic_summary: 'Mark the top-nibble key-schedule S-box active iff the rotated key-register nibble is nonzero.'
      },
      {
        block_id: 'key_schedule_sbox_bijective_link',
        family: 'sbox_bijective_nonzero',
        applies_to_unit_ids: [unitId],
        binding_roles: {
          input_bits: 'key_reg_after_rotate',
          output_bits: 'key_reg_after_sbox'
        },
        instance_scope: {
          update_start: 1,
          update_end: updateEnd
        },
        index_mapping: {
          update: 'update',
          input_bit: '76 + lane',
          output_bit: '76 + lane'
        },
        paper_equation_refs: [
          'Eq. (4)'
        ],
        semantic_summary: 'Apply bijective nonzero coupling to the top nibble of the key schedule.'
      },
      {
        block_id: 'key_schedule_sbox_cdp',
        family: 'sbox_valid_cutting_off',
        applies_to_unit_ids: [unitId],
        binding_roles: {
          input_bits: 'key_reg_after_rotate',
          output_bits: 'key_reg_after_sbox',
          activity: 'ks_sbox_active'
        },
        instance_scope: {
          update_start: 1,
          update_end: updateEnd
        },
        index_mapping: {
          update: 'update',
          input_bit: '76 + lane',
          output_bit: '76 + lane'
        },
        local_rule_pack_refs: [
          keyRulePackId
        ],
        paper_equation_refs: [
          'Fact 1',
          'Fact 2',
          'Eqs. (7) to (10)'
        ],
        semantic_summary: 'Reuse the attached PRESENT S-box local rule pack for the key-schedule nonlinear update.'
      },
      {
        block_id: 'key_schedule_copy_unchanged_lower_bits',
        family: 'register_copy_equality',
        applies_to_unit_ids: [unitId],
        binding_roles: {
          source_register: 'key_reg_after_rotate',
          target_register: 'key_reg_after_sbox'
        },
        instance_scope: {
          update_start: 1,
          update_end: updateEnd,
          bit_start: 0,
          bit_end: 75
        },
        index_mapping: {
          source_update: 'update',
          source_bit: 'bit',
          target_update: 'update',
          target_bit: 'bit'
        },
        semantic_summary: 'Copy the 76 key-register bits outside the top nibble unchanged across the key-schedule S-box step.'
      },
      {
        block_id: 'key_schedule_round_counter_invariance',
        family: 'constant_xor_invariance_copy',
        applies_to_unit_ids: [unitId],
        binding_roles: {
          source_register: 'key_reg_after_sbox',
          target_register: 'key_reg_pre_round'
        },
        instance_scope: {
          update_start: 1,
          update_end: updateEnd,
          bit_start: 0,
          bit_end: 79
        },
        index_mapping: {
          source_update: 'update',
          target_round: 'update + 1',
          bit: 'bit'
        },
        semantic_summary: 'Model the XOR-difference effect of the round-counter addition as an equality copy into the next pre-round key register.',
        notes: 'The constant addition happens in the value domain, but it is difference-invariant in XOR-difference space.'
      }
    );
  }

  return blocks;
}

function buildExecutionUnit(roundEnd, updateEnd, expectation) {
  const unitId = `p1_compute_${roundEnd}r_lower_bound_model`;
  const variableFamilyRefs = [
    'state_pre_round',
    'state_after_ark',
    'state_after_sbox',
    'round_key_bits',
    'key_reg_pre_round'
  ];
  const constraintBlockRefs = [
    'extract_round_keys',
    'encryption_addroundkey_xor',
    'encryption_sbox_activity',
    'encryption_sbox_bijective_link',
    'encryption_sbox_cdp',
    'player_to_next_round'
  ];
  const objectiveTerms = [
    {
      variable_family_ref: 'enc_sbox_active',
      aggregation: 'sum_all_instances'
    }
  ];

  if (updateEnd >= 1) {
    variableFamilyRefs.push('key_reg_after_rotate', 'key_reg_after_sbox');
    constraintBlockRefs.push(
      'key_schedule_rotate_left_61',
      'key_schedule_sbox_activity',
      'key_schedule_sbox_bijective_link',
      'key_schedule_sbox_cdp',
      'key_schedule_copy_unchanged_lower_bits',
      'key_schedule_round_counter_invariance'
    );
    objectiveTerms.push({
      variable_family_ref: 'ks_sbox_active',
      aggregation: 'sum_all_instances'
    });
  }

  variableFamilyRefs.push('ark_xor_dummy', 'enc_sbox_active');
  if (updateEnd >= 1) {
    variableFamilyRefs.push('ks_sbox_active');
  }

  return {
    unit_id: unitId,
    unit_kind: 'solver_model',
    phase_ref: `p1_compute_${roundEnd}r_lower_bound`,
    round_scope: {
      from_round: 1,
      to_round: roundEnd,
      notes: 'Task-scoped solver-facing unit generated from structural IR plus semantic attachment.'
    },
    variable_family_refs: variableFamilyRefs,
    constraint_block_refs: constraintBlockRefs,
    objective: {
      sense: 'minimize',
      term_refs: objectiveTerms,
      notes: 'Minimize the total number of active S-boxes across the encryption rounds and key schedule updates in scope.'
    },
    boundary_conditions: [
      {
        condition_id: 'initial_key_register_nonzero',
        condition_type: 'nonzero_sum',
        variable_family_ref: 'key_reg_pre_round',
        selector: {
          round: 1,
          bit_start: 0,
          bit_end: 79
        },
        relation: '>=',
        value: 1,
        rationale: 'Exclude the zero initial-key-difference case because that case belongs to the single-key model.'
      }
    ],
    emission_target_format: 'lp',
    output_capture: [
      {
        field_id: 'solver_status',
        field_type: 'string',
        required: true,
        notes: 'Expected values include OPTIMAL or INFEASIBLE depending on the emitted model and solver.'
      },
      {
        field_id: 'objective_value',
        field_type: 'integer',
        required: true,
        notes: 'This is the lower bound on the number of active S-boxes for the task-scoped window.'
      },
      {
        field_id: 'lp_artifact_path',
        field_type: 'path',
        required: false
      },
      {
        field_id: 'solver_log_path',
        field_type: 'path',
        required: false
      }
    ],
    expected_output: {
      output_kind: 'lower_bound',
      symbolic_name: `N${roundEnd}_present80_related_key`,
      expected_value: expectation ? expectation.expectedValue : null,
      paper_location: expectation ? expectation.paperLocation : 'paper checkpoint pending normalized expected value',
      provenance: 'solver_model'
    },
    notes: expectation
      ? expectation.expectedClaim
      : 'No normalized paper checkpoint value is stored yet for this round scope.'
  };
}

function buildVerificationContract(outputPath, unitId, roundEnd, expectation) {
  const checks = [
    {
      check_id: 'instantiation_schema_validation',
      kind: 'json_schema',
      target: relativeToRoot(outputPath) || path.basename(outputPath),
      expectation: 'The artifact must validate against docs/cryptanalysis-benchmark/model-instantiation.schema.json.'
    }
  ];

  if (expectation) {
    checks.push({
      check_id: `lower_bound_r${roundEnd}_checkpoint_compare`,
      kind: 'objective_compare',
      target: unitId,
      expectation: `When solver evidence exists, objective_value should match the published checkpoint ${expectation.expectedValue}.`
    });
  }

  return {
    checks,
    unresolved_policy: 'If the instantiation exists but emission, solve, or verdict evidence is still missing, keep the lane unresolved and mark the dominant blocker as backend_execution.'
  };
}

function buildInstantiation(structuralIr, semanticAttachment, primitiveSpec, options) {
  const { roundEnd, updateEnd } = getRoundTargets(structuralIr);
  const { encSboxAttachment, keySboxAttachment } = validateSupportedLane(structuralIr, semanticAttachment, primitiveSpec);
  const expectation = CHECKPOINT_EXPECTATIONS.get(roundEnd) || null;
  const unit = buildExecutionUnit(roundEnd, updateEnd, expectation);

  return {
    instantiation_id: `present80-r${roundEnd}-rkdiff-lower-bound-instantiation-v0`,
    target_primitive_id: 'present80',
    target_attack_id: `present80-r${roundEnd}-rkdiff-characteristic-lower-bound`,
    target_global_plan_id: `present80-r${roundEnd}-rkdiff-lower-bound-v0`,
    backend: 'milp',
    source_refs: buildSourceRefs(structuralIr, semanticAttachment, primitiveSpec),
    assumptions: [
      `This execution-facing artifact is task-scoped to rounds 1 through ${roundEnd} rather than to the full 31-round primitive.`,
      `Only the round keys K1 through K${roundEnd} are needed, so the model instantiates key-schedule updates 1 through ${updateEnd}.`,
      'The PRESENT S-box is bijective with branch number 2, so the bijective nonzero coupling is kept and the redundant branch-number inequality is omitted.',
      'XORing the round counter constant into key-register bits k19..k15 does not change XOR-difference bits, so the difference model may copy the post-S-box key-register state into the next-round key register.'
    ],
    variable_families: buildVariableFamilies(roundEnd, updateEnd),
    constraint_blocks: buildConstraintBlocks(
      unit.unit_id,
      roundEnd,
      updateEnd,
      encSboxAttachment.selected_rule_pack_ref,
      keySboxAttachment.selected_rule_pack_ref
    ),
    execution_units: [
      unit
    ],
    verification_contract: buildVerificationContract(options.outputPath, unit.unit_id, roundEnd, expectation),
    notes: [
      `Generated from structural IR ${structuralIr.ir_id}.`,
      `Semantic attachment source ${semanticAttachment.attachment_id}.`,
      'Current lowering scope is intentionally honest and PRESENT-specific; unresolved ARX lanes remain outside this generator.'
    ].join(' ')
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const structuralIr = readJson(options.structuralIrPath);
  const semanticAttachment = readJson(options.semanticAttachmentPath);
  const primitiveSpec = readJson(options.primitiveSpecPath);
  const instantiation = buildInstantiation(structuralIr, semanticAttachment, primitiveSpec, options);

  writeJson(options.outputPath, instantiation);

  const solverUnit = instantiation.execution_units.find((entry) => entry.unit_kind === 'solver_model');
  console.log(JSON.stringify({
    structuralIrPath: relativeToRoot(options.structuralIrPath),
    semanticAttachmentPath: relativeToRoot(options.semanticAttachmentPath),
    primitiveSpecPath: relativeToRoot(options.primitiveSpecPath),
    outputPath: relativeToRoot(options.outputPath),
    instantiationId: instantiation.instantiation_id,
    unitId: solverUnit ? solverUnit.unit_id : '',
    roundEnd: solverUnit ? solverUnit.round_scope?.to_round : null,
    variableFamilyCount: Array.isArray(instantiation.variable_families) ? instantiation.variable_families.length : 0,
    constraintBlockCount: Array.isArray(instantiation.constraint_blocks) ? instantiation.constraint_blocks.length : 0
  }, null, 2));
}

main();
