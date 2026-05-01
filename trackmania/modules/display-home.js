// modules/display-home.js — Section Accueil + bandeau prochaine édition

import { state } from './state.js';
import { t } from '../../shared/i18n.js';
import { pName, dateLang, getCountdown, getPoints, avatarHtml } from './utils.js';
import springsLogo from '../../assets/springs-logo.png';
import tm2020Bg from '../../assets/trackmania2020.webp';

export function displayHome() {
    const container = document.getElementById('homeContent');
    if (!container) return;
    const today = new Date(); today.setHours(0,0,0,0);

    const liveEdition = state.data.editions.find(e => e.status === 'en_cours');
    const nextEdition = state.data.editions
        .filter(e => new Date(e.date) >= today && e.status !== 'terminee' && e.status !== 'en_cours')
        .sort((a,b) => new Date(a.date) - new Date(b.date))[0];

    const pastEdIds = new Set(state.data.editions.filter(e => new Date(e.date) < today || e.status === 'terminee').map(e => e.id));
    const totalEditions       = pastEdIds.size;
    const totalPlayers        = state.data.participants.length;
    const totalParticipations = new Set(
        state.data.results.filter(r => pastEdIds.has(r.editionId)).map(r => `${r.playerId}_${r.editionId}`)
    ).size;

    const currentPlayer = state.currentUser
        ? state.data.participants.find(p => p.userId === state.currentUser.uid)
        : null;

    // ── Top 3 général (pour la carte action Rankings) ─────────────────────
    const playerStats = {};
    state.data.results.filter(r => r.phase === 'finale' && pastEdIds.has(r.editionId)).forEach(r => {
        if (!playerStats[r.playerId]) playerStats[r.playerId] = { points: 0, wins: 0 };
        playerStats[r.playerId].points += getPoints(r.position);
        if (r.position === 1) playerStats[r.playerId].wins += 1;
    });
    const topThree = Object.entries(playerStats)
        .map(([pid, s]) => ({ ...s, player: state.data.participants.find(p => p.id === pid) }))
        .filter(x => x.player)
        .sort((a, b) => b.points - a.points)
        .slice(0, 3);

    // ── Top 3 pronostiqueurs (cumul des points sur toutes les éditions terminées) ─
    const predictorStats = {};
    (state.data.predictions || []).forEach(p => {
        if (typeof p.score !== 'number') return;
        const pid = p.playerId || p.userId;
        if (!pid) return;
        predictorStats[pid] = (predictorStats[pid] || 0) + p.score;
    });
    const topPredictors = Object.entries(predictorStats)
        .map(([pid, score]) => ({ score, player: state.data.participants.find(p => p.id === pid || p.userId === pid) }))
        .filter(x => x.player)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

    // ── HERO : carte Next Event impactante ────────────────────────────────
    let heroEventHtml = '';
    if (liveEdition) {
        heroEventHtml = `
            <div class="home-hero-event live" onclick="showSection('editions');openEditionDetail('${liveEdition.id}')">
                <div class="home-hero-event-status live">
                    <span class="live-dot"></span>
                    <span>${t('editions.status.live') || 'EN DIRECT'}</span>
                </div>
                <div class="home-hero-event-name">${liveEdition.name}</div>
                <div class="home-hero-event-meta">${t('editions.status.live.desc') || 'La compétition est en cours, suivez le live'}</div>
                <a href="${state.siteConfig?.twitchUrl || 'https://www.twitch.tv/springsesport'}" target="_blank" rel="noopener" class="home-hero-cta twitch" onclick="event.stopPropagation()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>
                    Regarder sur Twitch
                </a>
            </div>`;
    } else if (nextEdition) {
        const dateStr = new Date(nextEdition.date).toLocaleDateString(dateLang(), { weekday: 'long', day: 'numeric', month: 'long' });
        const timeStr = nextEdition.time ? ` · ${nextEdition.time}` : '';
        const countdown = getCountdown(nextEdition.date, nextEdition.time);
        const isRegistered = currentPlayer && state.data.results.some(
            r => r.editionId === nextEdition.id && r.playerId === currentPlayer.id && r.phase === 'inscription'
        );
        const inscritCount = state.data.results.filter(r => r.editionId === nextEdition.id && r.phase === 'inscription').length;

        let ctaHtml = '';
        if (nextEdition.status === 'inscriptions') {
            if (!state.currentUser) ctaHtml = `<button class="home-hero-cta primary" onclick="event.stopPropagation();openAuthModal()">${t('editions.login.to.reg')}</button>`;
            else if (isRegistered) ctaHtml = `<div class="home-hero-registered">✓ ${t('editions.already.reg')}</div>`;
            else if (currentPlayer) ctaHtml = `<button class="home-hero-cta primary" onclick="event.stopPropagation();registerForEdition('${nextEdition.id}')">${t('editions.register.btn')}</button>`;
        }

        // Mot de passe salon intégré dans le hero (visible pour les inscrits)
        const passwordInline = (isRegistered && nextEdition.password) ? `
            <div class="home-hero-password" onclick="event.stopPropagation();navigator.clipboard.writeText('${nextEdition.password.replace(/'/g, "\\'")}').then(()=>showToast?.('✓ Copié'))">
                <span class="home-hero-password-label">🔐 ${t('home.password.banner') || 'Mot de passe salon'}</span>
                <span class="home-hero-password-value">${nextEdition.password}</span>
                <span class="home-hero-password-copy">📋 Copier</span>
            </div>` : '';

        heroEventHtml = `
            <div class="home-hero-event next" onclick="showSection('editions');openEditionDetail('${nextEdition.id}')">
                <div class="home-hero-event-status next">⏰ ${t('home.next.label') || 'Prochaine édition'}</div>
                <div class="home-hero-event-name">${nextEdition.name}</div>
                <div class="home-hero-event-meta">📅 ${dateStr}${timeStr} · 👥 ${inscritCount} ${t('editions.inscribed') || 'inscrits'}</div>
                ${countdown ? `<div class="home-hero-countdown"><span class="home-hero-countdown-label">${t('editions.countdown') || 'Dans'}</span><span class="home-hero-countdown-value">${countdown}</span></div>` : ''}
                ${passwordInline}
                <div class="home-hero-actions">${ctaHtml}<button class="home-hero-cta secondary" onclick="event.stopPropagation();showSection('editions');openEditionDetail('${nextEdition.id}')">${t('home.see.edition') || "Voir l'édition"} →</button></div>
            </div>`;
    } else {
        heroEventHtml = `
            <div class="home-hero-event empty">
                <div style="font-size:2.4rem;margin-bottom:12px;opacity:0.4">🏁</div>
                <div style="color:rgba(255,255,255,0.4);font-size:var(--text-base)">${t('home.no.event')}</div>
            </div>`;
    }

    // ── Carte personnelle (à côté du hero event) ──────────────────────────
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
        const allRanked = Object.entries(playerStats)
            .sort((a, b) => b[1].points - a[1].points)
            .map(([pid]) => pid);
        const myRankAll = allRanked.indexOf(currentPlayer.id);
        const rankBadge = myRankAll >= 0 ? `<span class="home-personal-rank-badge" title="Classement général">#${myRankAll + 1}</span>` : '';
        personalHtml = `<div class="home-personal-card">
            <div class="home-personal-header">
                ${avatarHtml(currentPlayer, { size: 56, ringColor: 'rgba(0,217,54,0.4)' })}
                <div class="home-personal-meta">
                    <div class="home-personal-name">${pName(currentPlayer)} ${rankBadge}</div>
                    <div class="home-personal-sub">${t('home.personal.sub') || 'Ton parcours'}</div>
                </div>
            </div>
            <div class="home-personal-stats">
                <div class="home-personal-stat">
                    <div class="home-personal-stat-val">${myPts}</div>
                    <div class="home-personal-stat-lbl">Points</div>
                </div>
                <div class="home-personal-stat">
                    <div class="home-personal-stat-val">${myWins}</div>
                    <div class="home-personal-stat-lbl">${t('stats.wins') || 'Wins'}</div>
                </div>
                <div class="home-personal-stat">
                    <div class="home-personal-stat-val">${myParts}</div>
                    <div class="home-personal-stat-lbl">${t('stats.participations') || 'Participations'}</div>
                </div>
            </div>
            <button class="home-personal-cta" onclick="showSection('rankings')">${t('home.personal.see') || 'Voir le classement'} →</button>
        </div>`;
    } else {
        // Visiteur non connecté → CTA inscription dans cet emplacement
        personalHtml = `<div class="home-personal-card guest">
            <div style="font-size:2.2rem;margin-bottom:var(--space-sm);opacity:0.7">🎮</div>
            <div class="home-guest-title">${t('cta.title') || 'Rejoins la compétition'}</div>
            <div class="home-guest-desc">${t('cta.desc') || 'Inscris-toi pour participer aux prochaines cups et apparaître au classement'}</div>
            <button class="home-hero-cta primary" onclick="openAuthModal()">${t('cta.btn') || 'Se connecter'}</button>
        </div>`;
    }

    // ── Actions rapides AVEC contenu ──────────────────────────────────────
    const rankingItems = topThree.length > 0
        ? topThree.map((tt, i) => `<div class="home-action-row">
            <span class="home-action-rank rank-${i + 1}">${i + 1}</span>
            ${avatarHtml(tt.player, { size: 24 })}
            <span class="home-action-name">${pName(tt.player)}</span>
            <span class="home-action-pts">${tt.points} pts</span>
        </div>`).join('')
        : `<div class="home-action-empty">${t('home.no.ranking') || 'Aucun classement encore'}</div>`;

    const predictorItems = topPredictors.length > 0
        ? topPredictors.map((tp, i) => `<div class="home-action-row">
            <span class="home-action-rank rank-${i + 1}">${i + 1}</span>
            ${avatarHtml(tp.player, { size: 24 })}
            <span class="home-action-name">${pName(tp.player)}</span>
            <span class="home-action-pts">${tp.score} pts</span>
        </div>`).join('')
        : `<div class="home-action-empty">${t('home.no.predictor') || 'Pronostique le prochain event !'}</div>`;

    // ── Duel suggéré (toi vs leader, ou leader vs second) ─────────────────
    let duelSuggestion = null;
    if (topThree.length >= 2) {
        const top1 = topThree[0].player;
        const top2 = topThree[1].player;
        if (currentPlayer && currentPlayer.id !== top1.id) {
            duelSuggestion = {
                left: currentPlayer, right: top1,
                label: t('home.duel.suggest.you') || 'Affronte le leader',
            };
        } else {
            duelSuggestion = {
                left: top1, right: top2,
                label: t('home.duel.suggest.leaders') || 'Le duel des leaders',
            };
        }
    }
    const duelBody = duelSuggestion
        ? `<div class="home-action-duel-real">
            <div class="home-action-duel-side-real">
                ${avatarHtml(duelSuggestion.left, { size: 44, ringColor: 'rgba(0,217,54,0.4)' })}
                <span class="home-action-duel-name">${pName(duelSuggestion.left)}</span>
            </div>
            <span class="home-action-duel-vs">VS</span>
            <div class="home-action-duel-side-real">
                ${avatarHtml(duelSuggestion.right, { size: 44, ringColor: 'rgba(123,47,190,0.5)' })}
                <span class="home-action-duel-name">${pName(duelSuggestion.right)}</span>
            </div>
        </div>
        <div class="home-action-hint">${duelSuggestion.label}</div>`
        : `<div class="home-action-duel-visual">
            <span class="home-action-duel-side">P1</span>
            <span class="home-action-duel-vs">VS</span>
            <span class="home-action-duel-side">P2</span>
        </div>
        <div class="home-action-hint">${currentPlayer ? (t('home.duel.hint.user') || 'Compare-toi à un autre joueur en face à face') : (t('home.duel.hint.guest') || 'Compare deux joueurs en face à face')}</div>`;
    const duelOnClick = duelSuggestion
        ? `showSection('duel');setDuelPlayer('A','${duelSuggestion.left.id}');setDuelPlayer('B','${duelSuggestion.right.id}')`
        : `showSection('duel')`;

    const quickActionsHtml = `<div class="home-actions-grid">
        <div class="home-action-card" onclick="showSection('rankings')">
            <div class="home-action-header">
                <span class="home-action-icon">🏆</span>
                <span class="home-action-title">${t('nav.rankings') || 'Classement'}</span>
            </div>
            <div class="home-action-body">${rankingItems}</div>
            <div class="home-action-footer">${t('home.see.all') || 'Voir tout'} →</div>
        </div>
        <div class="home-action-card" onclick="showSection('predictions')">
            <div class="home-action-header">
                <span class="home-action-icon">🔮</span>
                <span class="home-action-title">${t('nav.predictions') || 'Prédictions'}</span>
            </div>
            <div class="home-action-body">${predictorItems}</div>
            <div class="home-action-footer">${t('home.predict') || 'Faire mes prédictions'} →</div>
        </div>
        <div class="home-action-card" onclick="${duelOnClick}">
            <div class="home-action-header">
                <span class="home-action-icon">⚔️</span>
                <span class="home-action-title">${t('nav.duel') || 'Duel'}</span>
            </div>
            <div class="home-action-body">${duelBody}</div>
            <div class="home-action-footer">${t('home.compare') || 'Lancer un duel'} →</div>
        </div>
    </div>`;

    // ── Champions récents — galerie XXL ───────────────────────────────────
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
            const titleCount = state.data.results.filter(r => r.playerId === player.id && r.phase === 'finale' && r.position === 1).length;
            const isLatest = i === 0;
            return `<div class="home-champion-card${isLatest ? ' latest' : ''}" onclick="showSection('editions');openEditionDetail('${e.id}')">
                <div class="home-champion-medal">${isLatest ? '👑' : '🏆'}</div>
                <div class="home-champion-edition">${e.name}</div>
                <div class="home-champion-avatar-wrap">${avatarHtml(player, { size: 80, ringColor: 'rgba(255,184,0,0.5)' })}</div>
                <div class="home-champion-winner-xl">${pName(player)}</div>
                <div class="home-champion-meta">
                    <span>${dateStr}</span>
                    ${player.team && player.team !== 'Sans équipe' ? `<span>· ${player.team}</span>` : ''}
                </div>
                ${titleCount > 1 ? `<div class="home-champion-titles">${titleCount} ${titleCount > 1 ? (t('home.titles') || 'titres') : (t('home.title') || 'titre')}</div>` : ''}
            </div>`;
        }).join('');
        championsHtml = `<div class="home-section">
            <div class="home-section-title">
                <span class="home-section-title-icon">👑</span>
                <span>${t('home.champions') || 'Derniers champions'}</span>
            </div>
            <div class="home-champions-grid">${cards}</div>
        </div>`;
    }

    container.innerHTML = `
        <div class="home-hero">
            <div class="home-hero-bg" style="background-image:url('${tm2020Bg}')"></div>
            <img src="${springsLogo}" class="home-hero-logo" alt="Springs Esport">
            <div class="home-hero-title">${state.siteConfig?.siteName || 'Springs Monthly Cup'}</div>
            <div class="home-hero-tagline">${state.siteConfig?.siteSubtitle || t('home.tagline') || 'La compétition Trackmania mensuelle de Springs E-Sport'}</div>
            <div class="home-hero-badges">
                <span class="home-hero-badge">🏆 ${t('home.badge.monthly') || 'Compétition mensuelle'}</span>
                <span class="home-hero-badge">🎮 ${t('home.badge.tm2020') || 'Trackmania 2020'}</span>
                <span class="home-hero-badge">${totalPlayers} ${t('home.stat.players') || 'Joueurs'}</span>
            </div>
        </div>

        <div class="home-top-grid">
            ${heroEventHtml}
            ${personalHtml}
        </div>

        <div class="home-stats">
            <div class="home-stat"><div class="home-stat-value">${totalEditions}</div><div class="home-stat-label">${t('home.stat.editions') || 'Éditions'}</div></div>
            <div class="home-stat"><div class="home-stat-value">${totalPlayers}</div><div class="home-stat-label">${t('home.stat.players') || 'Joueurs'}</div></div>
            <div class="home-stat"><div class="home-stat-value">${totalParticipations}</div><div class="home-stat-label">${t('home.stat.participations') || 'Participations'}</div></div>
        </div>

        ${quickActionsHtml}
        ${championsHtml}`;
}

export function displayNextEditionBanner() {
    const banner = document.getElementById('nextEditionBanner');
    if (!banner) return;
    // Sur l'accueil, le hero contient déjà la carte Next Event — pas besoin du gros bandeau
    const homePanel = document.getElementById('home');
    if (homePanel && homePanel.style.display !== 'none') {
        banner.style.display = 'none';
        return;
    }
    // Sur la page détail d'une édition, le hero de l'édition contient déjà toutes les infos
    if (state.currentDetailEditionId) {
        banner.style.display = 'none';
        return;
    }
    // Sur l'onglet Éditions, le featured mini-hero remplit déjà ce rôle
    const editionsPanel = document.getElementById('editions');
    if (editionsPanel && editionsPanel.style.display !== 'none') {
        banner.style.display = 'none';
        return;
    }
    const today = new Date(); today.setHours(0,0,0,0);
    const upcoming = state.data.editions
        .filter(e => new Date(e.date) >= today && e.status !== 'terminee' && (!e.hidden || state.isAdmin))
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
