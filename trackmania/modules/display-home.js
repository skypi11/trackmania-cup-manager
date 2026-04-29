// modules/display-home.js — Section Accueil + bandeau prochaine édition

import { state } from './state.js';
import { t } from '../../shared/i18n.js';
import { pName, dateLang, getCountdown, getPoints } from './utils.js';
import springsLogo from '../../assets/springs-logo.png';

export function displayHome() {
    const container = document.getElementById('homeContent');
    if (!container) return;
    const today = new Date(); today.setHours(0,0,0,0);

    const liveEdition = state.data.editions.find(e => e.status === 'en_cours');
    const nextEdition = state.data.editions
        .filter(e => new Date(e.date) >= today && e.status !== 'terminee' && e.status !== 'en_cours')
        .sort((a,b) => new Date(a.date) - new Date(b.date))[0];

    const totalEditions      = state.data.editions.filter(e => new Date(e.date) < today || e.status === 'terminee').length;
    const totalPlayers       = state.data.participants.length;
    const pastEdIds = new Set(state.data.editions.filter(e => new Date(e.date) < today || e.status === 'terminee').map(e => e.id));
    const totalParticipations = new Set(
        state.data.results.filter(r => pastEdIds.has(r.editionId)).map(r => `${r.playerId}_${r.editionId}`)
    ).size;

    const currentPlayer = state.currentUser
        ? state.data.participants.find(p => p.userId === state.currentUser.uid)
        : null;

    // ── Event card ────────────────────────────────────────────────────────
    let featuredHtml = '';
    if (liveEdition) {
        featuredHtml = `<div class="home-event-card live" onclick="showSection('editions');openEditionDetail('${liveEdition.id}')">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
                <span class="live-dot" style="width:8px;height:8px;animation:pulse 1.5s infinite"></span>
                <span style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#ef4444">🔴 En direct maintenant</span>
            </div>
            <div style="font-size:1.25rem;font-weight:800;margin-bottom:16px">${liveEdition.name}</div>
            <a href="${state.siteConfig?.twitchUrl || 'https://www.twitch.tv/springsesport'}" target="_blank" rel="noopener"
               onclick="event.stopPropagation()"
               style="display:inline-flex;align-items:center;gap:8px;text-decoration:none;padding:10px 20px;border-radius:10px;background:linear-gradient(135deg,#9146ff,#6d28d9);color:#fff;font-weight:700;font-size:0.88rem;box-shadow:0 4px 16px rgba(145,70,255,0.3)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>
                Regarder sur Twitch
            </a>
        </div>`;
    } else if (nextEdition) {
        const dateStr = new Date(nextEdition.date).toLocaleDateString(dateLang(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const timeStr = nextEdition.time ? ` à ${nextEdition.time}` : '';
        const countdown = getCountdown(nextEdition.date, nextEdition.time);
        const isRegistered = currentPlayer && state.data.results.some(
            r => r.editionId === nextEdition.id && r.playerId === currentPlayer.id && r.phase === 'inscription'
        );
        let ctaHtml = '';
        if (nextEdition.status === 'inscriptions') {
            if (!state.currentUser) ctaHtml = `<button class="btn btn-primary" style="margin-top:16px" onclick="event.stopPropagation();openAuthModal()">${t('editions.login.to.reg')}</button>`;
            else if (isRegistered) ctaHtml = `<div class="registered-badge" style="margin-top:14px">${t('editions.already.reg')}</div>`;
            else if (currentPlayer) ctaHtml = `<button class="btn btn-primary" style="margin-top:16px" onclick="event.stopPropagation();registerForEdition('${nextEdition.id}')">${t('editions.register.btn')}</button>`;
        }
        featuredHtml = `<div class="home-event-card next" onclick="showSection('editions');openEditionDetail('${nextEdition.id}')">
            <div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--color-warning);margin-bottom:10px">⏰ ${t('home.next.label')}</div>
            <div style="font-size:1.2rem;font-weight:800;margin-bottom:10px">${nextEdition.name}</div>
            <div style="font-size:0.85rem;color:rgba(255,255,255,0.38);margin-bottom:10px">📅 ${dateStr}${timeStr}</div>
            ${countdown ? `<div style="display:inline-flex;align-items:center;gap:6px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2);border-radius:99px;padding:5px 14px;font-size:0.82rem;color:var(--color-warning);font-weight:600">⏱ ${countdown}</div>` : ''}
            ${ctaHtml}
        </div>`;
    } else {
        featuredHtml = `<div class="home-event-card" style="text-align:center;padding:36px 24px;cursor:default">
            <div style="font-size:2rem;margin-bottom:10px">🏁</div>
            <div style="color:rgba(255,255,255,0.28);font-size:0.88rem">${t('home.no.event')}</div>
        </div>`;
    }

    // ── Carte personnelle (joueur connecté + inscrit) ──────────────────────
    let personalHtml = '';
    if (currentPlayer) {
        const myFinales = state.data.results.filter(r => r.playerId === currentPlayer.id && r.phase === 'finale');
        const myPts   = myFinales.reduce((s, r) => s + getPoints(r.position), 0);
        const myWins  = myFinales.filter(r => r.position === 1).length;
        const myParts = new Set(
            state.data.results
                .filter(r => r.playerId === currentPlayer.id && pastEdIds.has(r.editionId))
                .map(r => r.editionId)
        ).size;
        const initial = pName(currentPlayer).charAt(0).toUpperCase();
        personalHtml = `<div class="home-personal-card">
            <div class="home-personal-avatar">${initial}</div>
            <div style="flex:1;min-width:0">
                <div style="font-weight:700;font-size:0.95rem;margin-bottom:5px">${pName(currentPlayer)}</div>
                <div class="home-personal-stats">
                    <div class="home-personal-stat">
                        <div class="home-personal-stat-val">${myPts}</div>
                        <div class="home-personal-stat-lbl">Points</div>
                    </div>
                    <div class="home-personal-stat">
                        <div class="home-personal-stat-val">${myWins}</div>
                        <div class="home-personal-stat-lbl">${t('stats.wins')}</div>
                    </div>
                    <div class="home-personal-stat">
                        <div class="home-personal-stat-val">${myParts}</div>
                        <div class="home-personal-stat-lbl">${t('stats.participations')}</div>
                    </div>
                </div>
            </div>
            <button onclick="showSection('rankings')" style="flex-shrink:0;background:rgba(0,217,54,0.08);border:1px solid rgba(0,217,54,0.2);border-radius:10px;padding:8px 14px;color:var(--color-accent);font-size:0.78rem;font-weight:600;cursor:pointer;font-family:inherit;transition:all 0.18s;white-space:nowrap" onmouseover="this.style.background='rgba(0,217,54,0.14)'" onmouseout="this.style.background='rgba(0,217,54,0.08)'">Classement →</button>
        </div>`;
    }

    // ── Accès rapide ──────────────────────────────────────────────────────
    const quickNav = [
        { icon: '🏆', label: t('nav.rankings'), section: 'rankings' },
        { icon: '🔮', label: t('nav.predictions'), section: 'predictions' },
        { icon: '⚔️', label: 'Duel', section: 'duel' },
    ];
    const quickNavHtml = `<div class="home-quicknav">
        ${quickNav.map(q => `<button class="home-quicknav-btn" onclick="showSection('${q.section}')">
            <div class="home-quicknav-icon">${q.icon}</div>
            <div class="home-quicknav-label">${q.label}</div>
        </button>`).join('')}
    </div>`;

    // ── Derniers champions ────────────────────────────────────────────────
    const pastWithChampion = state.data.editions
        .filter(e => state.data.results.some(r => r.editionId === e.id && r.phase === 'finale' && r.position === 1))
        .sort((a,b) => new Date(b.date) - new Date(a.date))
        .slice(0, 3);

    let championsHtml = '';
    if (pastWithChampion.length > 0) {
        const cards = pastWithChampion.map((e, i) => {
            const winner = state.data.results.find(r => r.editionId === e.id && r.phase === 'finale' && r.position === 1);
            const player = winner ? state.data.participants.find(p => p.id === winner.playerId) : null;
            if (!player) return '';
            const dateStr = new Date(e.date).toLocaleDateString(dateLang(), { month: 'long', year: 'numeric' });
            return `<div class="home-champion-card" onclick="showSection('editions');openEditionDetail('${e.id}')">
                <div class="home-champion-medal">${i === 0 ? '🏆' : '🥇'}</div>
                <div class="home-champion-edition">${e.name}</div>
                <div class="home-champion-winner">${pName(player)}</div>
                <div class="home-champion-meta">${dateStr}${player.team && player.team !== 'Sans équipe' ? ' · ' + player.team : ''}</div>
            </div>`;
        }).join('');
        championsHtml = `<div class="home-champions">
            <div class="home-champions-title">${t('home.champions')}</div>
            <div class="home-champions-grid">${cards}</div>
        </div>`;
    }

    // ── CTA inscription (visiteur non connecté) ───────────────────────────
    const guestCtaHtml = !state.currentUser ? `
        <div style="margin:20px 40px 0;background:linear-gradient(135deg,rgba(0,217,54,0.05),rgba(0,0,0,0.1));border:1px solid rgba(0,217,54,0.12);border-radius:16px;padding:20px 24px;display:flex;align-items:center;gap:16px">
            <div style="font-size:1.8rem;flex-shrink:0">🎮</div>
            <div style="flex:1">
                <div style="font-size:0.85rem;font-weight:700;margin-bottom:3px">${t('cta.title')}</div>
                <div style="font-size:0.78rem;color:var(--color-text-secondary);line-height:1.5">${t('cta.desc')}</div>
            </div>
            <button onclick="openAuthModal()" style="flex-shrink:0;background:var(--color-accent);color:#000;border:none;border-radius:10px;padding:10px 18px;font-weight:800;font-size:0.82rem;cursor:pointer;white-space:nowrap;font-family:inherit">${t('cta.btn')}</button>
        </div>` : '';

    container.innerHTML = `
        <div class="home-hero">
            <img src="${springsLogo}" class="home-hero-logo" alt="Springs Esport">
            <div class="home-hero-title">${state.siteConfig?.siteName || 'Springs Monthly Cup'}</div>
            <div class="home-hero-sub">${state.siteConfig?.siteSubtitle || 'Springs E-Sport · EN LIGNE'}</div>
            ${featuredHtml}
        </div>
        <div class="home-stats">
            <div class="home-stat"><div class="home-stat-value">${totalEditions}</div><div class="home-stat-label">${t('home.stat.editions')}</div></div>
            <div class="home-stat"><div class="home-stat-value">${totalPlayers}</div><div class="home-stat-label">${t('home.stat.players')}</div></div>
            <div class="home-stat"><div class="home-stat-value">${totalParticipations}</div><div class="home-stat-label">${t('home.stat.participations')}</div></div>
        </div>
        ${personalHtml}
        ${guestCtaHtml}
        ${quickNavHtml}
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
        inscriptions: { label: t('editions.status.open'),    color: 'var(--springs-orange)' },
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
        if (!state.currentUser) ctaHtml = `<button class="btn btn-primary" onclick="openAuthModal()">${t('editions.login.to.reg')}</button>`;
        else if (alreadyRegistered) ctaHtml = `<div class="registered-badge" style="font-size:0.85rem;padding:8px 14px">${t('editions.already.reg')}</div>`;
        else if (currentPlayer) ctaHtml = `<button class="btn btn-primary" onclick="goToEdition('${next.id}')">${t('editions.register.btn')}</button>`;
    } else if (nStatus === 'en_cours') {
        ctaHtml = `<span style="color:#fbbf24;font-weight:700;font-size:0.9rem">${t('editions.status.live')}</span>`;
    }

    const metaItems = [`📅 ${dateStr}`];
    if (next.time)  metaItems.push(`🕐 ${next.time}`);
    if (next.club)  metaItems.push(`🏛️ ${next.club}`);
    if (next.salon) metaItems.push(`🎮 ${next.salon}`);

    // Bandeau "mot de passe du salon" — visible en grand pour les inscrits,
    // peu importe le status. Si déco pendant les qualifs, le joueur revient
    // sur l'accueil et le retrouve direct (pas besoin de chercher la page édition).
    const passwordBannerHtml = (alreadyRegistered && next.password) ? `
        <div style="background:rgba(0,217,54,0.04);border:1px solid rgba(0,217,54,0.22);border-radius:var(--radius-md);padding:18px 22px;margin-bottom:var(--space-md);display:flex;align-items:center;justify-content:space-between;gap:var(--space-md);flex-wrap:wrap;position:relative;overflow:hidden">
            <div style="position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--color-accent)"></div>
            <div style="display:flex;align-items:center;gap:14px;min-width:0;flex:1;padding-left:8px">
                <span style="font-size:1.6rem;flex-shrink:0;opacity:0.85">🔐</span>
                <div style="min-width:0">
                    <div style="font-size:var(--text-xs);font-weight:var(--fw-bold);letter-spacing:var(--tracking-wider);text-transform:uppercase;color:var(--color-accent);margin-bottom:6px">${t('home.password.banner')}</div>
                    <div style="font-size:var(--text-lg);font-weight:var(--fw-black);color:#fff;font-family:'JetBrains Mono','Courier New',monospace;letter-spacing:var(--tracking-wide);word-break:break-all;line-height:1">${next.password}</div>
                </div>
            </div>
            <button onclick="navigator.clipboard.writeText('${next.password.replace(/'/g, "\\'")}').then(()=>showToast?.('✓ Copié'))" style="padding:9px 16px;background:transparent;border:1px solid rgba(0,217,54,0.3);color:var(--color-accent);border-radius:var(--radius-sm);font-weight:var(--fw-bold);font-size:var(--text-sm);cursor:pointer;font-family:inherit;white-space:nowrap;transition:all var(--tr-fast)" onmouseover="this.style.background='rgba(0,217,54,0.1)';this.style.borderColor='rgba(0,217,54,0.5)'" onmouseout="this.style.background='transparent';this.style.borderColor='rgba(0,217,54,0.3)'">📋 ${t('detail.password.copy')}</button>
        </div>` : '';

    banner.innerHTML = `
        ${passwordBannerHtml}
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
                <div class="next-edition-countdown-label">${t('editions.countdown')}</div>
                <div class="next-edition-countdown">${cd || t('editions.soon')}</div>
                <div style="margin-top:12px;font-size:var(--text-sm);color:var(--color-text-secondary)">👥 ${inscritCount} ${t('editions.inscribed')}</div>
                <div style="margin-top:4px;font-size:var(--text-sm);font-weight:var(--fw-bold);color:${statusInfo.color}">${statusInfo.label}</div>
            </div>
        </div>`;
    banner.style.display = 'block';
}
