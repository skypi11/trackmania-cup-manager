import { app, db, auth } from '../shared/firebase-config.js';
import { t, setLang, getLang, initLang } from '../shared/i18n.js';
import { collection, addDoc, deleteDoc, updateDoc, setDoc, doc, getDoc, getDocs, onSnapshot, arrayUnion, query, where } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app-check.js";
import { state } from './modules/state.js';
import { dateLang, tTeam, pName, getPoints, POINTS_SYSTEM, showToast, getCountdown } from './modules/utils.js';
import { buildRankingStats, displayGeneralRanking, displayStats } from './modules/display-rankings.js';
import { displayMapsTimeline } from './modules/display-maps.js';
import { displayHome, displayNextEditionBanner } from './modules/display-home.js';
import { displayHallOfFame } from './modules/display-hof.js';
import { displayEditions, storeTmxThumbs, computePlayerStats, ACHIEVEMENTS, playerBadgesHtml } from './modules/display-editions.js';
import { displayParticipants } from './modules/display-players.js';
import { displayPredictions } from './modules/display-predictions.js';

initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider('6Lfc8Y0sAAAAAGozYyv9rRjgG6XUPffi-PsjYIGR'),
    isTokenAutoRefreshEnabled: true
});

const DISCORD_CLIENT_ID = '1483592495215673407';
const DISCORD_REDIRECT_URI = window.location.origin + '/trackmania/cup.html';

// Capture Discord OAuth token from URL hash (before any redirect)
const _hashParams = new URLSearchParams(window.location.hash.slice(1));
if (_hashParams.get('access_token')) {
    state.pendingDiscordToken = _hashParams.get('access_token');
    const _state = _hashParams.get('state') || '';
    history.replaceState(null, '', window.location.pathname + (_state ? '?' + _state : window.location.search));
}

// Cup configuration from URL parameter
const cupId = new URLSearchParams(window.location.search).get('cup') || 'monthly';
const CUP = cupId === 'mania'
    ? { name: 'Springs Mania Cup', color: '#FFB800', colorHover: '#ffc733', label: 'LAN' }
    : { name: 'Springs Monthly Cup', color: '#00D936', colorHover: '#00ff3f', label: t('msg.online') };

// Apply cup colors and title
document.documentElement.style.setProperty('--color-accent', CUP.color);
document.documentElement.style.setProperty('--color-accent-hover', CUP.colorHover);
document.title = `${CUP.name} — Trackmania`;
document.getElementById('cupTitle').textContent = CUP.name;
document.getElementById('cupSubtitle').textContent = `Springs E-Sport · ${CUP.label}`;
document.getElementById('authCupName').textContent = CUP.name;

// Cup filter: backward compat — existing docs without cupId are treated as 'monthly'
const cupFilter = item => (item.cupId || 'monthly') === cupId;

// ── SITE CONFIG ───────────────────────────────────
const CONFIG_DEFAULTS = {
    siteName: CUP.name,
    siteSubtitle: `Springs E-Sport · ${CUP.label}`,
    twitchChannel: 'springsesport',
    youtubeUrl: 'https://www.youtube.com/@Springsesport/videos',
    instagramUrl: 'https://www.instagram.com/springsesport/',
    twitterUrl: 'https://x.com/SpringsEsportRL',
    tiktokUrl: 'https://www.tiktok.com/@springsesport',
    twitchUrl: 'https://www.twitch.tv/springsesport',
    discordInviteUrl: 'https://discord.gg/ZXHRRd95C3',
    copyrightText: '© 2026 Springs E-Sport',
};
state.siteConfig = { ...CONFIG_DEFAULTS };

async function loadSiteConfig() {
    try {
        const snap = await getDoc(doc(db, 'siteContent', `config_${cupId}`));
        if (snap.exists()) state.siteConfig = { ...CONFIG_DEFAULTS, ...snap.data() };
    } catch { /* keep defaults */ }
    applySiteConfig();
    displayHome();
}

function applySiteConfig() {
    const c = state.siteConfig;
    const titleEl = document.getElementById('cupTitle');
    const subEl   = document.getElementById('cupSubtitle');
    if (titleEl) titleEl.textContent = c.siteName;
    if (subEl)   subEl.textContent   = c.siteSubtitle;
    document.title = `${c.siteName} — Trackmania`;
    const authName = document.getElementById('authCupName');
    if (authName) authName.textContent = c.siteName;
    const copyright = document.getElementById('footerCopyright');
    if (copyright) copyright.textContent = c.copyrightText;
    const footerIds = { footerYoutube: 'youtubeUrl', footerInstagram: 'instagramUrl', footerTwitter: 'twitterUrl', footerTiktok: 'tiktokUrl', footerTwitch: 'twitchUrl', footerDiscord: 'discordInviteUrl' };
    Object.entries(footerIds).forEach(([id, key]) => { const el = document.getElementById(id); if (el) el.href = c[key]; });
    const sidebarTwitch = document.getElementById('sidebarTwitchBtn');
    if (sidebarTwitch) sidebarTwitch.href = c.twitchUrl;
    const sidebarDiscord = document.getElementById('sidebarDiscordBtn');
    if (sidebarDiscord) sidebarDiscord.href = c.discordInviteUrl;
    // Populate form fields
    const fields = { cfgSiteName: c.siteName, cfgSiteSubtitle: c.siteSubtitle, cfgCopyright: c.copyrightText, cfgTwitchChannel: c.twitchChannel, cfgYoutubeUrl: c.youtubeUrl, cfgInstagramUrl: c.instagramUrl, cfgTwitterUrl: c.twitterUrl, cfgTiktokUrl: c.tiktokUrl, cfgTwitchUrl: c.twitchUrl, cfgDiscordInviteUrl: c.discordInviteUrl };
    Object.entries(fields).forEach(([id, val]) => { const el = document.getElementById(id); if (el) el.value = val || ''; });
    // Overlay URL
    const overlayContainer = document.getElementById('overlayUrlsContainer');
    if (overlayContainer) {
        const baseUrl = window.location.origin + '/trackmania/overlay-quals.html';
        const overlayUrl = `${baseUrl}?cup=${cupId}`;
        overlayContainer.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:12px 16px">
                <code style="flex:1;font-size:0.82rem;color:var(--color-accent);word-break:break-all">${overlayUrl}</code>
                <button onclick="navigator.clipboard.writeText('${overlayUrl}').then(()=>{this.textContent=t('msg.copied.link');setTimeout(()=>this.textContent=t('msg.copy.link'),2000)})" style="flex-shrink:0;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:var(--color-text);padding:6px 14px;border-radius:8px;cursor:pointer;font-size:0.82rem">${t('msg.copy.link')}</button>
            </div>`;
    }
}

window.saveSiteConfig = async (e) => {
    e.preventDefault();
    const get = id => document.getElementById(id)?.value.trim() || '';
    const cfg = {
        siteName:      get('cfgSiteName')      || CONFIG_DEFAULTS.siteName,
        siteSubtitle:  get('cfgSiteSubtitle')  || CONFIG_DEFAULTS.siteSubtitle,
        copyrightText: get('cfgCopyright')     || CONFIG_DEFAULTS.copyrightText,
        twitchChannel: get('cfgTwitchChannel') || CONFIG_DEFAULTS.twitchChannel,
        youtubeUrl:    get('cfgYoutubeUrl')    || CONFIG_DEFAULTS.youtubeUrl,
        instagramUrl:  get('cfgInstagramUrl')  || CONFIG_DEFAULTS.instagramUrl,
        twitterUrl:    get('cfgTwitterUrl')    || CONFIG_DEFAULTS.twitterUrl,
        tiktokUrl:     get('cfgTiktokUrl')     || CONFIG_DEFAULTS.tiktokUrl,
        twitchUrl:        get('cfgTwitchUrl')        || CONFIG_DEFAULTS.twitchUrl,
        discordInviteUrl: get('cfgDiscordInviteUrl') || CONFIG_DEFAULTS.discordInviteUrl,
    };
    try {
        await setDoc(doc(db, 'siteContent', `config_${cupId}`), cfg);
        state.siteConfig = { ...cfg };
        applySiteConfig();
        displayHome();
        const status = document.getElementById('cfgSaveStatus');
        if (status) { status.style.display = ''; setTimeout(() => status.style.display = 'none', 3000); }
    } catch(err) {
        console.error('Save config error:', err);
        showToast(t('msg.save.error'));
    }
};

// ── DISCORD ───────────────────────────────────────
window.linkDiscord = () => {
    const oauthState = window.location.search.slice(1) || 'cup=monthly';
    const params = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        redirect_uri: DISCORD_REDIRECT_URI,
        response_type: 'token',
        scope: 'identify',
        state: oauthState
    });
    window.location.href = `https://discord.com/oauth2/authorize?${params}`;
};

async function handleDiscordCallback(token) {
    try {
        const res = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) { showToast(t('msg.error')); return; }
        const user = await res.json();
        const player = state.data.participants.find(p => p.userId === state.currentUser?.uid);
        if (player) {
            await updateDoc(doc(db, 'participants', player.id), {
                discordId: user.id,
                discordUsername: user.global_name || user.username
            });
            showToast(`✅ Discord lié : ${user.global_name || user.username}`);
            window.openPlayerProfile(player.id);
        } else {
            showToast(t('msg.error'));
        }
    } catch(e) {
        console.error('Discord OAuth error:', e);
        showToast(t('msg.error'));
    }
}

function updateDiscordReminders() {
    if (!state.currentUser || state.isAdmin) {
        document.getElementById('discordLinkBanner').style.display = 'none';
        const dot = document.getElementById('discordBadgeDot');
        if (dot) dot.remove();
        return;
    }
    const player = state.data.participants.find(p => p.userId === state.currentUser.uid);
    if (!player) return;
    const linked = !!player.discordId;

    // Banner
    const banner = document.getElementById('discordLinkBanner');
    banner.style.display = linked ? 'none' : '';

    // Badge dot on playerBtn
    const playerBtn = document.getElementById('playerBtn');
    let dot = document.getElementById('discordBadgeDot');
    if (!linked) {
        if (!dot) {
            dot = document.createElement('span');
            dot.id = 'discordBadgeDot';
            dot.className = 'discord-badge-dot';
            playerBtn.appendChild(dot);
        }
    } else {
        if (dot) dot.remove();
    }
}

window.dismissDiscordPrompt = () => {
    document.getElementById('discordPromptOverlay').classList.remove('open');
    sessionStorage.setItem('discordPromptDismissed', '1');
};

function maybeShowDiscordPrompt() {
    if (sessionStorage.getItem('discordPromptDismissed')) return;
    const player = state.data.participants.find(p => p.userId === state.currentUser?.uid);
    if (player && !player.discordId) {
        setTimeout(() => {
            document.getElementById('discordPromptOverlay').classList.add('open');
        }, 1200);
    }
}

window.unlinkDiscord = async (playerId) => {
    if (!confirm(t('msg.confirm.unlink.discord'))) return;
    await updateDoc(doc(db, 'participants', playerId), { discordId: '', discordUsername: '' });
    showToast(t('discord.unlinked'));
    window.openPlayerProfile(playerId);
};

window.openDiscordNotifyModal = (editionId) => {
    const e = state.data.editions.find(ed => ed.id === editionId);
    if (!e) return;
    const inscriptions = state.data.results.filter(r => r.editionId === editionId && r.phase === 'inscription');
    const mentions = inscriptions
        .map(r => state.data.participants.find(p => p.id === r.playerId))
        .filter(p => p?.discordId)
        .map(p => `<@${p.discordId}>`);
    const timeStr = e.time ? ` à **${e.time}**` : '';
    const mentionsStr = mentions.length > 0 ? mentions.join(' ') + '\n\n' : '';
    const defaultMsg = `${mentionsStr}🏎️ **${e.name}** commence bientôt${timeStr} !\nPréparez-vous, on vous attend en jeu ! 🎮`;

    const modal = document.getElementById('discordNotifyModal');
    document.getElementById('discordNotifyEditionId').value = editionId;
    document.getElementById('discordNotifyMessage').value = defaultMsg;
    const hint = mentions.length > 0
        ? `${mentions.length} joueur(s) mentionné(s) via Discord`
        : 'Aucun joueur n\'a lié son Discord — pas de @mention';
    document.getElementById('discordNotifyHint').textContent = hint;
    modal.classList.add('open');
};

window.closeDiscordNotifyModal = () => {
    document.getElementById('discordNotifyModal').classList.remove('open');
};

window.sendDiscordNotification = async () => {
    const editionId = document.getElementById('discordNotifyEditionId').value;
    const content = document.getElementById('discordNotifyMessage').value.trim();
    if (!content) return;
    try {
        const discordSnap = await getDoc(doc(db, 'siteContent', 'discord'));
        const webhookUrl = discordSnap.data()?.webhookUrl;
        if (!webhookUrl) { showToast(t('admin.discord.nowebhook')); return; }
        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, username: 'Springs Monthly Cup' })
        });
        if (res.ok) { showToast(t('admin.discord.ok')); closeDiscordNotifyModal(); }
        else showToast(t('admin.discord.error'));
    } catch(err) {
        console.error('Discord notify error:', err);
        showToast(t('admin.discord.error'));
    }
};

state.urlAutoOpenDone = false;
function checkLoaded() {
    if (Object.values(state.loaded).every(Boolean)) {
        document.getElementById('loadingOverlay').classList.add('hidden');
        displayHome();
        updateDiscordReminders();
        // Handle Discord OAuth callback
        if (state.pendingDiscordToken && state.currentUser) {
            handleDiscordCallback(state.pendingDiscordToken);
            state.pendingDiscordToken = null;
        }
        maybeShowDiscordPrompt();
        // Auto-open edition or player from URL param (once)
        if (!state.urlAutoOpenDone) {
            state.urlAutoOpenDone = true;
            const params = new URLSearchParams(window.location.search);
            const editionId = params.get('edition');
            const playerId  = params.get('player');
            if (editionId && state.data.editions.find(e => e.id === editionId)) {
                showSection('editions');
                window.openEditionDetail(editionId);
            } else if (playerId && state.data.participants.find(p => p.id === playerId)) {
                window.openPlayerProfile(playerId);
            }
        }
    }
}

// Pre-fill saison field with current year
const saisonInput = document.getElementById('editionSaison');
if (saisonInput && !saisonInput.value) saisonInput.value = new Date().getFullYear();

window.openAuthModal  = () => document.getElementById('authOverlay').classList.add('open');
window.closeAuthModal = () => document.getElementById('authOverlay').classList.remove('open');

// Auth guard sign-in
window.authGoogleSignIn = async () => {
    const btn = document.getElementById('authGoogleBtn');
    btn.disabled = true; btn.textContent = t('auth.connecting');
    try {
        await signInWithPopup(auth, googleProvider);
    } catch(err) {
        btn.disabled = false;
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z"/></svg> ${t('auth.google')}`;
        if (err.code !== 'auth/popup-closed-by-user') alert(t('auth.error'));
    }
};

// Auth
onAuthStateChanged(auth, async (user) => {
    state.currentUser = user;
    const authOverlay = document.getElementById('authOverlay');

    const loginBtn  = document.getElementById('loginBtn');
    const adminBtn  = document.getElementById('adminToggleBtn');
    const playerBtn = document.getElementById('playerBtn');

    if (!user) {
        state.isAdmin = false;
        state.currentUserProfile = null;
        loginBtn.style.display  = '';
        adminBtn.style.display  = 'none';
        playerBtn.style.display = 'none';
        state.loaded.auth = true;
        checkLoaded();
        displayParticipants();
        displayEditions();
        displayNextEditionBanner();
        return;
    }

    // User is logged in — hide login button + close auth modal if open
    loginBtn.style.display = 'none';
    closeAuthModal();

    try {
        const [adminSnap, partSnap] = await Promise.all([
            getDoc(doc(db, 'admins', user.uid)),
            getDocs(query(collection(db, 'participants'), where('userId', '==', user.uid)))
        ]);
        state.isAdmin = adminSnap.exists();
        state.currentUserProfile = !partSnap.empty ? partSnap.docs[0].data() : null;
    } catch {
        state.isAdmin = false;
        state.currentUserProfile = null;
    }

    if (state.isAdmin) {
        document.body.classList.add('admin-mode');
        adminBtn.style.display  = '';
        playerBtn.style.display = '';
        adminBtn.classList.add('active');
        adminBtn.textContent = t('admin.logout');
        const pseudoAdmin = state.currentUserProfile?.pseudo || user.displayName || t('nav.account');
        playerBtn.textContent = `👤 ${pseudoAdmin}`;
    } else {
        document.body.classList.remove('admin-mode');
        adminBtn.style.display  = 'none';
        playerBtn.style.display = '';
        adminBtn.classList.remove('active');
        const linkedPlayer = state.data.participants.find(p => p.userId === user.uid);
        const pseudo = linkedPlayer ? pName(linkedPlayer) : (state.currentUserProfile?.pseudo || user.displayName || t('nav.account'));
        playerBtn.textContent = `👤 ${pseudo}`;
    }
    // Mark auth as resolved so loading overlay can hide
    state.loaded.auth = true;
    checkLoaded();
    displayParticipants();
    displayEditions();
    displayNextEditionBanner();
});

const googleProvider = new GoogleAuthProvider();

window.toggleAdmin = async () => {
    if (state.isAdmin) {
        await signOut(auth);
    } else {
        try {
            await signInWithPopup(auth, googleProvider);
        } catch(err) {
            if (err.code !== 'auth/popup-closed-by-user') {
                alert(t('auth.error'));
            }
        }
    }
};

window.playerSignOut = async () => {
    closePlayerProfile();
    if (confirm(t('msg.logout.confirm'))) await signOut(auth);
};

// Opens the player's own fiche joueur (with edit section)
window.openPlayerAccount = () => {
    if (!state.currentUser) return openAuthModal();
    const player = state.data.participants.find(p => p.userId === state.currentUser.uid);
    if (player) {
        window.openPlayerProfile(player.id);
    } else {
        openCreateProfile();
    }
};

window.openCreateProfile = () => {
    const gameLabel = cupId === 'mania' ? '(Mania)' : '(Trackmania)';
    document.getElementById('newProfileGameLabel').textContent = gameLabel;
    document.getElementById('newProfilePseudo').value = '';
    document.getElementById('newProfileTeam').value = '';
    document.getElementById('createProfileMsg').style.display = 'none';
    document.getElementById('createProfileModal').classList.add('open');
};
window.closeCreateProfile = () => {
    document.getElementById('createProfileModal').classList.remove('open');
};

document.getElementById('createProfileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.currentUser) return;
    const pseudo = document.getElementById('newProfilePseudo').value.trim();
    const team   = document.getElementById('newProfileTeam').value.trim() || 'Sans équipe';
    const msg    = document.getElementById('createProfileMsg');

    if (!pseudo) return;
    if (state.data.participants.find(p => pName(p).toLowerCase() === pseudo.toLowerCase())) {
        msg.style.cssText = 'display:block;background:rgba(239,68,68,0.1);color:var(--color-danger);font-size:0.85rem;padding:8px 12px;border-radius:6px;margin:10px 0';
        msg.textContent = t('profile.exists');
        return;
    }
    const btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true; btn.textContent = t('profile.creating');
    try {
        await addDoc(collection(db, 'participants'), {
            pseudo, team, userId: state.currentUser.uid, cupId,
            pseudoTM: pseudo, games: ['trackmania'],
            email: state.currentUser.email, discordId: '', discordUsername: ''
        });
        closeCreateProfile();
        document.getElementById('playerBtn').textContent = `👤 ${pseudo}`;
        showToast(t('profile.created'));
        sessionStorage.removeItem('discordPromptDismissed');
        setTimeout(() => {
            document.getElementById('discordPromptOverlay').classList.add('open');
        }, 700);
    } catch {
        msg.style.cssText = 'display:block;background:rgba(239,68,68,0.1);color:var(--color-danger);font-size:0.85rem;padding:8px 12px;border-radius:6px;margin:10px 0';
        msg.textContent = t('profile.error.create');
        btn.disabled = false; btn.textContent = t('profile.create.btn');
    }
});

// Edit participant
window.openEditParticipant = (id) => {
    const p = state.data.participants.find(p => p.id === id);
    if (!p) return;
    document.getElementById('editParticipantId').value = id;
    document.getElementById('editPlayerName').value = pName(p);
    document.getElementById('editPlayerTeam').value = p.team === 'Sans équipe' ? '' : p.team;
    document.getElementById('editParticipantModal').classList.add('open');
};
window.closeEditParticipant = () => {
    document.getElementById('editParticipantModal').classList.remove('open');
};
document.getElementById('editParticipantForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editParticipantId').value;
    const name = document.getElementById('editPlayerName').value.trim();
    const team = document.getElementById('editPlayerTeam').value.trim();
    const duplicate = state.data.participants.find(p => pName(p).toLowerCase() === name.toLowerCase() && p.id !== id);
    if (duplicate) { alert(t('admin.pseudo.used')); return; }
    await updateDoc(doc(db, 'participants', id), { pseudoTM: name, name, team: team || 'Sans équipe' });
    closeEditParticipant();
});

// Edit edition
window.openEditEdition = (id) => {
    const e = state.data.editions.find(e => e.id === id);
    if (!e) return;
    document.getElementById('editEditionId').value = id;
    document.getElementById('editEditionName').value = e.name;
    document.getElementById('editEditionDate').value = e.date;
    document.getElementById('editEditionTime').value = e.time || '';
    document.getElementById('editEditionClub').value = e.club || '';
    document.getElementById('editEditionSalon').value = e.salon || '';
    document.getElementById('editEditionPassword').value = e.password || '';
    document.getElementById('editEditionStatus').value = e.status || 'inscriptions';
    document.getElementById('editEditionDesc').value = e.description || '';
    document.getElementById('editEditionYoutube').value = e.youtubeUrl || '';
    document.getElementById('editEditionSaison').value = e.saison || new Date(e.date).getFullYear();
    [1,2,3,4,5,6,7].forEach(n => {
        document.getElementById(`editEditionMap${n}tmx`).value = e[`map${n}tmx`] || '';
        document.getElementById(`editEditionMap${n}name`).value = e[`map${n}name`] || '';
    });
    document.getElementById('editEditionModal').classList.add('open');
};
window.closeEditEdition = () => {
    document.getElementById('editEditionModal').classList.remove('open');
};
document.getElementById('editEditionForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id       = document.getElementById('editEditionId').value;
    const name     = document.getElementById('editEditionName').value.trim();
    const date     = document.getElementById('editEditionDate').value;
    const time     = document.getElementById('editEditionTime').value;
    const club     = document.getElementById('editEditionClub').value.trim();
    const salon    = document.getElementById('editEditionSalon').value.trim();
    const password = document.getElementById('editEditionPassword').value.trim();
    const description = document.getElementById('editEditionDesc').value.trim();
    const youtubeUrl  = document.getElementById('editEditionYoutube').value.trim();
    const newStatus = document.getElementById('editEditionStatus').value;
    const current   = state.data.editions.find(ed => ed.id === id);
    const saison  = parseInt(document.getElementById('editEditionSaison').value) || new Date(date).getFullYear();
    const mapsTmx = {}; [1,2,3,4,5,6,7].forEach(n => { mapsTmx[`map${n}tmx`] = document.getElementById(`editEditionMap${n}tmx`).value.trim(); mapsTmx[`map${n}name`] = document.getElementById(`editEditionMap${n}name`).value.trim(); });
    const updates   = { name, date, time, club, salon, password, description, youtubeUrl, status: newStatus, saison, ...mapsTmx };
    // Log status change if status changed
    if (current && current.status !== newStatus) {
        updates.statusHistory = arrayUnion({ status: newStatus, at: new Date().toISOString() });
    }
    await updateDoc(doc(db, 'editions', id), updates);
    closeEditEdition();
    // Fetch and store TMX thumbnails in background (admin save only)
    const mapTmxVals = {}; [1,2,3,4,5,6,7].forEach(n => { mapTmxVals[n] = mapsTmx[`map${n}tmx`]; });
    storeTmxThumbs(id, mapTmxVals);
});

// Delete functions
window.deleteParticipant = async (id) => {
    if (!confirm(t('msg.confirm.delete.player'))) return;
    for (const r of state.data.results.filter(r => r.playerId === id))
        await deleteDoc(doc(db, 'results', r.id));
    await deleteDoc(doc(db, 'participants', id));
};

window.deleteEdition = async (id) => {
    if (!confirm(t('msg.confirm.delete.edition'))) return;
    for (const r of state.data.results.filter(r => r.editionId === id))
        await deleteDoc(doc(db, 'results', r.id));
    await deleteDoc(doc(db, 'editions', id));
};

window.deleteResult = async (id) => {
    if (!confirm(t('msg.confirm.delete.result'))) return;
    await deleteDoc(doc(db, 'results', id));
};

// Section switching
function showSection(id) {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.section-panel').forEach(p => p.style.display = 'none');
    const navItem = document.querySelector(`.nav-item[data-section="${id}"]`);
    if (navItem) navItem.classList.add('active');
    const panel = document.getElementById(id);
    if (panel) panel.style.display = '';
    if (id === 'rankings') displayGeneralRanking();
    else if (id === 'stats') displayStats();
    else if (id === 'home') displayHome();
    else if (id === 'halloffame') displayHallOfFame();
    else if (id === 'personnalisation') applySiteConfig();
    else if (id === 'maps') displayMapsTimeline();
    else if (id === 'predictions') displayPredictions();
    const titles = { home: t('nav.home'), editions: t('nav.editions'), rankings: t('nav.rankings'), maps: t('nav.maps'), predictions: t('nav.predictions'), participants: t('nav.players'), stats: t('nav.stats'), halloffame: t('nav.hof'), personnalisation: t('nav.custom') };
    const titleEl = document.getElementById('topbarTitle');
    if (titleEl) titleEl.textContent = titles[id] || '';
    // Sync URL hash (replaceState = pas d'entrée dans l'historique pour nav interne)
    if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
}
window.showSection = showSection;

// Nav clicks : pushState pour que le bouton Retour du navigateur fonctionne
document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
        const id = btn.dataset.section;
        history.pushState(null, '', '#' + id);
        showSection(id);
        // Ferme la sidebar sur mobile après navigation
        document.getElementById('sidebar')?.classList.remove('open');
        document.getElementById('sidebarOverlay')?.classList.remove('open');
    });
});

// Bouton retour/avant du navigateur
window.addEventListener('popstate', () => {
    const id = location.hash.slice(1) || 'home';
    if (document.getElementById(id)) showSection(id);
});

// Chargement direct avec un hash dans l'URL (ex: cup.html#rankings)
const _initHash = location.hash.slice(1);
if (_initHash && document.getElementById(_initHash)) {
    showSection(_initHash);
} else {
    history.replaceState(null, '', '#home');
}

// Add participant
document.getElementById('addParticipantForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('playerName').value.trim();
    const team = document.getElementById('playerTeam').value.trim();
    if (state.data.participants.some(p => pName(p).toLowerCase() === name.toLowerCase())) {
        alert(t('admin.player.exists')); return;
    }
    await addDoc(collection(db, 'participants'), { name, team: team || 'Sans équipe', cupId });
    e.target.reset();
});

// Display participants
// Add edition
document.getElementById('addEditionForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dateVal     = document.getElementById('editionDate').value;
    const time        = document.getElementById('editionTime').value;
    const club        = document.getElementById('editionClub').value.trim();
    const salon       = document.getElementById('editionSalon').value.trim();
    const password    = document.getElementById('editionPassword').value.trim();
    const status      = document.getElementById('editionStatus').value;
    const description = document.getElementById('editionDesc').value.trim();
    const youtubeUrl  = document.getElementById('editionYoutube').value.trim();
    const saison      = parseInt(document.getElementById('editionSaison').value) || (dateVal ? new Date(dateVal).getFullYear() : new Date().getFullYear());
    const mapTmxValsCreate = Object.fromEntries([1,2,3,4,5,6,7].map(n => [n, document.getElementById(`editionMap${n}tmx`)?.value.trim() || '']));
    const newEditionRef = await addDoc(collection(db, 'editions'), {
        name: document.getElementById('editionName').value.trim(),
        date: dateVal,
        status,
        saison,
        statusHistory: [{ status, at: new Date().toISOString() }],
        ...(time        ? { time }        : {}),
        ...(club        ? { club }        : {}),
        ...(salon       ? { salon }       : {}),
        ...(password    ? { password }    : {}),
        ...(description ? { description } : {}),
        ...(youtubeUrl  ? { youtubeUrl }  : {}),
        ...(Object.fromEntries([1,2,3,4,5,6,7].flatMap(n => [[`map${n}tmx`, mapTmxValsCreate[n]], [`map${n}name`, document.getElementById(`editionMap${n}name`)?.value.trim() || '']]))),
        cupId
    });
    storeTmxThumbs(newEditionRef.id, mapTmxValsCreate);
    e.target.reset();
    document.getElementById('editionSaison').value = new Date().getFullYear();
});
// → display-editions.js

// → display-predictions.js

// ── i18n ──────────────────────────────────────────────────────────────
const applyI18n = () => {
    if (!state.loaded.participants || !state.loaded.editions || !state.loaded.results) return;
    displayHome();
    displayEditions();
    displayGeneralRanking();
    displayParticipants();
    displayStats();
    displayHallOfFame();
    displayNextEditionBanner();
    if (document.getElementById('maps')?.style.display !== 'none') displayMapsTimeline();
    if (document.getElementById('predictions')?.style.display !== 'none') displayPredictions();
};
window.toggleLang = () => {
    const newLang = getLang() === 'fr' ? 'en' : 'fr';
    setLang(newLang);
    applyI18n();
};
initLang();

// Load site config (async, non-blocking)
loadSiteConfig();

// Real-time listeners avec auto-retry si le listener Firestore meurt
function watchCollection(ref, name, onData) {
    function subscribe() {
        const unsub = onSnapshot(ref,
            snap => {
                onData(snap);
                if (!state.loaded[name]) { state.loaded[name] = true; checkLoaded(); }
            },
            err => {
                console.error(`Listener Firestore "${name}" error:`, err.code, err.message);
                if (!state.loaded[name]) { state.loaded[name] = true; checkLoaded(); }
                unsub?.();
                // Retry automatique après 8 secondes
                setTimeout(subscribe, 8000);
            }
        );
    }
    subscribe();
}

watchCollection(collection(db, 'participants'), 'participants', snap => {
    state.data.participants = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    displayParticipants(); displayEditions(); displayHome();
    displayHallOfFame(); displayNextEditionBanner(); displayStats();
    displayGeneralRanking(); updateDiscordReminders();
});

watchCollection(collection(db, 'editions'), 'editions', snap => {
    state.data.editions = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(cupFilter);
    displayEditions(); displayHome(); displayNextEditionBanner(); displayStats();
    if (document.getElementById('maps')?.style.display !== 'none') displayMapsTimeline();
    if (document.getElementById('predictions')?.style.display !== 'none') displayPredictions();
});

watchCollection(collection(db, 'results'), 'results', snap => {
    state.data.results = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(cupFilter);
    displayParticipants(); displayEditions(); displayHome();
    displayHallOfFame(); displayNextEditionBanner(); displayStats(); displayGeneralRanking();
});

watchCollection(
    query(collection(db, 'predictions'), where('cupId', '==', cupId)),
    'predictions',
    snap => {
        state.data.predictions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (document.getElementById('predictions')?.style.display !== 'none') displayPredictions();
    }
);