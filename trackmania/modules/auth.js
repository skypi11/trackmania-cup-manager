// modules/auth.js — Authentification Google, profil joueur, checkLoaded

import { db, auth } from '../../shared/firebase-config.js';
import { state } from './state.js';
import { t } from '../../shared/i18n.js';
import { pName, showToast } from './utils.js';
import { addDoc, getDoc, getDocs, doc, collection, query, where } from 'firebase/firestore';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { handleDiscordCallback, updateDiscordReminders, maybeShowDiscordPrompt } from './discord.js';
import { displayHome, displayNextEditionBanner } from './display-home.js';
import { displayParticipants } from './display-players.js';
import { displayEditions } from './display-editions.js';

const cupId = new URLSearchParams(window.location.search).get('cup') || 'monthly';

// ── checkLoaded ───────────────────────────────────────────────────────────────

state.urlAutoOpenDone = false;

export function checkLoaded() {
    if (Object.values(state.loaded).every(Boolean)) {
        document.getElementById('loadingOverlay').classList.add('hidden');
        displayHome();
        updateDiscordReminders();
        if (state.pendingDiscordToken && state.currentUser) {
            handleDiscordCallback(state.pendingDiscordToken);
            state.pendingDiscordToken = null;
        }
        maybeShowDiscordPrompt();
        if (!state.urlAutoOpenDone) {
            state.urlAutoOpenDone = true;
            const params = new URLSearchParams(window.location.search);
            const editionId = params.get('edition');
            const playerId  = params.get('player');
            if (editionId && state.data.editions.find(e => e.id === editionId)) {
                window.showSection('editions');
                window.openEditionDetail(editionId);
            } else if (playerId && state.data.participants.find(p => p.id === playerId)) {
                window.openPlayerProfile(playerId);
            }
        }
    }
}

// ── Auth modal ────────────────────────────────────────────────────────────────

window.openAuthModal  = () => document.getElementById('authOverlay').classList.add('open');
window.closeAuthModal = () => document.getElementById('authOverlay').classList.remove('open');

// ── Google sign-in ────────────────────────────────────────────────────────────

const googleProvider = new GoogleAuthProvider();

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

window.toggleAdmin = async () => {
    if (state.isAdmin) {
        await signOut(auth);
    } else {
        try {
            await signInWithPopup(auth, googleProvider);
        } catch(err) {
            if (err.code !== 'auth/popup-closed-by-user') alert(t('auth.error'));
        }
    }
};

window.playerSignOut = async () => {
    window.closePlayerProfile();
    if (confirm(t('msg.logout.confirm'))) await signOut(auth);
};

// ── Auth state listener ───────────────────────────────────────────────────────

onAuthStateChanged(auth, async (user) => {
    state.currentUser = user;

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

    loginBtn.style.display = 'none';
    window.closeAuthModal();

    try {
        const [adminSnap, partSnap] = await Promise.all([
            getDoc(doc(db, 'admins', user.uid)),
            getDocs(query(collection(db, 'participants'), where('userId', '==', user.uid)))
        ]);
        state.isAdmin = adminSnap.exists();
        state.currentUserProfile = !partSnap.empty ? partSnap.docs[0].data() : null;
    } catch(err) {
        console.error('Auth Firestore fetch error:', err);
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
    state.loaded.auth = true;
    checkLoaded();
    displayParticipants();
    displayEditions();
    displayNextEditionBanner();
});

// ── Profil joueur ─────────────────────────────────────────────────────────────

window.openPlayerAccount = () => {
    if (!state.currentUser) return window.openAuthModal();
    const player = state.data.participants.find(p => p.userId === state.currentUser.uid);
    if (player) {
        window.openPlayerProfile(player.id);
    } else {
        window.openCreateProfile();
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
        window.closeCreateProfile();
        document.getElementById('playerBtn').textContent = `👤 ${pseudo}`;
        showToast(t('profile.created'));
        sessionStorage.removeItem('discordPromptDismissed');
        setTimeout(() => {
            document.getElementById('discordPromptOverlay').classList.add('open');
        }, 700);
    } catch(err) {
        console.error('Create profile error:', err);
        msg.style.cssText = 'display:block;background:rgba(239,68,68,0.1);color:var(--color-danger);font-size:0.85rem;padding:8px 12px;border-radius:6px;margin:10px 0';
        msg.textContent = t('profile.error.create');
        btn.disabled = false; btn.textContent = t('profile.create.btn');
    }
});
