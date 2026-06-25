/* =============================================
   MC Auto Sound Design — Cotizador
   js/firebase-config.js
   Inicialización de Firebase: Auth, Firestore, Storage
   ============================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
  getStorage
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

/* ——— CONFIGURACIÓN ———
   Reemplaza estos valores con los de tu proyecto en
   Firebase Console > Configuración del proyecto > Tus apps > SDK de Firebase
*/
const firebaseConfig = {
  apiKey:            "AIzaSyBUCAhfKnHEpwLrlfDSGth1ihM6rMdW82Y",
  authDomain:         "cotizador-26d57.firebaseapp.com",
  projectId:          "cotizador-26d57",
  storageBucket:      "cotizador-26d57.firebasestorage.app",
  messagingSenderId:  "153888331697",
  appId:              "1:153888331697:web:57f656882d6f7f8a9acf90"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
const storage = getStorage(app);

/* ——— ESTADO DE SESIÓN ———
   currentUser y currentRole se llenan al iniciar sesión,
   y los consume app.js para mostrar/ocultar UI según rol.
*/
let currentUser = null;
let currentRole = null;

async function obtenerRol(uid) {
  try {
    const ref = doc(db, "usuarios", uid);
    const snap = await getDoc(ref);
    if (snap.exists()) return snap.data().role || "user";
  } catch (e) {
    console.error("No se pudo obtener el rol del usuario:", e);
  }
  return "user";
}

/* ——— LOGIN ———
   El usuario solo escribe "usuario" y "contraseña" — nunca un correo.
   Internamente convertimos el usuario a un email falso con dominio
   propio, ya que Firebase Auth (modo email/contraseña) requiere
   ese formato, pero nunca se envía nada a esa dirección.
*/
const DOMINIO_INTERNO = "cotizador.local";

function usuarioToEmail(usuario) {
  const limpio = usuario.trim().toLowerCase().replace(/\s+/g, "");
  return `${limpio}@${DOMINIO_INTERNO}`;
}

async function login(usuario, password) {
  const email = usuarioToEmail(usuario);
  const cred  = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

async function logout() {
  await signOut(auth);
}

/* ——— LISTENER GLOBAL DE SESIÓN ———
   onUserReady(callback) se llama una vez que sabemos si hay
   usuario logueado y, si lo hay, ya tenemos su rol cargado.
*/
function onUserReady(callback) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      currentRole = await obtenerRol(user.uid);
    } else {
      currentUser = null;
      currentRole = null;
    }
    callback(currentUser, currentRole);
  });
}

export {
  app, auth, db, storage,
  login, logout, onUserReady, usuarioToEmail,
  currentUser, currentRole,
  obtenerSiguienteNumero
};

/* ——— CONSECUTIVO ———
   Documento único contadores/cotizaciones con el campo ultimo_numero.
   Arranca en 2660: la primera cotización generada será la 2661.
   La transacción garantiza que dos usuarios cotizando al mismo
   tiempo nunca reciban el mismo número.
*/
const NUMERO_INICIAL = 2660;

async function obtenerSiguienteNumero() {
  const ref = doc(db, "contadores", "cotizaciones");

  const nuevoNumero = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);

    let actual = NUMERO_INICIAL;
    if (snap.exists()) {
      actual = snap.data().ultimo_numero;
    }

    const siguiente = actual + 1;
    transaction.set(ref, { ultimo_numero: siguiente }, { merge: true });
    return siguiente;
  });

  return nuevoNumero;
}
