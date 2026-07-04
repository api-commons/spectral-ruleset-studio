import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import yaml from 'js-yaml';
import { emitYaml, buildRuleset, parseCheck, validateDraft, vaguenessHints, resolveVariants } from '../src/emit-ruleset.js';
import { TEMPLATES } from '../src/templates.js';
import { isValidRuleId, FUNCTION_NAMES, TARGETS, formatPosture } from '../src/catalog.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(
  await readFile(join(__dirname, '..', 'fixtures', 'sample-statements.json'), 'utf8')
);

test('emits valid, parseable Spectral YAML for a sample set of statements', () => {
  const y = emitYaml(sample, { generatedAt: '2026-07-03T12:00:00Z' });
  // It parses as YAML at all.
  assert.doesNotThrow(() => yaml.load(y));
  const check = parseCheck(y);
  assert.equal(check.ok, true);
  assert.equal(check.ruleCount, sample.length);
  // Header + banners are present.
  assert.match(y, /^# API Governance Ruleset/m);
  assert.match(y, /studio\.apicommons\.org/);
  assert.match(y, /Operations/); // an area banner
});

test('every emitted rule carries the required grounding fields', () => {
  const y = emitYaml(sample, { generatedAt: '2026-07-03T12:00:00Z' });
  const doc = yaml.load(y);
  assert.ok(doc.rules, 'has a rules map');
  assert.ok(doc.formats && doc.formats.length, 'declares formats');

  for (const [id, rule] of Object.entries(doc.rules)) {
    // Convention-following id.
    assert.ok(isValidRuleId(id), `id "${id}" follows spec-version-property-semantics-severity`);
    // Spectral essentials.
    assert.ok(rule.description && rule.description.trim(), `${id} has a description`);
    assert.ok(rule.message && rule.message.trim(), `${id} has a message`);
    assert.ok(['error', 'warn', 'info', 'hint'].includes(rule.severity), `${id} has a valid severity`);
    assert.ok(rule.given, `${id} has a given`);
    assert.ok(rule.then && FUNCTION_NAMES.includes(rule.then.function), `${id} uses one of the 9 core functions`);
    assert.ok(rule.documentationUrl && /^https?:\/\//.test(rule.documentationUrl), `${id} has a docs URL`);
    // Grounding folded into the description.
    assert.match(rule.description, /Grounding —/, `${id} description carries a grounding block`);
    assert.match(rule.description, /Owner \(who\):/, `${id} description names an owner`);
    assert.match(rule.description, /Why:/, `${id} description carries a rationale`);
    // Machine-readable mirror (default on).
    assert.ok(rule['x-grounding'], `${id} has an x-grounding extension`);
    assert.ok(rule['x-grounding'].owner, `${id} x-grounding names an owner`);
    assert.ok(['positive', 'negative'].includes(rule['x-grounding'].framing), `${id} declares framing`);
  }
});

test('--no-ext still grounds via the description, and stays valid', () => {
  const y = emitYaml(sample, { includeExtensions: false, generatedAt: '2026-07-03T12:00:00Z' });
  const doc = yaml.load(y);
  for (const rule of Object.values(doc.rules)) {
    assert.equal(rule['x-grounding'], undefined, 'no x-grounding extension');
    assert.match(rule.description, /Grounding —/, 'grounding still in description');
    assert.match(rule.description, /Owner \(who\):/, 'owner still present');
  }
});

test('function options serialize into then.functionOptions correctly', () => {
  const doc = buildRuleset(sample);
  const casing = doc.rules['oas-x-schema-property-casing-warn'];
  assert.equal(casing.then.function, 'casing');
  assert.deepEqual(casing.then.functionOptions, { type: 'camel' });
  const opId = doc.rules['oas-x-operation-operationId-defined-error'];
  assert.equal(opId.then.field, 'operationId');
  assert.equal(opId.then.function, 'defined');
  assert.equal(opId.then.functionOptions, undefined, 'defined takes no options');
  const getBody = doc.rules['oas-3-operation-get-requestBody-falsy-error'];
  assert.equal(getBody.then.field, 'requestBody');
  assert.equal(getBody.then.function, 'falsy');
});

test('the whole starter library emits valid, grounded YAML', () => {
  const y = emitYaml(TEMPLATES, { generatedAt: '2026-07-03T12:00:00Z' });
  const check = parseCheck(y);
  assert.equal(check.ok, true);
  // A divergent template can fan out into two twins, so the emitted rule count
  // is at least the template count.
  assert.ok(check.ruleCount >= TEMPLATES.length, `emits at least one rule per template`);
  assert.ok(TEMPLATES.length >= 15, `starter library has at least 15 templates (has ${TEMPLATES.length})`);
  const doc = yaml.load(y);
  for (const [id, rule] of Object.entries(doc.rules)) {
    assert.ok(isValidRuleId(id), `id "${id}" follows convention`);
    assert.ok(FUNCTION_NAMES.includes(rule.then.function));
    assert.match(rule.description, /Grounding —/);
  }
});

test('validateDraft flags missing grounding and bad ids', () => {
  const issues = validateDraft({ fn: 'defined', given: '$.info', severity: 'warn' });
  const fields = issues.map((i) => i.field);
  assert.ok(fields.includes('id'), 'missing id flagged');
  assert.ok(fields.includes('message'), 'missing message flagged');
  assert.ok(fields.includes('description'), 'missing description flagged');

  const badId = validateDraft({ ...sample[0], id: 'BadId' }).find((i) => i.field === 'id');
  assert.ok(badId && badId.level === 'error', 'non-convention id is an error');

  const clean = validateDraft(sample[0]).filter((i) => i.level === 'error');
  assert.equal(clean.length, 0, 'a complete draft has no errors');
});

test('vaguenessHints surfaces undistilled prose', () => {
  assert.deepEqual(vaguenessHints('Operations should have meaningful descriptions'), ['meaningful']);
  assert.ok(vaguenessHints('Names must be consistent and clear').length >= 2);
  assert.deepEqual(vaguenessHints('Every operation must declare an operationId'), []);
});

// ---------------------------------------------------------------------------
// Swagger 2.0 ↔ OpenAPI 3.x format parity
// ---------------------------------------------------------------------------

// A divergent draft where the check is IDENTICAL on both paths (same field).
const MULTIPATH_DRAFT = {
  id: 'oas-x-schema-property-description-truthy-warn', area: 'schemas',
  statement: 'Every schema property must be described.',
  given: '$.components.schemas[*].properties[*]', field: 'description',
  oas3: { given: '$.components.schemas[*].properties[*]', field: 'description' },
  oas2: { given: '$.definitions[*].properties[*]', field: 'description' },
  fn: 'truthy', options: {}, message: 'Property must be described.', severity: 'warn',
  framing: 'positive', description: 'desc', why: 'because', docs: 'https://x.test', owner: 'Team',
};

// A divergent draft where the check DIFFERS (different field → twins).
const TWIN_DRAFT = {
  id: 'oas-x-server-base-url-truthy-warn', area: 'servers',
  statement: 'The API must declare a base URL.',
  given: '$.servers[*]', field: 'url',
  oas3: { given: '$.servers[*]', field: 'url' },
  oas2: { given: '$', field: 'host' },
  fn: 'truthy', options: {}, message: 'Must declare a base URL.', severity: 'warn',
  framing: 'positive', description: 'desc', why: 'because', docs: 'https://x.test', owner: 'Team',
};

// A 3.x-only concept.
const OAS3_ONLY_DRAFT = {
  id: 'oas-3-operation-get-requestBody-falsy-error', area: 'operations',
  statement: 'GET must not have a request body.',
  given: '$.paths[*].get', field: 'requestBody', formats: ['oas3'],
  fn: 'falsy', options: {}, message: 'No GET body.', severity: 'error',
  framing: 'negative', description: 'desc', why: 'because', docs: 'https://x.test', owner: 'Team',
};

test('resolveVariants: identical check on two paths → one multipath rule (Both)', () => {
  const vs = resolveVariants(MULTIPATH_DRAFT, 'both');
  assert.equal(vs.length, 1, 'one rule');
  assert.ok(Array.isArray(vs[0].given), 'given is a multipath array');
  assert.deepEqual(vs[0].given, ['$.components.schemas[*].properties[*]', '$.definitions[*].properties[*]']);
  assert.equal(vs[0].formats, undefined, 'multipath carries no formats tag');
  assert.equal(vs[0].idSuffix, undefined);
});

test('resolveVariants: differing check → two format-tagged twins (Both)', () => {
  const vs = resolveVariants(TWIN_DRAFT, 'both');
  assert.equal(vs.length, 2, 'two twins');
  const oas3 = vs.find((v) => v.idSuffix === '-oas3');
  const oas2 = vs.find((v) => v.idSuffix === '-oas2');
  assert.deepEqual(oas3.formats, ['oas3']);
  assert.equal(oas3.field, 'url');
  assert.deepEqual(oas2.formats, ['oas2']);
  assert.equal(oas2.field, 'host');
  assert.equal(oas2.given, '$');
});

test('resolveVariants: mode narrows a divergent draft to a single form', () => {
  assert.deepEqual(resolveVariants(MULTIPATH_DRAFT, 'oas2')[0].given, '$.definitions[*].properties[*]');
  assert.deepEqual(resolveVariants(MULTIPATH_DRAFT, 'oas3')[0].given, '$.components.schemas[*].properties[*]');
  assert.equal(resolveVariants(TWIN_DRAFT, 'oas2').length, 1);
  assert.equal(resolveVariants(TWIN_DRAFT, 'oas2')[0].field, 'host');
  assert.equal(resolveVariants(TWIN_DRAFT, 'oas2')[0].formats, undefined, 'single-mode form needs no tag');
});

test('resolveVariants: a single-spec draft is dropped in the other mode', () => {
  assert.deepEqual(resolveVariants(OAS3_ONLY_DRAFT, 'both')[0].formats, ['oas3']);
  assert.equal(resolveVariants(OAS3_ONLY_DRAFT, 'oas3').length, 1);
  assert.equal(resolveVariants(OAS3_ONLY_DRAFT, 'oas2').length, 0, '3.x-only rule dropped from a 2.0 ruleset');
});

test('emitter produces valid grounded YAML for oas2, oas3, and both targets', () => {
  const drafts = [MULTIPATH_DRAFT, TWIN_DRAFT, OAS3_ONLY_DRAFT];
  for (const target of ['both', 'oas3', 'oas2']) {
    const y = emitYaml(drafts, { target, generatedAt: '2026-07-03T12:00:00Z' });
    const check = parseCheck(y);
    assert.equal(check.ok, true, `${target} parses`);
    const doc = yaml.load(y);
    // Top-level formats match the target.
    if (target === 'both') assert.deepEqual(doc.formats, ['oas2', 'oas3']);
    if (target === 'oas3') assert.deepEqual(doc.formats, ['oas3']);
    if (target === 'oas2') assert.deepEqual(doc.formats, ['oas2']);
    // Every emitted rule is still valid and grounded.
    for (const [id, rule] of Object.entries(doc.rules)) {
      assert.ok(isValidRuleId(id), `${target}: id "${id}" valid`);
      assert.ok(FUNCTION_NAMES.includes(rule.then.function));
      assert.match(rule.description, /Grounding —/);
    }
    // The 3.x-only rule must not appear in a 2.0-only ruleset.
    if (target === 'oas2') {
      assert.equal(doc.rules['oas-3-operation-get-requestBody-falsy-error'], undefined);
    }
    // In Both mode the twins appear with version-stamped ids and per-rule formats.
    if (target === 'both') {
      assert.ok(doc.rules['oas-3-server-base-url-truthy-warn'], 'oas3 twin present');
      assert.ok(doc.rules['oas-2-server-base-url-truthy-warn'], 'oas2 twin present');
      assert.deepEqual(doc.rules['oas-2-server-base-url-truthy-warn'].formats, ['oas2']);
      // The multipath rule fires on both without a formats tag.
      assert.ok(Array.isArray(doc.rules['oas-x-schema-property-description-truthy-warn'].given));
      assert.equal(doc.rules['oas-x-schema-property-description-truthy-warn'].formats, undefined);
    }
  }
});

test('the starter library and target catalog carry Swagger 2.0 coverage', () => {
  const divergentTemplates = TEMPLATES.filter((t) => formatPosture(t) !== 'any');
  assert.ok(divergentTemplates.length >= 5, `templates carry format awareness (has ${divergentTemplates.length})`);
  const divergentTargets = TARGETS.filter((t) => formatPosture(t) !== 'any');
  assert.ok(divergentTargets.length >= 8, `targets carry format awareness (has ${divergentTargets.length})`);
  // The whole library, emitted for a 2.0-only target, still yields real rules.
  const y = emitYaml(TEMPLATES, { target: 'oas2', generatedAt: '2026-07-03T12:00:00Z' });
  const check = parseCheck(y);
  assert.equal(check.ok, true);
  assert.ok(check.ruleCount > 0, 'the 2.0 ruleset is non-empty');
  const doc = yaml.load(y);
  assert.deepEqual(doc.formats, ['oas2'], 'top-level formats is oas2');
  // At least one rule reaches into the 2.0-only `definitions` store.
  const hitsDefinitions = Object.values(doc.rules).some((r) => {
    const g = Array.isArray(r.given) ? r.given.join(' ') : String(r.given);
    return g.includes('definitions');
  });
  assert.ok(hitsDefinitions, 'the 2.0 ruleset targets $.definitions');
});

test('escapes exotic content safely through js-yaml round-trip', () => {
  const tricky = [{
    id: 'oas-x-schema-note-pattern-warn', area: 'schemas', statement: 'x', given: '$.components.schemas[*]',
    field: '', fn: 'pattern', options: { match: '^:weird: "quotes" & <tags>$' },
    message: 'Must match: "quotes" & <tags>', severity: 'warn', framing: 'positive',
    description: 'Line one\nLine two', why: 'because', docs: 'https://x.test', owner: 'Team',
  }];
  const y = emitYaml(tricky, { generatedAt: '2026-07-03T12:00:00Z' });
  const doc = yaml.load(y);
  assert.equal(doc.rules['oas-x-schema-note-pattern-warn'].then.functionOptions.match, '^:weird: "quotes" & <tags>$');
  assert.equal(doc.rules['oas-x-schema-note-pattern-warn'].message, 'Must match: "quotes" & <tags>');
});
