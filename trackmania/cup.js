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

// ── Predictions ──────────────────────────────────

state.predState = {}; // { editionId: { finalists: Set, top3: [null,null,null] } } — local UI state

window.togglePredFinalist = function(edId, playerId) {
    if (!state.predState[edId]) state.predState[edId] = { finalists: new Set(), top3: [null,null,null] };
    const s = state.predState[edId];
    if (s.finalists.has(playerId)) s.finalists.delete(playerId);
    else s.finalists.add(playerId);
    renderPredForm(edId);
};

window.setPredTop = function(edId, rank, playerId) {
    if (!state.predState[edId]) state.predState[edId] = { finalists: new Set(), top3: [null,null,null] };
    const s = state.predState[edId];
    // If already placed at another rank, remove it
    s.top3 = s.top3.map((p, i) => (p === playerId && i !== rank - 1) ? null : p);
    s.top3[rank - 1] = s.top3[rank - 1] === playerId ? null : playerId;
    renderPredForm(edId);
};

window.submitPrediction = async function(edId) {
    if (!state.currentUser) { alert(t('predictions.login')); return; }
    const s = state.predState[edId];
    if (!s || s.finalists.size === 0) { alert(t('predictions.select')); return; }
    const myPart = state.data.participants.find(p => p.userId === state.currentUser.uid);
    if (!myPart) { alert(t('predictions.must.reg')); return; }

    const existing = state.data.predictions.find(p => p.editionId === edId && p.playerId === myPart.id);
    const payload = {
        editionId: edId,
        playerId: myPart.id,
        cupId,
        finalists: [...s.finalists],
        top3: s.top3,
        createdAt: new Date().toISOString(),
        score: null, scored: false
    };
    if (existing) {
        await updateDoc(doc(db, 'predictions', existing.id), payload);
    } else {
        await addDoc(collection(db, 'predictions'), payload);
    }
    alert(t('predictions.saved'));
};

window.calculatePredictionScores = async function(edId) {
    if (!state.isAdmin) return;
    const finaleRes = state.data.results.filter(r => r.editionId === edId && r.phase === 'finale');
    if (finaleRes.length === 0) { alert(t('predictions.no.finals')); return; }

    const finalistIds = new Set(finaleRes.map(r => r.playerId));
    const top3 = [1,2,3].map(pos => finaleRes.find(r => r.position === pos)?.playerId ?? null);

    const preds = state.data.predictions.filter(p => p.editionId === edId);
    for (const pred of preds) {
        let score = 0;
        // +1 per correct finalist
        (pred.finalists || []).forEach(pid => { if (finalistIds.has(pid)) score += 1; });
        // +3 per correct podium position
        (pred.top3 || []).forEach((pid, i) => { if (pid && pid === top3[i]) score += 3; });
        await updateDoc(doc(db, 'predictions', pred.id), { score, scored: true });
    }
    alert(t('predictions.calc', {n: preds.length}));
};

function renderPredForm(edId) {
    const container = document.getElementById(`pred-form-${edId}`);
    if (!container) return;
    const edition = state.data.editions.find(e => e.id === edId);
    if (!edition) return;

    const myPart = state.currentUser ? state.data.participants.find(p => p.userId === state.currentUser.uid) : null;
    const myPred = myPart ? state.data.predictions.find(p => p.editionId === edId && p.playerId === myPart.id) : null;

    // Init state from saved prediction if not yet set
    if (!state.predState[edId] && myPred) {
        state.predState[edId] = { finalists: new Set(myPred.finalists || []), top3: myPred.top3 || [null,null,null] };
    }
    if (!state.predState[edId]) state.predState[edId] = { finalists: new Set(), top3: [null,null,null] };
    const s = state.predState[edId];

    // Inscribed players (for this edition) — those who have an inscription or qualification result
    const inscribedIds = new Set(state.data.results
        .filter(r => r.editionId === edId && (r.phase === 'inscription' || r.phase === 'qualification'))
        .map(r => r.playerId));
    const players = state.data.participants.filter(p => inscribedIds.has(p.id));

    const rankLabels = ['🥇 1er', '🥈 2ème', '🥉 3ème'];

    let html = `<div class="pred-section-title">Qui sera en finale ?</div>`;
    html += `<p style="font-size:0.78rem;color:var(--color-text-secondary);margin-bottom:8px">Sélectionne les joueurs que tu penses voir en finale</p>`;
    html += `<div class="pred-player-grid">`;
    players.forEach(p => {
        const sel = s.finalists.has(p.id) ? ' selected-finalist' : '';
        html += `<div class="pred-player-chip${sel}" onclick="togglePredFinalist('${edId}','${p.id}')">${pName(p)}</div>`;
    });
    html += `</div>`;

    html += `<div class="pred-section-title" style="margin-top:16px">Ton top 3</div>`;
    html += `<p style="font-size:0.78rem;color:var(--color-text-secondary);margin-bottom:8px">Clique sur une position puis un joueur (+3 pts si correct)</p>`;
    [0,1,2].forEach(i => {
        const chosen = s.top3[i] ? state.data.participants.find(p => p.id === s.top3[i]) : null;
        const rankClass = `selected-top${i+1}`;
        html += `<div style="margin-bottom:6px">
            <span style="font-size:0.82rem;font-weight:700;margin-right:8px">${rankLabels[i]}</span>
            <div class="pred-player-grid" style="display:inline-flex;flex-wrap:wrap;gap:6px">`;
        players.forEach(p => {
            const isChosen = s.top3[i] === p.id;
            html += `<div class="pred-player-chip${isChosen ? ' ' + rankClass : ''}" onclick="setPredTop('${edId}',${i+1},'${p.id}')">${pName(p)}</div>`;
        });
        html += `</div></div>`;
    });

    const canSubmit = !!(state.currentUser && myPart);
    html += `<button class="btn btn-primary" style="margin-top:14px" onclick="submitPrediction('${edId}')" ${canSubmit ? '' : 'disabled title="Connecte-toi et inscris-toi pour prédire"'}>
        ${myPred ? '✏️ Modifier ma prédiction' : '✅ Envoyer ma prédiction'}
    </button>`;
    if (!state.currentUser) html += `<p style="font-size:0.78rem;color:var(--color-text-secondary);margin-top:8px">Connecte-toi pour soumettre une prédiction.</p>`;

    container.innerHTML = html;
}

function displayPredictions() {
    const container = document.getElementById('predictionsContent');
    if (!container) return;

    // Upcoming editions (open for predictions)
    const today = new Date();
    const upcoming = state.data.editions
        .filter(e => e.status === 'upcoming' || new Date(e.date) > today)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    // Past editions with prediction results
    const past = state.data.editions
        .filter(e => e.status === 'terminee' || new Date(e.date) <= today)
        .filter(e => state.data.predictions.some(p => p.editionId === e.id))
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);

    let html = '';

    if (upcoming.length === 0 && past.length === 0) {
        html = '<div class="card"><div class="empty-state"><span class="empty-state-icon">🔮</span><p>Aucune prédiction disponible pour le moment</p></div></div>';
        container.innerHTML = html;
        return;
    }

    // ── Upcoming: prediction forms ──
    if (upcoming.length > 0) {
        html += '<div class="card"><h2>🔮 Prédis l\'édition suivante</h2>';
        upcoming.forEach(e => {
            const dateStr = e.date ? new Date(e.date).toLocaleDateString(dateLang(), { day: 'numeric', month: 'long', year: 'numeric' }) : '';
            const inscribedIds = new Set(state.data.results
                .filter(r => r.editionId === e.id && (r.phase === 'inscription' || r.phase === 'qualification'))
                .map(r => r.playerId));
            if (inscribedIds.size === 0) return; // skip if no players registered yet

            // Count predictions
            const predCount = state.data.predictions.filter(p => p.editionId === e.id).length;
            html += `<div class="pred-edition-card">
                <div class="pred-edition-header">
                    <div style="flex:1;font-weight:800">${e.name}</div>
                    <div style="font-size:0.8rem;color:var(--color-text-secondary)">${dateStr}</div>
                    <span class="pred-badge open">Ouvert</span>
                    <span style="font-size:0.75rem;color:rgba(255,255,255,0.3)">${predCount} prédiction${predCount !== 1 ? 's' : ''}</span>
                </div>
                <div class="pred-body">
                    <div id="pred-form-${e.id}"></div>
                </div>
            </div>`;
        });
        html += '</div>';
    }

    // ── Past: leaderboards ──
    if (past.length > 0) {
        html += '<div class="card"><h2>📊 Résultats des prédictions</h2>';
        past.forEach(e => {
            const preds = state.data.predictions.filter(p => p.editionId === e.id && p.scored);
            if (preds.length === 0) {
                // Scored not yet — show admin calc button
                if (!state.isAdmin) return;
                html += `<div class="pred-edition-card">
                    <div class="pred-edition-header">
                        <div style="flex:1;font-weight:700">${e.name}</div>
                        <span class="pred-badge closed">Non calculé</span>
                    </div>
                    <div class="pred-body">
                        <button class="btn btn-secondary" onclick="calculatePredictionScores('${e.id}')">⚡ Calculer les scores</button>
                    </div>
                </div>`;
                return;
            }

            const ranked = [...preds].sort((a, b) => (b.score || 0) - (a.score || 0));
            const dateStr = e.date ? new Date(e.date).toLocaleDateString(dateLang(), { day: 'numeric', month: 'long' }) : '';
            const adminCalc = state.isAdmin ? `<button class="btn btn-secondary btn-small" style="margin-left:auto" onclick="calculatePredictionScores('${e.id}')">🔄 Recalculer</button>` : '';
            html += `<div class="pred-edition-card">
                <div class="pred-edition-header">
                    <div style="flex:1;font-weight:700">${e.name}</div>
                    <div style="font-size:0.8rem;color:var(--color-text-secondary)">${dateStr}</div>
                    <span class="pred-badge scored">Calculé</span>
                    ${adminCalc}
                </div>
                <div class="pred-body">`;
            ranked.forEach((pred, i) => {
                const player = state.data.participants.find(p => p.id === pred.playerId);
                const isMe = state.currentUser && player?.userId === state.currentUser.uid;
                html += `<div class="pred-score-row" style="${isMe ? 'background:rgba(0,217,54,0.04);border-radius:6px;padding:8px 6px;' : ''}">
                    <span style="color:rgba(255,255,255,0.3);font-size:0.75rem;min-width:22px">${i+1}.</span>
                    <span style="flex:1;font-weight:${isMe?'700':'400'}">${player ? pName(player) : '?'}${isMe ? ' <span style="color:var(--color-accent);font-size:0.75rem">← toi</span>' : ''}</span>
                    <span class="pred-score-pts">${pred.score} pt${pred.score !== 1 ? 's' : ''}</span>
                </div>`;
            });
            html += '</div></div>';
        });
        html += '</div>';
    }

    container.innerHTML = html;

    // Render prediction forms for upcoming editions
    upcoming.forEach(e => {
        const inscribedIds = new Set(state.data.results
            .filter(r => r.editionId === e.id && (r.phase === 'inscription' || r.phase === 'qualification'))
            .map(r => r.playerId));
        if (inscribedIds.size > 0) renderPredForm(e.id);
    });
}

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