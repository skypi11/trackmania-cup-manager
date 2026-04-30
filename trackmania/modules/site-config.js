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

// Format d'édition structuré — défaut utilisé si l'admin n'a pas configuré
// le sien dans le panel Configuration. Champs explicites au lieu de markdown.
export const DEFAULT_EDITION_FORMAT = {
    qualifs: {
        mapsCount: 6,
        qualifPerMap: 3,
        roundsPerMap: 5,
        stylesCount: 3,
        mapsPerStyle: 2,
        sources: ['TMX', 'COTD'],
    },
    finale: {
        mapsCount: 1,
        description: 'Map créée pour l\'événement, combinant tous les styles des qualifications',
    },
    format: {
        type: 'Fast Learn',          // 'Fast Learn' | 'Standard' | 'Custom'
        warmupMinutes: 2,
        hiddenMaps: true,            // maps non révélées à l'avance
    },
    qualification: {
        topN: 3,
        extraLifeIfQualified: true,
        pointsResetPerMap: true,
    },
    penalty: {
        enabled: true,
        type: 'cumulative_pct',      // 'cumulative_pct' | 'fixed_pct'
        value: 15,
        appliesTo: 'qualif_and_lives', // 'qualifs' | 'lives' | 'qualif_and_lives'
    },
    notes: '',                       // markdown freeform additionnel
};

// Migration ancien format (string markdown) → nouveau (object structuré)
// L'ancien texte devient les "notes additionnelles".
function migrateEditionFormat(raw) {
    if (!raw) return { ...DEFAULT_EDITION_FORMAT };
    if (typeof raw === 'string') {
        return { ...DEFAULT_EDITION_FORMAT, notes: raw };
    }
    if (typeof raw === 'object') {
        return {
            ...DEFAULT_EDITION_FORMAT,
            ...raw,
            qualifs:      { ...DEFAULT_EDITION_FORMAT.qualifs,      ...(raw.qualifs      || {}) },
            finale:       { ...DEFAULT_EDITION_FORMAT.finale,       ...(raw.finale       || {}) },
            format:       { ...DEFAULT_EDITION_FORMAT.format,       ...(raw.format       || {}) },
            qualification:{ ...DEFAULT_EDITION_FORMAT.qualification,...(raw.qualification|| {}) },
            penalty:      { ...DEFAULT_EDITION_FORMAT.penalty,      ...(raw.penalty      || {}) },
        };
    }
    return { ...DEFAULT_EDITION_FORMAT };
}

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
        if (snap.exists()) {
            const raw = snap.data();
            // Migration éventuelle de l'ancien editionFormat (string markdown) → object structuré
            state.siteConfig = {
                ...CONFIG_DEFAULTS,
                ...raw,
                editionFormat: migrateEditionFormat(raw.editionFormat),
            };
        }
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
    const fields = { cfgSiteName: c.siteName, cfgSiteSubtitle: c.siteSubtitle, cfgCopyright: c.copyrightText, cfgTwitchChannel: c.twitchChannel, cfgYoutubeUrl: c.youtubeUrl, cfgInstagramUrl: c.instagramUrl, cfgTwitterUrl: c.twitterUrl, cfgTiktokUrl: c.tiktokUrl, cfgTwitchUrl: c.twitchUrl, cfgDiscordInviteUrl: c.discordInviteUrl };
    Object.entries(fields).forEach(([id, val]) => { const el = document.getElementById(id); if (el) el.value = val || ''; });
    // Populate edition format structured fields
    populateFormatForm(c.editionFormat || DEFAULT_EDITION_FORMAT);
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

// ── Helpers : populate / read structured edition format form ────────────
function populateFormatForm(fmt) {
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
    const setChk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
    // Qualifs
    setVal('cfgFmt_qualifs_mapsCount',   fmt.qualifs?.mapsCount);
    setVal('cfgFmt_qualifs_qualifPerMap', fmt.qualifs?.qualifPerMap);
    setVal('cfgFmt_qualifs_roundsPerMap', fmt.qualifs?.roundsPerMap);
    setVal('cfgFmt_qualifs_stylesCount',  fmt.qualifs?.stylesCount);
    setVal('cfgFmt_qualifs_mapsPerStyle', fmt.qualifs?.mapsPerStyle);
    const sources = Array.isArray(fmt.qualifs?.sources) ? fmt.qualifs.sources : [];
    setChk('cfgFmt_qualifs_sourceTMX',  sources.includes('TMX'));
    setChk('cfgFmt_qualifs_sourceCOTD', sources.includes('COTD'));
    const customSources = sources.filter(s => s !== 'TMX' && s !== 'COTD').join(', ');
    setVal('cfgFmt_qualifs_sourceCustom', customSources);
    // Finale
    setVal('cfgFmt_finale_mapsCount',   fmt.finale?.mapsCount);
    setVal('cfgFmt_finale_description', fmt.finale?.description);
    // Format
    setVal('cfgFmt_format_type',          fmt.format?.type);
    setVal('cfgFmt_format_warmupMinutes', fmt.format?.warmupMinutes);
    setChk('cfgFmt_format_hiddenMaps',    fmt.format?.hiddenMaps);
    // Qualification
    setVal('cfgFmt_qualification_topN',                 fmt.qualification?.topN);
    setChk('cfgFmt_qualification_extraLifeIfQualified', fmt.qualification?.extraLifeIfQualified);
    setChk('cfgFmt_qualification_pointsResetPerMap',    fmt.qualification?.pointsResetPerMap);
    // Penalty
    setChk('cfgFmt_penalty_enabled',   fmt.penalty?.enabled);
    setVal('cfgFmt_penalty_type',      fmt.penalty?.type);
    setVal('cfgFmt_penalty_value',     fmt.penalty?.value);
    setVal('cfgFmt_penalty_appliesTo', fmt.penalty?.appliesTo);
    // Notes (markdown)
    setVal('cfgFmt_notes', fmt.notes);
}

function readFormatForm() {
    const num = id => {
        const v = parseInt(document.getElementById(id)?.value, 10);
        return Number.isFinite(v) ? v : null;
    };
    const str = id => (document.getElementById(id)?.value || '').trim();
    const raw = id => document.getElementById(id)?.value || '';
    const chk = id => !!document.getElementById(id)?.checked;
    const sources = [];
    if (chk('cfgFmt_qualifs_sourceTMX'))  sources.push('TMX');
    if (chk('cfgFmt_qualifs_sourceCOTD')) sources.push('COTD');
    const customSrc = str('cfgFmt_qualifs_sourceCustom');
    if (customSrc) customSrc.split(',').map(s => s.trim()).filter(Boolean).forEach(s => sources.push(s));
    return {
        qualifs: {
            mapsCount:    num('cfgFmt_qualifs_mapsCount')    ?? DEFAULT_EDITION_FORMAT.qualifs.mapsCount,
            qualifPerMap: num('cfgFmt_qualifs_qualifPerMap') ?? DEFAULT_EDITION_FORMAT.qualifs.qualifPerMap,
            roundsPerMap: num('cfgFmt_qualifs_roundsPerMap') ?? DEFAULT_EDITION_FORMAT.qualifs.roundsPerMap,
            stylesCount:  num('cfgFmt_qualifs_stylesCount')  ?? DEFAULT_EDITION_FORMAT.qualifs.stylesCount,
            mapsPerStyle: num('cfgFmt_qualifs_mapsPerStyle') ?? DEFAULT_EDITION_FORMAT.qualifs.mapsPerStyle,
            sources,
        },
        finale: {
            mapsCount:   num('cfgFmt_finale_mapsCount') ?? DEFAULT_EDITION_FORMAT.finale.mapsCount,
            description: str('cfgFmt_finale_description') || DEFAULT_EDITION_FORMAT.finale.description,
        },
        format: {
            type:          str('cfgFmt_format_type')          || DEFAULT_EDITION_FORMAT.format.type,
            warmupMinutes: num('cfgFmt_format_warmupMinutes') ?? DEFAULT_EDITION_FORMAT.format.warmupMinutes,
            hiddenMaps:    chk('cfgFmt_format_hiddenMaps'),
        },
        qualification: {
            topN:                 num('cfgFmt_qualification_topN') ?? DEFAULT_EDITION_FORMAT.qualification.topN,
            extraLifeIfQualified: chk('cfgFmt_qualification_extraLifeIfQualified'),
            pointsResetPerMap:    chk('cfgFmt_qualification_pointsResetPerMap'),
        },
        penalty: {
            enabled:   chk('cfgFmt_penalty_enabled'),
            type:      str('cfgFmt_penalty_type')      || DEFAULT_EDITION_FORMAT.penalty.type,
            value:     num('cfgFmt_penalty_value')     ?? DEFAULT_EDITION_FORMAT.penalty.value,
            appliesTo: str('cfgFmt_penalty_appliesTo') || DEFAULT_EDITION_FORMAT.penalty.appliesTo,
        },
        notes: raw('cfgFmt_notes'),
    };
}

window.saveSiteConfig = async (e) => {
    e.preventDefault();
    const get = id => document.getElementById(id)?.value.trim() || '';
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
        editionFormat:    readFormatForm(),
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
