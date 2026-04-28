// modules/lan-public.js — page publique LAN (lecture seule, pas d'auth)
// Charge en live les collections rl_lan, rl_lan_matches, rl_teams, rl_matches
// (toutes en allow read: if true côté Firestore rules) et rend la page.

import { db } from '../../shared/firebase-config.js';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { state } from './state.js';
import { buildStandings } from './standings.js';
import {
  SWISS_ROUNDS, calcSeriesScore, calculateSwissStandings,
  getSwissMatches, getSwissRound,
} from './lan-swiss.js';
import {
  SLOT_LABEL, getBracketMatches, getMatchBySlot, isBracketComplete,
} from './lan-bracket.js';

const LAN_DOC_ID = 'sls2-2026';

state.lanConfig = null;
state.lanMatches = state.lanMatches || {};

// Mode aperçu : ?preview=swiss|between|bracket|finished force le status
// localement (pas de write Firestore) pour visualiser le rendu de chaque
// phase avant la LAN. Lecture seule des données réelles.
const VALID_PREVIEW_STATUSES = ['preparation', 'swiss', 'between', 'bracket', 'finished'];
const PREVIEW_STATUS = (() => {
  try {
    const p = new URL(window.location.href).searchParams.get('preview');
    return p && VALID_PREVIEW_STATUSES.includes(p) ? p : null;
  } catch { return null; }
})();

// ── Init : listeners live ─────────────────────────────────────────────
export function initLanPublic() {
  let pending = 0;
  const tick = () => {
    pending = (pending || 0) + 1;
    requestAnimationFrame(() => {
      pending = 0;
      rerender();
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

  window.addEventListener('resize', () => {
    if (window._lanResizeRaf) cancelAnimationFrame(window._lanResizeRaf);
    window._lanResizeRaf = requestAnimationFrame(() => drawBracketConnectors());
  });
}

// ── Helpers ──────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function pName(p) { return p?.pseudo || p?.pseudoTM || p?.name || '?'; }
function teamLogo(t, cls = 'lp-logo') {
  return t?.logoUrl
    ? `<img class="${cls}" src="${esc(t.logoUrl)}" alt="" onerror="this.style.opacity='.2'">`
    : `<div class="${cls} lp-logo-ph"></div>`;
}
function getLanStatus() {
  if (PREVIEW_STATUS) return PREVIEW_STATUS;
  return state.lanConfig?.status || 'preparation';
}
function getLanQuota(pool) {
  const q = state.lanConfig?.poolQuotas || { 1: 9, 2: 7 };
  return q[pool] ?? q[String(pool)] ?? 8;
}
function getQualifiedTeams(pool) {
  const manual = state.lanConfig?.manualQualified || [];
  const standings = buildStandings(pool);
  if (manual.length) {
    const set = new Set(manual);
    const inPool = standings.filter(t => set.has(t.id));
    if (inPool.length) return inPool;
  }
  return standings.slice(0, getLanQuota(pool));
}
function getAllQualified() {
  return [...getQualifiedTeams(1), ...getQualifiedTeams(2)];
}
function isRoundComplete(swissMatches, round) {
  const ms = swissMatches.filter(m => getSwissRound(m.phase) === round);
  if (!ms.length) return false;
  return ms.every(m => m.status === 'played' || calcSeriesScore(m.games || [], m.format || 'bo5').played);
}
function fmtDate(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

// ── RENDER : top-level ────────────────────────────────────────────────
function rerender() {
  if (!Object.keys(state.teamsMap || {}).length) return; // attendre les équipes
  renderPreviewBanner();
  renderHero();
  renderQualified();
  renderSwiss();
  renderBracket();
  renderChampion();
}

function renderPreviewBanner() {
  const wrap = document.getElementById('lan-preview-banner');
  if (!wrap) return;
  if (!PREVIEW_STATUS) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'flex';
  wrap.innerHTML = `
    <div><strong>👁️ Mode aperçu</strong> — status forcé à <strong>${esc(PREVIEW_STATUS)}</strong> · données réelles non modifiées</div>
    <a href="./lan.html" class="lp-preview-exit">✕ Sortir du mode aperçu</a>
  `;
}

function renderHero() {
  const wrap = document.getElementById('lan-hero-content');
  if (!wrap) return;
  const status = getLanStatus();

  wrap.parentElement.classList.remove('lp-st-prep','lp-st-live','lp-st-done');

  if (status === 'finished') return renderHeroFinished(wrap);
  if (status === 'preparation') return renderHeroPreparation(wrap);
  return renderHeroLive(wrap, status);
}

function renderHeroFinished(wrap) {
  wrap.parentElement.classList.add('lp-st-done');

  const cfg = state.lanConfig || {};
  const name = cfg.name || 'Springs League Series #2';
  const start = fmtDate(cfg.startDate || '2026-05-16');
  const end = fmtDate(cfg.endDate || '2026-05-17');

  const bracketMatches = getBracketMatches(Object.values(state.lanMatches));
  const gf = getMatchBySlot(bracketMatches, 'gf');
  const champion = gf?.winner ? state.teamsMap[gf.winner] : null;

  if (!champion) {
    // Fallback : LAN finished sans champion (cas dégénéré) — vue minimale
    wrap.innerHTML = `
      <div class="lp-hero-bdg">LAN terminée</div>
      <h1 class="lp-hero-title">${esc(name)} — LAN</h1>
      <div class="lp-hero-meta"><span>📅 ${esc(start)} → ${esc(end)}</span></div>
    `;
    return;
  }

  const logo = champion.logoUrl
    ? `<img src="${esc(champion.logoUrl)}" alt="${esc(champion.name)}" class="lp-champ-logo" onerror="this.style.opacity='.2'">`
    : `<div class="lp-champ-logo lp-logo-ph"></div>`;

  wrap.innerHTML = `
    <div class="lp-champ-tag">🏆 Vainqueur · ${esc(name)}</div>
    ${logo}
    <h1 class="lp-champ-name">${esc(champion.name)}</h1>
    <div class="lp-champ-prize">800€ remportés</div>
    <div class="lp-champ-meta">
      <span>📅 ${esc(start)} → ${esc(end)}</span>
      <span>📍 ${esc(cfg.location || 'Magny-Cours')}</span>
    </div>
  `;
}

function renderHeroLive(wrap, status) {
  wrap.parentElement.classList.add('lp-st-live');

  const cfg = state.lanConfig || {};
  const name = cfg.name || 'Springs League Series #2 — LAN';
  const loc = cfg.location || 'Salle Culturelle, Magny-Cours';

  // Détecter le match sur scène + sa phase
  const allMatches = Object.values(state.lanMatches);
  const stageMatch = allMatches.find(m => m.onStage);
  const stageBlock = stageMatch ? renderStageMatch(stageMatch) : '';

  // Phase actuelle
  const phaseLabel = {
    swiss: 'Phase Suisse · Jour 1',
    between: 'Entre Suisse & Bracket',
    bracket: 'Bracket · Jour 2',
  }[status] || 'En cours';

  // Round Suisse en cours, si applicable
  let roundInfo = '';
  if (status === 'swiss') {
    const swissMatches = getSwissMatches(allMatches);
    let currentRound = 0;
    for (let r = 1; r <= SWISS_ROUNDS; r++) {
      if (swissMatches.some(m => getSwissRound(m.phase) === r)) currentRound = r;
    }
    if (currentRound) roundInfo = ` · Round ${currentRound} / ${SWISS_ROUNDS}`;
  }

  wrap.innerHTML = `
    <div class="lp-hero-bdg lp-bdg-live"><span class="lp-live-dot"></span>${esc(phaseLabel)}${esc(roundInfo)}</div>
    <h1 class="lp-hero-title">${esc(name)}</h1>
    <div class="lp-hero-meta">
      <span>📍 ${esc(loc)}</span>
      <span>💰 1 600€ · 16 équipes</span>
    </div>
    ${stageBlock}
  `;
}

function renderHeroPreparation(wrap) {
  wrap.parentElement.classList.add('lp-st-prep');

  const cfg = state.lanConfig || {};
  const name = cfg.name || 'Springs League Series #2 — LAN';
  const startDate = cfg.startDate || '2026-05-16';
  const start = fmtDate(startDate);
  const end = fmtDate(cfg.endDate || '2026-05-17');
  const loc = cfg.location || 'Salle Culturelle, Magny-Cours';

  const targetMs = new Date(`${startDate}T10:00:00`).getTime();
  const diff = targetMs - Date.now();
  let countdownHtml;
  if (diff <= 0) {
    countdownHtml = `<div class="lp-countdown-lbl">C'est aujourd'hui !</div>`;
  } else {
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    countdownHtml = `
      <div class="lp-countdown-lbl">Démarre dans</div>
      <div class="lp-countdown">
        <div class="lp-cd-cell"><div class="lp-cd-val">${days}</div><div class="lp-cd-unit">jours</div></div>
        <div class="lp-cd-cell"><div class="lp-cd-val">${hours}</div><div class="lp-cd-unit">heures</div></div>
        <div class="lp-cd-cell"><div class="lp-cd-val">${mins}</div><div class="lp-cd-unit">minutes</div></div>
      </div>
    `;
  }

  const allQualified = getAllQualified();
  wrap.innerHTML = `
    ${countdownHtml}
    <h1 class="lp-hero-title">${esc(name)}</h1>
    <div class="lp-hero-meta">
      <span>📅 ${esc(start)} → ${esc(end)}</span>
      <span>📍 ${esc(loc)}</span>
      <span>💰 1 600€ de cashprize</span>
      <span>🎮 ${allQualified.length} / 16 équipes qualifiées</span>
    </div>
  `;

  // Refresh chaque minute pour le countdown
  if (!window._lanCountdownInterval) {
    window._lanCountdownInterval = setInterval(() => {
      if (getLanStatus() === 'preparation') renderHero();
    }, 60000);
  }
}

function renderStageMatch(m) {
  const home = state.teamsMap[m.homeTeamId];
  const away = state.teamsMap[m.awayTeamId];
  if (!home || !away) return '';
  const ss = calcSeriesScore(m.games || [], m.format || 'bo5');
  const fmt = (m.format || 'bo5').toUpperCase();
  return `
    <div class="lp-stage-card">
      <div class="lp-stage-hdr"><span class="lp-live-dot"></span>EN DIRECT · MATCH SUR SCÈNE · ${esc(fmt)}</div>
      <div class="lp-stage-body">
        <div class="lp-stage-team">${teamLogo(home, 'lp-stage-logo')}<div class="lp-stage-name">${esc(home.name)}</div></div>
        <div class="lp-stage-score">${ss.home}<span>-</span>${ss.away}</div>
        <div class="lp-stage-team away"><div class="lp-stage-name">${esc(away.name)}</div>${teamLogo(away, 'lp-stage-logo')}</div>
      </div>
    </div>
  `;
}

// État local de l'UI : sections expandables (préservé entre rerender)
const UI_STATE = window._lanUiState = window._lanUiState || { qualifiedExpanded: null };

function renderQualified() {
  const wrap = document.getElementById('lan-qualified');
  if (!wrap) return;
  const p1 = getQualifiedTeams(1);
  const p2 = getQualifiedTeams(2);
  const status = getLanStatus();

  if (!p1.length && !p2.length) {
    wrap.innerHTML = `
      <div class="lp-stitle">🏅 Équipes qualifiées</div>
      <div class="lp-card lp-empty">Les qualifiés seront annoncés à la fin de la saison régulière.</div>
    `;
    return;
  }

  // En préparation : la section reste ouverte (les qualifs sont l'attraction).
  // Sinon : repliée par défaut (la LAN se passe ou est passée, les qualifs c'est de l'historique).
  const defaultExpanded = (status === 'preparation');
  const expanded = UI_STATE.qualifiedExpanded ?? defaultExpanded;

  const renderTeam = (t, rank, pool) => {
    const team = state.teamsMap[t.id] || t;
    const logo = teamLogo(team, 'lp-q-logo');
    return `
      <div class="lp-q-card">
        <div class="lp-q-rank">#${rank}</div>
        ${logo}
        <div class="lp-q-info">
          <div class="lp-q-name">${esc(team.name || '?')}</div>
          <div class="lp-q-meta">
            <span class="lp-pool-bdg p${pool}">P${pool}</span>
            ${team.tag ? `<span class="lp-q-tag">${esc(team.tag)}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  };

  // Teaser quand replié : juste un strip horizontal des logos
  const teaserStrip = expanded ? '' : `
    <div class="lp-q-teaser">
      ${[...p1, ...p2].map(t => {
        const team = state.teamsMap[t.id] || t;
        return team.logoUrl
          ? `<img class="lp-q-tlogo" src="${esc(team.logoUrl)}" alt="${esc(team.name)}" title="${esc(team.name)}">`
          : `<div class="lp-q-tlogo lp-logo-ph"></div>`;
      }).join('')}
    </div>
  `;

  const fullPools = !expanded ? '' : `
    <div class="lp-q-pools">
      <div class="lp-q-pool">
        <div class="lp-q-pool-hdr"><span class="lp-pool-bdg p1">Poule 1</span> <span class="lp-q-pool-cnt">${p1.length} qualifiés</span></div>
        <div class="lp-q-grid">${p1.map((t, i) => renderTeam(t, i + 1, 1)).join('')}</div>
      </div>
      <div class="lp-q-pool">
        <div class="lp-q-pool-hdr"><span class="lp-pool-bdg p2">Poule 2</span> <span class="lp-q-pool-cnt">${p2.length} qualifiés</span></div>
        <div class="lp-q-grid">${p2.map((t, i) => renderTeam(t, i + 1, 2)).join('')}</div>
      </div>
    </div>
  `;

  wrap.innerHTML = `
    <div class="lp-stitle">🏅 Équipes qualifiées <span class="lp-stitle-sub">${p1.length + p2.length} / 16</span></div>
    ${teaserStrip}
    ${fullPools}
    <div class="lp-collapse-toggle-wrap">
      <button class="lp-collapse-toggle" onclick="window._lanToggleQualified()">
        ${expanded ? '↑ Replier' : `↓ Voir les ${p1.length + p2.length} équipes`}
      </button>
    </div>
  `;
}

window._lanToggleQualified = function () {
  const status = getLanStatus();
  const defaultExpanded = (status === 'preparation');
  const cur = UI_STATE.qualifiedExpanded ?? defaultExpanded;
  UI_STATE.qualifiedExpanded = !cur;
  renderQualified();
};

function renderSwiss() {
  const wrap = document.getElementById('lan-swiss');
  if (!wrap) return;
  const status = getLanStatus();
  if (status === 'preparation') { wrap.innerHTML = ''; return; }

  const swissMatches = getSwissMatches(Object.values(state.lanMatches));
  if (!swissMatches.length) { wrap.innerHTML = ''; return; }

  // Classement Suisse
  const qIds = getAllQualified().map(t => t.id);
  const standings = calculateSwissStandings(swissMatches, qIds);

  const standingsExpanded = UI_STATE.standingsExpanded ?? false; // top 8 par défaut
  const visibleStandings = standingsExpanded ? standings : standings.slice(0, 8);

  const standingsRows = visibleStandings.map((row, i) => {
    const team = state.teamsMap[row.teamId];
    if (!team) return '';
    const top8 = i < 8 ? 'lp-sw-top8' : '';
    return `
      <div class="lp-sw-row ${top8}">
        <div class="lp-sw-rank">${i + 1}</div>
        ${teamLogo(team, 'lp-sw-logo')}
        <div class="lp-sw-name">${esc(team.name)}</div>
        <div class="lp-sw-stat lp-sw-pts">${row.pts.toFixed(1)}</div>
        <div class="lp-sw-stat">${row.wins}V</div>
        <div class="lp-sw-stat lp-sw-loss">${row.losses}D</div>
        <div class="lp-sw-stat lp-sw-diff">${row.gw - row.gl >= 0 ? '+' : ''}${row.gw - row.gl}</div>
      </div>
    `;
  }).join('');

  const standingsToggle = standings.length > 8 ? `
    <div class="lp-sw-stand-foot">
      <button class="lp-collapse-toggle" onclick="window._lanToggleStandings()">
        ${standingsExpanded ? `↑ N'afficher que le top 8 (qualifiés bracket)` : `↓ Voir le classement complet (${standings.length} équipes)`}
      </button>
    </div>
  ` : '';

  // Rounds en accordéon : seul le round réellement en cours (matchs non
  // terminés) est ouvert par défaut. Quand toute la Suisse est jouée
  // (preview=finished, status bracket/finished), tous les accordéons sont
  // fermés — l'utilisateur clique sur celui qu'il veut consulter.
  let openRound = 0;
  for (let r = 1; r <= SWISS_ROUNDS; r++) {
    const ms = swissMatches.filter(m => getSwissRound(m.phase) === r);
    if (ms.length && !isRoundComplete(swissMatches, r)) { openRound = r; break; }
  }

  const roundsHtml = [];
  for (let r = 1; r <= SWISS_ROUNDS; r++) {
    const ms = swissMatches.filter(m => getSwissRound(m.phase) === r);
    if (!ms.length) {
      roundsHtml.push(`
        <details class="lp-sw-round">
          <summary class="lp-sw-round-hdr">
            <span>Round ${r}</span>
            <span class="lp-sw-round-state lp-st-pending">À venir</span>
          </summary>
        </details>
      `);
      continue;
    }
    const complete = isRoundComplete(swissMatches, r);
    const stateLbl = complete
      ? `<span class="lp-sw-round-state lp-st-done">✓ Terminé</span>`
      : `<span class="lp-sw-round-state lp-st-live"><span class="lp-live-dot"></span>En cours</span>`;
    const matches = ms.map(m => renderSwissMatch(m)).join('');
    const open = r === openRound ? 'open' : '';
    roundsHtml.push(`
      <details class="lp-sw-round" ${open}>
        <summary class="lp-sw-round-hdr">
          <span>Round ${r} <span class="lp-sw-round-cnt">${ms.length} matchs</span></span>
          ${stateLbl}
        </summary>
        <div class="lp-sw-round-matches">${matches}</div>
      </details>
    `);
  }

  wrap.innerHTML = `
    <div class="lp-stitle">🇨🇭 Phase Suisse <span class="lp-stitle-sub">Jour 1 — 5 rounds BO5</span></div>
    <div class="lp-sw-grid">
      <div class="lp-sw-stand">
        <div class="lp-sw-stand-hdr">
          <div class="lp-sw-rank">#</div>
          <div></div>
          <div class="lp-sw-name">Équipe</div>
          <div class="lp-sw-stat">Pts</div>
          <div class="lp-sw-stat">V</div>
          <div class="lp-sw-stat">D</div>
          <div class="lp-sw-stat">Δ</div>
        </div>
        ${standingsRows}
        ${standingsToggle}
      </div>
      <div class="lp-sw-rounds">${roundsHtml.join('')}</div>
    </div>
  `;
}

window._lanToggleStandings = function () {
  UI_STATE.standingsExpanded = !(UI_STATE.standingsExpanded ?? false);
  renderSwiss();
};

function renderSwissMatch(m) {
  const home = state.teamsMap[m.homeTeamId];
  const away = state.teamsMap[m.awayTeamId];
  if (!home || !away) return '';
  const ss = calcSeriesScore(m.games || [], m.format || 'bo5');
  const played = ss.played;
  const stage = m.onStage ? `<span class="lp-sw-stage">🎭 SCÈNE</span>` : '';
  const score = played
    ? `<div class="lp-sw-score">${ss.home}<span>-</span>${ss.away}</div>`
    : `<div class="lp-sw-score lp-sw-score-vs">vs</div>`;
  const homeWin = played && ss.winner === 'home';
  const awayWin = played && ss.winner === 'away';
  return `
    <div class="lp-sw-match ${played ? 'lp-played' : 'lp-pending'}">
      <div class="lp-sw-team ${homeWin ? 'win' : (played ? 'lose' : '')}">${teamLogo(home, 'lp-sw-mlogo')}<span>${esc(home.name)}</span></div>
      ${score}
      <div class="lp-sw-team away ${awayWin ? 'win' : (played ? 'lose' : '')}"><span>${esc(away.name)}</span>${teamLogo(away, 'lp-sw-mlogo')}</div>
      ${stage}
    </div>
  `;
}

// ── RENDER : Bracket double élim (read-only) ──────────────────────────
const BRACKET_CONNECTORS = [
  { sources: ['wb_qf1','wb_qf4'], target: 'wb_sf1', kind: 'solid' },
  { sources: ['wb_qf2','wb_qf3'], target: 'wb_sf2', kind: 'solid' },
  { sources: ['wb_sf1','wb_sf2'], target: 'wb_f',   kind: 'solid' },
  { sources: ['wb_f'],            target: 'gf',     kind: 'gold'  },
  { sources: ['lb_r1_1'], target: 'lb_r2_1', kind: 'solid' },
  { sources: ['lb_r1_2'], target: 'lb_r2_2', kind: 'solid' },
  { sources: ['lb_r2_1','lb_r2_2'], target: 'lb_r3', kind: 'solid' },
  { sources: ['lb_r3'],   target: 'lb_f',    kind: 'solid' },
  { sources: ['lb_f'],    target: 'gf',      kind: 'gold'  },
];

function renderBracket() {
  const wrap = document.getElementById('lan-bracket');
  if (!wrap) return;
  const status = getLanStatus();
  const bracketMatches = getBracketMatches(Object.values(state.lanMatches));

  if (!bracketMatches.length || (status !== 'bracket' && status !== 'finished')) {
    wrap.innerHTML = '';
    return;
  }

  const renderCol = (colClass, kind, title, fmt, slots) => {
    const cards = slots.map(s => {
      const m = getMatchBySlot(bracketMatches, s);
      return m ? renderBracketCard(m) : '';
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
    <div class="lp-stitle">🏆 Bracket — Jour 2 <span class="lp-stitle-sub">Double élimination · 8 équipes</span></div>
    <div class="bracket-viewport">
      <div class="bracket-grid" id="lp-bracket-grid">
        <svg class="bracket-svg" id="lp-bracket-svg" xmlns="http://www.w3.org/2000/svg"></svg>
        ${renderCol('bcol-wb-qf','wb','Quarts WB','BO5',['wb_qf1','wb_qf4','wb_qf2','wb_qf3'])}
        ${renderCol('bcol-wb-sf','wb','Demis WB','BO5',['wb_sf1','wb_sf2'])}
        ${renderCol('bcol-wb-f', 'wb','Finale WB','BO7',['wb_f'])}
        ${renderCol('bcol-lb-r1','lb','LB R1','BO5',['lb_r1_1','lb_r1_2'])}
        ${renderCol('bcol-lb-r2','lb','LB R2','BO5',['lb_r2_1','lb_r2_2'])}
        ${renderCol('bcol-lb-r3','lb','LB R3','BO7',['lb_r3'])}
        ${renderCol('bcol-lb-f', 'lb','Finale LB','BO7',['lb_f'])}
        ${renderCol('bcol-gf',   'gf','⭐ Grande Finale','BO7',['gf'])}
      </div>
    </div>
  `;

  requestAnimationFrame(() => drawBracketConnectors());
}

function renderBracketCard(match) {
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

  const homeLogoHtml = home?.logoUrl
    ? `<img class="bm-logo" src="${esc(home.logoUrl)}" alt="" onerror="this.style.opacity='.2'">`
    : `<div class="bm-logo-ph"></div>`;
  const awayLogoHtml = away?.logoUrl
    ? `<img class="bm-logo" src="${esc(away.logoUrl)}" alt="" onerror="this.style.opacity='.2'">`
    : `<div class="bm-logo-ph"></div>`;

  const cardClass = [
    'bm',
    isPending ? 'bm-empty' : (ss.played ? 'bm-played' : 'bm-pending'),
    match.onStage ? 'bm-stage' : '',
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

  return `
    <div class="${cardClass}" data-bm-slot="${esc(match.bracketSlot || '')}" style="cursor:default">
      <div class="bm-row ${homeRowClass}">
        <div class="bm-team">${homeLogoHtml}<div class="${homeNameClass}">${esc(homeName)}</div></div>
        ${homeScoreCell}
      </div>
      <div class="bm-row ${awayRowClass}">
        <div class="bm-team">${awayLogoHtml}<div class="${awayNameClass}">${esc(awayName)}</div></div>
        ${awayScoreCell}
      </div>
      <div class="bm-foot lp-bm-foot">
        <span class="bm-slot">${esc(slotLabel)}</span>
        ${stageBadge}
      </div>
    </div>
  `;
}

function feederToLabel(feeder) {
  if (!feeder) return '?';
  const [type, slot] = feeder.split(':');
  const slotLabel = SLOT_LABEL[slot] || slot;
  return type === 'winner' ? `Vainqueur ${slotLabel}` : `Perdant ${slotLabel}`;
}

function drawBracketConnectors() {
  const grid = document.getElementById('lp-bracket-grid');
  const svg = document.getElementById('lp-bracket-svg');
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
    const rows = card.querySelectorAll('.bm-row');
    let midY;
    if (rows.length >= 2) {
      const r1 = rows[0].getBoundingClientRect();
      const r2 = rows[rows.length - 1].getBoundingClientRect();
      midY = (r1.bottom + r2.top) / 2 - gridRect.top;
    } else {
      midY = r.top - gridRect.top + r.height / 2;
    }
    return {
      left: r.left - gridRect.left,
      right: r.right - gridRect.left,
      midY,
    };
  };

  for (const conn of BRACKET_CONNECTORS) {
    const tgt = rectOf(conn.target);
    if (!tgt) continue;
    const srcs = conn.sources.map(rectOf).filter(Boolean);
    if (!srcs.length) continue;

    const maxSrcRight = Math.max(...srcs.map(s => s.right));
    const branchX = maxSrcRight + (tgt.left - maxSrcRight) / 2;

    for (const src of srcs) {
      const d = `M ${src.right} ${src.midY} H ${branchX} V ${tgt.midY} H ${tgt.left}`;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', conn.kind);
      svg.appendChild(path);
    }
  }
}

// ── RENDER : Podium ───────────────────────────────────────────────────
// Le champion est déjà mis en avant dans le hero (mode finished). Cette
// section affiche le podium 2/3 places + un rappel discret du 1er, plus
// pédagogique : "voici les 3 premiers".
function renderChampion() {
  const wrap = document.getElementById('lan-champion');
  if (!wrap) return;
  const status = getLanStatus();
  const bracketMatches = getBracketMatches(Object.values(state.lanMatches));
  if (status !== 'finished' || !isBracketComplete(bracketMatches)) {
    wrap.innerHTML = '';
    return;
  }
  const gf = getMatchBySlot(bracketMatches, 'gf');
  if (!gf?.winner) { wrap.innerHTML = ''; return; }
  const champion = state.teamsMap[gf.winner];
  if (!champion) { wrap.innerHTML = ''; return; }

  const lbF = getMatchBySlot(bracketMatches, 'lb_f');
  const second = gf.homeTeamId === gf.winner ? gf.awayTeamId : gf.homeTeamId;
  const third = lbF?.winner
    ? (lbF.homeTeamId === lbF.winner ? lbF.awayTeamId : lbF.homeTeamId)
    : null;

  const podiumCard = (teamId, place, prize, cls) => {
    const t = state.teamsMap[teamId];
    if (!t) return '';
    return `
      <div class="lp-pod-card lp-pod-${cls}">
        <div class="lp-pod-place">${place}</div>
        ${teamLogo(t, 'lp-pod-logo')}
        <div class="lp-pod-name">${esc(t.name)}</div>
        <div class="lp-pod-prize">${prize}</div>
      </div>
    `;
  };

  wrap.innerHTML = `
    <div class="lp-stitle">🥇 Podium final</div>
    <div class="lp-podium">
      ${podiumCard(second, '2ᵉ', '500€', '2nd')}
      ${podiumCard(champion.id, '🏆 1ᵉʳ', '800€', '1st')}
      ${third ? podiumCard(third, '3ᵉ', '300€', '3rd') : ''}
    </div>
  `;
}
