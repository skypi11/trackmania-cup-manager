// modules/display-home.js — Section Accueil + bandeau prochaine édition

import { state } from './state.js';
import { t } from '../../shared/i18n.js';
import { pName, dateLang, getCountdown } from './utils.js';

export function displayHome() {
    const container = document.getElementById('homeContent');
    if (!container) return;
    const today = new Date(); today.setHours(0,0,0,0);

    const liveEdition = state.data.editions.find(e => e.status === 'en_cours');
    const nextEdition = state.data.editions
        .filter(e => new Date(e.date) >= today && e.status !== 'terminee' && e.status !== 'en_cours')
        .sort((a,b) => new Date(a.date) - new Date(b.date))[0];

    const totalEditions = state.data.editions.filter(e => new Date(e.date) < today || e.status === 'terminee').length;
    const totalPlayers = state.data.participants.length;
    const totalParticipations = new Set(state.data.results.filter(r => r.phase === 'qualification' || r.phase === 'inscription').map(r => `${r.playerId}_${r.editionId}`)).size;

    const currentPlayer = state.currentUser ? state.data.participants.find(p => p.userId === state.currentUser.uid) : null;

    // Featured event block
    let featuredHtml = '';
    if (liveEdition) {
        featuredHtml = `<div class="home-event-card live" onclick="showSection('editions');openEditionDetail('${liveEdition.id}')">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
                <span class="live-dot" style="width:8px;height:8px"></span>
                <span style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#fbbf24">${t('detail.live.twitch')}</span>
            </div>
            <div style="font-size:1.2rem;font-weight:800;margin-bottom:14px">${liveEdition.name}</div>
            <a href="${state.siteConfig.twitchUrl}" target="_blank" rel="noopener"
               onclick="event.stopPropagation()"
               style="display:inline-flex;align-items:center;gap:8px;text-decoration:none;padding:10px 18px;border-radius:10px;background:linear-gradient(135deg,#9146ff,#7b2fff);color:#fff;font-weight:700;font-size:0.88rem">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>
                ${t('detail.watch.twitch')}
            </a>
        </div>`;
    } else if (nextEdition) {
        const dateStr = new Date(nextEdition.date).toLocaleDateString(dateLang(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const timeStr = nextEdition.time ? ` à ${nextEdition.time}` : '';
        const countdown = getCountdown(nextEdition.date, nextEdition.time);
        const isRegistered = currentPlayer && state.data.results.some(r => r.editionId === nextEdition.id && r.playerId === currentPlayer.id && r.phase === 'inscription');
        let ctaHtml = '';
        if (nextEdition.status === 'inscriptions') {
            if (!state.currentUser) ctaHtml = `<button class="btn btn-primary" onclick="event.stopPropagation();openAuthModal()" style="margin-top:18px">${t('editions.login.to.reg')}</button>`;
            else if (isRegistered) ctaHtml = `<div class="registered-badge" style="margin-top:16px">${t('editions.already.reg')}</div>`;
            else if (currentPlayer) ctaHtml = `<button class="btn btn-primary" onclick="event.stopPropagation();registerForEdition('${nextEdition.id}')" style="margin-top:18px">${t('editions.register.btn')}</button>`;
        }
        featuredHtml = `<div class="home-event-card" onclick="showSection('editions');openEditionDetail('${nextEdition.id}')">
            <div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--color-warning);margin-bottom:12px">${t('home.next.label')}</div>
            <div style="font-size:1.2rem;font-weight:800;margin-bottom:10px">${nextEdition.name}</div>
            <div style="font-size:0.87rem;color:rgba(255,255,255,0.4);margin-bottom:10px">📅 ${dateStr}${timeStr}</div>
            ${countdown ? `<span class="event-countdown-pill">⏱ ${countdown}</span>` : ''}
            ${ctaHtml}
        </div>`;
    } else {
        featuredHtml = `<div class="home-event-card" style="text-align:center;padding:40px 24px;cursor:default">
            <div style="font-size:2rem;margin-bottom:12px">🏁</div>
            <div style="color:rgba(255,255,255,0.3);font-size:0.9rem">${t('home.no.event')}</div>
        </div>`;
    }

    // Last champions
    const pastWithChampion = state.data.editions
        .filter(e => state.data.results.some(r => r.editionId === e.id && r.phase === 'finale' && r.position === 1))
        .sort((a,b) => new Date(b.date) - new Date(a.date))
        .slice(0, 3);

    let championsHtml = '';
    if (pastWithChampion.length > 0) {
        const cards = pastWithChampion.map(e => {
            const winner = state.data.results.find(r => r.editionId === e.id && r.phase === 'finale' && r.position === 1);
            const player = winner ? state.data.participants.find(p => p.id === winner.playerId) : null;
            if (!player) return '';
            const dateStr = new Date(e.date).toLocaleDateString(dateLang(), { month: 'long', year: 'numeric' });
            return `<div class="home-champion-card" onclick="showSection('editions');openEditionDetail('${e.id}')">
                <div class="home-champion-edition">${e.name}</div>
                <div class="home-champion-winner">🥇 ${pName(player)}</div>
                <div class="home-champion-meta">${dateStr}${player.team && player.team !== 'Sans équipe' ? ' · ' + player.team : ''}</div>
            </div>`;
        }).join('');
        championsHtml = `<div class="home-champions">
            <div class="home-champions-title">${t('home.champions')}</div>
            <div class="home-champions-grid">${cards}</div>
        </div>`;
    }

    const guestCtaHtml = !state.currentUser ? `
        <div style="background:linear-gradient(135deg,rgba(0,0,0,0.18),rgba(0,0,0,0.12));border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:22px 26px;display:flex;align-items:center;gap:18px;margin-bottom:20px">
            <div style="font-size:2rem;flex-shrink:0;filter:drop-shadow(0 0 10px rgba(255,255,255,0.15))">🎮</div>
            <div style="flex:1">
                <div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--color-accent);margin-bottom:4px">${t('cta.title')}</div>
                <div style="font-size:0.83rem;color:var(--color-text-secondary);line-height:1.5">${t('cta.desc')}</div>
                <div style="display:flex;gap:16px;margin-top:8px">
                    <div style="font-size:0.75rem;color:rgba(255,255,255,0.3)">🔑 ${t('cta.step1')}</div>
                    <div style="font-size:0.75rem;color:rgba(255,255,255,0.3)">✏️ ${t('cta.step2')}</div>
                    <div style="font-size:0.75rem;color:rgba(255,255,255,0.3)">🏆 ${t('cta.step3')}</div>
                </div>
            </div>
            <button onclick="openAuthModal()" style="flex-shrink:0;background:var(--color-accent);color:#000;border:none;border-radius:10px;padding:12px 22px;font-weight:800;font-size:0.85rem;cursor:pointer;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap;transition:opacity 0.2s" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">${t('cta.btn')}</button>
        </div>` : '';

    container.innerHTML = `
        <div class="home-hero">
            <img src="../assets/springs-logo.png" class="home-hero-logo" alt="Springs Esport">
            <div class="home-hero-title">${state.siteConfig.siteName}</div>
            <div class="home-hero-sub">${state.siteConfig.siteSubtitle}</div>
            ${featuredHtml}
        </div>
        ${guestCtaHtml}
        <div class="home-stats">
            <div class="home-stat"><div class="home-stat-value">${totalEditions}</div><div class="home-stat-label">${t('home.stat.editions')}</div></div>
            <div class="home-stat"><div class="home-stat-value">${totalPlayers}</div><div class="home-stat-label">${t('home.stat.players')}</div></div>
            <div class="home-stat"><div class="home-stat-value">${totalParticipations}</div><div class="home-stat-label">${t('home.stat.participations')}</div></div>
        </div>
        ${championsHtml}`;
}

export function displayNextEditionBanner() {
    const banner = document.getElementById('nextEditionBanner');
    const today = new Date(); today.setHours(0,0,0,0);
    const upcoming = state.data.editions
        .filter(e => new Date(e.date) >= today && e.status !== 'terminee')
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (upcoming.length === 0) { banner.style.display = 'none'; return; }
    const next = upcoming[0];

    const dateStr = new Date(next.date).toLocaleDateString(dateLang(), { day: 'numeric', month: 'long', year: 'numeric' });
    const cd = getCountdown(next.date, next.time);

    const statusMap = {
        fermee:       { label: t('editions.status.closed'),  color: 'var(--color-text-secondary)' },
        inscriptions: { label: t('editions.status.open'), color: 'var(--springs-orange)' },
        en_cours:     { label: t('editions.status.live'),    color: '#fbbf24' },
    };
    const statusInfo = statusMap[next.status] || statusMap.inscriptions;

    const currentPlayer = state.currentUser ? state.data.participants.find(p => p.userId === state.currentUser.uid) : null;
    const alreadyRegistered = currentPlayer
        ? state.data.results.some(r => r.editionId === next.id && r.playerId === currentPlayer.id && r.phase === 'inscription')
        : false;
    const inscritCount = state.data.results.filter(r => r.editionId === next.id && r.phase === 'inscription').length;

    let ctaHtml = '';
    const nStatus = next.status || 'inscriptions';
    if (nStatus === 'fermee') {
        ctaHtml = `<span style="color:var(--color-text-secondary);font-size:0.85rem">${t('detail.status.soon')}</span>`;
    } else if (nStatus === 'inscriptions') {
        if (!state.currentUser) {
            ctaHtml = `<button class="btn btn-primary" onclick="openAuthModal()">${t('editions.login.to.reg')}</button>`;
        } else if (alreadyRegistered) {
            ctaHtml = `<div class="registered-badge" style="font-size:0.85rem;padding:8px 14px">${t('editions.already.reg')}</div>`;
        } else if (currentPlayer) {
            ctaHtml = `<button class="btn btn-primary" onclick="goToEdition('${next.id}')">${t('editions.register.btn')}</button>`;
        }
    } else if (nStatus === 'en_cours') {
        ctaHtml = `<span style="color:#fbbf24;font-weight:700;font-size:0.9rem">${t('editions.status.live')}</span>`;
    }

    const metaItems = [`📅 ${dateStr}`];
    if (next.time)  metaItems.push(`🕐 ${next.time}`);
    if (next.club)  metaItems.push(`🏛️ ${next.club}`);
    if (next.salon) metaItems.push(`🎮 ${next.salon}`);

    banner.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:24px">
            <div style="flex:1;min-width:220px">
                <div class="next-edition-label">${t('home.next.edition')}</div>
                <div class="next-edition-name">${next.name}</div>
                <div class="next-edition-meta">${metaItems.join(' &nbsp;·&nbsp; ')}</div>
                <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
                    ${ctaHtml}
                    <button class="btn btn-secondary" onclick="goToEdition('${next.id}')">${t('editions.see.edition')}</button>
                </div>
            </div>
            <div style="text-align:right;flex-shrink:0">
                <div style="font-size:0.68rem;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">${t('editions.countdown')}</div>
                <div class="next-edition-countdown">${cd || t('editions.soon')}</div>
                <div style="margin-top:10px;font-size:0.8rem;color:var(--color-text-secondary)">👥 ${inscritCount} ${t('editions.inscribed')}</div>
                <div style="margin-top:4px;font-size:0.8rem;font-weight:700;color:${statusInfo.color}">${statusInfo.label}</div>
            </div>
        </div>`;
    banner.style.display = 'block';
}
