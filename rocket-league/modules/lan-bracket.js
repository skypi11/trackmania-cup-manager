// modules/lan-bracket.js — algo pur du bracket double élimination 8 équipes
// Pas d'accès direct à Firestore — fonctions de calcul réutilisables.
//
// Format LAN SLS#2 (cf règlement officiel) :
// - Phase 1 (BO5) : WB Quarts (4 matchs) — 1v8, 2v7, 3v6, 4v5
// - Phase 2 (BO5) : WB Demi (2 matchs) + LB R1 (2 matchs) — convention croisée
// - Phase 3 (BO5) : LB R2 (2 matchs) — convention croisée (anti-revanche)
// - Phase 4 (BO7) : WB Finale + LB R3
// - Phase 5 (BO7) : LB Finale
// - Grande Finale (BO7) — sans bracket reset

export const BRACKET_PHASES = ['wb_qf', 'wb_sf', 'wb_f', 'lb_r1', 'lb_r2', 'lb_r3', 'lb_f', 'gf'];

// Phase logique du planning de la LAN (regroupement de matchs)
export const PHASE_GROUPS = [
  { id: 'p1', label: 'Phase 1 — Quarts WB', format: 'bo5', slots: ['wb_qf1','wb_qf2','wb_qf3','wb_qf4'] },
  { id: 'p2', label: 'Phase 2 — Demis WB + LB R1', format: 'bo5', slots: ['wb_sf1','wb_sf2','lb_r1_1','lb_r1_2'] },
  { id: 'p3', label: 'Phase 3 — LB R2', format: 'bo5', slots: ['lb_r2_1','lb_r2_2'] },
  { id: 'p4', label: 'Phase 4 — Finale WB + LB R3', format: 'bo7', slots: ['wb_f','lb_r3'] },
  { id: 'p5', label: 'Phase 5 — Finale LB', format: 'bo7', slots: ['lb_f'] },
  { id: 'gf', label: 'Grande Finale', format: 'bo7', slots: ['gf'] },
];

// Format BO de chaque slot (pour création des matchs)
export const SLOT_FORMAT = {
  wb_qf1: 'bo5', wb_qf2: 'bo5', wb_qf3: 'bo5', wb_qf4: 'bo5',
  wb_sf1: 'bo5', wb_sf2: 'bo5',
  wb_f:  'bo7',
  lb_r1_1: 'bo5', lb_r1_2: 'bo5',
  lb_r2_1: 'bo5', lb_r2_2: 'bo5',
  lb_r3: 'bo7',
  lb_f:  'bo7',
  gf:    'bo7',
};

// Phase parent de chaque slot
export const SLOT_PHASE = {
  wb_qf1: 'wb_qf', wb_qf2: 'wb_qf', wb_qf3: 'wb_qf', wb_qf4: 'wb_qf',
  wb_sf1: 'wb_sf', wb_sf2: 'wb_sf',
  wb_f:  'wb_f',
  lb_r1_1: 'lb_r1', lb_r1_2: 'lb_r1',
  lb_r2_1: 'lb_r2', lb_r2_2: 'lb_r2',
  lb_r3: 'lb_r3',
  lb_f:  'lb_f',
  gf:    'gf',
};

// Label lisible de chaque slot
export const SLOT_LABEL = {
  wb_qf1: 'Quart WB 1 (S1 vs S8)',
  wb_qf2: 'Quart WB 2 (S2 vs S7)',
  wb_qf3: 'Quart WB 3 (S3 vs S6)',
  wb_qf4: 'Quart WB 4 (S4 vs S5)',
  wb_sf1: 'Demi WB 1',
  wb_sf2: 'Demi WB 2',
  wb_f:   'Finale WB',
  lb_r1_1: 'LB R1 #1',
  lb_r1_2: 'LB R1 #2',
  lb_r2_1: 'LB R2 #1',
  lb_r2_2: 'LB R2 #2',
  lb_r3:  'LB R3',
  lb_f:   'Finale LB',
  gf:     'Grande Finale',
};

// Définition complète des feeders : d'où viennent les équipes home/away de chaque slot.
// Format : 'winner:<slot>' ou 'loser:<slot>'.
// Convention CROISÉE pour LB (anti-revanche) :
//   - LB R1 : losers QF1 vs QF4, losers QF2 vs QF3
//   - LB R2 : winner LB_R1_1 vs loser SF2, winner LB_R1_2 vs loser SF1
const FEEDERS = {
  // WB SF : winners des QF (1+4 / 2+3)
  wb_sf1: { home: 'winner:wb_qf1', away: 'winner:wb_qf4' },
  wb_sf2: { home: 'winner:wb_qf2', away: 'winner:wb_qf3' },
  // WB Finale : winners SF
  wb_f:   { home: 'winner:wb_sf1', away: 'winner:wb_sf2' },
  // LB R1 : losers QF (cross : QF1+QF4 / QF2+QF3)
  lb_r1_1: { home: 'loser:wb_qf1', away: 'loser:wb_qf4' },
  lb_r1_2: { home: 'loser:wb_qf2', away: 'loser:wb_qf3' },
  // LB R2 : winners LB R1 + losers WB SF (cross : LB_R1_1 vs SF2_loser, LB_R1_2 vs SF1_loser)
  lb_r2_1: { home: 'winner:lb_r1_1', away: 'loser:wb_sf2' },
  lb_r2_2: { home: 'winner:lb_r1_2', away: 'loser:wb_sf1' },
  // LB R3 : winners LB R2
  lb_r3:  { home: 'winner:lb_r2_1', away: 'winner:lb_r2_2' },
  // LB Finale : winner LB R3 + loser WB Finale
  lb_f:   { home: 'winner:lb_r3', away: 'loser:wb_f' },
  // Grande Finale (sans bracket reset)
  gf:     { home: 'winner:wb_f', away: 'winner:lb_f' },
};

// ── Génère les 14 matchs initiaux du bracket depuis le top 8 ──────────
// top8 = tableau d'objets équipe (de calculateSwissStandings) trié seed 1→8
export function generateBracketMatches(top8) {
  if (!top8 || top8.length < 8) return [];
  // teamId par seed (1-indexed)
  const seed = i => top8[i - 1]?.teamId || top8[i - 1]?.id;

  const matches = [];
  let order = 0;

  // Quarts WB (équipes définies)
  matches.push(buildMatch('wb_qf1', seed(1), seed(8), order++));
  matches.push(buildMatch('wb_qf2', seed(2), seed(7), order++));
  matches.push(buildMatch('wb_qf3', seed(3), seed(6), order++));
  matches.push(buildMatch('wb_qf4', seed(4), seed(5), order++));

  // Tous les autres matchs : équipes vides (seront remplies par auto-progression)
  for (const slot of ['wb_sf1','wb_sf2','wb_f','lb_r1_1','lb_r1_2','lb_r2_1','lb_r2_2','lb_r3','lb_f','gf']) {
    matches.push(buildMatch(slot, null, null, order++));
  }

  return matches;
}

function buildMatch(slot, homeTeamId, awayTeamId, order) {
  const feeders = FEEDERS[slot] || null;
  return {
    phase: SLOT_PHASE[slot],
    bracketSlot: slot,
    format: SLOT_FORMAT[slot],
    homeTeamId: homeTeamId || null,
    awayTeamId: awayTeamId || null,
    homeFeeder: feeders?.home || null,
    awayFeeder: feeders?.away || null,
    bracketOrder: order,
    games: [],
    seriesScore: { home: 0, away: 0 },
    winner: null,
    status: 'pending',
    onStage: false,
  };
}

// ── Filtre les matchs du bracket parmi tous les matchs LAN ──────────
export function getBracketMatches(allLanMatches) {
  return allLanMatches.filter(m => BRACKET_PHASES.includes(m.phase) || m.bracketSlot);
}

export function getMatchBySlot(allBracketMatches, slot) {
  return allBracketMatches.find(m => m.bracketSlot === slot);
}

// ── Auto-progression : calcule les patches à appliquer après qu'un match
// soit terminé, pour propager le winner / loser dans les matchs dépendants.
//
// Retourne un tableau d'updates : [{ matchId, patch: {homeTeamId?, awayTeamId?, ...} }]
// Si le match dépendant avait déjà des scores saisis et que l'équipe change,
// on efface ses scores (sinon incohérence).
export function computeProgressionUpdates(finishedMatch, allBracketMatches) {
  const updates = [];
  const slot = finishedMatch.bracketSlot;
  if (!slot) return updates;

  // winner et loser teamIds
  const winnerId = finishedMatch.winner;
  const loserId = winnerId
    ? (finishedMatch.homeTeamId === winnerId ? finishedMatch.awayTeamId : finishedMatch.homeTeamId)
    : null;

  for (const m of allBracketMatches) {
    if (m.id === finishedMatch.id) continue;
    if (!m.bracketSlot) continue;

    const patch = {};
    let teamsChanged = false;

    if (m.homeFeeder) {
      const expected = resolveFeeder(m.homeFeeder, slot, winnerId, loserId, m.homeTeamId);
      if (expected !== undefined && expected !== m.homeTeamId) {
        patch.homeTeamId = expected;
        teamsChanged = true;
      }
    }
    if (m.awayFeeder) {
      const expected = resolveFeeder(m.awayFeeder, slot, winnerId, loserId, m.awayTeamId);
      if (expected !== undefined && expected !== m.awayTeamId) {
        patch.awayTeamId = expected;
        teamsChanged = true;
      }
    }

    if (teamsChanged) {
      // Si le match dépendant avait des scores → on les efface (les scores ne
      // s'appliquaient plus aux mêmes équipes).
      if ((m.games || []).length > 0 || m.status === 'played') {
        patch.games = [];
        patch.seriesScore = { home: 0, away: 0 };
        patch.winner = null;
        patch.status = 'pending';
      }
      updates.push({ matchId: m.id, patch });
    }
  }
  return updates;
}

// ── Helper : résout un feeder ('winner:slot' ou 'loser:slot') vers un teamId.
// Si le feeder ne correspond pas au slot du match terminé, on retourne undefined
// (= "ne change rien"). Si winner/loser est null (match pas terminé), on retourne
// null (= "vider la cellule").
function resolveFeeder(feeder, finishedSlot, winnerId, loserId, currentTeamId) {
  const [type, sourceSlot] = feeder.split(':');
  if (sourceSlot !== finishedSlot) return undefined;
  if (type === 'winner') return winnerId || null;
  if (type === 'loser') return loserId || null;
  return undefined;
}

// ── Quand on EDITE un score qui change le winner d'un match : on doit
// rétro-propager récursivement sur tous les matchs en aval.
// Retourne tous les updates à appliquer en cascade.
export function computeRetroPropagationUpdates(editedMatch, allBracketMatches) {
  const updates = computeProgressionUpdates(editedMatch, allBracketMatches);
  // Applique les updates virtuellement et récurse sur les matchs impactés
  // dont le winner change aussi (parce qu'on a effacé leurs games).
  const updatedById = new Map(updates.map(u => [u.matchId, u.patch]));
  const allDownstream = [...updates];

  for (const update of updates) {
    if (!update.patch.winner === undefined) continue; // pas de changement de winner
    // Si le match dépendant a perdu son winner (effacé par patch), on doit re-propager
    const m = allBracketMatches.find(x => x.id === update.matchId);
    if (!m || !m.winner) continue;
    // Le match dépendant avait un winner ; après reset, il n'en a plus → re-propager
    const virtualMatch = { ...m, ...update.patch };
    const downstream = computeRetroPropagationUpdates(virtualMatch, allBracketMatches);
    for (const d of downstream) {
      // Merge avec les updates existants (dernier gagne)
      const existing = updatedById.get(d.matchId);
      if (existing) Object.assign(existing, d.patch);
      else { updatedById.set(d.matchId, d.patch); allDownstream.push(d); }
    }
  }

  return allDownstream;
}

// ── Helper : est-ce que le bracket est complet (GF jouée) ?
export function isBracketComplete(allBracketMatches) {
  const gf = getMatchBySlot(allBracketMatches, 'gf');
  return gf?.status === 'played';
}

// ── Helper : est-ce que le bracket existe déjà (au moins 1 match créé) ?
export function isBracketGenerated(allBracketMatches) {
  return allBracketMatches.some(m => m.bracketSlot);
}
