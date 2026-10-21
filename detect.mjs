// Inventory of the npm dependencies of a project: package-lock.json (v2/v3) first, node_modules as fallback, and the
// licence text of the package when its package.json says nothing useful.
import fs from 'node:fs';
import path from 'node:path';

const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
const json = (f) => { const t = read(f); try { return t ? JSON.parse(t) : null; } catch { return null; } };

// Licence text → SPDX id, by phrases that only that licence has. Order matters (AGPL/LGPL before GPL).
const PRINTS = [
  [/gnu affero general public license/, (t) => /version 3/.test(t) ? 'AGPL-3.0-only' : 'AGPL-1.0'],
  [/gnu lesser general public license|gnu library general public license/, (t) => /version 3/.test(t) ? 'LGPL-3.0-only' : 'LGPL-2.1-only'],
  [/gnu general public license/, (t) => /version 3/.test(t) ? 'GPL-3.0-only' : 'GPL-2.0-only'],
  [/server side public license/, () => 'SSPL-1.0'],
  [/business source license/, () => 'BUSL-1.1'],
  [/mozilla public license,? (version )?2\.0/, () => 'MPL-2.0'],
  [/eclipse public license - v ?2\.0|eclipse public license version 2\.0/, () => 'EPL-2.0'],
  [/apache license,? version 2\.0|apache license\s+version 2\.0/, () => 'Apache-2.0'],
  [/this is free and unencumbered software released into the public domain/, () => 'Unlicense'],
  [/creative commons legal code\s+cc0|cc0 1\.0 universal/, () => 'CC0-1.0'],
  [/permission to use, copy, modify, and\/or distribute this software for any purpose with or without fee/, (t) => /copyright notice and this permission notice appear in all copies/.test(t) ? 'ISC' : '0BSD'],
  [/permission is hereby granted, free of charge, to any person obtaining a copy/, () => 'MIT'],
  [/redistribution and use in source and binary forms/, (t) => /neither the name|names of its contributors may be used/.test(t) ? 'BSD-3-Clause' : 'BSD-2-Clause'],
  [/blue oak model license/, () => 'BlueOak-1.0.0'],
  [/the artistic license 2\.0/, () => 'Artistic-2.0'],
];
export function fromText(text) {
  const t = String(text || '').toLowerCase().replace(/\s+/g, ' ');
  for (const [re, id] of PRINTS) if (re.test(t)) return id(t);
  return null;
}
const LICFILE = /^(licen[cs]e|copying|unlicense)(\.(md|txt|markdown))?$|^licen[cs]e[-_.]/i;
function licenceFile(dir) {
  let names = []; try { names = fs.readdirSync(dir); } catch { return null; }
  const f = names.find((n) => LICFILE.test(n)); if (!f) return null;
  const text = read(path.join(dir, f)); return text ? { file: f, text } : null;
}

// package.json "license" can be a string, {type}, or the old "licenses" array.
function declared(pj) {
  if (!pj) return '';
  const l = pj.license ?? pj.licenses;
  if (typeof l === 'string') return l;
  if (Array.isArray(l)) return l.map((x) => (typeof x === 'string' ? x : x?.type)).filter(Boolean).join(' OR ');
  if (l && typeof l === 'object') return l.type || '';
  return '';
}
const usable = (s) => !!s && !/^(see licen[cs]e in|unlicensed$|custom:|file:)/i.test(s.trim()) && s.trim().toUpperCase() !== 'UNKNOWN';

// One record per installed package: {name, version, path, dev, license, source: lock|package|text|none, file?}.
export function inventory(root, { prod = false } = {}) {
  const lock = json(path.join(root, 'package-lock.json')) || json(path.join(root, 'npm-shrinkwrap.json'));
  const out = [];
  const seen = new Set();
  const finish = (rec, dir) => {
    if (!usable(rec.license)) {
      const pj = json(path.join(dir, 'package.json'));
      const d = declared(pj);
      if (usable(d)) Object.assign(rec, { license: d, source: 'package' });
      else {
        const lf = licenceFile(dir); const id = lf && fromText(lf.text);
        Object.assign(rec, id ? { license: id, source: 'text', file: lf.file } : { license: d || rec.license || '', source: 'none' });
      }
    }
    const k = `${rec.name}@${rec.version}`; if (seen.has(k)) return; seen.add(k); out.push(rec);
  };
  if (lock?.packages) {
    for (const [p, v] of Object.entries(lock.packages)) {
      if (!p || !p.includes('node_modules/') || v.link) continue;
      if (prod && (v.dev || v.devOptional)) continue;
      const name = v.name || p.slice(p.lastIndexOf('node_modules/') + 13);
      finish({ name, version: v.version || '', path: p, dev: !!v.dev, license: v.license ? declared(v) : '', source: v.license ? 'lock' : 'none' }, path.join(root, p));
    }
    return { packages: out, from: 'package-lock.json' };
  }
  // No v2+ lockfile: walk node_modules (scoped and nested).
  const walk = (dir, depth) => {
    let names = []; try { names = fs.readdirSync(dir); } catch { return; }
    for (const n of names) {
      if (n.startsWith('.')) continue;
      if (n.startsWith('@')) { walk(path.join(dir, n), depth); continue; }
      const d = path.join(dir, n), pj = json(path.join(d, 'package.json'));
      if (!pj?.name) continue;
      finish({ name: pj.name, version: pj.version || '', path: path.relative(root, d).split(path.sep).join('/'), dev: false, license: '', source: 'none' }, d);
      if (depth < 12) walk(path.join(d, 'node_modules'), depth + 1);
    }
  };
  walk(path.join(root, 'node_modules'), 0);
  return { packages: out, from: out.length ? 'node_modules' : null };
}
