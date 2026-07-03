// catalog.js — the shared, pure vocabulary of Spectral Ruleset Studio.
//
// This module is imported by BOTH the browser SPA (src/site.ts, via Vite) and
// the Node CLI (bin/cli.js) and the emitter (src/emit-ruleset.js). It is plain
// ESM JavaScript with ZERO dependencies and no browser/Node-only globals, so it
// runs unchanged in either environment.
//
// It encodes three catalogs the tool builds every rule out of:
//   1. FUNCTIONS  — the 9 core Spectral functions you get WITHOUT custom JS.
//   2. TARGETS    — a library of common JSONPath `given` expressions.
//   3. AREAS      — the categories a grounded ruleset is organized into.
//   4. SEVERITIES — Spectral's four severity levels.
//   5. TARGET_MODES — the OpenAPI 3.x / Swagger 2.0 / Both output target.
//
// Nothing here talks to the network or the DOM; it is data + tiny helpers.
//
// FORMAT AWARENESS. Spectral auto-detects a document's format (`swagger: "2.0"`
// → `oas2`; `openapi: 3.x` → `oas3`) and runs a rule only on formats in its
// `formats` list (or on every document when a rule declares none). Many `given`
// targets diverge between the two specs (schemas live under `components.schemas`
// in 3.x but `definitions` in 2.0, security under `components.securitySchemes`
// vs `securityDefinitions`, and so on). So a TARGET can carry BOTH forms:
//   - `oas3: { given, field }` and `oas2: { given, field }` for a divergent
//     target. When the two forms share the same `field` (identical check on two
//     paths) the emitter collapses them into ONE multipath rule; when the field
//     differs it emits two format-tagged twin rules.
//   - `formats: ['oas3']` or `['oas2']` for a concept that only exists in one
//     spec (e.g. 3.x `requestBody`, 2.0 `host`/`schemes`).
// A target with neither is format-agnostic — one rule, no `formats`, fires on
// whichever document it is linted against.

// ---------------------------------------------------------------------------
// The four Spectral severities. `error` is the only build-failing one — the
// paper's discipline is to keep the blocking set small, so the tool defaults
// new rules to `warn` and makes `error` a deliberate choice.
// ---------------------------------------------------------------------------
export const SEVERITIES = [
  { key: 'error', label: 'Error', blurb: 'Fails the build. Reserve for the few things that genuinely cannot ship.', color: '#f14c4c' },
  { key: 'warn', label: 'Warning', blurb: 'Informs without blocking. The sensible default for most rules.', color: '#e3b341' },
  { key: 'info', label: 'Info', blurb: 'Advisory. Surfaces a preference or a nudge.', color: '#3794ff' },
  { key: 'hint', label: 'Hint', blurb: 'Lightest touch. A suggestion a developer can take or leave.', color: '#9aa0a6' },
];
export const SEVERITY_KEYS = SEVERITIES.map((s) => s.key);

// ---------------------------------------------------------------------------
// The output target — which OpenAPI dialect(s) the emitted ruleset should
// govern. `both` (the default) makes the ruleset apply to Swagger 2.0 AND
// OpenAPI 3.x with parity: divergent targets emit as a multipath `given` when
// the check is identical, or as format-tagged twin rules when it differs.
// `oas3` / `oas2` emit only that dialect's form of each rule. `formats` is the
// top-level `formats` array the emitter writes for that mode.
// ---------------------------------------------------------------------------
export const TARGET_MODES = [
  { key: 'both', label: 'Both — Swagger 2.0 + OpenAPI 3.x', short: 'Both', formats: ['oas2', 'oas3'] },
  { key: 'oas3', label: 'OpenAPI 3.x only', short: 'OpenAPI 3.x', formats: ['oas3'] },
  { key: 'oas2', label: 'Swagger / OpenAPI 2.0 only', short: 'Swagger 2.0', formats: ['oas2'] },
];
export const TARGET_MODE_KEYS = TARGET_MODES.map((m) => m.key);
export function getTargetMode(key) {
  return TARGET_MODES.find((m) => m.key === key) || TARGET_MODES[0];
}

// ---------------------------------------------------------------------------
// The categories a grounded ruleset is organized into. The emitted YAML groups
// rules under these as comment banners, and rule ids are conventionally
// prefixed with the area: `<area>-<subject>-<check>` (e.g. operations-summary-defined).
// ---------------------------------------------------------------------------
export const AREAS = [
  { key: 'info', label: 'API metadata (info)', blurb: 'Title, description, version, contact, license.' },
  { key: 'operations', label: 'Operations', blurb: 'operationId, summaries, descriptions, tags.' },
  { key: 'parameters', label: 'Parameters', blurb: 'Naming, descriptions, required flags.' },
  { key: 'responses', label: 'Responses', blurb: 'Success and error responses, error schema shape.' },
  { key: 'schemas', label: 'Schemas', blurb: 'Property descriptions, examples, casing.' },
  { key: 'security', label: 'Security', blurb: 'Declared security schemes and requirements.' },
  { key: 'naming', label: 'Naming & casing', blurb: 'Path, property and component naming conventions.' },
  { key: 'servers', label: 'Servers & tags', blurb: 'Server URLs, tag definitions and descriptions.' },
];
export const AREA_KEYS = AREAS.map((a) => a.key);

// ---------------------------------------------------------------------------
// The 9 core Spectral functions available WITHOUT writing custom JavaScript.
// Each carries the shape of its `functionOptions` so the UI can render the
// right inputs and the emitter can serialize `then.functionOptions` correctly.
//
// option.type is one of: 'string' | 'number' | 'boolean' | 'enum' | 'list' | 'json'
// ---------------------------------------------------------------------------
export const FUNCTIONS = [
  {
    name: 'defined',
    summary: 'The target value must be present.',
    positive: true,
    options: [],
    example: 'Every operation must declare an operationId.',
  },
  {
    name: 'truthy',
    summary: 'The target must be present and truthy (not empty/false/null).',
    positive: true,
    options: [],
    example: 'info.description must be present and non-empty.',
  },
  {
    name: 'falsy',
    summary: 'The target must be absent or falsy.',
    positive: false,
    options: [],
    example: 'GET operations must not declare a requestBody.',
  },
  {
    name: 'undefined',
    summary: 'The target must NOT be present.',
    positive: false,
    options: [],
    example: 'A deprecated extension must not appear on new operations.',
  },
  {
    name: 'pattern',
    summary: 'The target string must match / not match a regular expression.',
    positive: true,
    options: [
      { key: 'match', type: 'string', label: 'match (regex)', placeholder: '^[a-z][a-zA-Z0-9]+$', help: 'Value MUST match this expression.' },
      { key: 'notMatch', type: 'string', label: 'notMatch (regex)', placeholder: '\\s', help: 'Value must NOT match this expression.' },
    ],
    example: 'Path segments must be kebab-case.',
  },
  {
    name: 'length',
    summary: 'The target string/array/object must fall within a length range.',
    positive: true,
    options: [
      { key: 'min', type: 'number', label: 'min', placeholder: '1', help: 'Minimum length (inclusive).' },
      { key: 'max', type: 'number', label: 'max', placeholder: '120', help: 'Maximum length (inclusive).' },
    ],
    example: 'Summaries must be between 1 and 120 characters.',
  },
  {
    name: 'casing',
    summary: 'The target string must follow a casing convention.',
    positive: true,
    options: [
      {
        key: 'type', type: 'enum', label: 'type', required: true,
        values: ['flat', 'camel', 'pascal', 'kebab', 'cobol', 'snake', 'macro'],
        help: 'The casing style the value must follow.',
      },
      { key: 'disallowDigits', type: 'boolean', label: 'disallowDigits', help: 'Reject digits in the value.' },
      { key: 'separator.char', type: 'string', label: 'separator char', placeholder: '/', help: 'Optional separator that splits the value before casing each part.' },
    ],
    example: 'Schema property names must be camelCase.',
  },
  {
    name: 'enumeration',
    summary: 'The target must be one of an allowed set of values.',
    positive: true,
    options: [
      { key: 'values', type: 'list', label: 'values', placeholder: 'application/json, application/problem+json', required: true, help: 'Comma-separated list of allowed values.' },
    ],
    example: 'Response content types must be one of an approved set.',
  },
  {
    name: 'alphabetical',
    summary: 'Array/object keys must be in alphabetical order.',
    positive: true,
    options: [
      { key: 'keyedBy', type: 'string', label: 'keyedBy', placeholder: 'name', help: 'For arrays of objects, the property to sort by.' },
    ],
    example: 'Tags must be declared in alphabetical order.',
  },
  {
    name: 'schema',
    summary: 'The target must validate against a JSON Schema.',
    positive: true,
    options: [
      { key: 'schema', type: 'json', label: 'schema (JSON)', placeholder: '{ "type": "object", "required": ["message"] }', required: true, help: 'The JSON Schema the value must satisfy.' },
    ],
    example: 'Every error response body must match the standard problem schema.',
  },
];
export const FUNCTION_NAMES = FUNCTIONS.map((f) => f.name);
export function getFunction(name) {
  return FUNCTIONS.find((f) => f.name === name) || null;
}

// ---------------------------------------------------------------------------
// A library of common JSONPath `given` targets, grouped by area, so the user
// picks from a menu instead of writing JSONPath from scratch. `field` is the
// conventional `then.field` to pair with the target (may be empty).
//
// A divergent target carries `oas3` + `oas2` sub-forms (each `{ given, field }`)
// and its top-level `given`/`field` mirror the 3.x form (what the picker shows).
// A single-spec target carries `formats: ['oas3']` or `['oas2']`. See the header
// note for how the emitter turns these into multipath vs twin rules.
// ---------------------------------------------------------------------------
export const TARGETS = [
  // info — format-agnostic (the info object is identical in 2.0 and 3.x).
  { area: 'info', label: 'The info object', given: '$.info', field: '' },
  { area: 'info', label: 'API description', given: '$.info', field: 'description' },
  { area: 'info', label: 'API contact', given: '$.info', field: 'contact' },
  { area: 'info', label: 'API license', given: '$.info', field: 'license' },
  { area: 'info', label: 'API version', given: '$.info', field: 'version' },
  // operations — format-agnostic (paths/operations/operationId/summary/tags all shared).
  { area: 'operations', label: 'Every operation', given: '$.paths[*][get,put,post,delete,options,head,patch]', field: '' },
  { area: 'operations', label: 'Operation operationId', given: '$.paths[*][get,put,post,delete,options,head,patch]', field: 'operationId' },
  { area: 'operations', label: 'Operation summary', given: '$.paths[*][get,put,post,delete,options,head,patch]', field: 'summary' },
  { area: 'operations', label: 'Operation description', given: '$.paths[*][get,put,post,delete,options,head,patch]', field: 'description' },
  { area: 'operations', label: 'Operation tags', given: '$.paths[*][get,put,post,delete,options,head,patch]', field: 'tags' },
  // requestBody is a 3.x-only object; 2.0 uses body/formData parameters.
  { area: 'operations', label: 'GET operation requestBody (3.x only)', given: '$.paths[*].get', field: 'requestBody', formats: ['oas3'] },
  { area: 'operations', label: 'GET body/formData parameter (2.0 only)', given: "$.paths[*].get.parameters[?(@.in=='body' || @.in=='formData')]", field: '', formats: ['oas2'] },
  // parameters
  { area: 'parameters', label: 'Every parameter (inline)', given: '$.paths[*][*].parameters[*]', field: '' },
  {
    area: 'parameters', label: 'Every parameter (reusable)', given: '$.components.parameters[*]', field: '',
    oas3: { given: '$.components.parameters[*]', field: '' },
    oas2: { given: '$.parameters[*]', field: '' },
  },
  { area: 'parameters', label: 'Parameter name', given: '$.paths[*][*].parameters[*]', field: 'name' },
  { area: 'parameters', label: 'Parameter description', given: '$.paths[*][*].parameters[*]', field: 'description' },
  // responses — the map, existence and descriptions are shared…
  { area: 'responses', label: 'Operation responses map', given: '$.paths[*][get,put,post,delete,options,head,patch].responses', field: '' },
  { area: 'responses', label: 'Every response', given: '$.paths[*][*].responses[*]', field: '' },
  { area: 'responses', label: 'Response description', given: '$.paths[*][*].responses[*]', field: 'description' },
  // …but the error BODY lives under `.content` (3.x) vs `.schema` (2.0). Same
  // truthy check on two paths → the emitter multipaths this.
  {
    area: 'responses', label: 'Error responses (4xx/5xx) body', given: "$.paths[*][*].responses[?(@property.match(/^(4|5)/))].content", field: '',
    oas3: { given: "$.paths[*][*].responses[?(@property.match(/^(4|5)/))].content", field: '' },
    oas2: { given: "$.paths[*][*].responses[?(@property.match(/^(4|5)/))].schema", field: '' },
  },
  // schemas — `components.schemas` (3.x) vs `definitions` (2.0).
  {
    area: 'schemas', label: 'Every reusable schema', given: '$.components.schemas[*]', field: '',
    oas3: { given: '$.components.schemas[*]', field: '' },
    oas2: { given: '$.definitions[*]', field: '' },
  },
  {
    area: 'schemas', label: 'Schema name (key)', given: '$.components.schemas', field: '',
    oas3: { given: '$.components.schemas', field: '' },
    oas2: { given: '$.definitions', field: '' },
  },
  {
    area: 'schemas', label: 'Every schema property', given: '$.components.schemas[*].properties[*]', field: '',
    oas3: { given: '$.components.schemas[*].properties[*]', field: '' },
    oas2: { given: '$.definitions[*].properties[*]', field: '' },
  },
  {
    area: 'schemas', label: 'Schema property description', given: '$.components.schemas[*].properties[*]', field: 'description',
    oas3: { given: '$.components.schemas[*].properties[*]', field: 'description' },
    oas2: { given: '$.definitions[*].properties[*]', field: 'description' },
  },
  {
    area: 'schemas', label: 'Schema property names', given: '$.components.schemas[*].properties', field: '',
    oas3: { given: '$.components.schemas[*].properties', field: '' },
    oas2: { given: '$.definitions[*].properties', field: '' },
  },
  {
    area: 'schemas', label: 'Schema example', given: '$.components.schemas[*]', field: 'example',
    oas3: { given: '$.components.schemas[*]', field: 'example' },
    oas2: { given: '$.definitions[*]', field: 'example' },
  },
  // security — top-level requirement is shared; the scheme store diverges.
  { area: 'security', label: 'Top-level security', given: '$', field: 'security' },
  {
    area: 'security', label: 'Security schemes', given: '$.components.securitySchemes[*]', field: '',
    oas3: { given: '$.components.securitySchemes[*]', field: '' },
    oas2: { given: '$.securityDefinitions[*]', field: '' },
  },
  { area: 'security', label: 'Operation security', given: '$.paths[*][get,put,post,delete,options,head,patch]', field: 'security' },
  // naming
  { area: 'naming', label: 'Every path (key)', given: '$.paths', field: '' },
  {
    area: 'naming', label: 'Reusable schema names (key)', given: '$.components.schemas', field: '',
    oas3: { given: '$.components.schemas', field: '' },
    oas2: { given: '$.definitions', field: '' },
  },
  // servers & tags — multiple `servers` is 3.x-only; 2.0 uses host/schemes.
  { area: 'servers', label: 'Every server (3.x only)', given: '$.servers[*]', field: '', formats: ['oas3'] },
  {
    area: 'servers', label: 'Base URL (server URL / host)', given: '$.servers[*]', field: 'url',
    oas3: { given: '$.servers[*]', field: 'url' },
    oas2: { given: '$', field: 'host' },
  },
  { area: 'servers', label: 'The tags array', given: '$.tags', field: '' },
  { area: 'servers', label: 'Every tag', given: '$.tags[*]', field: '' },
  { area: 'servers', label: 'Tag description', given: '$.tags[*]', field: 'description' },
];
export function targetsForArea(area) {
  return TARGETS.filter((t) => t.area === area);
}

// Describe a target's / draft's format posture for the UI: 'both' (divergent,
// carries oas2+oas3 forms), 'oas3', 'oas2', or 'any' (format-agnostic).
export function formatPosture(t) {
  if (t && t.oas2 && t.oas3) return 'both';
  if (t && Array.isArray(t.formats) && t.formats.length === 1) {
    return t.formats[0].startsWith('oas2') ? 'oas2' : 'oas3';
  }
  return 'any';
}

// A convention regex for rule ids: <area>-<subject>-<check>. Segments are
// kebab-joined and start lower-case; a segment may carry a camelCase subject
// (e.g. operations-operationId-defined) as Spectral rule names commonly do.
export const RULE_ID_RE = /^[a-z][a-zA-Z0-9]*(-[a-zA-Z0-9]+)+$/;
export function isValidRuleId(id) {
  return typeof id === 'string' && RULE_ID_RE.test(id);
}
