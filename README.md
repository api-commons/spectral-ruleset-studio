# Spectral Ruleset Studio

**Turn a prose style guide into an OWNED, GROUNDED, well-named Spectral ruleset — in your browser.**

[studio.apicommons.org](https://studio.apicommons.org) · an [API Commons](https://apicommons.org) tool · free and open under Apache-2.0

---

## Why this exists

In a census of 1,005 public GitHub pipelines running [Spectral](https://github.com/stoplightio/spectral)
([The State of Spectral in API Pipelines](https://apievangelist.com)), **63% ran the tool on its
defaults with no rules of their own.** The default ruleset is a config file that ships with the
software — a hodgepodge of atomic checks with no naming convention, no categories, and no owner.
Running it is not adopting a standard; it is leaving the settings where you found them.

The reason teams do this is simple: **authoring and owning rules is hard.** So this tool makes the
hard part cheap.

> A ruleset you did not write is a ruleset nobody at your organization had to think through, which
> means it is a ruleset nobody owns — and the identical YAML that is a governance artifact in one
> repository is an empty gesture in another. The file can be byte-for-byte the same. The difference
> is entirely whether human work exists behind it.

Spectral Ruleset Studio forces that human work, and makes it fast:

- **Distilling prose is the point.** Paste a line from your style guide — *"operations should have
  meaningful descriptions"* — and the act of turning it into a rule immediately exposes how vague the
  prose was. Meaningful how? Longer than what? On which operations? The tool flags the vague words
  and makes you answer. Answering **is** governance happening.
- **Owned & named.** Every rule gets a convention-following id — the canonical API Commons
  **Spec / Version / Property / Semantics / Severity** pattern
  (`<spec>-<version>-<property>-<semantics>-<severity>`, e.g. `oas-x-operation-summary-truthy-warn`) —
  and a named owner. No anonymous copied YAML. See [the id convention](#the-rule-id-convention).
- **Grounded.** No rule ships without a description, a rationale (*why*), and a docs/policy link — so
  a red build is a teachable moment instead of a cryptic roadblock.
- **Sparingly enforced.** New rules default to `warning`, not `error`. `error` — the build-failing
  severity — is a deliberate choice you make, because credibility comes from a small blocking set.
- **Positive or negative framing.** Write the rule that flags what is wrong, or its twin that
  recognizes what is right, so you can report progress (*"82% already comply"*) and not only deficits.
- **Swagger 2.0 and OpenAPI 3.x, with parity.** Every rule targets both specs. Where the two dialects
  diverge (`definitions` vs `components.schemas`, `securityDefinitions` vs `components.securitySchemes`,
  `host`/`schemes` vs `servers`), the tool emits the right JSONPath for each — as a single multipath
  `given` when the check is identical, or as format-tagged twin rules when it differs.

## What it does

1. **The studio.** Add rules three ways — paste prose to distill, drop in a grounded starter, or start
   blank — then tune every field:
   - a **target** (JSONPath `given`) from a library of common ones (operations, parameters, responses,
     schemas, info, security, naming, servers/tags);
   - one of the **9 core Spectral functions** — `defined`, `truthy`, `falsy`, `undefined`, `pattern`,
     `casing`, `length`, `enumeration`, `alphabetical`, `schema` — with guided arguments, **no custom
     JavaScript required**;
   - a **message** and a **severity**;
   - the **required grounding**: id, description, why, docs link, owner (plus optional
     who/what/when/where).
2. **A starter library** of ready, already-grounded rule templates you can add and tune —
   operationId present, descriptions non-empty, consistent error schema, declared security, kebab-case
   paths, camelCase properties, tags present, and more.
3. **Live output.** A valid, categorized `.spectral.yaml` that updates as you type, with a "valid
   YAML" indicator, a **Target** toggle (OpenAPI 3.x / Swagger 2.0 / Both), a copy button, and a
   download button. Every rule carries its grounding.
4. **A tiny CLI** (`@api-common/spectral-ruleset-studio`) that scaffolds a grounded starter ruleset
   from the same templates, for wiring into a repo or CI from the terminal.

## How grounding is carried

Every emitted rule carries its grounding **two ways**, so the output is both portable and
machine-readable:

- **In the rule `description`** — a human-readable `Grounding —` block (source statement, why,
  framing, owner, docs, and any who/what/when/where). This is plain Spectral and works in every
  version.
- **Mirrored as an `x-grounding` extension** per rule (toggle off with `--no-ext` or the checkbox) for
  tooling that wants it structured.

Each rule also sets `documentationUrl` to its docs link. The emitted rulesets lint cleanly under
Spectral 6.

## The rule-id convention

Every id the studio emits (and validates on hand-authored rules) follows one canonical convention —
the API Commons standard **Spec / Version / Property / Semantics / Severity**, the convention set out
in the *[A Naming Convention for Your Governance Rules](https://apievangelist.com)* chapter of
*Governance of APIs*:

```
<spec>-<version>-<property>-<semantics>-<severity>
  oas       3          info-title          length      warn
```

- **spec** — the specification family: `oas` · `aas` · `arazzo` · `jsonschema`.
- **version** — the spec version as a bare token: `3` (OpenAPI 3.x), `2` (Swagger 2.0), or `x` when a
  rule is version-agnostic. Spec + version together are exactly Spectral's own format token
  (`oas3` / `oas2`).
- **property** — the root/nested property the rule targets, from the JSONPath `given` (+ `then.field`):
  one or more tokens, e.g. `info-description`, `operation-summary`, `schema-property`, `path`.
- **semantics** — *what* is checked, from the Spectral function: `defined`, `truthy`, `falsy`,
  `undefined`, `pattern`, `casing`, `length`, `enumeration`, `alphabetical`, `schema`.
- **severity** — `error` · `warn` · `info` · `hint`, carried in the name **and** mirrored by the
  rule's own `severity`.

Read `oas-3-info-title-length-warn` and you know, without opening the rule, that it is an OpenAPI 3.x
rule on `info.title` enforcing a length at warning severity. Format twins stamp the version segment
(`oas-3-…` / `oas-2-…`) rather than appending a suffix. The companion
[governance-pipeline](https://github.com/api-commons/governance-pipeline) (`<org>-…`) and
[spectral-owasp-ruleset](https://github.com/api-commons/spectral-owasp-ruleset) (`owasp-api<N>-…`)
ids are domain-scoped variants of this same shape.

## Swagger 2.0 / OpenAPI 3.x parity

Spectral auto-detects a document's format (`swagger: "2.0"` → `oas2`; `openapi: 3.x` → `oas3`) and
only runs a rule on a document whose format is in the rule's `formats` (or on every document when the
rule declares none). Spectral Ruleset Studio is **format-aware**, so the rulesets you build apply to
both specs. A **Target** toggle in the studio output bar (and `--target` on the CLI) chooses which
dialect(s) to govern:

- **Both** (default) — one ruleset that governs Swagger 2.0 **and** OpenAPI 3.x. Divergent targets are
  emitted in one of two ways:
  - a **multipath `given`** — `given: [$.components.schemas.*, $.definitions.*]`, no `formats` tag —
    when the same check is valid on both paths (e.g. "every schema property must be described"). One
    clean rule, no duplication;
  - **format-tagged twins** — `<id>-oas3` (`formats: [oas3]`) and `<id>-oas2` (`formats: [oas2]`) —
    when the check itself differs (e.g. a base URL is `servers[].url` in 3.x but `host` in 2.0).
  Concepts that exist in only one spec (3.x `requestBody`, 2.0 `host`/`formData`) are tagged
  `formats: [oas3]` / `[oas2]` so they never mis-fire on the other.
- **OpenAPI 3.x** / **Swagger 2.0** — emit only that dialect's form of each rule, with a matching
  top-level `formats`. One-spec-only rules are dropped when they don't apply.

Under the hood, each divergent target and template records **both** its `oas3` and `oas2` JSONPath
form; the emitter decides multipath-vs-twin from whether the two forms share the same `then.field`.

## Use it

### In the browser

Open **[studio.apicommons.org](https://studio.apicommons.org)**, paste your style-guide statements,
and build. Nothing leaves your browser.

### From the CLI

```bash
# Emit the whole grounded starter library to stdout
npx @api-common/spectral-ruleset-studio

# Only certain areas, written to a file
npx @api-common/spectral-ruleset-studio operations info -o .spectral.yaml

# A specific rule by id
npx @api-common/spectral-ruleset-studio --id oas-x-operation-operationId-defined-error

# List every template id
npx @api-common/spectral-ruleset-studio --list

# A Swagger 2.0-only ruleset (or --target oas3 for 3.x only; default is both)
npx @api-common/spectral-ruleset-studio --target oas2 -o .spectral.yaml

# Leaner output (grounding stays in the description, no x- extensions)
npx @api-common/spectral-ruleset-studio --no-ext -o .spectral.yaml
```

**Areas:** `info` · `operations` · `parameters` · `responses` · `schemas` · `security` · `naming` ·
`servers`

### Then run it (sparingly, and never silently)

```yaml
- name: Govern the API
  run: npx @stoplight/spectral-cli lint openapi.yaml --ruleset .spectral.yaml
```

Turn the findings into something a team will read with the companion
[Spectral Reporter](https://reporter.apicommons.org).

## Develop

```bash
npm install
npm run dev      # the studio on a local Vite server
npm test         # emitter tests (node --test)
npm run build    # build the static site to dist/
npm run cli --   # run the CLI locally, e.g. npm run cli -- --list
```

The emitter (`src/emit-ruleset.js`), the catalog (`src/catalog.js`) and the templates
(`src/templates.js`) are pure, dependency-light ESM modules shared **verbatim** between the browser
SPA and the CLI — so the YAML you copy from the page is byte-for-byte what the terminal writes.

## The 9 functions, and what they check

| Function | Checks |
| --- | --- |
| `defined` | the value is present |
| `truthy` | present and truthy (non-empty) |
| `falsy` | absent or falsy |
| `undefined` | not present |
| `pattern` | matches / does not match a regex |
| `casing` | follows a casing style (camel, pascal, kebab, snake, …) |
| `length` | within a min/max length |
| `enumeration` | one of an allowed set of values |
| `alphabetical` | keys are in order |
| `schema` | validates against a JSON Schema |

## Part of API Commons

An open, browser-first tool from **[API Commons](https://apicommons.org)** — free, no backend, your data stays in your browser. Browse the full set at **[apicommons.org/tools](https://apicommons.org/tools/)**.

**Related tools**
- [Ruleset Commons](https://rulesets.apicommons.org) — adopt a provenanced ruleset by reference
- [Spectral Reporter](https://reporter.apicommons.org) — Spectral JSON → self-contained HTML report
- [Spectral OWASP Ruleset](https://github.com/api-commons/spectral-owasp-ruleset) — OWASP API Security layer
- [API Validator](https://validator.apicommons.org) — lint OpenAPI/AsyncAPI/Arazzo/JSON Schema in-browser
- [Governance Coverage](https://coverage.apicommons.org) — how much of your API your rules actually check

Open source and free to fork. When you want experts in the loop, API Evangelist offers
[governance services](https://apievangelist.com/services/) — writing and grounding an owned ruleset
against your operations, tuning severity and rollout, and wiring it into the pipeline as a gate that
informs rather than punishes.

---

© 2026 API Commons (Kin Lane). Licensed under Apache-2.0.
