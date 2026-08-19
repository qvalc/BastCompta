/* BastCompta - numerotation pure des documents commerciaux. */
(function (global) {
  'use strict';
  const config = Object.freeze({
    quote: { prefix: 'D', label: 'devis' }, invoice: { prefix: 'F', label: 'facture' },
    reminder: { prefix: 'RF', label: 'rappel' }, credit_note: { prefix: 'NC', label: 'note de crédit' }
  });
  const prefixToKind = Object.freeze({ D: 'quote', F: 'invoice', RF: 'reminder', NC: 'credit_note' });

  function format(kind, year, sequence) {
    return `${(config[kind] || config.quote).prefix}-${year}-${String(sequence || 1).padStart(3, '0')}`;
  }
  function parse(value) {
    const match = String(value || '').trim().toUpperCase().match(/\b(RF|NC|D|F)-(\d{4})-(\d{1,})\b/);
    if (!match) return null;
    return { kind: prefixToKind[match[1]] || '', prefix: match[1], year: match[2], sequence: parseInt(match[3], 10) || 0 };
  }
  function candidates(values = []) {
    return values.flatMap(entry => {
      if (entry && typeof entry === 'object' && entry.kind && entry.year && Number(entry.sequence) > 0) {
        return [{
          ...entry,
          year: String(entry.year),
          sequence: Number(entry.sequence)
        }];
      }
      const value = typeof entry === 'object' ? entry.value : entry;
      const parsed = parse(value);
      return parsed?.sequence ? [{ ...parsed, source: entry?.source || '' }] : [];
    });
  }
  function highest(kind, year, values = []) {
    return candidates(values).filter(item => item.kind === kind && item.year === String(year))
      .reduce((maximum, item) => Math.max(maximum, item.sequence), 0);
  }
  function next(kind, year, values = []) { return format(kind, year, highest(kind, year, values) + 1); }

  global.BastDocumentNumbering = Object.freeze({ config, format, parse, candidates, highest, next });
})(globalThis);
