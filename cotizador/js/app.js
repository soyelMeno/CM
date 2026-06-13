/* =============================================
   MC Auto Sound Design — Cotizador
   js/app.js  v2
   ============================================= */

const KEY_COUNTER  = 'mcasd_folio_counter';
const KEY_CATALOG  = 'mcasd_catalog_v2';
const KEY_SETTINGS = 'mcasd_settings_v1';
const KEY_CLIENTE  = 'mcasd_cliente_temp';

/* ——— STATE ———
   selected = { [id]: { qty: number, price: number } }
   Así guardamos tanto cantidad como precio ajustado por item
*/
let state = {
  folio:    '',
  catalog:  { venta: [], mdo: [] },
  selected: {},          // { id: { qty, price } }
  cliente:  { nombre: '', vehiculo: '', fecha: '', dias: '' },
  settings: {}
};

let currentTab    = 'venta';
let currentScreen = 1;

/* ============================================= */
/*  INIT                                         */
/* ============================================= */
async function init() {
  setClock();
  state.settings = loadSettings();
  state.catalog  = await loadCatalog();

  const saved = loadSavedCliente();
  if (saved) state.cliente = saved;

  state.folio = generateFolio(state.settings);

  renderClienteFields();
  renderCatalog();
  updateSelBar();
}

/* ============================================= */
/*  CLOCK                                        */
/* ============================================= */
function setClock() {
  const now = new Date();
  document.getElementById('clock').textContent =
    `${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`;
}

/* ============================================= */
/*  SETTINGS                                     */
/* ============================================= */
function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY_SETTINGS);
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return {
    taller: { nombre: 'MC Auto Sound Design', telefono: '', ciudad: 'Villahermosa, Tabasco' },
    folio:  { prefijo: 'COT', contador: 0 },
    cotizacion: {
      validez_dias: 30,
      nota_footer: 'Esta cotización es válida por 30 días. Precios sujetos a cambios sin previo aviso.'
    }
  };
}

function saveSettings() {
  localStorage.setItem(KEY_SETTINGS, JSON.stringify(state.settings));
}

/* ============================================= */
/*  FOLIO                                        */
/* ============================================= */
function generateFolio(settings) {
  const prefijo = settings.folio?.prefijo || 'COT';
  let n = 0;
  try { n = parseInt(localStorage.getItem(KEY_COUNTER) || '0') + 1; } catch(e) { n = 1; }
  localStorage.setItem(KEY_COUNTER, n);
  if (settings.folio) settings.folio.contador = n;
  saveSettings();
  return `${prefijo}-${String(n).padStart(4,'0')}`;
}

/* ============================================= */
/*  CATÁLOGO                                     */
/* ============================================= */
async function loadCatalog() {
  try {
    const raw = localStorage.getItem(KEY_CATALOG);
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  try {
    const res  = await fetch('./data/catalog.json');
    const data = await res.json();
    localStorage.setItem(KEY_CATALOG, JSON.stringify(data));
    return data;
  } catch(e) {}
  return { venta: [], mdo: [] };
}

function saveCatalog() {
  localStorage.setItem(KEY_CATALOG, JSON.stringify(state.catalog));
}

/* ============================================= */
/*  CLIENTE                                      */
/* ============================================= */
function renderClienteFields() {
  const c   = state.cliente;
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('f-nombre').value   = c.nombre   || '';
  document.getElementById('f-vehiculo').value = c.vehiculo || '';
  document.getElementById('f-fecha').value    = c.fecha    || hoy;
  document.getElementById('f-dias').value     = c.dias     || '';
  document.getElementById('f-folio').value    = state.folio;
  document.getElementById('folio-hdr').textContent = state.folio;
}

function captureCliente() {
  state.cliente = {
    nombre:   document.getElementById('f-nombre').value.trim(),
    vehiculo: document.getElementById('f-vehiculo').value.trim(),
    fecha:    document.getElementById('f-fecha').value,
    dias:     document.getElementById('f-dias').value
  };
  localStorage.setItem(KEY_CLIENTE, JSON.stringify(state.cliente));
}

function loadSavedCliente() {
  try {
    const raw = localStorage.getItem(KEY_CLIENTE);
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
}

/* ============================================= */
/*  STEPPER                                      */
/* ============================================= */
function goTo(n) {
  if (n === 2) captureCliente();
  if (n === 3) buildSummary();

  const prev = document.getElementById('s' + currentScreen);
  prev.classList.remove('active');
  prev.classList.add('exit');
  setTimeout(() => prev.classList.remove('exit'), 300);

  currentScreen = n;
  document.getElementById('s' + n).classList.add('active');
  updateStepper();
  if (n === 2) renderCatalog();
}

function updateStepper() {
  [1,2,3].forEach(i => {
    const dot = document.getElementById('sd' + i);
    if (i < currentScreen) {
      dot.className = 'stp-dot done';
      dot.innerHTML = '<i class="ti ti-check" style="font-size:12px"></i>';
    } else if (i === currentScreen) {
      dot.className = 'stp-dot active';
      dot.textContent = i;
    } else {
      dot.className = 'stp-dot';
      dot.textContent = i;
    }
    if (i < 3) {
      const line = document.getElementById('sl' + i);
      if (line) line.className = 'stp-line' + (i < currentScreen ? ' done' : '');
    }
  });
}

/* ============================================= */
/*  CATÁLOGO — RENDER                            */
/* ============================================= */
function switchTab(t) {
  currentTab = t;
  document.getElementById('tab-v').className = 'tab' + (t === 'venta' ? ' active' : '');
  document.getElementById('tab-m').className = 'tab' + (t === 'mdo'   ? ' active' : '');
  document.getElementById('srch').value = '';
  renderCatalog();
}

function renderCatalog() {
  const q      = (document.getElementById('srch').value || '').toLowerCase();
  const items  = state.catalog[currentTab] || [];
  const list   = document.getElementById('cat-list');
  const isMdo  = currentTab === 'mdo';

  list.innerHTML = '';

  const filtered = q
    ? items.filter(i =>
        i.name.toLowerCase().includes(q) ||
        (i.tag  || '').toLowerCase().includes(q)
      )
    : items;

  filtered.forEach(item => {
    const entry   = state.selected[item.id];
    const isSel   = !!entry;
    const qty     = entry?.qty   ?? 1;
    const price   = entry?.price ?? item.price;
    const subtotal = (qty * price).toLocaleString('es-MX');

    const div = document.createElement('div');
    div.className = 'cat-item' + (isSel ? ' sel' : '');
    div.dataset.id = item.id;

    // Controles de cantidad — solo en venta
    const qtyControls = !isMdo ? `
      <div class="qty-wrap">
        <button class="qty-btn" onclick="changeQty('${item.id}',-1,event)">−</button>
        <span class="qty-val" id="qty-${item.id}">${qty}</span>
        <button class="qty-btn" onclick="changeQty('${item.id}',1,event)">+</button>
      </div>` : '';

    div.innerHTML = `
      <div class="cat-chk"></div>
      <div class="cat-info" style="flex:1;min-width:0">
        <div class="cat-tag">${item.tag || ''}</div>
        <div class="cat-name">${item.name}</div>
        <div class="cat-price">$${item.price.toLocaleString('es-MX')} / ${item.unit || 'pza'}</div>
      </div>
      ${isSel ? `
      <div class="cat-controls">
        ${qtyControls}
        <div class="price-edit-wrap">
          <span class="price-edit-label">$</span>
          <input
            class="price-edit-input"
            type="number"
            id="price-${item.id}"
            value="${price}"
            min="0"
            step="1"
            onclick="event.stopPropagation()"
            oninput="updatePrice('${item.id}', this.value)"
            onfocus="this.select()"
          />
        </div>
        <span class="cat-subtotal" id="sub-${item.id}">= $${subtotal}</span>
      </div>` : ''}
    `;

    // Toggle selección solo en el área superior (no en controles)
    div.addEventListener('click', (e) => {
      if (e.target.closest('.cat-controls')) return;
      toggleItem(item.id, item.price);
    });

    list.appendChild(div);
  });

  // Botón agregar nuevo
  const addBtn = document.createElement('button');
  addBtn.className = 'add-new';
  addBtn.innerHTML = '<i class="ti ti-plus" style="font-size:16px"></i> Agregar nuevo concepto';
  addBtn.addEventListener('click', openModal);
  list.appendChild(addBtn);
}

/* ============================================= */
/*  SELECCIÓN / CANTIDAD / PRECIO                */
/* ============================================= */
function toggleItem(id, basePrice) {
  if (state.selected[id]) {
    delete state.selected[id];
  } else {
    state.selected[id] = { qty: 1, price: basePrice };
  }
  updateSelBar();
  renderCatalog();
}

function changeQty(id, delta, e) {
  e.stopPropagation();
  if (!state.selected[id]) return;
  const newQty = Math.max(1, (state.selected[id].qty || 1) + delta);
  state.selected[id].qty = newQty;

  // Actualizar UI sin re-renderizar toda la lista
  const qtyEl = document.getElementById('qty-' + id);
  if (qtyEl) qtyEl.textContent = newQty;
  refreshSubtotal(id);
  updateSelBar();
}

function updatePrice(id, val) {
  if (!state.selected[id]) return;
  const p = parseFloat(val);
  if (isNaN(p) || p < 0) return;
  state.selected[id].price = p;
  refreshSubtotal(id);
  updateSelBar();
}

function refreshSubtotal(id) {
  const entry = state.selected[id];
  if (!entry) return;
  const sub = document.getElementById('sub-' + id);
  if (sub) sub.textContent = '= $' + (entry.qty * entry.price).toLocaleString('es-MX');
}

function updateSelBar() {
  let count = 0, total = 0;
  Object.entries(state.selected).forEach(([id, entry]) => {
    count++;
    total += (entry.qty || 1) * (entry.price || 0);
  });
  document.getElementById('sel-n').textContent = count;
  document.getElementById('sel-t').textContent  = total.toLocaleString('es-MX');
}

/* ============================================= */
/*  MODAL — Nuevo concepto                       */
/* ============================================= */
function openModal() {
  document.getElementById('m-cat').value    = currentTab;
  document.getElementById('m-desc').value   = '';
  document.getElementById('m-tag').value    = '';
  document.getElementById('m-precio').value = '';
  document.getElementById('m-unit').value   = currentTab === 'mdo' ? 'serv' : 'pza';
  document.getElementById('modal').classList.add('open');
  setTimeout(() => document.getElementById('m-tag').focus(), 300);
}

function closeModal(e) {
  if (!e || e.target === document.getElementById('modal')) {
    document.getElementById('modal').classList.remove('open');
  }
}

function saveNewConcept() {
  const desc   = document.getElementById('m-desc').value.trim();
  const tag    = document.getElementById('m-tag').value.trim().toUpperCase();
  const precio = parseFloat(document.getElementById('m-precio').value);
  const cat    = document.getElementById('m-cat').value;
  const unit   = document.getElementById('m-unit').value || 'pza';

  if (!desc || isNaN(precio) || precio < 0) {
    showToast('Completa descripción y precio');
    return;
  }

  const id   = cat[0] + Date.now();
  const item = { id, tag: tag || desc.substring(0,10).toUpperCase(), name: desc, desc: desc, price: precio, unit };

  state.catalog[cat].push(item);
  state.selected[id] = { qty: 1, price: precio };

  saveCatalog();
  closeModal();
  switchTab(cat);
  updateSelBar();
  showToast('Guardado en catálogo ✓');
}

/* ============================================= */
/*  RESUMEN                                      */
/* ============================================= */
function buildSummary() {
  captureCliente();
  const c = state.cliente;

  const nombre   = c.nombre || 'Sin nombre';
  const initials = nombre.split(' ').slice(0,2).map(w => w[0] || '').join('').toUpperCase() || '?';
  document.getElementById('sum-avatar').textContent = initials;
  document.getElementById('sum-nombre').textContent = nombre;
  document.getElementById('sum-folio').textContent  = state.folio;

  const fecha = c.fecha
    ? new Date(c.fecha + 'T12:00:00').toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' })
    : '—';
  document.getElementById('sum-meta').textContent =
    `${c.vehiculo || '—'} · ${c.dias || '?'} día(s) · ${fecha}`;

  let total = 0;

  ['venta','mdo'].forEach(cat => {
    const container = document.getElementById('sum-' + cat);
    container.innerHTML = '';

    const catItems = Object.entries(state.selected)
      .map(([id, entry]) => {
        const item = state.catalog[cat]?.find(i => i.id === id);
        return item ? { item, entry } : null;
      })
      .filter(Boolean);

    if (catItems.length === 0) {
      container.innerHTML = '<div class="sum-empty">Sin conceptos</div>';
      return;
    }

    catItems.forEach(({ item, entry }) => {
      const subtotal = (entry.qty || 1) * (entry.price || item.price);
      total += subtotal;

      const row = document.createElement('div');
      row.className = 'sum-row';
      row.innerHTML = `
        <span class="sum-rname">
          ${entry.qty > 1 ? `<span style="color:var(--text3);font-family:var(--mono);font-size:11px">${entry.qty}×</span> ` : ''}
          ${item.name}
          ${entry.price !== item.price ? '<span style="font-size:10px;color:var(--amber,#D97706);margin-left:4px">✎</span>' : ''}
        </span>
        <span class="sum-rprice">$${subtotal.toLocaleString('es-MX')}</span>`;
      container.appendChild(row);
    });
  });

  document.getElementById('sum-total').textContent = total.toLocaleString('es-MX');
}

/* ============================================= */
/*  PDF                                          */
/* ============================================= */
function genPDF() {
  showToast('Generando presupuesto…');
  setTimeout(async () => {
    await generarPDF(state);
    showToast(`${state.folio} descargado ✓`);
  }, 800);
}

/* ============================================= */
/*  TOAST                                        */
/* ============================================= */
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

document.addEventListener('DOMContentLoaded', init);
