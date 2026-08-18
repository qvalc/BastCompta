import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const errors = [];

function walk(directory) {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(root).filter(path => !path.includes(`${join(root, '.git')}`));
const javascriptFiles = files.filter(path => extname(path) === '.js');
const htmlFiles = files.filter(path => extname(path) === '.html');

for (const path of javascriptFiles) {
  const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
  if (result.status !== 0) errors.push(`${relative(root, path)}: ${result.stderr.trim()}`);

  const source = readFileSync(path, 'utf8');
  const names = [...source.matchAll(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map(match => match[1]);
  const duplicates = [...new Set(names.filter((name, index) => names.indexOf(name) !== index))];
  if (duplicates.length) errors.push(`${relative(root, path)}: fonctions dupliquees: ${duplicates.join(', ')}`);
}

for (const path of htmlFiles) {
  const source = readFileSync(path, 'utf8');
  for (const match of source.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const reference = match[1].split('?')[0];
    if (!reference || /^(?:https?:|about:|#|mailto:|tel:)/.test(reference)) continue;
    if (!existsSync(resolve(root, reference))) errors.push(`${relative(root, path)}: ressource absente: ${reference}`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`${javascriptFiles.length} fichiers JavaScript valides; ${htmlFiles.length} pages HTML verifiees.`);
