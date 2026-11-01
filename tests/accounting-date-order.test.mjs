import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/comptabilite.js', import.meta.url), 'utf8');
test('dates décroissantes, sans déplacer les index de modification et suppression', () => {
  const rows = [
    { date: '2024-05-17' }, { date: '2026-07-28' }, { date: '2026-10-06' },
    { date: '2026-07-28' }, { date: '' }, { date: '2025-12-01' }
  ];
  const context = vm.createContext({ rows });
  vm.runInContext(source.slice(source.indexOf('function rowsByNewestDate('), source.indexOf('function sortByDate(')), context);
  const sorted = vm.runInContext('rowsByNewestDate(rows)', context);
  assert.deepEqual(Array.from(sorted, entry => entry.index), [2, 1, 3, 5, 0, 4]);
  sorted.forEach(entry => assert.equal(entry.row, rows[entry.index]));
  assert.equal(rows[0].date, '2024-05-17');
  rows[0].date = '2026-11-01';
  assert.equal(vm.runInContext('rowsByNewestDate(rows)[0].index', context), 0);
  assert.match(source, /rowsByNewestDate\(t.investmentComputed\)\.map\(\(\{ row, index: i \}\)/);
  assert.match(source, /rowsByNewestDate\(data.losses\)\.map\(\(\{ row, index: i \}\)/);
});
