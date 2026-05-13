// modules/lan-swiss.js — algo pur de la phase Suisse (calculs, appariements, classement)
// Pas d'accès direct à Firestore — fonctions de calcul réutilisables.

export const SWISS_ROUNDS = 5;
export const SWISS_FORMAT = 'bo5';

export function getSwissPhase(round) {
  return `swiss_r${round}`;
}

export function getSwissRound(phase) {
  const m = (phase || '').match(/^swiss_r(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

// ── Calcul du score série depuis les manches jouées ───────────────────
// Retourne { home, away, winner: 'home'|'away'|null, played, totalGoalsHome, totalGoalsAway }
export function calcSeriesScore(games = [], format = 'bo5') {
  const target = format === 'bo7' ? 4 : 3;
  let home = 0, away = 0, winner = null;
  let totalGoalsHome = 0, totalGoalsAway = 0;
  for (const g of games) {
    const h = +g.home || 0, a = +g.away || 0;
    totalGoalsHome += h;
    totalGoalsAway += a;
    if (h > a) home++;
    else if (a > h) away++;
    if (winner) continue;
    if (home >= target) winner = 'home';
    else if (away >= target) winner = 'away';
  }
  return { home, away, winner, played: winner != null, totalGoalsHome, totalGoalsAway };
}

// ── Stats Suisse d'une équipe ─────────────────────────────────────────
export function calcTeamSwissStats(teamId, swissMatches) {
  let wins = 0, losses = 0, pts = 0, gw = 0, gl = 0, goalsFor = 0, goalsAgainst = 0;
  const opponents = [];

  for (const m of swissMatches) {
    if (m.homeTeamId !== teamId && m.awayTeamId !== teamId) continue;
    const isHome = m.homeTeamId === teamId;
    const opp = isHome ? m.awayTeamId : m.homeTeamId;
    opponents.push(opp);

    const ss = calcSeriesScore(m.games || [], m.format || 'bo5');
    if (!ss.played) continue;

    const myGames = isHome ? ss.home : ss.away;
    const oppGames = isHome ? ss.away : ss.home;
    const myGoals = isHome ? ss.totalGoalsHome : ss.totalGoalsAway;
    const oppGoals = isHome ? ss.totalGoalsAway : ss.totalGoalsHome;
    gw += myGames; gl += oppGames;
    goalsFor += myGoals; goalsAgainst += oppGoals;

    const won = ss.winner === (isHome ? 'home' : 'away');
    if (won) { wins++; pts += 3 + myGames * 0.1; }
    else     { losses++; pts += myGames * 0.1; }
  }

  return {
    teamId,
    wins, losses,
    pts: Math.round(pts * 100) / 100,
    gw, gl,
    goalsFor, goalsAgainst,
    opponents,
  };
}

// ── Classement Suisse trié ────────────────────────────────────────────
// Tri : V desc > D asc > pts desc > diff buts desc > gw desc
export function calculateSwissStandings(swissMatches, teamIds) {
  return teamIds
    .map(id => calcTeamSwissStats(id, swissMatches))
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (a.losses !== b.losses) return a.losses - b.losses;
      if (b.pts !== a.pts) return b.pts - a.pts;
      const diffA = a.goalsFor - a.goalsAgainst;
      const diffB = b.goalsFor - b.goalsAgainst;
      if (diffB !== diffA) return diffB - diffA;
      return b.gw - a.gw;
    });
}

// ── Appariements Round 1 ──────────────────────────────────────────────
// Principe : croisement "top P1 vs bottom P2" (1P1↔dernierP2, 2P1↔avant-dernierP2…).
//
// - Poules équilibrées (n1 === n2) : croisement complet, aucun match interne.
//   Ex: 8+8 → 1P1↔8P2, 2P1↔7P2, …, 8P1↔1P2 (8 matchs).
//
// - Poule plus grosse (n1 > n2 ou inverse, écart pair) : on absorbe le surplus
//   par des matchs internes au milieu de la poule la plus grosse, puis on
//   croise le reste.
//   Ex: 9+7 → 4P1 vs 5P1 (interne) + 1P1↔7P2, 2P1↔6P2, 3P1↔5P2, 6P1↔4P2,
//       7P1↔3P2, 8P1↔2P2, 9P1↔1P2 (8 matchs).
//   Ex: 10+6 → 4P1↔5P1 + 6P1↔7P1 (2 internes) + 1↔6, 2↔5, 3↔4, 8↔3, 9↔2, 10↔1.
//
// qP1, qP2 : tableaux d'équipes triés du meilleur au moins bon.
export function generateR1Pairings(qP1, qP2) {
  const n1 = qP1.length;
  const n2 = qP2.length;
  const pairings = [];

  // Cas équilibré : pur croisement, aucun interne
  if (n1 === n2) {
    const p2Reverse = qP2.slice().reverse();
    for (let i = 0; i < n1; i++) {
      pairings.push({ home: qP1[i].id, away: p2Reverse[i].id });
    }
    return pairings;
  }

  // Cas déséquilibré : matchs internes dans la poule la plus grosse pour
  // absorber le surplus, puis croisement du reste.
  // Si l'écart est impair, ce n'est pas appariable (nb total impair) : on
  // produit le meilleur effort en arrondissant vers le bas (laisse 1 équipe
  // sans match — l'admin doit gérer le bye/forfait).
  const [bigger, smaller, biggerIsP1] = n1 > n2 ? [qP1, qP2, true] : [qP2, qP1, false];
  const surplus = bigger.length - smaller.length;
  const internalCount = Math.floor(surplus / 2);

  // Indices "milieu" de la poule la plus grosse pour les internes
  // Ex: n=9, internalCount=1 → start=3 → indices 3,4 (= 4e, 5e)
  // Ex: n=10, internalCount=2 → start=3 → indices 3,4,5,6 (= 4e,5e,6e,7e)
  const start = Math.floor((bigger.length - internalCount * 2) / 2);
  const internalIdx = new Set();
  for (let k = 0; k < internalCount; k++) {
    const a = start + k * 2;
    const b = start + k * 2 + 1;
    internalIdx.add(a);
    internalIdx.add(b);
    pairings.push({ home: bigger[a].id, away: bigger[b].id });
  }

  const biggerRest = bigger.filter((_, i) => !internalIdx.has(i));
  const smallerReverse = smaller.slice().reverse();
  const n = Math.min(biggerRest.length, smallerReverse.length);
  for (let i = 0; i < n; i++) {
    // Conserver "P1 = home" pour les croisements quand c'est possible
    const p1Team = biggerIsP1 ? biggerRest[i] : smallerReverse[i];
    const p2Team = biggerIsP1 ? smallerReverse[i] : biggerRest[i];
    pairings.push({ home: p1Team.id, away: p2Team.id });
  }

  return pairings;
}

// ── Appariements Round 2+ — algo Swiss greedy ─────────────────────────
// Trie par classement courant, puis apparie de proche en proche en évitant
// les revanches (cherche la prochaine équipe non-appariée jamais affrontée).
// Fallback si tout le monde a déjà joué : prend la prochaine dispo.
export function generateNextRoundPairings(swissMatches, teamIds) {
  const standings = calculateSwissStandings(swissMatches, teamIds);
  const opponentsMap = new Map();
  for (const t of standings) opponentsMap.set(t.teamId, new Set(t.opponents));

  const pairings = [];
  const used = new Set();

  for (let i = 0; i < standings.length; i++) {
    const team = standings[i];
    if (used.has(team.teamId)) continue;

    // 1) Cherche la prochaine équipe non-appariée jamais affrontée
    let opp = null;
    for (let j = i + 1; j < standings.length; j++) {
      const c = standings[j];
      if (used.has(c.teamId)) continue;
      if (opponentsMap.get(team.teamId).has(c.teamId)) continue;
      opp = c;
      break;
    }
    // 2) Fallback : prend la prochaine non-appariée (revanche acceptée)
    if (!opp) {
      for (let j = i + 1; j < standings.length; j++) {
        const c = standings[j];
        if (used.has(c.teamId)) continue;
        opp = c; break;
      }
    }

    if (opp) {
      pairings.push({ home: team.teamId, away: opp.teamId });
      used.add(team.teamId);
      used.add(opp.teamId);
    }
  }

  return pairings;
}

// ── Helpers ────────────────────────────────────────────────────────────
export function getRoundMatches(swissMatches, round) {
  const phase = getSwissPhase(round);
  return swissMatches.filter(m => m.phase === phase);
}

export function getSwissMatches(allLanMatches) {
  return allLanMatches.filter(m => (m.phase || '').startsWith('swiss_'));
}

export function isRoundComplete(swissMatches, round) {
  const matches = getRoundMatches(swissMatches, round);
  if (!matches.length) return false;
  return matches.every(m => {
    const ss = calcSeriesScore(m.games || [], m.format || 'bo5');
    return ss.played;
  });
}
