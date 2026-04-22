#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '../..');
const DEFAULT_LOCAL_SEMANTICS_DIR = path.join(ROOT_DIR, 'docs', 'cryptanalysis-benchmark', 'trials');

function parseArgs(argv) {
  const options = {
    irPath: '',
    localSemanticsPaths: [],
    localSemanticsDir: DEFAULT_LOCAL_SEMANTICS_DIR,
    outputPath: '',
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if ((current === '--ir' || current === '--structural-ir') && next) {
      options.irPath = path.resolve(next);
      index += 1;
      continue;
    }

    if ((current === '--local-semantics' || current === '--rule-pack') && next) {
      options.localSemanticsPaths.push(path.resolve(next));
      index += 1;
      continue;
    }

    if ((current === '--local-semantics-dir' || current === '--rule-pack-dir') && next) {
      options.localSemanticsDir = path.resolve(next);
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
    '  node scripts/cryptanalysis-benchmark/resolve-semantic-attachments.js --ir <path>',
    '',
    'Options:',
    '  --ir <path>                   Structural IR JSON',
    '  --local-semantics <path>      Optional local rule-pack JSON, repeatable',
    '  --local-semantics-dir <path>  Optional directory searched recursively for local-semantics*.json',
    '  --output <path>               Optional output manifest path'
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
  return path.relative(ROOT_DIR, targetPath);
}

function walkFiles(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) {
    return [];
  }

  const results = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath));
      continue;
    }
    if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

function collectRulePackPaths(options) {
  const explicit = options.localSemanticsPaths.map((item) => path.resolve(item));
  if (explicit.length > 0) {
    return Array.from(new Set(explicit)).sort();
  }

  return walkFiles(options.localSemanticsDir)
    .filter((filePath) => /local-semantics\..+\.json$/i.test(path.basename(filePath)))
    .sort();
}

function buildStateFamilyMap(ir) {
  return new Map((ir.state_families || []).map((family) => [family.family_id, family]));
}

function firstWidthHint(template, stateFamilyMap, refKey, paramKeys) {
  const params = template.operator_parameters || {};
  for (const key of paramKeys) {
    if (Number.isInteger(params[key])) {
      return params[key];
    }
  }

  const refs = template[refKey] || [];
  for (const familyRef of refs) {
    const family = stateFamilyMap.get(familyRef);
    if (family && Number.isInteger(family.width_bits)) {
      return family.width_bits;
    }
  }

  return null;
}

function inferComponentNameHint(template) {
  const params = template.operator_parameters || {};
  return params.sbox_name || params.component_name || params.component_hint || '';
}

function buildLoadedRulePackSummaries(rulePackPaths) {
  return rulePackPaths.map((rulePackPath) => {
    const pack = readJson(rulePackPath);
    return {
      sourcePath: rulePackPath,
      data: pack,
      summary: {
        rule_pack_id: pack.rule_pack_id,
        source_path: relativeToRoot(rulePackPath),
        target_primitive_id: pack.target_primitive_id,
        operator_type: pack.component_scope.operator_type,
        component_name: pack.component_scope.component_name,
        semantic_domain: pack.property_domain.semantic_domain,
        granularity: pack.property_domain.granularity,
        exactness: pack.property_domain.exactness,
        rule_families: ((pack.resolver_metadata || {}).rule_families || []).slice()
      }
    };
  });
}

function componentNameMatches(rulePack, componentNameHint) {
  if (!componentNameHint) {
    return true;
  }

  const aliases = ((rulePack.resolver_metadata || {}).component_name_aliases || []).slice();
  const candidates = [rulePack.component_scope.component_name, ...aliases];
  return candidates.includes(componentNameHint);
}

function ruleFamilyMatches(rulePack, requiredRuleFamily) {
  if (!requiredRuleFamily) {
    return true;
  }

  const families = ((rulePack.resolver_metadata || {}).rule_families || []).slice();
  return families.includes(requiredRuleFamily) || rulePack.rule_pack_id === requiredRuleFamily;
}

function resolveRequirement(template, requirement, ir, stateFamilyMap, loadedRulePacks) {
  const componentNameHint = inferComponentNameHint(template);
  const inputWidthBits = firstWidthHint(
    template,
    stateFamilyMap,
    'input_family_refs',
    ['input_width_bits', 'cell_size_bits', 'word_size_bits', 'width_bits']
  );
  const outputWidthBits = firstWidthHint(
    template,
    stateFamilyMap,
    'output_family_refs',
    ['output_width_bits', 'cell_size_bits', 'word_size_bits', 'width_bits']
  );
  const requiredDomain = requirement.domain || ir.analysis_context.semantic_domain || '';

  const candidates = [];
  for (const entry of loadedRulePacks) {
    const rulePack = entry.data;
    const matchingAxes = [];

    if (rulePack.component_scope.operator_type !== template.op_type) {
      continue;
    }
    matchingAxes.push('operator_type');

    if (rulePack.property_domain.semantic_domain !== requiredDomain) {
      continue;
    }
    matchingAxes.push('semantic_domain');

    if (!ruleFamilyMatches(rulePack, requirement.rule_family)) {
      continue;
    }
    if (requirement.rule_family) {
      matchingAxes.push('rule_family');
    }

    if (inputWidthBits !== null && rulePack.component_scope.input_width_bits !== inputWidthBits) {
      continue;
    }
    if (inputWidthBits !== null) {
      matchingAxes.push('input_width_bits');
    }

    if (outputWidthBits !== null && rulePack.component_scope.output_width_bits !== outputWidthBits) {
      continue;
    }
    if (outputWidthBits !== null) {
      matchingAxes.push('output_width_bits');
    }

    if (!componentNameMatches(rulePack, componentNameHint)) {
      continue;
    }
    if (componentNameHint) {
      matchingAxes.push('component_name');
    }

    candidates.push({
      rulePackId: rulePack.rule_pack_id,
      matchingAxes
    });
  }

  let resolutionStatus = 'missing';
  let selectedRulePackRef = '';
  let summary = `No loaded rule pack satisfies ${template.template_id}`;

  if (candidates.length === 1) {
    resolutionStatus = 'resolved';
    selectedRulePackRef = candidates[0].rulePackId;
    summary = `Resolved ${template.template_id} to local rule pack ${selectedRulePackRef}.`;
  } else if (candidates.length > 1) {
    resolutionStatus = 'ambiguous';
    summary = `Multiple local rule packs match ${template.template_id}; v0 cannot choose deterministically.`;
  }

  return {
    attachment_entry_id: `${template.template_id}:${requirement.slot_id || requirement.rule_family || requirement.kind}`,
    template_ref: template.template_id,
    requirement_slot_id: requirement.slot_id || '',
    op_type: template.op_type,
    rule_family: requirement.rule_family || null,
    component_name_hint: componentNameHint,
    input_width_bits: inputWidthBits,
    output_width_bits: outputWidthBits,
    resolution_status: resolutionStatus,
    matched_rule_pack_refs: candidates.map((candidate) => candidate.rulePackId),
    selected_rule_pack_ref: selectedRulePackRef || undefined,
    matching_axes: candidates.length === 1 ? candidates[0].matchingAxes : [],
    summary,
    notes: requirement.summary || ''
  };
}

function buildManifest(irPath, rulePackPaths) {
  const ir = readJson(irPath);
  const stateFamilyMap = buildStateFamilyMap(ir);
  const loadedRulePacks = buildLoadedRulePackSummaries(rulePackPaths);
  const templateAttachments = [];

  for (const template of ir.operator_templates || []) {
    const requirements = template.refinement_requirements || [];
    for (const requirement of requirements) {
      templateAttachments.push(resolveRequirement(template, requirement, ir, stateFamilyMap, loadedRulePacks));
    }
  }

  const resolvedCount = templateAttachments.filter((entry) => entry.resolution_status === 'resolved').length;
  const missingCount = templateAttachments.filter((entry) => entry.resolution_status === 'missing').length;
  const ambiguousCount = templateAttachments.filter((entry) => entry.resolution_status === 'ambiguous').length;
  const readyForModelInstantiation = missingCount === 0 && ambiguousCount === 0;

  return {
    attachment_id: `${ir.ir_id}.semantic-attachment.v0`,
    status: 'reviewable',
    source_structural_ir_id: ir.ir_id,
    analysis_context: {
      primitive_id: ir.analysis_context.primitive_id,
      attack_family: ir.analysis_context.attack_family,
      semantic_domain: ir.analysis_context.semantic_domain,
      granularity: ir.analysis_context.granularity,
      target_round_start: ir.analysis_context.target_round_start,
      target_round_end: ir.analysis_context.target_round_end,
      notes: 'This attachment manifest records only semantic resolution status, not backend block synthesis.'
    },
    loaded_rule_packs: loadedRulePacks.map((entry) => entry.summary),
    template_attachments: templateAttachments,
    resolution_summary: {
      total_requirements: templateAttachments.length,
      resolved_count: resolvedCount,
      missing_count: missingCount,
      ambiguous_count: ambiguousCount,
      ready_for_model_instantiation: readyForModelInstantiation
    },
    provenance_and_gaps: {
      derived_from: [
        relativeToRoot(irPath),
        ...loadedRulePacks.map((entry) => entry.summary.source_path)
      ],
      unresolved_attachment_ids: templateAttachments
        .filter((entry) => entry.resolution_status !== 'resolved')
        .map((entry) => entry.attachment_entry_id),
      ready_for_model_instantiation: readyForModelInstantiation,
      notes: readyForModelInstantiation
        ? 'All declared refinement requirements resolved against the loaded local rule packs.'
        : 'At least one declared refinement requirement is still missing or ambiguous.'
    }
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (!options.irPath) {
    throw new Error('Missing required --ir <path>');
  }

  const rulePackPaths = collectRulePackPaths(options);
  const manifest = buildManifest(options.irPath, rulePackPaths);

  if (options.outputPath) {
    writeJson(options.outputPath, manifest);
  }

  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

main();
