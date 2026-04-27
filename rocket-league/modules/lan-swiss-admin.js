// modules/lan-swiss-admin.js — UI admin sous-onglet Suisse
import { state } from './state.js';
import { esc, toast, openModal, closeModal } from './utils.js';
import {
  getQualifiedTeams, getLanMatches,
  createLanMatchesBatch, updateLanMatch, deleteLanMatch, fetchLanMatchesOnce,
} from './lan.js';
import {
  SWISS_ROUNDS, SWISS_FORMAT, getSwissPhase, getSwissRound,
  generateR1Pairings, generateNextRoundPairings,
  calcSeriesScore, calculateSwissStandings, getRoundMatches, getSwissMatches,
  isRoundComplete,
} from './lan-swiss.js';

export async function admLanSwiss() {
  const wrap = document.getElementById('lan-sec-content');
  if (!wrap) return;
  wrap.innerHTML = `<div class="loading"></div>`;

  await fetchLanMatchesOnce();

  const qP1 = getQualifiedTeams(1);
  const qP2 = getQualifiedTeams(2);
  const allQualified = [...qP1, ...qP2];
  const qIds = allQualified.map(t => t.id);

  const swissMatches = getSwissMatches(getLanMatches());

  // Round courant = le plus haut round avec des matchs
  let currentRound = 0;
  for (let r = 1; r <= SWISS_ROUNDS; r++) {
    if (getRoundMatches(swissMatches, r).length > 0) currentRound = r;
  }

  const standings = calculateSwissStandings(swissMatches, qIds);

  wrap.innerHTML = `
    <div class="stitle">🇨🇭 Phase Suisse — Jour 1 (samedi)</div>

    <div class="adm-card" style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <div>
          <div style="font-weight:700;font-size:1rem">Round ${currentRound || '—'} / ${SWISS_ROUNDS}</div>
          <div style="font-size:.78rem;color:var(--text2)">
            ${qIds.length} équipes qualifiées · Format BO5 · 4 matchs simultanés (2 vagues)
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${renderRoundActions(swissMatches, currentRound, qIds.length)}
          ${swissMatches.length > 0 ? `<button class="btn-d" onclick="resetSwissPhase()">🗑️ Reset Suisse</button>` : ''}
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1.6fr 1fr;gap:14px" class="lan-swiss-grid">
      <div>
        ${currentRound === 0
          ? renderEmptySwiss(qIds.length)
          : Array.from({length: currentRound}, (_, i) => i + 1).reverse().map(r => renderRoundSection(swissMatches, r)).join('')}
      </div>
      <div>
        ${renderSwissStandings(standings)}
      </div>
    </div>
  `;
}

function renderEmptySwiss(qCount) {
  const msg = qCount < 2
    ? `Pas assez d'équipes qualifiées (${qCount}).`
    : `Clique sur "Générer Round 1" ci-dessus pour créer les ${Math.ceil(qCount / 2)} matchs.`;
  return `<div class="adm-card"><div class="empty" style="padding:30px;text-align:center;color:var(--text2)">Aucun round généré.<br><br>${msg}</div></div>`;
}

function renderRoundActions(swissMatches, currentRound, totalTeams) {
  if (totalTeams < 2) {
    return `<span style="font-size:.78rem;color:var(--text3)">Pas assez d'équipes qualifiées</span>`;
  }
  if (currentRound === 0) {
    return `<button class="btn-p" onclick="generateSwissR1()">🎲 Générer Round 1</button>`;
  }
  if (currentRound >= SWISS_ROUNDS) {
    if (isRoundComplete(swissMatches, currentRound)) {
      return `<span style="font-size:.78rem;color:#0c8;font-weight:700">✓ Phase Suisse terminée</span>`;
    }
    return `<span style="font-size:.78rem;color:var(--text2)">Round ${currentRound} en cours…</span>`;
  }
  if (isRoundComplete(swissMatches, currentRound)) {
    return `<button class="btn-p" onclick="generateSwissNextRound(${currentRound + 1})">▶ Générer Round ${currentRound + 1}</button>`;
  }
  return `<span style="font-size:.78rem;color:var(--text2)">Round ${currentRound} en cours · Termine d'abord les matchs</span>`;
}

function renderRoundSection(swissMatches, round) {
  const matches = getRoundMatches(swissMatches, round)
    .slice()
    .sort((a, b) => (a.swissOrder ?? 0) - (b.swissOrder ?? 0));
  const complete = isRoundComplete(swissMatches, round);
  return `
    <div class="adm-card" style="margin-bottom:12px">
      <div class="adm-card-hdr" style="justify-content:space-between">
        <span>Round ${round} ${complete ? '<span style="font-size:.7rem;color:#0c8;margin-left:8px;font-weight:700">✓ COMPLET</span>' : ''}</span>
        <span style="font-size:.7rem;color:var(--text3);font-weight:400">${matches.length} match${matches.length>1?'s':''}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${matches.map(m => renderMatchCard(m)).join('')}
      </div>
    </div>
  `;
}

function renderMatchCard(match) {
  const home = state.teamsMap[match.homeTeamId];
  const away = state.teamsMap[match.awayTeamId];
  if (!home || !away) {
    return `<div class="adm-match-card"><div style="padding:14px;color:var(--text3)">⚠️ Équipe(s) introuvable(s)</div></div>`;
  }

  const games = match.games || [];
  const ss = calcSeriesScore(games, match.format || 'bo5');
  const homeLogo = home.logoUrl
    ? `<img class="amc-logo" src="${esc(home.logoUrl)}" alt="" onerror="this.style.opacity='.2'">`
    : `<div class="amc-logo"></div>`;
  const awayLogo = away.logoUrl
    ? `<img class="amc-logo" src="${esc(away.logoUrl)}" alt="" onerror="this.style.opacity='.2'">`
    : `<div class="amc-logo"></div>`;

  const stageBadge = match.onStage
    ? `<span style="background:linear-gradient(90deg,#FFB800,#FF6B35);color:#000;font-size:.65rem;font-weight:800;padding:2px 8px;border-radius:4px;letter-spacing:.04em">🎭 SCÈNE</span>`
    : '';

  const playedColor = ss.played ? (ss.winner === 'home' ? '#0c8' : '#ef4444') : 'var(--text2)';
  const homeOpacity = !ss.played ? 1 : (ss.winner === 'home' ? 1 : 0.5);
  const awayOpacity = !ss.played ? 1 : (ss.winner === 'away' ? 1 : 0.5);

  return `
    <div class="adm-match-card ${ss.played?'amc-played':'amc-pending'}" onclick="openSwissMatch('${match.id}')">
      <div class="amc-body">
        <div class="amc-team" style="opacity:${homeOpacity}">${homeLogo}<div class="amc-name">${esc(home.name)}</div></div>
        <div class="amc-center">
          <div class="amc-score" style="color:${playedColor}">${ss.home}-${ss.away}</div>
          <div class="amc-vs">BO5${games.length?` · ${games.length} manche${games.length>1?'s':''}`:''}</div>
        </div>
        <div class="amc-team away" style="opacity:${awayOpacity}"><div class="amc-name">${esc(away.name)}</div>${awayLogo}</div>
      </div>
      <div class="amc-foot">
        <div class="amc-meta">
          ${stageBadge}
          <button class="btn-s" onclick="event.stopPropagation();toggleStage('${match.id}',${!match.onStage})" style="font-size:.7rem;padding:3px 10px">
            ${match.onStage ? '✕ Retirer scène' : '🎭 Mettre sur scène'}
          </button>
        </div>
        <div class="amc-actions">
          <button class="amc-btn-main" onclick="event.stopPropagation();openSwissMatch('${match.id}')">${ss.played?'✏️ Modifier':'⚡ Saisir score'}</button>
        </div>
      </div>
    </div>
  `;
}

function renderSwissStandings(standings) {
  if (!standings.length) {
    return `<div class="adm-card"><div class="empty" style="padding:14px;text-align:center;font-size:.82rem">Aucune équipe qualifiée.</div></div>`;
  }
  return `
    <div class="adm-card">
      <div class="adm-card-hdr">📊 Classement Suisse</div>
      <table class="stbl" style="font-size:.74rem;min-width:auto">
        <thead><tr>
          <th class="rk">#</th>
          <th>Équipe</th>
          <th style="text-align:center" title="Victoires">V</th>
          <th style="text-align:center" title="Défaites">D</th>
          <th style="text-align:center" title="Points">Pts</th>
          <th style="text-align:center" title="Diff buts">±</th>
        </tr></thead>
        <tbody>
          ${standings.map((row, i) => {
            const team = state.teamsMap[row.teamId];
            const name = team?.name || '?';
            const tag = team?.tag || '';
            const logoUrl = team?.logoUrl;
            const rank = i + 1;
            const top8 = rank <= 8;
            const diff = row.goalsFor - row.goalsAgainst;
            const sep = rank === 8 && standings.length > 8
              ? `<tr class="stbl-sep"><td colspan="6"><div class="stbl-sep-inner"><span class="stbl-sep-line"></span><span class="stbl-sep-txt">🏆 TOP 8 — BRACKET</span><span class="stbl-sep-line"></span></div></td></tr>`
              : '';
            return `<tr class="${top8?'top8':''}">
              <td class="rk"><span class="rk-badge ${rank===1?'rk1':rank===2?'rk2':rank===3?'rk3':top8?'rk-lan':'rk-n'}">${rank}</span></td>
              <td>
                <div class="t-cell">
                  ${logoUrl?`<img class="tlogo-sm" src="${esc(logoUrl)}" alt="" onerror="this.style.opacity='.2'">`:`<div class="tlogo-sm"></div>`}
                  <div><div class="tname" style="font-size:.76rem">${esc(name)}</div><div class="ttag" style="font-size:.6rem">${esc(tag)}</div></div>
                </div>
              </td>
              <td style="text-align:center;color:#0c8;font-weight:700">${row.wins}</td>
              <td style="text-align:center;color:#ef4444;font-weight:700">${row.losses}</td>
              <td style="text-align:center;font-weight:700">${row.pts.toFixed(1)}</td>
              <td style="text-align:center;color:${diff>0?'#0c8':diff<0?'#ef4444':'var(--text2)'}">${diff>0?'+':''}${diff}</td>
            </tr>${sep}`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ── Actions exposées sur window ───────────────────────────────────────
window.generateSwissR1 = async function () {
  const qP1 = getQualifiedTeams(1);
  const qP2 = getQualifiedTeams(2);
  if (qP1.length + qP2.length < 2) {
    toast('Pas assez d\'équipes qualifiées', 'err');
    return;
  }
  const pairings = generateR1Pairings(qP1, qP2);
  if (!pairings.length) { toast('Aucun appariement généré', 'err'); return; }

  const summary = pairings.map((p, i) => {
    const h = state.teamsMap[p.home]?.name || '?';
    const a = state.teamsMap[p.away]?.name || '?';
    return `${i+1}. ${h}  vs  ${a}`;
  }).join('\n');

  if (!confirm(`Générer les ${pairings.length} matchs du Round 1 ?\n\n${summary}`)) return;

  try {
    await createLanMatchesBatch(pairings.map((p, i) => ({
      phase: getSwissPhase(1),
      homeTeamId: p.home,
      awayTeamId: p.away,
      format: SWISS_FORMAT,
      swissOrder: i,
    })));
    toast(`${pairings.length} matchs créés pour le Round 1`, 'ok');
    await admLanSwiss();
  } catch (e) {
    console.error(e);
    toast('Erreur lors de la création', 'err');
  }
};

window.generateSwissNextRound = async function (round) {
  const swissMatches = getSwissMatches(getLanMatches());
  const qIds = [...getQualifiedTeams(1), ...getQualifiedTeams(2)].map(t => t.id);

  if (!isRoundComplete(swissMatches, round - 1)) {
    toast(`Le Round ${round - 1} doit être terminé`, 'err');
    return;
  }

  const pairings = generateNextRoundPairings(swissMatches, qIds);
  if (!pairings.length) { toast('Aucun appariement généré', 'err'); return; }

  const summary = pairings.map((p, i) => {
    const h = state.teamsMap[p.home]?.name || '?';
    const a = state.teamsMap[p.away]?.name || '?';
    return `${i+1}. ${h}  vs  ${a}`;
  }).join('\n');

  if (!confirm(`Générer les ${pairings.length} matchs du Round ${round} ?\n\n${summary}`)) return;

  try {
    await createLanMatchesBatch(pairings.map((p, i) => ({
      phase: getSwissPhase(round),
      homeTeamId: p.home,
      awayTeamId: p.away,
      format: SWISS_FORMAT,
      swissOrder: i,
    })));
    toast(`${pairings.length} matchs créés pour le Round ${round}`, 'ok');
    await admLanSwiss();
  } catch (e) {
    console.error(e);
    toast('Erreur lors de la création', 'err');
  }
};

window.resetSwissPhase = async function () {
  const swissMatches = getSwissMatches(getLanMatches());
  if (!swissMatches.length) return;
  if (!confirm(`⚠️ Supprimer les ${swissMatches.length} matchs Suisse et redémarrer la phase ?\n\nCette action est irréversible.`)) return;
  try {
    await Promise.all(swissMatches.map(m => deleteLanMatch(m.id)));
    toast('Phase Suisse réinitialisée', 'ok');
    await admLanSwiss();
  } catch (e) { console.error(e); toast('Erreur', 'err'); }
};

window.toggleStage = async function (matchId, onStage) {
  try {
    await updateLanMatch(matchId, { onStage });
    toast(onStage ? '🎭 Match sur scène' : 'Match retiré de la scène', 'ok');
  } catch (e) { console.error(e); toast('Erreur', 'err'); }
};

window.openSwissMatch = function (matchId) {
  const match = state.lanMatches[matchId];
  if (!match) return;
  const home = state.teamsMap[match.homeTeamId];
  const away = state.teamsMap[match.awayTeamId];
  if (!home || !away) return;

  const games = match.games || [];
  const format = match.format || 'bo5';
  const maxGames = format === 'bo7' ? 7 : 5;

  const body = document.getElementById('mo-match-body');
  body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:18px;padding:14px;background:rgba(0,0,0,.2);border-radius:8px">
      <div style="text-align:center;flex:1">
        ${home.logoUrl?`<img src="${esc(home.logoUrl)}" alt="" style="width:44px;height:44px;border-radius:6px;object-fit:cover" onerror="this.style.opacity='.2'">`:''}
        <div style="font-weight:700;margin-top:5px;font-size:.86rem">${esc(home.name)}</div>
      </div>
      <div style="text-align:center"><span style="font-size:1.6rem;font-weight:800;color:var(--text3)">VS</span></div>
      <div style="text-align:center;flex:1">
        ${away.logoUrl?`<img src="${esc(away.logoUrl)}" alt="" style="width:44px;height:44px;border-radius:6px;object-fit:cover" onerror="this.style.opacity='.2'">`:''}
        <div style="font-weight:700;margin-top:5px;font-size:.86rem">${esc(away.name)}</div>
      </div>
    </div>

    <div style="font-size:.78rem;color:var(--text2);margin-bottom:12px;padding:8px 12px;background:rgba(255,255,255,.03);border-radius:6px">
      Format <strong>${format.toUpperCase()}</strong> — première équipe à <strong>${format==='bo7'?4:3} manches</strong> gagnées.<br>
      Saisis le score en buts de chaque manche jouée. Les manches non jouées peuvent rester vides.
    </div>

    <div id="swiss-games-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
      ${Array.from({length: maxGames}, (_, i) => {
        const g = games[i];
        return `
          <div style="display:grid;grid-template-columns:84px 1fr 28px 1fr;align-items:center;gap:10px;padding:8px 12px;background:rgba(255,255,255,.03);border-radius:6px">
            <span style="font-size:.78rem;font-weight:700;color:var(--text2)">Manche ${i+1}</span>
            <input type="number" class="finput sg-home" data-idx="${i}" min="0" max="99" value="${g?.home ?? ''}" placeholder="0" style="text-align:center;font-weight:700">
            <span style="text-align:center;font-weight:700;color:var(--text3)">—</span>
            <input type="number" class="finput sg-away" data-idx="${i}" min="0" max="99" value="${g?.away ?? ''}" placeholder="0" style="text-align:center;font-weight:700">
          </div>
        `;
      }).join('')}
    </div>

    <div class="f-actions">
      <button class="btn-p" onclick="saveSwissMatch('${matchId}')">💾 Enregistrer</button>
      <button class="btn-s" onclick="closeModal('mo-match')">Annuler</button>
      ${games.length ? `<button class="btn-d" style="margin-left:auto" onclick="clearSwissMatch('${matchId}')">🗑️ Effacer manches</button>` : ''}
    </div>
  `;

  document.getElementById('mo-match-title').textContent = `Round ${getSwissRound(match.phase)} — Saisie des manches`;
  openModal('mo-match');
};

window.saveSwissMatch = async function (matchId) {
  const homeInputs = document.querySelectorAll('#swiss-games-list .sg-home');
  const awayInputs = document.querySelectorAll('#swiss-games-list .sg-away');

  const newGames = [];
  for (let i = 0; i < homeInputs.length; i++) {
    const h = homeInputs[i].value.trim();
    const a = awayInputs[i].value.trim();
    if (h === '' && a === '') continue;
    if (h === '' || a === '') {
      toast(`Manche ${i+1} : score incomplet`, 'err');
      return;
    }
    const homeGoals = parseInt(h, 10);
    const awayGoals = parseInt(a, 10);
    if (Number.isNaN(homeGoals) || Number.isNaN(awayGoals) || homeGoals < 0 || awayGoals < 0) {
      toast(`Manche ${i+1} : score invalide`, 'err');
      return;
    }
    if (homeGoals === awayGoals) {
      toast(`Manche ${i+1} : pas de match nul possible en RL`, 'err');
      return;
    }
    newGames.push({ home: homeGoals, away: awayGoals });
  }

  const match = state.lanMatches[matchId];
  if (!match) { toast('Match introuvable', 'err'); return; }
  const ss = calcSeriesScore(newGames, match.format || 'bo5');

  try {
    await updateLanMatch(matchId, {
      games: newGames,
      seriesScore: { home: ss.home, away: ss.away },
      winner: ss.played ? (ss.winner === 'home' ? match.homeTeamId : match.awayTeamId) : null,
      status: ss.played ? 'played' : 'pending',
    });
    closeModal('mo-match');
    toast(ss.played ? `✓ Match terminé (${ss.home}-${ss.away})` : 'Score enregistré', 'ok');
  } catch (e) {
    console.error(e);
    toast('Erreur', 'err');
  }
};

window.clearSwissMatch = async function (matchId) {
  if (!confirm('Effacer toutes les manches saisies pour ce match ?')) return;
  try {
    await updateLanMatch(matchId, {
      games: [],
      seriesScore: { home: 0, away: 0 },
      winner: null,
      status: 'pending',
    });
    closeModal('mo-match');
    toast('Manches effacées', 'ok');
  } catch (e) { console.error(e); toast('Erreur', 'err'); }
};
