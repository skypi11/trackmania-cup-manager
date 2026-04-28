// modules/lan-bracket-admin.js — UI admin sous-onglet "Bracket"
import { state } from './state.js';
import { esc, toast } from './utils.js';
import {
  getQualifiedTeams, getLanMatches,
  createLanMatchesBatch, updateLanMatch, deleteLanMatch, fetchLanMatchesOnce,
} from './lan.js';
import {
  SWISS_ROUNDS, calcSeriesScore, calculateSwissStandings,
  getSwissMatches, isRoundComplete,
} from './lan-swiss.js';
import {
  SLOT_LABEL,
  generateBracketMatches, getBracketMatches, getMatchBySlot,
  computeRetroPropagationUpdates,
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

// ── Vue "bracket généré" — vrai bracket visuel ────────────────────────
function renderBracket(wrap, bracketMatches) {
  const complete = isBracketComplete(bracketMatches);

  // Définition visuelle des sections du bracket
  const wbRounds = [
    { title: 'Quarts WB', fmt: 'BO5', slots: ['wb_qf1','wb_qf4','wb_qf2','wb_qf3'] },
    { title: 'Demis WB',  fmt: 'BO5', slots: ['wb_sf1','wb_sf2'] },
    { title: 'Finale WB', fmt: 'BO7', slots: ['wb_f'] },
  ];
  const lbRounds = [
    { title: 'LB R1', fmt: 'BO5', slots: ['lb_r1_1','lb_r1_2'] },
    { title: 'LB R2', fmt: 'BO5', slots: ['lb_r2_1','lb_r2_2'] },
    { title: 'LB R3', fmt: 'BO7', slots: ['lb_r3'] },
    { title: 'Finale LB', fmt: 'BO7', slots: ['lb_f'] },
  ];
  const gfRounds = [
    { title: 'Grande Finale', fmt: 'BO7', slots: ['gf'] },
  ];

  wrap.innerHTML = `
    <div class="stitle">🏆 Bracket — Jour 2 (dimanche)</div>
    <div class="adm-card" style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <div>
          <div style="font-weight:700;font-size:1rem">${complete ? '✓ Bracket terminé' : 'Bracket en cours'}</div>
          <div style="font-size:.78rem;color:var(--text2)">Double élimination · 8 équipes · 14 matchs au total</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          ${complete ? `${renderChampion(bracketMatches)}` : ''}
          <button class="btn-d" onclick="resetBracket()">🗑️ Reset Bracket</button>
        </div>
      </div>
    </div>

    <div class="bracket-viewport">
      ${renderBracketSection('wb', "🏆 Winners' Bracket", "Pas de défaite — droit à la grande finale", wbRounds, bracketMatches)}
      ${renderBracketSection('lb', "🔥 Losers' Bracket", "Une défaite = élimination", lbRounds, bracketMatches)}
      ${renderBracketSection('gf', '⭐ Grande Finale', 'Sans bracket reset — BO7 unique', gfRounds, bracketMatches)}
    </div>
  `;
}

function renderBracketSection(kind, title, subtitle, rounds, bracketMatches) {
  return `
    <div class="bracket-section ${kind}">
      <div class="bracket-sec-hdr">
        <div class="bracket-sec-title">${title}</div>
        <div class="bracket-sec-sub">${esc(subtitle)}</div>
      </div>
      <div class="bracket-rows">
        ${rounds.map(r => `
          <div class="bracket-round">
            <div class="bracket-round-hdr">${esc(r.title)}<span class="fmt">${esc(r.fmt)}</span></div>
            <div class="bracket-round-cards">
              ${r.slots.map(s => {
                const m = getMatchBySlot(bracketMatches, s);
                return m ? renderBracketCard(m, kind === 'gf') : '';
              }).join('')}
            </div>
          </div>
        `).join('')}
      </div>
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

function renderBracketCard(match, isFinal = false) {
  const home = match.homeTeamId ? state.teamsMap[match.homeTeamId] : null;
  const away = match.awayTeamId ? state.teamsMap[match.awayTeamId] : null;
  const homePending = !home;
  const awayPending = !away;
  const isPending = homePending || awayPending;

  const games = match.games || [];
  const ss = calcSeriesScore(games, match.format || 'bo5');
  const hasScore = ss.played || games.length > 0;

  const homeName = home?.name || feederToLabel(match.homeFeeder);
  const awayName = away?.name || feederToLabel(match.awayFeeder);

  const homeLogo = home?.logoUrl
    ? `<img class="bm-logo" src="${esc(home.logoUrl)}" alt="" onerror="this.style.opacity='.2'">`
    : `<div class="bm-logo-ph"></div>`;
  const awayLogo = away?.logoUrl
    ? `<img class="bm-logo" src="${esc(away.logoUrl)}" alt="" onerror="this.style.opacity='.2'">`
    : `<div class="bm-logo-ph"></div>`;

  const cardClass = [
    'bm',
    isPending ? 'bm-empty' : (ss.played ? 'bm-played' : 'bm-pending'),
    match.onStage ? 'bm-stage' : '',
    isFinal ? 'bm-final' : '',
  ].filter(Boolean).join(' ');

  const homeRowClass = ss.played ? (ss.winner === 'home' ? 'bm-winner' : 'bm-loser') : '';
  const awayRowClass = ss.played ? (ss.winner === 'away' ? 'bm-winner' : 'bm-loser') : '';

  const homeNameClass = homePending ? 'bm-name feeder' : 'bm-name';
  const awayNameClass = awayPending ? 'bm-name feeder' : 'bm-name';

  const homeScoreCell = hasScore
    ? `<div class="bm-score-cell">${ss.home}</div>`
    : `<div class="bm-score-empty">—</div>`;
  const awayScoreCell = hasScore
    ? `<div class="bm-score-cell">${ss.away}</div>`
    : `<div class="bm-score-empty">—</div>`;

  const slotLabel = SLOT_LABEL[match.bracketSlot] || '';
  const stageBadge = match.onStage ? `<span class="bm-stage-bdg">🎭 SCÈNE</span>` : '';
  const onclickAttr = isPending ? '' : `onclick="openSwissMatch('${match.id}')"`;

  return `
    <div class="${cardClass}" ${onclickAttr}>
      <div class="bm-row ${homeRowClass}">
        <div class="bm-team">${homeLogo}<div class="${homeNameClass}">${esc(homeName)}</div></div>
        ${homeScoreCell}
      </div>
      <div class="bm-row ${awayRowClass}">
        <div class="bm-team">${awayLogo}<div class="${awayNameClass}">${esc(awayName)}</div></div>
        ${awayScoreCell}
      </div>
      <div class="bm-foot">
        <div class="bm-foot-l">
          <span class="bm-slot">${esc(slotLabel)}</span>
          ${stageBadge}
        </div>
        <div class="bm-foot-r">
          ${isPending
            ? `<span class="bm-pending-msg">En attente</span>`
            : `<button class="bm-act stage" onclick="event.stopPropagation();toggleBracketStage('${match.id}',${!match.onStage})">${match.onStage ? '✕ Scène' : '🎭 Scène'}</button>
               <button class="bm-act ${ss.played?'edit':''}" onclick="event.stopPropagation();openSwissMatch('${match.id}')">${ss.played?'✏️':'⚡ Score'}</button>`}
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

  // Aperçu : juste les 4 quarts annotés avec le seed (rang dans le top 8)
  const seedById = new Map(top8.map((t, i) => [t.teamId, i + 1]));
  const seedMeta = teamId => {
    const s = seedById.get(teamId);
    return s ? `Seed ${s} (top ${s} Suisse)` : '';
  };
  const previewQfs = bracketSpecs
    .filter(m => m.phase === 'wb_qf')
    .map(m => ({
      home: m.homeTeamId,
      away: m.awayTeamId,
      homeMeta: seedMeta(m.homeTeamId),
      awayMeta: seedMeta(m.awayTeamId),
    }));

  const ok = await showPairingsConfirmation({
    title: 'Génération du bracket — Quarts WB',
    subtitle: '4 matchs en BO5 (1v8, 2v7, 3v6, 4v5). Les 10 autres matchs seront créés vides et se rempliront automatiquement.',
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
