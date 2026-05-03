// modules/display-hof.js — Hall of Fame

import { state } from './state.js';
import { t } from '../../shared/i18n.js';
import { pName, dateLang, getPoints, avatarHtml, playerTierPillHtml } from './utils.js';

export function displayHallOfFame() {
    const container = document.getElementById('hallofFameContent');
    if (!container) return;

    const finaleResults = state.data.results.filter(r => r.phase === 'finale');
    const editionsWithWinner = state.data.editions
        .filter(e => finaleResults.some(r => r.editionId === e.id && r.position === 1))
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    if (editionsWithWinner.length === 0) {
        container.innerHTML = `<div class="empty-state" style="margin-top:40px"><span class="empty-state-icon">🏅</span><p>${t('hof.empty')}</p></div>`;
        return;
    }

    // --- All-time player stats ---
    const playerStats = {};
    state.data.participants.forEach(p => {
        playerStats[p.id] = { player: p, wins: 0, podiums: 0, finals: 0, points: 0 };
    });
    finaleResults.forEach(r => {
        if (!playerStats[r.playerId]) return;
        playerStats[r.playerId].finals++;
        playerStats[r.playerId].points += getPoints(r.position);
        if (r.position === 1) playerStats[r.playerId].wins++;
        if (r.position <= 3) playerStats[r.playerId].podiums++;
    });
    const allStats = Object.values(playerStats).filter(s => s.finals > 0);

    // --- Top champions (by wins) ---
    const rankMedals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
    const topChampions = [...allStats].sort((a, b) => b.wins - a.wins || b.podiums - a.podiums).slice(0, 5).filter(c => c.wins > 0);
    const topHtml = topChampions.length > 0 ? `
        <div class="card" style="margin-bottom:20px">
            <h2>${t('hof.top.champs')}</h2>
            <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px">
                ${topChampions.map((c, i) => `
                    <div onclick="openPlayerProfile('${c.player.id}')" style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:rgba(255,255,255,0.03);border-radius:10px;border:1px solid rgba(255,255,255,0.06);cursor:pointer;transition:background 0.18s" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
                        <span style="font-size:1.4rem;width:30px;text-align:center;flex-shrink:0">${rankMedals[i]}</span>
                        ${avatarHtml(c.player, { size: 36 })}
                        <span style="font-weight:800;flex:1;display:inline-flex;align-items:center;gap:8px">${pName(c.player)} ${playerTierPillHtml(c.player.id, state.data)}</span>
                        <span style="font-size:0.78rem;color:rgba(255,255,255,0.3)">${c.player.team && c.player.team !== 'Sans équipe' ? c.player.team : ''}</span>
                        <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
                            <span class="hof-wins-badge">🏆 ${c.wins} ${t('hof.wins')}</span>
                            <span style="font-size:0.75rem;background:rgba(255,255,255,0.06);padding:3px 9px;border-radius:20px;color:rgba(255,255,255,0.5)">🎯 ${c.podiums} ${t('hof.podiums')}</span>
                            <span style="font-size:0.75rem;background:rgba(255,255,255,0.06);padding:3px 9px;border-radius:20px;color:rgba(255,255,255,0.5)">${c.points} ${t('hof.pts')}</span>
                        </div>
                    </div>`).join('')}
            </div>
        </div>` : '';

    // --- Records ---
    const mostFinals = [...allStats].sort((a, b) => b.finals - a.finals)[0];
    const mostPodiums = [...allStats].sort((a, b) => b.podiums - a.podiums)[0];
    const bestWinRate = [...allStats].filter(s => s.finals >= 3).sort((a, b) => (b.wins / b.finals) - (a.wins / a.finals))[0];
    const mostPoints = [...allStats].sort((a, b) => b.points - a.points)[0];
    const recordsHtml = `
        <div class="card" style="margin-bottom:20px">
            <h2>${t('hof.records')}</h2>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-top:16px">
                ${mostPoints ? `<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:14px 16px">
                    <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:1px;color:var(--color-text-secondary);margin-bottom:6px">${t('hof.most.pts')}</div>
                    <div style="font-weight:800;cursor:pointer" onclick="openPlayerProfile('${mostPoints.player.id}')">${pName(mostPoints.player)}</div>
                    <div style="color:var(--color-accent);font-size:1.1rem;font-weight:700;margin-top:2px">${mostPoints.points} ${t('hof.pts')}</div>
                </div>` : ''}
                ${mostFinals ? `<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:14px 16px">
                    <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:1px;color:var(--color-text-secondary);margin-bottom:6px">${t('hof.most.finals')}</div>
                    <div style="font-weight:800;cursor:pointer" onclick="openPlayerProfile('${mostFinals.player.id}')">${pName(mostFinals.player)}</div>
                    <div style="color:var(--color-accent);font-size:1.1rem;font-weight:700;margin-top:2px">${mostFinals.finals} ${t('hof.finals')}</div>
                </div>` : ''}
                ${mostPodiums ? `<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:14px 16px">
                    <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:1px;color:var(--color-text-secondary);margin-bottom:6px">${t('hof.most.podiums')}</div>
                    <div style="font-weight:800;cursor:pointer" onclick="openPlayerProfile('${mostPodiums.player.id}')">${pName(mostPodiums.player)}</div>
                    <div style="color:var(--color-accent);font-size:1.1rem;font-weight:700;margin-top:2px">${mostPodiums.podiums} ${t('hof.podiums')}</div>
                </div>` : ''}
                ${bestWinRate ? `<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:14px 16px">
                    <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:1px;color:var(--color-text-secondary);margin-bottom:6px">${t('hof.best.winrate')} <span style="opacity:0.5">${t('hof.winrate.min')}</span></div>
                    <div style="font-weight:800;cursor:pointer" onclick="openPlayerProfile('${bestWinRate.player.id}')">${pName(bestWinRate.player)}</div>
                    <div style="color:var(--color-accent);font-size:1.1rem;font-weight:700;margin-top:2px">${Math.round(bestWinRate.wins / bestWinRate.finals * 100)}%</div>
                </div>` : ''}
            </div>
        </div>`;

    // --- Champions par saison ---
    const seasons = [...new Set(editionsWithWinner.map(e => e.saison || new Date(e.date).getFullYear()))].sort((a, b) => b - a);
    const seasonChampionsHtml = seasons.length > 0 ? `
        <div class="card" style="margin-bottom:20px">
            <h2>${t('hof.seasons')}</h2>
            <div style="display:flex;flex-direction:column;gap:10px;margin-top:16px">
                ${seasons.map(year => {
                    const seasonEditions = editionsWithWinner.filter(e => (e.saison || new Date(e.date).getFullYear()) === year);
                    const seasonStats = {};
                    seasonEditions.forEach(e => {
                        finaleResults.filter(r => r.editionId === e.id).forEach(r => {
                            if (!seasonStats[r.playerId]) seasonStats[r.playerId] = { wins: 0, points: 0, podiums: 0 };
                            seasonStats[r.playerId].points += getPoints(r.position);
                            if (r.position === 1) seasonStats[r.playerId].wins++;
                            if (r.position <= 3) seasonStats[r.playerId].podiums++;
                        });
                    });
                    const sorted = Object.entries(seasonStats).sort((a, b) => b[1].points - a[1].points || b[1].wins - a[1].wins);
                    if (sorted.length === 0) return '';
                    const [champId, champData] = sorted[0];
                    const champ = state.data.participants.find(p => p.id === champId);
                    if (!champ) return '';
                    return `<div style="display:flex;align-items:center;gap:14px;padding:14px 18px;background:rgba(251,191,36,0.05);border:1px solid rgba(251,191,36,0.15);border-radius:12px">
                        <span style="font-size:1.8rem;flex-shrink:0">🏆</span>
                        ${avatarHtml(champ, { size: 44, ringColor: 'rgba(251,191,36,0.4)' })}
                        <div style="flex:1">
                            <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:1px;color:rgba(251,191,36,0.7);font-weight:700;margin-bottom:2px">${t('hof.season')} ${year}</div>
                            <div style="font-weight:800;font-size:1.05rem;cursor:pointer" onclick="openPlayerProfile('${champ.id}')">${pName(champ)}</div>
                            ${champ.team ? `<div style="font-size:0.78rem;color:var(--color-text-secondary)">${champ.team}</div>` : ''}
                        </div>
                        <div style="text-align:right">
                            <div style="font-size:0.78rem;color:rgba(255,255,255,0.4)">${seasonEditions.length} ${t('hof.editions')}</div>
                            <div style="font-weight:700;color:var(--color-accent)">${champData.points} ${t('hof.pts')}</div>
                            <div style="font-size:0.75rem;color:rgba(255,255,255,0.3)">${champData.wins} ${t('hof.wins')}</div>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>` : '';

    // --- Palmarès complet groupé par saison ---
    let palmaresBySeasonHtml = '';
    seasons.forEach(year => {
        const yearEditions = editionsWithWinner.filter(e => (e.saison || new Date(e.date).getFullYear()) === year);
        if (yearEditions.length === 0) return;
        const cardsHtml = yearEditions.map(e => {
            const win = finaleResults.find(r => r.editionId === e.id && r.position === 1);
            const player = win ? state.data.participants.find(p => p.id === win.playerId) : null;
            if (!player) return '';
            const p2 = finaleResults.find(r => r.editionId === e.id && r.position === 2);
            const p3 = finaleResults.find(r => r.editionId === e.id && r.position === 3);
            const player2 = p2 ? state.data.participants.find(p => p.id === p2.playerId) : null;
            const player3 = p3 ? state.data.participants.find(p => p.id === p3.playerId) : null;
            const dateStr = new Date(e.date).toLocaleDateString(dateLang(), { day: 'numeric', month: 'long' });
            return `<div class="hof-champion-card" onclick="showSection('editions');openEditionDetail('${e.id}')">
                <div class="hof-trophy">🏆</div>
                ${avatarHtml(player, { size: 40, ringColor: 'rgba(251,191,36,0.4)' })}
                <div class="hof-info">
                    <div class="hof-edition-name">${e.name}</div>
                    <div class="hof-winner-name">${pName(player)}</div>
                    ${player2 || player3 ? `<div style="font-size:0.72rem;color:rgba(255,255,255,0.35);margin-top:4px">${player2 ? '🥈 ' + pName(player2) : ''}${player2 && player3 ? ' · ' : ''}${player3 ? '🥉 ' + pName(player3) : ''}</div>` : ''}
                </div>
                <div class="hof-date">${dateStr}</div>
            </div>`;
        }).join('');
        palmaresBySeasonHtml += `<div style="margin-bottom:24px">
            <div style="font-size:0.82rem;text-transform:uppercase;letter-spacing:2px;color:var(--color-text-secondary);font-weight:700;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.06)">${t('hof.season')} ${year}</div>
            <div class="hof-champion-grid">${cardsHtml}</div>
        </div>`;
    });

    container.innerHTML = `
        ${seasonChampionsHtml}
        ${topHtml}
        ${recordsHtml}
        <div class="card">
            <h2>${t('hof.full')}</h2>
            ${palmaresBySeasonHtml || `<div class="empty-state"><span class="empty-state-icon">🏅</span><p>${t('hof.empty.palmares')}</p></div>`}
        </div>`;
}
