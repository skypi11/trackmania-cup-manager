// modules/display-duel.js — Comparaison head-to-head entre deux joueurs

import { state } from './state.js';
import { pName, getPoints } from './utils.js';
import { t } from '../../shared/i18n.js';
import { computePlayerStats, ACHIEVEMENTS } from './display-editions.js';

function buildPlayerData(playerId) {
    const allResults = state.data.results.filter(r => r.playerId === playerId);
    const qualRes    = allResults.filter(r => r.phase === 'qualification');
    const finaleRes  = allResults.filter(r => r.phase === 'finale').sort((a, b) => a.position - b.position);

    const participations = new Set(qualRes.map(r => r.editionId)).size;
    const points  = finaleRes.reduce((s, r) => s + getPoints(r.position), 0);
    const wins    = finaleRes.filter(r => r.position === 1).length;
    const podiums = finaleRes.filter(r => r.position <= 3).length;
    const bestRank = finaleRes.length > 0 ? Math.min(...finaleRes.map(r => r.position)) : null;
    const positions = finaleRes.map(r => r.position).filter(Boolean);
    const avgPos  = positions.length ? positions.reduce((a, b) => a + b, 0) / positions.length : null;
    const winRate = finaleRes.length > 0 ? Math.round(wins / finaleRes.length * 100) : null;

    const pastEditions = state.data.editions
        .filter(e => new Date(e.date) < new Date())
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    const pastDesc = [...pastEditions].reverse();

    let currentPartStreak = 0;
    for (const e of pastDesc) {
        if (qualRes.some(r => r.editionId === e.id)) currentPartStreak++;
        else break;
    }
    let bestPartStreak = 0;
    let tmp = 0;
    for (const e of pastEditions) {
        if (qualRes.some(r => r.editionId === e.id)) { tmp++; bestPartStreak = Math.max(bestPartStreak, tmp); }
        else tmp = 0;
    }
    let currentFinStreak = 0;
    for (const e of pastDesc) {
        if (finaleRes.some(r => r.editionId === e.id)) currentFinStreak++;
        else break;
    }
    let maxVies = 0;
    pastEditions.forEach(e => {
        const v = qualRes.filter(r => r.editionId === e.id).length - 1;
        if (v > maxVies) maxVies = v;
    });
    const bestEditionResult = finaleRes.length > 0
        ? finaleRes.reduce((best, r) => getPoints(r.position) > getPoints(best.position) ? r : best)
        : null;
    const bestEditionName = bestEditionResult
        ? (state.data.editions.find(e => e.id === bestEditionResult.editionId)?.name || '?')
        : null;

    return {
        qualRes, finaleRes, pastEditions,
        participations, points, wins, podiums, bestRank, avgPos, winRate,
        pStats: computePlayerStats(playerId),
        streaks: { currentPartStreak, bestPartStreak, currentFinStreak, maxVies, bestEditionResult, bestEditionName },
    };
}

function h2h(idA, idB) {
    const editionsA = new Set(state.data.results.filter(r => r.playerId === idA && r.phase === 'finale').map(r => r.editionId));
    const commonEditions = state.data.results
        .filter(r => r.playerId === idB && r.phase === 'finale' && editionsA.has(r.editionId))
        .map(r => r.editionId);
    let winsA = 0;
    let winsB = 0;
    const rows = [];
    for (const edId of commonEditions) {
        const rA = state.data.results.find(r => r.playerId === idA && r.editionId === edId && r.phase === 'finale');
        const rB = state.data.results.find(r => r.playerId === idB && r.editionId === edId && r.phase === 'finale');
        if (rA && rB) {
            if (rA.position < rB.position) winsA++;
            else if (rB.position < rA.position) winsB++;
            const ed = state.data.editions.find(e => e.id === edId);
            rows.push({ edName: ed?.name || edId, edDate: ed?.date || '', posA: rA.position, posB: rB.position });
        }
    }
    rows.sort((a, b) => new Date(b.edDate) - new Date(a.edDate));
    return { total: commonEditions.length, winsA, winsB, rows };
}

// ── Helpers layout miroir ──────────────────────────────────────────────────────

// Ligne de stat : valeur A (droite) | label (centre) | valeur B (gauche)
function statRow(label, valA, valB, higherIsBetter = true) {
    const numA = parseFloat(valA);
    const numB = parseFloat(valB);
    const tie  = numA === numB || (isNaN(numA) && isNaN(numB));
    const aWins = !tie && (higherIsBetter ? numA > numB : numA < numB);
    const bWins = !tie && (higherIsBetter ? numB > numA : numB < numA);
    const hlA = aWins ? 'color:var(--color-accent);font-weight:700' : 'color:var(--color-text-secondary)';
    const hlB = bWins ? 'color:var(--color-accent);font-weight:700' : 'color:var(--color-text-secondary)';
    return `<tr style="border-top:1px solid rgba(255,255,255,0.05)">
        <td style="text-align:right;padding:9px 16px;${hlA}">${valA}</td>
        <td style="text-align:center;padding:9px 8px;font-size:0.78rem;color:var(--color-text-secondary);white-space:nowrap">${label}</td>
        <td style="text-align:left;padding:9px 16px;${hlB}">${valB}</td>
    </tr>`;
}

// Card streak individuelle
function streakBox(val, label, colorStyle) {
    return `<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px 12px;text-align:center;flex:0 0 auto;min-width:68px;max-width:100px">
        <div style="font-size:1.3rem;font-weight:900;${colorStyle}">${val}</div>
        <div style="font-size:0.65rem;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:1px;margin-top:3px;line-height:1.3">${label}</div>
    </div>`;
}

// Colonne streaks — side: 'A' = flex-end + texte centré, 'B' = flex-start
function streakColHtml(s, side) {
    const justify = side === 'A' ? 'flex-end' : 'flex-start';
    const parts = [];
    if (s.currentPartStreak > 0) parts.push(streakBox(
        (s.currentPartStreak >= 3 ? '🔥' : '') + s.currentPartStreak,
        t('player.streak.current'),
        s.currentPartStreak >= 3 ? 'color:#f97316' : ''
    ));
    if (s.bestPartStreak > 1) parts.push(streakBox(s.bestPartStreak, t('player.streak.best'), ''));
    if (s.currentFinStreak > 0) parts.push(streakBox(s.currentFinStreak, t('player.consec.finals'), 'color:#fbbf24'));
    if (s.maxVies > 0) parts.push(streakBox(`❤️×${s.maxVies}`, t('player.max.lives'), 'color:#f87171'));
    if (s.bestEditionResult) parts.push(streakBox(`+${getPoints(s.bestEditionResult.position)}`, t('player.best.edition'), 'color:var(--color-accent)'));
    const ordered = side === 'A' ? [...parts].reverse() : parts;
    return ordered.length
        ? `<div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:${justify};width:100%">${ordered.join('')}</div>`
        : `<div style="color:rgba(255,255,255,0.2);font-size:0.82rem;padding:8px 0;text-align:${side === 'A' ? 'right' : 'left'}">${t('duel.no.streak')}</div>`;
}

// Colonne achievements — side: 'A' = row-reverse (icône côté centre), 'B' = normal
function achievementColHtml(pStats, side) {
    const rowDir = side === 'A' ? 'row-reverse' : 'row';
    const textAlign = side === 'A' ? 'right' : 'left';
    return ACHIEVEMENTS.map(a => {
        const ok = a.check(pStats);
        return `<div style="display:flex;flex-direction:${rowDir};align-items:center;gap:7px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
            <span style="font-size:1rem;flex-shrink:0;${ok ? '' : 'filter:grayscale(1);opacity:0.3'}">${a.icon}</span>
            <div style="flex:1;min-width:0;text-align:${textAlign}">
                <div style="font-size:0.78rem;color:${ok ? 'var(--color-text-primary)' : 'rgba(255,255,255,0.25)'};line-height:1.2">${a.name}</div>
                <div style="font-size:0.68rem;color:rgba(255,255,255,0.2);line-height:1.2">${a.desc}</div>
            </div>
            ${ok ? `<span style="font-size:0.7rem;color:var(--color-accent);flex-shrink:0">✓</span>` : ''}
        </div>`;
    }).join('');
}

// Section deux colonnes miroir avec titre centré
function mirrorSection(title, htmlA, htmlB) {
    return `<div class="card" style="margin-top:16px">
        <div style="font-size:0.72rem;font-weight:700;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.08em;text-align:center;margin-bottom:14px">${title}</div>
        <div style="display:grid;grid-template-columns:1fr 1px 1fr;gap:0">
            <div style="padding-right:16px">${htmlA}</div>
            <div style="background:rgba(255,255,255,0.07)"></div>
            <div style="padding-left:16px">${htmlB}</div>
        </div>
    </div>`;
}

// ── Export principal ───────────────────────────────────────────────────────────

export function displayDuel() {
    const container = document.getElementById('duelContent');
    if (!container) return;
    if (!('duelPlayerA' in state)) state.duelPlayerA = '';
    if (!('duelPlayerB' in state)) state.duelPlayerB = '';

    const players = [...state.data.participants].sort((a, b) => pName(a).localeCompare(pName(b)));
    const idA = state.duelPlayerA;
    const idB = state.duelPlayerB;

    const selectOpts = (selectedId) => players.map(p =>
        `<option value="${p.id}"${p.id === selectedId ? ' selected' : ''}>${pName(p)}</option>`
    ).join('');

    // ── Sélecteurs (layout versus) ────────────────────────────────────────
    const pA = players.find(p => p.id === idA);
    const pB = players.find(p => p.id === idB);
    const avatarA = pA ? pName(pA).charAt(0).toUpperCase() : '?';
    const avatarB = pB ? pName(pB).charAt(0).toUpperCase() : '?';
    const nameA   = pA ? pName(pA) : t('duel.player.a');
    const nameB   = pB ? pName(pB) : t('duel.player.b');

    const selectsHtml = `<div class="card">
        <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:center">
            <div style="text-align:right">
                <div style="display:inline-flex;width:52px;height:52px;border-radius:50%;background:var(--color-accent);align-items:center;justify-content:center;font-size:1.4rem;font-weight:900;color:#000;margin-bottom:6px">${avatarA}</div>
                <div style="font-size:0.95rem;font-weight:700;margin-bottom:8px;min-height:1.2em">${nameA}</div>
                <select onchange="setDuelPlayer('A',this.value)" style="width:100%;text-align:right">
                    <option value="">${t('duel.select.ph')}</option>
                    ${selectOpts(idA)}
                </select>
            </div>
            <div style="text-align:center;font-size:1.8rem;line-height:1;padding:0 8px">⚔️</div>
            <div style="text-align:left">
                <div style="display:inline-flex;width:52px;height:52px;border-radius:50%;background:var(--springs-purple);align-items:center;justify-content:center;font-size:1.4rem;font-weight:900;color:#fff;margin-bottom:6px">${avatarB}</div>
                <div style="font-size:0.95rem;font-weight:700;margin-bottom:8px;min-height:1.2em">${nameB}</div>
                <select onchange="setDuelPlayer('B',this.value)" style="width:100%">
                    <option value="">${t('duel.select.ph')}</option>
                    ${selectOpts(idB)}
                </select>
            </div>
        </div>
    </div>`;

    if (!idA || !idB || idA === idB) {
        const msg = idA && idB ? t('duel.select.diff') : t('duel.select.prompt');
        container.innerHTML = selectsHtml + `<div class="card" style="margin-top:16px;text-align:center;color:var(--color-text-secondary);padding:40px">
            <div style="font-size:2rem;margin-bottom:12px">⚔️</div><p>${msg}</p></div>`;
        return;
    }

    const dA = buildPlayerData(idA);
    const dB = buildPlayerData(idB);
    const duel = h2h(idA, idB);
    const fmt = (n, d = 0) => n != null ? n.toFixed(d) : '—';
    const medals = ['🥇', '🥈', '🥉'];

    // ── Tableau stats (miroir natif) ──────────────────────────────────────
    const statsHtml = `<div class="card" style="margin-top:16px;overflow:hidden">
        <table style="width:100%;border-collapse:collapse;table-layout:fixed">
            <colgroup><col style="width:45%"><col style="width:10%"><col style="width:45%"></colgroup>
            <thead><tr>
                <th style="text-align:right;padding:14px 16px;font-size:1.05rem;color:var(--color-accent);font-weight:700">
                    ${nameA}<br><span style="font-size:0.75rem;color:var(--color-text-secondary);font-weight:400">${pA?.team && pA.team !== 'Sans équipe' ? pA.team : '&nbsp;'}</span>
                </th>
                <th style="text-align:center;padding:14px 8px;font-size:0.72rem;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.08em;font-weight:600">${t('duel.stats')}</th>
                <th style="text-align:left;padding:14px 16px;font-size:1.05rem;color:var(--springs-purple);font-weight:700">
                    ${nameB}<br><span style="font-size:0.75rem;color:var(--color-text-secondary);font-weight:400">${pB?.team && pB.team !== 'Sans équipe' ? pB.team : '&nbsp;'}</span>
                </th>
            </tr></thead>
            <tbody>
                ${statRow(t('duel.total.points'), dA.points, dB.points)}
                ${statRow(t('stats.wins'), dA.wins, dB.wins)}
                ${statRow(t('stats.podiums'), dA.podiums, dB.podiums)}
                ${statRow(t('stats.finals'), dA.finaleRes.length, dB.finaleRes.length)}
                ${statRow(t('stats.participations'), dA.participations, dB.participations)}
                ${statRow(t('player.winrate'), dA.winRate != null ? `${dA.winRate}%` : '—', dB.winRate != null ? `${dB.winRate}%` : '—')}
                ${statRow(t('duel.best.rank'), dA.bestRank != null ? `P${dA.bestRank}` : '—', dB.bestRank != null ? `P${dB.bestRank}` : '—', false)}
                ${statRow(t('duel.avg.pos'), dA.avgPos != null ? `P${fmt(dA.avgPos, 1)}` : '—', dB.avgPos != null ? `P${fmt(dB.avgPos, 1)}` : '—', false)}
            </tbody>
        </table>
    </div>`;

    // ── Streaks (miroir) ──────────────────────────────────────────────────
    const streaksHtml = mirrorSection(
        t('player.streaks'),
        streakColHtml(dA.streaks, 'A'),
        streakColHtml(dB.streaks, 'B')
    );

    // ── Achievements (miroir) ─────────────────────────────────────────────
    const achievHtml = mirrorSection(
        t('duel.achievements'),
        achievementColHtml(dA.pStats, 'A'),
        achievementColHtml(dB.pStats, 'B')
    );

    // ── Graphique évolution ───────────────────────────────────────────────
    const hasChart = dA.finaleRes.length > 0 || dB.finaleRes.length > 0;
    const chartHtml = hasChart ? `<div class="card" style="margin-top:16px">
        <div style="font-size:0.72rem;font-weight:700;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.08em;text-align:center;margin-bottom:4px">${t('duel.evo')}</div>
        <div style="font-size:0.72rem;color:rgba(255,255,255,0.2);text-align:center;margin-bottom:12px">${t('duel.evo.note')}</div>
        <div style="position:relative;height:200px"><canvas id="duelChartCanvas"></canvas></div>
    </div>` : '';

    // ── Head-to-head ──────────────────────────────────────────────────────
    let h2hHtml;
    if (duel.total > 0) {
        const known = duel.winsA + duel.winsB;
        const pctA  = known ? Math.round(duel.winsA / known * 100) : 50;
        const tableRows = duel.rows.map(r => {
            const aAhead = r.posA < r.posB;
            return `<tr style="border-top:1px solid rgba(255,255,255,0.05)">
                <td style="text-align:right;padding:8px 12px;font-size:0.88rem;${aAhead ? 'color:var(--color-accent);font-weight:600' : 'color:var(--color-text-secondary)'}">${medals[r.posA - 1] || ''}P${r.posA}</td>
                <td style="text-align:center;padding:8px 8px;font-size:0.78rem;color:var(--color-text-secondary)">${r.edName}</td>
                <td style="text-align:left;padding:8px 12px;font-size:0.88rem;${aAhead ? 'color:var(--color-text-secondary)' : 'color:var(--springs-purple);font-weight:600'}">${medals[r.posB - 1] || ''}P${r.posB}</td>
            </tr>`;
        }).join('');
        h2hHtml = `<div class="card" style="margin-top:16px">
            <div style="font-size:0.72rem;font-weight:700;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.08em;text-align:center;margin-bottom:14px">
                Head-to-head · ${t('duel.h2h.common', { n: duel.total })}
            </div>
            <div style="display:flex;align-items:center;gap:14px;margin-bottom:10px">
                <span style="font-size:1.4rem;font-weight:800;color:var(--color-accent);min-width:36px;text-align:right">${duel.winsA}</span>
                <div style="flex:1;height:12px;border-radius:99px;overflow:hidden;background:rgba(255,255,255,0.08);display:flex">
                    <div style="width:${pctA}%;background:var(--color-accent);transition:width 0.5s ease"></div>
                    <div style="width:${100 - pctA}%;background:var(--springs-purple);transition:width 0.5s ease"></div>
                </div>
                <span style="font-size:1.4rem;font-weight:800;color:var(--springs-purple);min-width:36px">${duel.winsB}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:0.8rem;color:var(--color-text-secondary);margin-bottom:14px">
                <span>${nameA}</span><span>${nameB}</span>
            </div>
            <table style="width:100%;border-collapse:collapse">
                <thead><tr>
                    <th style="text-align:right;padding:6px 12px;font-size:0.75rem;color:var(--color-accent)">${nameA}</th>
                    <th style="text-align:center;padding:6px 8px;font-size:0.72rem;color:var(--color-text-secondary)">${t('duel.h2h.edition')}</th>
                    <th style="text-align:left;padding:6px 12px;font-size:0.75rem;color:var(--springs-purple)">${nameB}</th>
                </tr></thead>
                <tbody>${tableRows}</tbody>
            </table>
        </div>`;
    } else {
        h2hHtml = `<div class="card" style="margin-top:16px;text-align:center;color:var(--color-text-secondary);padding:28px">${t('duel.no.h2h')}</div>`;
    }

    container.innerHTML = selectsHtml + statsHtml + streaksHtml + achievHtml + chartHtml + h2hHtml;

    // ── Chart init (après injection DOM) ─────────────────────────────────
    if (hasChart) {
        const canvas = document.getElementById('duelChartCanvas');
        if (canvas) {
            if (state.duelChart) state.duelChart.destroy();
            const labels = dA.pastEditions.map(e => e.name);
            const dataA  = dA.pastEditions.map(e => { const r = dA.finaleRes.find(r => r.editionId === e.id); return r ? r.position : null; });
            const dataB  = dA.pastEditions.map(e => { const r = dB.finaleRes.find(r => r.editionId === e.id); return r ? r.position : null; });
            state.duelChart = new Chart(canvas.getContext('2d'), {
                type: 'line',
                data: {
                    labels,
                    datasets: [
                        {
                            label: nameA,
                            data: dataA,
                            borderColor: '#00D936',
                            backgroundColor: '#00D93618',
                            borderWidth: 2,
                            pointRadius: dataA.map(v => v !== null ? 5 : 0),
                            pointBackgroundColor: dataA.map(v => v === 1 ? '#fbbf24' : '#00D936'),
                            spanGaps: false,
                            tension: 0.3,
                        },
                        {
                            label: nameB,
                            data: dataB,
                            borderColor: '#7B2FBE',
                            backgroundColor: '#7B2FBE18',
                            borderWidth: 2,
                            pointRadius: dataB.map(v => v !== null ? 5 : 0),
                            pointBackgroundColor: dataB.map(v => v === 1 ? '#fbbf24' : '#7B2FBE'),
                            spanGaps: false,
                            tension: 0.3,
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            reverse: true,
                            min: 1,
                            ticks: { stepSize: 1, color: 'rgba(255,255,255,0.4)', font: { size: 11 } },
                            grid:  { color: 'rgba(255,255,255,0.06)' },
                        },
                        x: {
                            ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 }, maxRotation: 30 },
                            grid:  { color: 'rgba(255,255,255,0.06)' }
                        }
                    },
                    plugins: {
                        legend: { labels: { color: 'rgba(255,255,255,0.7)', font: { size: 11 }, boxWidth: 14 } }
                    }
                }
            });
        }
    }
}

window.setDuelPlayer = (which, id) => {
    if (which === 'A') state.duelPlayerA = id;
    else state.duelPlayerB = id;
    displayDuel();
};
