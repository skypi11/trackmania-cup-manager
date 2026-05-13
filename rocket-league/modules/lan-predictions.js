// modules/lan-predictions.js — pronostics LAN (collection rl_lan_predictions)
//
// Architecture :
// - 1 doc / utilisateur (id = userId Discord)
// - Pronostics 3 catégories : pré-LAN (champion, podium, top 8, premier sorti),
//   Suisse (par match), Bracket (par match)
// - Système de jetons (500 au départ) en bonus optionnel sur Suisse/Bracket
// - Cotes auto via lan-odds.js
// - Verrouillage : pré-LAN + chaque round Suisse + chaque match bracket via
//   lockState dans le doc rl_lan/{lanId}, OU auto au 1er score saisi
//
// Scoring :
//   Pré-LAN : champion 250 / podium 1er=150 2e=120 3e=100 / mauvaise place 50
//             top 8 = 30/équipe / first out = 100
//   Match (Suisse/Bracket) sans mise : 10 pts si correct
//   Match avec mise correct : 10 + floor(mise × cote) pts ; jetons consommés
//   Match avec mise raté : 0 pt + jetons perdus

import { db } from '../../shared/firebase-config.js';
import {
  collection, doc, onSnapshot, setDoc, updateDoc, getDoc, getDocs,
  serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { state } from './state.js';
import { LAN_DOC_ID } from './lan.js';
import { calcSeriesScore, getSwissMatches, getSwissRound, calculateSwissStandings } from './lan-swiss.js';
import { getMatchOdds } from './lan-odds.js';

// ── Constantes ────────────────────────────────────────────────────────
export const STARTING_JETONS = 500;
export const MIN_BET = 10;
export const POINTS = {
  CHAMPION: 250,
  PODIUM_1ST: 150,
  PODIUM_2ND: 120,
  PODIUM_3RD: 100,
  PODIUM_WRONG_PLACE: 50,
  TOP8_PER_TEAM: 30,
  FIRST_OUT: 100,
  MATCH: 10,
};

// ── État local ────────────────────────────────────────────────────────
state.lanPredictions = state.lanPredictions || {}; // userId → doc
let _predListenerInit = false;
let _myPredFetched = false;

// ── Listener live (admin + page pronostics) ───────────────────────────
export function setupLanPredictionsListener() {
  if (_predListenerInit) return;
  _predListenerInit = true;
  onSnapshot(
    collection(db, 'rl_lan_predictions'),
    snap => {
      state.lanPredictions = {};
      snap.forEach(d => { state.lanPredictions[d.id] = { id: d.id, ...d.data() }; });
      window.dispatchEvent(new CustomEvent('rl-lan-predictions-updated'));
    },
    err => {
      console.warn('[lan-predictions] listener error:', err.code || err.message);
    }
  );
}

// Lecture one-shot du doc perso (lecture publique potentiellement bloquée)
export async function fetchMyLanPrediction(uid) {
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, 'rl_lan_predictions', uid));
    if (snap.exists()) {
      state.lanPredictions[uid] = { id: uid, ...snap.data() };
    }
    _myPredFetched = true;
    return state.lanPredictions[uid] || null;
  } catch (e) {
    console.warn('[lan-predictions] fetchMyLanPrediction error:', e.code || e.message);
    return null;
  }
}

// Lecture publique du leaderboard
export async function fetchAllLanPredictions() {
  try {
    const snap = await getDocs(collection(db, 'rl_lan_predictions'));
    state.lanPredictions = {};
    snap.forEach(d => { state.lanPredictions[d.id] = { id: d.id, ...d.data() }; });
    return Object.values(state.lanPredictions);
  } catch (e) {
    console.warn('[lan-predictions] fetchAll error:', e.code || e.message);
    return [];
  }
}

// ── État de verrouillage (lecture depuis lanConfig) ───────────────────
export function isPreLanLocked() {
  return !!(state.lanConfig?.lockState?.preLan);
}

export function isSwissRoundLocked(round) {
  // Verrouillé si bouton manuel cliqué OU si au moins un match du round a un score
  if (state.lanConfig?.lockState?.swissRounds?.includes(round)) return true;
  const swissMatches = getSwissMatches(Object.values(state.lanMatches || {}));
  const roundMatches = swissMatches.filter(m => getSwissRound(m.phase) === round);
  return roundMatches.some(m => (m.games || []).some(g => g.home != null && g.away != null));
}

export function isBracketMatchLocked(matchId) {
  if (state.lanConfig?.lockState?.bracketMatches?.includes(matchId)) return true;
  const m = state.lanMatches?.[matchId];
  if (!m) return false;
  return (m.games || []).some(g => g.home != null && g.away != null);
}

// ── CRUD : initialisation du doc utilisateur ──────────────────────────
export async function ensureLanPredDoc(user) {
  if (!user?.uid) throw new Error('User required');
  const ref = doc(db, 'rl_lan_predictions', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const data = {
      lanId: LAN_DOC_ID,
      userId: user.uid,
      displayName: user.displayName || 'Anonyme',
      discordAvatar: user.photoURL || null,
      jetons: STARTING_JETONS,
      preLan: { champion: null, podium: { 1: null, 2: null, 3: null }, top8: [], firstOut: null },
      swiss: {},
      bracket: {},
      score: { preLan: 0, swiss: 0, bracket: 0, total: 0 },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, data);
    state.lanPredictions[user.uid] = { id: user.uid, ...data };
    return state.lanPredictions[user.uid];
  }
  // Sync display info au cas où elle a changé
  const existing = snap.data();
  const updates = {};
  if (user.displayName && user.displayName !== existing.displayName) updates.displayName = user.displayName;
  if (user.photoURL && user.photoURL !== existing.discordAvatar) updates.discordAvatar = user.photoURL;
  if (Object.keys(updates).length) {
    await updateDoc(ref, updates);
    Object.assign(state.lanPredictions[user.uid] || {}, updates);
  }
  return state.lanPredictions[user.uid] || { id: user.uid, ...existing };
}

// ── Pré-LAN : sauvegarde des pronostics (pas de mise jeton sur pré-LAN) ─
export async function savePreLanPrediction(uid, preLan) {
  if (isPreLanLocked()) throw new Error('Pré-LAN verrouillé');
  await updateDoc(doc(db, 'rl_lan_predictions', uid), {
    preLan,
    updatedAt: serverTimestamp(),
  });
  if (state.lanPredictions[uid]) {
    state.lanPredictions[uid].preLan = preLan;
  }
}

// ── Match (Suisse/Bracket) : placer un pronostic avec mise optionnelle ─
// kind = 'swiss' | 'bracket'
// bet = { side: 'home'|'away', mise: 0..jetons, cote: number }
export async function placeMatchBet(uid, kind, matchId, side, mise = 0) {
  // Vérifs
  const match = state.lanMatches?.[matchId];
  if (!match) throw new Error('Match introuvable');
  if (kind === 'swiss') {
    const round = getSwissRound(match.phase);
    if (isSwissRoundLocked(round)) throw new Error(`Round ${round} verrouillé`);
  } else {
    if (isBracketMatchLocked(matchId)) throw new Error('Match verrouillé');
  }

  const myPred = state.lanPredictions[uid];
  if (!myPred) throw new Error('Pronostiqueur non initialisé');

  const existingBet = myPred[kind]?.[matchId];
  const existingMise = existingBet?.status === 'pending' ? (existingBet.mise || 0) : 0;
  const availableJetons = (myPred.jetons || 0) + existingMise;

  if (mise < 0) mise = 0;
  if (mise > 0 && mise < MIN_BET && availableJetons >= MIN_BET) {
    throw new Error(`Mise minimum : ${MIN_BET} jetons`);
  }
  if (mise > availableJetons) throw new Error('Solde insuffisant');

  // Cote au moment du pari (figée pour ce pari)
  const odds = getMatchOdds(match.homeTeamId, match.awayTeamId);
  const cote = side === 'home' ? odds.home : odds.away;

  const newBet = {
    side, mise, cote,
    placedAt: new Date().toISOString(),
    status: 'pending',
  };

  const newJetons = availableJetons - mise;
  const updates = {
    [`${kind}.${matchId}`]: newBet,
    jetons: newJetons,
    updatedAt: serverTimestamp(),
  };

  await updateDoc(doc(db, 'rl_lan_predictions', uid), updates);
  if (!state.lanPredictions[uid][kind]) state.lanPredictions[uid][kind] = {};
  state.lanPredictions[uid][kind][matchId] = newBet;
  state.lanPredictions[uid].jetons = newJetons;
}

// ── Résolution des paris match (appelé après chaque saisie de score) ──
// Parcourt tous les pronostics pending et calcule le résultat si match joué
export async function resolveAllPendingBets() {
  const allPreds = Object.values(state.lanPredictions);
  const allMatches = state.lanMatches || {};
  const batch = writeBatch(db);
  let writeCount = 0;

  for (const pred of allPreds) {
    let dirty = false;
    let scoreSwiss = pred.score?.swiss || 0;
    let scoreBracket = pred.score?.bracket || 0;
    const updatedSwiss = { ...(pred.swiss || {}) };
    const updatedBracket = { ...(pred.bracket || {}) };

    // Helper pour traiter un kind
    const resolveKind = (kindBets, kind) => {
      let scoreDelta = 0;
      for (const [matchId, bet] of Object.entries(kindBets)) {
        if (bet.status !== 'pending') continue;
        const m = allMatches[matchId];
        if (!m) continue;
        const ss = calcSeriesScore(m.games || [], m.format || 'bo5');
        if (!ss.played) continue;

        const winnerSide = ss.winner; // 'home' | 'away'
        const correct = bet.side === winnerSide;
        let pts = 0;
        if (correct) {
          pts = POINTS.MATCH + (bet.mise > 0 ? Math.floor(bet.mise * bet.cote) : 0);
        }
        const newBet = { ...bet, status: correct ? 'won' : 'lost', pts, resolvedAt: new Date().toISOString() };
        kindBets[matchId] = newBet;
        scoreDelta += pts;
        dirty = true;
      }
      return scoreDelta;
    };

    const dSwiss = resolveKind(updatedSwiss, 'swiss');
    const dBracket = resolveKind(updatedBracket, 'bracket');

    if (dirty) {
      scoreSwiss += dSwiss;
      scoreBracket += dBracket;
      const total = (pred.score?.preLan || 0) + scoreSwiss + scoreBracket;
      const ref = doc(db, 'rl_lan_predictions', pred.id);
      batch.update(ref, {
        swiss: updatedSwiss,
        bracket: updatedBracket,
        'score.swiss': scoreSwiss,
        'score.bracket': scoreBracket,
        'score.total': total,
        updatedAt: serverTimestamp(),
      });
      writeCount++;
      // Mise à jour locale immédiate
      pred.swiss = updatedSwiss;
      pred.bracket = updatedBracket;
      pred.score = { ...(pred.score || {}), swiss: scoreSwiss, bracket: scoreBracket, total };
    }
  }

  if (writeCount > 0) {
    await batch.commit();
  }
  return writeCount;
}

// ── Résolution pré-LAN (appelée à la fin de la Suisse / fin de la LAN) ─
// Calcule les scores pré-LAN basés sur :
// - Top 8 et First Out : connus à la fin de la Suisse
// - Champion + Podium : connus à la fin du bracket
export async function resolvePreLanScores(opts = {}) {
  const allPreds = Object.values(state.lanPredictions);
  const top8 = opts.top8; // [teamId, ...] (issus de la Suisse)
  const firstOut = opts.firstOut; // teamId (16e de la Suisse)
  const champion = opts.champion; // teamId du vainqueur du bracket
  const podium = opts.podium; // { 1: teamId, 2: teamId, 3: teamId }

  const batch = writeBatch(db);
  let writeCount = 0;

  for (const pred of allPreds) {
    const pl = pred.preLan || {};
    let pts = 0;

    // Champion
    if (champion && pl.champion === champion) pts += POINTS.CHAMPION;

    // Podium ordonné + bonne équipe mauvaise place
    if (podium) {
      const podiumSet = new Set([podium[1], podium[2], podium[3]].filter(Boolean));
      const myPodium = pl.podium || {};
      [1, 2, 3].forEach(place => {
        const guess = myPodium[place];
        if (!guess) return;
        if (podium[place] === guess) {
          pts += place === 1 ? POINTS.PODIUM_1ST : place === 2 ? POINTS.PODIUM_2ND : POINTS.PODIUM_3RD;
        } else if (podiumSet.has(guess)) {
          pts += POINTS.PODIUM_WRONG_PLACE;
        }
      });
    }

    // Top 8
    if (top8 && pl.top8?.length) {
      const top8Set = new Set(top8);
      const correct = pl.top8.filter(id => top8Set.has(id)).length;
      pts += correct * POINTS.TOP8_PER_TEAM;
    }

    // First out
    if (firstOut && pl.firstOut === firstOut) pts += POINTS.FIRST_OUT;

    if (pts !== (pred.score?.preLan || 0)) {
      const total = pts + (pred.score?.swiss || 0) + (pred.score?.bracket || 0);
      const ref = doc(db, 'rl_lan_predictions', pred.id);
      batch.update(ref, {
        'score.preLan': pts,
        'score.total': total,
        updatedAt: serverTimestamp(),
      });
      writeCount++;
      pred.score = { ...(pred.score || {}), preLan: pts, total };
    }
  }

  if (writeCount > 0) await batch.commit();
  return writeCount;
}

// ── Recalcul global (admin "🧮 Tout recalculer") ──────────────────────
// Re-résout tous les paris match + recalcule les pré-LAN si données dispo.
export async function recalculateAll() {
  await resolveAllPendingBets();
  // Si la phase Suisse est terminée → calcul du top 8 et first out auto
  // Si le bracket est terminé → calcul du podium et champion auto
  // Sinon, on laisse les pré-LAN à l'admin (bouton dédié à la fin)
  const stats = computeFinalStats();
  if (stats.top8?.length || stats.firstOut || stats.champion) {
    await resolvePreLanScores(stats);
  }
}

// Calcule les stats finales depuis l'état actuel des matchs
export function computeFinalStats() {
  const out = {};
  // Top 8 + first out depuis classement Suisse final
  const swissMatches = getSwissMatches(Object.values(state.lanMatches || {}));
  if (swissMatches.length) {
    // Importer dynamiquement calculateSwissStandings pour éviter cycle
    const allTeamIds = new Set();
    swissMatches.forEach(m => { allTeamIds.add(m.homeTeamId); allTeamIds.add(m.awayTeamId); });
    // Vérifier que tous les rounds Suisse sont terminés
    const allPlayed = swissMatches.length >= 40 && swissMatches.every(m => calcSeriesScore(m.games || [], m.format || 'bo5').played);
    if (allPlayed) {
      const standings = calculateSwissStandings(swissMatches, [...allTeamIds]);
      out.top8 = standings.slice(0, 8).map(t => t.teamId);
      out.firstOut = standings[standings.length - 1]?.teamId || null;
    }
  }
  // Champion + podium depuis bracket
  const bracketMatches = Object.values(state.lanMatches || {}).filter(m => (m.phase || '').match(/^(wb|lb|gf)/));
  const gf = bracketMatches.find(m => m.bracketSlot === 'gf' || m.phase === 'gf');
  if (gf) {
    const ss = calcSeriesScore(gf.games || [], gf.format || 'bo5');
    if (ss.played) {
      out.champion = ss.winner === 'home' ? gf.homeTeamId : gf.awayTeamId;
      const runnerUp = ss.winner === 'home' ? gf.awayTeamId : gf.homeTeamId;
      // 3e = perdant de la finale LB (loser bracket final)
      const lbf = bracketMatches.find(m => m.bracketSlot === 'lb_f' || m.phase === 'lb_f');
      let third = null;
      if (lbf) {
        const ss2 = calcSeriesScore(lbf.games || [], lbf.format || 'bo5');
        if (ss2.played) {
          third = ss2.winner === 'home' ? lbf.awayTeamId : lbf.homeTeamId;
        }
      }
      out.podium = { 1: out.champion, 2: runnerUp, 3: third };
    }
  }
  return out;
}

// ── Verrouillage admin ────────────────────────────────────────────────
export async function lockPreLan() {
  const ref = doc(db, 'rl_lan', LAN_DOC_ID);
  await updateDoc(ref, {
    'lockState.preLan': true,
    'lockState.preLanLockedAt': serverTimestamp(),
  });
}

export async function unlockPreLan() {
  const ref = doc(db, 'rl_lan', LAN_DOC_ID);
  await updateDoc(ref, {
    'lockState.preLan': false,
  });
}

export async function lockSwissRound(round) {
  const current = state.lanConfig?.lockState?.swissRounds || [];
  if (current.includes(round)) return;
  const ref = doc(db, 'rl_lan', LAN_DOC_ID);
  await updateDoc(ref, {
    'lockState.swissRounds': [...current, round],
  });
}

export async function unlockSwissRound(round) {
  const current = state.lanConfig?.lockState?.swissRounds || [];
  if (!current.includes(round)) return;
  const ref = doc(db, 'rl_lan', LAN_DOC_ID);
  await updateDoc(ref, {
    'lockState.swissRounds': current.filter(r => r !== round),
  });
}

export async function lockBracketMatch(matchId) {
  const current = state.lanConfig?.lockState?.bracketMatches || [];
  if (current.includes(matchId)) return;
  const ref = doc(db, 'rl_lan', LAN_DOC_ID);
  await updateDoc(ref, {
    'lockState.bracketMatches': [...current, matchId],
  });
}

export async function unlockBracketMatch(matchId) {
  const current = state.lanConfig?.lockState?.bracketMatches || [];
  if (!current.includes(matchId)) return;
  const ref = doc(db, 'rl_lan', LAN_DOC_ID);
  await updateDoc(ref, {
    'lockState.bracketMatches': current.filter(id => id !== matchId),
  });
}

// ── Leaderboard trié ─────────────────────────────────────────────────
export function getLeaderboard() {
  return Object.values(state.lanPredictions)
    .map(p => ({
      id: p.id,
      displayName: p.displayName || 'Anonyme',
      avatar: p.discordAvatar || null,
      score: p.score?.total || 0,
      preLan: p.score?.preLan || 0,
      swiss: p.score?.swiss || 0,
      bracket: p.score?.bracket || 0,
      jetons: p.jetons || 0,
    }))
    .sort((a, b) => b.score - a.score || b.jetons - a.jetons);
}
