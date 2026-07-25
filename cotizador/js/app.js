/* =============================================
   MC Auto Sound Design — Cotizador
   js/app.js  v3 — integrado con Firebase Auth
   ============================================= */

import { login, logout, onUserReady, obtenerSiguienteNumero, db, currentUser } from './firebase-config.js';
import {
  collection, getDocs, query, where, orderBy,
  addDoc, doc, getDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

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
/*  AUTENTICACIÓN                                */
/* ============================================= */
let appRole = null; // 'admin' | 'user' — se llena al loguear

async function handleLogin() {
  const usuario  = document.getElementById('l-usuario').value;
  const password = document.getElementById('l-password').value;
  const errEl    = document.getElementById('login-error');
  errEl.textContent = '';

  if (!usuario.trim() || !password) {
    errEl.textContent = 'Ingresa usuario y contraseña';
    return;
  }

  try {
    await login(usuario, password);
    // onUserReady (registrado abajo) se encarga de mostrar la app
  } catch (e) {
    console.error(e);
    errEl.textContent = 'Usuario o contraseña incorrectos';
  }
}

async function handleLogout() {
  await logout();
  // onUserReady se encarga de volver a mostrar el login
}

function mostrarApp(role) {
  appRole = role;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = '';
  setClock();
  state.settings = loadSettings();
  showView('view-home');
  document.getElementById('home-avatar').textContent = currentUserInitials();
  document.getElementById('home-total-card').style.display = role === 'admin' ? '' : 'none';
  renderHomeStats();
}

function currentUserInitials() {
  const email = currentUser?.email || '';
  const local = email.split('@')[0] || '?';
  return local.substring(0, 2).toUpperCase();
}

function mostrarLogin() {
  appRole = null;
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('l-password').value = '';
}

/* ============================================= */
/*  INIT                                         */
/* ============================================= */
async function init() {
  setClock();
  state.settings = loadSettings();
  state.catalog  = await loadCatalog();

  const saved = loadSavedCliente();
  if (saved) state.cliente = saved;

  state.folio = null; // se asigna hasta generar el PDF, para no quemar consecutivos al aire

  renderClienteFields();
  renderCatalog();
  updateSelBar();
}

onUserReady((user, role) => {
  if (user) {
    mostrarApp(role);
  } else {
    mostrarLogin();
  }
});

/* ============================================= */
/*  ROUTER DE VISTAS (Home / Wizard / Listado)   */
/* ============================================= */
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function goHome() {
  showView('view-home');
  document.getElementById('home-total-card').style.display = appRole === 'admin' ? '' : 'none';
  renderHomeStats();
}

async function iniciarNuevaCotizacion() {
  // Empezar siempre desde cero: limpiar cliente guardado y selección previa
  localStorage.removeItem(KEY_CLIENTE);
  state.cliente  = { nombre: '', vehiculo: '', fecha: '', dias: '' };
  state.selected = {};

  document.querySelectorAll('#view-wizard .screen').forEach(s => s.classList.remove('active', 'exit'));
  document.getElementById('s1').classList.add('active');
  currentScreen = 1;
  updateStepper();

  showView('view-wizard');
  await init();
}

/* ============================================= */
/*  HOME — métricas rápidas                      */
/* ============================================= */
async function renderHomeStats() {
  try {
    const snap = await getDocs(collection(db, 'cotizaciones'));
    let pendientes = 0, aprobadas = 0, totalMes = 0;
    const hoy = new Date();
    const ymActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;

    snap.forEach((d) => {
      const c = d.data();
      if (c.status === 'pendiente') pendientes++;
      if (c.status === 'aprobada')  aprobadas++;
      if (appRole === 'admin' && c.status === 'aprobada' && (c.fecha || '').startsWith(ymActual)) {
        totalMes += c.total || 0;
      }
    });

    document.getElementById('home-metric-pendientes').textContent = pendientes;
    document.getElementById('home-metric-aprobadas').textContent  = aprobadas;
    if (appRole === 'admin') {
      document.getElementById('home-total-val').textContent = '$' + totalMes.toLocaleString('es-MX', { minimumFractionDigits: 2 });
    }
  } catch (e) {
    console.error('Error al cargar métricas de Home:', e);
  }
}

/* ============================================= */
/*  LISTADO — Productos · Servicios · Historial  */
/* ============================================= */
let listadoTab   = 'productos';
let listadoCache = []; // último set de datos cargado para el tab activo

function goToListado() {
  showView('view-listado');
  switchListadoTab('productos');
}

function switchListadoTab(tab) {
  listadoTab = tab;
  ['productos', 'servicios', 'historial'].forEach((t) => {
    document.getElementById('ltab-' + t).className = 'tab' + (t === tab ? ' active' : '');
  });
  document.getElementById('lbtn-nuevo').style.display       = (tab === 'historial') ? 'none' : '';
  document.getElementById('lstatus-filter').style.display    = (tab === 'historial') ? '' : 'none';
  document.getElementById('lsrch').value = '';
  document.getElementById('lsrch').placeholder = tab === 'historial' ? 'Buscar cliente o folio…' : 'Buscar…';
  renderListado();
}

async function renderListado() {
  const list = document.getElementById('listado-list');
  list.innerHTML = '<div class="list-empty">Cargando…</div>';

  try {
    if (listadoTab === 'historial') {
      const q = query(collection(db, 'cotizaciones'), orderBy('numero', 'desc'));
      const snap = await getDocs(q);
      listadoCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } else {
      const tipo = listadoTab === 'servicios' ? 'servicio' : 'producto';
      const q = query(collection(db, 'productos'), where('tipo', '==', tipo));
      const snap = await getDocs(q);
      listadoCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      listadoCache.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    }
  } catch (e) {
    console.error('Error al cargar listado:', e);
    list.innerHTML = '<div class="list-empty">No se pudo cargar. Revisa tu conexión.</div>';
    return;
  }

  const texto = (document.getElementById('lsrch').value || '').toLowerCase();
  let datos = listadoCache;

  if (listadoTab === 'historial') {
    const statusFiltro = document.getElementById('lstatus-filter').value;
    datos = datos.filter(c => {
      const matchTexto = !texto ||
        (c.cliente_nombre || '').toLowerCase().includes(texto) ||
        ('cot' + c.numero).includes(texto);
      const matchStatus = !statusFiltro || c.status === statusFiltro;
      return matchTexto && matchStatus;
    });
  } else {
    datos = datos.filter(p =>
      !texto ||
      (p.nombre || '').toLowerCase().includes(texto) ||
      (p.categoria || '').toLowerCase().includes(texto)
    );
  }

  list.innerHTML = '';

  if (datos.length === 0) {
    list.innerHTML = '<div class="list-empty">Sin resultados</div>';
    return;
  }

  if (listadoTab === 'historial') {
    datos.forEach((c) => {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `
        <div class="list-row-info">
          <div class="list-row-title">COT${c.numero} · ${c.cliente_nombre || 'Sin nombre'}</div>
          <div class="list-row-sub">${c.fecha || '—'} · $${(c.total || 0).toLocaleString('es-MX')}</div>
        </div>
        <span class="status-badge status-${c.status}">${capitalizar(c.status)}</span>
      `;
      row.addEventListener('click', () => abrirModalHistorial(c.id));
      list.appendChild(row);
    });
  } else {
    datos.forEach((p) => {
      const row = document.createElement('div');
      row.className = 'list-row' + (p.activo === false ? ' inactivo' : '');
      row.innerHTML = `
        <div class="list-row-info">
          <div class="list-row-title">${p.nombre}</div>
          <div class="list-row-sub">${p.categoria || ''}${p.activo === false ? ' · inactivo' : ''}</div>
        </div>
        <span class="list-row-price">$${(p.precio || 0).toLocaleString('es-MX')}</span>
      `;
      row.addEventListener('click', () => abrirModalProducto(p.id));
      list.appendChild(row);
    });
  }
}

function capitalizar(s) {
  if (!s) return '—';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ============================================= */
/*  MODAL — Producto del catálogo (admin)        */
/* ============================================= */
let editingProductoId = null;

function abrirModalProducto(id) {
  if (id && appRole !== 'admin') {
    showToast('Solo un admin puede editar el catálogo');
    return;
  }

  editingProductoId = id;
  const esNuevo = !id;
  document.getElementById('mp-titulo').textContent = esNuevo ? 'Nuevo producto' : 'Editar producto';

  if (esNuevo) {
    document.getElementById('mp-nombre').value    = '';
    document.getElementById('mp-desc').value      = '';
    document.getElementById('mp-tipo').value      = listadoTab === 'servicios' ? 'servicio' : 'producto';
    document.getElementById('mp-categoria').value = '';
    document.getElementById('mp-precio').value    = '';
    document.getElementById('mp-activo').checked  = true;
  } else {
    const p = listadoCache.find(x => x.id === id);
    if (!p) return;
    document.getElementById('mp-nombre').value    = p.nombre || '';
    document.getElementById('mp-desc').value      = p.descripcion || '';
    document.getElementById('mp-tipo').value      = p.tipo || 'producto';
    document.getElementById('mp-categoria').value = p.categoria || '';
    document.getElementById('mp-precio').value    = p.precio ?? '';
    document.getElementById('mp-activo').checked  = p.activo !== false;
  }

  document.getElementById('modal-producto').classList.add('open');
}

function closeModalProducto(e) {
  if (!e || e.target === document.getElementById('modal-producto')) {
    document.getElementById('modal-producto').classList.remove('open');
  }
}

async function guardarProducto() {
  const nombre    = document.getElementById('mp-nombre').value.trim();
  const desc      = document.getElementById('mp-desc').value.trim();
  const tipo      = document.getElementById('mp-tipo').value;
  const categoria = document.getElementById('mp-categoria').value.trim();
  const precio    = parseFloat(document.getElementById('mp-precio').value);
  const activo    = document.getElementById('mp-activo').checked;

  if (!nombre || isNaN(precio) || precio < 0) {
    showToast('Completa nombre y precio');
    return;
  }

  const ahora = new Date().toISOString();

  try {
    if (editingProductoId) {
      await updateDoc(doc(db, 'productos', editingProductoId), {
        nombre, descripcion: desc || nombre, tipo, categoria, precio, activo,
        actualizado_en: ahora
      });
    } else {
      await addDoc(collection(db, 'productos'), {
        nombre, descripcion: desc || nombre, tipo, categoria, precio,
        activo: true,
        creado_en: ahora, actualizado_en: ahora
      });
    }
    closeModalProducto();
    showToast('Guardado ✓');
    renderListado();
  } catch (e) {
    console.error('Error al guardar producto:', e);
    showToast('No se pudo guardar, revisa tu conexión');
  }
}

/* ============================================= */
/*  MODAL — Cotización del historial             */
/* ============================================= */
let editingCotizacion = null; // { id, ...data }

function abrirModalHistorial(id) {
  const c = listadoCache.find(x => x.id === id);
  if (!c) return;
  editingCotizacion = c;

  document.getElementById('mh-folio').textContent   = `COT${c.numero}`;
  document.getElementById('mh-cliente').textContent = `${c.cliente_nombre || '—'} · ${c.cliente_vehiculo || '—'}`;
  document.getElementById('mh-status').value        = c.status || 'pendiente';

  const detalle = document.getElementById('mh-detalle');
  detalle.innerHTML = '';
  (c.items || []).forEach((it) => {
    const row = document.createElement('div');
    row.className = 'hist-readonly-row';
    row.innerHTML = `
      <span>${it.cantidad}× ${it.nombre}</span>
      <span>$${(it.precio_unitario * it.cantidad).toLocaleString('es-MX')}</span>
    `;
    detalle.appendChild(row);
  });
  const totalRow = document.createElement('div');
  totalRow.className = 'hist-readonly-row';
  totalRow.innerHTML = `<strong>Total</strong><strong>$${(c.total || 0).toLocaleString('es-MX')}</strong>`;
  detalle.appendChild(totalRow);

  document.getElementById('modal-historial').classList.add('open');
}

function closeModalHistorial(e) {
  if (!e || e.target === document.getElementById('modal-historial')) {
    document.getElementById('modal-historial').classList.remove('open');
  }
}

async function guardarStatusCotizacion() {
  if (!editingCotizacion) return;
  const nuevoStatus = document.getElementById('mh-status').value;

  try {
    const historialActualizado = [
      ...(editingCotizacion.historial_status || []),
      { status: nuevoStatus, fecha: new Date().toISOString(), usuario: currentUser?.uid || null }
    ];

    await updateDoc(doc(db, 'cotizaciones', editingCotizacion.id), {
      status: nuevoStatus,
      historial_status: historialActualizado,
      actualizado_en: serverTimestamp()
    });

    closeModalHistorial();
    showToast('Estado actualizado ✓');
    renderListado();
    renderHomeStats();
  } catch (e) {
    console.error('Error al actualizar status:', e);
    showToast('No se pudo guardar, revisa tu conexión');
  }
}

async function reimprimirCotizacion() {
  if (!editingCotizacion) return;
  const c = editingCotizacion;

  // Reconstruimos un "state" equivalente al que usa generarPDF(),
  // a partir del snapshot guardado — así no duplicamos lógica de PDF.
  const fakeState = {
    folio: `COT${c.numero}`,
    settings: state.settings,
    cliente: {
      nombre: c.cliente_nombre,
      vehiculo: c.cliente_vehiculo,
      fecha: c.fecha,
      dias: c.dias_estimados
    },
    catalog: { venta: [], mdo: [] },
    selected: {}
  };

  (c.items || []).forEach((it, idx) => {
    const cat = it.categoria === 'servicio' ? 'mdo' : 'venta';
    const fakeId = it.id || ('item' + idx);
    fakeState.catalog[cat].push({
      id: fakeId,
      name: it.nombre,
      desc: it.descripcion || it.nombre,
      price: it.precio_unitario
    });
    fakeState.selected[fakeId] = { qty: it.cantidad, price: it.precio_unitario };
  });

  showToast('Generando presupuesto…');
  await generarPDF(fakeState);
  showToast(`${fakeState.folio} descargado ✓`);
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
    taller: { nombre: '', telefono: '', ciudad: 'Villahermosa, Tabasco' },
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
/*  FOLIO — ahora vía Firestore (transacción)    */
/* ============================================= */
async function generateFolio() {
  try {
    const numero = await obtenerSiguienteNumero();
    return `COT${numero}`;
  } catch (e) {
    console.error('No se pudo obtener el consecutivo de Firestore:', e);
    showToast('Error al generar folio, revisa tu conexión');
    return 'COT-ERROR';
  }
}

/* ============================================= */
/*  CATÁLOGO — ahora desde Firestore             */
/*  Mapeo: tipo "producto" → tab "venta"         */
/*         tipo "servicio" → tab "mdo"           */
/* ============================================= */
async function loadCatalog() {
  const catalogo = { venta: [], mdo: [] };

  try {
    const q = query(collection(db, 'productos'), where('activo', '==', true));
    const snap = await getDocs(q);

    snap.forEach((docSnap) => {
      const p = docSnap.data();
      const item = {
        id:    docSnap.id,
        tag:   (p.categoria || '').toUpperCase(),
        name:  p.nombre,
        desc:  p.descripcion || p.nombre,
        price: p.precio,
        unit:  p.tipo === 'servicio' ? 'serv' : 'pza'
      };
      if (p.tipo === 'servicio') {
        catalogo.mdo.push(item);
      } else {
        catalogo.venta.push(item);
      }
    });
  } catch (e) {
    console.error('Error al cargar catálogo desde Firestore:', e);
    showToast('No se pudo cargar el catálogo');
  }

  return catalogo;
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
  document.getElementById('f-folio').value    = state.folio || 'Se asignará al finalizar';
  document.getElementById('folio-hdr').textContent = state.folio || 'Folio pendiente';
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

async function saveNewConcept() {
  const desc   = document.getElementById('m-desc').value.trim();
  const tag    = document.getElementById('m-tag').value.trim().toUpperCase();
  const precio = parseFloat(document.getElementById('m-precio').value);
  const cat    = document.getElementById('m-cat').value; // 'venta' | 'mdo'

  if (!desc || isNaN(precio) || precio < 0) {
    showToast('Completa descripción y precio');
    return;
  }

  const tipo = cat === 'mdo' ? 'servicio' : 'producto';

  try {
    const ref = await addDoc(collection(db, 'productos'), {
      nombre: desc,
      descripcion: desc,
      tipo: tipo,
      precio: precio,
      categoria: tag || 'general',
      activo: true,
      creado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString()
    });

    const item = {
      id: ref.id,
      tag: tag || desc.substring(0,10).toUpperCase(),
      name: desc,
      desc: desc,
      price: precio,
      unit: tipo === 'servicio' ? 'serv' : 'pza'
    };

    state.catalog[cat].push(item);
    state.selected[ref.id] = { qty: 1, price: precio };

    closeModal();
    switchTab(cat);
    updateSelBar();
    showToast('Guardado en catálogo ✓');
  } catch (e) {
    console.error('Error al guardar concepto nuevo:', e);
    showToast('No se pudo guardar, revisa tu conexión');
  }
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
  document.getElementById('sum-folio').textContent  = state.folio || 'Pendiente';

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
/*  GUARDAR COTIZACIÓN EN FIRESTORE              */
/* ============================================= */
function buildItemsSnapshot() {
  const items = [];
  ['venta', 'mdo'].forEach((cat) => {
    const tipo = cat === 'mdo' ? 'servicio' : 'producto';
    Object.entries(state.selected).forEach(([id, entry]) => {
      const item = state.catalog[cat]?.find(i => i.id === id);
      if (!item) return;
      items.push({
        id: id,
        tag: item.tag || '',
        nombre: item.name,
        descripcion: item.desc || item.name,
        categoria: tipo,
        precio_unitario: entry.price ?? item.price,
        cantidad: entry.qty || 1
      });
    });
  });
  return items;
}

async function guardarCotizacion(numero, items, total) {
  const c = state.cliente;
  try {
    await addDoc(collection(db, 'cotizaciones'), {
      numero: numero,
      cliente_nombre: c.nombre || '',
      cliente_vehiculo: c.vehiculo || '',
      dias_estimados: c.dias ? parseInt(c.dias) : null,
      fecha: c.fecha || '',
      status: 'pendiente',
      items: items,
      total: total,
      creado_en: serverTimestamp(),
      creado_por: currentUser?.uid || null,
      actualizado_en: serverTimestamp(),
      historial_status: [
        { status: 'pendiente', fecha: new Date().toISOString(), usuario: currentUser?.uid || null }
      ]
    });
  } catch (e) {
    console.error('Error al guardar la cotización en Firestore:', e);
    showToast('Folio generado, pero no se pudo guardar el histórico');
  }
}

/* ============================================= */
/*  PDF                                          */
/* ============================================= */
function genPDF() {
  showToast('Generando presupuesto…');
  setTimeout(async () => {
    // El folio se asigna aquí, justo antes de generar — así nunca
    // se consume un consecutivo si el usuario no llega a este paso.
    if (!state.folio) {
      state.folio = await generateFolio();
      document.getElementById('sum-folio').textContent = state.folio;
      document.getElementById('folio-hdr').textContent = state.folio;
    }

    if (state.folio === 'COT-ERROR') {
      showToast('No se pudo generar el folio, intenta de nuevo');
      return;
    }

    // Guardamos el histórico en Firestore antes de generar el PDF visual
    const numero = parseInt(state.folio.replace('COT', ''));
    const items  = buildItemsSnapshot();
    const total  = items.reduce((sum, it) => sum + it.precio_unitario * it.cantidad, 0);
    await guardarCotizacion(numero, items, total);

    await generarPDF(state);
    showToast(`${state.folio} descargado ✓`);

    setTimeout(() => {
      if (confirm(`${state.folio} generado correctamente.\n\n¿Deseas volver al inicio?`)) {
        goHome();
      }
    }, 600);
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

/* ============================================= */
/*  EXPONER FUNCIONES GLOBALES                   */
/*  (necesario porque este archivo es un módulo  */
/*  y el HTML las llama vía onclick="...")       */
/* ============================================= */
window.handleLogin   = handleLogin;
window.handleLogout  = handleLogout;
window.goTo          = goTo;
window.switchTab     = switchTab;
window.renderCatalog = renderCatalog;
window.toggleItem    = toggleItem;
window.changeQty     = changeQty;
window.updatePrice   = updatePrice;
window.openModal     = openModal;
window.closeModal    = closeModal;
window.saveNewConcept = saveNewConcept;
window.genPDF        = genPDF;

window.goHome                  = goHome;
window.iniciarNuevaCotizacion  = iniciarNuevaCotizacion;
window.goToListado             = goToListado;
window.switchListadoTab        = switchListadoTab;
window.renderListado           = renderListado;
window.abrirModalProducto      = abrirModalProducto;
window.closeModalProducto      = closeModalProducto;
window.guardarProducto         = guardarProducto;
window.closeModalHistorial     = closeModalHistorial;
window.guardarStatusCotizacion = guardarStatusCotizacion;
window.reimprimirCotizacion    = reimprimirCotizacion;
