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
import { showPairingsConfirmation } from './lan-modals.js';

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

  const ok = await showPairingsConfirmation({
    title: 'Round 1 — Génération des appariements',
    subtitle: `${pairings.length} matchs en BO5 vont être créés (Poule 1 ↔ Poule 2 + 4P1 vs 5P1 interne).`,
    pairings,
    format: 'bo5',
  });
  if (!ok) return;

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

  const ok = await showPairingsConfirmation({
    title: `Round ${round} — Génération des appariements`,
    subtitle: `${pairings.length} matchs en BO5 — appariement Swiss (équipes au même score, sans revanche).`,
    pairings,
    format: 'bo5',
  });
  if (!ok) return;

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

  const format = match.format || 'bo5';
  const target = format === 'bo7' ? 4 : 3;
  const maxGames = format === 'bo7' ? 7 : 5;
  const homeName = esc(home.name);
  const awayName = esc(away.name);
  const homeLogoUrl = home.logoUrl ? esc(home.logoUrl) : '';
  const awayLogoUrl = away.logoUrl ? esc(away.logoUrl) : '';

  const body = document.getElementById('mo-match-body');
  body.innerHTML = `
    <!-- En-tête équipes + score série live -->
    <div id="swiss-live-header" style="display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:14px;padding:14px;background:rgba(0,0,0,.25);border-radius:10px">
      <!-- Équipe domicile (gauche) -->
      <div style="flex:1;display:flex;align-items:center;justify-content:flex-end;gap:10px;min-width:0">
        <div style="text-align:right;min-width:0">
          <div style="font-weight:700;font-size:.92rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${homeName}</div>
          <div style="font-size:.66rem;color:var(--text3);margin-top:2px">DOMICILE</div>
        </div>
        ${homeLogoUrl?`<img src="${homeLogoUrl}" alt="" style="width:44px;height:44px;border-radius:6px;object-fit:cover;flex-shrink:0" onerror="this.style.opacity='.2'">`:''}
      </div>
      <!-- Score live au centre -->
      <div style="text-align:center;flex-shrink:0">
        <div style="display:flex;align-items:center;gap:10px;font-size:2.2rem;font-weight:900;line-height:1">
          <span id="sl-home-score" style="min-width:40px;text-align:right;color:var(--text)">0</span>
          <span style="color:var(--text3);font-size:1.4rem">-</span>
          <span id="sl-away-score" style="min-width:40px;text-align:left;color:var(--text)">0</span>
        </div>
        <div id="sl-format" style="font-size:.7rem;color:var(--text2);margin-top:6px;font-weight:700;letter-spacing:.04em">EN COURS · BO${target===3?5:7}</div>
        <div id="sl-status" style="font-size:.65rem;color:var(--text3);margin-top:2px;font-weight:600;min-height:13px">encore ${target} manche${target>1?'s':''}</div>
      </div>
      <!-- Équipe extérieur (droite) -->
      <div style="flex:1;display:flex;align-items:center;gap:10px;min-width:0">
        ${awayLogoUrl?`<img src="${awayLogoUrl}" alt="" style="width:44px;height:44px;border-radius:6px;object-fit:cover;flex-shrink:0" onerror="this.style.opacity='.2'">`:''}
        <div style="text-align:left;min-width:0">
          <div style="font-weight:700;font-size:.92rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${awayName}</div>
          <div style="font-size:.66rem;color:var(--text3);margin-top:2px">EXTÉRIEUR</div>
        </div>
      </div>
    </div>

    <!-- Layout en table HTML : 3 colonnes — home / "Manche X" centré / away -->
    <!-- Le gagnant est indiqué par la couleur de l'input (vert) au lieu d'une flèche -->
    <table class="swiss-games-table" id="swiss-games-list">
      <thead>
        <tr>
          <th>${homeName.toUpperCase()}</th>
          <th class="sg-th-label"></th>
          <th>${awayName.toUpperCase()}</th>
        </tr>
      </thead>
      <tbody>
        ${Array.from({length: maxGames}, (_, i) => `
          <tr class="sg-row" data-row="${i}">
            <td><input type="number" class="sg-input sg-home" data-idx="${i}" min="0" max="99" inputmode="numeric" pattern="[0-9]*" placeholder="—"></td>
            <td><span class="sg-label">Manche ${i+1}</span></td>
            <td><input type="number" class="sg-input sg-away" data-idx="${i}" min="0" max="99" inputmode="numeric" pattern="[0-9]*" placeholder="—"></td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div style="font-size:.7rem;color:var(--text3);margin-bottom:12px;text-align:center">
      💡 <kbd style="background:rgba(255,255,255,.08);padding:1px 5px;border-radius:3px;font-size:.65rem">Tab</kbd> auto après 1 chiffre ·
      <kbd style="background:rgba(255,255,255,.08);padding:1px 5px;border-radius:3px;font-size:.65rem">Backspace</kbd> = champ précédent ·
      <kbd style="background:rgba(255,255,255,.08);padding:1px 5px;border-radius:3px;font-size:.65rem">Enter</kbd> = enregistrer ·
      <kbd style="background:rgba(255,255,255,.08);padding:1px 5px;border-radius:3px;font-size:.65rem">Esc</kbd> = annuler
    </div>

    <div class="f-actions">
      <button class="btn-p" id="swiss-save-btn" onclick="saveSwissMatch('${matchId}')">💾 Enregistrer</button>
      <button class="btn-s" onclick="closeModal('mo-match')">Annuler</button>
      <button class="btn-d" style="margin-left:auto" onclick="clearSwissMatch('${matchId}')">🗑️ Effacer manches</button>
    </div>
  `;

  document.getElementById('mo-match-title').textContent = `Round ${getSwissRound(match.phase)} — ${homeName} vs ${awayName}`;
  openModal('mo-match');

  // ── Init valeurs + handlers UX
  const games = match.games || [];
  const inputs = body.querySelectorAll('.sg-home, .sg-away');
  inputs.forEach(inp => {
    const idx = +inp.dataset.idx;
    const which = inp.classList.contains('sg-home') ? 'home' : 'away';
    if (games[idx]?.[which] != null) inp.value = games[idx][which];

    inp.addEventListener('input', () => {
      // Auto-tab après 1 chiffre (rare qu'une équipe mette 10+ buts en RL)
      if (inp.value.length >= 1 && /^\d+$/.test(inp.value)) {
        focusNext(body, inp);
      }
      refreshLiveScore(body, format, target, homeName, awayName);
    });

    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        window.saveSwissMatch(matchId);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeModal('mo-match');
      } else if (e.key === 'Backspace' && inp.value === '') {
        // Backspace dans champ vide → focus champ précédent
        e.preventDefault();
        focusPrev(body, inp);
      }
    });
  });

  // Affichage initial du score live
  refreshLiveScore(body, format, target, homeName, awayName);

  // Auto-focus sur le premier input vide
  setTimeout(() => {
    const firstEmpty = Array.from(inputs).find(i => !i.value);
    const target = firstEmpty || inputs[0];
    target?.focus();
    target?.select();
  }, 50);
};

function focusNext(body, current) {
  const all = Array.from(body.querySelectorAll('.sg-home, .sg-away'))
    .filter(el => el.closest('.sg-row').style.display !== 'none');
  const i = all.indexOf(current);
  if (i >= 0 && i < all.length - 1) {
    const next = all[i + 1];
    next.focus();
    next.select();
  } else {
    // On est sur le dernier champ visible : focus le bouton enregistrer
    document.getElementById('swiss-save-btn')?.focus();
  }
}

function focusPrev(body, current) {
  const all = Array.from(body.querySelectorAll('.sg-home, .sg-away'))
    .filter(el => el.closest('.sg-row').style.display !== 'none');
  const i = all.indexOf(current);
  if (i > 0) {
    const prev = all[i - 1];
    prev.focus();
    prev.select();
  }
}

// Recalcule + ré-affiche le score série live, le statut, l'état des manches
function refreshLiveScore(body, format, target, homeName, awayName) {
  const homeIns = body.querySelectorAll('.sg-home');
  const awayIns = body.querySelectorAll('.sg-away');
  let home = 0;
  let away = 0;
  let winner = null;
  let winnerIdx = -1;
  const wasJustWonNow = { value: false };

  for (let i = 0; i < homeIns.length; i++) {
    const h = homeIns[i].value;
    const a = awayIns[i].value;
    const row = body.querySelector(`.sg-row[data-row="${i}"]`);
    // Reset des classes de l'input et de la ligne
    homeIns[i].classList.remove('sg-won', 'sg-lost', 'sg-invalid');
    awayIns[i].classList.remove('sg-won', 'sg-lost', 'sg-invalid');
    row.classList.remove('sg-hidden');

    if (h === '' || a === '') continue;
    const hh = +h;
    const aa = +a;
    if (Number.isNaN(hh) || Number.isNaN(aa) || hh === aa) {
      // Score invalide (égalité non possible en RL)
      homeIns[i].classList.add('sg-invalid');
      awayIns[i].classList.add('sg-invalid');
      continue;
    }
    if (hh > aa) {
      if (!winner) home++;
      homeIns[i].classList.add('sg-won');
      awayIns[i].classList.add('sg-lost');
    } else {
      if (!winner) away++;
      homeIns[i].classList.add('sg-lost');
      awayIns[i].classList.add('sg-won');
    }
    if (!winner) {
      if (home >= target) { winner = 'home'; winnerIdx = i; wasJustWonNow.value = true; }
      else if (away >= target) { winner = 'away'; winnerIdx = i; wasJustWonNow.value = true; }
    }
  }

  // Cache les manches après le winnerIdx (inutiles)
  if (winnerIdx >= 0) {
    for (let i = winnerIdx + 1; i < homeIns.length; i++) {
      const row = body.querySelector(`.sg-row[data-row="${i}"]`);
      row.classList.add('sg-hidden');
      // Vide les valeurs des lignes cachées au cas où elles avaient été saisies
      homeIns[i].value = '';
      awayIns[i].value = '';
    }
  }

  // Update du score live + statut sur 2 lignes (format / état)
  document.getElementById('sl-home-score').textContent = home;
  document.getElementById('sl-away-score').textContent = away;
  const formatLine = document.getElementById('sl-format');
  const status = document.getElementById('sl-status');
  if (winner === 'home') {
    formatLine.textContent = `✓ ${homeName.toUpperCase()} GAGNE`;
    formatLine.style.color = '#0c8';
    status.textContent = `${home}-${away} en manches`;
    status.style.color = '#0c8';
    document.getElementById('sl-home-score').style.color = '#0c8';
    document.getElementById('sl-away-score').style.color = 'var(--text3)';
  } else if (winner === 'away') {
    formatLine.textContent = `✓ ${awayName.toUpperCase()} GAGNE`;
    formatLine.style.color = '#0c8';
    status.textContent = `${home}-${away} en manches`;
    status.style.color = '#0c8';
    document.getElementById('sl-home-score').style.color = 'var(--text3)';
    document.getElementById('sl-away-score').style.color = '#0c8';
  } else {
    const need = Math.max(target - home, target - away);
    formatLine.textContent = `EN COURS · BO${target === 3 ? 5 : 7}`;
    formatLine.style.color = 'var(--text2)';
    status.textContent = `encore ${need} manche${need > 1 ? 's' : ''}`;
    status.style.color = 'var(--text3)';
    document.getElementById('sl-home-score').style.color = 'var(--text)';
    document.getElementById('sl-away-score').style.color = 'var(--text)';
  }

  // Match juste terminé : focus le bouton enregistrer pour Enter direct
  if (wasJustWonNow.value) {
    setTimeout(() => document.getElementById('swiss-save-btn')?.focus(), 30);
  }
}

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
  // Vide les inputs visuellement sans fermer la modal
  const body = document.getElementById('mo-match-body');
  if (body) {
    body.querySelectorAll('.sg-home, .sg-away').forEach(inp => { inp.value = ''; });
    const match = state.lanMatches[matchId];
    const format = match?.format || 'bo5';
    const target = format === 'bo7' ? 4 : 3;
    const home = state.teamsMap[match?.homeTeamId];
    const away = state.teamsMap[match?.awayTeamId];
    refreshLiveScore(body, format, target, esc(home?.name || '?'), esc(away?.name || '?'));
    // Re-focus sur la première manche pour resaisir tout de suite
    const firstInput = body.querySelector('.sg-home');
    firstInput?.focus();
    firstInput?.select();
  }
  try {
    await updateLanMatch(matchId, {
      games: [],
      seriesScore: { home: 0, away: 0 },
      winner: null,
      status: 'pending',
    });
    toast('Manches effacées', 'ok');
  } catch (e) { console.error(e); toast('Erreur', 'err'); }
};
