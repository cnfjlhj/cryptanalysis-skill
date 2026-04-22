const path = require('path');

function sanitizeLabel(label) {
  return String(label || '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function canonicalToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function canonicalPrimitiveId(value) {
  const token = canonicalToken(value);
  if (token === 'present80' || token === 'present_80') {
    return 'present-80';
  }
  return token.replace(/_/g, '-');
}

function canonicalAttackFamily(value) {
  const token = canonicalToken(value);
  if (token === 'related_key' || token === 'related_key_differential_attack') {
    return 'related_key_differential';
  }
  if (token === 'related_key_differential') {
    return token;
  }
  return token;
}

function canonicalDifferenceModel(value) {
  const token = canonicalToken(value);
  if (!token) {
    return '';
  }
  if (
    token === 'xor'
    || token === 'xor_difference'
    || token === 'xor_differential'
    || token === 'related_key_xor_differential'
  ) {
    return 'xor';
  }
  return token;
}

function canonicalBundleState(value) {
  const token = canonicalToken(value);
  if (!token) {
    return 'raw-input';
  }
  if (token === 'raw_input') {
    return 'raw-input';
  }
  if (token === 'incomplete_bundle') {
    return 'incomplete-bundle';
  }
  if (token === 'frozen_bundle') {
    return 'frozen-bundle';
  }
  return String(value);
}

function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return '';
}

function parseMaybeInteger(value) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function buildSourceItemLabel(entry) {
  return pickFirst(
    entry.label,
    entry.title,
    entry.name,
    entry.id,
    entry.path ? path.basename(entry.path) : '',
    entry.uri
  );
}

function normalizeSourceItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((entry, index) => {
      if (typeof entry === 'string') {
        const label = entry.trim();
        if (!label) {
          return null;
        }
        return {
          id: `source-${index + 1}`,
          kind: 'note',
          label,
          role: '',
          path: '',
          uri: '',
          notes: ''
        };
      }

      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const label = buildSourceItemLabel(entry);
      return {
        id: String(pickFirst(entry.id, `source-${index + 1}`)),
        kind: String(pickFirst(entry.kind, entry.type, 'note')),
        label: String(label || `source-${index + 1}`),
        role: String(pickFirst(entry.role, '')),
        path: String(pickFirst(entry.path, '')),
        uri: String(pickFirst(entry.uri, entry.url, '')),
        notes: String(pickFirst(entry.notes, ''))
      };
    })
    .filter(Boolean);
}

function normalizeSourceBundle(bundle) {
  if (!Array.isArray(bundle)) {
    return [];
  }

  return bundle
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry.trim();
      }
      if (entry && typeof entry === 'object') {
        return pickFirst(entry.kind, entry.type, entry.label, entry.path, entry.name);
      }
      return '';
    })
    .filter(Boolean);
}

function summarizeSourceItems(sourceItems) {
  return sourceItems
    .map((entry) => {
      const label = entry.label || entry.id;
      return `${entry.kind}:${label}`;
    })
    .filter(Boolean);
}

function normalizeRequest(rawRequest, requestPath) {
  const target = rawRequest.target || {};
  const primitive = rawRequest.primitive || {};
  const attack = rawRequest.attack || {};
  const lane = rawRequest.lane || {};
  const bundleState = pickFirst(rawRequest.bundleState, rawRequest.inputState, rawRequest.bundle_state, 'raw-input');
  const requestIdSeed = pickFirst(rawRequest.requestId, rawRequest.id, path.basename(requestPath, path.extname(requestPath)));

  return {
    requestId: sanitizeLabel(requestIdSeed || 'cryptanalysis-request') || 'cryptanalysis-request',
    bundleState: canonicalBundleState(bundleState),
    paperId: canonicalToken(pickFirst(rawRequest.paperId, rawRequest.paper_id, target.paperId)),
    paperTitle: String(pickFirst(rawRequest.paperTitle, rawRequest.paper_title, '') || ''),
    primitiveFamily: canonicalToken(pickFirst(rawRequest.primitiveFamily, rawRequest.primitive_family, primitive.family)),
    primitiveId: canonicalPrimitiveId(pickFirst(rawRequest.primitiveId, rawRequest.primitive_id, primitive.id, primitive.name)),
    attackFamily: canonicalAttackFamily(pickFirst(rawRequest.attackFamily, rawRequest.attack_family, attack.family)),
    differenceModel: canonicalDifferenceModel(
      pickFirst(rawRequest.differenceModel, rawRequest.difference_model, attack.differenceModel, attack.model)
    ),
    targetCaseId: String(pickFirst(rawRequest.targetCaseId, rawRequest.target_case_id, target.caseId, target.case_id) || ''),
    targetClaim: String(pickFirst(rawRequest.targetClaim, rawRequest.target_claim, target.claim) || ''),
    comparisonPoint: String(pickFirst(rawRequest.comparisonPoint, rawRequest.comparison_point, target.comparisonPoint) || ''),
    claimKind: canonicalToken(pickFirst(rawRequest.claimKind, rawRequest.claim_kind, target.claimKind)),
    roundEnd: parseMaybeInteger(pickFirst(target.roundEnd, rawRequest.roundEnd, rawRequest.round_end)),
    sboxModel: canonicalToken(pickFirst(rawRequest.sboxModel, rawRequest.sbox_model, lane.sboxModel, lane.sbox_model)),
    sourceBundle: normalizeSourceBundle(pickFirst(rawRequest.sourceBundle, rawRequest.source_bundle, [])),
    notes: String(pickFirst(rawRequest.notes, rawRequest.userNotes, '') || '')
  };
}

function collectMissingFields(request) {
  const missing = [];

  if (request.bundleState !== 'frozen-bundle') {
    missing.push('bundleState=frozen-bundle');
  }
  if (!request.paperId) {
    missing.push('paperId');
  }
  if (!request.primitiveId) {
    missing.push('primitiveId');
  }
  if (!request.primitiveFamily) {
    missing.push('primitiveFamily');
  }
  if (!request.attackFamily) {
    missing.push('attackFamily');
  }
  if (!request.differenceModel) {
    missing.push('differenceModel');
  }
  if (!request.targetCaseId && !Number.isInteger(request.roundEnd) && !request.targetClaim && !request.comparisonPoint) {
    missing.push('targetCaseId|roundEnd|targetClaim');
  }

  return missing;
}

function buildIntakeQuestions(missingFields) {
  const questionMap = {
    'bundleState=frozen-bundle': 'Can you freeze the bundle first, or should the skill stay in intake mode and ask for more material?',
    paperId: 'Which exact paper or source bundle is the target?',
    primitiveId: 'Which primitive and exact variant should be analyzed?',
    primitiveFamily: 'Which primitive family does it belong to?',
    attackFamily: 'Which attack family is intended?',
    differenceModel: 'Which difference model should the lane use?',
    'targetCaseId|roundEnd|targetClaim': 'Which exact claim, round window, or published checkpoint should be analyzed first?'
  };

  return missingFields.map((field) => questionMap[field]).filter(Boolean);
}

function deriveBundleState(request, sourceItems, explicitState) {
  const nonStateMissing = collectMissingFields({
    ...request,
    bundleState: 'frozen-bundle'
  }).filter((field) => field !== 'bundleState=frozen-bundle');

  if (nonStateMissing.length === 0) {
    return 'frozen-bundle';
  }

  if (sourceItems.length > 0) {
    return explicitState === 'raw-input' ? 'incomplete-bundle' : 'incomplete-bundle';
  }

  return explicitState || 'raw-input';
}

function buildCandidateSourceRefs(sourceItems, refKinds) {
  return sourceItems
    .filter((entry) => refKinds.some((needle) => canonicalToken(entry.kind).includes(canonicalToken(needle))))
    .map((entry) => ({
      kind: entry.kind,
      label: entry.label,
      path: entry.path,
      uri: entry.uri
    }));
}

function buildPrimitiveIntakeCard(rawBundle, request, sourceItems) {
  const primitive = rawBundle.primitive || {};
  const known = {
    primitiveId: request.primitiveId || '',
    primitiveName: String(pickFirst(primitive.name, primitive.id, request.primitiveId) || ''),
    family: request.primitiveFamily || '',
    blockSizeBits: parseMaybeInteger(pickFirst(primitive.block_size_bits, primitive.blockSizeBits)),
    keySizeBits: parseMaybeInteger(pickFirst(primitive.key_size_bits, primitive.keySizeBits)),
    roundCountClaimed: parseMaybeInteger(pickFirst(primitive.round_count_claimed, primitive.roundCountClaimed)),
    notes: String(pickFirst(primitive.notes, ''))
  };

  const missingForRouting = [];
  if (!known.primitiveId) {
    missingForRouting.push('primitive_id');
  }
  if (!known.family) {
    missingForRouting.push('family');
  }

  const missingForFullPrimitiveSpec = [];
  if (buildCandidateSourceRefs(sourceItems, ['primitive', 'standard']).length === 0) {
    missingForFullPrimitiveSpec.push('source_refs');
  }
  if (known.blockSizeBits === null) {
    missingForFullPrimitiveSpec.push('block_size_bits');
  }
  if (known.keySizeBits === null) {
    missingForFullPrimitiveSpec.push('key_size_bits');
  }
  if (known.roundCountClaimed === null) {
    missingForFullPrimitiveSpec.push('round_function.round_count_claimed');
  }
  if (!Array.isArray(primitive.state_containers) || primitive.state_containers.length === 0) {
    missingForFullPrimitiveSpec.push('state.containers');
  }
  if (!Array.isArray(primitive.round_ops) || primitive.round_ops.length === 0) {
    missingForFullPrimitiveSpec.push('round_function.ops');
  }

  return {
    cardType: 'primitive-intake-card',
    status: missingForRouting.length === 0 ? 'identified' : 'needs-identification',
    known,
    candidateSourceRefs: buildCandidateSourceRefs(sourceItems, ['primitive', 'standard', 'code']),
    missingForRouting,
    missingForFullPrimitiveSpec
  };
}

function buildAttackIntakeCard(rawBundle, request, sourceItems) {
  const attack = rawBundle.attack || {};
  const target = rawBundle.target || {};
  const known = {
    attackFamily: request.attackFamily || '',
    differenceModel: request.differenceModel || '',
    claimKind: request.claimKind || canonicalToken(pickFirst(attack.claim_kind, attack.claimKind)),
    roundEnd: Number.isInteger(request.roundEnd) ? request.roundEnd : null,
    targetCaseId: request.targetCaseId || '',
    targetClaim: request.targetClaim || '',
    comparisonPoint: request.comparisonPoint || '',
    granularity: String(pickFirst(attack.granularity, '')),
    exactnessGoal: String(pickFirst(attack.exactness_goal, attack.exactnessGoal, '')),
    notes: String(pickFirst(attack.notes, target.notes, ''))
  };

  const missingForRouting = [];
  if (!known.attackFamily) {
    missingForRouting.push('attack_family');
  }
  if (!known.differenceModel) {
    missingForRouting.push('difference_model');
  }
  if (!known.targetCaseId && !known.targetClaim && !Number.isInteger(known.roundEnd)) {
    missingForRouting.push('target claim or checkpoint');
  }

  const missingForFullAttackSpec = [];
  if (buildCandidateSourceRefs(sourceItems, ['attack', 'appendix', 'code']).length === 0) {
    missingForFullAttackSpec.push('source_refs');
  }
  if (!known.attackFamily) {
    missingForFullAttackSpec.push('attack_family');
  }
  if (!known.differenceModel) {
    missingForFullAttackSpec.push('property_domain.semantic_domain');
  }
  if (!Number.isInteger(known.roundEnd)) {
    missingForFullAttackSpec.push('round_scope');
  }
  if (!known.targetCaseId && !known.targetClaim) {
    missingForFullAttackSpec.push('validation_targets');
  }

  return {
    cardType: 'attack-intake-card',
    status: missingForRouting.length === 0 ? 'identified' : 'needs-identification',
    known,
    candidateSourceRefs: buildCandidateSourceRefs(sourceItems, ['attack', 'appendix', 'code']),
    missingForRouting,
    missingForFullAttackSpec
  };
}

function prepareIntakeArtifacts(rawBundle, bundlePath) {
  const paper = rawBundle.paper || {};
  const primitive = rawBundle.primitive || {};
  const attack = rawBundle.attack || {};
  const target = rawBundle.target || {};
  const lane = rawBundle.lane || {};
  const sourceItems = normalizeSourceItems(pickFirst(rawBundle.source_items, rawBundle.sourceItems, []));
  const explicitState = canonicalBundleState(pickFirst(rawBundle.state_hint, rawBundle.stateHint, ''));
  const requestIdSeed = pickFirst(
    rawBundle.bundle_id,
    rawBundle.bundleId,
    rawBundle.requestId,
    rawBundle.id,
    path.basename(bundlePath, path.extname(bundlePath))
  );

  const requestDraft = {
    requestId: sanitizeLabel(requestIdSeed || 'cryptanalysis-bundle') || 'cryptanalysis-bundle',
    bundleState: explicitState,
    paperId: canonicalToken(pickFirst(paper.id, paper.paper_id, rawBundle.paperId, rawBundle.paper_id)),
    paperTitle: String(pickFirst(paper.title, rawBundle.paperTitle, rawBundle.paper_title, '') || ''),
    primitiveFamily: canonicalToken(pickFirst(primitive.family, rawBundle.primitiveFamily, rawBundle.primitive_family)),
    primitiveId: canonicalPrimitiveId(pickFirst(primitive.id, primitive.name, rawBundle.primitiveId, rawBundle.primitive_id)),
    attackFamily: canonicalAttackFamily(pickFirst(attack.family, rawBundle.attackFamily, rawBundle.attack_family)),
    differenceModel: canonicalDifferenceModel(
      pickFirst(attack.difference_model, attack.differenceModel, rawBundle.differenceModel, rawBundle.difference_model)
    ),
    targetCaseId: String(pickFirst(target.case_id, target.caseId, rawBundle.targetCaseId, rawBundle.target_case_id) || ''),
    targetClaim: String(pickFirst(target.claim, rawBundle.targetClaim, rawBundle.target_claim) || ''),
    comparisonPoint: String(pickFirst(target.comparison_point, target.comparisonPoint, rawBundle.comparisonPoint) || ''),
    claimKind: canonicalToken(pickFirst(attack.claim_kind, attack.claimKind, rawBundle.claimKind, rawBundle.claim_kind)),
    roundEnd: parseMaybeInteger(pickFirst(target.round_end, target.roundEnd, rawBundle.roundEnd, rawBundle.round_end)),
    sboxModel: canonicalToken(pickFirst(target.sbox_model, target.sboxModel, lane.sbox_model, lane.sboxModel)),
    sourceBundle: summarizeSourceItems(sourceItems),
    notes: String(pickFirst(rawBundle.notes, ''))
  };

  requestDraft.bundleState = deriveBundleState(requestDraft, sourceItems, explicitState);

  const missingFields = collectMissingFields(requestDraft);
  const warnings = [];
  if (explicitState === 'frozen-bundle' && missingFields.length > 0) {
    warnings.push('state_hint requested frozen-bundle, but required routing fields are still missing.');
  }

  const primitiveCard = buildPrimitiveIntakeCard(rawBundle, requestDraft, sourceItems);
  const attackCard = buildAttackIntakeCard(rawBundle, requestDraft, sourceItems);

  const intakeResult = {
    schemaVersion: 'cryptanalysis-intake-result.v0',
    bundleId: requestDraft.requestId,
    bundlePath,
    sourceItemCount: sourceItems.length,
    sourceItems,
    bundleState: requestDraft.bundleState,
    readyForRouting: missingFields.length === 0,
    missingFields,
    intakeQuestions: buildIntakeQuestions(missingFields),
    warnings,
    nextAction: missingFields.length === 0
      ? 'The bundle is complete enough for the current top-level routing gate.'
      : 'Fill the missing routing fields before treating this bundle as a frozen analysis request.',
    requestDraft,
    primitiveCard,
    attackCard
  };

  return {
    normalizedBundle: {
      bundleId: requestDraft.requestId,
      stateHint: explicitState,
      sourceItems,
      notes: requestDraft.notes
    },
    requestDraft,
    primitiveCard,
    attackCard,
    intakeResult
  };
}

module.exports = {
  sanitizeLabel,
  canonicalToken,
  canonicalPrimitiveId,
  canonicalAttackFamily,
  canonicalDifferenceModel,
  canonicalBundleState,
  pickFirst,
  normalizeSourceBundle,
  normalizeRequest,
  collectMissingFields,
  buildIntakeQuestions,
  prepareIntakeArtifacts
};
