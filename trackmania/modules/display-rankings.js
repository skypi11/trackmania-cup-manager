// modules/display-rankings.js — Classement général, stats, graphique, export CSV

import { state } from './state.js';
import { t } from '../../shared/i18n.js';
import { pName, tTeam, getPoints, avatarHtml, computeSpringsScore, getSpringsTier, getNextSpringsTier, tierBadgeHtml, playerTierPillHtml } from './utils.js';
import { pointsTableHtml } from './display-rules.js';

const cupId = new URLSearchParams(window.location.search).get('cup') || 'monthly';

window.setRankingSeason = (s) => { state.selectedRankingSeason = s; displayGeneralRanking(); };
window.setRankingMode = (m) => { state.rankingMode = m; displayGeneralRanking(); };

export function buildRankingStats(finaleResults) {
    const stats = {};
    state.data.participants.forEach(p => {
        stats[p.id] = { player: p, points: 0, finals: 0, wins: 0, podiums: 0, best: Infinity };
    });
    finaleResults.forEach(r => {
        if (!stats[r.playerId]) return;
        stats[r.playerId].points += getPoints(r.position);
        stats[r.playerId].finals++;
        if (r.position === 1) stats[r.playerId].wins++;
        if (r.position <= 3) stats[r.playerId].podiums++;
        if (r.position < stats[r.playerId].best) stats[r.playerId].best = r.position;
    });
    return Object.values(stats)
        .filter(s => s.finals > 0)
        .sort((a, b) => b.points - a.points || b.wins - a.wins || a.best - b.best);
}

export function displayGeneralRanking() {
    const exportBtn = document.getElementById('btnExportCSV');
    if (exportBtn) exportBtn.style.display = state.isAdmin ? '' : 'none';
    const container = document.getElementById('generalRanking');

    // Build available seasons (only those with finale data)
    const seasons = [...new Set(
        state.data.results.filter(r => r.phase === 'finale').map(r => {
            const e = state.data.editions.find(ed => ed.id === r.editionId);
            return e ? (e.saison || new Date(e.date).getFullYear()) : null;
        }).filter(Boolean)
    )].sort((a, b) => b - a);

    // Auto-select most recent season on first load
    if (state.selectedRankingSeason === null) {
        state.selectedRankingSeason = seasons.length > 0 ? seasons[0] : 'all';
    }
    const currentSeason = seasons[0] || null;

    // Build tab bar (saisons)
    const filterBar = document.getElementById('rankingSeasonFilter');
    if (filterBar) {
        const tabs = [
            currentSeason ? `<button class="filter-btn${state.selectedRankingSeason === currentSeason ? ' active' : ''}" onclick="setRankingSeason(${currentSeason})">${t('hof.season')} ${currentSeason}</button>` : null,
            `<button class="filter-btn${state.selectedRankingSeason === 'all' ? ' active' : ''}" onclick="setRankingSeason('all')">${t('rankings.alltime')}</button>`,
            ...seasons.slice(1).map(s => `<button class="filter-btn${state.selectedRankingSeason === s ? ' active' : ''}" onclick="setRankingSeason(${s})">${s}</button>`)
        ].filter(Boolean);
        filterBar.innerHTML = tabs.join('');
    }

    // Mode bar (Compétition / Springs Rank)
    const modeBar = document.getElementById('rankingModeFilter');
    if (modeBar) {
        modeBar.innerHTML = `
            <button class="filter-btn${state.rankingMode === 'competition' ? ' active' : ''}" onclick="setRankingMode('competition')">${t('rankings.mode.competition')}</button>
            <button class="filter-btn${state.rankingMode === 'springs' ? ' active' : ''}" onclick="setRankingMode('springs')">${t('rankings.mode.springs')}</button>
            <span style="margin-left:auto;font-size:0.75rem;color:rgba(255,255,255,0.35);font-style:italic">${t('rankings.mode.help')}</span>`;
    }

    // ── Mode Springs Rank : classement combiné ──────────────────────────────
    if (state.rankingMode === 'springs') {
        renderSpringsRankingTable(container);
        return;
    }

    // Filter editions by selected season
    const seasonEditions = state.selectedRankingSeason === 'all'
        ? state.data.editions
        : state.data.editions.filter(e => (e.saison || new Date(e.date).getFullYear()) === state.selectedRankingSeason);
    const editionIds = state.selectedRankingSeason === 'all' ? null : new Set(seasonEditions.map(e => e.id));
    const finales = state.data.results.filter(r => r.phase === 'finale' && (editionIds === null || editionIds.has(r.editionId)));

    if (finales.length === 0) {
        container.innerHTML = `<div class="empty-state"><span class="empty-state-icon">📊</span><p>${t('rankings.empty')}</p></div>`;
        updateChart([]);
        return;
    }

    const ranking = buildRankingStats(finales);

    // Compute previous ranking (without the most recent edition) for trend indicator
    const today = new Date();
    const doneEditions = seasonEditions
        .filter(e => e.status === 'terminee' || new Date(e.date) < today)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    const prevRankMap = {};
    if (doneEditions.length >= 2) {
        const latestId = doneEditions[0].id;
        const prevRanking = buildRankingStats(finales.filter(r => r.editionId !== latestId));
        prevRanking.forEach((s, i) => { prevRankMap[s.player.id] = i + 1; });
    }

    // Champion de saison banner (only for a specific season)
    let championBannerHtml = '';
    if (state.selectedRankingSeason !== 'all' && ranking.length > 0) {
        const champ = ranking[0];
        const doneCount = doneEditions.length;
        championBannerHtml = `<div style="background:linear-gradient(135deg,rgba(251,191,36,0.12),rgba(251,191,36,0.04));border:1px solid rgba(251,191,36,0.25);border-radius:14px;padding:18px 20px;margin-bottom:20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
            <div style="font-size:2.4rem;line-height:1">🏆</div>
            ${avatarHtml(champ.player, { size: 56, ringColor: 'rgba(251,191,36,0.5)' })}
            <div style="flex:1;min-width:0">
                <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:2px;color:rgba(251,191,36,0.6);font-weight:700;margin-bottom:4px">${t('rankings.season.leader')} ${state.selectedRankingSeason}</div>
                <div style="font-size:1.35rem;font-weight:900;letter-spacing:-0.5px" class="player-name-link" onclick="openPlayerProfile('${champ.player.id}')">${pName(champ.player)}</div>
                <div style="font-size:0.8rem;color:rgba(255,255,255,0.4);margin-top:2px">${tTeam(champ.player.team)}</div>
            </div>
            <div style="display:flex;gap:20px;text-align:center">
                <div><div style="font-size:1.4rem;font-weight:900;color:#fbbf24">${champ.points}</div><div style="font-size:0.68rem;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:1px">${t('rankings.pts')}</div></div>
                <div><div style="font-size:1.4rem;font-weight:900">${champ.wins}</div><div style="font-size:0.68rem;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:1px">${t('rankings.wins')}</div></div>
                <div><div style="font-size:1.4rem;font-weight:900">${champ.finals}<span style="font-size:0.9rem;font-weight:400;color:rgba(255,255,255,0.35)">/${doneCount}</span></div><div style="font-size:0.68rem;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:1px">${t('rankings.finals')}</div></div>
            </div>
        </div>`;
    }

    // "Ma position" block
    const myEntry = state.currentUser ? ranking.find(s => s.player.userId === state.currentUser.uid) : null;
    const myRank  = myEntry ? ranking.indexOf(myEntry) + 1 : null;
    let myRankHtml = '';
    if (state.currentUser) {
        if (myRank) {
            const myBadgeClass = myRank <= 3 ? `badge-${myRank}` : 'badge-other';
            myRankHtml = `<div style="display:flex;align-items:center;gap:14px;padding:14px 18px;background:rgba(0,217,54,0.06);border:1px solid rgba(0,217,54,0.2);border-radius:12px;margin-bottom:16px;flex-wrap:wrap">
                <span class="badge ${myBadgeClass}" style="font-size:1.1rem;padding:5px 13px">${myRank}</span>
                <div>
                    <div style="font-weight:800;font-size:1.05rem">${t('rankings.you.are')} <span style="color:var(--color-accent)">#${myRank}</span> ${t('rankings.in.ranking')}</div>
                    <div style="color:var(--color-text-secondary);font-size:0.82rem;margin-top:2px">${myEntry.points} ${t('rankings.pts')} · ${myEntry.finals} ${t('rankings.finals')} · ${myEntry.wins > 0 ? myEntry.wins + ' ' + t('rankings.wins') : t('rankings.not.in').split('—')[0].trim()}</div>
                </div>
            </div>`;
        } else {
            myRankHtml = `<div style="padding:10px 14px;background:rgba(255,255,255,0.03);border-radius:8px;font-size:0.85rem;color:var(--color-text-secondary);margin-bottom:16px">
                ${t('rankings.not.in')}
            </div>`;
        }
    }

    // Build evolution data — last 6 completed editions in the selected scope
    const last6 = doneEditions.slice(0, 6).reverse(); // oldest → newest
    const edResultMap = {};
    last6.forEach(e => { edResultMap[e.id] = {}; });
    finales.forEach(r => { if (edResultMap[r.editionId]) edResultMap[r.editionId][r.playerId] = r.position; });

    const showTrend = Object.keys(prevRankMap).length > 0;
    const trendHeader = showTrend ? '<th title="Évolution vs édition précédente">±</th>' : '';
    const evolHeader = last6.length > 1 ? `<th title="Positions sur les dernières éditions">${t('rankings.alltime')}</th>` : '';
    let html = championBannerHtml + myRankHtml + `<table><thead><tr><th>${t('rankings.col.pos')}</th><th>${t('rankings.col.player')}</th><th>${t('rankings.col.team')}</th><th>${t('rankings.col.pts')}</th><th>${t('rankings.col.editions')}</th><th>${t('rankings.col.wins')}</th><th>${t('rankings.col.podiums')}</th><th>${t('rankings.col.best')}</th>${trendHeader}${evolHeader}</tr></thead><tbody>`;
    ranking.forEach((s, i) => {
        const rank = i + 1;
        const badgeClass = rank <= 3 ? `badge-${rank}` : 'badge-other';
        const isMe = state.currentUser && s.player.userId === state.currentUser.uid;
        const rowStyle = isMe ? 'background:rgba(0,217,54,0.05);outline:1px solid rgba(0,217,54,0.12)' : '';

        let trendHtml = '';
        if (showTrend) {
            const prev = prevRankMap[s.player.id];
            if (prev === undefined) {
                trendHtml = `<td><span style="color:#60a5fa;font-size:0.7rem;font-weight:700">${t('rankings.new')}</span></td>`;
            } else {
                const delta = prev - rank;
                if (delta > 0)      trendHtml = `<td><span style="color:#4ade80;font-size:0.78rem;font-weight:700">▲${delta}</span></td>`;
                else if (delta < 0) trendHtml = `<td><span style="color:#f87171;font-size:0.78rem;font-weight:700">▼${Math.abs(delta)}</span></td>`;
                else                trendHtml = `<td><span style="color:rgba(255,255,255,0.2);font-size:0.78rem">—</span></td>`;
            }
        }

        let evolHtml = '';
        if (last6.length > 1) {
            const dots = last6.map(e => {
                const pos = edResultMap[e.id]?.[s.player.id];
                if (pos === undefined) return `<span style="color:rgba(255,255,255,0.12);font-size:0.72rem">·</span>`;
                const color = pos === 1 ? '#fbbf24' : pos === 2 ? '#94a3b8' : pos === 3 ? '#cd7c3a' : 'rgba(255,255,255,0.45)';
                return `<span style="color:${color};font-weight:700;font-size:0.72rem" title="${state.data.editions.find(ed=>ed.id===e.id)?.name||''}">P${pos}</span>`;
            }).join('<span style="color:rgba(255,255,255,0.1);margin:0 2px;font-size:0.7rem">›</span>');
            evolHtml = `<td><span style="display:flex;align-items:center;gap:2px;flex-wrap:nowrap">${dots}</span></td>`;
        }

        html += `<tr data-rank="${rank}" style="${rowStyle}">
            <td><span class="badge ${badgeClass}">${rank}</span></td>
            <td>
                <div style="display:inline-flex;align-items:center;gap:8px">
                    ${avatarHtml(s.player, { size: 28 })}
                    <strong class="player-name-link" onclick="openPlayerProfile('${s.player.id}')">${pName(s.player)}</strong>
                    ${playerTierPillHtml(s.player.id, state.data)}
                    ${window.playerBadgesHtml ? window.playerBadgesHtml(s.player.id) : ''}
                    ${isMe ? '<span style="color:var(--color-accent);font-size:0.78rem;margin-left:6px">← toi</span>' : ''}
                </div>
            </td>
            <td style="color:var(--color-text-secondary)">${s.player.team || '—'}</td>
            <td><strong style="color:var(--color-accent);font-size:1.05rem">${s.points}</strong></td>
            <td>${s.finals}</td>
            <td>${s.wins > 0 ? `🏆 ${s.wins}` : '—'}</td>
            <td>${s.podiums > 0 ? `🥇 ${s.podiums}` : '—'}</td>
            <td>${s.best === Infinity ? '—' : `P${s.best}`}</td>
            ${trendHtml}
            ${evolHtml}
        </tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
    updateChart(ranking.slice(0, 10));

    // Section "Système de points" — réutilise le même bloc que l'onglet Règles
    const explainContainer = document.getElementById('rankingsPointsExplain');
    if (explainContainer) explainContainer.innerHTML = pointsTableHtml();
}

// Chart
function updateChart(ranking) {
    const ctx = document.getElementById('rankingChart').getContext('2d');
    if (state.rankingChart) state.rankingChart.destroy();
    if (ranking.length === 0) return;

    state.rankingChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ranking.map(s => pName(s.player)),
            datasets: [{
                data: ranking.map(s => s.points),
                backgroundColor: ranking.map((_, i) =>
                    i === 0 ? 'rgba(251,191,36,0.85)' :
                    i === 1 ? 'rgba(148,163,184,0.85)' :
                    i === 2 ? 'rgba(180,83,9,0.85)' :
                    'rgba(56,189,248,0.65)'
                ),
                borderRadius: 6,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: '#94a3b8', font: { size: 11 } }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { size: 11 } }
                }
            }
        }
    });
}

// Stats
export function displayStats() {
    const quals = state.data.results.filter(r => r.phase === 'qualification').length;
    const finals = state.data.results.filter(r => r.phase === 'finale').length;
    const activePlayerIds = new Set(state.data.results.map(r => r.playerId));
    document.getElementById('totalParticipants').textContent = state.data.participants.filter(p => activePlayerIds.has(p.id)).length;
    const today = new Date(); today.setHours(0,0,0,0);
    document.getElementById('totalEditions').textContent = state.data.editions.filter(e => e.status === 'terminee' || new Date(e.date) < today).length;
    document.getElementById('totalQuals').textContent = quals;
    document.getElementById('totalFinals').textContent = finals;

    const container = document.getElementById('playerStats');
    const pastEdIds = new Set(state.data.editions.filter(e => new Date(e.date) < new Date() || e.status === 'terminee').map(e => e.id));
    const rows = state.data.participants.map(p => {
        const allRes = state.data.results.filter(r => r.playerId === p.id);
        const fRes = allRes.filter(r => r.phase === 'finale');
        if (allRes.length === 0) return null;
        const participEditions = new Set(allRes.filter(r => pastEdIds.has(r.editionId)).map(r => r.editionId)).size;
        return {
            p,
            quals: participEditions,
            finals: fRes.length,
            points: fRes.reduce((sum, r) => sum + getPoints(r.position), 0),
            wins: fRes.filter(r => r.position === 1).length,
            podiums: fRes.filter(r => r.position <= 3).length,
        };
    }).filter(Boolean).sort((a, b) => b.points - a.points);

    if (rows.length === 0) {
        container.innerHTML = `<div class="empty-state"><span class="empty-state-icon">📈</span><p>${t('stats.empty')}</p></div>`;
        return;
    }

    let html = `<table><thead><tr><th>${t('players.col.player')}</th><th>${t('stats.participations')}</th><th>${t('stats.finals')}</th><th>${t('players.col.pts')}</th><th>${t('stats.wins')}</th><th>${t('stats.podiums')}</th></tr></thead><tbody>`;
    rows.forEach(r => {
        html += `<tr>
            <td><div style="display:inline-flex;align-items:center;gap:8px">${avatarHtml(r.p, { size: 28 })}<strong class="player-name-link" onclick="openPlayerProfile('${r.p.id}')">${pName(r.p)}</strong>${playerTierPillHtml(r.p.id, state.data)}${window.playerBadgesHtml ? window.playerBadgesHtml(r.p.id) : ''}</div></td>
            <td>${r.quals}</td>
            <td>${r.finals}</td>
            <td><strong style="color:var(--color-accent)">${r.points}</strong></td>
            <td>${r.wins > 0 ? `🏆 ${r.wins}` : '—'}</td>
            <td>${r.podiums > 0 ? `🥇 ${r.podiums}` : '—'}</td>
        </tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;

    // ── Streaks & Records ──────────────────────────────────────────
    const streaksContainer = document.getElementById('streaksStats');
    const pastEditionsAsc = state.data.editions
        .filter(e => e.status === 'terminee' || new Date(e.date) < today)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    const pastEditionsDesc = [...pastEditionsAsc].reverse();

    const streakRows = state.data.participants.map(p => {
        const qRes = state.data.results.filter(r => r.playerId === p.id && r.phase === 'qualification');
        const fRes = state.data.results.filter(r => r.playerId === p.id && r.phase === 'finale');
        if (qRes.length === 0 && fRes.length === 0) return null;

        // Current participation streak
        let curPart = 0;
        for (const e of pastEditionsDesc) {
            if (qRes.some(r => r.editionId === e.id)) curPart++; else break;
        }
        // Best participation streak
        let bestPart = 0, tmp = 0;
        for (const e of pastEditionsAsc) {
            if (qRes.some(r => r.editionId === e.id)) { tmp++; bestPart = Math.max(bestPart, tmp); } else tmp = 0;
        }
        // Current finale streak
        let curFin = 0;
        for (const e of pastEditionsDesc) {
            if (fRes.some(r => r.editionId === e.id)) curFin++; else break;
        }
        // Max vies bonus in a single edition
        let maxVies = 0;
        pastEditionsAsc.forEach(e => {
            const v = qRes.filter(r => r.editionId === e.id).length - 1;
            if (v > maxVies) maxVies = v;
        });

        return { p, curPart, bestPart, curFin, maxVies };
    }).filter(Boolean).sort((a, b) => b.curPart - a.curPart || b.bestPart - a.bestPart);

    if (streakRows.length === 0) {
        streaksContainer.innerHTML = `<div class="empty-state"><span class="empty-state-icon">⚡</span><p>${t('stats.no.data')}</p></div>`;
        return;
    }

    // Record holders highlights
    const topCurPart  = streakRows.reduce((best, r) => r.curPart  > best.curPart  ? r : best);
    const topBestPart = streakRows.reduce((best, r) => r.bestPart > best.bestPart ? r : best);
    const topCurFin   = streakRows.reduce((best, r) => r.curFin   > best.curFin   ? r : best);
    const topVies     = streakRows.reduce((best, r) => r.maxVies  > best.maxVies  ? r : best);

    const recordCards = [
        topCurPart.curPart  > 0 ? { icon: '🔥', label: t('stats.current.streak'),   value: `${topCurPart.curPart} éd.`,   player: topCurPart.p  } : null,
        topBestPart.bestPart > 1 ? { icon: '📈', label: t('stats.best.streak'),       value: `${topBestPart.bestPart} éd.`, player: topBestPart.p } : null,
        topCurFin.curFin    > 0 ? { icon: '🏆', label: t('stats.consec.finals'),    value: `${topCurFin.curFin} éd.`,    player: topCurFin.p   } : null,
        topVies.maxVies     > 0 ? { icon: '❤️',  label: t('stats.max.lives'),         value: `×${topVies.maxVies}`,         player: topVies.p     } : null,
    ].filter(Boolean);

    let streakHtml = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-bottom:20px">
        ${recordCards.map(c => `<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px 14px">
            <div style="font-size:0.68rem;text-transform:uppercase;letter-spacing:1.5px;color:rgba(255,255,255,0.35);margin-bottom:6px">${c.icon} ${c.label}</div>
            <div style="font-size:1.25rem;font-weight:900;color:var(--color-accent)">${c.value}</div>
            <div class="player-name-link" onclick="openPlayerProfile('${c.player.id}')" style="font-size:0.82rem;margin-top:4px;color:rgba(255,255,255,0.7)">${pName(c.player)}</div>
        </div>`).join('')}
    </div>`;

    streakHtml += `<table><thead><tr><th>${t('players.col.player')}</th><th>${t('stats.current.streak')}</th><th>${t('stats.best.streak')}</th><th>${t('stats.consec.finals')}</th><th>${t('stats.max.lives')}</th></tr></thead><tbody>`;
    streakRows.forEach(r => {
        const isMe = state.currentUser && r.p.userId === state.currentUser.uid;
        const rowStyle = isMe ? 'background:rgba(0,217,54,0.05);outline:1px solid rgba(0,217,54,0.12)' : '';
        streakHtml += `<tr style="${rowStyle}">
            <td><div style="display:inline-flex;align-items:center;gap:8px">${avatarHtml(r.p, { size: 28 })}<strong class="player-name-link" onclick="openPlayerProfile('${r.p.id}')">${pName(r.p)}</strong>${playerTierPillHtml(r.p.id, state.data)}</div></td>
            <td>${r.curPart  > 0 ? `<span style="color:${r.curPart >= 3 ? '#f97316' : '#fff'};font-weight:700">${r.curPart >= 3 ? '🔥' : ''}${r.curPart}</span>` : '—'}</td>
            <td>${r.bestPart > 0 ? r.bestPart : '—'}</td>
            <td>${r.curFin   > 0 ? `<span style="color:#fbbf24;font-weight:700">${r.curFin}</span>` : '—'}</td>
            <td>${r.maxVies  > 0 ? `<span style="color:#f87171">×${r.maxVies}</span>` : '—'}</td>
        </tr>`;
    });
    streakHtml += '</tbody></table>';
    streaksContainer.innerHTML = streakHtml;
}

// ── SPRINGS RANK : classement global combiné (assiduité + perf + prédictions) ──
//
// Affiche tous les joueurs ayant un Springs Score > 0 avec leur tier,
// le score total et le breakdown détaillé (cups · finales · F1 · pred).
// Option saison : si saison sélectionnée, on filtre les résultats à cette saison.

function renderSpringsRankingTable(container) {
    // Filtrer les résultats à la saison sélectionnée si applicable
    const seasonEditionIds = state.selectedRankingSeason === 'all'
        ? null
        : new Set(state.data.editions
            .filter(e => (e.saison || new Date(e.date).getFullYear()) === state.selectedRankingSeason)
            .map(e => e.id));

    const filterByEd = (r) => seasonEditionIds === null || seasonEditionIds.has(r.editionId);
    const scopedResults = state.data.results.filter(filterByEd);
    const scopedPreds = state.data.predictions.filter(p => p.scored && filterByEd(p));

    // Pour chaque participant, calculer Springs Score + breakdown
    const rows = state.data.participants.map(p => {
        const myResults = scopedResults.filter(r => r.playerId === p.id);
        const cupsParticipated = new Set(myResults.filter(r => r.phase === 'inscription').map(r => r.editionId)).size;
        const finalesQualified = new Set(myResults.filter(r => r.phase === 'finale').map(r => r.editionId)).size;
        const f1Points = myResults.filter(r => r.phase === 'finale').reduce((s, r) => s + getPoints(r.position), 0);
        const myPreds = scopedPreds.filter(p2 => p2.playerId === p.id);
        const predPoints = myPreds.reduce((s, p2) => s + (p2.score || 0), 0);
        const score = Math.floor(cupsParticipated * 7 + finalesQualified * 15 + f1Points + predPoints * 0.5);
        return { player: p, score, cups: cupsParticipated, finales: finalesQualified, f1: f1Points, pred: predPoints };
    }).filter(r => r.score > 0).sort((a, b) => b.score - a.score);

    if (rows.length === 0) {
        container.innerHTML = `<div class="empty-state"><span class="empty-state-icon">💎</span><p>${t('rankings.springs.empty')}</p></div>`;
        return;
    }

    // Banner "ma position" Springs
    const myEntry = state.currentUser ? rows.find(r => r.player.userId === state.currentUser.uid) : null;
    const myRank = myEntry ? rows.indexOf(myEntry) + 1 : null;
    let myBannerHtml = '';
    if (state.currentUser && myEntry) {
        const tier = getSpringsTier(myEntry.score);
        const next = getNextSpringsTier(myEntry.score);
        const progressLine = next
            ? t('rankings.springs.next').replace('{n}', next.min - myEntry.score).replace('{tier}', `<b style="color:${next.color}">${next.icon} ${next.label}</b>`)
            : t('rankings.springs.max');
        myBannerHtml = `<div style="display:flex;align-items:center;gap:14px;padding:14px 18px;background:linear-gradient(90deg,rgba(0,217,54,0.08),rgba(0,217,54,0.02));border:1px solid rgba(0,217,54,0.22);border-radius:12px;margin-bottom:18px;flex-wrap:wrap">
            ${avatarHtml(myEntry.player, { size: 42 })}
            <div style="flex:1;min-width:0">
                <div style="font-weight:800;font-size:1rem">${t('rankings.springs.you.are')} <span style="color:var(--color-accent)">#${myRank}</span> · <b style="color:${tier.color}">${tier.icon} ${tier.label}</b></div>
                <div style="color:rgba(255,255,255,0.5);font-size:0.8rem;margin-top:2px">${t('rankings.springs.you.score').replace('{n}', myEntry.score)} — ${progressLine}</div>
            </div>
            ${tierBadgeHtml(tier, { size: 'lg', score: myEntry.score, tooltip: `${tier.label} · ${myEntry.score} pts Springs` })}
        </div>`;
    }

    // Top 3 banner (champions Springs)
    let podiumHtml = '';
    if (rows.length > 0) {
        const top3 = rows.slice(0, 3);
        const order = [top3[1], top3[0], top3[2]]; // 2-1-3 visuel
        const cls = ['silver', 'gold', 'bronze'];
        const medals = ['🥈', '🥇', '🥉'];
        podiumHtml = `<div style="display:grid;grid-template-columns:1fr 1.15fr 1fr;gap:14px;align-items:end;margin-bottom:22px;padding:22px 14px 14px;background:radial-gradient(ellipse at top,rgba(167,139,250,0.06),transparent 60%);border-radius:14px;border:1px solid rgba(167,139,250,0.15)">`;
        order.forEach((r, i) => {
            if (!r) { podiumHtml += '<div></div>'; return; }
            const tier = getSpringsTier(r.score);
            const isGold = cls[i] === 'gold';
            const isMe = state.currentUser && r.player.userId === state.currentUser.uid;
            podiumHtml += `<div style="background:linear-gradient(180deg, ${tier.color}22 0%, ${tier.color}05 100%);border:1.5px solid ${tier.color};border-radius:12px;padding:${isGold ? '18px 10px 20px' : '14px 10px 16px'};text-align:center;${isGold ? 'transform:translateY(-12px);box-shadow:0 8px 28px ' + tier.glow + ';' : ''}cursor:pointer" onclick="openPlayerProfile('${r.player.id}')">
                <div style="font-size:${isGold ? '2rem' : '1.5rem'};line-height:1;margin-bottom:8px">${medals[i]}</div>
                ${avatarHtml(r.player, { size: isGold ? 80 : 56, ringColor: tier.color })}
                <div style="font-weight:800;font-size:${isGold ? '1.05rem' : '0.92rem'};margin-top:8px;color:#f0f0f0">${pName(r.player)}${isMe ? ' <span style="color:var(--color-accent);font-size:0.7rem;display:block;margin-top:2px">← toi</span>' : ''}</div>
                <div style="margin-top:8px"><span class="tier-pill md tier-${tier.key}" style="--tier-color:${tier.color}">${tier.icon} ${tier.label}</span></div>
                <div style="margin-top:6px;font-size:${isGold ? '1.1rem' : '0.95rem'};font-weight:900;color:${tier.color}">${r.score} <span style="font-size:0.7em;font-weight:600;opacity:0.6">pts</span></div>
            </div>`;
        });
        podiumHtml += `</div>`;
    }

    // Tableau complet avec breakdown
    let html = myBannerHtml + podiumHtml + `<table>
        <thead><tr>
            <th>${t('rankings.col.pos')}</th>
            <th>${t('rankings.col.player')}</th>
            <th>${t('rankings.springs.col.tier')}</th>
            <th>${t('rankings.springs.col.score')}</th>
            <th title="Cups participées">${t('rankings.springs.col.cups')}</th>
            <th title="Qualifications finale">${t('rankings.springs.col.fin')}</th>
            <th title="Pts F1 cumulés en finale">${t('rankings.springs.col.f1')}</th>
            <th title="Pts prédictions cumulés (÷2 dans le calcul)">${t('rankings.springs.col.pred')}</th>
            <th>${t('rankings.col.team')}</th>
        </tr></thead>
        <tbody>`;
    rows.forEach((r, i) => {
        const rank = i + 1;
        const tier = getSpringsTier(r.score);
        const isMe = state.currentUser && r.player.userId === state.currentUser.uid;
        const rowStyle = isMe ? 'background:rgba(0,217,54,0.05);outline:1px solid rgba(0,217,54,0.12)' : '';
        const badgeClass = rank <= 3 ? `badge-${rank}` : 'badge-other';
        html += `<tr style="${rowStyle}">
            <td><span class="badge ${badgeClass}">${rank}</span></td>
            <td>
                <div style="display:inline-flex;align-items:center;gap:10px">
                    ${avatarHtml(r.player, { size: 28 })}
                    <strong class="player-name-link" onclick="openPlayerProfile('${r.player.id}')">${pName(r.player)}</strong>
                    ${isMe ? '<span style="color:var(--color-accent);font-size:0.78rem;margin-left:6px">← toi</span>' : ''}
                </div>
            </td>
            <td>${tierBadgeHtml(tier, { size: 'md', tooltip: `${tier.label} · ${r.score} pts Springs` })}</td>
            <td><strong style="color:${tier.color};font-size:1.05rem">${r.score}</strong></td>
            <td style="color:rgba(255,255,255,0.65)">${r.cups || '—'}</td>
            <td style="color:rgba(255,255,255,0.65)">${r.finales || '—'}</td>
            <td style="color:rgba(255,255,255,0.65)">${r.f1 || '—'}</td>
            <td style="color:rgba(255,255,255,0.65)">${r.pred || '—'}</td>
            <td style="color:var(--color-text-secondary)">${r.player.team || '—'}</td>
        </tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;

    // Note : on ne met pas à jour le chart ici (Mode Springs n'utilise pas le chart F1)
    if (state.rankingChart) { state.rankingChart.destroy(); state.rankingChart = null; }
    const chartCanvas = document.getElementById('rankingChart');
    if (chartCanvas) {
        const ctx = chartCanvas.getContext('2d');
        state.rankingChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: rows.slice(0, 10).map(r => pName(r.player)),
                datasets: [{
                    data: rows.slice(0, 10).map(r => r.score),
                    backgroundColor: rows.slice(0, 10).map(r => getSpringsTier(r.score).color + 'CC'),
                    borderRadius: 6,
                    borderSkipped: false,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#94a3b8', font: { size: 11 } } },
                    x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 11 } } }
                }
            }
        });
    }

    // Cacher le bloc "système de points F1" sur le mode Springs
    const explainContainer = document.getElementById('rankingsPointsExplain');
    if (explainContainer) explainContainer.innerHTML = '';
}

// Export CSV
window.exportCSV = () => {
    const finales = state.data.results.filter(r => r.phase === 'finale');
    if (finales.length === 0) { alert(t('export.no.finals')); return; }

    const stats = {};
    state.data.participants.forEach(p => { stats[p.id] = { ...p, points: 0, finals: 0, wins: 0, podiums: 0 }; });
    finales.forEach(r => {
        if (!stats[r.playerId]) return;
        stats[r.playerId].points += getPoints(r.position);
        stats[r.playerId].finals++;
        if (r.position === 1) stats[r.playerId].wins++;
        if (r.position <= 3) stats[r.playerId].podiums++;
    });

    const ranking = Object.values(stats).filter(s => s.finals > 0).sort((a, b) => b.points - a.points);
    const csv = [
        t('export.csv.header'),
        ...ranking.map((s, i) => `${i+1},"${pName(s)}","${s.team}",${s.points},${s.finals},${s.wins},${s.podiums}`)
    ].join('\n');

    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = `classement_${cupId}.csv`;
    a.click();
};
