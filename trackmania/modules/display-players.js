// modules/display-players.js — Joueurs : liste, profil, cartes image

import { db } from '../../shared/firebase-config.js';
import { state } from './state.js';
import { t } from '../../shared/i18n.js';
import { pName, tTeam, getPoints, dateLang, buildCountryPicker, displayCountry } from './utils.js';
import { computePlayerStats, ACHIEVEMENTS, playerBadgesHtml } from './display-editions.js';
import { updateDoc, doc, addDoc, collection } from 'firebase/firestore';
import springsLogo from '../../assets/springs-logo.png';

const cupId = new URLSearchParams(window.location.search).get('cup') || 'monthly';
const CUP = cupId === 'mania'
    ? { name: 'Springs Mania Cup', color: '#FFB800', colorHover: '#ffc733', label: 'LAN' }
    : { name: 'Springs Monthly Cup', color: '#00D936', colorHover: '#00ff3f', label: t('msg.online') };

// ── Liste des participants ────────────────────────────────────────────────────

export function displayParticipants() {
    const container = document.getElementById('participantsList');
    const search = (document.getElementById('searchPlayers')?.value || '').toLowerCase();
    const filtered = state.data.participants
        .filter(p => pName(p).toLowerCase().includes(search))
        .sort((a, b) => pName(a).localeCompare(pName(b)));

    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state"><span class="empty-state-icon">👤</span><p>${t('players.empty')}</p></div>`;
        return;
    }

    const adminCol = state.isAdmin ? '<th></th>' : '';
    let html = `<table><thead><tr><th>${t('players.col.player')}</th><th>${t('players.col.team')}</th><th>Pays</th><th>${t('home.stat.participations')}</th><th>${t('stats.finals')}</th>${adminCol}</tr></thead><tbody>`;
    const pastEdIds = new Set(state.data.editions.filter(e => new Date(e.date) < new Date() || e.status === 'terminee').map(e => e.id));
    filtered.forEach(p => {
        const quals  = new Set(state.data.results.filter(r => r.playerId === p.id && pastEdIds.has(r.editionId)).map(r => r.editionId)).size;
        const finals = state.data.results.filter(r => r.playerId === p.id && r.phase === 'finale').length;
        const del = state.isAdmin ? `<td style="display:flex;gap:6px"><button class="btn btn-secondary btn-small" onclick="openEditParticipant('${p.id}')">✏️</button><button class="btn btn-danger btn-small" onclick="deleteParticipant('${p.id}')">🗑️</button></td>` : '';
        html += `<tr>
            <td><strong class="player-name-link" onclick="openPlayerProfile('${p.id}')">${pName(p)}</strong>${playerBadgesHtml(p.id)}</td>
            <td style="color:var(--color-text-secondary)">${tTeam(p.team)}</td>
            <td>${p.country ? displayCountry(p.country) : '<span style="color:var(--color-text-secondary)">—</span>'}</td>
            <td>${quals}</td>
            <td>${finals}</td>
            ${del}
        </tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}
window.displayParticipants = displayParticipants;

// ── Profil joueur ─────────────────────────────────────────────────────────────

window.openPlayerProfile = (playerId) => {
    const player = state.data.participants.find(p => p.id === playerId);
    if (!player) return;

    const inscRes   = state.data.results.filter(r => r.playerId === playerId && r.phase === 'inscription');
    const qualRes   = state.data.results.filter(r => r.playerId === playerId && r.phase === 'qualification');
    const finaleRes = state.data.results.filter(r => r.playerId === playerId && r.phase === 'finale').sort((a, b) => a.position - b.position);
    const points    = finaleRes.reduce((s, r) => s + getPoints(r.position), 0);
    const wins      = finaleRes.filter(r => r.position === 1).length;
    const podiums   = finaleRes.filter(r => r.position <= 3).length;
    const bestRank  = finaleRes.length > 0 ? Math.min(...finaleRes.map(r => r.position)) : null;

    const pastEditions = state.data.editions
        .filter(e => new Date(e.date) < new Date() || e.status === 'terminee')
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    const allRes = state.data.results.filter(r => r.playerId === playerId);
    const hasResult = e => allRes.some(r => r.editionId === e.id);

    const historyRows = pastEditions.map(e => {
        const participated = hasResult(e);
        const finale  = finaleRes.find(r => r.editionId === e.id);
        const inscrit = inscRes.some(r => r.editionId === e.id);
        if (!participated && !finale) return null;
        return { edition: e, participated, finale, inscrit };
    }).filter(Boolean);

    // ── Streaks & Records ──────────────────────────────────────────────────────
    const pastDesc = [...pastEditions].reverse();

    let currentPartStreak = 0;
    for (const e of pastDesc) {
        if (hasResult(e)) currentPartStreak++;
        else break;
    }
    let bestPartStreak = 0, tmpStreak = 0;
    for (const e of pastEditions) {
        if (hasResult(e)) { tmpStreak++; bestPartStreak = Math.max(bestPartStreak, tmpStreak); }
        else tmpStreak = 0;
    }
    let currentFinStreak = 0;
    for (const e of pastDesc) {
        if (finaleRes.some(r => r.editionId === e.id)) currentFinStreak++;
        else break;
    }
    let bestFinStreak = 0, tmpFinStreak = 0;
    for (const e of pastEditions) {
        if (finaleRes.some(r => r.editionId === e.id)) { tmpFinStreak++; bestFinStreak = Math.max(bestFinStreak, tmpFinStreak); }
        else tmpFinStreak = 0;
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

    const isOwnProfile = state.currentUser && player.userId === state.currentUser.uid;
    const avatar  = pName(player).charAt(0);
    const medals  = { 1: '🥇', 2: '🥈', 3: '🥉' };
    const pStats  = computePlayerStats(playerId);
    const avgPos  = finaleRes.length > 0
        ? (finaleRes.reduce((s, r) => s + r.position, 0) / finaleRes.length).toFixed(1)
        : null;
    const winRate = finaleRes.length > 0 ? Math.round(wins / finaleRes.length * 100) : null;

    const achievementGridHtml = ACHIEVEMENTS.map(a => {
        const ok = a.check(pStats);
        return `<div class="achievement-card ${ok ? 'unlocked' : 'locked'}">
            ${!ok ? '<span class="achievement-lock">🔒</span>' : ''}
            <div class="achievement-icon">${a.icon}</div>
            <div class="achievement-name">${t(`ach.${a.id}`)}</div>
            <div class="achievement-desc">${t(`ach.${a.id}.desc`)}</div>
        </div>`;
    }).join('');

    const unlockedAchievements = ACHIEVEMENTS.filter(a => a.check(pStats));
    const badgePreviewHtml = unlockedAchievements.length > 0
        ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:14px">${unlockedAchievements.slice(0, 4).map(a => `<span title="${t(`ach.${a.id}`)} — ${t(`ach.${a.id}.desc`)}" style="font-size:1.25rem;line-height:1;background:rgba(255,255,255,0.06);border-radius:8px;padding:5px 8px;border:1px solid rgba(255,255,255,0.1)">${a.icon}</span>`).join('')}${unlockedAchievements.length > 4 ? `<span style="font-size:0.75rem;color:var(--color-text-secondary);align-self:center;padding-left:4px">+${unlockedAchievements.length - 4}</span>` : ''}</div>`
        : '';

    let html = `
        <div class="player-card">
            <div style="display:flex;align-items:flex-start;gap:14px;position:relative;z-index:1">
                <div class="player-card-avatar">${avatar}</div>
                <div style="flex:1;min-width:0">
                    <div style="font-size:1.4rem;font-weight:900;letter-spacing:-0.5px;line-height:1.1">${pName(player)}</div>
                    <div style="font-size:0.82rem;color:var(--color-text-secondary);margin-top:3px">${tTeam(player.team)}</div>
                    ${wins > 0 ? `<span class="hof-wins-badge" style="display:inline-block;margin-top:7px">🏆 ${wins} ${t('hof.wins')}</span>` : ''}
                    ${badgePreviewHtml}
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
                    <button class="player-card-share-btn" onclick="copyPlayerCard('${playerId}', this)" title="Copier l'image — parfait pour Discord">${t('player.copy')}</button>
                    <button class="player-card-share-btn" style="font-size:0.72rem;padding:4px 10px;opacity:0.7" onclick="copyPlayerLink('${playerId}', this)">${t('player.link')}</button>
                </div>
            </div>
            <div class="player-card-stats" style="position:relative;z-index:1">
                <div class="player-card-stat"><div class="player-card-stat-value">${points}</div><div class="player-card-stat-label">${t('player.pts')}</div></div>
                <div class="player-card-stat"><div class="player-card-stat-value">${finaleRes.length}</div><div class="player-card-stat-label">${t('player.finals')}</div></div>
                <div class="player-card-stat"><div class="player-card-stat-value">${winRate !== null ? winRate + '%' : '—'}</div><div class="player-card-stat-label">${t('player.winrate')}</div></div>
                <div class="player-card-stat"><div class="player-card-stat-value">${avgPos !== null ? `P${avgPos}` : '—'}</div><div class="player-card-stat-label">${t('player.avg.pos')}</div></div>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:14px;position:relative;z-index:1">
                <span style="font-size:0.68rem;text-transform:uppercase;letter-spacing:1.5px;color:rgba(255,255,255,0.18);font-weight:700">${state.siteConfig.siteName}</span>
                <img src="${springsLogo}" style="height:18px;opacity:0.22">
            </div>
        </div>
        <div class="player-profile-stats" style="margin-bottom:20px">
            <div class="pp-stat"><div class="pp-stat-value">${new Set([...inscRes, ...qualRes, ...finaleRes].filter(r => pastEditions.some(e => e.id === r.editionId)).map(r => r.editionId)).size}</div><div class="pp-stat-label">${t('stats.participations')}</div></div>
            <div class="pp-stat"><div class="pp-stat-value">${finaleRes.length}</div><div class="pp-stat-label">${t('player.finals')}</div></div>
            <div class="pp-stat"><div class="pp-stat-value">${podiums > 0 ? podiums : '—'}</div><div class="pp-stat-label">${t('stats.podiums')}</div></div>
            <div class="pp-stat"><div class="pp-stat-value">${bestRank !== null ? `P${bestRank}` : '—'}</div><div class="pp-stat-label">${t('rankings.col.best')}</div></div>
        </div>
        ${(currentPartStreak > 0 || bestPartStreak > 0 || maxVies > 0 || bestEditionName) ? `
        <div class="phase-title" style="margin-top:0">${t('player.streaks')}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(138px,1fr));gap:10px;margin-bottom:20px">
            ${currentPartStreak > 0 ? `<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px 14px;text-align:center">
                <div style="font-size:1.6rem;font-weight:900;color:${currentPartStreak >= 3 ? '#f97316' : '#fff'}">${currentPartStreak >= 3 ? '🔥' : ''}${currentPartStreak}</div>
                <div style="font-size:0.7rem;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px;margin-top:3px">${t('player.streak.current')}</div>
            </div>` : ''}
            ${bestPartStreak > 1 ? `<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px 14px;text-align:center">
                <div style="font-size:1.6rem;font-weight:900">${bestPartStreak}</div>
                <div style="font-size:0.7rem;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px;margin-top:3px">${t('player.streak.best')}</div>
            </div>` : ''}
            ${currentFinStreak > 0 ? `<div style="background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.15);border-radius:10px;padding:12px 14px;text-align:center">
                <div style="font-size:1.6rem;font-weight:900;color:#fbbf24">${currentFinStreak}</div>
                <div style="font-size:0.7rem;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px;margin-top:3px">${t('player.consec.finals')}</div>
            </div>` : ''}
            ${maxVies > 0 ? `<div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);border-radius:10px;padding:12px 14px;text-align:center">
                <div style="font-size:1.6rem;font-weight:900;color:#f87171">❤️×${maxVies}</div>
                <div style="font-size:0.7rem;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px;margin-top:3px">${t('player.max.lives')}</div>
            </div>` : ''}
            ${bestEditionName ? `<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px 14px;text-align:center">
                <div style="font-size:1.6rem;font-weight:900;color:var(--color-accent)">+${getPoints(bestEditionResult.position)}</div>
                <div style="font-size:0.7rem;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px;margin-top:3px">${t('player.best.edition')}</div>
                <div style="font-size:0.72rem;color:rgba(255,255,255,0.25);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${bestEditionName}</div>
            </div>` : ''}
        </div>` : ''}
        <div class="phase-title" style="margin-top:0">${t('player.badges')}</div>
        <div class="achievement-grid">${achievementGridHtml}</div>`;

    if (historyRows.length > 0) {
        html += `<div class="phase-title" style="margin-top:0">${t('player.history')}</div>
            <table><thead><tr><th>${t('player.col.edition')}</th><th>${t('player.col.participation')}</th><th>${t('player.col.final')}</th><th>${t('player.col.points')}</th></tr></thead><tbody>`;
        historyRows.forEach(({ edition, participated, finale, inscrit }) => {
            const pos = finale ? `${medals[finale.position] || ''} P${finale.position}` : '—';
            const pts = finale ? `<span class="pts-badge">+${getPoints(finale.position)}</span>` : '—';
            let presenceHtml;
            if (participated) presenceHtml = `<span style="color:var(--color-accent)">${t('player.qualified')}</span>`;
            else if (inscrit)  presenceHtml = `<span style="color:rgba(255,255,255,0.35)">${t('player.present')}</span>`;
            else               presenceHtml = '—';
            html += `<tr>
                <td><strong>${edition.name}</strong></td>
                <td>${presenceHtml}</td>
                <td>${pos}</td>
                <td>${pts}</td>
            </tr>`;
        });
        html += '</tbody></table>';
    }

    if (finaleRes.length > 0) {
        html += `<div class="phase-title" style="margin-top:20px">${t('player.evo')}</div>
            <div class="player-chart-container"><canvas id="playerChartCanvas"></canvas></div>`;
    }

    if (isOwnProfile) {
        const discordHtml = player.discordId
            ? `<div class="discord-linked-badge">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
                    ${player.discordUsername}
                    <button onclick="unlinkDiscord('${player.id}')" style="background:none;border:none;color:rgba(255,255,255,0.3);cursor:pointer;font-size:0.8rem;padding:0 0 0 4px" title="Délier">✕</button>
                </div>`
            : `<button class="btn-discord" onclick="linkDiscord()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
                    ${t('discord.link')}
                </button>`;
        html += `<div class="phase-title" style="margin-top:24px">💬 Discord</div>
            <div style="margin-bottom:20px">${discordHtml}</div>`;
        html += `<div class="phase-title" style="margin-top:4px">${t('profile.edit')}</div>
            <form id="ownProfileEditForm">
                <div class="form-row">
                    <div class="form-group">
                        <label>${t('profile.pseudo.label')}</label>
                        <input type="text" id="ownProfilePseudo" required placeholder="${t('profile.ingame.ph')}">
                    </div>
                    <div class="form-group">
                        <label>${t('profile.team')}</label>
                        <input type="text" id="ownProfileTeam" placeholder="Sans équipe">
                    </div>
                </div>
                <div class="form-row" style="margin-top:12px">
                    <div class="form-group">
                        <label>${t('profile.tm.pseudo.label')}</label>
                        <input type="text" id="ownProfilePseudoTM" placeholder="${t('profile.tm.pseudo.ph')}">
                        <small style="color:var(--color-text-secondary);font-size:0.75rem">${t('profile.tm.pseudo.hint')}</small>
                    </div>
                    <div class="form-group">
                        <label>${t('profile.tm.login.label')}</label>
                        <input type="text" id="ownProfileLoginTM" placeholder="${t('profile.tm.login.ph')}">
                        <small style="color:var(--color-text-secondary);font-size:0.75rem">${t('profile.tm.login.hint')}</small>
                    </div>
                </div>
                <div class="form-row" style="margin-top:12px">
                    <div class="form-group">
                        <label>${t('profile.country.label')}</label>
                        <div id="ownProfileCountry_picker">${buildCountryPicker('ownProfileCountry')}</div>
                    </div>
                </div>
                <div id="ownProfileSaveMsg" style="display:none;font-size:0.85rem;padding:8px 12px;border-radius:6px;margin-bottom:10px"></div>
                <div style="display:flex;gap:10px;flex-wrap:wrap">
                    <button type="submit" class="btn btn-primary">${t('profile.save.btn')}</button>
                    <button type="button" class="btn btn-danger" onclick="playerSignOut()" style="margin-left:auto">${t('profile.logout')}</button>
                </div>
            </form>`;
    }

    document.getElementById('playerProfileContent').innerHTML = html;
    document.getElementById('playerProfileModal').classList.add('open');

    if (isOwnProfile) {
        document.getElementById('ownProfilePseudo').value   = player.pseudo || pName(player);
        document.getElementById('ownProfileTeam').value     = player.team === 'Sans équipe' ? '' : (player.team || '');
        document.getElementById('ownProfilePseudoTM').value = player.pseudoTM || '';
        document.getElementById('ownProfileLoginTM').value  = player.loginTM  || '';
        document.getElementById('ownProfileCountry_picker').innerHTML = buildCountryPicker('ownProfileCountry', player.country || '');
        document.getElementById('ownProfileEditForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const pseudo    = document.getElementById('ownProfilePseudo').value.trim();
            const team      = document.getElementById('ownProfileTeam').value.trim() || 'Sans équipe';
            const pseudoTM  = document.getElementById('ownProfilePseudoTM').value.trim();
            const loginTM   = document.getElementById('ownProfileLoginTM').value.trim();
            const country   = document.getElementById('ownProfileCountry').value.trim();
            const msg       = document.getElementById('ownProfileSaveMsg');
            if (!pseudo) return;
            try {
                await updateDoc(doc(db, 'participants', player.id), { pseudo, team, pseudoTM, loginTM, country });
                document.getElementById('playerBtn').textContent = `👤 ${pseudo}`;
                msg.style.display = 'block';
                msg.style.background = 'rgba(0,217,54,0.1)';
                msg.style.color = 'var(--color-accent)';
                msg.textContent = t('profile.saved');
                setTimeout(() => msg.style.display = 'none', 3000);
                window.reloadData?.();
            } catch(err) {
                console.error('Save profile error:', err);
                msg.style.display = 'block';
                msg.style.background = 'rgba(239,68,68,0.1)';
                msg.style.color = 'var(--color-danger)';
                msg.textContent = t('profile.error');
            }
        });
    }

    if (finaleRes.length > 0) {
        const chartLabels = pastEditions.map(e => e.name);
        const chartData   = pastEditions.map(e => {
            const r = finaleRes.find(r => r.editionId === e.id);
            return r ? r.position : null;
        });
        const pointColors = chartData.map(v => v === 1 ? '#fbbf24' : v !== null ? CUP.color : 'transparent');
        const ctx = document.getElementById('playerChartCanvas').getContext('2d');
        if (state.playerChart) state.playerChart.destroy();
        state.playerChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartLabels,
                datasets: [{
                    data: chartData,
                    borderColor: CUP.color,
                    backgroundColor: CUP.color + '20',
                    borderWidth: 2,
                    pointRadius: chartData.map(v => v !== null ? 5 : 0),
                    pointBackgroundColor: pointColors,
                    pointBorderColor: pointColors,
                    fill: false,
                    tension: 0.3,
                    spanGaps: false,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => ctx.raw !== null ? `P${ctx.raw}` : 'Non finaliste',
                        }
                    }
                },
                scales: {
                    y: {
                        reverse: true,
                        min: 1,
                        ticks: { stepSize: 1, callback: v => `P${v}`, color: '#94a3b8', font: { size: 11 } },
                        grid: { color: 'rgba(255,255,255,0.04)' }
                    },
                    x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 11 }, maxRotation: 30 } }
                }
            }
        });
    }
};

window.closePlayerProfile = () => {
    document.getElementById('playerProfileModal').classList.remove('open');
    if (state.playerChart) { state.playerChart.destroy(); state.playerChart = null; }
};

window.copyPlayerLink = (playerId, btn) => {
    const url = `${location.origin}${location.pathname}?cup=${cupId}&player=${playerId}`;
    navigator.clipboard.writeText(url).then(() => {
        if (btn) { const orig = btn.textContent; btn.textContent = t('player.copied'); setTimeout(() => btn.textContent = orig, 2000); }
    });
};

// ── Copie image carte joueur (Canvas) ─────────────────────────────────────────

window.copyPlayerCard = async (playerId, btn) => {
    const player = state.data.participants.find(p => p.id === playerId);
    if (!player) return;

    const pastEdIds = new Set(state.data.editions.filter(e => new Date(e.date) < new Date() || e.status === 'terminee').map(e => e.id));
    const allRes    = state.data.results.filter(r => r.playerId === playerId && pastEdIds.has(r.editionId));
    const finaleRes = allRes.filter(r => r.phase === 'finale');
    const points    = finaleRes.reduce((s, r) => s + getPoints(r.position), 0);
    const wins      = finaleRes.filter(r => r.position === 1).length;
    const podiums   = finaleRes.filter(r => r.position <= 3).length;
    const winRate   = finaleRes.length > 0 ? Math.round(wins / finaleRes.length * 100) : null;
    const pStats    = computePlayerStats(playerId);
    const unlockedBadges = ACHIEVEMENTS.filter(a => a.check(pStats));

    const logo = await new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = springsLogo;
    });

    const W = 620, H = 360;
    const canvas = document.createElement('canvas');
    canvas.width = W * 2; canvas.height = H * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);

    const ACCENT = CUP.color || '#00d936';
    const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", Arial';

    const roundRect = (x, y, w, h, r) => {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    };

    // Background
    ctx.fillStyle = '#0e0e0e';
    roundRect(0, 0, W, H, 16);
    ctx.fill();

    // Top-right radial glow
    const grd = ctx.createRadialGradient(W, 0, 0, W, 0, 300);
    grd.addColorStop(0, ACCENT + '22');
    grd.addColorStop(1, 'transparent');
    roundRect(0, 0, W, H, 16);
    ctx.fillStyle = grd;
    ctx.fill();

    // Border
    roundRect(0, 0, W, H, 16);
    ctx.strokeStyle = ACCENT + '88';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Bottom accent bar
    ctx.fillStyle = ACCENT;
    ctx.fillRect(0, H - 5, W, 5);

    // Cup label (top-left)
    ctx.fillStyle = ACCENT + 'cc';
    ctx.font = `bold 10px Arial`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(state.siteConfig.siteName.toUpperCase(), 24, 22);

    // Logo (top-right)
    if (logo) {
        const logoH = 24, logoW = logo.naturalWidth * (logoH / logo.naturalHeight);
        ctx.globalAlpha = 0.55;
        ctx.drawImage(logo, W - logoW - 20, 14, logoW, logoH);
        ctx.globalAlpha = 1;
    }

    // Avatar circle
    const aX = 66, aY = 118, aR = 46;
    const avatarGrad = ctx.createRadialGradient(aX - 10, aY - 10, 0, aX, aY, aR);
    avatarGrad.addColorStop(0, ACCENT);
    avatarGrad.addColorStop(1, '#ff8c00');
    ctx.beginPath();
    ctx.arc(aX, aY, aR, 0, Math.PI * 2);
    ctx.fillStyle = avatarGrad;
    ctx.fill();

    // Avatar glow
    ctx.shadowBlur = 20;
    ctx.shadowColor = ACCENT + '88';
    ctx.beginPath();
    ctx.arc(aX, aY, aR, 0, Math.PI * 2);
    ctx.strokeStyle = ACCENT + '66';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Avatar letter
    ctx.fillStyle = '#000';
    ctx.font = `bold 40px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pName(player).charAt(0).toUpperCase(), aX, aY);

    // Player name
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 26px Arial`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(pName(player), 132, 100);

    // Team
    ctx.fillStyle = '#64748b';
    ctx.font = `15px Arial`;
    ctx.fillText(tTeam(player.team), 132, 120);

    // Wins badge
    if (wins > 0) {
        const badgeTxt = `${wins} victoire${wins > 1 ? 's' : ''}`;
        ctx.font = `bold 12px Arial`;
        const bw = ctx.measureText(badgeTxt).width + 28;
        roundRect(132, 128, bw, 22, 11);
        ctx.fillStyle = 'rgba(251,191,36,0.14)';
        ctx.fill();
        roundRect(132, 128, bw, 22, 11);
        ctx.strokeStyle = 'rgba(251,191,36,0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#fbbf24';
        ctx.font = `bold 12px ${EMOJI_FONT}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('🏆 ' + badgeTxt, 142, 139);
    }

    // Unlocked badges row
    if (unlockedBadges.length > 0) {
        const badgeY = wins > 0 ? 177 : 148;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        unlockedBadges.slice(0, 6).forEach((b, i) => {
            const bx = 132 + i * 34;
            ctx.fillStyle = 'rgba(255,255,255,0.07)';
            roundRect(bx, badgeY - 14, 28, 28, 7);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.12)';
            ctx.lineWidth = 0.8;
            roundRect(bx, badgeY - 14, 28, 28, 7);
            ctx.stroke();
            ctx.font = `20px ${EMOJI_FONT}`;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(b.icon, bx + 14, badgeY + 1);
        });
        if (unlockedBadges.length > 6) {
            ctx.font = `11px Arial`;
            ctx.fillStyle = '#64748b';
            ctx.textAlign = 'left';
            ctx.fillText(`+${unlockedBadges.length - 6}`, 132 + 6 * 34 + 4, badgeY + 2);
        }
    }

    // Divider
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, 242);
    ctx.lineTo(W - 20, 242);
    ctx.stroke();

    // Stats row
    const statsData = [
        { label: 'PARTICIPATIONS', value: String(new Set(allRes.map(r => r.editionId)).size) },
        { label: 'FINALES',        value: String(finaleRes.length) },
        { label: 'POINTS',         value: String(points) },
        { label: 'VICTOIRES',      value: String(wins) },
        { label: 'PODIUMS',        value: String(podiums) },
        { label: 'WIN RATE',       value: winRate !== null ? winRate + '%' : '—' },
    ];
    const statW = W / statsData.length;
    statsData.forEach((s, i) => {
        const x = i * statW + statW / 2;
        ctx.fillStyle = ACCENT;
        ctx.font = `bold 21px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(s.value, x, 282);
        if (i < statsData.length - 1) {
            ctx.strokeStyle = 'rgba(255,255,255,0.07)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo((i + 1) * statW, 254);
            ctx.lineTo((i + 1) * statW, 298);
            ctx.stroke();
        }
        ctx.fillStyle = '#64748b';
        ctx.font = `9px Arial`;
        ctx.fillText(s.label, x, 297);
    });

    // Footer
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = `10px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Springs E-Sport', W / 2, H - 16);

    canvas.toBlob(async blob => {
        const orig = btn ? btn.textContent : '';
        try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            if (btn) { btn.textContent = t('msg.saved'); setTimeout(() => btn.textContent = orig, 2500); }
        } catch {
            const a = document.createElement('a');
            a.href = canvas.toDataURL('image/png');
            a.download = `${pName(player).replace(/\s+/g, '_')}_springs.png`;
            a.click();
            if (btn) { btn.textContent = t('player.downloaded'); setTimeout(() => btn.textContent = orig, 2500); }
        }
    }, 'image/png');
};

// ── Copie image podium (Canvas) ───────────────────────────────────────────────

window.copyPodium = async (editionId, btn) => {
    const edition = state.data.editions.find(e => e.id === editionId);
    if (!edition) return;
    const finaleResults = state.data.results.filter(r => r.editionId === editionId && r.phase === 'finale').sort((a, b) => a.position - b.position);
    if (finaleResults.length === 0) return;

    const logo = await new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = springsLogo;
    });

    const W = 680, H = 400;
    const canvas = document.createElement('canvas');
    canvas.width = W * 2; canvas.height = H * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);

    const ACCENT = CUP.color || '#00d936';
    const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", Arial';

    const roundRect = (x, y, w, h, r) => {
        ctx.beginPath();
        ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    };

    // Background
    ctx.fillStyle = '#0e0e0e';
    roundRect(0, 0, W, H, 16); ctx.fill();

    // Radial glow centre
    const grd = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 280);
    grd.addColorStop(0, ACCENT + '18');
    grd.addColorStop(1, 'transparent');
    roundRect(0, 0, W, H, 16);
    ctx.fillStyle = grd; ctx.fill();

    // Border + bottom bar
    roundRect(0, 0, W, H, 16);
    ctx.strokeStyle = ACCENT + '77'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = ACCENT;
    ctx.fillRect(0, H - 5, W, 5);

    // Logo top-right
    if (logo) {
        const lh = 22, lw = logo.naturalWidth * (lh / logo.naturalHeight);
        ctx.globalAlpha = 0.5;
        ctx.drawImage(logo, W - lw - 20, 16, lw, lh);
        ctx.globalAlpha = 1;
    }

    // Cup label top-left
    ctx.fillStyle = ACCENT + 'cc';
    ctx.font = `bold 10px Arial`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(state.siteConfig.siteName.toUpperCase(), 24, 20);

    // Edition name
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 22px Arial`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(edition.name, W / 2, 60);

    // Date
    const dateStr = new Date(edition.date).toLocaleDateString(dateLang(), { day: 'numeric', month: 'long', year: 'numeric' });
    ctx.fillStyle = '#64748b';
    ctx.font = `13px Arial`;
    ctx.fillText(dateStr, W / 2, 78);

    // Podium blocks: order 2, 1, 3
    const podiumOrder   = [2, 1, 3];
    const podiumHeights = { 1: 110, 2: 80, 3: 60 };
    const podiumColors  = { 1: 'rgba(251,191,36,0.18)', 2: 'rgba(148,163,184,0.14)', 3: 'rgba(180,83,9,0.14)' };
    const podiumBorders = { 1: 'rgba(251,191,36,0.55)', 2: 'rgba(148,163,184,0.4)',  3: 'rgba(180,83,9,0.45)' };
    const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
    const blockW = 180, gap = 14;
    const totalW = blockW * 3 + gap * 2;
    const startX = (W - totalW) / 2;
    const baseY  = H - 55;

    podiumOrder.forEach((pos, i) => {
        const result = finaleResults.find(r => r.position === pos);
        const player = result ? state.data.participants.find(p => p.id === result.playerId) : null;
        const bh = podiumHeights[pos];
        const x  = startX + i * (blockW + gap);
        const y  = baseY - bh;

        roundRect(x, y, blockW, bh, 10);
        ctx.fillStyle = podiumColors[pos]; ctx.fill();
        roundRect(x, y, blockW, bh, 10);
        ctx.strokeStyle = podiumBorders[pos]; ctx.lineWidth = 1.2; ctx.stroke();

        ctx.fillStyle = pos === 1 ? '#fbbf24' : pos === 2 ? '#94a3b8' : '#b45309';
        ctx.font = `bold 28px Arial`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(pos), x + blockW / 2, y + bh / 2 + 8);

        if (!player) return;

        ctx.font = `26px ${EMOJI_FONT}`;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(medals[pos], x + blockW / 2, y - 30);

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 15px Arial`;
        ctx.textBaseline = 'alphabetic';
        let name = pName(player);
        while (ctx.measureText(name).width > blockW - 10 && name.length > 1) name = name.slice(0, -1);
        if (name !== pName(player)) name += '…';
        ctx.fillText(name, x + blockW / 2, y - 56);

        ctx.fillStyle = '#64748b';
        ctx.font = `11px Arial`;
        let team = player.team || '';
        while (ctx.measureText(team).width > blockW - 10 && team.length > 1) team = team.slice(0, -1);
        if (team !== (player.team || '')) team += '…';
        ctx.fillText(team, x + blockW / 2, y - 40);

        if (result) {
            const pts = getPoints(result.position);
            ctx.fillStyle = ACCENT;
            ctx.font = `bold 12px Arial`;
            ctx.fillText(`+${pts} pts`, x + blockW / 2, y + bh - 8);
        }
    });

    // Footer
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.font = `10px Arial`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('Springs E-Sport', W / 2, H - 14);

    canvas.toBlob(async blob => {
        const orig = btn ? btn.textContent : '';
        try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            if (btn) { btn.textContent = t('msg.saved'); setTimeout(() => btn.textContent = orig, 2500); }
        } catch {
            const a = document.createElement('a');
            a.href = canvas.toDataURL('image/png');
            a.download = `podium_${edition.name.replace(/\s+/g, '_')}.png`;
            a.click();
            if (btn) { btn.textContent = t('player.downloaded'); setTimeout(() => btn.textContent = orig, 2500); }
        }
    }, 'image/png');
};
