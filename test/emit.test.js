import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import yaml from 'js-yaml';
import { emitYaml, buildRuleset, parseCheck, validateDraft, vaguenessHints } from '../src/emit-ruleset.js';
import { TEMPLATES } from '../src/templates.js';
import { isValidRuleId, FUNCTION_NAMES } from '../src/catalog.js';

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
    assert.ok(isValidRuleId(id), `id "${id}" follows area-subject-check`);
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
  const casing = doc.rules['schemas-property-casing'];
  assert.equal(casing.then.function, 'casing');
  assert.deepEqual(casing.then.functionOptions, { type: 'camel' });
  const opId = doc.rules['operations-operationId-defined'];
  assert.equal(opId.then.field, 'operationId');
  assert.equal(opId.then.function, 'defined');
  assert.equal(opId.then.functionOptions, undefined, 'defined takes no options');
  const getBody = doc.rules['operations-get-requestBody-falsy'];
  assert.equal(getBody.then.field, 'requestBody');
  assert.equal(getBody.then.function, 'falsy');
});

test('the whole starter library emits valid, grounded YAML', () => {
  const y = emitYaml(TEMPLATES, { generatedAt: '2026-07-03T12:00:00Z' });
  const check = parseCheck(y);
  assert.equal(check.ok, true);
  assert.equal(check.ruleCount, TEMPLATES.length);
  assert.ok(TEMPLATES.length >= 15, `starter library has at least 15 templates (has ${TEMPLATES.length})`);
  const doc = yaml.load(y);
  for (const [id, rule] of Object.entries(doc.rules)) {
    assert.ok(isValidRuleId(id));
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

test('escapes exotic content safely through js-yaml round-trip', () => {
  const tricky = [{
    id: 'schemas-note-pattern', area: 'schemas', statement: 'x', given: '$.components.schemas[*]',
    field: '', fn: 'pattern', options: { match: '^:weird: "quotes" & <tags>$' },
    message: 'Must match: "quotes" & <tags>', severity: 'warn', framing: 'positive',
    description: 'Line one\nLine two', why: 'because', docs: 'https://x.test', owner: 'Team',
  }];
  const y = emitYaml(tricky, { generatedAt: '2026-07-03T12:00:00Z' });
  const doc = yaml.load(y);
  assert.equal(doc.rules['schemas-note-pattern'].then.functionOptions.match, '^:weird: "quotes" & <tags>$');
  assert.equal(doc.rules['schemas-note-pattern'].message, 'Must match: "quotes" & <tags>');
});
