// Factures : numérotation continue par année (F2026-00001…) et génération PDF.
const PDFDocument = require('pdfkit');
const config = require('../config');

// Attribue le numéro suivant de façon atomique (pas de doublon ni de trou, même en parallèle).
// À appeler dans la même transaction que le passage de la commande en "payée".
async function nextInvoiceNumber(conn) {
  const year = new Date().getFullYear();
  await conn.query(
    'INSERT INTO counters (name, value) VALUES (?, LAST_INSERT_ID(1)) ON DUPLICATE KEY UPDATE value = LAST_INSERT_ID(value + 1)',
    [`invoice-${year}`]
  );
  const [[{ n }]] = await conn.query('SELECT LAST_INSERT_ID() AS n');
  return `${config.legal.invoicePrefix}${year}-${String(n).padStart(5, '0')}`;
}

const euros = (cents) => `${(cents / 100).toFixed(2).replace('.', ',')}\u00a0€`;
const frDate = (s) => new Date(String(s).replace(' ', 'T')).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

// Montants HT / TVA à partir du prix TTC
function amounts(order) {
  const rate = order.vat_rate_bp / 10000;
  const ht = Math.round(order.amount_cents / (1 + rate));
  return { ht, vat: order.amount_cents - ht, ttc: order.amount_cents, ratePct: order.vat_rate_bp / 100 };
}

// order : ligne de la table orders (avec invoice_number, paid_at…). Renvoie un Buffer PDF.
function invoicePdf(order) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Facture ${order.invoice_number}`, Author: config.site.name } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const { site, legal } = config;
    const ink = '#1d2a2c';
    const muted = '#5f6b68';
    const primary = '#0f5c55';
    const left = 50;
    const right = 545;

    // Vendeur
    doc.fillColor(primary).font('Helvetica-Bold').fontSize(18).text(site.name, left, 50);
    doc.fillColor(ink).font('Helvetica').fontSize(10)
      .text(`${site.therapist} — masseur-kinésithérapeute D.E.`)
      .text(site.address)
      .text(`${site.phone} · ${site.email}`);
    if (legal.siret) doc.text(`SIRET : ${legal.siret}`);
    if (legal.vatNumber) doc.text(`N° TVA intracommunautaire : ${legal.vatNumber}`);

    // Titre
    doc.font('Helvetica-Bold').fontSize(16).fillColor(ink).text('FACTURE', 350, 50, { width: right - 350, align: 'right' });
    doc.font('Helvetica').fontSize(10)
      .text(`N° ${order.invoice_number}`, 350, 72, { width: right - 350, align: 'right' })
      .text(`Date : ${frDate(order.paid_at)}`, { width: right - 350, align: 'right' });

    // Client
    doc.moveDown(4);
    let y = 170;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(muted).text('FACTURÉ À', left, y);
    doc.font('Helvetica').fillColor(ink).fontSize(11).text(order.billing_name, left, y + 15).text(order.billing_email);

    // Tableau
    y = 250;
    const { ht, vat, ttc, ratePct } = amounts(order);
    const cols = { label: left, qty: 330, pu: 380, vat: 450, total: 490 };
    doc.rect(left, y, right - left, 24).fill('#f1eee8');
    doc.fillColor(muted).font('Helvetica-Bold').fontSize(9)
      .text('DÉSIGNATION', cols.label + 8, y + 8)
      .text('QTÉ', cols.qty, y + 8, { width: 40, align: 'center' })
      .text('PU HT', cols.pu, y + 8, { width: 65, align: 'right' })
      .text('TVA', cols.vat, y + 8, { width: 35, align: 'right' })
      .text('TOTAL TTC', cols.total - 10, y + 8, { width: right - cols.total + 2, align: 'right' });
    y += 34;
    doc.fillColor(ink).font('Helvetica').fontSize(10)
      .text(`Programme de rééducation en ligne : « ${order.program_title} »`, cols.label + 8, y, { width: 270 })
      .text('1', cols.qty, y, { width: 40, align: 'center' })
      .text(euros(ht), cols.pu, y, { width: 65, align: 'right' })
      .text(`${ratePct} %`, cols.vat, y, { width: 35, align: 'right' })
      .text(euros(ttc), cols.total - 10, y, { width: right - cols.total + 2, align: 'right' });
    y += 40;
    doc.moveTo(left, y).lineTo(right, y).strokeColor('#e2ddd3').stroke();

    // Totaux
    y += 12;
    const line = (label, value, bold) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10).fillColor(ink)
        .text(label, 330, y, { width: 120, align: 'right' })
        .text(value, 455, y, { width: right - 455, align: 'right' });
      y += bold ? 22 : 16;
    };
    line('Total HT', euros(ht));
    line(`TVA ${ratePct} %`, euros(vat));
    line('Total TTC', euros(ttc), true);
    if (!order.vat_rate_bp) {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor(muted).text(legal.vatExemptMention, 300, y, { width: right - 300, align: 'right' });
      y += 16;
    }

    // Paiement et mentions
    y += 24;
    doc.font('Helvetica').fontSize(10).fillColor(ink)
      .text(`Facture acquittée : payée le ${frDate(order.paid_at)} par carte bancaire.`, left, y, { width: right - left });
    doc.moveDown(0.6).fontSize(9).fillColor(muted)
      .text(`Contenu numérique fourni immédiatement à la demande expresse du client, qui a reconnu perdre son droit de rétractation (art. L221-28 13° du Code de la consommation) le ${frDate(order.waiver_accepted_at)}.`, { width: right - left })
      .moveDown(0.4)
      .text('Pas d\'escompte pour paiement anticipé. En cas de retard de paiement : pénalités au taux légal et indemnité forfaitaire de 40\u00a0€ pour frais de recouvrement (clients professionnels).', { width: right - left });

    doc.fontSize(8).fillColor(muted).text(`${site.name} · ${site.address}${legal.siret ? ` · SIRET ${legal.siret}` : ''}`, left, 780, { width: right - left, align: 'center' });
    doc.end();
  });
}

module.exports = { nextInvoiceNumber, invoicePdf, amounts };
