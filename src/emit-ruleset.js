// emit-ruleset.js — the shared, pure ruleset EMITTER.
//
// This module is imported by BOTH the browser SPA (src/site.ts, via Vite) and
// the Node CLI (bin/cli.js). Given a set of rule drafts it produces a valid,
// categorized `.spectral.yaml` string in which EVERY rule carries grounding
// metadata: a convention-following id, a human description, a message, a
// severity, a documentation URL, an owner, and who/what/when/where/why context.
//
// It depends only on `js-yaml` (which bundles cleanly for both Node and the
// browser) — no DOM, no Node-only globals beyond the import.
//
// The grounding is carried two ways so the output is portable AND machine-
// readable:
//   1. In each rule's `description` — always valid Spectral, works everywhere.
//   2. Mirrored as an `x-grounding` extension per rule (opt-out) for tooling
//      that wants it structured.

import yaml from 'js-yaml';
import { getFunction, isValidRuleId, AREAS, SEVERITY_KEYS, getTargetMode } from './catalog.js';

/**
 * @typedef {Object} RuleDraft
 * @property {string} id        rule id, convention `<spec>-<version>-<property>-<semantics>-<severity>`
 * @property {string} area      one of catalog AREAS keys
 * @property {string} statement the source style-guide prose
 * @property {string} given     JSONPath target (the format-common / 3.x form)
 * @property {string} [field]   optional `then.field`
 * @property {{given:string, field?:string}} [oas3] the OpenAPI 3.x form of a divergent target
 * @property {{given:string, field?:string}} [oas2] the Swagger 2.0 form of a divergent target
 * @property {string[]} [formats] restrict to Spectral formats (e.g. ['oas3'] for a 3.x-only concept)
 * @property {string} fn        one of the 9 core function names
 * @property {Object} [options] function options (then.functionOptions)
 * @property {string} message   the message shown when the rule fires
 * @property {('error'|'warn'|'info'|'hint')} severity
 * @property {('positive'|'negative')} [framing]
 * @property {string} description human description (grounding)
 * @property {string} [why]     rationale — why this rule exists
 * @property {string} [docs]    documentation / policy URL
 * @property {string} [owner]   who owns this rule
 * @property {string} [who]     who it applies to
 * @property {string} [what]    what it checks
 * @property {string} [when]    when / at what lifecycle stage it fires
 * @property {string} [where]   where the rule lives / is enforced
 */

const AREA_LABEL = new Map(AREAS.map((a) => [a.key, a.label]));

/**
 * @typedef {Object} RuleVariant
 * @property {string|string[]} given the JSONPath (an array = multipath)
 * @property {string} [field]        then.field for this variant
 * @property {string[]} [formats]    per-rule Spectral formats tag
 * @property {string} [version]      concrete version token ('2'|'3') to stamp into the id's version segment
 * @property {string} [idSuffix]     fallback suffix for a twin whose id doesn't follow the convention (e.g. '-oas2')
 */

/** Normalize a target-mode key to one of 'both' | 'oas3' | 'oas2'. */
export function normalizeTargetMode(mode) {
  return getTargetMode(mode).key;
}

/** The top-level `formats` array for a target mode. */
export function formatsForMode(mode) {
  return getTargetMode(mode).formats.slice();
}

/**
 * Resolve one draft into the concrete rule VARIANTS to emit for a target mode.
 *
 * The decision (see catalog.js header note):
 *   - Divergent draft (both `oas2` and `oas3` forms present):
 *       • mode oas3 / oas2 → emit only that form (one rule, no per-rule formats).
 *       • mode both, same `field` on both forms → ONE multipath rule
 *         (`given: [oas3, oas2]`, no formats) — the check is identical.
 *       • mode both, different `field` → TWO twin rules, `-oas3`/`-oas2`,
 *         each tagged `formats: [oas3]` / `[oas2]` — the check differs.
 *   - Single-spec draft (`formats: ['oas3']` or `['oas2']`): emitted with that
 *     formats tag in `both` mode, kept in its own mode, dropped in the other.
 *   - Format-agnostic draft: one rule, no formats — fires on 2.0 and 3.x alike.
 *
 * @param {RuleDraft} d
 * @param {string} [mode] 'both' | 'oas3' | 'oas2'
 * @returns {RuleVariant[]}
 */
export function resolveVariants(d, mode = 'both') {
  const m = normalizeTargetMode(mode);
  const o3 = d.oas3 && d.oas3.given ? { given: d.oas3.given, field: d.oas3.field != null ? d.oas3.field : (d.field || '') } : null;
  const o2 = d.oas2 && d.oas2.given ? { given: d.oas2.given, field: d.oas2.field != null ? d.oas2.field : (d.field || '') } : null;
  const explicit = Array.isArray(d.formats) && d.formats.length ? d.formats.slice() : null;

  // Divergent — both spec forms supplied.
  if (o2 && o3) {
    if (m === 'oas3') return [{ given: o3.given, field: o3.field, version: '3' }];
    if (m === 'oas2') return [{ given: o2.given, field: o2.field, version: '2' }];
    const sameField = String(o3.field || '') === String(o2.field || '');
    if (sameField) {
      // Identical check on two paths → one multipath rule (collapse if same path).
      // The version segment stays `x` — it fires on both 2.0 and 3.x.
      const given = o3.given === o2.given ? o3.given : [o3.given, o2.given];
      return [{ given, field: o3.field }];
    }
    // The check itself differs → version-stamped twins (oas-3-… / oas-2-…).
    return [
      { given: o3.given, field: o3.field, formats: ['oas3'], version: '3', idSuffix: '-oas3' },
      { given: o2.given, field: o2.field, formats: ['oas2'], version: '2', idSuffix: '-oas2' },
    ];
  }

  // Only one spec form supplied → treat as a single-spec concept.
  if (o3 && !o2) {
    if (m === 'oas2') return [];
    return [{ given: o3.given, field: o3.field, formats: m === 'both' ? ['oas3'] : undefined, version: '3' }];
  }
  if (o2 && !o3) {
    if (m === 'oas3') return [];
    return [{ given: o2.given, field: o2.field, formats: m === 'both' ? ['oas2'] : undefined, version: '2' }];
  }

  // Format-agnostic, possibly narrowed by an explicit `formats` restriction.
  if (explicit) {
    const supports = (fmt) => explicit.some((f) => f === fmt || f.startsWith(fmt));
    if (m !== 'both' && !supports(m)) return []; // this mode is excluded
    // A single explicit format pins the version segment (e.g. ['oas3'] → 3).
    let version;
    if (explicit.length === 1) {
      const mm = /^oas(\d)$/.exec(explicit[0]);
      if (mm) version = mm[1];
    }
    return [{ given: d.given, field: d.field, formats: m === 'both' ? explicit : undefined, version }];
  }
  return [{ given: d.given, field: d.field }];
}

// ---------------------------------------------------------------------------
// Compose a variant's EMITTED id from the draft's base id. When the variant
// carries a concrete `version` and the base id follows the convention, the
// version segment (dimension 2) is stamped in place — so a divergent draft
// authored `oas-x-server-base-url-truthy-warn` emits `oas-3-…` and `oas-2-…`
// twins. For a non-conforming hand-authored id we fall back to the `-oas3` /
// `-oas2` suffix so the two twins never collide.
// ---------------------------------------------------------------------------
export function setRuleIdVersion(id, version) {
  const m = /^(oas|aas|arazzo|jsonschema)-([a-zA-Z0-9]+)-(.+)$/.exec(String(id));
  return m ? `${m[1]}-${version}-${m[3]}` : null;
}

export function emitRuleId(baseId, variant) {
  const v = variant || {};
  if (v.version) {
    const swapped = setRuleIdVersion(baseId, v.version);
    if (swapped) return swapped;
  }
  return baseId + (v.idSuffix || '');
}

// Words that usually mean the prose has not yet been distilled into something
// executable — the act of writing the rule should force these to be resolved.
const VAGUE_WORDS = [
  'meaningful', 'appropriate', 'appropriately', 'reasonable', 'reasonably',
  'sensible', 'sensibly', 'properly', 'proper', 'good', 'nice', 'clean',
  'clear', 'clearly', 'consistent', 'consistently', 'descriptive', 'well',
  'as needed', 'as appropriate', 'where possible', 'etc', 'and so on',
  'user-friendly', 'intuitive', 'sane',
];

/** Surface a hint when a prose statement is too vague to distill into a rule. */
export function vaguenessHints(statement) {
  const hits = [];
  const s = String(statement || '').toLowerCase();
  for (const w of VAGUE_WORDS) {
    const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(s)) hits.push(w);
  }
  return hits;
}

/**
 * Validate a single draft. Returns an array of issues, each
 * `{ field, level: 'error'|'warn', message }`. `error` means the emitted rule
 * would be incomplete or invalid; `warn` means grounding is thin.
 */
export function validateDraft(draft) {
  const issues = [];
  const d = draft || {};

  if (!d.id) issues.push({ field: 'id', level: 'error', message: 'A rule id is required.' });
  else if (!isValidRuleId(d.id)) issues.push({ field: 'id', level: 'error', message: 'Id must follow the convention spec-version-property-semantics-severity (e.g. oas-x-operation-summary-truthy-warn).' });

  if (!d.given) issues.push({ field: 'given', level: 'error', message: 'A JSONPath `given` target is required.' });
  if (!d.fn || !getFunction(d.fn)) issues.push({ field: 'fn', level: 'error', message: 'Pick one of the 9 core Spectral functions.' });
  if (!d.message) issues.push({ field: 'message', level: 'error', message: 'A `message` is required — it is what a developer reads when the rule fires.' });
  if (!SEVERITY_KEYS.includes(d.severity)) issues.push({ field: 'severity', level: 'error', message: 'Pick a severity (error, warn, info, or hint).' });

  // Grounding — the whole point of the tool.
  if (!d.description || !String(d.description).trim()) issues.push({ field: 'description', level: 'error', message: 'A human description is required — grounding turns a verdict into guidance.' });
  if (!d.why || !String(d.why).trim()) issues.push({ field: 'why', level: 'warn', message: 'Add a rationale (why) so a red build teaches instead of just stopping.' });
  if (!d.docs || !String(d.docs).trim()) issues.push({ field: 'docs', level: 'warn', message: 'Add a docs/policy link so every finding can point to why.' });
  else if (!/^https?:\/\//i.test(String(d.docs).trim())) issues.push({ field: 'docs', level: 'warn', message: 'The docs link should be a URL (http/https).' });
  if (!d.owner || !String(d.owner).trim()) issues.push({ field: 'owner', level: 'warn', message: 'Name an owner — an unowned rule is one nobody at the org can explain.' });

  // Function-specific option requirements.
  const fn = getFunction(d.fn);
  if (fn) {
    const opts = d.options || {};
    if (fn.name === 'enumeration' && !(Array.isArray(opts.values) ? opts.values.length : opts.values)) {
      issues.push({ field: 'options', level: 'error', message: 'The enumeration function needs a non-empty `values` list.' });
    }
    if (fn.name === 'casing' && !opts.type) {
      issues.push({ field: 'options', level: 'error', message: 'The casing function needs a `type` (camel, kebab, snake, …).' });
    }
    if (fn.name === 'pattern' && !opts.match && !opts.notMatch) {
      issues.push({ field: 'options', level: 'error', message: 'The pattern function needs a `match` and/or `notMatch` expression.' });
    }
    if (fn.name === 'length' && opts.min == null && opts.max == null) {
      issues.push({ field: 'options', level: 'error', message: 'The length function needs a `min` and/or `max`.' });
    }
    if (fn.name === 'schema' && !opts.schema) {
      issues.push({ field: 'options', level: 'error', message: 'The schema function needs a `schema` object.' });
    }
  }

  // Distillation nudge.
  const vague = vaguenessHints(d.statement);
  if (vague.length) issues.push({ field: 'statement', level: 'warn', message: `This statement is vague ("${vague.join('", "')}"). The rule should pin down exactly what is checked.` });

  return issues;
}

// Coerce a draft's function options into the actual `then.functionOptions`
// shape Spectral expects (numbers as numbers, separator as an object, etc.).
function buildFunctionOptions(fn, options) {
  const o = options || {};
  const out = {};
  switch (fn.name) {
    case 'pattern':
      if (o.match) out.match = String(o.match);
      if (o.notMatch) out.notMatch = String(o.notMatch);
      break;
    case 'length':
      if (o.min != null && o.min !== '') out.min = Number(o.min);
      if (o.max != null && o.max !== '') out.max = Number(o.max);
      break;
    case 'casing':
      if (o.type) out.type = String(o.type);
      if (o.disallowDigits) out.disallowDigits = true;
      if (o['separator.char']) out.separator = { char: String(o['separator.char']) };
      break;
    case 'enumeration': {
      const vals = Array.isArray(o.values)
        ? o.values
        : String(o.values || '').split(',').map((v) => v.trim()).filter(Boolean);
      out.values = vals;
      break;
    }
    case 'alphabetical':
      if (o.keyedBy) out.keyedBy = String(o.keyedBy);
      break;
    case 'schema':
      if (o.schema) out.schema = typeof o.schema === 'string' ? JSON.parse(o.schema) : o.schema;
      break;
    default:
      break; // defined / truthy / falsy / undefined take no options
  }
  return out;
}

// Build the grounding block folded into the rule `description`.
function groundingDescription(d) {
  const lines = [];
  if (d.description) lines.push(String(d.description).trim());
  lines.push('');
  lines.push('Grounding —');
  if (d.statement) lines.push(`  Source statement: ${oneLine(d.statement)}`);
  if (d.why) lines.push(`  Why: ${oneLine(d.why)}`);
  lines.push(`  Framing: ${d.framing === 'negative' ? 'negative (flags what is wrong)' : 'positive (recognizes what is right)'}`);
  if (d.owner) lines.push(`  Owner (who): ${oneLine(d.owner)}`);
  if (d.who) lines.push(`  Applies to (who): ${oneLine(d.who)}`);
  if (d.what) lines.push(`  Checks (what): ${oneLine(d.what)}`);
  if (d.when) lines.push(`  Fires (when): ${oneLine(d.when)}`);
  if (d.where) lines.push(`  Enforced (where): ${oneLine(d.where)}`);
  if (d.docs) lines.push(`  Docs (why link): ${oneLine(d.docs)}`);
  return lines.join('\n');
}

function oneLine(v) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
}

// Build the single rule object (no id key) Spectral consumes. `variant` carries
// the resolved given/field/formats for this emission (see resolveVariants).
function buildRule(d, includeExtensions, variant) {
  const v = variant || { given: d.given, field: d.field };
  const fn = getFunction(d.fn);
  const then = { function: fn ? fn.name : d.fn };
  if (v.field) then.field = v.field;
  const fnOpts = fn ? buildFunctionOptions(fn, d.options) : {};
  if (Object.keys(fnOpts).length) then.functionOptions = fnOpts;
  // `field` reads best before `function`; rebuild in a friendly key order.
  const orderedThen = {};
  if (then.field) orderedThen.field = then.field;
  orderedThen.function = then.function;
  if (then.functionOptions) orderedThen.functionOptions = then.functionOptions;

  const rule = {
    description: groundingDescription(d),
    message: d.message,
    severity: d.severity,
  };
  if (v.formats && v.formats.length) rule.formats = v.formats;
  rule.given = v.given;
  rule.then = orderedThen;
  if (d.docs) rule.documentationUrl = d.docs;
  if (includeExtensions) {
    rule['x-grounding'] = {
      statement: oneLine(d.statement) || undefined,
      framing: d.framing === 'negative' ? 'negative' : 'positive',
      owner: oneLine(d.owner) || undefined,
      why: oneLine(d.why) || undefined,
      who: oneLine(d.who) || undefined,
      what: oneLine(d.what) || undefined,
      when: oneLine(d.when) || undefined,
      where: oneLine(d.where) || undefined,
    };
    // Drop undefined keys so the YAML stays clean.
    for (const k of Object.keys(rule['x-grounding'])) {
      if (rule['x-grounding'][k] === undefined) delete rule['x-grounding'][k];
    }
  }
  return rule;
}

/**
 * Build the whole ruleset as a plain JS object (no comments).
 * @param {RuleDraft[]} drafts
 * @param {Object} [opts]
 * @param {string} [opts.documentationUrl] top-level docs link
 * @param {string} [opts.target] output target — 'both' (default) | 'oas3' | 'oas2'
 * @param {string[]} [opts.formats] override top-level Spectral formats (defaults from target)
 * @param {boolean} [opts.includeExtensions] mirror grounding as x-grounding (default true)
 * @returns {Object}
 */
export function buildRuleset(drafts, opts = {}) {
  const includeExtensions = opts.includeExtensions !== false;
  const mode = normalizeTargetMode(opts.target);
  const list = Array.isArray(drafts) ? drafts : [];
  const ruleset = {};
  const topDocs = opts.documentationUrl || firstDocs(list);
  if (topDocs) ruleset.documentationUrl = topDocs;
  ruleset.formats = opts.formats && opts.formats.length ? opts.formats : formatsForMode(mode);
  ruleset.rules = {};
  for (const d of list) {
    if (!d || !d.id) continue;
    for (const v of resolveVariants(d, mode)) {
      ruleset.rules[emitRuleId(d.id, v)] = buildRule(d, includeExtensions, v);
    }
  }
  return ruleset;
}

function firstDocs(list) {
  const d = list.find((x) => x && x.docs);
  return d ? d.docs : '';
}

// Order drafts by area (as declared in AREAS), preserving input order within an area.
function groupByArea(drafts) {
  const order = AREAS.map((a) => a.key);
  const buckets = new Map();
  for (const d of drafts) {
    const key = order.includes(d.area) ? d.area : 'other';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(d);
  }
  const result = [];
  for (const key of order) if (buckets.has(key)) result.push([key, buckets.get(key)]);
  if (buckets.has('other')) result.push(['other', buckets.get('other')]);
  return result;
}

const DUMP_OPTS = { lineWidth: 100, noRefs: true, quotingType: '"', forceQuotes: false, sortKeys: false };

function indent(text, spaces) {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((l) => (l.length ? pad + l : l))
    .join('\n');
}

/**
 * Emit a categorized `.spectral.yaml` string with a header and per-area banners.
 * Every rule carries grounding. The body is produced by js-yaml so escaping is
 * always correct; banners/comments are injected between rule blocks.
 *
 * @param {RuleDraft[]} drafts
 * @param {Object} [opts]
 * @param {string} [opts.title] ruleset title used in the header comment
 * @param {string} [opts.generatedAt] ISO timestamp for the header
 * @param {boolean} [opts.includeExtensions] mirror grounding as x-grounding (default true)
 * @param {string} [opts.documentationUrl] top-level docs link
 * @param {string} [opts.target] output target — 'both' (default) | 'oas3' | 'oas2'
 * @param {string[]} [opts.formats] override top-level Spectral formats (defaults from target)
 * @returns {string}
 */
export function emitYaml(drafts, opts = {}) {
  const includeExtensions = opts.includeExtensions !== false;
  const mode = normalizeTargetMode(opts.target);
  const list = (Array.isArray(drafts) ? drafts : []).filter((d) => d && d.id);
  const title = opts.title || 'API Governance Ruleset';
  const when = opts.generatedAt || new Date().toISOString();

  // Actual emitted rule count (a divergent draft may fan out to two twins, or
  // drop to zero when the target mode excludes it).
  const variantsByDraft = list.map((d) => resolveVariants(d, mode));
  const ruleCount = variantsByDraft.reduce((n, vs) => n + vs.length, 0);
  const modeShort = getTargetMode(mode).short;

  const header = [
    `# ${title}`,
    `# An OWNED, grounded Spectral ruleset — ${ruleCount} rule${ruleCount === 1 ? '' : 's'}.`,
    `# Target: ${modeShort}. Built with Spectral Ruleset Studio (studio.apicommons.org).`,
    '#',
    '# Every rule below was distilled from a style-guide statement on purpose, and',
    '# carries its grounding (owner, rationale, source, framing) in its description',
    includeExtensions ? '# and in an x-grounding extension. This is a ruleset someone can explain.' : '# so a red build teaches instead of just stopping.',
    `# Generated ${when}. Review, own, and tune before you gate on it.`,
    '',
  ];

  const out = [header.join('\n')];

  // Top-level keys (documentationUrl, formats) rendered first.
  const top = {};
  const topDocs = opts.documentationUrl || firstDocs(list);
  if (topDocs) top.documentationUrl = topDocs;
  top.formats = opts.formats && opts.formats.length ? opts.formats : formatsForMode(mode);
  out.push(yaml.dump(top, DUMP_OPTS).trimEnd());

  out.push('rules:');
  const grouped = groupByArea(list);
  if (!grouped.length || !ruleCount) {
    out.push('  {}');
  }
  for (const [areaKey, items] of grouped) {
    // Skip an area whose every rule was dropped by the target mode.
    const emit = items.filter((d) => resolveVariants(d, mode).length);
    if (!emit.length) continue;
    const label = AREA_LABEL.get(areaKey) || 'Other';
    out.push(`  # ─────────────────────────────────────────────────────────`);
    out.push(`  # ${label}`);
    out.push(`  # ─────────────────────────────────────────────────────────`);
    for (const d of emit) {
      for (const v of resolveVariants(d, mode)) {
        const rule = buildRule(d, includeExtensions, v);
        const block = yaml.dump({ [emitRuleId(d.id, v)]: rule }, DUMP_OPTS).trimEnd();
        out.push(indent(block, 2));
        out.push('');
      }
    }
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

/**
 * Parse-check emitted YAML. Returns `{ ok, doc, ruleCount, error }`.
 * Used by the SPA's "valid YAML" indicator and by the test.
 */
export function parseCheck(yamlStr) {
  try {
    const doc = yaml.load(yamlStr);
    const ruleCount = doc && doc.rules ? Object.keys(doc.rules).length : 0;
    return { ok: true, doc, ruleCount, error: null };
  } catch (e) {
    return { ok: false, doc: null, ruleCount: 0, error: e && e.message ? e.message : String(e) };
  }
}
