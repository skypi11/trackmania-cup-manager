// modules/lan-odds.js — calcul des cotes pour les pronostics LAN
// Algo : force d'une équipe = mix entre ses résultats ligue (poule) et son
// classement Suisse en cours (recalculé en live à mesure que les matchs LAN
// se jouent). Plus le déséquilibre entre 2 équipes est marqué, plus la cote
// du favori est basse et celle de l'outsider haute.
//
// Bornes :
// - Cotes match (Suisse / Bracket) : 1.10 → 15.0
// - Cotes pré-LAN long terme (champion, podium, top 8) : 2.0 → 50.0
//
// Pas d'accès direct à Firestore — fonctions pures basées sur l'état déjà
// chargé (state.teamsMap, state.matchesMap, state.lanMatches).

import { state } from './state.js';
import { buildStandings } from './standings.js';
import { calcSeriesScore, calculateSwissStandings, getSwissMatches } from './lan-swiss.js';

// ── Cotes utilitaires ─────────────────────────────────────────────────
function clamp(x, min, max) { return Math.max(min, Math.min(max, x)); }
function roundCote(c) { return Math.round(c * 20) / 20; } // arrondi au 0.05

// ── Force ligue (sur 1.0) ─────────────────────────────────────────────
// Calculée à partir du classement de la poule native de l'équipe.
// 1er de poule = 1.0, dernier de poule = 0.0
function getLeagueStrength(teamId) {
  const team = state.teamsMap?.[teamId];
  if (!team || !team.pool) return 0.5;
  const standings = buildStandings(team.pool);
  if (!standings.length) return 0.5;
  const idx = standings.findIndex(t => t.id === teamId);
  if (idx < 0) return 0.5;
  // Inversion linéaire : 1er → 1.0, dernier → 0.0 (avec lissage 0.05 pour éviter zéro pur)
  const n = standings.length;
  return clamp(0.05 + 0.9 * (1 - idx / (n - 1 || 1)), 0.05, 0.95);
}

// ── Force Suisse (sur 1.0) ────────────────────────────────────────────
// Calculée à partir du classement Suisse de la LAN en cours, pondérée par
// le nombre de matchs joués. Plus on a de matchs, plus la force Suisse pèse.
function getSwissStrength(teamId) {
  const swissMatches = getSwissMatches(Object.values(state.lanMatches || {}));
  if (!swissMatches.length) return null;

  // Récupère les 16 équipes qualifiées (= équipes ayant au moins 1 match Suisse)
  const qIds = new Set();
  swissMatches.forEach(m => { qIds.add(m.homeTeamId); qIds.add(m.awayTeamId); });
  if (!qIds.has(teamId)) return null;

  const standings = calculateSwissStandings(swissMatches, [...qIds]);
  const idx = standings.findIndex(t => t.teamId === teamId);
  if (idx < 0) return null;
  const n = standings.length;
  return clamp(0.05 + 0.9 * (1 - idx / (n - 1 || 1)), 0.05, 0.95);
}

// ── Nombre de manches Suisse jouées (pour pondération) ────────────────
function countSwissPlayed() {
  const swissMatches = getSwissMatches(Object.values(state.lanMatches || {}));
  return swissMatches.filter(m => calcSeriesScore(m.games || [], m.format || 'bo5').played).length;
}

// ── Force globale (mix ligue + Suisse selon avancement) ───────────────
export function getTeamStrength(teamId) {
  const leagueStr = getLeagueStrength(teamId);
  const swissStr = getSwissStrength(teamId);
  if (swissStr == null) return leagueStr;

  // Pondération : avant Suisse 100% ligue. À chaque match Suisse joué, +5%
  // de poids Suisse. À 12 matchs joués (1.5 round complet), 60% Suisse / 40% ligue.
  const playedCount = countSwissPlayed();
  const swissWeight = clamp(playedCount * 0.05, 0, 0.6);
  return leagueStr * (1 - swissWeight) + swissStr * swissWeight;
}

// ── Cote pour un match (Suisse ou Bracket) ─────────────────────────────
// Retourne { home, away } cotes arrondies au 0.05
export function getMatchOdds(homeTeamId, awayTeamId) {
  const sH = getTeamStrength(homeTeamId);
  const sA = getTeamStrength(awayTeamId);
  // Probabilité avec lissage bayésien
  const pH = (sH + 0.1) / (sH + sA + 0.2);
  const pA = 1 - pH;
  return {
    home: roundCote(clamp(1 / pH, 1.10, 15.0)),
    away: roundCote(clamp(1 / pA, 1.10, 15.0)),
  };
}

// ── Cote pré-LAN : Champion ────────────────────────────────────────────
// Probabilité = force^k normalisée sur les 16 qualifiés. k > 1 spread les
// cotes (le favori devient plus favori, l'outsider plus outsider).
function _qualifiedTeamIds() {
  // On déduit les qualifiés des matchs Suisse si déjà créés, sinon on
  // récupère depuis lanConfig.manualQualified ou de buildStandings + quotas.
  const swissMatches = getSwissMatches(Object.values(state.lanMatches || {}));
  if (swissMatches.length) {
    const ids = new Set();
    swissMatches.forEach(m => { ids.add(m.homeTeamId); ids.add(m.awayTeamId); });
    return [...ids];
  }
  // Pas encore de matchs Suisse → on lit la config LAN
  const manual = state.lanConfig?.manualQualified || [];
  if (manual.length) return manual;
  // Fallback : top de chaque poule selon quotas
  const q = state.lanConfig?.poolQuotas || { 1: 9, 2: 7 };
  const qP1 = buildStandings(1).slice(0, q[1] ?? 9).map(t => t.id);
  const qP2 = buildStandings(2).slice(0, q[2] ?? 7).map(t => t.id);
  return [...qP1, ...qP2];
}

// Mapping linéaire des cotes podium selon le RANG global (trié par pts ligue).
// On utilise les POINTS ABSOLUS de saison, pas la force globale qui se met
// à mixer la Suisse en cours dès qu'elle commence — ça désordonnait Toon
// (51 pts) et ITOW (47.6 pts) qui avaient pourtant des stats très différentes.
//
// Bornes par place :
//   - 1er (champion) : 2.0 → 8.0
//   - 2e             : 2.5 → 8.0
//   - 3e             : 3.0 → 8.0
function _rankByLeaguePts() {
  const ids = _qualifiedTeamIds();
  const stP1 = buildStandings(1);
  const stP2 = buildStandings(2);
  const ptsMap = new Map();
  [...stP1, ...stP2].forEach(t => ptsMap.set(t.id, t.pts || 0));
  // Tri : pts desc, puis diff buts (gw-gl) desc en cas d'égalité
  const diffMap = new Map();
  [...stP1, ...stP2].forEach(t => diffMap.set(t.id, (t.gw || 0) - (t.gl || 0)));
  const sorted = ids.slice().sort((a, b) => {
    const pa = ptsMap.get(a) || 0, pb = ptsMap.get(b) || 0;
    if (pb !== pa) return pb - pa;
    return (diffMap.get(b) || 0) - (diffMap.get(a) || 0);
  });
  return new Map(sorted.map((id, i) => [id, i]));
}

export function getChampionOdds(teamId) {
  return getPodiumPlaceOdds(teamId, 1);
}

export function getPodiumPlaceOdds(teamId, place) {
  const ids = _qualifiedTeamIds();
  if (!ids.includes(teamId)) return 8.0;
  const ranks = _rankByLeaguePts();
  const rank = ranks.get(teamId) ?? (ids.length - 1);
  const n = Math.max(2, ids.length);
  const minCote = place === 1 ? 2.0 : place === 2 ? 2.5 : 3.0;
  const maxCote = 8.0;
  const cote = minCote + (rank / (n - 1)) * (maxCote - minCote);
  return roundCote(clamp(cote, minCote, maxCote));
}

// ── Cote pré-LAN : Top 8 — mapping linéaire 1.5 → 6 selon le rang ligue ─
// Top du classement (probable top 8) : cote basse. Bottom (probable hors
// top 8) : cote haute. Borne max 6 car miser sur un outsider top 8 reste
// raisonnable (ce n'est pas un long shot comme champion).
export function getTop8Odds(teamId) {
  const ids = _qualifiedTeamIds();
  if (!ids.includes(teamId)) return 6.0;
  const ranks = _rankByLeaguePts();
  const rank = ranks.get(teamId) ?? (ids.length - 1);
  const n = Math.max(2, ids.length);
  // Top du rang (les bons) ont cote basse, fond du rang ont cote plus haute
  const cote = 1.5 + (rank / (n - 1)) * 4.5;
  return roundCote(clamp(cote, 1.5, 6.0));
}

// ── Cote pré-LAN : Première sortie (équipe finit 16e à la Suisse) ──────
// Mapping inverse du rang : le pire (rang n-1) a cote min 2, le meilleur
// (rang 0) a cote max 8 (très improbable qu'il finisse dernier).
export function getFirstOutOdds(teamId) {
  const ids = _qualifiedTeamIds();
  if (!ids.includes(teamId)) return 8.0;
  const ranks = _rankByLeaguePts();
  const rank = ranks.get(teamId) ?? 0;
  const n = Math.max(2, ids.length);
  const minCote = 2.0;
  const maxCote = 8.0;
  // Inverse du rang : (n-1-rank)/(n-1) → 1 pour le meilleur (cote max), 0 pour le pire (cote min)
  const ratio = (n - 1 - rank) / (n - 1);
  const cote = minCote + ratio * (maxCote - minCote);
  return roundCote(clamp(cote, minCote, maxCote));
}

// ── Récap : retourne toutes les cotes pré-LAN d'une équipe ─────────────
export function getPreLanOddsForTeam(teamId) {
  return {
    champion: getChampionOdds(teamId),
    podium1: getPodiumPlaceOdds(teamId, 1),
    podium2: getPodiumPlaceOdds(teamId, 2),
    podium3: getPodiumPlaceOdds(teamId, 3),
    top8: getTop8Odds(teamId),
    firstOut: getFirstOutOdds(teamId),
  };
}
