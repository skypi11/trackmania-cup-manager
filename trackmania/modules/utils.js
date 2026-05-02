// modules/utils.js — Fonctions utilitaires pures

import { t, getLang } from '../../shared/i18n.js';

export const dateLang = () => getLang() === 'en' ? 'en-GB' : 'fr-FR';
export const tTeam = team => (team && team !== 'Sans équipe') ? team : t('player.no.team');
export const pName = p => p?.pseudoTM || p?.pseudo || p?.name || '?';
export const POINTS_SYSTEM = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export const getPoints = (pos) => pos > 0 ? (POINTS_SYSTEM[pos - 1] ?? 1) : 0;

// Normalise un login Trackmania saisi par l'utilisateur.
// Beaucoup de joueurs collent par erreur leur "Account ID" (UUID) au lieu de
// leur "Login" (base64url) depuis trackmania.io. Les deux encodent les mêmes
// 16 bytes — on convertit automatiquement le format UUID vers le format login.
export function normalizeLoginTM(input) {
    const trimmed = String(input || '').trim();
    const m = trimmed.match(/^([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})$/i);
    if (!m) return trimmed;
    const hex = (m[1] + m[2] + m[3] + m[4] + m[5]).toLowerCase();
    let binary = '';
    for (let i = 0; i < 32; i += 2) binary += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function getCountdown(dateStr, timeStr) {
    const now = new Date();
    const target = new Date(dateStr + (timeStr ? 'T' + timeStr : 'T00:00'));
    const diff = target - now;
    if (diff <= 0) return null;
    // Jours calendaires (10 avril → 12 avril = 2 jours, peu importe l'heure)
    const todayMidnight  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetMidnight = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const days = Math.round((targetMidnight - todayMidnight) / 86400000);
    if (days > 0) return t('countdown.days', {n: days});
    const hours = Math.floor(diff / 3600000);
    const mins  = Math.floor((diff % 3600000) / 60000);
    if (hours > 0) return t('countdown.hours', {n: hours, m: mins > 0 ? ` ${mins}min` : ''});
    return t('countdown.minutes', {n: mins});
}

// Mapping emoji Discord → Unicode
const EMOJI_MAP = {
    checkered_flag:'🏁', flag_checkered:'🏁', date:'📅', calendar:'📅',
    scroll:'📜', one:'1️⃣', two:'2️⃣', three:'3️⃣', four:'4️⃣', five:'5️⃣',
    lock:'🔒', unlock:'🔓', arrow_right:'➡️', warning:'⚠️', skull:'💀',
    pushpin:'📌', speech_balloon:'💬', clapper:'🎬', clapper_board:'🎬',
    trophy:'🏆', medal:'🥇', tada:'🎉', fire:'🔥', star:'⭐', zap:'⚡',
    heart:'❤️', thumbsup:'👍', thumbsdown:'👎', white_check_mark:'✅',
    x:'❌', exclamation:'❗', question:'❓', info:'ℹ️', bulb:'💡',
    loudspeaker:'📢', mega:'📣', bell:'🔔', clock:'🕐', stopwatch:'⏱️',
    hourglass:'⏳', eyes:'👀', muscle:'💪', handshake:'🤝', wave:'👋',
    rocket:'🚀', game_die:'🎲', joystick:'🕹️', video_game:'🎮',
    link:'🔗', globe_with_meridians:'🌐', earth_europe:'🌍',
    green_circle:'🟢', red_circle:'🔴', yellow_circle:'🟡', blue_circle:'🔵',
    white_circle:'⚪', black_circle:'⚫', small_red_triangle:'🔺',
    arrow_up:'⬆️', arrow_down:'⬇️', arrows_counterclockwise:'🔄',
    gear:'⚙️', sparkles:'✨', crown:'👑', dart:'🎯', racing_car:'🏎️',
};

// Convertisseur Markdown (safe — échappe le HTML avant parsing)
export function parseMarkdown(text) {
    if (!text) return '';

    // Emoji Discord :name: → unicode
    let s = text.replace(/:([a-z0-9_]+):/g, (_, name) => EMOJI_MAP[name] || `:${name}:`);

    // Timestamps Discord <t:UNIX:FORMAT> → date lisible
    s = s.replace(/<t:(\d+):[A-Za-z]>/g, (_, ts) => {
        try {
            return new Date(parseInt(ts) * 1000).toLocaleString('fr-FR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        } catch { return ts; }
    });

    // Échapper le HTML (après avoir traité les emojis et timestamps)
    s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Séparateurs ━━━ et ***
    s = s.replace(/^[━\-\*]{3,}$/gm, '<hr style="border:none;border-top:1px solid rgba(255,255,255,0.1);margin:12px 0">');

    // Titres
    s = s.replace(/^### (.+)$/gm, '<h4 style="font-size:0.95rem;font-weight:700;margin:12px 0 4px">$1</h4>');
    s = s.replace(/^## (.+)$/gm,  '<h3 style="font-size:1.05rem;font-weight:700;margin:14px 0 6px">$1</h3>');
    s = s.replace(/^# (.+)$/gm,   '<h2 style="font-size:1.2rem;font-weight:800;margin:16px 0 8px">$1</h2>');

    // Gras + italique
    s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    s = s.replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>');
    s = s.replace(/__(.+?)__/g,          '<strong>$1</strong>');
    s = s.replace(/\*(.+?)\*/g,          '<em>$1</em>');
    s = s.replace(/_(.+?)_/g,            '<em>$1</em>');

    // Liens [texte](url)
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener" style="color:var(--color-accent);text-decoration:underline">$1</a>');

    // Blockquote
    s = s.replace(/^&gt; (.+)$/gm, '<blockquote style="border-left:3px solid var(--color-accent);padding:4px 12px;margin:8px 0;color:var(--color-text-secondary);font-size:0.88rem">$1</blockquote>');

    // Listes
    s = s.replace(/^[\*\-] (.+)$/gm, '<li style="margin:3px 0;padding-left:4px">$1</li>');
    s = s.replace(/(<li[^>]*>.*?<\/li>\n?)+/gs, m => `<ul style="padding-left:20px;margin:8px 0">${m}</ul>`);

    // Sauts de ligne
    s = s.replace(/\n{2,}/g, '</p><p style="margin:8px 0">');
    s = s.replace(/\n/g, '<br>');

    return `<p style="margin:0">${s}</p>`;
}

// Avatar Discord (avec fallback initiale en background — toujours visible si img fail)
export function avatarHtml(player, options = {}) {
    const { size = 40, ringColor = null, className = '' } = options;
    const url = player?.discordAvatar;
    const initial = (pName(player) || '?').charAt(0).toUpperCase();
    const fontSize = Math.max(10, Math.round(size * 0.42));
    const ringStyle = ringColor ? `box-shadow:0 0 0 2px ${ringColor};` : '';
    const wrapStyle = `position:relative;display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;flex-shrink:0;background:linear-gradient(135deg,rgba(0,217,54,0.3),rgba(0,217,54,0.08));color:var(--color-accent);font-weight:900;font-size:${fontSize}px;overflow:hidden;${ringStyle}`;
    const imgTag = url
        ? `<img src="${url}" alt="" loading="lazy" referrerpolicy="no-referrer" style="position:absolute;inset:0;width:100%;height:100%;border-radius:50%;object-fit:cover" onerror="this.style.display='none'">`
        : '';
    return `<span class="tm-avatar ${className}" style="${wrapStyle}">${initial}${imgTag}</span>`;
}

export function showToast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2500);
}

// ── Liste des pays (code ISO + nom) ──────────────────────────────────────────
export const COUNTRIES = [
    ['dz','Algérie'],['de','Allemagne'],['ar','Argentine'],['au','Australie'],
    ['at','Autriche'],['be','Belgique'],['by','Biélorussie'],['br','Brésil'],
    ['bg','Bulgarie'],['ca','Canada'],['cy','Chypre'],['kr','Corée du Sud'],
    ['hr','Croatie'],['dk','Danemark'],['es','Espagne'],['ee','Estonie'],
    ['us','États-Unis'],['fi','Finlande'],['fr','France'],['gr','Grèce'],
    ['hu','Hongrie'],['ie','Irlande'],['is','Islande'],['it','Italie'],
    ['jp','Japon'],['lv','Lettonie'],['li','Liechtenstein'],['lt','Lituanie'],
    ['lu','Luxembourg'],['mk','Macédoine du Nord'],['mt','Malte'],['ma','Maroc'],
    ['md','Moldavie'],['mc','Monaco'],['no','Norvège'],['nz','Nouvelle-Zélande'],
    ['pl','Pologne'],['pt','Portugal'],['cz','République tchèque'],['ro','Roumanie'],
    ['gb','Royaume-Uni'],['ru','Russie'],['sm','Saint-Marin'],['rs','Serbie'],
    ['sk','Slovaquie'],['si','Slovénie'],['se','Suède'],['ch','Suisse'],
    ['tn','Tunisie'],['tr','Turquie'],['ua','Ukraine'],
];

const _CODE_MAP = Object.fromEntries(COUNTRIES.map(([code, name]) => [name, code]));

// Normalise valeurs legacy ("🇫🇷 France" ou "France") → "France"
function _normCountry(s) {
    if (!s) return '';
    if (_CODE_MAP[s]) return s;
    for (const [, name] of COUNTRIES) { if (s.includes(name)) return name; }
    return s;
}

// Drapeau via flag-icons CSS (fiable sur Windows contrairement aux emoji)
const _fi = code => `<span class="fi fi-${code}" style="width:20px;height:14px;border-radius:2px;flex-shrink:0;display:inline-block"></span>`;

export function displayCountry(country) {
    const name = _normCountry(country);
    if (!name) return '—';
    const code = _CODE_MAP[name];
    return code
        ? `<span style="display:inline-flex;align-items:center;gap:7px">${_fi(code)} ${name}</span>`
        : name;
}

// ── Dropdown pays custom avec vrais drapeaux ──────────────────────────────────
export function buildCountryPicker(id, selected = '') {
    const name = _normCountry(selected);
    const code = _CODE_MAP[name] || '';

    const displayHtml = name
        ? `${_fi(code)}<span>${name}</span>`
        : '<span style="color:#555">— Pays —</span>';

    const items = COUNTRIES.map(([c, n]) => {
        const active = n === name;
        return `<div onclick="window._cpSelect('${id}','${n}','${c}')"
            style="padding:8px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;font-size:0.88rem;color:${active ? 'var(--color-accent)' : '#e0e0e0'};background:${active ? 'rgba(0,217,54,0.08)' : 'transparent'}"
            onmouseover="this.style.background='rgba(255,255,255,0.07)'"
            onmouseout="this.style.background='${active ? 'rgba(0,217,54,0.08)' : 'transparent'}'">
            ${_fi(c)}<span>${n}</span>
        </div>`;
    }).join('');

    return `<div class="cp-root" id="${id}_root" style="position:relative">
        <div onclick="window._cpToggle('${id}')" style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border-radius:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.14);cursor:pointer;user-select:none;font-family:inherit;font-size:0.9rem;min-height:40px">
            <span id="${id}_display" style="display:inline-flex;align-items:center;gap:8px;color:#f0f0f0">${displayHtml}</span>
            <svg width="10" height="6" viewBox="0 0 10 6" style="flex-shrink:0"><path d="M1 1l4 4 4-4" stroke="#666" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>
        </div>
        <input type="hidden" id="${id}" value="${name}">
        <div class="cp-dd" id="${id}_dd" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:9999;background:#1c1c1c;border:1px solid rgba(255,255,255,0.14);border-radius:8px;max-height:220px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,0.6)">
            ${items}
        </div>
    </div>`;
}

window._cpToggle = function(id) {
    const dd = document.getElementById(`${id}_dd`);
    if (!dd) return;
    const isOpen = dd.style.display !== 'none';
    document.querySelectorAll('.cp-dd').forEach(d => { d.style.display = 'none'; });
    if (!isOpen) dd.style.display = 'block';
};
window._cpSelect = function(id, name, code) {
    const input   = document.getElementById(id);
    const display = document.getElementById(`${id}_display`);
    const dd      = document.getElementById(`${id}_dd`);
    if (input) input.value = name;
    if (display) display.innerHTML = `<span class="fi fi-${code}" style="width:20px;height:14px;border-radius:2px;flex-shrink:0;display:inline-block"></span><span>${name}</span>`;
    if (dd) dd.style.display = 'none';
};
document.addEventListener('click', e => {
    if (!e.target.closest('.cp-root')) {
        document.querySelectorAll('.cp-dd').forEach(d => { d.style.display = 'none'; });
    }
}, true);
