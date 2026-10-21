import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const source = readFileSync(new URL('../js/index.js', import.meta.url), 'utf8');
const syncCode = source.slice(source.indexOf('const moduleSyncState = new Map();'), source.indexOf('// Mise en place du suivi'));

function setup(result = { ok: true, local: true, drive: true }, key = 'comptabilite') {
  let value = { amount: 10 };
  let saves = 0;
  const frame = {
    dataset: { dirtyTrackingInstalled: '1' },
    getAttribute: () => 'module.html',
    contentDocument: { readyState: 'complete' },
    contentWindow: { BastComptaModule: {
      getChangeSnapshot: () => value,
      save: async () => { saves++; return result; }
    } }
  };
  const context = vm.createContext({
    console, setTimeout, clearTimeout, window: {},
    syncStatusPill: null, syncStatusText: null, globalSaveBtn: null,
    getLoadedModuleFrames: () => [{ key, label: key, frame }],
    getFrameModuleSaveApi: () => frame.contentWindow.BastComptaModule.save,
    backupStatus() {}, alert() {}
  });
  vm.runInContext(syncCode + '\nshowPortalSaveToast = () => {};', context);
  const run = code => vm.runInContext(code, context);
  run(`captureModuleBaseline('${key}'); getModuleSyncState('${key}').syncedOnce = true;`);
  return { run, change: () => { value = { amount: 20 }; }, saves: () => saves };
}

test('la disquette détecte une modification sans notification du module', async () => {
  const app = setup();
  app.change();
  await app.run('saveAllModulesFromPortal()');
  assert.equal(app.saves(), 1);
  assert.equal(app.run("getModuleSyncState('comptabilite').dirty"), false);
});

test('la disquette prend en compte une notification encore en attente', async () => {
  const app = setup();
  app.change();
  app.run("window.BastComptaPortal.markChanged('comptabilite', 'Montant modifié')");
  await app.run('saveAllModulesFromPortal()');
  assert.equal(app.saves(), 1);
  assert.equal(app.run("getModuleSyncState('comptabilite').snapshotTimer"), null);
});

test('Drive non confirmé reste en erreur et peut être relancé sans nouvelle édition', async () => {
  const app = setup({ ok: true, local: true, drive: false });
  app.change();
  assert.equal(await app.run('saveAllModulesFromPortal()'), false);
  assert.ok(app.run("getModuleSyncState('comptabilite').error"));
  await app.run('saveAllModulesFromPortal()');
  assert.equal(app.saves(), 2);
});

test('deux éditions rapides conservent la référence précédant la première', () => {
  const app = setup();
  app.run(`
    window.BastComptaPortal.markChanged('comptabilite', 'Première édition', { amount: 10 });
    window.BastComptaPortal.markChanged('comptabilite', 'Deuxième édition', { amount: 20 });
  `);
  assert.equal(app.run("getModuleSyncState('comptabilite').baselineSnapshot"), '{"amount":10}');
  app.run("clearTimeout(getModuleSyncState('comptabilite').snapshotTimer)");
});

test('une erreur Drive reste à relancer même si les valeurs reviennent à la référence', async () => {
  const app = setup();
  app.run("getModuleSyncState('comptabilite').error = 'Drive indisponible'");
  await app.run('saveAllModulesFromPortal()');
  assert.equal(app.saves(), 1);
});

test('un module inchangé et confirmé ne nécessite pas de nouvel envoi', async () => {
  const app = setup();
  await app.run('saveAllModulesFromPortal()');
  assert.equal(app.saves(), 0);
});

test('les paramètres IPP conservent leur sauvegarde locale', async () => {
  const app = setup({ ok: true, local: true, drive: false }, 'impots');
  app.change();
  assert.equal(await app.run('saveAllModulesFromPortal()'), true);
  assert.equal(app.saves(), 1);
});
