#!/usr/bin/env node
// i18n coverage check for the Trovida fork of Postiz.
//
// Two failure classes let English leak into a non-English UI, and neither raises
// an error at runtime — i18next silently renders the inline default:
//
//   1. A t('key', 'Default') call whose key is missing from a locale bundle.
//   2. User-visible English that never goes through t() at all (JSX text, or a
//      placeholder/title/aria-label/alt attribute holding a literal string).
//
// Usage:
//   node scripts/check-i18n.mjs                 # fail on (1) for the Trovida locales
//   node scripts/check-i18n.mjs --hardcoded     # also fail on (2)
//   node scripts/check-i18n.mjs --list-hardcoded  # print (2) as JSON, never fail
//   node scripts/check-i18n.mjs --list-keys     # print every t() key + default as JSON
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// @babel/parser + @babel/traverse arrive via Next.js's toolchain (hoisted by
// node-linker=hoisted). Fail loudly rather than skipping the gate if that changes.
let parse, traverse;
try {
  ({ parse } = require('@babel/parser'));
  traverse = require('@babel/traverse').default;
} catch (e) {
  console.error(
    '✖ check-i18n needs @babel/parser and @babel/traverse; add them as root devDependencies.\n  ' +
      e.message
  );
  process.exit(1);
}

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '..'
);
const SRC_DIRS = ['apps/frontend/src', 'libraries/react-shared-libraries/src'];
const LOCALE_DIR = path.join(
  ROOT,
  'libraries/react-shared-libraries/src/translation/locales'
);
// The nine locales Trovida ships. Other bundles in the directory are upstream
// Postiz languages that Trovida does not offer, so they are not gated.
const LOCALES = ['en', 'es', 'fr', 'de', 'it', 'ja', 'zh', 'ko', 'ar'];

// Attributes whose literal string values are shown to the user.
const VISIBLE_ATTRS = new Set([
  'placeholder',
  'title',
  'aria-label',
  'alt',
  'label',
]);

// Sibling props that carry the English default next to an i18n `key`.
const INDIRECT_DEFAULT_PROPS = [
  'label',
  'name',
  'text',
  'title',
  'defaultValue',
  'description',
];

// Calls whose string arguments are shown to the user as-is: toasts, confirm
// dialogs, form errors, browser alerts.
const UI_MESSAGE_CALLS = new Set(['show', 'deleteDialog', 'setError', 'alert']);

// Shared form components that pass `label` through <TranslatedLabel>, which looks
// it up under a key derived from the text (or an explicit `translationKey`).
// Their literal labels are translated — but only if that derived key exists in
// every bundle, so they are checked as keys rather than flagged as hardcoded.
const TRANSLATED_LABEL_COMPONENTS = new Set([
  'Input',
  'Select',
  'Textarea',
  'ColorPicker',
  'Canonical',
  'MultiSelect',
  'CustomSelect',
]);
// Must match translated-label.tsx exactly.
const derivedLabelKey = (label) =>
  `label_${label.toLowerCase().replace(/\s+/g, '_').replace(/[^\w]/g, '')}`;

const args = new Set(process.argv.slice(2));

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'locales') continue;
      walk(p, out);
    } else if (
      /\.(tsx|ts)$/.test(entry.name) &&
      !/\.(spec|test)\.tsx?$/.test(entry.name)
    ) {
      out.push(p);
    }
  }
  return out;
}

// English prose: at least one run of 2+ Latin letters. Rules out punctuation,
// numbers and symbols that need no translation.
const looksLikeText = (s) => /[A-Za-z]{2,}/.test(s);

const keys = new Map(); // key -> { default, file, line }
const dynamicKeys = []; // t(expr) with a non-literal key — can't be verified statically
const hardcoded = [];

for (const file of SRC_DIRS.flatMap((d) => walk(path.join(ROOT, d)))) {
  const code = fs.readFileSync(file, 'utf8');
  let ast;
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx', 'decorators-legacy'],
      errorRecovery: true,
    });
  } catch {
    continue;
  }
  const rel = path.relative(ROOT, file);

  traverse(ast, {
    CallExpression(p) {
      const callee = p.node.callee;
      const name =
        callee.type === 'Identifier'
          ? callee.name
          : callee.type === 'MemberExpression' && !callee.computed
          ? callee.property.name
          : null;
      if (UI_MESSAGE_CALLS.has(name)) {
        for (const arg of p.node.arguments) {
          const text =
            arg.type === 'StringLiteral'
              ? arg.value
              : arg.type === 'TemplateLiteral'
              ? arg.quasis.map((q) => q.value.cooked).join('${}')
              : null;
          // A bare lowercase token is an option, not a message (toaster.show(msg, 'warning')).
          if (text && looksLikeText(text) && !/^[a-z_-]+$/.test(text)) {
            hardcoded.push({
              file: rel,
              line: p.node.loc.start.line,
              kind: `${name}()`,
              text,
            });
          }
        }
        return;
      }
      if (name !== 't') return;
      const [k, d] = p.node.arguments;
      if (!k) return;
      if (k.type !== 'StringLiteral') {
        dynamicKeys.push(`${rel}:${p.node.loc.start.line}`);
        return;
      }
      let def = null;
      if (d?.type === 'StringLiteral') def = d.value;
      else if (d?.type === 'TemplateLiteral' && d.expressions.length === 0)
        def = d.quasis.map((q) => q.value.cooked).join('');
      if (!keys.has(k.value))
        keys.set(k.value, {
          default: def,
          file: rel,
          line: p.node.loc.start.line,
        });
    },
    // Option/config objects translated indirectly at render as t(opt.key, opt.label):
    // { key: 'some_key', label: 'English default' }. The t() call sees a computed
    // key, so the key is registered here instead.
    ObjectExpression(p) {
      const lit = {};
      for (const prop of p.node.properties) {
        if (
          prop.type !== 'ObjectProperty' ||
          prop.value.type !== 'StringLiteral'
        )
          continue;
        lit[prop.key.name ?? prop.key.value] = prop.value.value;
      }
      if (!lit.key) return;
      const def = INDIRECT_DEFAULT_PROPS.map((k) => lit[k]).find(
        (v) => v !== undefined
      );
      if (def === undefined) return;
      if (!keys.has(lit.key))
        keys.set(lit.key, {
          default: def,
          file: rel,
          line: p.node.loc.start.line,
        });
    },
    // Next.js `export const metadata = { title: '…' }` is static, so it cannot
    // call t() — the browser-tab title stays English. Use generateMetadata() + getT().
    VariableDeclarator(p) {
      if (p.node.id.type !== 'Identifier' || p.node.id.name !== 'metadata')
        return;
      if (p.node.init?.type !== 'ObjectExpression') return;
      for (const prop of p.node.init.properties) {
        if (
          prop.type !== 'ObjectProperty' ||
          (prop.key.name ?? prop.key.value) !== 'title'
        )
          continue;
        const v = prop.value;
        const text =
          v.type === 'StringLiteral'
            ? v.value
            : v.type === 'TemplateLiteral'
            ? v.quasis.map((q) => q.value.cooked).join('${}')
            : null;
        if (text && looksLikeText(text)) {
          hardcoded.push({
            file: rel,
            line: prop.loc.start.line,
            kind: 'metadata.title',
            text,
          });
        }
      }
    },
    JSXText(p) {
      const text = p.node.value.replace(/\s+/g, ' ').trim();
      if (text && looksLikeText(text)) {
        hardcoded.push({
          file: rel,
          line: p.node.loc.start.line,
          kind: 'text',
          text,
        });
      }
    },
    JSXAttribute(p) {
      const attr = p.node.name.name;
      if (!VISIBLE_ATTRS.has(attr)) return;
      const v = p.node.value;
      const text =
        v?.type === 'StringLiteral'
          ? v.value
          : v?.type === 'JSXExpressionContainer' &&
            v.expression.type === 'StringLiteral'
          ? v.expression.value
          : null;
      if (!text || !looksLikeText(text)) return;
      const opening = p.parent;
      const el =
        opening.name?.type === 'JSXIdentifier' ? opening.name.name : null;
      if (attr === 'label' && TRANSLATED_LABEL_COMPONENTS.has(el)) {
        const explicit = opening.attributes.find(
          (a) => a.type === 'JSXAttribute' && a.name.name === 'translationKey'
        )?.value;
        const key =
          explicit?.type === 'StringLiteral'
            ? explicit.value
            : derivedLabelKey(text);
        if (!keys.has(key))
          keys.set(key, {
            default: text,
            file: rel,
            line: p.node.loc.start.line,
          });
        return;
      }
      hardcoded.push({
        file: rel,
        line: p.node.loc.start.line,
        kind: attr,
        text,
      });
    },
  });
}

// console.log + process.exit truncates piped output at 64KB; exit only once flushed.
function emitJson(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n', () =>
    process.exit(0)
  );
}

if (args.has('--list-keys')) {
  emitJson(Object.fromEntries(keys));
} else if (args.has('--list-hardcoded')) {
  emitJson(hardcoded);
} else {
  runChecks();
}

function runChecks() {
  let failed = false;
  for (const locale of LOCALES) {
    const bundle = JSON.parse(
      fs.readFileSync(path.join(LOCALE_DIR, locale, 'translation.json'), 'utf8')
    );
    const missing = [...keys.keys()].filter((k) => !(k in bundle));
    if (missing.length) {
      failed = true;
      console.error(
        `✖ ${locale}: ${missing.length} t() key(s) missing from the bundle`
      );
      for (const k of missing.slice(0, 20)) {
        const { file, line } = keys.get(k);
        console.error(`    ${k}  (${file}:${line})`);
      }
      if (missing.length > 20)
        console.error(`    … and ${missing.length - 20} more`);
    } else {
      console.log(`✔ ${locale}: all ${keys.size} t() keys present`);
    }
  }

  if (args.has('--hardcoded')) {
    // Deliberate exceptions (brand names, sample URLs, attributed quotes), each
    // with a recorded reason. Anything not listed must go through t().
    const allow = JSON.parse(
      fs.readFileSync(
        path.join(ROOT, 'scripts/i18n-hardcoded-allowlist.json'),
        'utf8'
      )
    );
    const allowed = new Set(allow.entries.map((e) => `${e.file}\0${e.text}`));
    const offending = hardcoded.filter(
      (h) => !(h.file in allow.files) && !allowed.has(`${h.file}\0${h.text}`)
    );
    if (offending.length) {
      failed = true;
      console.error(
        `✖ ${offending.length} hardcoded user-visible string(s) bypass t() ` +
          '(translate them, or add a reasoned entry to scripts/i18n-hardcoded-allowlist.json):'
      );
      for (const h of offending.slice(0, 40)) {
        console.error(
          `    ${h.file}:${h.line} [${h.kind}] ${JSON.stringify(h.text)}`
        );
      }
    } else {
      console.log('✔ no hardcoded user-visible strings outside the allowlist');
    }
  }

  if (dynamicKeys.length) {
    console.log(
      `ℹ ${dynamicKeys.length} t() call(s) use a computed key and were not verified`
    );
  }
  process.exit(failed ? 1 : 0);
}
