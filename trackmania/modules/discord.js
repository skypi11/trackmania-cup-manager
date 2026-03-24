// modules/discord.js — Intégration Discord (OAuth, reminders, notifications)

import { db } from '../../shared/firebase-config.js';
import { state } from './state.js';
import { t } from '../../shared/i18n.js';
import { pName, showToast } from './utils.js';
import { updateDoc, doc, getDoc, collection } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js';

const DISCORD_CLIENT_ID = '1483592495215673407';
const DISCORD_REDIRECT_URI = window.location.origin + '/trackmania/cup.html';

// Capture Discord OAuth token from URL hash (before any redirect)
const _hashParams = new URLSearchParams(window.location.hash.slice(1));
if (_hashParams.get('access_token')) {
    state.pendingDiscordToken = _hashParams.get('access_token');
    const _state = _hashParams.get('state') || '';
    history.replaceState(null, '', window.location.pathname + (_state ? '?' + _state : window.location.search));
}

// ── OAuth ─────────────────────────────────────────────────────────────────────

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

export async function handleDiscordCallback(token) {
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

// ── Reminders ─────────────────────────────────────────────────────────────────

export function updateDiscordReminders() {
    if (!state.currentUser || state.isAdmin) {
        document.getElementById('discordLinkBanner').style.display = 'none';
        const dot = document.getElementById('discordBadgeDot');
        if (dot) dot.remove();
        return;
    }
    const player = state.data.participants.find(p => p.userId === state.currentUser.uid);
    if (!player) return;
    const linked = !!player.discordId;

    const banner = document.getElementById('discordLinkBanner');
    banner.style.display = linked ? 'none' : '';

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

export function maybeShowDiscordPrompt() {
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

// ── Notifications admin ───────────────────────────────────────────────────────

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
        if (res.ok) { showToast(t('admin.discord.ok')); window.closeDiscordNotifyModal(); }
        else showToast(t('admin.discord.error'));
    } catch(err) {
        console.error('Discord notify error:', err);
        showToast(t('admin.discord.error'));
    }
};
