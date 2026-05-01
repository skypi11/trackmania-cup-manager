// modules/display-editions.js — Éditions : liste, détail, inscriptions

import { db } from '../../shared/firebase-config.js';
import { state } from './state.js';
import { t } from '../../shared/i18n.js';
import { dateLang, pName, tTeam, getPoints, getCountdown, showToast, parseMarkdown, avatarHtml } from './utils.js';
import { collection, addDoc, deleteDoc, updateDoc, doc, arrayUnion } from 'firebase/firestore';
import { notifyDiscordInscription } from './discord.js';
import tm2020Bg from '../../assets/trackmania2020.webp';
import { DEFAULT_EDITION_FORMAT } from './site-config.js';

// ── Bouton admin "Prévisualiser" (dropdown) ─────────────────────────────
// Apparaît dans le hero des éditions, admin only. Permet de tester les rendus
// LIVE / PODIUM sans modifier la DB. Stocké en sessionStorage par édition.
function renderAdminPreviewBtn(editionId, currentStatus) {
    if (!state.isAdmin) return '';
    const opts = [
        { val: 'inscriptions', label: t('detail.preview.opt.inscriptions') || 'Inscriptions ouvertes' },
        { val: 'fermee',       label: t('detail.preview.opt.fermee')       || 'Inscriptions fermées' },
        { val: 'en_cours',     label: t('detail.preview.opt.en_cours')     || 'En cours (LIVE)' },
        { val: 'terminee',     label: t('detail.preview.opt.terminee')     || 'Terminée (podium)' },
    ];
    const itemsHtml = opts.map(o => `<button class="ed-share-item" onclick="setPreviewStatus('${editionId}', '${o.val}')" style="${o.val === currentStatus ? 'background:rgba(56,189,248,0.1);color:#38bdf8' : ''}">
        <span style="width:16px;display:inline-flex;justify-content:center">${o.val === currentStatus ? '●' : '○'}</span>
        <span>${o.label}</span>
    </button>`).join('');
    return `<div class="ed-share-wrap" style="margin-left:0">
        <button class="ed-share-toggle" style="background:rgba(56,189,248,0.08);border-color:rgba(56,189,248,0.3);color:#38bdf8" onclick="toggleShareMenu(this, event)" aria-haspopup="true" aria-expanded="false" title="${t('detail.preview.btn.title') || 'Prévisualiser un autre statut sans modifier la base'}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <span>${t('detail.preview.btn') || 'Prévisualiser'}</span>
            <svg class="ed-share-toggle-chevron" width="10" height="10" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>
        </button>
        <div class="ed-share-menu" hidden>
            <div style="padding:6px 12px 8px;border-bottom:var(--border-subtle);margin-bottom:4px">
                <div style="font-size:var(--text-xs);font-weight:var(--fw-bold);text-transform:uppercase;letter-spacing:var(--tracking-wider);color:#38bdf8">${t('detail.preview.menu.label') || 'Mode prévisualisation'}</div>
                <div style="font-size:var(--text-xs);color:var(--color-text-secondary);margin-top:3px">${t('detail.preview.menu.hint') || 'Aucune modification en base'}</div>
            </div>
            ${itemsHtml}
            <div style="border-top:var(--border-subtle);margin-top:4px;padding-top:4px">
                <button class="ed-share-item" onclick="setPreviewStatus('${editionId}', null)" style="color:rgba(255,255,255,0.55)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    <span>${t('detail.preview.exit.short') || 'Sortir du preview'}</span>
                </button>
            </div>
        </div>
    </div>`;
}

window.setPreviewStatus = (editionId, status) => {
    if (status) {
        sessionStorage.setItem('preview_status_' + editionId, status);
    } else {
        sessionStorage.removeItem('preview_status_' + editionId);
    }
    if (typeof window._closeAllShareMenus === 'function') window._closeAllShareMenus();
    window.openEditionDetail(editionId);
};

// ── Section "Anciens vainqueurs" (footer page upcoming) ──────────────────
function renderPreviousChampionsSection(currentEditionId) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const past = state.data.editions
        .filter(ed => ed.id !== currentEditionId && (new Date(ed.date) < today || ed.status === 'terminee'))
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 3);
    if (past.length === 0) return '';

    const cards = past.map(ed => {
        const winRes = state.data.results.find(r => r.editionId === ed.id && r.phase === 'finale' && r.position === 1);
        const player = winRes ? state.data.participants.find(p => p.id === winRes.playerId) : null;
        if (!player) return '';
        const dateStr = new Date(ed.date).toLocaleDateString(dateLang(), { month: 'long', year: 'numeric' });
        const titleCount = state.data.results.filter(r => r.playerId === player.id && r.phase === 'finale' && r.position === 1).length;
        return `<div class="ed-prev-champion-card" onclick="openEditionDetail('${ed.id}')">
            ${avatarHtml(player, { size: 56, ringColor: 'rgba(251,191,36,0.5)' })}
            <div class="ed-prev-champion-info">
                <div class="ed-prev-champion-edition">${ed.name}</div>
                <div class="ed-prev-champion-name">🏆 ${pName(player)}</div>
                <div class="ed-prev-champion-meta">${dateStr}${titleCount > 1 ? ` · ${titleCount} ${t('home.titles') || 'titres'}` : ''}</div>
            </div>
        </div>`;
    }).filter(Boolean).join('');

    if (!cards) return '';
    return `<div class="card" style="margin-top:var(--space-md)">
        <h2 style="margin:0 0 var(--space-md)">👑 ${t('detail.prev.champions') || 'Anciens champions'}</h2>
        <div class="ed-prev-champions-grid">${cards}</div>
    </div>`;
}

// ── Twitch embed (avec fallback et autoplay muted) ────────────────────────
function twitchEmbedIframe() {
    const channel = state.siteConfig?.twitchChannel || 'springsesport';
    const host = window.location.hostname || 'springs-esport.vercel.app';
    // Plusieurs parents pour couvrir prod + previews Vercel + localhost
    const parents = new Set([host, 'springs-esport.vercel.app', 'localhost']);
    const parentParams = [...parents].map(p => `&parent=${p}`).join('');
    return `<iframe src="https://player.twitch.tv/?channel=${channel}${parentParams}&muted=true&autoplay=true" allowfullscreen allow="autoplay; fullscreen"></iframe>`;
}

// ── Hero LIVE pour les éditions en cours ──────────────────────────────────
function renderEditionHeroLive(e, qualResults) {
    const previewBtn = renderAdminPreviewBtn(e.id, sessionStorage.getItem('preview_status_' + e.id));
    const editBtn = state.isAdmin
        ? `<div style="margin-left:auto;display:inline-flex;gap:8px;align-items:center">
            ${previewBtn}
            <button class="btn btn-secondary btn-small" onclick="openEditEdition('${e.id}')">✏️ ${t('common.edit') || 'Modifier'}</button>
          </div>`
        : '';

    // Stats live calculables : map actuelle + nb qualifiés
    const mapsPlayed = qualResults.filter(r => r.map).reduce((max, r) => Math.max(max, r.map || 0), 0);
    const totalMaps = e.nbMaps || (state.siteConfig?.editionFormat?.qualifs?.mapsCount) || 6;
    const qualifiedCount = new Set(qualResults.map(r => r.playerId)).size;

    const liveStatsHtml = `<div class="ed-hero-live-stats">
        ${mapsPlayed > 0 ? `<span class="ed-hero-live-stat">📍 ${t('detail.live.map') || 'Map'} <strong>${mapsPlayed}/${totalMaps}</strong></span>` : ''}
        ${qualifiedCount > 0 ? `<span class="ed-hero-live-stat">✅ <strong>${qualifiedCount}</strong> ${t('detail.live.qualified') || 'qualifiés'}</span>` : ''}
        <span class="ed-hero-live-stat">⏱ ${t('detail.live.now') || 'En direct maintenant'}</span>
    </div>`;

    const twitchUrl = state.siteConfig?.twitchUrl;
    const twitchBlockHtml = state.siteConfig?.twitchChannel ? `
        <div class="ed-hero-twitch">${twitchEmbedIframe()}</div>` : `
        <div class="ed-hero-twitch empty">
            <div style="font-size:2rem;opacity:0.5">📺</div>
            <div>${t('detail.live.no.channel') || 'Aucune chaîne Twitch configurée'}</div>
            ${twitchUrl ? `<a href="${twitchUrl}" target="_blank" rel="noopener" class="ed-link-btn twitch" style="margin-top:8px">${t('detail.btn.twitch') || 'Suivre sur Twitch'}</a>` : ''}
        </div>`;

    return `<div class="ed-hero live">
        <div class="ed-hero-bg" style="background-image:url('${tm2020Bg}')"></div>
        <div class="ed-hero-status-row">
            <span class="ed-hero-status en_cours"><span class="live-dot"></span> ${t('detail.live.label') || 'EN DIRECT'}</span>
            ${e.club  ? `<span style="font-size:var(--text-xs);color:rgba(255,255,255,0.45);text-transform:uppercase;letter-spacing:var(--tracking-wider);font-weight:var(--fw-semibold)">🏛️ ${e.club}</span>` : ''}
            ${e.salon ? `<span style="font-size:var(--text-xs);color:rgba(255,255,255,0.45);text-transform:uppercase;letter-spacing:var(--tracking-wider);font-weight:var(--fw-semibold)">🎮 ${e.salon}</span>` : ''}
            ${editBtn}
        </div>
        <div class="ed-hero-main">
            <div class="ed-hero-title-col">
                <div class="ed-hero-title">${e.name}</div>
                ${liveStatsHtml}
            </div>
        </div>
        ${twitchBlockHtml}
    </div>`;
}

// ── Hero PODIUM pour les éditions terminées ──────────────────────────────
function renderEditionHeroPodium(e, finaleResults) {
    const previewBtn = renderAdminPreviewBtn(e.id, sessionStorage.getItem('preview_status_' + e.id));
    const editBtn = state.isAdmin
        ? `<div style="margin-left:auto;display:inline-flex;gap:8px;align-items:center">
            ${previewBtn}
            <button class="btn btn-secondary btn-small" onclick="openEditEdition('${e.id}')">✏️ ${t('common.edit') || 'Modifier'}</button>
          </div>`
        : '';

    const dateStr = new Date(e.date).toLocaleDateString(dateLang(), { day: 'numeric', month: 'long', year: 'numeric' });
    const top3 = [1, 2, 3].map(pos => {
        const r = finaleResults.find(x => x.position === pos);
        const player = r ? state.data.participants.find(p => p.id === r.playerId) : null;
        return { pos, player };
    });
    const hasChampion = !!top3[0].player;

    const medals = { 1: '🏆', 2: '🥈', 3: '🥉' };
    const classNames = { 1: 'first', 2: 'second', 3: 'third' };
    const ringColors = {
        1: 'rgba(251,191,36,0.6)',
        2: 'rgba(203,213,225,0.5)',
        3: 'rgba(205,127,50,0.5)',
    };
    const sizes = { 1: 96, 2: 64, 3: 64 };

    const podiumOrder = [2, 1, 3]; // affichage : argent | or | bronze
    const podiumHtml = `<div class="ed-hero-podium">
        ${podiumOrder.map(pos => {
            const slot = top3[pos - 1];
            if (!slot.player) return `<div class="ed-hero-podium-spot ${classNames[pos]}" style="opacity:0.4">
                <div class="ed-hero-podium-medal">${medals[pos]}</div>
                <div style="width:${sizes[pos]}px;height:${sizes[pos]}px;border-radius:50%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);margin-bottom:10px"></div>
                <div class="ed-hero-podium-name">—</div>
            </div>`;
            return `<div class="ed-hero-podium-spot ${classNames[pos]}" onclick="openPlayerProfile('${slot.player.id}')">
                <div class="ed-hero-podium-medal">${medals[pos]}</div>
                <div class="ed-hero-podium-avatar-wrap">${avatarHtml(slot.player, { size: sizes[pos], ringColor: ringColors[pos] })}</div>
                <div class="ed-hero-podium-name">${pName(slot.player)}</div>
                ${slot.player.team && slot.player.team !== 'Sans équipe' ? `<div class="ed-hero-podium-team">${slot.player.team}</div>` : ''}
                <div class="ed-hero-podium-pts">+${getPoints(pos)} pts</div>
            </div>`;
        }).join('')}
    </div>`;

    return `<div class="ed-hero terminee">
        <div class="ed-hero-bg" style="background-image:url('${tm2020Bg}')"></div>
        <div class="ed-hero-status-row">
            <span class="ed-hero-status terminee">✅ ${t('editions.status.done') || 'Terminée'}</span>
            <span style="font-size:var(--text-xs);color:rgba(255,255,255,0.45);text-transform:uppercase;letter-spacing:var(--tracking-wider);font-weight:var(--fw-semibold)">📅 ${dateStr}</span>
            ${e.club  ? `<span style="font-size:var(--text-xs);color:rgba(255,255,255,0.45);text-transform:uppercase;letter-spacing:var(--tracking-wider);font-weight:var(--fw-semibold)">🏛️ ${e.club}</span>` : ''}
            ${editBtn}
        </div>
        <div class="ed-hero-main">
            <div class="ed-hero-title-col">
                <div class="ed-hero-title">${e.name}</div>
            </div>
        </div>
        ${hasChampion ? `<div class="ed-hero-champion-banner">👑 ${t('detail.podium.champion') || 'Champion(ne) de l\'édition'}</div>` : ''}
        ${podiumHtml}
    </div>`;
}

// ── Rendu structuré du format d'édition ────────────────────────────────────
// Utilise siteConfig.editionFormat (objet structuré) + e.description (markdown
// freeform pour cette édition spécifique) → grid de cards visuelles + callouts
// auto-générés (warning pénalité, info maps cachées).
function renderFormatCard(e) {
    const fmt = state.siteConfig?.editionFormat || DEFAULT_EDITION_FORMAT;
    const editionNotes = (e.description && e.description.trim()) || '';
    const templateNotes = (fmt.notes && fmt.notes.trim()) || '';
    // Notes affichées : la description de l'édition prend le pas, sinon les notes du template
    const notesMarkdown = editionNotes || templateNotes;
    const usingTemplate = !editionNotes;

    // ── Block Qualifications ──
    const q = fmt.qualifs || {};
    const sourcesStr = Array.isArray(q.sources) && q.sources.length > 0 ? q.sources.join(' · ') : '';
    const qualifsBlock = `<div class="ed-format-block qualifs">
        <div class="ed-format-block-header">
            <span class="ed-format-block-icon">🎯</span>
            <span class="ed-format-block-title">${t('detail.fmt.qualifs') || 'Qualifications'}</span>
        </div>
        <div class="ed-format-stat"><span class="ed-format-stat-value">${q.mapsCount ?? 6}</span><span class="ed-format-stat-label">${t('detail.fmt.qualifs.maps') || 'maps'}</span></div>
        ${q.stylesCount ? `<div class="ed-format-stat"><span class="ed-format-stat-value">${q.stylesCount}</span><span class="ed-format-stat-label">${t('detail.fmt.qualifs.styles') || 'styles différents'}${q.mapsPerStyle ? ` (${q.mapsPerStyle} ${t('detail.fmt.qualifs.mapsPerStyle') || 'maps/style'})` : ''}</span></div>` : ''}
        ${q.roundsPerMap ? `<div class="ed-format-stat"><span class="ed-format-stat-value">${q.roundsPerMap}</span><span class="ed-format-stat-label">${t('detail.fmt.qualifs.rounds') || 'rounds par map'}</span></div>` : ''}
        ${sourcesStr ? `<div class="ed-format-meta">${t('detail.fmt.qualifs.sources') || 'Sources'} : <strong>${sourcesStr}</strong></div>` : ''}
    </div>`;

    // ── Block Finale ──
    const fin = fmt.finale || {};
    const finaleBlock = `<div class="ed-format-block finale">
        <div class="ed-format-block-header">
            <span class="ed-format-block-icon">🏆</span>
            <span class="ed-format-block-title">${t('detail.fmt.finale') || 'Finale'}</span>
        </div>
        <div class="ed-format-stat"><span class="ed-format-stat-value">${fin.mapsCount ?? 1}</span><span class="ed-format-stat-label">${(fin.mapsCount === 1 ? (t('detail.fmt.finale.map') || 'map') : (t('detail.fmt.finale.maps') || 'maps'))}</span></div>
        ${fin.description ? `<div class="ed-format-meta">${fin.description}</div>` : ''}
    </div>`;

    // ── Block Format ──
    const f = fmt.format || {};
    const warmup = f.warmupMinutes;
    const formatBlock = `<div class="ed-format-block format">
        <div class="ed-format-block-header">
            <span class="ed-format-block-icon">⚡</span>
            <span class="ed-format-block-title">${f.type || 'Standard'}</span>
        </div>
        ${(typeof warmup === 'number' && warmup > 0) ? `<div class="ed-format-stat"><span class="ed-format-stat-value">${warmup}</span><span class="ed-format-stat-label">${t('detail.fmt.format.warmup') || 'min de warmup par map'}</span></div>` : ''}
        <span class="ed-format-flag ${f.hiddenMaps ? 'on' : 'off'}">${f.hiddenMaps ? '🔒' : '👁️'} ${f.hiddenMaps ? (t('detail.fmt.format.hidden.on') || 'Maps cachées jusqu\'au lancement') : (t('detail.fmt.format.hidden.off') || 'Maps connues à l\'avance')}</span>
    </div>`;

    // ── Block Qualification logic ──
    const ql = fmt.qualification || {};
    const qualificationBlock = `<div class="ed-format-block qualification">
        <div class="ed-format-block-header">
            <span class="ed-format-block-icon">🔒</span>
            <span class="ed-format-block-title">${t('detail.fmt.qualification') || 'Qualification → KO'}</span>
        </div>
        <div class="ed-format-stat"><span class="ed-format-stat-value">Top ${ql.topN ?? 3}</span><span class="ed-format-stat-label">${t('detail.fmt.qualification.topN') || 'qualifié par map'}</span></div>
        ${ql.extraLifeIfQualified ? `<span class="ed-format-flag on">❤️ ${t('detail.fmt.qualification.extraLife') || 'Vie supplémentaire si déjà qualifié'}</span>` : ''}
        ${ql.pointsResetPerMap ? `<span class="ed-format-flag on">🔄 ${t('detail.fmt.qualification.reset') || 'Points reset par map'}</span>` : ''}
    </div>`;

    // ── Penalty banner (warning callout) ──
    const p = fmt.penalty || {};
    let penaltyHtml = '';
    if (p.enabled && (p.value ?? 0) > 0) {
        const typeLabel = p.type === 'cumulative_pct'
            ? (t('detail.fmt.penalty.type.cumul') || 'cumulée')
            : (t('detail.fmt.penalty.type.fixed') || 'fixe');
        const appliesLabel = {
            qualif_and_lives: t('detail.fmt.penalty.applies.both')    || 'pour chaque qualification ou vie obtenue',
            qualifs:          t('detail.fmt.penalty.applies.qualifs') || 'pour chaque qualification',
            lives:            t('detail.fmt.penalty.applies.lives')   || 'pour chaque vie obtenue',
        }[p.appliesTo] || (t('detail.fmt.penalty.applies.both') || 'pour chaque qualification ou vie obtenue');
        penaltyHtml = `<div class="ed-format-penalty">
            <span class="ed-format-penalty-icon">⚠️</span>
            <div class="ed-format-penalty-text">
                <strong>${t('detail.fmt.penalty.label') || 'Pénalité'} ${typeLabel}</strong> ${appliesLabel}. ${t('detail.fmt.penalty.note') || 'Performe au bon moment et survis.'}
            </div>
            <div class="ed-format-penalty-value">−${p.value}%</div>
        </div>`;
    }

    // ── Notes additionnelles (markdown, optionnel) ──
    const notesHtml = notesMarkdown ? `<div class="ed-format-notes">
        <div class="ed-format-notes-title">📝 ${t('detail.fmt.notes') || 'Notes additionnelles'}</div>
        <div class="ed-format-content">${parseMarkdown(notesMarkdown)}</div>
    </div>` : '';

    return `<div class="ed-format-card">
        <div class="ed-format-header">
            <span class="ed-format-icon">🎮</span>
            <span class="ed-format-title">${t('detail.format.title') || 'Format de l\'édition'}</span>
            ${usingTemplate ? `<span class="ed-format-badge">📋 ${t('detail.format.template') || 'Template'}</span>` : ''}
        </div>
        <div class="ed-format-grid">
            ${formatBlock}
            ${qualifsBlock}
            ${qualificationBlock}
            ${finaleBlock}
        </div>
        ${penaltyHtml}
        ${notesHtml}
    </div>`;
}

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

    // Premier thumb de map disponible pour une édition (sinon null)
    const getEditionMapThumb = (e) => {
        for (let n = 1; n <= 7; n++) {
            if (e[`map${n}thumbUrl`]) return e[`map${n}thumbUrl`];
        }
        return null;
    };

    const renderPlayerBadge = (e) => {
        if (!currentPlayer) return '';
        const isFinaliste = state.data.results.some(r => r.editionId === e.id && r.playerId === currentPlayer.id && r.phase === 'finale');
        const isQualified = state.data.results.some(r => r.editionId === e.id && r.playerId === currentPlayer.id && r.phase === 'qualification');
        const isInscrit   = state.data.results.some(r => r.editionId === e.id && r.playerId === currentPlayer.id && r.phase === 'inscription');
        if (isFinaliste)      return `<div class="edition-card-player-badge finalist">${t('editions.finalist')}</div>`;
        if (isQualified)      return `<div class="edition-card-player-badge qualified">${t('editions.participated')}</div>`;
        if (isInscrit)        return `<div class="edition-card-player-badge">${t('editions.registered')}</div>`;
        return '';
    };

    // ── FEATURED UPCOMING : mini-hero (image map ou TM2020 + countdown XL) ──
    const renderFeaturedUpcoming = (e) => {
        let cardClass = 'event-featured upcoming';
        if (e.status === 'fermee')   cardClass = 'event-featured fermee';
        if (e.status === 'en_cours') cardClass = 'event-featured en-cours';

        const statusLabel = WORKFLOW_LABELS[e.status] || t('editions.status.open');
        const dateStr = new Date(e.date).toLocaleDateString(dateLang(), { day: 'numeric', month: 'long', year: 'numeric' });
        const cardTime = e.time ? ` · ${e.time}` : '';

        const inscritsCount = state.data.results.filter(r => r.editionId === e.id && r.phase === 'inscription').length;
        const cd = getCountdown(e.date, e.time);
        const nbMaps = e.nbMaps || (state.siteConfig?.editionFormat?.qualifs?.mapsCount) || 6;

        const liveBadgeHtml = (e.status === 'en_cours')
            ? `<span class="event-row-live"><span class="live-dot"></span>LIVE</span>`
            : '';

        // CTA inscription intégré si possible
        const alreadyRegistered = currentPlayer && state.data.results.some(r =>
            r.editionId === e.id && r.playerId === currentPlayer.id && r.phase === 'inscription');
        let registerBtnHtml = '';
        if (e.status === 'inscriptions' && !alreadyRegistered) {
            if (!state.currentUser) {
                registerBtnHtml = `<button class="btn btn-primary event-featured-register" onclick="event.stopPropagation();openAuthModal()">${t('editions.login.to.reg')}</button>`;
            } else if (currentPlayer) {
                registerBtnHtml = `<button class="btn btn-primary event-featured-register" onclick="event.stopPropagation();registerForEdition('${e.id}')">${t('editions.register.btn')}</button>`;
            }
        }

        const mapThumb = getEditionMapThumb(e) || tm2020Bg;

        return `<div class="${cardClass}" onclick="openEditionDetail('${e.id}')">
            <div class="event-featured-bg" style="background-image:url('${mapThumb}')"></div>
            <div class="event-featured-overlay"></div>
            <div class="event-featured-accent"></div>
            <div class="event-featured-body">
                <div class="event-featured-left">
                    <div class="event-featured-pill-row">
                        <div class="event-featured-status">${statusLabel}</div>
                        ${liveBadgeHtml}
                        ${renderPlayerBadge(e)}
                    </div>
                    <div class="event-featured-name">${e.name}</div>
                    <div class="event-featured-meta">
                        <span>📅 ${dateStr}${cardTime}</span>
                        <span>👥 ${inscritsCount} ${t('editions.participants')}</span>
                        <span>🗺 ${nbMaps} ${t('editions.maps') || 'maps'}</span>
                    </div>
                    <div class="event-featured-actions">
                        ${registerBtnHtml}
                        <span class="event-featured-cta">${t('editions.see')} →</span>
                    </div>
                </div>
                ${cd ? `<div class="event-featured-countdown">
                    <div class="event-featured-countdown-label">${t('editions.starts.in') || 'Démarre dans'}</div>
                    <div class="event-featured-countdown-value">${cd}</div>
                </div>` : ''}
            </div>
            ${state.isAdmin ? `<div class="event-featured-admin" onclick="event.stopPropagation()">
                <button class="btn btn-secondary btn-small" onclick="openEditEdition('${e.id}')">✏️</button>
                <button class="btn btn-danger btn-small" onclick="deleteEdition('${e.id}')">🗑️</button>
            </div>` : ''}
        </div>`;
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

        const playerBadgeHtml = renderPlayerBadge(e);

        const participantCount = isPast
            ? state.data.results.filter(r => r.editionId === e.id && r.phase === 'qualification').length
            : state.data.results.filter(r => r.editionId === e.id && r.phase === 'inscription').length;
        const finals = state.data.results.filter(r => r.editionId === e.id && r.phase === 'finale').length;

        const descHtml = e.description ? `<div class="event-row-desc">${parseMarkdown(e.description)}</div>` : '';
        const liveBadgeHtml = (!isPast && e.status === 'en_cours')
            ? `<span class="event-row-live"><span class="live-dot"></span>LIVE</span>`
            : '';

        // Past events : image map en fond (très dim) + gradient doré subtil
        let pastBgHtml = '';
        if (isPast) {
            const thumb = getEditionMapThumb(e);
            if (thumb) {
                pastBgHtml = `<div class="event-row-bg" style="background-image:url('${thumb}')"></div><div class="event-row-bg-overlay"></div>`;
            }
        }

        // Past events : mini-podium 1/2/3 avec avatars
        let podiumHtml = '';
        if (isPast) {
            const podium = [1, 2, 3].map(pos => {
                const r = state.data.results.find(x => x.editionId === e.id && x.phase === 'finale' && x.position === pos);
                return r ? state.data.participants.find(p => p.id === r.playerId) : null;
            });
            if (podium[0]) {
                const ringColors = ['rgba(251,191,36,0.6)', 'rgba(192,192,192,0.5)', 'rgba(205,127,50,0.5)'];
                const medals = ['🥇', '🥈', '🥉'];
                const sizes = [44, 32, 32];
                const items = podium.map((pl, i) => {
                    if (!pl) return '';
                    return `<div class="event-row-podium-item rank-${i+1}">
                        ${avatarHtml(pl, { size: sizes[i], ringColor: ringColors[i] })}
                        <div class="event-row-podium-info">
                            <span class="event-row-podium-medal">${medals[i]}</span>
                            <span class="event-row-podium-name">${pName(pl)}</span>
                        </div>
                    </div>`;
                }).filter(Boolean).join('');
                podiumHtml = `<div class="event-row-podium" title="${t('editions.podium') || 'Podium'}">${items}</div>`;
            }
        }

        return `<div class="event-row ${cardClass}${podiumHtml ? ' has-podium' : ''}" onclick="openEditionDetail('${e.id}')">
            ${pastBgHtml}
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
                    ${podiumHtml}
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

    // Featured = upcoming le plus proche (date min >= today, statut != terminee)
    const featuredCandidate = [...allUpcoming].sort((a, b) => new Date(a.date) - new Date(b.date))[0] || null;
    const featuredId = (state.editionFilter !== 'past' && featuredCandidate) ? featuredCandidate.id : null;

    let html = '<div class="event-list">';
    if (upcoming.length > 0) {
        html += `<div class="event-list-section-label upcoming-label"><span>${t('editions.upcoming')}</span></div>`;
        if (featuredId) html += renderFeaturedUpcoming(featuredCandidate);
        upcoming.filter(e => e.id !== featuredId).forEach(e => { html += renderEditionRow(e, false); });
    }
    if (past.length > 0) {
        html += `<div class="event-list-section-label past-label" style="margin-top:${upcoming.length ? 24 : 0}px"><span>${t('editions.past')}</span></div>`;
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
    let e = state.data.editions.find(e => e.id === id);
    if (!e) return;
    state.youtubeCollapsed = sessionStorage.getItem('ytCollapsed_' + id) === '1';
    state.twitchCollapsed  = sessionStorage.getItem('twCollapsed_' + id) === '1';

    // Mode preview admin (sessionStorage par édition) : force le rendu d'un autre statut
    // sans modifier la DB. Activé/désactivé via le bouton "🔍 Prévisualiser" dans le hero.
    const previewStatus = state.isAdmin ? sessionStorage.getItem('preview_status_' + id) : null;
    const isPreview = !!previewStatus && ['en_cours','terminee','inscriptions','fermee'].includes(previewStatus);
    if (isPreview) {
        e = { ...e, status: previewStatus };
    }

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const isPast = new Date(e.date) < today || e.status === 'terminee' || e.status === 'en_cours';
    const dateStr = new Date(e.date).toLocaleDateString(dateLang(), { day: 'numeric', month: 'long', year: 'numeric' });

    const grid = document.getElementById('editionsList');
    const detail = document.getElementById('editionDetail');
    const content = document.getElementById('editionDetailContent');
    const createCard = document.getElementById('createEditionCard');
    const filterBar = document.getElementById('editionFilters');

    grid.style.display = 'none';
    if (filterBar) filterBar.style.display = 'none';
    if (createCard) createCard.style.display = 'none';
    detail.classList.add('open');
    // Masque le bandeau "Next edition" qui apparait au-dessus de la page
    if (typeof window.displayNextEditionBanner === 'function') window.displayNextEditionBanner();

    let html = '';

    // Banner "Mode prévisualisation" admin si preview actif (sessionStorage)
    if (isPreview) {
        html += `<div style="background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.32);border-radius:var(--radius-md);padding:10px 16px;margin-bottom:var(--space-md);display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <span style="font-size:1.1rem">🔍</span>
            <strong style="color:#38bdf8;font-size:var(--text-sm)">${t('detail.preview.label') || 'Mode prévisualisation'}</strong>
            <span style="color:rgba(255,255,255,0.65);font-size:var(--text-sm)">${t('detail.preview.desc.short') || `Statut affiché : ${previewStatus}`}. ${t('detail.preview.desc.note') || 'Aucune modification en base.'}</span>
            <button onclick="setPreviewStatus('${id}', null)" style="margin-left:auto;background:rgba(56,189,248,0.15);border:1px solid rgba(56,189,248,0.4);color:#38bdf8;font-size:var(--text-xs);font-weight:var(--fw-bold);padding:5px 12px;border-radius:var(--radius-sm);cursor:pointer;font-family:inherit">${t('detail.preview.exit') || 'Sortir du mode preview'}</button>
        </div>`;
    }

    if (isPast) {
        // Calculer les résultats AVANT le hero (utilisés par renderEditionHeroLive/Podium)
        const edResults     = state.data.results.filter(r => r.editionId === e.id);
        const finaleResults = edResults.filter(r => r.phase === 'finale').sort((a, b) => a.position - b.position);
        const qualResults   = edResults.filter(r => r.phase === 'qualification');

        // Hero adapté au statut : LIVE si en_cours, PODIUM si terminée
        if (e.status === 'en_cours') {
            html += renderEditionHeroLive(e, qualResults);
        } else {
            html += renderEditionHeroPodium(e, finaleResults);
        }

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

        const ytId = extractYoutubeId(e.youtubeUrl);
        const vodEmbedHtml = ytId ? `
            <div class="vod-section-label" style="justify-content:space-between;margin-bottom:0">
                <span>${t('detail.vod')}</span>
                <button onclick="toggleYoutubeEmbed(this)" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.22);border-radius:6px;color:var(--color-text-primary);cursor:pointer;font-size:0.78rem;font-weight:600;padding:4px 12px;font-family:inherit">${state.youtubeCollapsed ? t('detail.show') : t('detail.hide')}</button>
            </div>
            <div id="youtubeEmbedWrap" class="vod-embed-wrap" style="margin-top:10px${state.youtubeCollapsed ? ';display:none' : ''}">
                <iframe src="https://www.youtube.com/embed/${ytId}" allowfullscreen loading="lazy"></iframe>
            </div>` : '';

        // Description markdown (si présente, hors hero) — le titre + Twitch sont déjà dans le hero
        const descCardHtml = e.description ? `<div class="card" style="margin-bottom:var(--space-md)">
            <div style="color:var(--color-text-secondary);font-size:0.9rem;line-height:1.6">${parseMarkdown(e.description)}</div>
        </div>` : '';

        html += descCardHtml;
        if (vodEmbedHtml) html += `<div class="card">${vodEmbedHtml}</div>`;
        html += `<div class="card">`;

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
                    const ringColor = r.position === 1 ? 'rgba(251,191,36,0.6)'
                                    : r.position === 2 ? 'rgba(203,213,225,0.6)'
                                    : 'rgba(205,127,50,0.6)';
                    html += `<div class="podium-spot">
                        <div class="podium-player">
                            <div class="podium-medal">${medals[r.position] || r.position}</div>
                            <div style="display:flex;justify-content:center;margin-bottom:6px">${avatarHtml(player, { size: 48, ringColor })}</div>
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
                    <td><div style="display:inline-flex;align-items:center;gap:10px">${avatarHtml(player, { size: 28 })}<strong class="player-name-link" onclick="openPlayerProfile('${player.id}')">${pName(player)}</strong>${playerBadgesHtml(player.id)}</div></td>
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

        const inscriptions = state.data.results.filter(r => r.editionId === id && r.phase === 'inscription');

        // Block "mot de passe du salon" — visible en grand en haut de la page,
        // pour les inscrits, indépendant du status de l'édition. Comme ça si
        // un joueur a une déco pendant les qualifs il retrouve toujours son mdp.
        const isMeRegisteredTop = inscriptions.some(r => {
            const p = state.data.participants.find(p => p.id === r.playerId);
            return p && state.currentUser && p.userId === state.currentUser.uid;
        });
        const passwordBlockHtml = (isMeRegisteredTop && e.password) ? `
            <div style="background:rgba(0,217,54,0.04);border:1px solid rgba(0,217,54,0.22);border-radius:var(--radius-md);padding:18px 22px;margin-bottom:var(--space-lg);display:flex;align-items:center;justify-content:space-between;gap:var(--space-md);flex-wrap:wrap;position:relative;overflow:hidden">
                <div style="position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--color-accent)"></div>
                <div style="display:flex;align-items:center;gap:14px;min-width:0;flex:1;padding-left:8px">
                    <span style="font-size:1.6rem;flex-shrink:0;opacity:0.85">🔐</span>
                    <div style="min-width:0">
                        <div style="font-size:var(--text-xs);font-weight:var(--fw-bold);letter-spacing:var(--tracking-wider);text-transform:uppercase;color:var(--color-accent);margin-bottom:6px">${t('detail.password.banner')}</div>
                        <div style="font-size:var(--text-lg);font-weight:var(--fw-black);color:#fff;font-family:'JetBrains Mono','Courier New',monospace;letter-spacing:var(--tracking-wide);word-break:break-all">${e.password}</div>
                    </div>
                </div>
                <button onclick="navigator.clipboard.writeText('${e.password.replace(/'/g, "\\'")}').then(()=>showToast?.('✓ Copié'))" style="padding:9px 16px;background:transparent;border:1px solid rgba(0,217,54,0.3);color:var(--color-accent);border-radius:var(--radius-sm);font-weight:var(--fw-bold);font-size:var(--text-sm);cursor:pointer;font-family:inherit;white-space:nowrap;transition:all var(--tr-fast)" onmouseover="this.style.background='rgba(0,217,54,0.1)';this.style.borderColor='rgba(0,217,54,0.5)'" onmouseout="this.style.background='transparent';this.style.borderColor='rgba(0,217,54,0.3)'">📋 ${t('detail.password.copy')}</button>
            </div>` : '';

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
                    <td><div style="display:inline-flex;align-items:center;gap:10px">${avatarHtml(player, { size: 28 })}<strong class="player-name-link" onclick="openPlayerProfile('${player.id}')">${pName(player)}</strong>${playerBadgesHtml(player.id)}${isMe ? ` <span style="color:var(--color-accent);font-size:0.8rem">${t('msg.you')}</span>` : ''}</div></td>
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

        // ── Hero data ────────────────────────────────────────
        const statusKey = e.status || 'inscriptions';
        const statusLabels = {
            inscriptions: t('editions.status.open'),
            fermee:       t('editions.status.closed'),
            en_cours:     t('editions.status.live'),
            terminee:     t('editions.status.done'),
        };
        const statusLabel = statusLabels[statusKey] || statusLabels.inscriptions;
        const countdown = getCountdown(e.date, e.time);

        // KPI strip — date / time / inscrits (countdown XL à part, maps/qualifs dans la grid format)
        const kpis = [
            { icon: '📅', label: t('detail.kpi.date') || 'Date', value: dateStr },
            ...(e.time ? [{ icon: '🕐', label: t('detail.kpi.time') || 'Heure', value: e.time }] : []),
            { icon: '👥', label: t('detail.kpi.registered') || 'Inscrits', value: `${inscriptions.length}` },
        ];
        const kpisHtml = `<div class="ed-kpis">${kpis.map(k => `
            <div class="ed-kpi">
                <div class="ed-kpi-label">${k.icon} ${k.label}</div>
                <div class="ed-kpi-value">${k.value}</div>
            </div>`).join('')}</div>`;

        // Countdown XL à droite (upcoming uniquement) — ou badge LIVE si en_cours
        let countdownXlHtml = '';
        if (statusKey === 'en_cours') {
            countdownXlHtml = `<div class="ed-hero-countdown live">
                <div class="ed-hero-countdown-label"><span class="live-dot"></span> ${t('editions.status.live') || 'EN DIRECT'}</div>
                <div class="ed-hero-countdown-value">LIVE</div>
            </div>`;
        } else if (countdown && statusKey !== 'terminee') {
            countdownXlHtml = `<div class="ed-hero-countdown">
                <div class="ed-hero-countdown-label">${t('detail.kpi.countdown') || 'Dans'}</div>
                <div class="ed-hero-countdown-value">${countdown}</div>
            </div>`;
        }

        // Hero header (status pill + admin edit btn + preview dropdown)
        const previewBtn = renderAdminPreviewBtn(e.id, sessionStorage.getItem('preview_status_' + e.id));
        const editBtn = state.isAdmin ? `<div style="margin-left:auto;display:inline-flex;gap:8px;align-items:center">
            ${previewBtn}
            <button class="btn btn-secondary btn-small" onclick="openEditEdition('${e.id}')">✏️ ${t('common.edit') || 'Modifier'}</button>
        </div>` : '';

        // Action zone (Register + Discord/Twitch branded)
        const discordUrl = state.siteConfig?.discordUrl || state.siteConfig?.discordInviteUrl;
        const twitchUrl  = state.siteConfig?.twitchUrl;
        const discordBtn = discordUrl ? `<a href="${discordUrl}" target="_blank" rel="noopener" class="ed-link-btn discord">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
            ${t('detail.btn.discord') || 'Rejoindre le Discord'}
        </a>` : '';
        const twitchBtn  = twitchUrl ? `<a href="${twitchUrl}" target="_blank" rel="noopener" class="ed-link-btn twitch">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>
            ${t('detail.btn.twitch') || 'Suivre sur Twitch'}
        </a>` : '';

        const heroHtml = `<div class="ed-hero">
            <div class="ed-hero-bg" style="background-image:url('${tm2020Bg}')"></div>
            <div class="ed-hero-status-row">
                <span class="ed-hero-status ${statusKey}">${statusLabel}</span>
                ${e.club ? `<span style="font-size:var(--text-xs);color:rgba(255,255,255,0.45);text-transform:uppercase;letter-spacing:var(--tracking-wider);font-weight:var(--fw-semibold)">🏛️ ${e.club}</span>` : ''}
                ${e.salon ? `<span style="font-size:var(--text-xs);color:rgba(255,255,255,0.45);text-transform:uppercase;letter-spacing:var(--tracking-wider);font-weight:var(--fw-semibold)">🎮 ${e.salon}</span>` : ''}
                ${editBtn}
            </div>
            <div class="ed-hero-main">
                <div class="ed-hero-title-col">
                    <div class="ed-hero-title">${e.name}</div>
                </div>
                ${countdownXlHtml}
            </div>
            ${kpisHtml}
            <div class="ed-action-zone">
                ${registrationHtml}
                ${discordBtn}
                ${twitchBtn}
            </div>
        </div>`;

        // ── Format card — rendu structuré + notes markdown ──
        const formatCardHtml = renderFormatCard(e);

        html = `${heroHtml}
            ${workflowHtml ? `<div class="card" style="margin-bottom:var(--space-md);padding:0">${workflowHtml}</div>` : ''}
            ${twitchEmbedHtml ? `<div class="card">${twitchEmbedHtml}</div>` : ''}
            ${passwordBlockHtml}
            ${formatCardHtml}
            <div class="card">
                <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:var(--space-md)">
                    <h2 style="margin:0">👥 ${t('detail.registered.list')} <span style="color:var(--color-text-secondary);font-weight:var(--fw-medium)">(${inscriptions.length})</span></h2>
                    ${inscriptions.length > 0 && state.isAdmin ? `<div style="display:flex;gap:8px;flex-wrap:wrap">
                        <button onclick="exportGuestlist('${id}','xml')" style="padding:5px 12px;border-radius:7px;background:rgba(0,217,54,0.1);border:1px solid rgba(0,217,54,0.3);color:var(--color-accent);font-size:var(--text-xs);font-weight:var(--fw-bold);cursor:pointer;font-family:inherit">⬇️ Export XML</button>
                        <button onclick="exportGuestlist('${id}','csv')" style="padding:5px 12px;border-radius:7px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:#ccc;font-size:var(--text-xs);font-weight:var(--fw-bold);cursor:pointer;font-family:inherit">⬇️ Export CSV</button>
                    </div>` : ''}
                </div>
                ${registrantsHtml}
                ${adminInscriptionHtml}
            </div>
            ${renderPreviousChampionsSection(id)}`;
    }

    content.innerHTML = html;

    // Post-process : convertit les <li>/<p> qui commencent par certains emojis en callouts visuels
    // ⚠️ → warning (rouge), ⚡ → info (jaune), 🔒 → neutre (bleu)
    const formatContent = content.querySelector('.ed-format-content');
    if (formatContent) {
        const calloutMap = [
            { emoji: '⚠️', cls: 'warning' },
            { emoji: '⚡',  cls: 'info' },
            { emoji: '🔒', cls: 'neutral' },
        ];
        formatContent.querySelectorAll('li, p').forEach(el => {
            const txt = el.textContent.trim();
            const found = calloutMap.find(c => txt.startsWith(c.emoji));
            if (found) el.classList.add(`ed-format-callout`, found.cls);
        });
    }

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
    // Ré-affiche le bandeau "next edition" maintenant qu'on quitte le détail
    if (typeof window.displayNextEditionBanner === 'function') window.displayNextEditionBanner();
};

// Helpers partage : récupère URL + textes pour l'édition courante
function _getShareInfo() {
    if (!state.currentDetailEditionId) return null;
    const e = state.data.editions.find(ed => ed.id === state.currentDetailEditionId);
    if (!e) return null;
    const url = new URL(window.location);
    url.searchParams.set('edition', state.currentDetailEditionId);
    const dateStr = new Date(e.date).toLocaleDateString(dateLang(), { day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = e.time ? ` à ${e.time}` : '';
    return { e, url: url.toString(), dateStr, timeStr };
}

function _closeAllShareMenus() {
    document.querySelectorAll('.ed-share-menu').forEach(m => { m.hidden = true; });
    document.querySelectorAll('.ed-share-toggle').forEach(b => b.setAttribute('aria-expanded', 'false'));
}
window._closeAllShareMenus = _closeAllShareMenus;

window.toggleShareMenu = (btn, ev) => {
    if (ev) ev.stopPropagation();
    const wrap = btn.parentElement;
    const menu = wrap.querySelector('.ed-share-menu');
    if (!menu) return;
    const willOpen = menu.hidden;
    _closeAllShareMenus();
    if (willOpen) {
        menu.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
    }
};

// Click extérieur OU Esc → ferme tous les menus partage (handler global, installé une seule fois)
if (!window._shareMenuHandlersInstalled) {
    window._shareMenuHandlersInstalled = true;
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.ed-share-wrap')) _closeAllShareMenus();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') _closeAllShareMenus();
    });
}

window.shareEdition = (btn) => {
    const info = _getShareInfo();
    if (!info) return;
    navigator.clipboard.writeText(info.url).then(() => {
        showToast(t('player.link.copied') || '✓ Lien copié');
        if (btn) {
            btn.classList.add('copied');
            setTimeout(() => btn.classList.remove('copied'), 1500);
        }
    });
};

window.shareEditionTwitter = () => {
    const info = _getShareInfo();
    if (!info) return;
    const text = `🏆 ${info.e.name} — ${info.dateStr}${info.timeStr}\n${t('share.twitter.text') || 'Rejoins-nous pour la prochaine cup Trackmania !'}`;
    const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(info.url)}`;
    window.open(intent, '_blank', 'noopener,noreferrer');
};

window.shareEditionDiscord = (btn) => {
    const info = _getShareInfo();
    if (!info) return;
    // Format Discord-friendly avec embeds auto
    const msg = `**🏆 ${info.e.name}**\n📅 ${info.dateStr}${info.timeStr}\n${info.url}`;
    navigator.clipboard.writeText(msg).then(() => {
        showToast(t('share.discord.copied') || '✓ Message Discord copié dans le presse-papier');
        if (btn) {
            btn.classList.add('copied');
            setTimeout(() => btn.classList.remove('copied'), 1500);
        }
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
