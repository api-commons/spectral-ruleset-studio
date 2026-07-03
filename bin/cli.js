#!/usr/bin/env node
// @api-common/spectral-ruleset-studio — scaffold a grounded starter Spectral
// ruleset from the studio's template library, without opening a browser.
//
// The SPA at studio.apicommons.org is the primary experience; this CLI is a
// convenience for wiring a starter ruleset into a repo or CI from the terminal.
//
// Usage:
//   spectral-ruleset-studio                       # emit ALL starter templates
//   spectral-ruleset-studio operations info        # only these areas
//   spectral-ruleset-studio --id operations-operationId-defined  # named rules
//   spectral-ruleset-studio --list                 # list template ids
//   spectral-ruleset-studio -o .spectral.yaml      # write to a file
//
// Flags:
//   -o, --output <file>   write YAML to a file (default: stdout)
//       --id <ruleId>     include a specific template id (repeatable)
//       --title <text>    ruleset title used in the header
//       --no-ext          omit the x-grounding extensions (leaner, still grounded)
//       --list            list available template ids and exit
//   -h, --help            show help
//       --version         print version

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { emitYaml } from '../src/emit-ruleset.js';
import { TEMPLATES } from '../src/templates.js';
import { AREA_KEYS } from '../src/catalog.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const opts = { output: null, ids: [], areas: [], title: 'API Governance Ruleset', ext: true, list: false, help: false, version: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '-o': case '--output': opts.output = argv[++i]; break;
      case '--id': opts.ids.push(argv[++i]); break;
      case '--title': opts.title = argv[++i]; break;
      case '--no-ext': opts.ext = false; break;
      case '--list': opts.list = true; break;
      case '-h': case '--help': opts.help = true; break;
      case '--version': opts.version = true; break;
      default:
        if (a && a.startsWith('-')) { console.error(`Unknown flag: ${a}`); process.exit(2); }
        else if (AREA_KEYS.includes(a)) opts.areas.push(a);
        else { console.error(`Unknown area "${a}". Valid areas: ${AREA_KEYS.join(', ')}`); process.exit(2); }
    }
  }
  return opts;
}

function help() {
  console.log(`spectral-ruleset-studio — scaffold a grounded starter Spectral ruleset

Usage:
  spectral-ruleset-studio [areas…] [--id ruleId]… [-o file]

Examples:
  spectral-ruleset-studio                          # all starter templates → stdout
  spectral-ruleset-studio operations info          # only these areas
  spectral-ruleset-studio --id operations-operationId-defined -o .spectral.yaml
  spectral-ruleset-studio --list                   # list template ids

Flags:
  -o, --output <file>   write YAML to a file (default: stdout)
      --id <ruleId>     include a specific template id (repeatable)
      --title <text>    ruleset title used in the header comment
      --no-ext          omit the x-grounding extensions (leaner, still grounded)
      --list            list available template ids and exit
  -h, --help            show this help
      --version         print version

Areas: ${AREA_KEYS.join(', ')}

The starter rules are a starting point, not a standard. Own them: edit the
messages, tune the severities, and name a real owner before you gate on them.`);
}

async function pkgVersion() {
  try {
    const raw = await readFile(join(__dirname, '..', 'package.json'), 'utf8');
    return JSON.parse(raw).version || '0.0.0';
  } catch { return '0.0.0'; }
}

function selectTemplates(opts) {
  let picked = TEMPLATES;
  if (opts.ids.length) {
    picked = TEMPLATES.filter((t) => opts.ids.includes(t.id));
    const found = new Set(picked.map((t) => t.id));
    for (const id of opts.ids) if (!found.has(id)) console.error(`Warning: no template with id "${id}".`);
  } else if (opts.areas.length) {
    picked = TEMPLATES.filter((t) => opts.areas.includes(t.area));
  }
  return picked;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { help(); return; }
  if (opts.version) { console.log(await pkgVersion()); return; }
  if (opts.list) {
    for (const t of TEMPLATES) console.log(`${t.id}\t[${t.area}]\t${t.statement}`);
    console.error(`\n${TEMPLATES.length} starter templates.`);
    return;
  }

  const picked = selectTemplates(opts);
  if (!picked.length) {
    console.error('No templates matched your selection. Try --list.');
    process.exit(1);
  }

  const yamlStr = emitYaml(picked, {
    title: opts.title,
    includeExtensions: opts.ext,
    generatedAt: new Date().toISOString(),
  });

  if (opts.output) {
    const outPath = resolve(opts.output);
    await writeFile(outPath, yamlStr, 'utf8');
    console.error(`✓ Wrote ${outPath} (${picked.length} grounded rule${picked.length === 1 ? '' : 's'})`);
    console.error('  This is a starting point — own it before you gate on it.');
  } else {
    process.stdout.write(yamlStr);
  }
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : String(e));
  process.exit(1);
});
