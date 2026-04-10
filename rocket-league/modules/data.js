// modules/data.js
import { db } from '../../shared/firebase-config.js';
import { collection, getDocs, onSnapshot } from 'firebase/firestore';
import { state } from './state.js';

// ── Realtime listeners for teams & matches ────────────────────────────
let _listenersInit = false;
let _teamsReady = false;
let _matchesReady = false;
let _initResolve = null;
const _initPromise = new Promise(resolve => { _initResolve = resolve; });

function _checkReady() {
  if (_teamsReady && _matchesReady) {
    state._dataFetched = true;
    _initResolve();
  }
}

function _initListeners() {
  if (_listenersInit) return;
  _listenersInit = true;

  let teamsFirst = true;
  onSnapshot(collection(db, 'rl_teams'), snap => {
    state.teamsMap = {};
    snap.forEach(d => { state.teamsMap[d.id] = { id: d.id, ...d.data() }; });
    if (teamsFirst) { teamsFirst = false; _teamsReady = true; _checkReady(); }
    else { window.dispatchEvent(new CustomEvent('rl-data-updated')); }
  });

  let matchesFirst = true;
  onSnapshot(collection(db, 'rl_matches'), snap => {
    state.matchesMap = {};
    snap.forEach(d => { state.matchesMap[d.id] = { id: d.id, ...d.data() }; });
    if (matchesFirst) { matchesFirst = false; _matchesReady = true; _checkReady(); }
    else { window.dispatchEvent(new CustomEvent('rl-data-updated')); }
  });
}

// ── fetchAll : charge tout, attendu par les tabs au premier rendu ─────
export async function fetchAll(force = false) {
  if (!_listenersInit) {
    // Players : getDocs suffit (ne changent pas en cours de saison)
    const ps = await getDocs(collection(db, 'rl_players'));
    state.playersMap = {};
    ps.forEach(d => { state.playersMap[d.id] = { id: d.id, ...d.data() }; });
    _initListeners();
  }
  // Attend que les deux premiers snapshots aient répondu
  if (!state._dataFetched) await _initPromise;
}

// ── Refresh helpers (utilisés par admin.js après écriture) ───────────
// Toujours fonctionnels ; onSnapshot met aussi à jour state en parallèle.
export async function refreshTeams() {
  const s = await getDocs(collection(db, 'rl_teams'));
  state.teamsMap = {};
  s.forEach(d => { state.teamsMap[d.id] = { id: d.id, ...d.data() }; });
}

export async function refreshPlayers() {
  const s = await getDocs(collection(db, 'rl_players'));
  state.playersMap = {};
  s.forEach(d => { state.playersMap[d.id] = { id: d.id, ...d.data() }; });
}

export async function refreshMatches() {
  const s = await getDocs(collection(db, 'rl_matches'));
  state.matchesMap = {};
  s.forEach(d => { state.matchesMap[d.id] = { id: d.id, ...d.data() }; });
}
