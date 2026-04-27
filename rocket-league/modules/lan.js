// modules/lan.js — gestion de la LAN (collection rl_lan)
import { db } from '../../shared/firebase-config.js';
import { doc, onSnapshot, setDoc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { state } from './state.js';
import { buildStandings } from './standings.js';

// ID du doc LAN actif. Pour SLS3 on créera 'sls3-xxxx' et on switchera l'actif.
export const LAN_DOC_ID = 'sls2-2026';

// Valeurs par défaut si le doc n'existe pas encore
const DEFAULT_LAN = {
  name: 'Springs League Series #2 — LAN',
  startDate: '2026-05-16',
  endDate: '2026-05-17',
  location: 'Salle Culturelle, 2 Rue des Écoles, 58470 Magny-Cours',
  poolQuotas: { 1: 9, 2: 7 },
  manualQualified: [],   // array de teamIds — si non vide, override l'auto par poule
  status: 'preparation', // preparation | swiss | between | bracket | finished
};

// État local — peuplé par fetchLanConfigOnce() ou setupLanListener() (admin)
state.lanConfig = null;
let _listenerInit = false;
let _fetchedOnce = false;

// One-shot read au démarrage : pas de listener live (évite les retries en
// boucle qui propagent permission-denied non-catché). Utilisé par le rendu
// public — les admins activent le listener live via setupLanListener().
export async function fetchLanConfigOnce() {
  if (_fetchedOnce) return state.lanConfig;
  _fetchedOnce = true;
  try {
    const snap = await getDoc(doc(db, 'rl_lan', LAN_DOC_ID));
    state.lanConfig = snap.exists() ? { id: snap.id, ...snap.data() } : null;
    window.dispatchEvent(new CustomEvent('rl-lan-updated'));
  } catch (err) {
    console.warn('[lan] fetch one-shot error (fallback sur valeurs par défaut):', err.code || err.message);
  }
  return state.lanConfig;
}

// Listener live — réservé à l'admin pour voir les changements en temps réel
// pendant qu'il modifie la config. Pas activé pour le public.
export function setupLanListener() {
  if (_listenerInit) return;
  _listenerInit = true;
  onSnapshot(
    doc(db, 'rl_lan', LAN_DOC_ID),
    snap => {
      state.lanConfig = snap.exists() ? { id: snap.id, ...snap.data() } : null;
      window.dispatchEvent(new CustomEvent('rl-lan-updated'));
    },
    err => {
      console.warn('[lan] listener error (fallback sur valeurs par défaut):', err.code || err.message);
    }
  );
}

export async function ensureLanDoc() {
  const ref = doc(db, 'rl_lan', LAN_DOC_ID);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { ...DEFAULT_LAN, createdAt: serverTimestamp() });
  }
  return ref;
}

export async function updateLanConfig(patch) {
  await ensureLanDoc();
  await updateDoc(doc(db, 'rl_lan', LAN_DOC_ID), patch);
}

// Quotas par poule (avec fallback sur les défauts)
export function getLanQuotas() {
  return (state.lanConfig?.poolQuotas) || DEFAULT_LAN.poolQuotas;
}

export function getLanQuota(pool) {
  const q = getLanQuotas();
  return q[pool] ?? q[String(pool)] ?? 8;
}

// Calcul auto des qualifiés pour une poule (top N selon quota)
// Si une liste manuelle est définie pour cette poule, elle prime.
export function getQualifiedTeams(pool) {
  const manual = (state.lanConfig?.manualQualified) || [];
  const standings = buildStandings(pool);
  if (manual.length) {
    // Filtrer pour ne garder que les équipes de la poule, en respectant l'ordre du classement
    const manualSet = new Set(manual);
    const inPool = standings.filter(t => manualSet.has(t.id));
    if (inPool.length) return inPool;
  }
  return standings.slice(0, getLanQuota(pool));
}

// Helpers
export function isLanQualified(teamId, pool) {
  if (!teamId) return false;
  return getQualifiedTeams(pool).some(t => t.id === teamId);
}

export function getAllQualified() {
  return [...getQualifiedTeams(1), ...getQualifiedTeams(2)];
}

export function getLanLocation() {
  return state.lanConfig?.location || DEFAULT_LAN.location;
}

export function getLanName() {
  return state.lanConfig?.name || DEFAULT_LAN.name;
}

export function getLanDates() {
  return {
    start: state.lanConfig?.startDate || DEFAULT_LAN.startDate,
    end: state.lanConfig?.endDate || DEFAULT_LAN.endDate,
  };
}
