import assert from 'node:assert/strict';
import '../js/modules/accounting/calculations.js';
import '../js/modules/accounting/operating-ledger.js';
import '../js/modules/accounting/report-data.js';

const report = globalThis.BastAccountingReportData;
const format = {
  date: value => `date:${value || 'vide'}`,
  escape: value => `text:${value}`,
  money: value => `eur:${Number(value).toFixed(2)}`,
  num: value => Number(value).toFixed(2),
  quarter: (year, quarter) => `T${quarter}/${year}`,
  lossTypeLabel: type => `charge:${type}`,
  privateMovementTypeLabel: type => `mouvement:${type}`
};
const result = report.build({
  data: {
    settings: { socialExemptionThreshold: 1000, socialContributionRate: 20, socialContributionFeeRate: 5 },
    sales: [{ date: '2026-01-01', client: 'Client', invoiceNumber: 'F-1', tvac: 121, rate: 21 }],
    purchases: [{ date: '2026-01-02', supplier: 'A', invoiceNumber: 'A-1', category: 'marchandise', htva: 100, rate: 21, deductible: true }],
    stock: [{ label: 'Stock', quantity: 2, unitPrice: 5 }],
    losses: [{ date: '2026-01-03', type: 'frais_financiers', label: 'Banque', quantity: 1, unitPrice: 12 }],
    privateMovements: [{ date: '2026-01-04', type: 'withdrawal', label: 'Privé', amount: -20 }],
    km: [{ date: '2026-01-05', person: 'S', route: 'A-B', km: 10, trips: 2 }]
  },
  summary: { estimatedProfit: 2000, investmentComputed: [], assetsComputed: [] },
  vatLedger: { rows: [{ declaration: { year: 2026, quarter: 1, dueDate: '2026-04-25' },
    computed: { startDate: '2026-01-01', endDate: '2026-03-31', boxes: { '54': 21, '59': 10, '71': 11, '72': 0 } }, outstanding: 5 }] },
  purchaseVatAt: () => 21,
  format
});

assert.equal(result.salesRows[0][5], 'eur:100.00');
assert.equal(result.purchaseRows[0][7], 'eur:21.00');
assert.equal(result.stockRows[0][3], 'eur:10.00');
assert.equal(result.lossRows[0][1], 'text:charge:frais_financiers');
assert.equal(result.privateMovementRows[0][4], 'eur:-20.00');
assert.equal(result.kmRows[0][5], '20.00 km');
assert.equal(result.vatRows.length, 7);
assert.equal(result.vatRows[0][0], 'T1/2026 – période');
assert.equal(result.socialBaseContribution, 400);
assert.equal(result.socialFeeContribution, 20);
assert.equal(result.socialTotalContribution, 420);
console.log('Données du rapport comptable valides.');
