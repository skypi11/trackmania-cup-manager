// modules/auth.js
import { db, auth } from '../../shared/firebase-config.js';
import { collection, getDocs, getDoc, setDoc, updateDoc, doc, query, where } from 'firebase/firestore';
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut, signInWithCustomToken, updateProfile } from 'firebase/auth';
import { state } from './state.js';
import { DISCORD_AUTH_URL, buildRLCountryPicker } from './constants.js';
import { esc, toast, openModal, closeModal } from './utils.js';
import { t } from './i18n.js';

// Gestion du retour OAuth Discord (params dans l'URL)
(async function handleDiscordCallback() {
  const params = new URLSearchParams(window.location.search);
  const ft = params.get('ft');
  const did = params.get('did');
  const du = params.get('du');
  const da = params.get('da');
  const authError = params.get('auth_error');

  if (ft || authError) history.replaceState({}, '', window.location.pathname);

  if (authError) {
    setTimeout(() => toast('Erreur de connexion Discord', 'err'), 500);
    return;
  }

  if (ft) {
    try {
      const cred = await signInWithCustomToken(auth, ft);
      await updateProfile(cred.user, { displayName: du, photoURL: da });
      await _onDiscordLogin(cred.user, did, du, da);
      setTimeout(() => toast(`Bienvenue ${du} !`, 'ok'), 300);
    } catch(e) {
      console.error('Discord sign-in error:', e);
      setTimeout(() => toast('Erreur de connexion', 'err'), 500);
    }
  }
})();

async function _onDiscordLogin(user, discordId, discordUsername, discordAvatar) {
  try {
    // Déjà lié par uid ?
    const byUid = query(collection(db, 'rl_players'), where('userId', '==', user.uid));
    const snapUid = await getDocs(byUid);
    if (!snapUid.empty) return;

    // Auto-lien par pseudoDiscord
    const byPseudo = query(collection(db, 'rl_players'), where('pseudoDiscord', '==', discordUsername));
    const snapPseudo = await getDocs(byPseudo);

    if (!snapPseudo.empty) {
      const pid = snapPseudo.docs[0].id;
      await updateDoc(doc(db, 'rl_players', pid), {
        userId: user.uid, discordId, discordAvatar, discordUsername,
      });
      // Mise à jour du cache local directement (évite un rechargement complet)
      if (state.playersMap[pid]) Object.assign(state.playersMap[pid], { userId: user.uid, discordId, discordAvatar, discordUsername });
    } else {
      // Spectateur/prédicteur : profil minimal
      await setDoc(doc(db, 'rl_predictors', user.uid), {
        uid: user.uid,
        discordId,
        discordUsername,
        discordAvatar,
        lastLogin: new Date().toISOString(),
      }, { merge: true });
    }
  } catch(e) {
    console.error('Discord profile link error:', e);
  }
}

function _updateAuthBtn() {
  const btn = document.getElementById('btn-auth');
  if (!btn) return;
  if (state.curUser) {
    const name = state.curUser.displayName || '?';
    const photo = state.curUser.photoURL;
    btn.classList.remove('cta');
    btn.classList.add('connected');
    btn.innerHTML = photo
      ? `<img class="btn-disc-av" src="${photo}" alt=""> ${name}`
      : name;
    btn.title = 'Se déconnecter';
  } else {
    btn.classList.remove('connected');
    btn.classList.add('cta');
    btn.innerHTML = `<svg width="16" height="12" viewBox="0 0 127.14 96.36" fill="currentColor"><path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/></svg> Se connecter avec Discord`;
    btn.title = '';
  }
}
window._updateAuthBtn = _updateAuthBtn;

onAuthStateChanged(auth, async user => {
  state.curUser = user;
  if (user) {
    try {
      const d = await getDoc(doc(db,'admins',user.uid));
      state.isAdmin = d.exists();
    } catch(e) { state.isAdmin = false; }
  } else {
    state.isAdmin = false;
  }
  const navAdm = document.getElementById('nav-admin');
  navAdm.style.display = state.isAdmin ? 'inline-block' : 'none';
  const adminBtn = document.getElementById('admin-login-btn');
  if (adminBtn) adminBtn.style.display = user ? 'none' : '';
  if (state.curTab === 'admin' && !state.isAdmin) {
    if (window._goTab) window._goTab('accueil');
  }
  _updateAuthBtn();
});

window.doAuth = function() {
  if (state.curUser) {
    _toggleUserMenu();
  } else {
    window.location.href = DISCORD_AUTH_URL;
  }
};

window.doSignOut = async function() {
  _closeUserMenu();
  await signOut(auth);
};

window.openProfile = async function() {
  _closeUserMenu();
  if (!state.curUser) return;
  const body = document.getElementById('mo-profile-body');
  body.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text2)">Chargement...</div>';
  openModal('mo-profile');

  try {
    if (window._fetchAll) await window._fetchAll();

    // Cherche le profil joueur lié à cet uid
    let playerDoc = null;
    for (const p of Object.values(state.playersMap)) {
      if (p.userId === state.curUser.uid) { playerDoc = p; break; }
    }

    // Charge les données de saison pour les stats de prédiction
    let predictorSeasonDoc = null;
    const predSeasonSnap = await getDoc(doc(db, 'rl_pred_season', state.curUser.uid));
    if (predSeasonSnap.exists()) predictorSeasonDoc = { id: predSeasonSnap.id, ...predSeasonSnap.data() };

    // Calcul des stats de prédiction
    const predVotes = predictorSeasonDoc?.votes || {};
    let predPts = 0, predVoted = 0, predCorrect = 0, predExact = 0;
    const playedMs = Object.values(state.matchesMap).filter(m => m.status === 'played');
    playedMs.forEach(m => {
      if (!predVotes[m.id]) return;
      predVoted++;
      const p = window.calcPredPoints ? window.calcPredPoints(predVotes[m.id], m) : 0;
      predPts += p;
      if (p >= 1) predCorrect++;
      if (p === 3) predExact++;
    });

    const name = state.curUser.displayName || '?';
    const photo = state.curUser.photoURL;

    // Stats depuis les matchs (si joueur)
    let played = 0, wins = 0, losses = 0;
    if (playerDoc?.teamId) {
      Object.values(state.matchesMap).forEach(m => {
        if (m.status !== 'played') return;
        const isHome = m.homeTeamId === playerDoc.teamId;
        const isAway = m.awayTeamId === playerDoc.teamId;
        if (!isHome && !isAway) return;
        played++;
        const teamScore = isHome ? m.homeScore : m.awayScore;
        const oppScore  = isHome ? m.awayScore  : m.homeScore;
        if (teamScore > oppScore) wins++; else losses++;
      });
    }

    // Équipe
    const team = playerDoc?.teamId ? state.teamsMap[playerDoc.teamId] : null;

    // Pseudo RL depuis tracker URL
    function extractPseudoRL(url) {
      if (!url) return '';
      const m = url.match(/\/profile\/(?:epic|steam|ps4|xbox|switch)\/([^/]+)\//i);
      if (!m) return '';
      try { return decodeURIComponent(m[1]); } catch { return m[1]; }
    }
    const pseudoRL = playerDoc?.pseudoRL || extractPseudoRL(playerDoc?.trackerUrl) || '';
    const trackerLocked = !!(playerDoc?.trackerUrl);

    // Rôle label
    const roleLabels = { titulaire:'Titulaire', capitaine:'Capitaine', sub:'Substitut', coach:'Coach' };

    body.innerHTML = `
      <!-- Hero -->
      <div class="prof-hero">
        ${photo ? `<img class="prof-av" src="${photo}" alt="">` : '<div class="prof-av-placeholder">👤</div>'}
        <div class="prof-hero-info">
          <div class="prof-name">${esc(name)}</div>
          <div class="prof-discord">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#5865F2"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.031.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
            ${esc(name)}
          </div>
          ${playerDoc && team ? `<span class="prof-team-badge">${esc(team.tag||team.name)} · ${roleLabels[playerDoc.role]||playerDoc.role||'—'}</span>`
            : `<span class="prof-spectator-badge">👁 Spectateur</span>`}
        </div>
      </div>

      ${playerDoc ? `
      <!-- Infos de jeu -->
      <div class="prof-section">
        <div class="prof-section-title">Infos de jeu</div>
        <div class="prof-field">
          <label>Pseudo RL in-game</label>
          <input class="finput" id="pf-rl" value="${esc(pseudoRL)}" placeholder="Ton pseudo Rocket League">
        </div>
        <div class="prof-field">
          <label>Tracker</label>
          ${trackerLocked
            ? `<div class="prof-locked">
                <span class="prof-lock-icon">🔒</span>
                <a href="${esc(playerDoc.trackerUrl)}" target="_blank" rel="noopener">${esc(playerDoc.trackerUrl)}</a>
                <button class="btn-s" style="font-size:.68rem;flex-shrink:0" onclick="requestTrackerChange()">Demander modif.</button>
               </div>`
            : `<div style="display:flex;gap:6px">
                <input class="finput" id="pf-tracker" placeholder="https://rocketleague.tracker.network/..." type="url" style="flex:1">
                <button class="btn-s" onclick="saveTrackerUrl('${playerDoc.id}')">Enregistrer</button>
               </div>
               <div style="font-size:.68rem;color:var(--text2);margin-top:4px">⚠ Une fois enregistré, non modifiable sans demande admin</div>`
          }
        </div>
      </div>

      <!-- Infos personnelles -->
      <div class="prof-section">
        <div class="prof-section-title">Infos personnelles</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="prof-field">
            <label>Pays</label>
            <div id="pf-country-picker">${buildRLCountryPicker('pf-country', playerDoc.country||'')}</div>
          </div>
          <div class="prof-field">
            <label>Date de naissance</label>
            <input class="finput" id="pf-dob" type="date" value="${esc(playerDoc.dateOfBirth||'')}">
          </div>
        </div>
      </div>

      <!-- Stats équipe -->
      <div class="prof-section">
        <div class="prof-section-title">Statistiques équipe</div>
        <div class="prof-stats-row">
          <div class="prof-stat"><div class="prof-stat-val">${played}</div><div class="prof-stat-lbl">Matchs</div></div>
          <div class="prof-stat"><div class="prof-stat-val win">${wins}</div><div class="prof-stat-lbl">Victoires</div></div>
          <div class="prof-stat"><div class="prof-stat-val loss">${losses}</div><div class="prof-stat-lbl">Défaites</div></div>
        </div>
      </div>

      <!-- Stats prédictions -->
      ${predVoted > 0 ? `
      <div class="prof-section">
        <div class="prof-section-title">🔮 Prédictions</div>
        <div class="prof-stats-row">
          <div class="prof-stat"><div class="prof-stat-val" style="color:var(--rl-blue)">${predPts}</div><div class="prof-stat-lbl">Points</div></div>
          <div class="prof-stat"><div class="prof-stat-val">${predCorrect}/${predVoted}</div><div class="prof-stat-lbl">Corrects</div></div>
          <div class="prof-stat"><div class="prof-stat-val" style="color:#FFB800">${predExact > 0 ? predExact + '★' : '–'}</div><div class="prof-stat-lbl">Scores exacts</div></div>
        </div>
      </div>` : ''}

      <div class="prof-actions">
        <button class="btn-p" onclick="saveProfile('${playerDoc.id}')">Enregistrer</button>
        <button class="btn-s" onclick="closeModal('mo-profile')">Annuler</button>
      </div>
      ` : `
      <div style="text-align:center;padding:16px 0;color:var(--text2);font-size:.85rem">
        Tu n'es pas encore enregistré comme joueur RL.<br>
        <span style="font-size:.75rem">Ton compte spectateur est actif.</span>
      </div>
      ${predVoted > 0 ? `
      <div class="prof-section">
        <div class="prof-section-title">🔮 Prédictions</div>
        <div class="prof-stats-row">
          <div class="prof-stat"><div class="prof-stat-val" style="color:var(--rl-blue)">${predPts}</div><div class="prof-stat-lbl">Points</div></div>
          <div class="prof-stat"><div class="prof-stat-val">${predCorrect}/${predVoted}</div><div class="prof-stat-lbl">Corrects</div></div>
          <div class="prof-stat"><div class="prof-stat-val" style="color:#FFB800">${predExact > 0 ? predExact + '★' : '–'}</div><div class="prof-stat-lbl">Scores exacts</div></div>
        </div>
      </div>` : `
      <div style="text-align:center;padding:8px 0;color:var(--text3);font-size:.75rem">
        Aucune prédiction encore — rends-toi dans l'onglet Prédictions !
      </div>`}
      `}
    `;
  } catch(e) {
    console.error('Profile load error:', e);
    body.innerHTML = '<div style="text-align:center;padding:30px;color:#ef4444">Erreur de chargement</div>';
  }
};

window.saveProfile = async function(playerId) {
  const rlVal   = document.getElementById('pf-rl')?.value.trim();
  const country = document.getElementById('pf-country')?.value.trim().toUpperCase();
  const dob     = document.getElementById('pf-dob')?.value;
  try {
    const updates = {};
    if (rlVal)   updates.pseudoRL    = rlVal;
    if (country) updates.country     = country;
    if (dob)     updates.dateOfBirth = dob;
    await updateDoc(doc(db, 'rl_players', playerId), updates);
    // Met à jour le cache local
    if (state.playersMap[playerId]) Object.assign(state.playersMap[playerId], updates);
    toast('Profil enregistré', 'ok');
    closeModal('mo-profile');
  } catch(e) { toast('Erreur lors de la sauvegarde', 'err'); console.error(e); }
};

window.saveTrackerUrl = async function(playerId) {
  const url = document.getElementById('pf-tracker')?.value.trim();
  if (!url) { toast('URL vide', 'err'); return; }
  try {
    new URL(url); // validation basique
  } catch { toast('URL invalide', 'err'); return; }
  try {
    await updateDoc(doc(db, 'rl_players', playerId), { trackerUrl: url });
    if (state.playersMap[playerId]) state.playersMap[playerId].trackerUrl = url;
    toast('Tracker enregistré', 'ok');
    window.openProfile(); // rafraîchit la modal
  } catch(e) { toast('Erreur lors de la sauvegarde', 'err'); console.error(e); }
};

window.requestTrackerChange = function() {
  toast('Contacte un admin sur Discord pour modifier ton tracker', 'ok');
};

function _toggleUserMenu() {
  let menu = document.getElementById('usr-menu');
  if (menu) { _closeUserMenu(); return; }
  const btn = document.getElementById('btn-auth');
  const name = state.curUser?.displayName || '?';
  const photo = state.curUser?.photoURL;
  menu = document.createElement('div');
  menu.id = 'usr-menu';
  menu.className = 'usr-menu';
  menu.innerHTML = `
    <div class="usr-menu-item" style="pointer-events:none;opacity:.6;font-size:.72rem">
      ${photo ? `<img class="btn-disc-av" src="${photo}" alt="">` : ''}
      ${name}
    </div>
    <hr class="usr-menu-sep">
    <div class="usr-menu-item" onclick="openProfile()">👤 Mon profil</div>
    <hr class="usr-menu-sep">
    <div class="usr-menu-item danger" onclick="doSignOut()">↩ Se déconnecter</div>
  `;
  btn.parentNode.appendChild(menu);
  setTimeout(() => document.addEventListener('click', _menuOutsideClick), 0);
}

function _closeUserMenu() {
  const menu = document.getElementById('usr-menu');
  if (menu) menu.remove();
  document.removeEventListener('click', _menuOutsideClick);
}

function _menuOutsideClick(e) {
  const menu = document.getElementById('usr-menu');
  const btn = document.getElementById('btn-auth');
  if (menu && !menu.contains(e.target) && !btn.contains(e.target)) _closeUserMenu();
}

window.doAdminAuth = async function() {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch(e) { if(e.code!=='auth/popup-closed-by-user') toast(e.message,'err'); }
};
