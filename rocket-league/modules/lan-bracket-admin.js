// modules/lan-bracket-admin.js — UI admin sous-onglet "Bracket"
import { state } from './state.js';
import { esc, toast } from './utils.js';
import {
  getQualifiedTeams, getLanMatches,
  createLanMatchesBatch, updateLanMatch, deleteLanMatch, fetchLanMatchesOnce,
} from './lan.js';
import {
  SWISS_ROUNDS, calcSeriesScore, calculateSwissStandings,
  getSwissMatches, getRoundMatches, isRoundComplete,
} from './lan-swiss.js';
import {
  PHASE_GROUPS, SLOT_LABEL, SLOT_FORMAT,
  generateBracketMatches, getBracketMatches, getMatchBySlot,
  computeProgressionUpdates, computeRetroPropagationUpdates,
  isBracketGenerated, isBracketComplete,
} from './lan-bracket.js';
import { showPairingsConfirmation } from './lan-modals.js';

export async function admLanBracket() {
  const wrap = document.getElementById('lan-sec-content');
  if (!wrap) return;
  wrap.innerHTML = `<div class="loading"></div>`;

  await fetchLanMatchesOnce();

  const swissMatches = getSwissMatches(getLanMatches());
  const bracketMatches = getBracketMatches(getLanMatches());
  const generated = isBracketGenerated(bracketMatches);

  // La Suisse doit être complète (5 rounds joués) pour générer le bracket
  const swissComplete = SWISS_ROUNDS_COMPLETE(swissMatches);

  if (!generated) {
    return renderEmptyBracket(wrap, swissComplete, swissMatches);
  }
  return renderBracket(wrap, bracketMatches);
}

function SWISS_ROUNDS_COMPLETE(swissMatches) {
  for (let r = 1; r <= SWISS_ROUNDS; r++) {
    if (!isRoundComplete(swissMatches, r)) return false;
  }
  return true;
}

// ── Vue "bracket pas encore généré" ───────────────────────────────────
function renderEmptyBracket(wrap, swissComplete, swissMatches) {
  if (!swissComplete) {
    // Combien de rounds Suisse joués ?
    let done = 0;
    for (let r = 1; r <= SWISS_ROUNDS; r++) {
      if (isRoundComplete(swissMatches, r)) done = r;
    }
    wrap.innerHTML = `
      <div class="stitle">🏆 Bracket — Jour 2 (dimanche)</div>
      <div class="adm-card">
        <div class="empty" style="padding:30px;text-align:center;color:var(--text2)">
          <div style="font-size:1.05rem;font-weight:700;margin-bottom:8px">⏳ Phase Suisse pas encore terminée</div>
          <div style="font-size:.85rem">Round ${done} / ${SWISS_ROUNDS} joué.<br>Le bracket sera généré une fois les 5 rounds Suisse complétés.</div>
        </div>
      </div>
    `;
    return;
  }
  // Suisse OK → on peut générer
  wrap.innerHTML = `
    <div class="stitle">🏆 Bracket — Jour 2 (dimanche)</div>
    <div class="adm-card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <div>
          <div style="font-weight:700;font-size:1rem">✓ Phase Suisse terminée</div>
          <div style="font-size:.78rem;color:var(--text2)">Top 8 du classement Suisse → bracket double élim (BO5 phases 1-2, BO7 phases 3+, finale BO7 sans reset).</div>
        </div>
        <button class="btn-p" onclick="generateBracketFromTop8()">🏆 Générer le bracket</button>
      </div>
    </div>
  `;
}

// ── Vue "bracket généré" ──────────────────────────────────────────────
function renderBracket(wrap, bracketMatches) {
  const complete = isBracketComplete(bracketMatches);

  wrap.innerHTML = `
    <div class="stitle">🏆 Bracket — Jour 2 (dimanche)</div>
    <div class="adm-card" style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <div>
          <div style="font-weight:700;font-size:1rem">${complete ? '✓ Bracket terminé' : 'Bracket en cours'}</div>
          <div style="font-size:.78rem;color:var(--text2)">Double élimination · 8 équipes · 14 matchs au total</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${complete ? `${renderChampion(bracketMatches)}` : ''}
          <button class="btn-d" onclick="resetBracket()">🗑️ Reset Bracket</button>
        </div>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px">
      ${PHASE_GROUPS.map(g => renderPhaseGroup(g, bracketMatches)).join('')}
    </div>
  `;
}

function renderChampion(bracketMatches) {
  const gf = getMatchBySlot(bracketMatches, 'gf');
  if (!gf?.winner) return '';
  const winnerTeam = state.teamsMap[gf.winner];
  if (!winnerTeam) return '';
  const logo = winnerTeam.logoUrl
    ? `<img src="${esc(winnerTeam.logoUrl)}" alt="" style="width:24px;height:24px;border-radius:4px;object-fit:cover" onerror="this.style.opacity='.2'">`
    : '';
  return `
    <div style="display:flex;align-items:center;gap:8px;background:linear-gradient(90deg,#FFB800,#FF6B35);padding:6px 14px;border-radius:6px;font-weight:800;color:#000;font-size:.86rem">
      🏆 ${logo} ${esc(winnerTeam.name)}
    </div>
  `;
}

function renderPhaseGroup(group, bracketMatches) {
  const matches = group.slots
    .map(slot => getMatchBySlot(bracketMatches, slot))
    .filter(Boolean);
  const allComplete = matches.length > 0 && matches.every(m => m.status === 'played');

  return `
    <div class="adm-card">
      <div class="adm-card-hdr" style="justify-content:space-between">
        <span>${esc(group.label)} ${allComplete ? '<span style="font-size:.7rem;color:#0c8;margin-left:8px;font-weight:700">✓ COMPLET</span>' : ''}</span>
        <span style="font-size:.7rem;color:var(--text3);font-weight:600">${esc(group.format.toUpperCase())} · ${matches.length} match${matches.length>1?'s':''}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${matches.map(m => renderBracketCard(m)).join('')}
      </div>
    </div>
  `;
}

function renderBracketCard(match) {
  const home = match.homeTeamId ? state.teamsMap[match.homeTeamId] : null;
  const away = match.awayTeamId ? state.teamsMap[match.awayTeamId] : null;

  // Si une des deux équipes n'est pas encore connue (en attente d'un match précédent)
  const homePending = !home;
  const awayPending = !away;
  const isPending = homePending || awayPending;

  const games = match.games || [];
  const ss = calcSeriesScore(games, match.format || 'bo5');

  const homeName = home?.name || feederToLabel(match.homeFeeder);
  const awayName = away?.name || feederToLabel(match.awayFeeder);

  const homeLogo = home?.logoUrl
    ? `<img class="amc-logo" src="${esc(home.logoUrl)}" alt="" onerror="this.style.opacity='.2'">`
    : `<div class="amc-logo" style="opacity:.3"></div>`;
  const awayLogo = away?.logoUrl
    ? `<img class="amc-logo" src="${esc(away.logoUrl)}" alt="" onerror="this.style.opacity='.2'">`
    : `<div class="amc-logo" style="opacity:.3"></div>`;

  const stageBadge = match.onStage
    ? `<span style="background:linear-gradient(90deg,#FFB800,#FF6B35);color:#000;font-size:.65rem;font-weight:800;padding:2px 8px;border-radius:4px;letter-spacing:.04em">🎭 SCÈNE</span>`
    : '';

  const slotLabel = SLOT_LABEL[match.bracketSlot] || '';
  const playedColor = ss.played ? (ss.winner === 'home' ? '#0c8' : '#ef4444') : 'var(--text2)';
  const homeOpacity = !ss.played ? 1 : (ss.winner === 'home' ? 1 : 0.5);
  const awayOpacity = !ss.played ? 1 : (ss.winner === 'away' ? 1 : 0.5);

  return `
    <div class="adm-match-card ${ss.played?'amc-played':'amc-pending'}" ${isPending?'':`onclick="openSwissMatch('${match.id}')"`} style="${isPending?'opacity:.55;cursor:default':''}">
      <div class="amc-body">
        <div class="amc-team" style="opacity:${homePending?0.5:homeOpacity}">${homeLogo}<div class="amc-name">${esc(homeName)}</div></div>
        <div class="amc-center">
          <div class="amc-score" style="color:${playedColor}">${ss.played||games.length?`${ss.home}-${ss.away}`:'—'}</div>
          <div class="amc-vs">${esc((match.format||'bo5').toUpperCase())}${games.length?` · ${games.length} m.`:''}</div>
        </div>
        <div class="amc-team away" style="opacity:${awayPending?0.5:awayOpacity}"><div class="amc-name">${esc(awayName)}</div>${awayLogo}</div>
      </div>
      <div class="amc-foot">
        <div class="amc-meta">
          <span style="font-size:.7rem;color:var(--text3);font-weight:700">${esc(slotLabel)}</span>
          ${stageBadge}
          ${!isPending ? `<button class="btn-s" onclick="event.stopPropagation();toggleBracketStage('${match.id}',${!match.onStage})" style="font-size:.7rem;padding:3px 10px">
            ${match.onStage ? '✕ Retirer scène' : '🎭 Mettre sur scène'}
          </button>` : ''}
        </div>
        <div class="amc-actions">
          ${isPending
            ? `<span style="font-size:.7rem;color:var(--text3);font-style:italic">En attente du match précédent</span>`
            : `<button class="amc-btn-main" onclick="event.stopPropagation();openSwissMatch('${match.id}')">${ss.played?'✏️ Modifier':'⚡ Saisir score'}</button>`}
        </div>
      </div>
    </div>
  `;
}

// Convertit un feeder ('winner:wb_qf1') en libellé lisible
function feederToLabel(feeder) {
  if (!feeder) return '?';
  const [type, slot] = feeder.split(':');
  const slotLabel = SLOT_LABEL[slot] || slot;
  return type === 'winner' ? `Vainqueur ${slotLabel}` : `Perdant ${slotLabel}`;
}

// ── Actions exposées sur window ───────────────────────────────────────
window.generateBracketFromTop8 = async function () {
  const swissMatches = getSwissMatches(getLanMatches());
  if (!SWISS_ROUNDS_COMPLETE(swissMatches)) {
    toast('La phase Suisse doit être terminée', 'err');
    return;
  }
  const qIds = [...getQualifiedTeams(1), ...getQualifiedTeams(2)].map(t => t.id);
  const standings = calculateSwissStandings(swissMatches, qIds);
  if (standings.length < 8) { toast('Pas assez d\'équipes (top 8 incomplet)', 'err'); return; }
  const top8 = standings.slice(0, 8);

  const bracketSpecs = generateBracketMatches(top8);
  if (!bracketSpecs.length) { toast('Génération échouée', 'err'); return; }

  // Aperçu : juste les 4 quarts (les autres sont vides au départ)
  const previewQfs = bracketSpecs
    .filter(m => m.phase === 'wb_qf')
    .map(m => ({ home: m.homeTeamId, away: m.awayTeamId }));

  const ok = await showPairingsConfirmation({
    title: 'Génération du bracket — Quarts WB',
    subtitle: '4 matchs en BO5 vont être créés (1v8, 2v7, 3v6, 4v5). Les 10 autres matchs seront créés vides et se rempliront automatiquement.',
    pairings: previewQfs,
    confirmLabel: '🏆 Générer le bracket complet',
    format: 'bo5',
  });
  if (!ok) return;

  try {
    await createLanMatchesBatch(bracketSpecs);
    toast('Bracket généré (14 matchs)', 'ok');
    await admLanBracket();
  } catch (e) {
    console.error(e);
    toast('Erreur lors de la création', 'err');
  }
};

window.toggleBracketStage = async function (matchId, onStage) {
  try {
    await updateLanMatch(matchId, { onStage });
    toast(onStage ? '🎭 Match sur scène' : 'Match retiré de la scène', 'ok');
  } catch (e) { console.error(e); toast('Erreur', 'err'); }
};

window.resetBracket = async function () {
  const bracketMatches = getBracketMatches(getLanMatches());
  if (!bracketMatches.length) return;
  if (!confirm(`⚠️ Supprimer les ${bracketMatches.length} matchs du bracket et redémarrer ?\n\nCette action est irréversible.`)) return;
  try {
    await Promise.all(bracketMatches.map(m => deleteLanMatch(m.id)));
    toast('Bracket réinitialisé', 'ok');
    await admLanBracket();
  } catch (e) { console.error(e); toast('Erreur', 'err'); }
};

// ── Hook : appelé après qu'un match Suisse/Bracket a été enregistré ──
// pour propager automatiquement les résultats dans le bracket.
// Utilisé par lan-swiss-admin.js après saveSwissMatch sur un match bracket.
export async function applyBracketProgression(matchId) {
  const match = state.lanMatches[matchId];
  if (!match || !match.bracketSlot) return;

  const allBracketMatches = getBracketMatches(getLanMatches());

  // Si le match avait déjà été joué et qu'on l'édite : rétro-propagation
  // (efface les scores en aval et reseed les équipes). Sinon : progression simple.
  const updates = computeRetroPropagationUpdates(match, allBracketMatches);

  for (const u of updates) {
    try {
      await updateLanMatch(u.matchId, u.patch);
    } catch (e) {
      console.error('[bracket] failed to apply progression update', e);
    }
  }
}
