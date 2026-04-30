// modules/site-config.js — Configuration du site (chargement, affichage, sauvegarde)

import { db } from '../../shared/firebase-config.js';
import { state } from './state.js';
import { t } from '../../shared/i18n.js';
import { showToast } from './utils.js';
import { getDoc, setDoc, doc } from 'firebase/firestore';
import { displayHome } from './display-home.js';

const cupId = new URLSearchParams(window.location.search).get('cup') || 'monthly';
const cupLabel = cupId === 'mania' ? 'LAN' : t('msg.online');
const cupName  = cupId === 'mania' ? 'Springs Mania Cup' : 'Springs Monthly Cup';

// Template par défaut du format d'édition — utilisé tant que l'admin
// n'a pas écrit le sien dans le panel Configuration. Markdown supporté.
const DEFAULT_EDITION_FORMAT = `## :gear: Phases

- :one: **Qualifications** : 6 maps sélectionnées sur **TMX** ou **COTD**, 3 styles différents (2 maps par style), 5 rounds par map.
- :two: **Finale KO** : 1 map créée pour l'événement, combinant les 3 styles des qualifications.

## :zap: Format Fast Learn

- Les maps ne sont **jamais révélées à l'avance**.
- Tout le monde découvre en même temps, **2 minutes de warmup** par map.
- À la fin de chaque map de qualif, le **top 3** se qualifie pour la finale ou gagne une **vie supplémentaire** dans le KO si déjà qualifié.
- Les points sont **remis à zéro** au début de chaque nouvelle map.

## :warning: Pénalité

Chaque qualification ou vie obtenue déclenche une **pénalité cumulée de 15%** sur les maps suivantes. Performe au bon moment et **survis** !`;

export const CONFIG_DEFAULTS = {
    siteName: cupName,
    siteSubtitle: `Springs E-Sport · ${cupLabel}`,
    twitchChannel: 'springsesport',
    youtubeUrl: 'https://www.youtube.com/@Springsesport/videos',
    instagramUrl: 'https://www.instagram.com/springsesport/',
    twitterUrl: 'https://x.com/SpringsEsportRL',
    tiktokUrl: 'https://www.tiktok.com/@springsesport',
    twitchUrl: 'https://www.twitch.tv/springsesport',
    discordInviteUrl: 'https://discord.gg/ZXHRRd95C3',
    copyrightText: '© 2026 Springs E-Sport',
    editionFormat: DEFAULT_EDITION_FORMAT,
};
state.siteConfig = { ...CONFIG_DEFAULTS };

export async function loadSiteConfig() {
    try {
        const snap = await getDoc(doc(db, 'siteContent', `config_${cupId}`));
        if (snap.exists()) state.siteConfig = { ...CONFIG_DEFAULTS, ...snap.data() };
    } catch { /* keep defaults */ }
    applySiteConfig();
    displayHome();
}

export function applySiteConfig() {
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
    const fields = { cfgSiteName: c.siteName, cfgSiteSubtitle: c.siteSubtitle, cfgCopyright: c.copyrightText, cfgTwitchChannel: c.twitchChannel, cfgYoutubeUrl: c.youtubeUrl, cfgInstagramUrl: c.instagramUrl, cfgTwitterUrl: c.twitterUrl, cfgTiktokUrl: c.tiktokUrl, cfgTwitchUrl: c.twitchUrl, cfgDiscordInviteUrl: c.discordInviteUrl, cfgEditionFormat: c.editionFormat };
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
    const getRaw = id => document.getElementById(id)?.value || '';
    const cfg = {
        siteName:         get('cfgSiteName')         || CONFIG_DEFAULTS.siteName,
        siteSubtitle:     get('cfgSiteSubtitle')     || CONFIG_DEFAULTS.siteSubtitle,
        copyrightText:    get('cfgCopyright')        || CONFIG_DEFAULTS.copyrightText,
        twitchChannel:    get('cfgTwitchChannel')    || CONFIG_DEFAULTS.twitchChannel,
        youtubeUrl:       get('cfgYoutubeUrl')       || CONFIG_DEFAULTS.youtubeUrl,
        instagramUrl:     get('cfgInstagramUrl')     || CONFIG_DEFAULTS.instagramUrl,
        twitterUrl:       get('cfgTwitterUrl')       || CONFIG_DEFAULTS.twitterUrl,
        tiktokUrl:        get('cfgTiktokUrl')        || CONFIG_DEFAULTS.tiktokUrl,
        twitchUrl:        get('cfgTwitchUrl')        || CONFIG_DEFAULTS.twitchUrl,
        discordInviteUrl: get('cfgDiscordInviteUrl') || CONFIG_DEFAULTS.discordInviteUrl,
        editionFormat:    getRaw('cfgEditionFormat') || CONFIG_DEFAULTS.editionFormat,
    };
    try {
        // merge: true → on n'écrase pas rules / rulesEn (sauvés séparément par display-rules.js)
        await setDoc(doc(db, 'siteContent', `config_${cupId}`), cfg, { merge: true });
        state.siteConfig = { ...state.siteConfig, ...cfg };
        applySiteConfig();
        displayHome();
        const status = document.getElementById('cfgSaveStatus');
        if (status) { status.style.display = ''; setTimeout(() => status.style.display = 'none', 3000); }
    } catch(err) {
        console.error('Save config error:', err);
        showToast(t('msg.save.error'));
    }
};
