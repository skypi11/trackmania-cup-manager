// modules/discord.js — Intégration Discord (OAuth, reminders, notifications)

import { db } from '../../shared/firebase-config.js';
import { state } from './state.js';
import { t } from '../../shared/i18n.js';
import { pName, showToast } from './utils.js';
import { updateDoc, setDoc, doc, getDoc, collection } from 'firebase/firestore';

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

// ── Configuration Discord (salons / webhooks) ─────────────────────────────────

let _discordChannels = [];
let _inscriptionTemplate = '';

const DEFAULT_INSCRIPTION_TEMPLATE = '🎮 {mention} just registered for **{edition}** ({date}) — {count} player(s) registered';

export async function renderDiscordConfig() {
    const container = document.getElementById('discordConfigCard');
    if (!container) return;

    const snap = await getDoc(doc(db, 'siteContent', 'discord'));
    const data = snap.exists() ? snap.data() : {};
    let channels = Array.isArray(data.channels) ? data.channels : [];
    if (channels.length === 0 && data.webhookUrl) {
        channels = [{ name: 'Canal principal', url: data.webhookUrl }];
    }
    _discordChannels = channels;
    _inscriptionTemplate = data.inscriptionTemplate || '';

    const inputStyle = `padding:7px 10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-size:0.85rem;outline:none`;
    const rowsHtml = channels.length > 0 ? channels.map((ch, i) => `
        <div class="discord-channel-row" style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
            <input type="text" value="${ch.name || ''}" placeholder="Nom" id="dch-name-${i}" style="width:150px;${inputStyle}">
            <input type="url" value="${ch.url || ''}" placeholder="https://discord.com/api/webhooks/…" id="dch-url-${i}" style="flex:1;${inputStyle}">
            <button class="btn btn-secondary btn-small" style="color:var(--color-danger);border-color:rgba(239,68,68,0.4);padding:5px 10px" onclick="removeDiscordChannelRow(this)">✕</button>
        </div>`).join('') : `<p style="color:var(--color-text-secondary);font-size:0.85rem;margin-bottom:8px">Aucun salon configuré.</p>`;

    const sendBtn = channels.length > 0
        ? `<button class="btn-discord-notify" onclick="openDiscordNotifyModal(null)"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg> 📢 Envoyer un message</button>`
        : `<p style="font-size:0.85rem;color:var(--color-text-secondary)">Configure au moins un webhook pour envoyer des messages.</p>`;

    const textareaStyle = `padding:7px 10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-size:0.85rem;outline:none;width:100%;box-sizing:border-box`;
    const currentTemplate = _inscriptionTemplate || DEFAULT_INSCRIPTION_TEMPLATE;

    container.innerHTML = `<div class="card" style="margin-top:20px">
        <h2>🔔 Discord</h2>
        <p style="font-size:0.82rem;text-transform:uppercase;letter-spacing:1px;color:var(--color-text-secondary);margin:0 0 12px;font-weight:700">Webhooks (salons)</p>
        <p style="font-size:0.82rem;color:var(--color-text-secondary);margin-bottom:14px">Un webhook par salon Discord. Récupère l'URL depuis Paramètres du salon → Intégrations → Webhooks.</p>
        <div id="discordChannelRows">${rowsHtml}</div>
        <div style="display:flex;gap:8px;margin-top:4px">
            <button class="btn btn-secondary" onclick="addDiscordChannelRow()">+ Ajouter un salon</button>
            <button class="btn btn-primary" onclick="saveDiscordChannels()">💾 Enregistrer</button>
        </div>
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.08)">
            <p style="font-size:0.82rem;text-transform:uppercase;letter-spacing:1px;color:var(--color-text-secondary);margin:0 0 10px;font-weight:700">Message d'inscription automatique</p>
            <p style="font-size:0.82rem;color:var(--color-text-secondary);margin-bottom:10px">Envoyé automatiquement quand un joueur s'inscrit à une édition. Variables disponibles : <code style="background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:4px;font-size:0.8rem">{mention}</code> <code style="background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:4px;font-size:0.8rem">{player}</code> <code style="background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:4px;font-size:0.8rem">{edition}</code> <code style="background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:4px;font-size:0.8rem">{date}</code> <code style="background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:4px;font-size:0.8rem">{count}</code></p>
            <textarea id="discordInscriptionTemplate" rows="2" style="${textareaStyle};resize:vertical;font-family:monospace">${currentTemplate}</textarea>
            <div style="display:flex;gap:8px;margin-top:8px;align-items:center">
                <button class="btn btn-primary" onclick="saveDiscordChannels()" style="font-size:0.82rem;padding:6px 14px">💾 Enregistrer</button>
                <button class="btn btn-secondary" onclick="document.getElementById('discordInscriptionTemplate').value=${JSON.stringify(DEFAULT_INSCRIPTION_TEMPLATE)}" style="font-size:0.82rem;padding:6px 14px">↺ Défaut</button>
            </div>
        </div>
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.08)">
            <p style="font-size:0.82rem;text-transform:uppercase;letter-spacing:1px;color:var(--color-text-secondary);margin:0 0 12px;font-weight:700">Envoyer un message</p>
            ${sendBtn}
        </div>
    </div>`;
}

window.addDiscordChannelRow = () => {
    const rows = document.getElementById('discordChannelRows');
    if (!rows) return;
    const i = rows.querySelectorAll('.discord-channel-row').length;
    const inputStyle = `padding:7px 10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-size:0.85rem;outline:none`;
    const div = document.createElement('div');
    div.className = 'discord-channel-row';
    div.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;align-items:center';
    div.innerHTML = `
        <input type="text" placeholder="Nom" id="dch-name-${i}" style="width:150px;${inputStyle}">
        <input type="url" placeholder="https://discord.com/api/webhooks/…" id="dch-url-${i}" style="flex:1;${inputStyle}">
        <button class="btn btn-secondary btn-small" style="color:var(--color-danger);border-color:rgba(239,68,68,0.4);padding:5px 10px" onclick="removeDiscordChannelRow(this)">✕</button>`;
    // Remove "Aucun salon" placeholder if present
    const placeholder = rows.querySelector('p');
    if (placeholder) placeholder.remove();
    rows.appendChild(div);
};

window.removeDiscordChannelRow = (btn) => {
    btn.closest('.discord-channel-row').remove();
};

window.saveDiscordChannels = async () => {
    const rows = document.querySelectorAll('#discordChannelRows .discord-channel-row');
    const channels = [...rows].map(row => ({
        name: row.querySelector('input[type="text"]')?.value.trim() || '',
        url:  row.querySelector('input[type="url"]')?.value.trim()  || ''
    })).filter(ch => ch.url);
    const inscriptionTemplate = document.getElementById('discordInscriptionTemplate')?.value.trim() || '';
    await setDoc(doc(db, 'siteContent', 'discord'), { channels, inscriptionTemplate }, { merge: true });
    _discordChannels = channels;
    _inscriptionTemplate = inscriptionTemplate;
    showToast('✅ Configuration Discord enregistrée');
    renderDiscordConfig();
};

// ── Notification auto inscription ────────────────────────────────────────────

export async function notifyDiscordInscription(player, edition, totalInscribed) {
    let webhookUrl = _discordChannels[0]?.url || '';
    let template   = _inscriptionTemplate;
    if (!webhookUrl || !template) {
        try {
            const snap = await getDoc(doc(db, 'siteContent', 'discord'));
            const data = snap.exists() ? snap.data() : {};
            if (!webhookUrl) {
                webhookUrl = data.channels?.[0]?.url || data.webhookUrl || '';
                if (Array.isArray(data.channels) && data.channels.length > 0) _discordChannels = data.channels;
            }
            if (!template) {
                template = data.inscriptionTemplate || '';
                _inscriptionTemplate = template;
            }
        } catch(e) { return; }
    }
    if (!webhookUrl) return;
    const dateStr  = edition.date
        ? new Date(edition.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
        : '';
    const mention  = player.discordId ? `<@${player.discordId}>` : `**${pName(player)}**`;
    const content = (template || DEFAULT_INSCRIPTION_TEMPLATE)
        .replace('{player}',  pName(player))
        .replace('{mention}', mention)
        .replace('{edition}', edition.name)
        .replace('{date}',    dateStr)
        .replace('{count}',   String(totalInscribed));
    fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, username: 'Springs Monthly Cup' })
    }).catch(() => {});
}

// ── Notifications admin ───────────────────────────────────────────────────────

function buildMentions(editionId) {
    const inscriptions = state.data.results.filter(r => r.editionId === editionId && r.phase === 'inscription');
    return inscriptions
        .map(r => state.data.participants.find(p => p.id === r.playerId))
        .filter(p => p?.discordId)
        .map(p => `<@${p.discordId}>`);
}

function buildTemplate(type, editionId) {
    const e = state.data.editions.find(ed => ed.id === editionId);
    if (!e) return '';
    const mentions = buildMentions(editionId);
    const mentionsStr = mentions.length > 0 ? mentions.join(' ') + '\n\n' : '';
    const timeStr = e.time ? ` à **${e.time}**` : '';
    const dateStr = e.date ? new Date(e.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

    if (type === 'rappel') {
        return `${mentionsStr}🏎️ **${e.name}** commence bientôt${timeStr} !\nPréparez-vous, on vous attend en jeu ! 🎮`;
    }
    if (type === 'annonce') {
        return `📅 Nouvelle édition annoncée !\n\n🏎️ **${e.name}**\n📆 ${dateStr}${timeStr}\n\nInscriptions ouvertes sur le site ! 🔗`;
    }
    if (type === 'resultats') {
        const finaleResults = state.data.results
            .filter(r => r.editionId === editionId && r.phase === 'finale')
            .sort((a, b) => a.position - b.position);
        const medals = ['🥇', '🥈', '🥉'];
        const podium = [1, 2, 3].map(pos => {
            const r = finaleResults.find(r => r.position === pos);
            const p = r ? state.data.participants.find(p => p.id === r.playerId) : null;
            return `${medals[pos - 1]} **${p ? pName(p) : '—'}**`;
        }).join('\n');
        return `🏆 Résultats de **${e.name}** !\n\n${podium}\n\nGG à tous les participants ! 👏`;
    }
    return '';
}

window.openDiscordNotifyModal = (editionId) => {
    const hasEdition = !!editionId && !!state.data.editions.find(ed => ed.id === editionId);

    // Sélecteur de salon
    const selectorWrap = document.getElementById('discordChannelSelectorWrap');
    const channelSelect = document.getElementById('discordNotifyChannel');
    if (channelSelect && _discordChannels.length > 0) {
        channelSelect.innerHTML = _discordChannels
            .map((ch, i) => `<option value="${i}">${ch.name || `Salon ${i + 1}`}</option>`)
            .join('');
        if (selectorWrap) selectorWrap.style.display = _discordChannels.length > 1 ? '' : 'none';
    } else if (selectorWrap) {
        selectorWrap.style.display = 'none';
    }

    // Templates édition-spécifiques (masqués si pas d'édition)
    const editionBtns = ['discordTplRappel', 'discordTplAnnonce', 'discordTplResultats'];
    editionBtns.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.style.display = hasEdition ? '' : 'none';
    });

    document.getElementById('discordNotifyEditionId').value = editionId || '';
    document.getElementById('discordNotifyMessage').value = hasEdition ? buildTemplate('rappel', editionId) : '';

    let hint = '';
    if (hasEdition) {
        const mentions = buildMentions(editionId);
        hint = mentions.length > 0
            ? `${mentions.length} joueur(s) mentionné(s) via Discord`
            : "Aucun joueur n'a lié son Discord — pas de @mention";
    }
    document.getElementById('discordNotifyHint').textContent = hint;
    document.getElementById('discordNotifyModal').classList.add('open');
};

window.applyDiscordTemplate = (type) => {
    const editionId = document.getElementById('discordNotifyEditionId').value;
    document.getElementById('discordNotifyMessage').value = type === 'libre' ? '' : buildTemplate(type, editionId);
    document.getElementById('discordNotifyMessage').focus();
};

window.closeDiscordNotifyModal = () => {
    document.getElementById('discordNotifyModal').classList.remove('open');
};

window.sendDiscordNotification = async () => {
    const content = document.getElementById('discordNotifyMessage').value.trim();
    if (!content) return;

    // Déterminer le webhook à utiliser
    let webhookUrl = '';
    if (_discordChannels.length > 0) {
        const selectedIdx = parseInt(document.getElementById('discordNotifyChannel')?.value || '0', 10);
        webhookUrl = _discordChannels[selectedIdx]?.url || _discordChannels[0]?.url || '';
    }
    // Fallback vers l'ancien champ si channels pas encore chargés
    if (!webhookUrl) {
        const snap = await getDoc(doc(db, 'siteContent', 'discord'));
        const data = snap.exists() ? snap.data() : {};
        webhookUrl = data.channels?.[0]?.url || data.webhookUrl || '';
    }
    if (!webhookUrl) { showToast(t('admin.discord.nowebhook')); return; }

    try {
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
