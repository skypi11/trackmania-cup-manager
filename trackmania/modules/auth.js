// modules/auth.js — Authentification Discord (joueurs) + Google (admin), profil joueur, checkLoaded

import { db, auth } from '../../shared/firebase-config.js';
import { state } from './state.js';
import { t } from '../../shared/i18n.js';
import { pName, showToast, buildCountryPicker } from './utils.js';
import { addDoc, getDoc, getDocs, updateDoc, doc, collection, query, where } from 'firebase/firestore';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { handleDiscordCallback, updateDiscordReminders, maybeShowDiscordPrompt } from './discord.js';
import { displayHome, displayNextEditionBanner } from './display-home.js';
import { displayParticipants } from './display-players.js';
import { displayEditions } from './display-editions.js';

const cupId = new URLSearchParams(window.location.search).get('cup') || 'monthly';

const DISCORD_CLIENT_ID  = '1483592495215673407';
const DISCORD_REDIRECT   = 'https://springs-esport.vercel.app/api/discord-callback';

// ── checkLoaded ───────────────────────────────────────────────────────────────

state.urlAutoOpenDone = false;
let _loadingTimeoutId = setTimeout(() => {
    if (Object.values(state.loaded).some(v => !v)) {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay && !overlay.classList.contains('hidden')) {
            overlay.innerHTML = `
                <p style="color:var(--color-danger);font-size:0.95rem;text-align:center;margin:0 0 8px">⚠️ Chargement trop long…</p>
                <p style="color:var(--color-text-secondary);font-size:0.82rem;text-align:center;margin:0 0 16px">Vérifiez votre connexion internet.</p>
                <button onclick="location.reload()" style="padding:8px 20px;background:var(--color-accent);color:#000;border:none;border-radius:6px;cursor:pointer;font-weight:700;font-size:0.9rem">🔄 Réessayer</button>`;
        }
    }
}, 15000);

export function checkLoaded() {
    if (Object.values(state.loaded).every(Boolean)) {
        clearTimeout(_loadingTimeoutId);
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

// ── Discord OAuth callback (retour depuis /api/discord-callback) ──────────────

(async function handleTMDiscordCallback() {
    const params   = new URLSearchParams(window.location.search);
    const ft       = params.get('ft');
    const did      = params.get('did');
    const du       = params.get('du');
    const da       = params.get('da');
    const authErr  = params.get('auth_error');

    if (ft || authErr) {
        // Nettoyer l'URL
        history.replaceState({}, '', `${window.location.pathname}?cup=${cupId}`);
    }

    if (authErr) {
        setTimeout(() => showToast(t('auth.error')), 500);
        return;
    }

    if (ft) {
        // Stocker les infos Discord pour la création de profil (+ sessionStorage pour survivre à un refresh)
        state.discordId       = did  || '';
        state.discordUsername = du   || '';
        state.discordAvatar   = da   || '';
        if (did) {
            sessionStorage.setItem('tm_discord_id',       did);
            sessionStorage.setItem('tm_discord_username', du  || '');
            sessionStorage.setItem('tm_discord_avatar',   da  || '');
        }

        try {
            const cred = await signInWithCustomToken(auth, ft);
            await _onTMDiscordLogin(cred.user, did, du, da);
        } catch(e) {
            console.error('TM Discord sign-in error:', e);
            showToast(t('auth.error'));
        }
    }
})();

// ── Auto-migration : rattache un participant existant au nouveau UID Discord ──

async function _onTMDiscordLogin(user, discordId, discordUsername, discordAvatar) {
    if (!discordId) return;
    try {
        // 1. Chercher par discordId (joueur qui avait déjà lié son Discord)
        const byId = await getDocs(query(
            collection(db, 'participants'),
            where('discordId', '==', discordId)
        ));
        if (!byId.empty) {
            await updateDoc(byId.docs[0].ref, {
                userId: user.uid,
                discordId,
                discordUsername,
                discordAvatar: discordAvatar || byId.docs[0].data().discordAvatar || ''
            });
            return;
        }

        // 2. Chercher par discordUsername (fallback)
        if (discordUsername) {
            const byName = await getDocs(query(
                collection(db, 'participants'),
                where('discordUsername', '==', discordUsername)
            ));
            if (!byName.empty) {
                await updateDoc(byName.docs[0].ref, {
                    userId: user.uid,
                    discordId,
                    discordUsername,
                    discordAvatar: discordAvatar || ''
                });
                return;
            }
        }
        // 3. Aucun match → le joueur créera un nouveau profil
    } catch(e) {
        console.error('TM Discord profile link error:', e);
    }
}

// ── Auth modal ────────────────────────────────────────────────────────────────

window.openAuthModal  = () => document.getElementById('authOverlay').classList.add('open');
window.closeAuthModal = () => document.getElementById('authOverlay').classList.remove('open');

// ── Discord sign-in (joueurs) ─────────────────────────────────────────────────

window.authDiscordSignIn = () => {
    const state = `tm_${cupId}`;
    const url   = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT)}&response_type=code&scope=identify&state=${state}`;
    window.location.href = url;
};

// ── Google sign-in (admin uniquement) ────────────────────────────────────────

const googleProvider = new GoogleAuthProvider();

// Connexion admin via Google (lien discret dans la modale auth)
window.toggleAdmin = async () => {
    try {
        await signInWithPopup(auth, googleProvider);
    } catch(err) {
        if (err.code !== 'auth/popup-closed-by-user') alert(t('auth.error'));
    }
};

window.playerSignOut = async () => {
    window.closePlayerProfile();
    if (confirm(t('msg.logout.confirm'))) await signOut(auth);
};

// ── Auth state listener ───────────────────────────────────────────────────────

onAuthStateChanged(auth, async (user) => {
    state.currentUser = user;

    const loginBtn        = document.getElementById('loginBtn');
    const playerBtn       = document.getElementById('playerBtn');
    const topbarLoginBtn  = document.getElementById('topbarLoginBtn');
    const topbarPlayerBtn = document.getElementById('topbarPlayerBtn');

    if (!user) {
        state.isAdmin = false;
        state.currentUserProfile = null;
        loginBtn.style.display  = '';
        playerBtn.style.display = 'none';
        if (topbarLoginBtn)  topbarLoginBtn.style.display  = '';
        if (topbarPlayerBtn) topbarPlayerBtn.style.display = 'none';
        document.body.classList.remove('admin-mode');
        state.loaded.auth = true;
        checkLoaded();
        displayParticipants();
        displayEditions();
        displayNextEditionBanner();
        return;
    }

    loginBtn.style.display = 'none';
    if (topbarLoginBtn) topbarLoginBtn.style.display = 'none';
    window.closeAuthModal();

    try {
        const [adminSnap, partSnap] = await Promise.all([
            getDoc(doc(db, 'admins', user.uid)),
            getDocs(query(collection(db, 'participants'), where('userId', '==', user.uid)))
        ]);
        state.isAdmin = adminSnap.exists();
        state.currentUserProfile = !partSnap.empty ? partSnap.docs[0].data() : null;

        // Auto-patch : maintient à jour discordId / username / avatar à chaque connexion
        // - discordId : rempli si manquant (legacy migration)
        // - discordUsername / discordAvatar : refresh à chaque login pour rester sync avec Discord
        if (!partSnap.empty && user.uid.startsWith('discord_')) {
            const pDoc = partSnap.docs[0];
            const pData = pDoc.data();
            const patch = {};
            if (!pData.discordId) {
                patch.discordId = user.uid.replace('discord_', '');
            }
            if (state.discordUsername && pData.discordUsername !== state.discordUsername) {
                patch.discordUsername = state.discordUsername;
            }
            if (state.discordAvatar && pData.discordAvatar !== state.discordAvatar) {
                patch.discordAvatar = state.discordAvatar;
            }
            if (Object.keys(patch).length > 0) {
                updateDoc(doc(db, 'participants', pDoc.id), patch).catch(() => {});
            }
        }
    } catch(err) {
        console.error('Auth Firestore fetch error:', err);
        state.isAdmin = false;
        state.currentUserProfile = null;
    }

    if (state.isAdmin) {
        document.body.classList.add('admin-mode');
        playerBtn.style.display = '';
        const pseudoAdmin = state.currentUserProfile?.pseudo || user.displayName || t('nav.account');
        playerBtn.textContent = `👤 ${pseudoAdmin}`;
        if (topbarPlayerBtn) { topbarPlayerBtn.style.display = ''; topbarPlayerBtn.textContent = `👤 ${pseudoAdmin}`; }
    } else {
        document.body.classList.remove('admin-mode');
        playerBtn.style.display = '';
        const linkedPlayer = state.data.participants.find(p => p.userId === user.uid);
        const pseudo = linkedPlayer ? pName(linkedPlayer) : (state.currentUserProfile?.pseudo || user.displayName || t('nav.account'));
        playerBtn.textContent = `👤 ${pseudo}`;
        if (topbarPlayerBtn) { topbarPlayerBtn.style.display = ''; topbarPlayerBtn.textContent = `👤 ${pseudo}`; }
        // Nouveau joueur Discord sans profil → ouvrir la création de profil automatiquement
        if (!linkedPlayer && !state.currentUserProfile && user.uid.startsWith('discord_')) {
            setTimeout(() => window.openCreateProfile(), 600);
        }
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
    // Restaurer les infos Discord depuis sessionStorage si besoin (cas d'un refresh de page)
    if (!state.discordId && state.currentUser?.uid?.startsWith('discord_')) {
        state.discordId       = sessionStorage.getItem('tm_discord_id')       || state.currentUser.uid.replace('discord_', '');
        state.discordUsername = sessionStorage.getItem('tm_discord_username') || '';
        state.discordAvatar   = sessionStorage.getItem('tm_discord_avatar')   || '';
    }

    const gameLabel = cupId === 'mania' ? '(Mania)' : '(Trackmania)';
    document.getElementById('newProfileGameLabel').textContent = gameLabel;
    document.getElementById('newProfilePseudo').value   = state.discordUsername || '';
    document.getElementById('newProfilePseudoTM').value = '';
    document.getElementById('newProfileLoginTM').value  = '';
    document.getElementById('newProfileTeam').value    = '';
    document.getElementById('createProfileMsg').style.display = 'none';
    document.getElementById('newProfileCountry_picker').innerHTML = buildCountryPicker('newProfileCountry');

    // Afficher l'info Discord si connecté via Discord
    const discordInfo   = document.getElementById('createProfileDiscordInfo');
    const discordAvatar = document.getElementById('createProfileDiscordAvatar');
    const discordName   = document.getElementById('createProfileDiscordName');
    if (state.discordUsername && discordInfo) {
        discordInfo.style.display = 'flex';
        if (discordAvatar) discordAvatar.src = state.discordAvatar || '';
        if (discordName)   discordName.textContent = `@${state.discordUsername}`;
    } else if (discordInfo) {
        discordInfo.style.display = 'none';
    }

    document.getElementById('createProfileModal').classList.add('open');
};
window.closeCreateProfile = () => {
    document.getElementById('createProfileModal').classList.remove('open');
};

document.getElementById('createProfileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.currentUser) return;
    const pseudo    = document.getElementById('newProfilePseudo').value.trim();
    const pseudoTM  = document.getElementById('newProfilePseudoTM').value.trim();
    const loginTM   = document.getElementById('newProfileLoginTM').value.trim();
    const country   = document.getElementById('newProfileCountry').value.trim();
    const team      = document.getElementById('newProfileTeam').value.trim() || 'Sans équipe';
    const msg       = document.getElementById('createProfileMsg');

    if (!pseudo || !pseudoTM || !loginTM || !country) return;
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
            pseudoTM, loginTM, country, games: ['trackmania'],
            createdAt: new Date().toISOString(),
            discordId:       state.discordId       || '',
            discordUsername: state.discordUsername || '',
            discordAvatar:   state.discordAvatar   || ''
        });
        sessionStorage.removeItem('tm_discord_id');
        sessionStorage.removeItem('tm_discord_username');
        sessionStorage.removeItem('tm_discord_avatar');
        window.closeCreateProfile();
        document.getElementById('playerBtn').textContent = `👤 ${pseudo}`;
        showToast(t('profile.created'));
    } catch(err) {
        console.error('Create profile error:', err);
        msg.style.cssText = 'display:block;background:rgba(239,68,68,0.1);color:var(--color-danger);font-size:0.85rem;padding:8px 12px;border-radius:6px;margin:10px 0';
        msg.textContent = t('profile.error.create');
        btn.disabled = false; btn.textContent = t('profile.create.btn');
    }
});
