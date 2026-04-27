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
// Format : 4P1 vs 5P1 (interne) + 1P1↔7P2, 2P1↔6P2, 3P1↔5P2, 6P1↔4P2,
// 7P1↔3P2, 8P1↔2P2, 9P1↔1P2 (top P1 vs bottom P2 pour les non-internes)
// qP1, qP2 : tableaux d'équipes triés du meilleur au moins bon (depuis classement ligue)
export function generateR1Pairings(qP1, qP2) {
  const pairings = [];

  // Match interne P1 (4e vs 5e) — uniquement si on a au moins 5 équipes en P1
  const internal = (qP1.length >= 5) ? [qP1[3], qP1[4]] : null;

  // P1 hors internes (ordre conservé : 1, 2, 3, 6, 7, 8, 9...)
  const p1Rest = qP1.filter((_, i) => i !== 3 && i !== 4);
  // P2 inversé pour le seeding "top vs bottom"
  const p2Reverse = qP2.slice().reverse();

  const n = Math.min(p1Rest.length, p2Reverse.length);
  for (let i = 0; i < n; i++) {
    pairings.push({ home: p1Rest[i].id, away: p2Reverse[i].id });
  }
  if (internal) pairings.push({ home: internal[0].id, away: internal[1].id });

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
