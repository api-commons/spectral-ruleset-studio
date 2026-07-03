// studio.apicommons.org — the Spectral Ruleset Studio controller.
//
// It manages a list of rule DRAFTS, renders an editable card per draft, and
// emits a live, categorized `.spectral.yaml` on the right using the SAME shared
// emitter the CLI uses — so the YAML you copy here is byte-identical to what the
// terminal writes. Everything is client-side; nothing leaves the browser.

import { emitYaml, parseCheck, validateDraft, vaguenessHints } from './emit-ruleset.js';
import { FUNCTIONS, getFunction, AREAS, SEVERITIES, targetsForArea, TARGET_MODES, formatPosture } from './catalog.js';
import { TEMPLATES } from './templates.js';
import sampleStatements from '../fixtures/sample-statements.json';
import { initEngage } from './engage';
import './style.css';

// Mirror of the JSDoc RuleDraft in emit-ruleset.js (that module is plain JS, so
// the shape is declared here for the TypeScript UI).
interface RuleDraft {
  id: string;
  area: string;
  statement: string;
  given: string;
  field?: string;
  oas3?: { given: string; field?: string };
  oas2?: { given: string; field?: string };
  formats?: string[];
  fn: string;
  options?: Record<string, unknown>;
  message: string;
  severity: string;
  framing?: 'positive' | 'negative';
  description: string;
  why?: string;
  docs?: string;
  owner?: string;
  who?: string;
  what?: string;
  when?: string;
  where?: string;
}

type Draft = RuleDraft & { uid: string };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const el = (tag: string, cls?: string, html?: string) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = (s: unknown) =>
  String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let seq = 0;
const drafts: Draft[] = [];

const rulesEl = $('rules');
const emptyEl = $('rules-empty');
const yamlCode = $<HTMLElement>('yaml-code');
const validBadge = $<HTMLElement>('yaml-valid');
const extCheck = $<HTMLInputElement>('ext-check');
const targetSelect = $<HTMLSelectElement>('target-mode');

// The output target — which OpenAPI dialect(s) the ruleset governs.
let targetMode = 'both';
targetSelect.innerHTML = TARGET_MODES.map(
  (m) => `<option value="${m.key}" ${m.key === targetMode ? 'selected' : ''}>${esc(m.label)}</option>`,
).join('');
targetSelect.addEventListener('change', () => {
  targetMode = targetSelect.value || 'both';
  refresh();
});

// A short "2.0 / 3.x / both" badge for a target or draft's format posture.
function postureBadge(t: { oas2?: unknown; oas3?: unknown; formats?: string[] }): string {
  const p = formatPosture(t);
  if (p === 'both') return ' · 2.0+3.x';
  if (p === 'oas2') return ' · 2.0';
  if (p === 'oas3') return ' · 3.x';
  return '';
}

// ---------------------------------------------------------------------------
// Draft lifecycle
// ---------------------------------------------------------------------------
function makeDraft(partial: Partial<RuleDraft> | Record<string, unknown>): Draft {
  return {
    uid: `d${++seq}`,
    id: '',
    area: 'operations',
    statement: '',
    given: '',
    field: '',
    oas3: undefined,
    oas2: undefined,
    formats: undefined,
    fn: 'truthy',
    options: {},
    message: '',
    severity: 'warn',
    framing: 'positive',
    description: '',
    why: '',
    docs: '',
    owner: '',
    ...partial,
  } as Draft;
}

function addDraft(partial: Partial<RuleDraft> | Record<string, unknown>) {
  const d = makeDraft(partial);
  drafts.push(d);
  rulesEl.appendChild(renderCard(d));
  refresh();
  return d;
}

function removeDraft(uid: string) {
  const i = drafts.findIndex((d) => d.uid === uid);
  if (i >= 0) {
    drafts.splice(i, 1);
    document.getElementById(`card-${uid}`)?.remove();
    refresh();
  }
}

// Suggest a conventional id from area + subject words in the statement.
function suggestId(d: Draft): string {
  const subject = (d.field || d.statement || 'rule')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 2)
    .join('-') || 'rule';
  const check = d.fn || 'check';
  return `${d.area}-${subject}-${check}`.replace(/-+/g, '-');
}

// ---------------------------------------------------------------------------
// Card rendering
// ---------------------------------------------------------------------------
function renderCard(d: Draft): HTMLElement {
  const card = el('div', 'rule-card');
  card.id = `card-${d.uid}`;

  const areaOpts = AREAS.map((a) => `<option value="${a.key}" ${a.key === d.area ? 'selected' : ''}>${esc(a.label)}</option>`).join('');
  const fnOpts = FUNCTIONS.map((f) => `<option value="${f.name}" ${f.name === d.fn ? 'selected' : ''}>${f.name} — ${esc(f.summary)}</option>`).join('');
  const sevOpts = SEVERITIES.map((s) => `<option value="${s.key}" ${s.key === d.severity ? 'selected' : ''}>${s.label}</option>`).join('');

  card.innerHTML = `
    <div class="rc-head">
      <input class="rc-id" data-k="id" value="${esc(d.id)}" placeholder="rule-id (area-subject-check)" spellcheck="false" />
      <select class="rc-area" data-k="area" title="Area">${areaOpts}</select>
      <span class="rc-badge"></span>
      <button class="rc-remove" type="button" title="Remove rule" aria-label="Remove rule">×</button>
    </div>

    <label class="rc-field">
      <span class="rc-lab">Style-guide statement <em>(the prose you're distilling)</em></span>
      <textarea class="rc-statement" data-k="statement" rows="1" spellcheck="false" placeholder="e.g. Every operation must have a unique operationId.">${esc(d.statement)}</textarea>
      <span class="rc-hint" data-hint="statement"></span>
    </label>

    <div class="rc-row">
      <label class="rc-field grow">
        <span class="rc-lab">Target — common <code>given</code> <span class="rc-fmt" data-fmt title="Which OpenAPI dialect(s) this rule applies to"></span></span>
        <select class="rc-target" title="Common target">${targetOptions(d)}</select>
      </label>
      <label class="rc-field grow">
        <span class="rc-lab"><code>given</code> (JSONPath)</span>
        <input class="rc-mono" data-k="given" value="${esc(d.given)}" placeholder="$.paths[*][get,post]" spellcheck="false" />
      </label>
      <label class="rc-field">
        <span class="rc-lab"><code>then.field</code></span>
        <input class="rc-mono narrow" data-k="field" value="${esc(d.field)}" placeholder="(optional)" spellcheck="false" />
      </label>
    </div>

    <div class="rc-row">
      <label class="rc-field grow">
        <span class="rc-lab">Function</span>
        <select class="rc-fn" data-k="fn">${fnOpts}</select>
      </label>
      <label class="rc-field">
        <span class="rc-lab">Severity</span>
        <select class="rc-sev" data-k="severity">${sevOpts}</select>
      </label>
      <label class="rc-field">
        <span class="rc-lab">Framing</span>
        <select class="rc-framing" data-k="framing">
          <option value="positive" ${d.framing !== 'negative' ? 'selected' : ''}>positive</option>
          <option value="negative" ${d.framing === 'negative' ? 'selected' : ''}>negative</option>
        </select>
      </label>
    </div>
    <div class="rc-opts" data-opts></div>

    <label class="rc-field">
      <span class="rc-lab">Message <em>(what a developer reads when it fires)</em></span>
      <textarea class="rc-msg" data-k="message" rows="2" placeholder="Operation must declare an operationId — the stable handle SDKs and agents call it by.">${esc(d.message)}</textarea>
    </label>

    <details class="rc-ground" open>
      <summary>Grounding <span class="rc-req">required</span></summary>
      <label class="rc-field">
        <span class="rc-lab">Description</span>
        <textarea class="rc-desc" data-k="description" rows="2" placeholder="What this rule means, in human terms.">${esc(d.description)}</textarea>
      </label>
      <div class="rc-row">
        <label class="rc-field grow">
          <span class="rc-lab">Why / rationale</span>
          <textarea class="rc-why" data-k="why" rows="2" placeholder="Why this rule exists — so a red build teaches.">${esc(d.why)}</textarea>
        </label>
        <label class="rc-field grow">
          <span class="rc-lab">Owner</span>
          <input data-k="owner" value="${esc(d.owner)}" placeholder="API Governance Team" />
          <span class="rc-lab" style="margin-top:.5rem">Docs / policy link</span>
          <input data-k="docs" value="${esc(d.docs)}" placeholder="https://…" spellcheck="false" />
        </label>
      </div>
      <details class="rc-more">
        <summary>Who / what / when / where (optional context)</summary>
        <div class="rc-row">
          <label class="rc-field grow"><span class="rc-lab">Who it applies to</span><input data-k="who" value="${esc(d.who || '')}" placeholder="Every API producer team" /></label>
          <label class="rc-field grow"><span class="rc-lab">What it checks</span><input data-k="what" value="${esc(d.what || '')}" placeholder="Presence of operationId" /></label>
        </div>
        <div class="rc-row">
          <label class="rc-field grow"><span class="rc-lab">When it fires</span><input data-k="when" value="${esc(d.when || '')}" placeholder="On the pull request, before merge" /></label>
          <label class="rc-field grow"><span class="rc-lab">Where enforced</span><input data-k="where" value="${esc(d.where || '')}" placeholder="CI governance gate" /></label>
        </div>
      </details>
    </details>`;

  // ---- wire simple text/select fields ----
  card.querySelectorAll<HTMLElement>('[data-k]').forEach((node) => {
    const key = node.dataset.k as keyof RuleDraft;
    const handler = () => {
      (d as any)[key] = (node as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
      if (key === 'area') syncTargetOptions(card, d);
      if (key === 'fn') { d.options = {}; renderOpts(card, d); }
      if (key === 'statement') updateHint(card, d);
      // Hand-editing the base given/field keeps the 3.x form of a divergent
      // rule in sync (the 2.0 twin is left as picked, on purpose).
      if (key === 'given' && d.oas3) d.oas3.given = d.given;
      if (key === 'field' && d.oas3) d.oas3.field = d.field;
      autoGrow(node);
      refresh(card, d);
    };
    node.addEventListener('input', handler);
    node.addEventListener('change', handler);
  });

  // ---- target picker fills given + field (and the format-aware forms) ----
  const targetSel = card.querySelector<HTMLSelectElement>('.rc-target')!;
  targetSel.addEventListener('change', () => {
    const t = targetsForArea(d.area)[Number(targetSel.value)] as any;
    if (t) {
      d.given = t.given;
      d.field = t.field;
      // Carry the Swagger 2.0 / OpenAPI 3.x forms so this rule works on both.
      d.oas3 = t.oas3 ? { ...t.oas3 } : undefined;
      d.oas2 = t.oas2 ? { ...t.oas2 } : undefined;
      d.formats = Array.isArray(t.formats) ? t.formats.slice() : undefined;
      (card.querySelector('[data-k="given"]') as HTMLInputElement).value = t.given;
      (card.querySelector('[data-k="field"]') as HTMLInputElement).value = t.field;
      updateFormatTag(card, d);
      refresh(card, d);
    }
  });

  // ---- id auto-suggest button on blur if empty ----
  const idInput = card.querySelector<HTMLInputElement>('.rc-id')!;
  idInput.addEventListener('blur', () => {
    if (!idInput.value.trim()) {
      d.id = suggestId(d);
      idInput.value = d.id;
      refresh(card, d);
    }
  });

  card.querySelector('.rc-remove')!.addEventListener('click', () => removeDraft(d.uid));

  renderOpts(card, d);
  updateHint(card, d);
  updateFormatTag(card, d);
  queueMicrotask(() => card.querySelectorAll<HTMLTextAreaElement>('textarea').forEach(autoGrow));
  return card;
}

function targetOptions(d: Draft): string {
  const list = targetsForArea(d.area);
  return `<option value="">— pick a common target —</option>` +
    list.map((t, i) => `<option value="${i}">${esc(t.label)}${t.field ? ` · .${esc(t.field)}` : ''}${postureBadge(t as any)}</option>`).join('');
}
function syncTargetOptions(card: HTMLElement, d: Draft) {
  const sel = card.querySelector<HTMLSelectElement>('.rc-target')!;
  sel.innerHTML = targetOptions(d);
}

// Build the function-options inputs for the current function.
function renderOpts(card: HTMLElement, d: Draft) {
  const wrap = card.querySelector<HTMLElement>('[data-opts]')!;
  const fn = getFunction(d.fn);
  wrap.innerHTML = '';
  if (!fn || !fn.options.length) {
    wrap.innerHTML = `<p class="rc-opts-note muted">${fn ? esc(fn.summary) : ''} No options needed.</p>`;
    return;
  }
  const row = el('div', 'rc-row');
  for (const opt of fn.options as Array<Record<string, any>>) {
    const field = el('label', 'rc-field grow');
    const cur = (d.options as any)?.[opt.key];
    let control = '';
    if (opt.type === 'boolean') {
      control = `<label class="rc-check"><input type="checkbox" data-opt="${opt.key}" ${cur ? 'checked' : ''} /> ${esc(opt.label)}</label>`;
      field.innerHTML = control;
    } else if (opt.type === 'enum') {
      const os = (opt.values || []).map((v: string) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${v}</option>`).join('');
      field.innerHTML = `<span class="rc-lab">${esc(opt.label)}${opt.required ? ' *' : ''}</span><select data-opt="${opt.key}"><option value="">—</option>${os}</select>`;
    } else if (opt.type === 'json') {
      field.innerHTML = `<span class="rc-lab">${esc(opt.label)}${opt.required ? ' *' : ''}</span><textarea class="rc-mono" data-opt="${opt.key}" rows="3" spellcheck="false" placeholder="${esc(opt.placeholder || '')}">${esc(typeof cur === 'object' ? JSON.stringify(cur, null, 2) : cur || '')}</textarea>`;
    } else {
      const type = opt.type === 'number' ? 'number' : 'text';
      field.innerHTML = `<span class="rc-lab">${esc(opt.label)}${opt.required ? ' *' : ''}</span><input type="${type}" class="${opt.type === 'string' ? 'rc-mono' : ''}" data-opt="${opt.key}" value="${esc(cur ?? '')}" placeholder="${esc(opt.placeholder || '')}" spellcheck="false" />`;
    }
    row.appendChild(field);
  }
  wrap.appendChild(row);
  wrap.querySelectorAll<HTMLElement>('[data-opt]').forEach((node) => {
    const key = (node as HTMLElement).dataset.opt!;
    const input = node as HTMLInputElement;
    const handler = () => {
      d.options = d.options || {};
      if (input.type === 'checkbox') (d.options as any)[key] = input.checked;
      else (d.options as any)[key] = input.value;
      refresh(card, d);
    };
    node.addEventListener('input', handler);
    node.addEventListener('change', handler);
  });
}

// Show a small badge on the card noting the rule's OpenAPI format posture.
function updateFormatTag(card: HTMLElement, d: Draft) {
  const tag = card.querySelector<HTMLElement>('[data-fmt]');
  if (!tag) return;
  const p = formatPosture(d);
  const map: Record<string, string> = {
    both: 'Swagger 2.0 + OpenAPI 3.x',
    oas2: 'Swagger 2.0 only',
    oas3: 'OpenAPI 3.x only',
    any: 'any spec',
  };
  tag.textContent = p === 'any' ? '' : (p === 'both' ? '2.0 + 3.x' : (p === 'oas2' ? '2.0' : '3.x'));
  tag.className = `rc-fmt${p === 'any' ? '' : ` fmt-${p}`}`;
  tag.title = map[p];
}

function updateHint(card: HTMLElement, d: Draft) {
  const hint = card.querySelector<HTMLElement>('[data-hint="statement"]')!;
  const vague = vaguenessHints(d.statement);
  if (vague.length) {
    hint.className = 'rc-hint warn';
    hint.textContent = `Vague: "${vague.join('", "')}". Distilling means pinning this down — meaningful how? longer than what? on which operations?`;
  } else {
    hint.className = 'rc-hint';
    hint.textContent = '';
  }
}

function autoGrow(node: HTMLElement) {
  const ta = node as HTMLTextAreaElement;
  if (ta.tagName !== 'TEXTAREA') return;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight + 2, 220) + 'px';
}

// ---------------------------------------------------------------------------
// Output + validation
// ---------------------------------------------------------------------------
let yamlText = '';
function refresh(card?: HTMLElement, d?: Draft) {
  emptyEl.style.display = drafts.length ? 'none' : '';
  yamlText = emitYaml(drafts as any, { includeExtensions: extCheck.checked, target: targetMode, title: 'API Governance Ruleset' } as any);
  yamlCode.textContent = yamlText;
  const check = parseCheck(yamlText);
  if (!drafts.length) {
    validBadge.className = 'valid-badge';
    validBadge.textContent = '';
  } else if (check.ok) {
    validBadge.className = 'valid-badge ok';
    validBadge.textContent = `✓ valid · ${check.ruleCount} rule${check.ruleCount === 1 ? '' : 's'}`;
  } else {
    validBadge.className = 'valid-badge bad';
    validBadge.textContent = '✗ invalid YAML';
  }
  if (card && d) updateBadge(card, d);
}

function updateBadge(card: HTMLElement, d: Draft) {
  const badge = card.querySelector<HTMLElement>('.rc-badge')!;
  const issues = validateDraft(d);
  const errs = issues.filter((i) => i.level === 'error');
  const warns = issues.filter((i) => i.level === 'warn');
  if (errs.length) {
    badge.className = 'rc-badge err';
    badge.textContent = `${errs.length} to fix`;
    badge.title = errs.map((i) => `• ${i.message}`).join('\n');
  } else if (warns.length) {
    badge.className = 'rc-badge warn';
    badge.textContent = `grounded · ${warns.length} nudge${warns.length === 1 ? '' : 's'}`;
    badge.title = warns.map((i) => `• ${i.message}`).join('\n');
  } else {
    badge.className = 'rc-badge ok';
    badge.textContent = '✓ grounded';
    badge.title = 'Complete and grounded.';
  }
}

// Refresh every card badge (after bulk ops).
function refreshAllBadges() {
  for (const d of drafts) {
    const card = document.getElementById(`card-${d.uid}`);
    if (card) updateBadge(card, d);
  }
}

// ---------------------------------------------------------------------------
// Toolbar wiring
// ---------------------------------------------------------------------------
$('prose-btn').addEventListener('click', () => {
  const ta = $<HTMLTextAreaElement>('prose-input');
  const lines = ta.value.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return;
  for (const line of lines) {
    const d = addDraft({ statement: line });
    d.id = suggestId(d);
    (document.querySelector(`#card-${d.uid} .rc-id`) as HTMLInputElement).value = d.id;
  }
  ta.value = '';
  refresh();
  refreshAllBadges();
  document.getElementById('studio')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('add-blank').addEventListener('click', () => {
  const d = addDraft({});
  document.getElementById(`card-${d.uid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

const tmplPick = $<HTMLSelectElement>('template-pick');
tmplPick.innerHTML = `<option value="">— choose —</option>` +
  TEMPLATES.map((t) => `<option value="${t.id}">[${t.area}] ${esc(t.statement)}</option>`).join('');
tmplPick.addEventListener('change', () => {
  const t = TEMPLATES.find((x) => x.id === tmplPick.value);
  if (!t) return;
  addDraft({ ...t });
  tmplPick.value = '';
  refreshAllBadges();
});

$('load-sample').addEventListener('click', () => {
  for (const s of sampleStatements as unknown as RuleDraft[]) addDraft({ ...s });
  refresh();
  refreshAllBadges();
});

$('clear-all').addEventListener('click', () => {
  drafts.splice(0, drafts.length);
  rulesEl.innerHTML = '';
  refresh();
});

extCheck.addEventListener('change', () => refresh());

$('copy-btn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(yamlText);
    flash($('copy-btn'), 'Copied ✓');
  } catch {
    flash($('copy-btn'), 'Press ⌘/Ctrl+C');
  }
});

$('download-btn').addEventListener('click', () => {
  const blob = new Blob([yamlText || emitYaml([], {})], { type: 'text/yaml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '.spectral.yaml';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

function flash(btn: HTMLElement, msg: string) {
  const prev = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => (btn.textContent = prev), 1400);
}

// ---------------------------------------------------------------------------
// Starter library gallery
// ---------------------------------------------------------------------------
$('lib-count').textContent = String(TEMPLATES.length);
const libGrid = $('lib-grid');
libGrid.innerHTML = TEMPLATES.map((t) => {
  const sev = SEVERITIES.find((s) => s.key === t.severity)!;
  const posture = formatPosture(t as any);
  const fmtLabel = posture === 'both' ? '2.0 + 3.x' : posture === 'oas2' ? '2.0' : posture === 'oas3' ? '3.x' : '';
  return `<div class="lib-card">
    <div class="lib-top">
      <code class="lib-id">${esc(t.id)}</code>
      <span class="lib-sev" style="--sev:${sev.color}">${sev.label}</span>
    </div>
    <p class="lib-stmt">${esc(t.statement)}</p>
    <p class="lib-meta"><span class="lib-fn">${esc(t.fn)}</span> on <code>${esc(t.given)}</code>${t.field ? ` · <code>.${esc(t.field)}</code>` : ''}${fmtLabel ? ` · <span class="lib-fmt fmt-${posture}">${fmtLabel}</span>` : ''}</p>
    <button class="btn-outline sm lib-add" data-id="${t.id}" type="button">+ Add to ruleset</button>
  </div>`;
}).join('');
libGrid.querySelectorAll<HTMLButtonElement>('.lib-add').forEach((btn) => {
  btn.addEventListener('click', () => {
    const t = TEMPLATES.find((x) => x.id === btn.dataset.id);
    if (!t) return;
    addDraft({ ...t });
    refreshAllBadges();
    flash(btn, 'Added ✓');
  });
});

// ---------------------------------------------------------------------------
// Engagement front door
// ---------------------------------------------------------------------------
initEngage(() => {
  const n = drafts.length || 'some';
  return `Context: I'm building a Spectral ruleset in Spectral Ruleset Studio (studio.apicommons.org) with ${n} rule${drafts.length === 1 ? '' : 's'} distilled from our style guide.`;
});
$<HTMLButtonElement>('engage-inline')?.addEventListener('click', () => $('engage-ae').click());

// Initial paint.
refresh();
