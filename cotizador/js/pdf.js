/* =============================================
   MC Auto Sound Design — Cotizador
   js/pdf.js  v5
   ============================================= */

/* La imagen se carga dinámicamente para evitar problemas
   con archivos JS muy grandes en móviles */

// Carga el fondo una sola vez y lo guarda en caché
let _bgCache = null;

async function cargarFondo() {
  if (_bgCache) return _bgCache;
  try {
    const res  = await fetch('./assets/bg.png');
    const blob = await res.blob();
    _bgCache   = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch(e) {
    _bgCache = '';
  }
  return _bgCache;
}


async function generarPDF(state) {
  const c        = state.cliente;
  const settings = state.settings;

  const fecha = c.fecha
    ? new Date(c.fecha + 'T12:00:00')
        .toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
        .toUpperCase()
    : '—';

  let allRows = '';
  let total   = 0;

  const buildRows = (cat) => {
    Object.entries(state.selected).forEach(([id, entry]) => {
      const item = state.catalog[cat]?.find(i => i.id === id);
      if (!item) return;
      const qty      = entry.qty   || 1;
      const price    = entry.price ?? item.price;
      const subtotal = qty * price;
      total += subtotal;
      const precioFmt   = '$' + price.toLocaleString('es-MX', { minimumFractionDigits: 2 });
      const subtotalFmt = '$' + subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 });
      const descripcion = item.desc || item.name;
      allRows += `<tr>
        <td class="c-cant">${qty}</td>
        <td class="c-desc">${descripcion}</td>
        <td class="c-pu">${precioFmt}</td>
        <td class="c-imp">${subtotalFmt}</td>
      </tr>`;
    });
  };

  buildRows('venta');
  buildRows('mdo');

  const totalFmt     = '$' + total.toLocaleString('es-MX', { minimumFractionDigits: 2 });
  const dias         = c.dias      || '?';
  const nombre       = (c.nombre   || '—').toUpperCase();
  const vehiculo     = (c.vehiculo || '—').toUpperCase();
  const folio        = state.folio;
  const tallerNombre = settings.taller?.nombre || 'MC Auto Sound Design';
  const nota         = settings.cotizacion?.nota_footer || '';

  /* La imagen de fondo se inyecta como inline style en el elemento .bg
     para evitar cualquier problema de escape de comillas dentro del CSS */
  const bgUrl   = await cargarFondo();
  const bgStyle = bgUrl ? `background-image:url('${bgUrl}')` : 'background:#111';

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300&family=Dancing+Script:wght@500;600&display=swap');

    *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
    @page { size: 1080px 1920px; margin: 0; }

    html, body {
      width: 1080px;
      height: 1920px;
      overflow: hidden;
      background: #0a0a0a;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font-family: 'Poppins', sans-serif;
    }

    .sheet {
      position: relative;
      width: 1080px;
      height: 1920px;
      overflow: hidden;
    }

    /* Fondo: data URI directo en el atributo style del elemento .bg,
       así evitamos cualquier problema con escape de comillas en el template */
    .bg {
      position: absolute;
      inset: 0;
      background-size: cover;
      background-position: center top;
      background-repeat: no-repeat;
      z-index: 0;
    }

    .overlay {
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,0.60);
      z-index: 1;
    }

    .content {
      position: absolute;
      inset: 0;
      z-index: 2;
      padding: 72px 72px 64px;
      display: flex;
      flex-direction: column;
      color: #fff;
      font-family: 'Poppins', sans-serif;
    }

    /* ── 1. Nombre taller centrado ── */
    .logo-block {
      text-align: center;
      padding-bottom: 30px;
      margin-bottom: 40px;
      border-bottom: 1px solid rgba(255,255,255,.15);
      flex-shrink: 0;
    }

    .brand-script {
      font-family: 'Dancing Script', cursive;
      font-size: 58px;
      font-weight: 600;
      letter-spacing: .10em;
      color: rgba(255,255,255,.92);
      line-height: 1.2;
    }

    /* ── 2. Fila: PRESUPUESTO (izq, abajo) + Datos cliente (der, izq-justificado) ── */
    .client-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-bottom: 40px;
      gap: 40px;
      flex-shrink: 0;
    }

    /* PRESUPUESTO — izquierda, alineado a la base de los datos */
    .presupuesto-aside { flex-shrink: 0; }

    .presupuesto-word {
      font-family: 'Poppins', sans-serif;
      font-size: 48px;
      font-style: normal;
      font-weight: 700;
      color: #CC0000;
      letter-spacing: .08em;
      text-transform: uppercase;
      line-height: 1;
    }

    /* Datos cliente — derecha, texto alineado a la izquierda */
    .client-data {
      text-align: left;
    }

    .info-line {
      display: flex;
      align-items: baseline;
      justify-content: flex-start;
      gap: 14px;
      margin-bottom: 10px;
    }

    /* Etiqueta: misma apariencia que el valor pero un punto menos, mismo color */
    .ilabel {
      font-family: 'Poppins', sans-serif;
      font-size: 21px;      /* valor=24, etiqueta=21 — aprox -1 punto relativo */
      font-weight: 400;
      letter-spacing: .04em;
      color: rgba(255,255,255,.92);  /* mismo color que .ival */
      flex-shrink: 0;
    }

    .ival {
      font-family: 'Poppins', sans-serif;
      font-size: 24px;
      font-weight: 500;
      color: rgba(255,255,255,.92);
      letter-spacing: .04em;
      line-height: 1.3;
    }

    .ival.mono {
      font-family: 'Poppins', sans-serif;
      font-size: 22px;
      font-weight: 300;
      letter-spacing: .10em;
      color: rgba(255,255,255,.92);
    }

    /* ── 3. Texto intro ── */
    .intro-text {
      font-family: 'Poppins', sans-serif;
      font-size: 16px;
      font-weight: 300;
      color: rgba(255,255,255,.4);
      line-height: 1.8;
      margin-bottom: 36px;
      font-style: italic;
      padding-left: 18px;
      border-left: 1.5px solid rgba(255,255,255,.16);
      flex-shrink: 0;
    }

    /* ── 4. Tabla ── */
    .table-container {
      border: 1px solid rgba(255,255,255,.15);
      border-radius: 8px;
      overflow: hidden;
      flex-shrink: 0;
    }

    .table-header {
      display: grid;
      grid-template-columns: 60px 1fr 190px 190px;
      padding: 14px 24px;
      background: rgba(255,255,255,.09);
      border-bottom: 1px solid rgba(255,255,255,.12);
    }

    .th {
      font-family: 'Poppins', sans-serif;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: .16em;
      text-transform: uppercase;
      color: rgba(255,255,255,.5);
    }

    .th.center { text-align: center; }
    .th.right  { text-align: right; }

    table { width: 100%; border-collapse: collapse; }

    table tr {
      display: grid;
      grid-template-columns: 60px 1fr 190px 190px;
      padding: 13px 24px;
      border-bottom: 1px solid rgba(255,255,255,.07);
    }

    table tr:last-child { border-bottom: none; }
    table tr:nth-child(even) { background: rgba(255,255,255,.025); }

    td {
      font-family: 'Poppins', sans-serif;
      font-size: 18px;
      font-weight: 300;
      color: #fff;
      display: flex;
      align-items: center;
    }

    td.c-cant { justify-content: center; color: rgba(255,255,255,.35); font-size: 17px; }
    td.c-desc { font-size: 17px; line-height: 1.45; padding-right: 16px; color: rgba(255,255,255,.85); font-weight: 300; }
    td.c-pu   { justify-content: flex-end; color: rgba(255,255,255,.5); font-size: 17px; font-weight: 400; }
    td.c-imp  { justify-content: flex-end; font-size: 18px; font-weight: 600; color: #fff; }

    /* ── 5. Subtotal ── */
    .subtotal-wrap {
      display: flex;
      justify-content: flex-end;
      align-items: baseline;
      gap: 20px;
      padding: 22px 24px 0;
      border-top: 1px solid rgba(255,255,255,.16);
      margin-top: 2px;
      flex-shrink: 0;
    }

    .subtotal-label {
      font-family: 'Poppins', sans-serif;
      font-size: 13px;
      font-weight: 500;
      letter-spacing: .20em;
      text-transform: uppercase;
      color: rgba(255,255,255,.35);
    }

    .subtotal-val {
      font-family: 'Poppins', sans-serif;
      font-size: 44px;
      font-weight: 600;
      color: #fff;
      letter-spacing: .01em;
    }

    /* ── 6. Footer ── */
    .footer {
      margin-top: auto;
      padding-top: 24px;
      border-top: 1px solid rgba(255,255,255,.1);
      flex-shrink: 0;
    }

    .footer-list { list-style: none; display: flex; flex-direction: column; gap: 8px; }

    .footer-list li {
      font-family: 'Poppins', sans-serif;
      font-size: 15px;
      font-weight: 300;
      color: rgba(255,255,255,.38);
      line-height: 1.7;
      padding-left: 18px;
      position: relative;
    }

    .footer-list li::before { content: '·'; position: absolute; left: 0; color: rgba(255,255,255,.22); }
    .footer-list strong { color: rgba(255,255,255,.6); font-weight: 500; }

    @media print {
      html, body { width: 1080px; height: 1920px; overflow: hidden; }
      @page { size: 1080px 1920px; margin: 0; }
    }
`;

  const html = `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=1080"/>
<title>${folio} — ${c.nombre || 'Presupuesto'}</title>
<style>${css}</style>
</head><body>
<div class="sheet">
  <div class="bg" style="${bgStyle}"></div>
  <div class="overlay"></div>
  <div class="content">

    <div class="logo-block">
      <span class="brand-script">${tallerNombre}</span>
    </div>

    <div class="client-header">
      <div class="presupuesto-aside">
        <span class="presupuesto-word">Presupuesto</span>
      </div>
      <div class="client-data">
        <div class="info-line"><span class="ilabel">Fecha&nbsp;&nbsp;</span><span class="ival">${fecha}</span></div>
        <div class="info-line"><span class="ilabel">Cliente&nbsp;&nbsp;</span><span class="ival">${nombre}</span></div>
        <div class="info-line"><span class="ilabel">Vehículo&nbsp;&nbsp;</span><span class="ival">${vehiculo}</span></div>
        <div class="info-line"><span class="ilabel">Folio&nbsp;&nbsp;</span><span class="ival mono">${folio}</span></div>
      </div>
    </div>

    <p class="intro-text">Este documento detalla la cotización de los productos y servicios recomendados para el vehículo, basados en nuestra conversación y en sus necesidades específicas. Ofreciendo una solución personalizada de acuerdo a la calidad seleccionada.</p>

    <div class="table-container">
      <div class="table-header">
        <span class="th center">Cant.</span>
        <span class="th">Descripción</span>
        <span class="th right">P.U.</span>
        <span class="th right">Importe</span>
      </div>
      <table>${allRows}</table>
    </div>

    <div class="subtotal-wrap">
      <span class="subtotal-label">Subtotal</span>
      <span class="subtotal-val">${totalFmt}</span>
    </div>

    <div class="footer">
      <ul class="footer-list">
        <li>${nota}</li>
        <li>El proceso de instalación y ajuste del sistema de audio tomará aproximadamente <strong>${dias} día(s)</strong>, dependiendo de la complejidad del proyecto y los requerimientos específicos del vehículo.</li>
      </ul>
    </div>

  </div>
</div>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${folio}_${(c.nombre || 'presupuesto').replace(/\s+/g, '_')}.html`;
  a.click();
  URL.revokeObjectURL(url);
}
