import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ID = '@local/llm-ratelimit';  // 必须与 package.json 的 name 一致

const source = readFileSync(resolve(root, 'src/client/index.js'), 'utf8');

const bundle = [
  `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
  'var module = { exports: {} }; var exports = module.exports;',
  source,
  'return module.exports;',
  '} });',
  '',
].join('\n');

mkdirSync(resolve(root, 'lib'), { recursive: true });
writeFileSync(resolve(root, 'lib/client.js'), bundle);
console.log(`built lib/client.js (${Buffer.byteLength(bundle)} bytes)`);