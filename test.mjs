// node test.mjs — fixtures in a temp dir: lockfile v3, missing licence fields, licence text detection, SPDX expressions,
// verdict per mode, --prod, --allow, exit codes, SBOM and notices.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse, verdict, category } from './spdx.mjs';
import { fromText } from './detect.mjs';
import { main, analyse } from './cli.mjs';

const fails = [], expect = (c, w) => { if (!c) fails.push(w); console.log(c ? '  ✓' : '  ✗', w); };
const v = (e, m) => verdict(parse(e), m).v;

expect(v('MIT', 'distributed') === 'ok' && v('GPL-3.0-only', 'saas') === 'ok' && v('GPL-3.0-only', 'distributed') === 'block', 'GPL is fine in SaaS, blocks distribution');
expect(v('AGPL-3.0-or-later', 'saas') === 'block' && v('AGPL-3.0-only', 'internal') === 'ok', 'AGPL blocks SaaS, ok internal');
expect(v('(MIT OR GPL-3.0-only)', 'distributed') === 'ok', 'OR picks the best option');
expect(v('MIT AND LGPL-2.1-only', 'distributed') === 'review', 'AND takes the worst part');
expect(v('GPL-2.0-only WITH Classpath-exception-2.0', 'distributed') === 'review', 'GPL with a linking exception → review, not block');
expect(v('GPL-2.0+', 'library') === 'block' && category('GPL-2.0+') === 'strong' && parse('GPL-2.0+').id === 'GPL-2.0-or-later', 'GPL-2.0+ means or-later');
expect(v('Apache 2.0', 'saas') === 'ok' && v('BUSL-1.1', 'saas') === 'review' && v('', 'saas') === 'review', 'aliases, source-available and empty');
expect(v('((MIT OR Apache-2.0) AND BSD-3-Clause)', 'library') === 'ok', 'nested expression');
expect(fromText('Permission is hereby granted, free of charge, to any person obtaining a copy of this software') === 'MIT', 'text: MIT');
expect(fromText('GNU AFFERO GENERAL PUBLIC LICENSE\n Version 3, 19 November 2007') === 'AGPL-3.0-only', 'text: AGPL before GPL');
expect(fromText('GNU LESSER GENERAL PUBLIC LICENSE Version 2.1') === 'LGPL-2.1-only', 'text: LGPL 2.1');
expect(fromText('Redistribution and use in source and binary forms ... Neither the name of the copyright holder') === 'BSD-3-Clause', 'text: BSD-3');
expect(fromText('hello') === null, 'text: nothing');

// a project on disk
const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lg-'));
const pkg = (p, pj, lic) => { const dir = path.join(d, p); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pj)); if (lic) fs.writeFileSync(path.join(dir, 'LICENSE'), lic); };
fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 'app', version: '1.2.3' }));
fs.writeFileSync(path.join(d, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: {
  '': { name: 'app', version: '1.2.3' },
  'node_modules/left': { version: '1.0.0', license: 'MIT' },
  'node_modules/@scope/net': { version: '2.0.0', license: 'AGPL-3.0-only' },
  'node_modules/textonly': { version: '0.1.0' },
  'node_modules/old': { version: '3.0.0' },
  'node_modules/devgpl': { version: '1.0.0', license: 'GPL-3.0-only', dev: true },
  'node_modules/left/node_modules/inner': { version: '0.0.1', license: '(MIT OR GPL-2.0-only)' },
  'node_modules/linked': { link: true, resolved: '../x' },
} }));
pkg('node_modules/left', { name: 'left', version: '1.0.0', license: 'MIT' }, 'MIT License\nPermission is hereby granted, free of charge, to any person obtaining a copy');
pkg('node_modules/textonly', { name: 'textonly', version: '0.1.0', license: 'SEE LICENSE IN LICENSE' }, 'Apache License\nVersion 2.0, January 2004');
pkg('node_modules/old', { name: 'old', version: '3.0.0', licenses: [{ type: 'BSD' }] });

const r = analyse(d, { mode: 'saas' }), by = Object.fromEntries(r.rows.map((x) => [x.name, x]));
expect(r.from === 'package-lock.json' && r.rows.length === 6, `6 packages, links skipped (${r.rows.length})`);
expect(by.textonly.license === 'Apache-2.0' && by.textonly.source === 'text', 'licence read from the LICENSE text');
expect(by.old.license === 'BSD' && by.old.verdict === 'ok', 'old "licenses" array');
expect(by['@scope/net'].verdict === 'block' && by.inner.verdict === 'ok' && by.devgpl.verdict === 'ok', 'SaaS: AGPL blocks, dual licence ok, GPL dev ok');
expect(analyse(d, { mode: 'distributed', prod: true }).rows.every((x) => x.name !== 'devgpl'), '--prod drops dev packages');

const out = []; const log = (s) => out.push(s);
expect(await main([d, '--mode', 'saas'], log) === 1 && out.join('\n').includes('BLOCK  @scope/net@2.0.0'), 'exit 1 and the blocking line');
expect(await main([d, '--mode', 'saas', '--allow', '@scope/net'], () => {}) === 0, '--allow clears it');
expect(await main([d, '--mode', 'internal', '--fail-on', 'review'], () => {}) === 0, 'internal: nothing to review');
expect(await main([d, '--mode', 'nope'], () => {}) === 2, 'bad mode → 2');
expect(await main([fs.mkdtempSync(path.join(os.tmpdir(), 'lg0-'))], () => {}) === 2, 'empty dir → 2');
const sb = path.join(d, 's.json'), nt = path.join(d, 'n.txt');
await main([d, '--allow', '@scope/net', '--sbom', sb, '--notices', nt], () => {});
const bom = JSON.parse(fs.readFileSync(sb, 'utf8'));
expect(bom.bomFormat === 'CycloneDX' && bom.components.length === 6 && bom.components.some((c) => c.purl === 'pkg:npm/%40scope/net@2.0.0') && bom.components.some((c) => c.licenses[0]?.expression === '(MIT OR GPL-2.0-only)') && bom.metadata.component.name === 'app', 'CycloneDX SBOM');
const n = fs.readFileSync(nt, 'utf8');
expect(n.includes('left@1.0.0\nLicense: MIT') && n.includes('Permission is hereby granted') && !n.includes('devgpl'), 'notices with licence texts, no dev packages');
fs.rmSync(d, { recursive: true, force: true });
console.log(fails.length ? `FAIL ${fails.length}` : 'ALL OK');
process.exit(fails.length ? 1 : 0);
