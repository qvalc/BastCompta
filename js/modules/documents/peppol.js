/* BastCompta - regles pures Peppol/UBL. */
(function (global) {
  'use strict';
  const trim = value => String(value ?? '').trim();
  const amount = value => Number(value || 0).toFixed(2);
  const escapeXml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const country = vatNumber => {
    const normalized = global.BastDocumentCalculations.normalizeVatNumber(vatNumber);
    return /^[A-Z]{2}/.test(normalized) ? normalized.slice(0, 2) : 'BE';
  };
  const taxCategory = rate => Number(rate || 0) === 0 ? 'Z' : 'S';
  const unitCode = unit => trim(unit).toLowerCase().includes('h') ? 'HUR' : 'C62';

  function groupVat(lines = []) {
    const groups = new Map();
    for (const line of lines) {
      const rate = Number(line.vatRate || 0);
      const current = groups.get(rate) || { rate, category: taxCategory(rate), base: 0, tax: 0 };
      current.base += global.BastDocumentCalculations.lineNet(line);
      current.tax += global.BastDocumentCalculations.lineVat(line);
      groups.set(rate, current);
    }
    return [...groups.values()].sort((a, b) => a.rate - b.rate);
  }

  function validateBelgianEndpoints(supplierVat, customerVat) {
    const calculations = global.BastDocumentCalculations;
    const supplier = calculations.belgianEnterpriseNumber(supplierVat);
    const customer = calculations.belgianEnterpriseNumber(customerVat);
    return {
      supplier, customer,
      supplierValid: calculations.isValidBelgianEnterpriseNumber(supplier),
      customerValid: calculations.isValidBelgianEnterpriseNumber(customer)
    };
  }

  function invoiceLines(invoice = {}) {
    const mainLines = Array.isArray(invoice.lines) ? invoice.lines : [];
    const suppliesLines = invoice.suppliesEnabled && Array.isArray(invoice.suppliesLines)
      ? invoice.suppliesLines
      : [];
    return [...mainLines, ...suppliesLines].filter(row => {
      return trim(row.description) || Number(row.qty || 0) || Number(row.unitPrice || 0);
    });
  }

  function prepareInvoiceData(options = {}) {
    const invoice = options.invoice || {};
    const company = options.company || {};
    const communication = options.communication || {};
    const lines = invoiceLines(invoice);
    const totals = global.BastDocumentCalculations.totalsForDocument(invoice);
    const supplierVat = global.BastDocumentCalculations.normalizeVatNumber(company.vat);
    const customerVat = global.BastDocumentCalculations.normalizeVatNumber(invoice.clientVat);
    const issueDate = invoice.date || options.today || new Date().toISOString().slice(0, 10);
    const invoiceNumber = trim(invoice.documentNumber) || 'FACTURE-SANS-NUMERO';

    return {
      invoice,
      company,
      lines,
      totals,
      vatGroups: groupVat(lines),
      supplierVat,
      customerVat,
      supplierCountry: country(supplierVat),
      customerCountry: country(customerVat),
      supplierEndpoint: global.BastDocumentCalculations.belgianEnterpriseNumber(supplierVat),
      customerEndpoint: global.BastDocumentCalculations.belgianEnterpriseNumber(customerVat),
      issueDate,
      dueDate: invoice.dueDate || issueDate,
      invoiceNumber,
      paymentReference: trim(communication.formatted) || invoiceNumber,
      paymentTerms: trim(invoice.notes) || trim(company.conditions) || 'Paiement à l’échéance indiquée.',
      currency: 'EUR'
    };
  }

  function validationChecks(options = {}) {
    const prepared = prepareInvoiceData(options);
    const { invoice, company, lines, totals } = prepared;
    const calculations = global.BastDocumentCalculations;
    return [
      { ok: !!trim(invoice.documentNumber), label: 'Numéro de facture renseigné' },
      { ok: !!trim(invoice.date), label: 'Date de facture renseignée' },
      { ok: !!trim(invoice.dueDate), label: 'Date d’échéance renseignée' },
      { ok: !!trim(invoice.clientName), label: 'Nom du client renseigné' },
      { ok: !!trim(invoice.address), label: 'Adresse client renseignée' },
      { ok: calculations.isValidBelgianEnterpriseNumber(invoice.clientVat), label: 'N° d’entreprise Peppol client belge valide (10 chiffres)' },
      { ok: !!trim(invoice.clientEmail), label: 'Email client renseigné' },
      { ok: !!trim(company.name), label: 'Nom de votre société renseigné' },
      { ok: calculations.isValidBelgianEnterpriseNumber(company.vat), label: 'N° d’entreprise Peppol vendeur belge valide (10 chiffres)' },
      { ok: !!trim(company.iban), label: 'IBAN renseigné' },
      { ok: lines.length > 0, label: 'Au moins une ligne de facture présente' },
      { ok: totals.tvac > 0, label: 'Montant total supérieur à 0 €' }
    ];
  }

  function readiness(checks = []) {
    const missing = checks.filter(item => !item.ok);
    if (!missing.length) {
      return { level: 'ready', title: 'Facture prête', text: 'Tous les contrôles principaux sont validés.' };
    }
    if (missing.length <= 3) {
      return { level: 'warning', title: 'Presque prête', text: `${missing.length} point(s) à corriger avant un envoi propre.` };
    }
    return { level: 'danger', title: 'Facture incomplète', text: `${missing.length} point(s) manquant(s) ou incomplets.` };
  }

  function taxSubtotalsXml(groups = [], currency = 'EUR') {
    return groups.map(item => `
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${currency}">${amount(item.base)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${currency}">${amount(item.tax)}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:ID>${item.category}</cbc:ID>
          <cbc:Percent>${amount(item.rate)}</cbc:Percent>
          <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>`).join('');
  }

  function invoiceLinesXml(lines = [], currency = 'EUR') {
    return lines.map((row, index) => {
      const qty = Number(row.qty || 0) || 1;
      const rate = Number(row.vatRate || 0);
      const description = trim(row.description) || `Ligne ${index + 1}`;
      return `
  <cac:InvoiceLine>
    <cbc:ID>${index + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${unitCode(row.unit)}">${amount(qty)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${currency}">${amount(global.BastDocumentCalculations.lineNet(row))}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${escapeXml(description)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${taxCategory(rate)}</cbc:ID>
        <cbc:Percent>${amount(rate)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${currency}">${amount(row.unitPrice)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
    }).join('');
  }

  function buildInvoiceXml(options = {}) {
    const prepared = prepareInvoiceData(options);
    const {
      invoice, company, totals, lines, vatGroups, supplierVat, customerVat,
      supplierCountry, customerCountry, supplierEndpoint, customerEndpoint,
      issueDate, dueDate, invoiceNumber, paymentReference, paymentTerms, currency
    } = prepared;
    const calculations = global.BastDocumentCalculations;

    if (!calculations.isValidBelgianEnterpriseNumber(supplierEndpoint)) {
      throw new Error('Le numéro d’entreprise Peppol du vendeur est invalide. Indiquez un numéro BCE belge valide de 10 chiffres.');
    }
    if (!calculations.isValidBelgianEnterpriseNumber(customerEndpoint)) {
      throw new Error('Le numéro d’entreprise Peppol du client est invalide. Indiquez un numéro BCE belge valide de 10 chiffres.');
    }

    const taxSubtotals = taxSubtotalsXml(vatGroups, currency);
    const invoiceLineElements = invoiceLinesXml(lines, currency);
    return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${escapeXml(invoiceNumber)}</cbc:ID>
  <cbc:IssueDate>${escapeXml(issueDate)}</cbc:IssueDate>
  <cbc:DueDate>${escapeXml(dueDate)}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${currency}</cbc:DocumentCurrencyCode>
  <cbc:BuyerReference>${escapeXml(invoice.clientNumber || invoice.clientName || 'Client')}</cbc:BuyerReference>

  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0208">${escapeXml(supplierEndpoint)}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${escapeXml(company.name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(company.address)}</cbc:StreetName>
        <cbc:CityName>${escapeXml(company.city)}</cbc:CityName>
        <cac:Country><cbc:IdentificationCode>${escapeXml(supplierCountry)}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${escapeXml(supplierVat)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>${escapeXml(company.name)}</cbc:RegistrationName></cac:PartyLegalEntity>
      <cac:Contact>
        <cbc:ElectronicMail>${escapeXml(company.email)}</cbc:ElectronicMail>
        <cbc:Telephone>${escapeXml(company.phone)}</cbc:Telephone>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>

  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0208">${escapeXml(customerEndpoint)}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${escapeXml(invoice.clientName)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(invoice.address)}</cbc:StreetName>
        <cac:Country><cbc:IdentificationCode>${escapeXml(customerCountry)}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      ${customerVat ? `<cac:PartyTaxScheme>
        <cbc:CompanyID>${escapeXml(customerVat)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>` : ''}
      <cac:PartyLegalEntity><cbc:RegistrationName>${escapeXml(invoice.clientName)}</cbc:RegistrationName></cac:PartyLegalEntity>
      <cac:Contact><cbc:ElectronicMail>${escapeXml(invoice.clientEmail)}</cbc:ElectronicMail></cac:Contact>
    </cac:Party>
  </cac:AccountingCustomerParty>

  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cbc:PaymentID>${escapeXml(paymentReference)}</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>${escapeXml(company.iban)}</cbc:ID>
      ${trim(company.bic) ? `<cac:FinancialInstitutionBranch><cbc:ID>${escapeXml(company.bic)}</cbc:ID></cac:FinancialInstitutionBranch>` : ''}
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>

  <cac:PaymentTerms><cbc:Note>${escapeXml(paymentTerms)}</cbc:Note></cac:PaymentTerms>

  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${currency}">${amount(totals.vat)}</cbc:TaxAmount>${taxSubtotals}
  </cac:TaxTotal>

  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${currency}">${amount(totals.htva)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${currency}">${amount(totals.htva)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${currency}">${amount(totals.tvac)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${currency}">${amount(totals.tvac)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${invoiceLineElements}
</Invoice>`;
  }

  global.BastPeppol = Object.freeze({
    trim, amount, escapeXml, country, taxCategory, unitCode,
    groupVat, validateBelgianEndpoints, invoiceLines, prepareInvoiceData,
    validationChecks, readiness, taxSubtotalsXml, invoiceLinesXml, buildInvoiceXml
  });
})(globalThis);
