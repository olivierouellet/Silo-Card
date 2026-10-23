// Every language file must have exactly the keys of en.json, with the same {placeholders}.
import { readFileSync, readdirSync } from 'node:fs';

const folder = new URL('../src/localize/languages/', import.meta.url);

const leaves = (node, path = []) =>
  typeof node === 'object'
    ? Object.entries(node).flatMap(([key, value]) => leaves(value, [...path, key]))
    : [[path.join('.'), node]];
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const load = (file) => new Map(leaves(JSON.parse(readFileSync(new URL(file, folder), 'utf8'))));

const reference = load('en.json');
const problems = [];
for (const file of readdirSync(folder).filter((f) => f.endsWith('.json') && f !== 'en.json')) {
  const texts = load(file);
  for (const key of reference.keys()) if (!texts.has(key)) problems.push(`${file}: missing ${key}`);
  for (const [key, text] of texts) {
    if (!reference.has(key)) problems.push(`${file}: unknown ${key}`);
    else if (placeholders(text) !== placeholders(reference.get(key))) problems.push(`${file}: placeholders differ in ${key}`);
  }
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`Translations complete (${reference.size} strings).`);
