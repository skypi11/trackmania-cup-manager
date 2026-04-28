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

// ── Vue "bracket généré" — vrai bracket visuel (grille unique WB+LB) ──
// Layout par colonnes-temps (chaque colonne = un créneau de la LAN) :
//   Col 1 : WB QF
//   Col 2 : WB SF + LB R1
//   Col 3 : WB F  + LB R2
//   Col 4 : LB R3
//   Col 5 : LB F
//   Col 6 : GF (à cheval sur les 2 lignes)
function renderBracket(wrap, bracketMatches) {
  const complete = isBracketComplete(bracketMatches);

  const renderCol = (colClass, kind, title, fmt, slots, isFinal) => {
    const cards = slots.map(s => {
      const m = getMatchBySlot(bracketMatches, s);
      return m ? renderBracketCard(m, isFinal) : '';
    }).join('');
    return `
      <div class="bcol ${colClass}">
        <div class="bcol-hdr ${kind}">
          <span>${esc(title)}</span>
          <span class="fmt">${esc(fmt)}</span>
        </div>
        <div class="bcol-cards">${cards}</div>
      </div>
    `;
  };

  wrap.innerHTML = `
    <div class="stitle">🏆 Bracket — Jour 2 (dimanche)</div>
    <div class="adm-card" style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <div>
          <div style="font-weight:700;font-size:1rem">${complete ? '✓ Bracket terminé' : 'Bracket en cours'}</div>
          <div style="font-size:.78rem;color:var(--text2)">Double élimination · 8 équipes · 14 matchs · WB ↑ / LB ↓ / GF →</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          ${complete ? renderChampion(bracketMatches) : ''}
          <button class="btn-d" onclick="resetBracket()">🗑️ Reset Bracket</button>
        </div>
      </div>
    </div>

    <div class="bracket-viewport" id="bracket-viewport">
      <div class="bracket-grid" id="bracket-grid">
        <svg class="bracket-svg" id="bracket-svg" xmlns="http://www.w3.org/2000/svg"></svg>
        ${renderCol('bcol-wb-qf','wb','Quarts WB','BO5',['wb_qf1','wb_qf4','wb_qf2','wb_qf3'],false)}
        ${renderCol('bcol-wb-sf','wb','Demis WB','BO5',['wb_sf1','wb_sf2'],false)}
        ${renderCol('bcol-wb-f', 'wb','Finale WB','BO7',['wb_f'],false)}
        ${renderCol('bcol-lb-r1','lb','LB R1','BO5',['lb_r1_1','lb_r1_2'],false)}
        ${renderCol('bcol-lb-r2','lb','LB R2','BO5',['lb_r2_1','lb_r2_2'],false)}
        ${renderCol('bcol-lb-r3','lb','LB R3','BO7',['lb_r3'],false)}
        ${renderCol('bcol-lb-f', 'lb','Finale LB','BO7',['lb_f'],false)}
        ${renderCol('bcol-gf',   'gf','⭐ Grande Finale','BO7',['gf'],true)}
      </div>
    </div>
  `;

  // Tracé des connecteurs SVG (en L) après que le DOM est posé
  requestAnimationFrame(() => drawBracketConnectors());
  attachBracketResizeListener();
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
    <div class="${cardClass}" data-bm-slot="${esc(match.bracketSlot || '')}" ${onclickAttr}>
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

// ── Tracé des connecteurs SVG en L ────────────────────────────────────
// Définition des liens : sources[] → target. solid pour le flux principal
// (gagnant), dashed pour les "drop downs" WB→LB (perdant), gold pour le flux
// vers la grande finale.
const CONNECTORS = [
  // Winners' bracket
  { sources: ['wb_qf1','wb_qf4'], target: 'wb_sf1', kind: 'solid' },
  { sources: ['wb_qf2','wb_qf3'], target: 'wb_sf2', kind: 'solid' },
  { sources: ['wb_sf1','wb_sf2'], target: 'wb_f',   kind: 'solid' },
  { sources: ['wb_f'],            target: 'gf',     kind: 'gold'  },
  // Losers' bracket
  { sources: ['lb_r1_1'], target: 'lb_r2_1', kind: 'solid' },
  { sources: ['lb_r1_2'], target: 'lb_r2_2', kind: 'solid' },
  { sources: ['lb_r2_1','lb_r2_2'], target: 'lb_r3', kind: 'solid' },
  { sources: ['lb_r3'],   target: 'lb_f',    kind: 'solid' },
  { sources: ['lb_f'],    target: 'gf',      kind: 'gold'  },
  // Drop downs WB → LB (perdants) — pointillés rouges
  { sources: ['wb_sf2'], target: 'lb_r2_1', kind: 'dashed' },
  { sources: ['wb_sf1'], target: 'lb_r2_2', kind: 'dashed' },
  { sources: ['wb_f'],   target: 'lb_f',    kind: 'dashed' },
];

function drawBracketConnectors() {
  const grid = document.getElementById('bracket-grid');
  const svg = document.getElementById('bracket-svg');
  if (!grid || !svg) return;

  const w = grid.scrollWidth;
  const h = grid.scrollHeight;
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.innerHTML = '';

  const gridRect = grid.getBoundingClientRect();
  const rectOf = (slot) => {
    const card = grid.querySelector(`[data-bm-slot="${slot}"]`);
    if (!card) return null;
    const r = card.getBoundingClientRect();
    return {
      left: r.left - gridRect.left,
      right: r.right - gridRect.left,
      midY: r.top - gridRect.top + r.height / 2,
    };
  };

  // Regrouper les connecteurs par target pour calculer un "midX" commun
  // entre les sources et la target — ça donne un vrai tracé en arbre.
  for (const conn of CONNECTORS) {
    const tgt = rectOf(conn.target);
    if (!tgt) continue;
    const srcs = conn.sources.map(rectOf).filter(Boolean);
    if (!srcs.length) continue;

    // Coordonnées : on veut une ligne horizontale à partir de chaque source,
    // qui se rejoint sur une "colonne verticale" placée entre src.right max et tgt.left.
    const maxSrcRight = Math.max(...srcs.map(s => s.right));
    const branchX = maxSrcRight + (tgt.left - maxSrcRight) / 2;

    for (const src of srcs) {
      // Path : src.right → branchX (horizontal) → tgt.midY (vertical) → tgt.left (horizontal)
      const d = `M ${src.right} ${src.midY} H ${branchX} V ${tgt.midY} H ${tgt.left}`;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', conn.kind);
      svg.appendChild(path);
    }
  }
}

let _bracketResizeBound = false;
function attachBracketResizeListener() {
  if (_bracketResizeBound) return;
  _bracketResizeBound = true;
  let raf = null;
  const handler = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => drawBracketConnectors());
  };
  window.addEventListener('resize', handler);
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
