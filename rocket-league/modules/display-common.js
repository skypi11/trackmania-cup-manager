// modules/display-common.js — init partagé pour les écrans géants de la LAN
// (display-classement.html / display-matchs.html). Lectures publiques live
// via onSnapshot, pas d'auth (App Check uniquement).

import { db } from '../../shared/firebase-config.js';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { state } from './state.js';

export const LAN_DOC_ID = 'sls2-2026';

state.lanConfig = null;
state.lanMatches = state.lanMatches || {};

// Mode preview : ?preview=swiss|between|bracket|finished pour tester avant la LAN
const VALID_PREVIEW_STATUSES = ['preparation', 'swiss', 'between', 'bracket', 'finished'];
export const PREVIEW_STATUS = (() => {
  try {
    const p = new URL(window.location.href).searchParams.get('preview');
    return p && VALID_PREVIEW_STATUSES.includes(p) ? p : null;
  } catch { return null; }
})();

export function getLanStatus() {
  if (PREVIEW_STATUS) return PREVIEW_STATUS;
  return state.lanConfig?.status || 'preparation';
}

// Rafraîchissement du rendu : RAF-coalesced pour éviter les rerender en
// rafale quand plusieurs listeners se déclenchent en même temps.
export function setupListeners(onUpdate) {
  let scheduled = false;
  const tick = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      onUpdate();
    });
  };

  onSnapshot(collection(db, 'rl_teams'), snap => {
    state.teamsMap = {};
    snap.forEach(d => { state.teamsMap[d.id] = { id: d.id, ...d.data() }; });
    tick();
  });
  onSnapshot(collection(db, 'rl_matches'), snap => {
    state.matchesMap = {};
    snap.forEach(d => { state.matchesMap[d.id] = { id: d.id, ...d.data() }; });
    tick();
  });
  onSnapshot(doc(db, 'rl_lan', LAN_DOC_ID), snap => {
    state.lanConfig = snap.exists() ? { id: snap.id, ...snap.data() } : null;
    tick();
  });
  onSnapshot(collection(db, 'rl_lan_matches'), snap => {
    state.lanMatches = {};
    snap.forEach(d => { state.lanMatches[d.id] = { id: d.id, ...d.data() }; });
    tick();
  });
}

// Helpers communs
export function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function teamLogo(t, cls = 'd-logo') {
  return t?.logoUrl
    ? `<img class="${cls}" src="${esc(t.logoUrl)}" alt="" onerror="this.style.opacity='.2'">`
    : `<div class="${cls} d-logo-ph"></div>`;
}
