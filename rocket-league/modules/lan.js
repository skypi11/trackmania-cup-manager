// modules/lan.js — gestion de la LAN (collection rl_lan + rl_lan_matches)
import { db } from '../../shared/firebase-config.js';
import {
  doc, collection, onSnapshot, setDoc, updateDoc, getDoc, getDocs,
  addDoc, deleteDoc, serverTimestamp, writeBatch,
} from 'firebase/firestore';
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
  poolOverrides: {},     // { teamId: 1|2 } — force la poule d'une équipe pour la LAN (seeding Suisse)
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

// Poule effective d'une équipe pour la LAN (override prioritaire sur la poule native)
export function getEffectivePool(teamId) {
  const overrides = (state.lanConfig?.poolOverrides) || {};
  const forced = overrides[teamId];
  if (forced === 1 || forced === 2 || forced === '1' || forced === '2') {
    return Number(forced);
  }
  return null; // pas d'override → poule native
}

// Calcul auto des qualifiés pour une poule (top N selon quota)
// Si une liste manuelle est définie pour cette poule, elle prime.
// Les overrides de poule (poolOverrides) déplacent les équipes entre poules
// sans toucher leur poule native (historique de saison intact).
export function getQualifiedTeams(pool) {
  const manual = (state.lanConfig?.manualQualified) || [];
  const overrides = (state.lanConfig?.poolOverrides) || {};

  // Standings des deux poules natives — sert à la fois pour la liste auto et
  // pour récupérer les stats des équipes overridées venant de l'autre poule.
  const stPool = buildStandings(pool);
  const otherPool = pool === 1 ? 2 : 1;
  const stOther = buildStandings(otherPool);

  // Helper : applique l'override de poule à un standings
  // - retire les équipes overridées vers l'autre poule
  // - ajoute les équipes de l'autre poule overridées vers ce pool (avec leurs stats)
  const applyOverrides = (baseList) => {
    const kept = baseList.filter(t => {
      const eff = overrides[t.id];
      if (eff == null) return true;
      return Number(eff) === pool;
    });
    const incoming = stOther.filter(t => Number(overrides[t.id]) === pool);
    return [...kept, ...incoming].sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      const diffA = a.gw - a.gl, diffB = b.gw - b.gl;
      if (diffB !== diffA) return diffB - diffA;
      return b.gw - a.gw;
    });
  };

  if (manual.length) {
    const manualSet = new Set(manual);
    // On part de l'union des deux poules pour pouvoir capter les équipes
    // qualifiées manuellement quelle que soit leur poule native.
    const allStandings = [...stPool, ...stOther].filter(t => manualSet.has(t.id));
    const withEffective = allStandings.map(t => ({
      ...t,
      effectivePool: overrides[t.id] != null ? Number(overrides[t.id]) : t.pool,
    }));
    const inPool = withEffective.filter(t => t.effectivePool === pool);
    if (inPool.length || allStandings.length) {
      return inPool.sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        const diffA = a.gw - a.gl, diffB = b.gw - b.gl;
        if (diffB !== diffA) return diffB - diffA;
        return b.gw - a.gw;
      });
    }
  }

  // Mode auto : on applique les overrides puis on prend le top N
  return applyOverrides(stPool).slice(0, getLanQuota(pool));
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

// ── Collection rl_lan_matches : matchs de la LAN (Suisse + Bracket) ───
state.lanMatches = state.lanMatches || {};
let _matchesListenerInit = false;
let _matchesFetchedOnce = false;

export async function fetchLanMatchesOnce() {
  if (_matchesFetchedOnce) return Object.values(state.lanMatches);
  _matchesFetchedOnce = true;
  try {
    const snap = await getDocs(collection(db, 'rl_lan_matches'));
    state.lanMatches = {};
    snap.forEach(d => { state.lanMatches[d.id] = { id: d.id, ...d.data() }; });
    window.dispatchEvent(new CustomEvent('rl-lan-matches-updated'));
  } catch (err) {
    console.warn('[lan] matches fetch error:', err.code || err.message);
  }
  return Object.values(state.lanMatches);
}

export function setupLanMatchesListener() {
  if (_matchesListenerInit) return;
  _matchesListenerInit = true;
  onSnapshot(
    collection(db, 'rl_lan_matches'),
    snap => {
      state.lanMatches = {};
      snap.forEach(d => { state.lanMatches[d.id] = { id: d.id, ...d.data() }; });
      window.dispatchEvent(new CustomEvent('rl-lan-matches-updated'));
    },
    err => {
      console.warn('[lan] matches listener error:', err.code || err.message);
    }
  );
}

export function getLanMatches() {
  return Object.values(state.lanMatches || {});
}

export function getLanMatchesByPhase(phase) {
  return getLanMatches().filter(m => m.phase === phase);
}

// ── Création / mise à jour des matchs ────────────────────────────────
export async function createLanMatch(matchData) {
  return addDoc(collection(db, 'rl_lan_matches'), {
    lanId: LAN_DOC_ID,
    games: [],
    status: 'pending',
    onStage: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...matchData,
  });
}

export async function updateLanMatch(matchId, patch) {
  return updateDoc(doc(db, 'rl_lan_matches', matchId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteLanMatch(matchId) {
  return deleteDoc(doc(db, 'rl_lan_matches', matchId));
}

// Création par lots (utilisé pour générer un round entier d'un coup)
export async function createLanMatchesBatch(matchesData) {
  const batch = writeBatch(db);
  const refs = [];
  for (const m of matchesData) {
    const ref = doc(collection(db, 'rl_lan_matches'));
    batch.set(ref, {
      lanId: LAN_DOC_ID,
      games: [],
      status: 'pending',
      onStage: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...m,
    });
    refs.push(ref);
  }
  await batch.commit();
  return refs.map(r => r.id);
}
