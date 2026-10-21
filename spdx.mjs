// SPDX licence ids grouped by obligation, an SPDX expression parser and the verdict per distribution mode.
// Categories: permissive, weak (file/library copyleft), strong (copyleft on distribution), network (copyleft over a
// network too), restricted (non-commercial / source-available), unknown.
export const CATEGORY = {};
const add = (cat, ids) => ids.forEach((id) => { CATEGORY[id.toLowerCase()] = cat; });
add('permissive', ['MIT', 'MIT-0', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'BSD-3-Clause-Clear', '0BSD', 'Apache-2.0', 'Zlib', 'Unlicense', 'CC0-1.0',
  'WTFPL', 'Python-2.0', 'BlueOak-1.0.0', 'CC-BY-3.0', 'CC-BY-4.0', 'Artistic-2.0', 'BSL-1.0', 'PSF-2.0', 'X11', 'AFL-2.1', 'AFL-3.0', 'Unicode-DFS-2016', 'Unicode-3.0', 'W3C']);
add('weak', ['LGPL-2.0', 'LGPL-2.0-only', 'LGPL-2.0-or-later', 'LGPL-2.1', 'LGPL-2.1-only', 'LGPL-2.1-or-later', 'LGPL-3.0', 'LGPL-3.0-only', 'LGPL-3.0-or-later',
  'MPL-1.1', 'MPL-2.0', 'EPL-1.0', 'EPL-2.0', 'CDDL-1.0', 'CDDL-1.1', 'CC-BY-SA-3.0', 'CC-BY-SA-4.0', 'OFL-1.1']);
add('strong', ['GPL-2.0', 'GPL-2.0-only', 'GPL-2.0-or-later', 'GPL-3.0', 'GPL-3.0-only', 'GPL-3.0-or-later', 'EUPL-1.2', 'OSL-3.0']);
add('network', ['AGPL-1.0', 'AGPL-3.0', 'AGPL-3.0-only', 'AGPL-3.0-or-later', 'SSPL-1.0']);
add('restricted', ['BUSL-1.1', 'CC-BY-NC-4.0', 'CC-BY-NC-SA-4.0', 'CC-BY-NC-ND-4.0', 'Elastic-2.0', 'Commons-Clause', 'PolyForm-Noncommercial-1.0.0', 'PolyForm-Shield-1.0.0']);

// Loose names found in old package.json files.
const ALIAS = { 'apache 2.0': 'Apache-2.0', 'apache-2': 'Apache-2.0', 'apache2': 'Apache-2.0', 'apache license 2.0': 'Apache-2.0', 'bsd': 'BSD-3-Clause', 'new bsd': 'BSD-3-Clause',
  'simplified bsd': 'BSD-2-Clause', 'gplv2': 'GPL-2.0-only', 'gplv3': 'GPL-3.0-only', 'gpl-2.0+': 'GPL-2.0-or-later', 'gpl-3.0+': 'GPL-3.0-or-later', 'lgpl': 'LGPL-2.1-or-later',
  'agplv3': 'AGPL-3.0-only', 'public domain': 'Unlicense', 'mit license': 'MIT', 'the mit license': 'MIT', 'isc license': 'ISC', 'mpl 2.0': 'MPL-2.0' };
export const normalize = (id) => { const t = String(id || '').trim(); const a = ALIAS[t.toLowerCase()]; return a || t; };
export const category = (id) => CATEGORY[normalize(id).toLowerCase()] || 'unknown';

// Expression → tree: {or:[..]} | {and:[..]} | {id, exception}. AND binds tighter than OR.
export function parse(expr) {
  // A loose name with spaces ('Apache 2.0', 'MIT License') and no operators is one id.
  const whole = String(expr || '').trim();
  if (!/[()]|\s(or|and|with)\s/i.test(whole) && /\s/.test(whole)) return { id: normalize(whole), exception: null };
  const toks = String(expr || '').replace(/[()]/g, (m) => ` ${m} `).trim().split(/\s+/).filter(Boolean);
  let i = 0;
  const atom = () => {
    if (toks[i] === '(') { i++; const n = or(); if (toks[i] === ')') i++; return n; }
    const id = toks[i++] || ''; let exception = null;
    if (/^with$/i.test(toks[i] || '')) { i++; exception = toks[i++] || null; }
    return { id: normalize(/^(A|L)?GPL-\d\.\d\+$/i.test(id) ? id.slice(0, -1) + '-or-later' : id), exception };
  };
  const and = () => { const xs = [atom()]; while (/^and$/i.test(toks[i] || '')) { i++; xs.push(atom()); } return xs.length > 1 ? { and: xs } : xs[0]; };
  const or = () => { const xs = [and()]; while (/^or$/i.test(toks[i] || '')) { i++; xs.push(and()); } return xs.length > 1 ? { or: xs } : xs[0]; };
  return toks.length ? or() : { id: '', exception: null };
}

// What each category means for each way the code is shipped. ok | review | block.
const MATRIX = {
  internal:    { permissive: 'ok', weak: 'ok', strong: 'ok', network: 'ok', restricted: 'review', unknown: 'review' },
  saas:        { permissive: 'ok', weak: 'ok', strong: 'ok', network: 'block', restricted: 'review', unknown: 'review' },
  distributed: { permissive: 'ok', weak: 'review', strong: 'block', network: 'block', restricted: 'review', unknown: 'review' },
  library:     { permissive: 'ok', weak: 'review', strong: 'block', network: 'block', restricted: 'review', unknown: 'review' },
};
export const MODES = Object.keys(MATRIX);
const RANK = { ok: 0, review: 1, block: 2 };
// Best option of an OR (the licensee picks), worst part of an AND (all apply).
export function verdict(tree, mode) {
  const m = MATRIX[mode] || MATRIX.saas;
  if (tree.or) return tree.or.map((t) => verdict(t, mode)).sort((a, b) => RANK[a.v] - RANK[b.v])[0];
  if (tree.and) return tree.and.map((t) => verdict(t, mode)).sort((a, b) => RANK[b.v] - RANK[a.v])[0];
  const c = category(tree.id);
  // GPL with a linking/classpath exception behaves like weak copyleft.
  const cc = c === 'strong' && /classpath|linking|gcc-exception|autoconf|bison/i.test(tree.exception || '') ? 'weak' : c;
  return { v: m[cc], cat: cc, id: tree.id };
}
