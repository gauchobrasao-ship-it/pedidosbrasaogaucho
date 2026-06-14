const PDFDocument = require('pdfkit');

const COLORS = {
  black: '#0D0D0D',
  dark: '#1A1A1A',
  darkCard: '#252525',
  gold: '#D4AF37',
  yellow: '#C8961E',
  orange: '#E07820',
  cream: '#F5E6C8',
  white: '#FFFFFF',
  gray: '#888888',
  lightGray: '#EEEEEE',
  rowAlt: '#FFF8F0'
};

function fmt(val) {
  return `R$ ${parseFloat(val || 0).toFixed(2).replace('.', ',')}`;
}

function fmtDate(dateStr) {
  return new Date(dateStr).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function generateOrderPDF(order) {
  return new Promise((resolve, reject) => {
  const doc = new PDFDocument({ margin: 0, size: 'A4' });
  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);

  const W = doc.page.width;
  const MARGIN = 40;
  const CONTENT_W = W - MARGIN * 2;

  // ── HEADER ──────────────────────────────────────────────
  doc.rect(0, 0, W, 110).fill(COLORS.dark);
  doc.rect(0, 110, W, 4).fill(COLORS.orange);

  doc.fillColor(COLORS.gold).fontSize(22).font('Helvetica-Bold')
    .text(order.churrascaria_name.toUpperCase(), MARGIN, 22, { width: CONTENT_W, align: 'center' });

  doc.fillColor(COLORS.cream).fontSize(10).font('Helvetica')
    .text('PEDIDO DE COMPRAS', MARGIN, 52, { width: CONTENT_W, align: 'center' });

  const ordNum = `Nº ${String(order.id).padStart(6, '0')}`;
  const ordDate = fmtDate(order.created_at);
  doc.fillColor(COLORS.gray).fontSize(9)
    .text(`${ordNum}  ·  ${ordDate}  ·  Responsável: ${order.user_name}`, MARGIN, 72, { width: CONTENT_W, align: 'center' });

  // ── FORNECEDOR ───────────────────────────────────────────
  let y = 128;
  doc.rect(MARGIN, y, CONTENT_W, 85).fill('#F9F9F9').stroke('#E0E0E0');

  doc.fillColor(COLORS.orange).fontSize(8).font('Helvetica-Bold')
    .text('FORNECEDOR', MARGIN + 10, y + 10);

  doc.fillColor(COLORS.dark).fontSize(13).font('Helvetica-Bold')
    .text(order.company_name, MARGIN + 10, y + 24);

  const infoY = y + 44;
  doc.fontSize(9).font('Helvetica').fillColor('#444444');
  if (order.company_cnpj) doc.text(`CNPJ: ${order.company_cnpj}`, MARGIN + 10, infoY);
  if (order.company_phone) doc.text(`Tel: ${order.company_phone}`, MARGIN + 130, infoY);
  if (order.company_contact) doc.text(`Contato: ${order.company_contact}`, MARGIN + 10, infoY + 14);
  if (order.company_email) doc.text(`Email: ${order.company_email}`, MARGIN + 10, infoY + 28);
  if (order.company_address) doc.text(`Endereço: ${order.company_address}`, MARGIN + 200, infoY + 14, { width: CONTENT_W / 2 });

  // ── TABLE HEADER ─────────────────────────────────────────
  y = 228;
  const cols = { product: MARGIN, category: MARGIN + 195, unit: MARGIN + 320, qty: MARGIN + 355, price: MARGIN + 400, subtotal: MARGIN + 460 };

  doc.rect(MARGIN, y, CONTENT_W, 22).fill(COLORS.dark);
  doc.fillColor(COLORS.gold).fontSize(8).font('Helvetica-Bold')
    .text('PRODUTO', cols.product + 8, y + 7)
    .text('CATEGORIA', cols.category, y + 7)
    .text('UN', cols.unit, y + 7)
    .text('QTD', cols.qty, y + 7)
    .text('UNIT.', cols.price, y + 7)
    .text('SUBTOTAL', cols.subtotal, y + 7);

  // ── TABLE ROWS ────────────────────────────────────────────
  y += 22;
  let rowIdx = 0;

  for (const item of order.items) {
    if (y > doc.page.height - 100) {
      doc.addPage({ margin: 0, size: 'A4' });
      y = 40;
    }

    const bg = rowIdx % 2 === 0 ? COLORS.white : COLORS.rowAlt;
    doc.rect(MARGIN, y, CONTENT_W, 20).fill(bg);

    doc.fillColor(COLORS.dark).fontSize(8.5).font('Helvetica')
      .text(item.product_name, cols.product + 8, y + 6, { width: 183, ellipsis: true })
      .text(item.category_name || '-', cols.category, y + 6, { width: 120 })
      .text(item.unit || '-', cols.unit, y + 6, { width: 30 })
      .text(String(item.quantity).replace('.', ','), cols.qty, y + 6, { width: 40 })
      .text(fmt(item.unit_price), cols.price, y + 6, { width: 55 })
      .text(fmt(item.subtotal), cols.subtotal, y + 6, { width: 65 });

    y += 20;
    rowIdx++;
  }

  // ── TOTAL ─────────────────────────────────────────────────
  doc.rect(MARGIN, y + 4, CONTENT_W, 28).fill(COLORS.dark);
  doc.fillColor(COLORS.gold).fontSize(11).font('Helvetica-Bold')
    .text('TOTAL DO PEDIDO:', cols.price - 60, y + 12)
    .text(fmt(order.total), cols.subtotal, y + 12);

  y += 46;

  // ── OBSERVAÇÕES ───────────────────────────────────────────
  if (order.observations) {
    doc.rect(MARGIN, y, CONTENT_W, 1).fill('#E0E0E0');
    y += 8;
    doc.fillColor(COLORS.orange).fontSize(8).font('Helvetica-Bold').text('OBSERVAÇÕES:', MARGIN, y);
    y += 12;
    doc.fillColor(COLORS.dark).fontSize(9).font('Helvetica').text(order.observations, MARGIN, y, { width: CONTENT_W });
    y += doc.heightOfString(order.observations, { width: CONTENT_W }) + 8;
  }

  // ── FOOTER ────────────────────────────────────────────────
  const footerY = doc.page.height - 36;
  doc.rect(0, footerY, W, 36).fill(COLORS.dark);
  doc.fillColor(COLORS.gray).fontSize(7.5).font('Helvetica')
    .text(
      `Brasão Gaúcho · ${order.churrascaria_name} · Gerado em ${new Date().toLocaleString('pt-BR')} por ${order.user_name}`,
      MARGIN, footerY + 13, { width: CONTENT_W, align: 'center' }
    );

  doc.end();
  }); // end Promise
}

module.exports = { generateOrderPDF };
