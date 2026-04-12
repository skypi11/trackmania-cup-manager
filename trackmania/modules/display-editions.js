// modules/display-editions.js — Éditions : liste, détail, inscriptions

import { db } from '../../shared/firebase-config.js';
import { state } from './state.js';
import { t } from '../../shared/i18n.js';
import { dateLang, pName, tTeam, getPoints, getCountdown, showToast, parseMarkdown } from './utils.js';
import { collection, addDoc, deleteDoc, updateDoc, doc, arrayUnion } from 'firebase/firestore';
import { notifyDiscordInscription } from './discord.js';

const cupId = new URLSearchParams(window.location.search).get('cup') || 'monthly';

// ── Filtres / tri ──────────────────────────────────────────────────────────────

window.setEditionFilter = (f) => {
    state.editionFilter = f;
    document.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter === f));
    displayEditions();
};

window.setEditionSort = (s) => {
    state.editionSort = s;
    document.querySelectorAll('[data-sort]').forEach(b => b.classList.toggle('active', b.dataset.sort === s));
    displayEditions();
};

window.setEditionStatus = async (id, status) => {
    await updateDoc(doc(db, 'editions', id), {
        status,
        statusHistory: arrayUnion({ status, at: new Date().toISOString() })
    });
    window.reloadData?.();
};

window.goToEdition = (id) => {
    window.showSection('editions');
    window.openEditionDetail(id);
};

// ── Système d'achievements ────────────────────────────────────────────────────

export const ACHIEVEMENTS = [
    // ── Compétition ───────────────────────────────────────────────────────
    { id: 'rookie',          icon: '🌱', check: s => s.participations >= 1 },
    { id: 'regulier',        icon: '⭐', check: s => s.participations >= 5 },
    { id: 'veteran',         icon: '💪', check: s => s.participations >= 10 },
    // NOTE: participations = éditions distinctes avec au moins un résultat (inscription, qualification ou finale)
    { id: 'assidu',          icon: '📅', check: s => s.allEditions },
    { id: 'finaliste',       icon: '🎯', check: s => s.finals >= 1 },
    { id: 'podium',          icon: '🥉', check: s => s.podiums >= 1 },
    { id: 'habitue',         icon: '🎪', check: s => s.podiums >= 3 },
    { id: 'inarretable',     icon: '⚡', check: s => s.podiums >= 5 },
    { id: 'champion',        icon: '🏆', check: s => s.wins >= 1 },
    { id: 'patron',          icon: '👑', check: s => s.wins >= 3 },
    { id: 'en_feu',          icon: '🔥', check: s => s.maxConsecWins >= 2 },
    { id: 'perfectionniste', icon: '💎', check: s => s.finals >= 3 && s.alwaysTop5 },
    // ── Prédictions ───────────────────────────────────────────────────────
    { id: 'pred_debutant',   icon: '🔮', check: s => s.predCount >= 1 },
    { id: 'pred_instinct',   icon: '🎱', check: s => s.predBestScore >= 1 },
    { id: 'pred_voyant',     icon: '🌟', check: s => s.predTop3Hits >= 1 },
    { id: 'pred_oracle',     icon: '🔭', check: s => s.predWins >= 1 },
    { id: 'pred_fidele',     icon: '🧿', check: s => s.predCount >= 5 },
    { id: 'pred_medium',     icon: '💫', check: s => s.predBestScore >= 10 },
];

export function computePlayerStats(playerId) {
    const inscriptions = state.data.results.filter(r => r.playerId === playerId && r.phase === 'inscription');
    const quals   = state.data.results.filter(r => r.playerId === playerId && r.phase === 'qualification');
    const finales = state.data.results.filter(r => r.playerId === playerId && r.phase === 'finale');

    const allPlayerResults = state.data.results.filter(r => r.playerId === playerId);

    const pastEditions = state.data.editions
        .filter(e => new Date(e.date) < new Date() || e.status === 'terminee')
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    const pastEditionIds = new Set(pastEditions.map(e => e.id));
    const participations = new Set(allPlayerResults.filter(r => pastEditionIds.has(r.editionId)).map(r => r.editionId)).size;

    const allEditions = pastEditions.length > 0 &&
        pastEditions.every(e => allPlayerResults.some(r => r.editionId === e.id));

    // Debug temporaire — à retirer après vérification
    if (participations === 0 && allPlayerResults.length > 0) {
        console.warn(`[achievements] ${playerId}: ${allPlayerResults.length} résultats mais 0 participations passées. Éditions passées:`, pastEditions.map(e => e.id), 'Résultats editionIds:', [...new Set(allPlayerResults.map(r => r.editionId))]);
    }

    let maxConsecWins = 0, cur = 0;
    pastEditions.forEach(e => {
        const f = finales.find(r => r.editionId === e.id);
        if (f && f.position === 1) { cur++; maxConsecWins = Math.max(maxConsecWins, cur); }
        else cur = 0;
    });

    const alwaysTop5 = finales.length >= 3 && finales.every(r => r.position <= 5);

    // ── Stats prédictions ─────────────────────────────────────────────────
    const allMyPreds  = state.data.predictions.filter(p => p.playerId === playerId);
    const scoredPreds = allMyPreds.filter(p => p.scored);
    const predCount   = allMyPreds.length;
    const predBestScore = scoredPreds.length > 0 ? Math.max(...scoredPreds.map(p => p.score || 0)) : 0;

    let predTop3Hits = 0;
    scoredPreds.forEach(pred => {
        const edFinale = state.data.results.filter(r => r.editionId === pred.editionId && r.phase === 'finale');
        const realTop3 = [1,2,3].map(pos => edFinale.find(r => r.position === pos)?.playerId ?? null);
        (pred.top3 || []).forEach((pid, i) => { if (pid && pid === realTop3[i]) predTop3Hits++; });
    });

    let predWins = 0;
    [...new Set(scoredPreds.map(p => p.editionId))].forEach(edId => {
        const edPreds = state.data.predictions.filter(p => p.editionId === edId && p.scored);
        if (edPreds.length === 0) return;
        const maxScore = Math.max(...edPreds.map(p => p.score || 0));
        const myScore  = scoredPreds.find(p => p.editionId === edId)?.score || 0;
        if (myScore > 0 && myScore === maxScore) predWins++;
    });

    return {
        participations,
        quals:          new Set(quals.map(r => r.editionId)).size,
        finals:         finales.length,
        wins:           finales.filter(r => r.position === 1).length,
        podiums:        finales.filter(r => r.position <= 3).length,
        allEditions,
        maxConsecWins,
        alwaysTop5,
        predCount,
        predBestScore,
        predTop3Hits,
        predWins,
    };
}

export function playerBadgesHtml(playerId) {
    const stats    = computePlayerStats(playerId);
    const unlocked = ACHIEVEMENTS.filter(a => a.check(stats));
    if (unlocked.length === 0) return '';
    const icons = unlocked.map(a => `<span title="${t(`ach.${a.id}`)} : ${t(`ach.${a.id}.desc`)}">${a.icon}</span>`).join('');
    return `<span class="player-badges">${icons}</span>`;
}
window.playerBadgesHtml = playerBadgesHtml;

// ── Liste des éditions ────────────────────────────────────────────────────────

export function displayEditions() {
    const grid = document.getElementById('editionsList');
    const today = new Date(); today.setHours(0, 0, 0, 0);

    if (state.currentDetailEditionId) {
        window.openEditionDetail(state.currentDetailEditionId);
    }

    if (state.data.editions.length === 0) {
        grid.innerHTML = `<div class="empty-state"><span class="empty-state-icon">📅</span><p>${t('editions.empty')}</p></div>`;
        return;
    }

    const sortFn = state.editionSort === 'asc'
        ? (a, b) => new Date(a.date) - new Date(b.date)
        : (a, b) => new Date(b.date) - new Date(a.date);
    const sorted   = [...state.data.editions].sort(sortFn);
    const allUpcoming = sorted.filter(e => new Date(e.date) >= today && e.status !== 'terminee');
    const allPast     = sorted.filter(e => new Date(e.date) <  today || e.status === 'terminee');

    const upcoming = state.editionFilter === 'past'     ? [] : allUpcoming;
    const past     = state.editionFilter === 'upcoming' ? [] : allPast;

    const filterBar = document.getElementById('editionFilters');
    if (filterBar) filterBar.style.display = state.currentDetailEditionId ? 'none' : '';

    const currentPlayer = state.currentUser ? state.data.participants.find(p => p.userId === state.currentUser.uid) : null;

    const WORKFLOW_LABELS = {
        fermee:       t('editions.status.closed'),
        inscriptions: t('editions.status.open'),
        en_cours:     t('editions.status.live'),
        terminee:     t('editions.status.done'),
    };

    const renderEditionRow = (e, isPast) => {
        let cardClass = isPast ? 'past-event' : 'upcoming';
        if (!isPast && e.status === 'fermee')   cardClass = 'fermee upcoming';
        if (!isPast && e.status === 'en_cours') cardClass = 'en-cours';

        const statusLabel = isPast
            ? t('editions.status.done')
            : (WORKFLOW_LABELS[e.status] || t('editions.status.open'));

        const dateStr = new Date(e.date).toLocaleDateString(dateLang(), { day: 'numeric', month: 'long', year: 'numeric' });
        const cardTime = e.time ? ` · ${e.time}` : '';

        let playerBadgeHtml = '';
        if (currentPlayer) {
            const isFinaliste = state.data.results.some(r => r.editionId === e.id && r.playerId === currentPlayer.id && r.phase === 'finale');
            const isQualified = state.data.results.some(r => r.editionId === e.id && r.playerId === currentPlayer.id && r.phase === 'qualification');
            const isInscrit   = state.data.results.some(r => r.editionId === e.id && r.playerId === currentPlayer.id && r.phase === 'inscription');
            if (isFinaliste)      playerBadgeHtml = `<div class="edition-card-player-badge finalist">${t('editions.finalist')}</div>`;
            else if (isQualified) playerBadgeHtml = `<div class="edition-card-player-badge qualified">${t('editions.participated')}</div>`;
            else if (isInscrit)   playerBadgeHtml = `<div class="edition-card-player-badge">${t('editions.registered')}</div>`;
        }

        const participantCount = isPast
            ? state.data.results.filter(r => r.editionId === e.id && r.phase === 'qualification').length
            : state.data.results.filter(r => r.editionId === e.id && r.phase === 'inscription').length;
        const finals = state.data.results.filter(r => r.editionId === e.id && r.phase === 'finale').length;

        const descHtml = e.description ? `<div class="event-row-desc">${parseMarkdown(e.description)}</div>` : '';
        const liveBadgeHtml = (!isPast && e.status === 'en_cours')
            ? `<span class="event-row-live"><span class="live-dot"></span>LIVE</span>`
            : '';

        return `<div class="event-row ${cardClass}" onclick="openEditionDetail('${e.id}')">
            <div class="event-row-accent"></div>
            <div class="event-row-body">
                <div class="event-row-left">
                    <div class="event-row-status">${statusLabel}</div>
                    <div class="event-row-name">${e.name}</div>
                    <div class="event-row-meta">
                        <span>📅 ${dateStr}${cardTime}</span>
                        <span>👥 ${participantCount} ${t('editions.participants')}</span>
                        ${isPast ? `<span>🏆 ${finals} ${t('editions.finalists')}</span>` : ''}
                        ${!isPast && getCountdown(e.date, e.time) ? `<span class="event-countdown-pill">⏱ ${getCountdown(e.date, e.time)}</span>` : ''}
                    </div>
                    ${descHtml}
                </div>
                <div class="event-row-right">
                    ${liveBadgeHtml}
                    ${playerBadgeHtml}
                    <span class="event-row-cta">${t('editions.see')}</span>
                    ${state.isAdmin ? `<div class="edition-card-admin" onclick="event.stopPropagation()">
                        <button class="btn btn-secondary btn-small" onclick="openEditEdition('${e.id}')">✏️</button>
                        <button class="btn btn-danger btn-small" onclick="deleteEdition('${e.id}')">🗑️</button>
                    </div>` : ''}
                </div>
            </div>
        </div>`;
    };

    let html = '<div class="event-list">';
    if (upcoming.length > 0) {
        html += `<div class="event-list-section-label">${t('editions.upcoming')}</div>`;
        upcoming.forEach(e => { html += renderEditionRow(e, false); });
    }
    if (past.length > 0) {
        html += `<div class="event-list-section-label" style="margin-top:${upcoming.length ? 24 : 0}px">${t('editions.past')}</div>`;
        past.forEach(e => { html += renderEditionRow(e, true); });
    }
    html += '</div>';
    grid.innerHTML = html;
}

// ── Helpers TMX / YouTube ─────────────────────────────────────────────────────

function parseTmxPage(html) {
    const imgMatch  = html.match(/property="og:image"\s+content="([^"]+)"/i);
    const nameMatch = html.match(/property="og:title"\s+content="([^"]+)"/i);
    const thumbUrl  = imgMatch ? imgMatch[1] : null;
    const rawName   = nameMatch ? nameMatch[1].replace(/\s*\|.*$/, '').trim() : null;
    let name = null, mapper = null;
    if (rawName) {
        const lastByIdx = rawName.toLowerCase().lastIndexOf(' by ');
        if (lastByIdx > 0) {
            name   = rawName.substring(0, lastByIdx).trim();
            mapper = rawName.substring(lastByIdx + 4).trim();
        } else {
            name = rawName;
        }
    }
    return { thumbUrl, name, mapper };
}

async function fetchTmxMapInfo(tmxId) {
    const tmxUrl = `https://trackmania.exchange/mapshow/${tmxId}`;
    try {
        const r = await fetch(`https://corsproxy.io/?${encodeURIComponent(tmxUrl)}`);
        if (r.ok) { const p = parseTmxPage(await r.text()); if (p.thumbUrl) return p; }
    } catch(e) { console.warn('TMX proxy 1 failed:', e.message); }
    try {
        const r = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(tmxUrl)}`);
        if (r.ok) { const d = await r.json(); const p = parseTmxPage(d.contents || ''); if (p.thumbUrl) return p; }
    } catch(e) { console.warn('TMX proxy 2 failed:', e.message); }
    try {
        const r = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(tmxUrl)}`);
        if (r.ok) { const p = parseTmxPage(await r.text()); if (p.thumbUrl) return p; }
    } catch(e) { console.warn('TMX proxy 3 failed:', e.message); }
    return { thumbUrl: null, name: null, mapper: null };
}

export async function storeTmxThumbs(editionId, mapTmxValues) {
    const hasMaps = [1,2,3,4,5,6,7].some(n => extractTmxId(mapTmxValues[n]));
    if (!hasMaps) return;
    const toast = document.createElement('div');
    toast.textContent = t('admin.thumbnails.fetch');
    Object.assign(toast.style, { position:'fixed', bottom:'20px', right:'20px', background:'#1e293b', color:'#f1f5f9', padding:'10px 16px', borderRadius:'10px', fontSize:'0.85rem', zIndex:'9999', boxShadow:'0 4px 20px rgba(0,0,0,0.4)' });
    document.body.appendChild(toast);
    const thumbUpdates = {};
    await Promise.all([1,2,3,4,5,6,7].map(async n => {
        const tmxId = extractTmxId(mapTmxValues[n]);
        if (!tmxId) return;
        const { thumbUrl, name, mapper } = await fetchTmxMapInfo(tmxId);
        if (thumbUrl) thumbUpdates[`map${n}thumbUrl`] = thumbUrl;
        if (name)     thumbUpdates[`map${n}name`]     = name;
        if (mapper)   thumbUpdates[`map${n}mapper`]   = mapper;
    }));
    if (Object.keys(thumbUpdates).length > 0) {
        await updateDoc(doc(db, 'editions', editionId), thumbUpdates);
        toast.textContent = t('admin.thumbnails.ok').replace('{count}', Object.keys(thumbUpdates).length);
    } else {
        toast.textContent = t('admin.thumbnails.error');
    }
    setTimeout(() => toast.remove(), 4000);
}

export function extractTmxId(value) {
    if (!value) return null;
    const m = value.match(/trackmania\.exchange\/mapshow\/(\d+)/i);
    if (m) return m[1];
    if (/^\d+$/.test(value.trim())) return value.trim();
    return null;
}

function extractYoutubeId(url) {
    if (!url) return null;
    const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
}

const STATUS_LOG_LABELS = {
    fermee:       '🔒 Inscriptions fermées',
    inscriptions: '📋 Inscriptions ouvertes',
    en_cours:     '🎯 Événement lancé',
    terminee:     '✅ Édition clôturée',
};

function buildStatusHistoryHtml(edition) {
    const history = edition.statusHistory;
    if (!history || history.length === 0) return '';
    const sorted = [...history].sort((a, b) => new Date(a.at) - new Date(b.at));
    const items = sorted.map(h => {
        const d = new Date(h.at);
        const dateLabel = d.toLocaleDateString(dateLang(), { day: 'numeric', month: 'long', year: 'numeric' });
        const timeLabel = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        return `<span style="display:inline-flex;align-items:center;gap:6px;font-size:0.8rem;color:var(--color-text-secondary)">
            <span>${STATUS_LOG_LABELS[h.status] || h.status}</span>
            <span style="opacity:0.5">·</span>
            <span>${dateLabel} à ${timeLabel}</span>
        </span>`;
    }).join('<span style="color:rgba(255,255,255,0.15);margin:0 6px">→</span>');
    return `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:10px 14px;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:16px;line-height:1.8">${items}</div>`;
}

// ── Détail d'une édition ──────────────────────────────────────────────────────

window.openEditionDetail = (id) => {
    state.currentDetailEditionId = id;
    const e = state.data.editions.find(e => e.id === id);
    if (!e) return;
    state.youtubeCollapsed = sessionStorage.getItem('ytCollapsed_' + id) === '1';
    state.twitchCollapsed  = sessionStorage.getItem('twCollapsed_' + id) === '1';

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const isPast = new Date(e.date) < today || e.status === 'terminee' || e.status === 'en_cours';
    const dateStr = new Date(e.date).toLocaleDateString(dateLang(), { day: 'numeric', month: 'long', year: 'numeric' });

    const grid = document.getElementById('editionsList');
    const detail = document.getElementById('editionDetail');
    const content = document.getElementById('editionDetailContent');
    const createCard = document.getElementById('createEditionCard');

    grid.style.display = 'none';
    if (createCard) createCard.style.display = 'none';
    detail.classList.add('open');

    let html = '';

    if (isPast) {
        // Workflow panel pour les éditions en cours (transition → terminée + Discord)
        if (state.isAdmin && e.status === 'en_cours') {
            html += `<div class="card" style="margin-bottom:12px">
                <div class="workflow-panel admin-only">
                    <span class="workflow-status-label">${t('detail.status.label')}<strong class="workflow-status-value" style="color:#fbbf24">${t('editions.status.live')}</strong></span>
                    <button class="btn btn-primary btn-small" onclick="setEditionStatus('${id}','terminee')">→ ${t('detail.close.edition')}</button>
                    <button class="btn-discord-notify" onclick="openDiscordNotifyModal('${id}')">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
                        ${t('detail.notify.discord')}
                    </button>
                </div>
            </div>`;
        }

        if (state.isAdmin) {
            // Phase inscription : tous les participants (défaut)
            const playerOptions = state.data.participants
                .sort((a, b) => pName(a).localeCompare(pName(b)))
                .map(p => `<option value="${p.id}">${pName(p)}</option>`).join('');
            html += `<div class="card">
                <h2>${t('detail.add.result')}</h2>
                <form id="detailAddResultForm">
                    <div class="form-row">
                        <div class="form-group">
                            <label>${t('detail.phase')}</label>
                            <select id="detailResultPhase" required onchange="detailOnPhaseChange()">
                                <option value="">${t('detail.phase.ph')}</option>
                                <option value="inscription">${t('detail.phase.inscription')}</option>
                                <option value="qualification">${t('detail.phase.quals')}</option>
                                <option value="finale">${t('detail.phase.finale')}</option>
                            </select>
                        </div>
                        <div class="form-group" id="detailMapField" style="display:none">
                            <label>${t('detail.map')}</label>
                            <select id="detailResultMap">
                                ${Array.from({length: e.nbMaps || 6}, (_, i) => i + 1).map(n => `<option value="${n}">${t('detail.map.n')} ${n}</option>`).join('')}
                                <option value="7">${t('detail.map.finale')}</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>${t('detail.player')}</label>
                            <select id="detailResultPlayer" required onchange="detailOnPlayerChange()">
                                <option value="">${t('detail.player.select')}</option>
                                ${playerOptions}
                            </select>
                        </div>
                        <div id="detailViesBonusInfo" style="display:none;background:rgba(239,68,68,0.1);color:#ef4444;font-size:0.82rem;padding:8px 12px;border-radius:8px;border:1px solid rgba(239,68,68,0.2)"></div>
                        <div class="form-group" id="detailQualPosField" style="display:none">
                            <label>${t('detail.pos.map')}</label>
                            <select id="detailResultQualPos">
                                ${Array.from({length: e.nbQualifPerMap || 3}, (_, i) => i + 1).map(pos => `<option value="${pos}">${t(`detail.pos.${pos}`) || `${pos}e`}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group" id="detailPositionField" style="display:none">
                            <label>${t('detail.pos.final')}</label>
                            <input type="number" id="detailResultPosition" min="1" placeholder="Ex: 1">
                        </div>
                    </div>
                    <button type="submit" class="btn btn-primary">${t('detail.save')}</button>
                </form>
            </div>`;
        }

        const edResults = state.data.results.filter(r => r.editionId === e.id);
        const finaleResults = edResults.filter(r => r.phase === 'finale').sort((a, b) => a.position - b.position);
        const qualResults = edResults.filter(r => r.phase === 'qualification');

        const timeStr = e.time ? ` à ${e.time}` : '';
        const editBtnHtml = state.isAdmin ? `<button class="btn btn-secondary btn-small" onclick="openEditEdition('${e.id}')" style="margin-left:auto">✏️ Modifier</button>` : '';

        const ytId = extractYoutubeId(e.youtubeUrl);
        const vodEmbedHtml = ytId ? `
            <div class="vod-section-label" style="justify-content:space-between;margin-bottom:0">
                <span>${t('detail.vod')}</span>
                <button onclick="toggleYoutubeEmbed(this)" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.22);border-radius:6px;color:var(--color-text-primary);cursor:pointer;font-size:0.78rem;font-weight:600;padding:4px 12px;font-family:inherit">${state.youtubeCollapsed ? t('detail.show') : t('detail.hide')}</button>
            </div>
            <div id="youtubeEmbedWrap" class="vod-embed-wrap" style="margin-top:10px${state.youtubeCollapsed ? ';display:none' : ''}">
                <iframe src="https://www.youtube.com/embed/${ytId}" allowfullscreen loading="lazy"></iframe>
            </div>` : '';

        const twitchLiveHtml = e.status === 'en_cours' ? `
            <div class="stream-section-label" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0">
                <span style="display:flex;align-items:center;gap:6px">
                    <span class="live-dot" style="width:7px;height:7px"></span>
                    ${t('detail.live.twitch')}
                </span>
                <button onclick="toggleTwitchEmbed(this)" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.22);border-radius:6px;color:var(--color-text-primary);cursor:pointer;font-size:0.78rem;font-weight:600;padding:4px 12px;font-family:inherit">${state.twitchCollapsed ? t('detail.show') : t('detail.hide')}</button>
            </div>
            <div id="twitchEmbedWrap" class="stream-embed-wrap" style="${state.twitchCollapsed ? 'display:none' : ''}">
                <iframe src="https://player.twitch.tv/?channel=${state.siteConfig.twitchChannel}&parent=${window.location.hostname}&autoplay=false" allowfullscreen></iframe>
            </div>` : '';

        html += `<div class="card">
            <h2>🏆 ${e.name} <span style="color:var(--color-text-secondary);font-size:0.82rem;font-weight:400">— ${dateStr}${timeStr}</span>${editBtnHtml}</h2>
            ${e.description ? `<div style="color:var(--color-text-secondary);font-size:0.9rem;margin-bottom:16px;line-height:1.6">${parseMarkdown(e.description)}</div>` : ''}
            ${twitchLiveHtml}
            ${vodEmbedHtml}`;

        // ── Qualifications ──
        const playerMapCount = {};
        qualResults.filter(r => r.map).forEach(r => {
            playerMapCount[r.playerId] = (playerMapCount[r.playerId] || 0) + 1;
        });
        const playerFirstMap = {};
        qualResults.filter(r => r.map).sort((a,b) => a.map - b.map).forEach(r => {
            if (!playerFirstMap[r.playerId]) playerFirstMap[r.playerId] = r.map;
        });

        const legacyQuals = qualResults.filter(r => !r.map);
        if (qualResults.length > 0) {
            html += `<div class="phase-title">${t('detail.quals.title')}</div>`;
            html += '<div class="maps-grid">';
            const medals3 = ['🥇', '🥈', '🥉'];
            for (let m = 1; m <= (e.nbMaps || 6); m++) {
                const mapQuals = qualResults.filter(r => r.map === m).sort((a, b) => (a.position||0) - (b.position||0));
                const tmxName   = e[`map${m}name`]   || '';
                const tmxMapper = e[`map${m}mapper`] || '';
                const thumbUrl  = e[`map${m}thumbUrl`] || '';
                const thumbHtml = thumbUrl ? `<div class="tmx-thumb-wrap"><img src="${thumbUrl}" class="tmx-thumb" alt="Map ${m}"></div>` : '';
                const mapLabelHtml = `<div class="map-card-header">${t('detail.map.n')} ${m}</div>`;
                const mapTitleHtml = tmxName ? `<div style="padding:4px 12px 6px;font-size:0.85rem;font-weight:600;color:#f1f5f9;line-height:1.3">${tmxName}${tmxMapper ? `<span style="font-weight:400;color:var(--color-text-secondary);font-size:0.78rem"> ${t('detail.by')} ${tmxMapper}</span>` : ''}</div>` : '';
                html += `<div class="map-card">${thumbHtml}${mapLabelHtml}${mapTitleHtml}<div class="map-slots-wrap">`;
                for (let pos = 1; pos <= (e.nbQualifPerMap || 3); pos++) {
                    const r = mapQuals.find(r => r.position === pos);
                    if (r) {
                        const player = state.data.participants.find(p => p.id === r.playerId);
                        const playerQualsSorted = qualResults.filter(q => q.playerId === r.playerId && q.map).sort((a, b) => a.map - b.map);
                        const appearanceIndex = playerQualsSorted.findIndex(q => q.map === m);
                        const viesHtml = appearanceIndex > 0 ? `<span class="vie-badge">❤️×${appearanceIndex}</span>` : '';
                        const del = state.isAdmin ? `<button class="chip-delete" onclick="event.stopPropagation();deleteResult('${r.id}')">✕</button>` : '';
                        html += `<div class="map-slot map-slot-filled" onclick="openPlayerProfile('${player?.id}')">
                            <span class="map-medal">${medals3[pos-1]}</span>
                            <span class="map-player-name">${player ? pName(player) : '?'}</span>
                            ${viesHtml}${del}
                        </div>`;
                    } else {
                        html += `<div class="map-slot map-slot-empty"><span class="map-medal">${medals3[pos-1]}</span><span style="font-size:0.8rem">—</span></div>`;
                    }
                }
                html += '</div></div>';
            }
            html += '</div>';
            if (legacyQuals.length > 0) {
                html += '<div style="margin-top:6px" class="chips">';
                legacyQuals.forEach(r => {
                    const player = state.data.participants.find(p => p.id === r.playerId);
                    if (!player) return;
                    const del = state.isAdmin ? `<button class="chip-delete" onclick="deleteResult('${r.id}')">✕</button>` : '';
                    html += `<span class="chip" onclick="openPlayerProfile('${player.id}')">${pName(player)}${del}</span>`;
                });
                html += '</div>';
            }
        }

        // ── Finale KO ──
        if (finaleResults.length > 0) {
            const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
            const podiumOrder = [2, 1, 3]
                .map(pos => finaleResults.find(r => r.position === pos))
                .filter(Boolean);
            if (podiumOrder.length > 0) {
                html += '<div class="podium">';
                podiumOrder.forEach(r => {
                    const player = state.data.participants.find(p => p.id === r.playerId);
                    if (!player) return;
                    const viesCountP = qualResults.filter(q => q.playerId === player.id).length - 1;
                    const viesHtml = viesCountP > 0 ? `<div style="font-size:0.75rem;color:#ef4444;margin-top:2px">❤️×${viesCountP}</div>` : '';
                    html += `<div class="podium-spot">
                        <div class="podium-player">
                            <div class="podium-medal">${medals[r.position] || r.position}</div>
                            <div class="podium-name player-name-link" onclick="openPlayerProfile('${player.id}')">${pName(player)}</div>
                            <div>${playerBadgesHtml(player.id)}</div>
                            ${viesHtml}
                            <div class="podium-team">${tTeam(player.team)}</div>
                            <div class="podium-pts">+${getPoints(r.position)} pts</div>
                        </div>
                        <div class="podium-block podium-block-${r.position}">${r.position}</div>
                    </div>`;
                });
                html += '</div>';
            }

            const adminCol = state.isAdmin ? '<th></th>' : '';
            html += `<div class="phase-title" style="display:flex;align-items:center;justify-content:space-between">
                <span>${t('detail.finale.title')}</span>
                <button class="btn btn-secondary btn-small" onclick="copyPodium('${e.id}', this)">${t('detail.share.podium')}</button>
            </div>`;
            const finaleThumbUrl = e.map7thumbUrl || '';
            const finaleMapName  = e.map7name || '';
            const finaleMapper   = e.map7mapper || '';
            if (finaleThumbUrl) {
                html += `<div class="map-card" style="max-width:340px;margin-bottom:14px">
                    <div class="tmx-thumb-wrap"><img src="${finaleThumbUrl}" class="tmx-thumb" alt="Map Finale"></div>
                    <div class="map-card-header">${t('detail.map.final.label')}</div>
                    ${finaleMapName ? `<div style="padding:4px 12px 6px;font-size:0.85rem;font-weight:600;color:#f1f5f9;line-height:1.3">${finaleMapName}${finaleMapper ? `<span style="font-weight:400;color:var(--color-text-secondary);font-size:0.78rem"> ${t('detail.by')} ${finaleMapper}</span>` : ''}</div>` : ''}
                </div>`;
            }
            html += `<p style="color:var(--color-text-secondary);font-size:0.8rem;margin:-6px 0 10px">${t('detail.finale.desc')}</p>`;
            html += `<table><thead><tr><th>${t('detail.col.pos')}</th><th>${t('detail.col.player')}</th><th>${t('detail.col.team')}</th><th>${t('detail.col.lives')}</th><th>${t('detail.col.points')}</th>${adminCol}</tr></thead><tbody>`;
            finaleResults.forEach(r => {
                const player = state.data.participants.find(p => p.id === r.playerId);
                if (!player) return;
                const viesCount = qualResults.filter(q => q.playerId === player.id).length - 1;
                const vies = viesCount > 0 ? `×${viesCount}` : '—';
                const badgeClass = r.position <= 3 ? `badge-${r.position}` : 'badge-other';
                const del = state.isAdmin ? `<td><button class="btn btn-danger btn-small" onclick="deleteResult('${r.id}')">✕</button></td>` : '';
                html += `<tr>
                    <td><span class="badge ${badgeClass}">${r.position}</span></td>
                    <td><strong class="player-name-link" onclick="openPlayerProfile('${player.id}')">${pName(player)}</strong>${playerBadgesHtml(player.id)}</td>
                    <td style="color:var(--color-text-secondary)">${tTeam(player.team)}</td>
                    <td style="color:#ef4444;font-size:0.85rem">${vies}</td>
                    <td><span class="pts-badge">+${getPoints(r.position)} pts</span></td>
                    ${del}
                </tr>`;
            });
            html += '</tbody></table>';
        }

        if (finaleResults.length === 0 && qualResults.length === 0) {
            html += `<div class="empty-state"><span class="empty-state-icon">🏁</span><p>${t('detail.no.results')}</p></div>`;
        }

        const inscritIds = new Set(edResults.filter(r => r.phase === 'inscription').map(r => r.playerId));
        const qualIds    = new Set(qualResults.map(r => r.playerId));
        const presentOnly = [...inscritIds].filter(pid => !qualIds.has(pid));
        if (presentOnly.length > 0) {
            html += `<div class="phase-title" style="margin-top:20px">${t('detail.present.notq')} (${presentOnly.length})</div>
                <div class="chips">`;
            presentOnly.forEach(pid => {
                const player = state.data.participants.find(p => p.id === pid);
                if (!player) return;
                const del = state.isAdmin ? `<button class="chip-delete" onclick="deleteResult('${edResults.find(r => r.playerId === pid && r.phase === 'inscription')?.id}')">✕</button>` : '';
                html += `<span class="chip" onclick="openPlayerProfile('${player.id}')">${pName(player)}${del}</span>`;
            });
            html += '</div>';
        }

        html += '</div>';

    } else {
        // Upcoming edition
        const timeStr = e.time ? ` à ${e.time}` : '';
        const currentPlayer = state.currentUser ? state.data.participants.find(p => p.userId === state.currentUser.uid) : null;
        const alreadyRegistered = currentPlayer
            ? state.data.results.some(r => r.editionId === id && r.playerId === currentPlayer.id && r.phase === 'inscription')
            : false;

        let workflowHtml = '';
        if (state.isAdmin) {
            const wfMap = {
                fermee:       { label: t('editions.status.closed'), color: 'var(--color-text-secondary)', next: { status: 'inscriptions', btn: t('detail.open.reg') } },
                inscriptions: { label: t('editions.status.open'),   color: 'var(--springs-orange)',       next: { status: 'en_cours',     btn: t('detail.start.event')   } },
                en_cours:     { label: t('editions.status.live'),   color: '#fbbf24',                    next: { status: 'terminee',     btn: t('detail.close.edition') } },
            };
            const wf = wfMap[e.status] || wfMap.fermee;
            const nextBtn = wf.next
                ? `<button class="btn btn-primary btn-small" onclick="setEditionStatus('${id}','${wf.next.status}')">→ ${wf.next.btn}</button>`
                : '';
            workflowHtml = `<div class="workflow-panel admin-only">
                <span class="workflow-status-label">${t('detail.status.label')}<strong class="workflow-status-value" style="color:${wf.color}">${wf.label}</strong></span>
                ${nextBtn}
                <button class="btn-discord-notify" onclick="openDiscordNotifyModal('${id}')">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
                    ${t('detail.notify.discord')}
                </button>
            </div>`;
        }

        let registrationHtml = '';
        const status = e.status || 'inscriptions';
        if (status === 'fermee') {
            registrationHtml = `<p style="color:var(--color-text-secondary);font-size:0.9rem">${t('detail.status.closed')}</p>`;
        } else if (status === 'en_cours') {
            registrationHtml = `<p style="color:#fbbf24;font-weight:600;font-size:0.9rem">${t('detail.status.live')}</p>`;
        } else if (!state.currentUser) {
            registrationHtml = `<button class="btn btn-primary" onclick="openAuthModal()">${t('editions.login.to.reg')}</button>`;
        } else if (alreadyRegistered) {
            registrationHtml = `<div class="registered-badge">${t('detail.already.reg')}</div>`;
        } else if (!currentPlayer) {
            registrationHtml = `<div style="display:flex;flex-direction:column;gap:10px;align-items:flex-start">
                <p style="color:var(--color-text-secondary);font-size:0.85rem;margin:0">${t('detail.create.profile')}</p>
                <button class="btn btn-primary" onclick="openCreateProfile()">${t('detail.create.profile.btn')}</button>
            </div>`;
        } else {
            registrationHtml = `<button class="btn btn-primary" onclick="registerForEdition('${id}')">${t('editions.register.btn')}</button>`;
        }

        const infoItems = [];
        infoItems.push(`<span style="color:var(--color-text-primary);font-size:1rem;font-weight:600">📅 ${dateStr}</span>`);
        if (e.time)  infoItems.push(`<span>🕐 ${e.time}</span>`);
        if (e.club)  infoItems.push(`<span>${t('detail.club.label')} <strong>${e.club}</strong></span>`);
        if (e.salon) infoItems.push(`<span>${t('detail.salon.label')} <strong>${e.salon}</strong></span>`);
        const infoHtml = `<div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:24px;font-size:0.9rem;color:var(--color-text-secondary)">${infoItems.join('')}</div>`;

        const inscriptions = state.data.results.filter(r => r.editionId === id && r.phase === 'inscription');
        let registrantsHtml = '';
        if (inscriptions.length === 0) {
            registrantsHtml = `<div class="empty-state" style="padding:30px 20px"><span class="empty-state-icon">👥</span><p>${t('detail.no.reg')}</p></div>`;
        } else {
            const showActionsCol = state.isAdmin || inscriptions.some(r => {
                const p = state.data.participants.find(p => p.id === r.playerId);
                return p && state.currentUser && p.userId === state.currentUser.uid;
            });
            const isMeRegistered = inscriptions.some(r => {
                const p = state.data.participants.find(p => p.id === r.playerId);
                return p && state.currentUser && p.userId === state.currentUser.uid;
            });
            const showPasswordCol = isMeRegistered && !!e.password;
            const actionsHeader = showActionsCol ? '<th></th>' : '';
            const passwordHeader = showPasswordCol ? `<th>${t('detail.password')}</th>` : '';
            registrantsHtml = `<table><thead><tr><th>#</th><th>Joueur</th><th>Équipe</th>${passwordHeader}${actionsHeader}</tr></thead><tbody>`;
            inscriptions.forEach((r, i) => {
                const player = state.data.participants.find(p => p.id === r.playerId);
                if (!player) return;
                const isMe = state.currentUser && player.userId === state.currentUser.uid;
                const meStyle = isMe ? 'background:rgba(0,217,54,0.06)' : '';
                let passwordCell = '';
                if (showPasswordCol) {
                    passwordCell = isMe
                        ? `<td style="color:var(--color-accent);font-weight:600">${e.password}</td>`
                        : `<td></td>`;
                }
                let actionCell = '';
                if (showActionsCol) {
                    if (state.isAdmin) {
                        actionCell = `<td><button class="btn btn-danger btn-small" onclick="deleteResult('${r.id}')">✕</button></td>`;
                    } else if (isMe) {
                        actionCell = `<td><button class="btn btn-danger btn-small" onclick="cancelInscription('${r.id}', '${id}')">${t('detail.cancel')}</button></td>`;
                    } else {
                        actionCell = '<td></td>';
                    }
                }
                registrantsHtml += `<tr style="${meStyle}">
                    <td style="color:var(--color-text-secondary)">${i + 1}</td>
                    <td><strong class="player-name-link" onclick="openPlayerProfile('${player.id}')">${pName(player)}</strong>${playerBadgesHtml(player.id)}${isMe ? ` <span style="color:var(--color-accent);font-size:0.8rem">${t('msg.you')}</span>` : ''}</td>
                    <td style="color:var(--color-text-secondary)">${tTeam(player.team)}</td>
                    ${passwordCell}
                    ${actionCell}
                </tr>`;
            });
            registrantsHtml += '</tbody></table>';
        }

        const twitchEmbedHtml = e.status === 'en_cours' ? `
            <div class="stream-section-label">
                <span class="live-dot" style="width:7px;height:7px"></span>
                ${t('detail.live.twitch')}
            </div>
            <div class="stream-embed-wrap">
                <iframe src="https://player.twitch.tv/?channel=${state.siteConfig.twitchChannel}&parent=${window.location.hostname}&autoplay=false" allowfullscreen></iframe>
            </div>` : '';

        const upcomingEditBtn = state.isAdmin ? `<button class="btn btn-secondary btn-small" onclick="openEditEdition('${e.id}')" style="margin-left:auto">✏️ Modifier</button>` : '';
        const adminInscriptionHtml = state.isAdmin ? (() => {
            const opts = state.data.participants
                .filter(p => !inscriptions.some(r => r.playerId === p.id))
                .sort((a, b) => pName(a).localeCompare(pName(b)))
                .map(p => `<option value="${p.id}">${pName(p)}</option>`).join('');
            return `<form id="adminInscriptionForm" style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
                <select id="adminInscriptionPlayer" style="flex:1;min-width:160px;padding:7px 10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-size:0.85rem">
                    <option value="">${t('detail.add.player.ph')}</option>
                    ${opts}
                </select>
                <button type="submit" class="btn btn-secondary btn-small">${t('detail.add.player.btn')}</button>
            </form>`;
        })() : '';

        html = `<div class="card">
            <h2>🏆 ${e.name}${upcomingEditBtn}</h2>
            ${workflowHtml}
            ${twitchEmbedHtml}
            ${infoHtml}
            ${e.description ? `<div style="color:var(--color-text-secondary);font-size:0.9rem;margin:16px 0;line-height:1.6">${parseMarkdown(e.description)}</div>` : ''}
            ${registrationHtml}
            <div style="margin-top:28px">
                <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px">
                    <div class="phase-title" style="margin:0">${t('detail.registered.list')} (${inscriptions.length})</div>
                    ${inscriptions.length > 0 && state.isAdmin ? `<div style="display:flex;gap:8px;flex-wrap:wrap">
                        <button onclick="exportGuestlist('${id}','xml')" style="padding:5px 12px;border-radius:7px;background:rgba(0,217,54,0.1);border:1px solid rgba(0,217,54,0.3);color:var(--color-accent);font-size:0.78rem;font-weight:600;cursor:pointer;font-family:inherit">⬇️ Export XML</button>
                        <button onclick="exportGuestlist('${id}','csv')" style="padding:5px 12px;border-radius:7px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:#ccc;font-size:0.78rem;font-weight:600;cursor:pointer;font-family:inherit">⬇️ Export CSV</button>
                    </div>` : ''}
                </div>
                ${registrantsHtml}
                ${adminInscriptionHtml}
            </div>
        </div>`;
    }

    content.innerHTML = html;

    const adminInscForm = document.getElementById('adminInscriptionForm');
    if (adminInscForm) {
        adminInscForm.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const playerId = document.getElementById('adminInscriptionPlayer').value;
            if (!playerId) return;
            const btn = adminInscForm.querySelector('[type="submit"]');
            btn.disabled = true;
            try {
                await addDoc(collection(db, 'results'), { editionId: id, playerId, phase: 'inscription', cupId });
                await window.reloadData?.();
                window.openEditionDetail(id);
            } finally {
                btn.disabled = false;
            }
        });
    }

    const detailForm = document.getElementById('detailAddResultForm');
    if (detailForm) {
        detailForm.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const phase    = document.getElementById('detailResultPhase').value;
            const playerId = document.getElementById('detailResultPlayer').value;
            if (!phase || !playerId) return;

            const btn = detailForm.querySelector('[type="submit"]');
            btn.disabled = true;

            try {
                if (phase === 'inscription') {
                    if (state.data.results.some(r => r.editionId === id && r.playerId === playerId && r.phase === 'inscription')) {
                        alert(t('admin.already.reg')); return;
                    }
                    await addDoc(collection(db, 'results'), { editionId: id, playerId, phase: 'inscription', cupId });

                } else if (phase === 'qualification') {
                    const map      = parseInt(document.getElementById('detailResultMap').value);
                    const position = parseInt(document.getElementById('detailResultQualPos').value);

                    if (state.data.results.some(r => r.editionId === id && r.playerId === playerId && r.phase === 'qualification' && r.map === map)) {
                        alert(t('admin.map.done').replace('{n}', map)); return;
                    }
                    if (state.data.results.some(r => r.editionId === id && r.phase === 'qualification' && r.map === map && r.position === position)) {
                        alert(t('admin.pos.taken').replace('{position}', position).replace('{n}', map)); return;
                    }
                    await addDoc(collection(db, 'results'), { editionId: id, playerId, phase: 'qualification', map, position, cupId });

                } else if (phase === 'finale') {
                    const position = parseInt(document.getElementById('detailResultPosition').value);
                    if (!position) return;
                    if (state.data.results.some(r => r.editionId === id && r.playerId === playerId && r.phase === 'finale')) {
                        alert(t('admin.finale.exists')); return;
                    }
                    if (!state.data.results.some(r => r.editionId === id && r.playerId === playerId && r.phase === 'qualification')) {
                        alert(t('admin.no.quals')); return;
                    }
                    await addDoc(collection(db, 'results'), { editionId: id, playerId, phase: 'finale', position, cupId });
                }
                await window.reloadData?.();
                window.openEditionDetail(id);
            } finally {
                btn.disabled = false;
            }
        });
    }
};

window.toggleTwitchEmbed = (btn) => {
    state.twitchCollapsed = !state.twitchCollapsed;
    sessionStorage.setItem('twCollapsed_' + state.currentDetailEditionId, state.twitchCollapsed ? '1' : '');
    document.getElementById('twitchEmbedWrap').style.display = state.twitchCollapsed ? 'none' : '';
    btn.textContent = state.twitchCollapsed ? t('detail.show') : t('detail.hide');
};

window.toggleYoutubeEmbed = (btn) => {
    state.youtubeCollapsed = !state.youtubeCollapsed;
    sessionStorage.setItem('ytCollapsed_' + state.currentDetailEditionId, state.youtubeCollapsed ? '1' : '');
    document.getElementById('youtubeEmbedWrap').style.display = state.youtubeCollapsed ? 'none' : '';
    btn.textContent = state.youtubeCollapsed ? t('detail.show') : t('detail.hide');
};

window.detailOnPhaseChange = () => {
    const phase = document.getElementById('detailResultPhase')?.value;
    const isQual   = phase === 'qualification';
    const isFinale = phase === 'finale';
    document.getElementById('detailMapField').style.display      = isQual   ? '' : 'none';
    document.getElementById('detailQualPosField').style.display  = isQual   ? '' : 'none';
    document.getElementById('detailPositionField').style.display = isFinale ? '' : 'none';
    document.getElementById('detailViesBonusInfo').style.display = 'none';
    const posInput = document.getElementById('detailResultPosition');
    if (posInput) posInput.required = isFinale;

    // Mettre à jour la liste des joueurs selon la phase
    const playerSelect = document.getElementById('detailResultPlayer');
    if (playerSelect && state.currentDetailEditionId) {
        const needsFilter = isQual || isFinale;
        let players;
        if (needsFilter) {
            const inscribedIds = new Set(state.data.results
                .filter(r => r.editionId === state.currentDetailEditionId && r.phase === 'inscription')
                .map(r => r.playerId));
            players = state.data.participants.filter(p => inscribedIds.has(p.id));
        } else {
            players = [...state.data.participants];
        }
        players.sort((a, b) => pName(a).localeCompare(pName(b)));
        playerSelect.innerHTML = `<option value="">${t('detail.player.select')}</option>` +
            players.map(p => `<option value="${p.id}">${pName(p)}</option>`).join('');
    }
};

window.detailOnPlayerChange = () => {
    const phase    = document.getElementById('detailResultPhase')?.value;
    const playerId = document.getElementById('detailResultPlayer')?.value;
    const info     = document.getElementById('detailViesBonusInfo');
    if (phase !== 'qualification' || !playerId) { info.style.display = 'none'; return; }

    const existingQuals = state.data.results.filter(r => r.editionId === state.currentDetailEditionId && r.playerId === playerId && r.phase === 'qualification');
    if (existingQuals.length > 0) {
        const maps = existingQuals.map(r => r.map ? `Map ${r.map}` : '?').join(', ');
        const vies = existingQuals.length - 1;
        info.style.display = '';
        info.innerHTML = `⚡ ${t('detail.already.top3')} <strong>${maps}</strong>${vies > 0 ? ` — ❤️×${vies} ${t('detail.lives.n')}` : ` — ${t('detail.bonus.none')}`}. ${t('detail.bonus.will.get')} <strong>+1 ${t('detail.bonus.life')}</strong>`;
    } else {
        info.style.display = 'none';
    }
};

window.closeEditionDetail = () => {
    state.currentDetailEditionId = null;
    document.getElementById('editionsList').style.display = '';
    document.getElementById('editionDetail').classList.remove('open');
    document.getElementById('editionFilters').style.display = '';
    const createCard = document.getElementById('createEditionCard');
    if (createCard) createCard.style.display = '';
    const url = new URL(window.location);
    url.searchParams.delete('edition');
    history.replaceState(null, '', url);
};

window.shareEdition = () => {
    if (!state.currentDetailEditionId) return;
    const url = new URL(window.location);
    url.searchParams.set('edition', state.currentDetailEditionId);
    navigator.clipboard.writeText(url.toString()).then(() => {
        showToast(t('player.link.copied'));
    });
};

window.cancelInscription = async (resultId, editionId) => {
    if (!confirm(t('msg.confirm.cancel.reg'))) return;
    try {
        await deleteDoc(doc(db, 'results', resultId));
        await window.reloadData?.();
        window.openEditionDetail(editionId);
    } catch (err) {
        console.error('cancelInscription:', err);
        alert(t('msg.cancel.error'));
    }
};

window.registerForEdition = async (editionId) => {
    if (!state.currentUser) return;
    const player = state.data.participants.find(p => p.userId === state.currentUser.uid);
    if (!player) {
        alert(t('detail.create.profile'));
        return;
    }
    if (state.data.results.some(r => r.editionId === editionId && r.playerId === player.id && r.phase === 'inscription')) {
        return;
    }
    await addDoc(collection(db, 'results'), { editionId, playerId: player.id, phase: 'inscription', cupId });
    await window.reloadData?.();
    window.openEditionDetail(editionId);
    // Notification Discord avec le compte exact (state.data.results est maintenant à jour)
    const edition = state.data.editions.find(e => e.id === editionId);
    if (edition) {
        const totalInscribed = state.data.results.filter(r => r.editionId === editionId && r.phase === 'inscription').length;
        notifyDiscordInscription(player, edition, totalInscribed).catch(() => {});
    }
};

window.exportGuestlist = function(editionId, format) {
    const inscriptions = state.data.results.filter(r => r.editionId === editionId && r.phase === 'inscription');
    const logins = inscriptions
        .map(r => state.data.participants.find(p => p.id === r.playerId)?.loginTM)
        .filter(Boolean);

    if (logins.length === 0) {
        alert('Aucun login TM trouvé — les joueurs doivent renseigner leur Login TM dans leur profil.');
        return;
    }

    let content, filename, type;
    const editionName = (state.data.editions.find(e => e.id === editionId)?.name || 'edition').replace(/[^a-zA-Z0-9_-]/g, '_');

    if (format === 'xml') {
        const players = logins.map(l => `  <player>\n    <login>${l}</login>\n  </player>`).join('\n');
        content = `<?xml version="1.0" encoding="utf-8" ?>\n<guestlist>\n${players}\n</guestlist>`;
        filename = `guestlist_${editionName}.xml`;
        type = 'application/xml';
    } else {
        content = logins.join('\n');
        filename = `guestlist_${editionName}.csv`;
        type = 'text/plain';
    }

    const blob = new Blob([content], { type });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};
