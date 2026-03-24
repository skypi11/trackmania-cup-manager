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
            openPlayerProfile(player.id);
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
    openPlayerProfile(playerId);
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
                openPlayerProfile(playerId);
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
        openPlayerProfile(player.id);
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
window.displayParticipants = function() {
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
    let html = `<table><thead><tr><th>${t('players.col.player')}</th><th>${t('players.col.team')}</th><th>${t('home.stat.participations')}</th><th>${t('stats.finals')}</th>${adminCol}</tr></thead><tbody>`;
    filtered.forEach(p => {
        const quals = new Set(state.data.results.filter(r => r.playerId === p.id && r.phase === 'qualification').map(r => r.editionId)).size;
        const finals = state.data.results.filter(r => r.playerId === p.id && r.phase === 'finale').length;
        const del = state.isAdmin ? `<td style="display:flex;gap:6px"><button class="btn btn-secondary btn-small" onclick="openEditParticipant('${p.id}')">✏️</button><button class="btn btn-danger btn-small" onclick="deleteParticipant('${p.id}')">🗑️</button></td>` : '';
        html += `<tr>
            <td><strong class="player-name-link" onclick="openPlayerProfile('${p.id}')">${pName(p)}</strong>${playerBadgesHtml(p.id)}</td>
            <td style="color:var(--color-text-secondary)">${tTeam(p.team)}</td>
            <td>${quals}</td>
            <td>${finals}</td>
            ${del}
        </tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
};

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
// Player profile
window.openPlayerProfile = (playerId) => {
    const player = state.data.participants.find(p => p.id === playerId);
    if (!player) return;

    const qualRes  = state.data.results.filter(r => r.playerId === playerId && r.phase === 'qualification');
    const finaleRes = state.data.results.filter(r => r.playerId === playerId && r.phase === 'finale').sort((a, b) => a.position - b.position);
    const points   = finaleRes.reduce((s, r) => s + getPoints(r.position), 0);
    const wins     = finaleRes.filter(r => r.position === 1).length;
    const podiums  = finaleRes.filter(r => r.position <= 3).length;
    const bestRank = finaleRes.length > 0 ? Math.min(...finaleRes.map(r => r.position)) : null;

    // Per-edition history (past editions only, sorted by date)
    const pastEditions = state.data.editions
        .filter(e => new Date(e.date) < new Date())
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    const historyRows = pastEditions.map(e => {
        const participated = qualRes.some(r => r.editionId === e.id);
        const finale = finaleRes.find(r => r.editionId === e.id);
        const inscrit = state.data.results.some(r => r.editionId === e.id && r.playerId === playerId && r.phase === 'inscription');
        if (!participated && !finale && !inscrit) return null;
        return { edition: e, participated, finale, inscrit };
    }).filter(Boolean);

    // ── Streaks & Records ──────────────────────────────────────────
    const pastDesc = [...pastEditions].reverse(); // most recent first

    // Current participation streak (from last edition backwards)
    let currentPartStreak = 0;
    for (const e of pastDesc) {
        if (qualRes.some(r => r.editionId === e.id)) currentPartStreak++;
        else break;
    }
    // Best participation streak (all-time)
    let bestPartStreak = 0, tmpStreak = 0;
    for (const e of pastEditions) {
        if (qualRes.some(r => r.editionId === e.id)) { tmpStreak++; bestPartStreak = Math.max(bestPartStreak, tmpStreak); }
        else tmpStreak = 0;
    }
    // Current finale streak
    let currentFinStreak = 0;
    for (const e of pastDesc) {
        if (finaleRes.some(r => r.editionId === e.id)) currentFinStreak++;
        else break;
    }
    // Best finale streak
    let bestFinStreak = 0, tmpFinStreak = 0;
    for (const e of pastEditions) {
        if (finaleRes.some(r => r.editionId === e.id)) { tmpFinStreak++; bestFinStreak = Math.max(bestFinStreak, tmpFinStreak); }
        else tmpFinStreak = 0;
    }
    // Max vies bonus in a single edition
    let maxVies = 0;
    pastEditions.forEach(e => {
        const v = qualRes.filter(r => r.editionId === e.id).length - 1;
        if (v > maxVies) maxVies = v;
    });
    // Best edition by points (single finale)
    const bestEditionResult = finaleRes.length > 0
        ? finaleRes.reduce((best, r) => getPoints(r.position) > getPoints(best.position) ? r : best)
        : null;
    const bestEditionName = bestEditionResult
        ? (state.data.editions.find(e => e.id === bestEditionResult.editionId)?.name || '?')
        : null;

    const isOwnProfile = state.currentUser && player.userId === state.currentUser.uid;
    const avatar = pName(player).charAt(0);
    const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
    const pStats = computePlayerStats(playerId);
    const avgPos = finaleRes.length > 0
        ? (finaleRes.reduce((s, r) => s + r.position, 0) / finaleRes.length).toFixed(1)
        : null;
    const winRate = finaleRes.length > 0
        ? Math.round(wins / finaleRes.length * 100)
        : null;

    // Achievement grid
    const achievementGridHtml = ACHIEVEMENTS.map(a => {
        const ok = a.check(pStats);
        return `<div class="achievement-card ${ok ? 'unlocked' : 'locked'}">
            ${!ok ? '<span class="achievement-lock">🔒</span>' : ''}
            <div class="achievement-icon">${a.icon}</div>
            <div class="achievement-name">${a.name}</div>
            <div class="achievement-desc">${a.desc}</div>
        </div>`;
    }).join('');

    // Top unlocked achievements for the card preview (up to 4)
    const unlockedAchievements = ACHIEVEMENTS.filter(a => a.check(pStats));
    const badgePreviewHtml = unlockedAchievements.length > 0
        ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:14px">${unlockedAchievements.slice(0, 4).map(a => `<span title="${a.name} — ${a.desc}" style="font-size:1.25rem;line-height:1;background:rgba(255,255,255,0.06);border-radius:8px;padding:5px 8px;border:1px solid rgba(255,255,255,0.1)">${a.icon}</span>`).join('')}${unlockedAchievements.length > 4 ? `<span style="font-size:0.75rem;color:var(--color-text-secondary);align-self:center;padding-left:4px">+${unlockedAchievements.length - 4}</span>` : ''}</div>`
        : '';

    const shareUrl = `${location.origin}${location.pathname}?cup=${cupId}&player=${playerId}`;

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
                <img src="../assets/springs-logo.png" style="height:18px;opacity:0.22">
            </div>
        </div>
        <div class="player-profile-stats" style="margin-bottom:20px">
            <div class="pp-stat"><div class="pp-stat-value">${new Set(qualRes.map(r => r.editionId)).size}</div><div class="pp-stat-label">${t('stats.participations')}</div></div>
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

    // Chart only if they have finale results
    if (finaleRes.length > 0) {
        html += `<div class="phase-title" style="margin-top:20px">${t('player.evo')}</div>
            <div class="player-chart-container"><canvas id="playerChartCanvas"></canvas></div>`;
    }

    // Edit section for own profile
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
                        <input type="text" id="ownProfilePseudo" required>
                    </div>
                    <div class="form-group">
                        <label>${t('profile.team')}</label>
                        <input type="text" id="ownProfileTeam" placeholder="Sans équipe">
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

    // Bind own profile edit form
    if (isOwnProfile) {
        document.getElementById('ownProfilePseudo').value = pName(player);
        document.getElementById('ownProfileTeam').value = player.team === 'Sans équipe' ? '' : (player.team || '');
        document.getElementById('ownProfileEditForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const pseudo = document.getElementById('ownProfilePseudo').value.trim();
            const team   = document.getElementById('ownProfileTeam').value.trim() || 'Sans équipe';
            const msg    = document.getElementById('ownProfileSaveMsg');
            if (!pseudo) return;
            try {
                await updateDoc(doc(db, 'participants', player.id), { pseudo, team });
                document.getElementById('playerBtn').textContent = `👤 ${pseudo}`;
                msg.style.display = 'block';
                msg.style.background = 'rgba(0,217,54,0.1)';
                msg.style.color = 'var(--color-accent)';
                msg.textContent = t('profile.saved');
                setTimeout(() => msg.style.display = 'none', 3000);
            } catch {
                msg.style.display = 'block';
                msg.style.background = 'rgba(239,68,68,0.1)';
                msg.style.color = 'var(--color-danger)';
                msg.textContent = t('profile.error');
            }
        });
    }

    // Draw chart — line showing rank evolution across all past editions
    if (finaleRes.length > 0) {
        const chartLabels = pastEditions.map(e => e.name);
        const chartData = pastEditions.map(e => {
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

window.copyPlayerCard = async (playerId, btn) => {
    const player = state.data.participants.find(p => p.id === playerId);
    if (!player) return;

    const qualRes   = state.data.results.filter(r => r.playerId === playerId && r.phase === 'qualification');
    const finaleRes = state.data.results.filter(r => r.playerId === playerId && r.phase === 'finale');
    const points  = finaleRes.reduce((s, r) => s + getPoints(r.position), 0);
    const wins    = finaleRes.filter(r => r.position === 1).length;
    const podiums = finaleRes.filter(r => r.position <= 3).length;
    const winRate = finaleRes.length > 0 ? Math.round(wins / finaleRes.length * 100) : null;
    const pStats  = computePlayerStats(playerId);
    const unlockedBadges = ACHIEVEMENTS.filter(a => a.check(pStats));

    // Pre-load logo
    const logo = await new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = '../assets/springs-logo.png';
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

    // Wins badge (text only, no emoji for reliability)
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

    // Unlocked badges row — use emoji font explicitly
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

    // Stats row — 6 stats with participations
    const statsData = [
        { label: 'PARTICIPATIONS', value: String(new Set(qualRes.map(r => r.editionId)).size) },
        { label: 'FINALES',        value: String(finaleRes.length) },
        { label: 'POINTS',         value: String(points) },
        { label: 'VICTOIRES',      value: String(wins) },
        { label: 'PODIUMS',        value: String(podiums) },
        { label: 'WIN RATE',       value: winRate !== null ? winRate + '%' : '—' },
    ];
    const statW = W / statsData.length;
    statsData.forEach((s, i) => {
        const x = i * statW + statW / 2;
        // Stat value
        ctx.fillStyle = ACCENT;
        ctx.font = `bold 21px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(s.value, x, 282);
        // Separator (except last)
        if (i < statsData.length - 1) {
            ctx.strokeStyle = 'rgba(255,255,255,0.07)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo((i + 1) * statW, 254);
            ctx.lineTo((i + 1) * statW, 298);
            ctx.stroke();
        }
        // Label
        ctx.fillStyle = '#64748b';
        ctx.font = `9px Arial`;
        ctx.fillText(s.label, x, 297);
    });

    // Footer: "Springs E-Sport" text
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = `10px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Springs E-Sport', W / 2, H - 16);

    // Convert to blob and copy
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

window.copyPodium = async (editionId, btn) => {
    const edition = state.data.editions.find(e => e.id === editionId);
    if (!edition) return;
    const finaleResults = state.data.results.filter(r => r.editionId === editionId && r.phase === 'finale').sort((a, b) => a.position - b.position);
    if (finaleResults.length === 0) return;

    const logo = await new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = '../assets/springs-logo.png';
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
    const podiumOrder = [2, 1, 3];
    const podiumHeights = { 1: 110, 2: 80, 3: 60 };
    const podiumColors  = { 1: 'rgba(251,191,36,0.18)', 2: 'rgba(148,163,184,0.14)', 3: 'rgba(180,83,9,0.14)' };
    const podiumBorders = { 1: 'rgba(251,191,36,0.55)', 2: 'rgba(148,163,184,0.4)',  3: 'rgba(180,83,9,0.45)' };
    const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
    const blockW = 180, gap = 14;
    const totalW = blockW * 3 + gap * 2;
    const startX = (W - totalW) / 2;
    const baseY = H - 55;

    podiumOrder.forEach((pos, i) => {
        const result = finaleResults.find(r => r.position === pos);
        const player = result ? state.data.participants.find(p => p.id === result.playerId) : null;
        const bh = podiumHeights[pos];
        const x = startX + i * (blockW + gap);
        const y = baseY - bh;

        // Block
        roundRect(x, y, blockW, bh, 10);
        ctx.fillStyle = podiumColors[pos]; ctx.fill();
        roundRect(x, y, blockW, bh, 10);
        ctx.strokeStyle = podiumBorders[pos]; ctx.lineWidth = 1.2; ctx.stroke();

        // Position number inside block
        ctx.fillStyle = pos === 1 ? '#fbbf24' : pos === 2 ? '#94a3b8' : '#b45309';
        ctx.font = `bold 28px Arial`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(pos), x + blockW / 2, y + bh / 2 + 8);

        if (!player) return;

        // Medal emoji above block
        ctx.font = `26px ${EMOJI_FONT}`;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(medals[pos], x + blockW / 2, y - 30);

        // Player name above medal
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 15px Arial`;
        ctx.textBaseline = 'alphabetic';
        // Truncate if too long
        let name = pName(player);
        while (ctx.measureText(name).width > blockW - 10 && name.length > 1) name = name.slice(0, -1);
        if (name !== pName(player)) name += '…';
        ctx.fillText(name, x + blockW / 2, y - 56);

        // Team
        ctx.fillStyle = '#64748b';
        ctx.font = `11px Arial`;
        let team = player.team || '';
        while (ctx.measureText(team).width > blockW - 10 && team.length > 1) team = team.slice(0, -1);
        if (team !== (player.team || '')) team += '…';
        ctx.fillText(team, x + blockW / 2, y - 40);

        // Points
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