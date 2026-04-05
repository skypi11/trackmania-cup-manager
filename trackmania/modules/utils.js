// modules/utils.js — Fonctions utilitaires pures

import { t, getLang } from '../../shared/i18n.js';

export const dateLang = () => getLang() === 'en' ? 'en-GB' : 'fr-FR';
export const tTeam = team => (team && team !== 'Sans équipe') ? team : t('player.no.team');
export const pName = p => p?.pseudoTM || p?.pseudo || p?.name || '?';
export const POINTS_SYSTEM = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export const getPoints = (pos) => pos > 0 ? (POINTS_SYSTEM[pos - 1] ?? 1) : 0;

export function getCountdown(dateStr, timeStr) {
    const now = new Date();
    const target = new Date(dateStr + (timeStr ? 'T' + timeStr : 'T00:00'));
    const diff = target - now;
    if (diff <= 0) return null;
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (days > 0) return t('countdown.days', {n: days});
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

export function showToast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2500);
}

// ── Liste des pays ────────────────────────────────────────────────────────────
export const COUNTRIES = [
    ['🇩🇿','Algérie'],['🇩🇪','Allemagne'],['🇦🇷','Argentine'],['🇦🇺','Australie'],
    ['🇦🇹','Autriche'],['🇧🇪','Belgique'],['🇧🇾','Biélorussie'],['🇧🇷','Brésil'],
    ['🇧🇬','Bulgarie'],['🇨🇦','Canada'],['🇨🇾','Chypre'],['🇰🇷','Corée du Sud'],
    ['🇭🇷','Croatie'],['🇩🇰','Danemark'],['🇪🇸','Espagne'],['🇪🇪','Estonie'],
    ['🇺🇸','États-Unis'],['🇫🇮','Finlande'],['🇫🇷','France'],['🇬🇷','Grèce'],
    ['🇭🇺','Hongrie'],['🇮🇪','Irlande'],['🇮🇸','Islande'],['🇮🇹','Italie'],
    ['🇯🇵','Japon'],['🇱🇻','Lettonie'],['🇱🇮','Liechtenstein'],['🇱🇹','Lituanie'],
    ['🇱🇺','Luxembourg'],['🇲🇰','Macédoine du Nord'],['🇲🇹','Malte'],['🇲🇦','Maroc'],
    ['🇲🇩','Moldavie'],['🇲🇨','Monaco'],['🇳🇴','Norvège'],['🇳🇿','Nouvelle-Zélande'],
    ['🇵🇱','Pologne'],['🇵🇹','Portugal'],['🇨🇿','République tchèque'],['🇷🇴','Roumanie'],
    ['🇬🇧','Royaume-Uni'],['🇷🇺','Russie'],['🇸🇲','Saint-Marin'],['🇷🇸','Serbie'],
    ['🇸🇰','Slovaquie'],['🇸🇮','Slovénie'],['🇸🇪','Suède'],['🇨🇭','Suisse'],
    ['🇹🇳','Tunisie'],['🇹🇷','Turquie'],['🇺🇦','Ukraine'],
];

// Map nom → flag pour retrouver le drapeau depuis une valeur legacy (ex: "France" → "🇫🇷")
const _COUNTRY_FLAG_MAP = Object.fromEntries(COUNTRIES.map(([f, n]) => [n, f]));

// La valeur stockée ET affichée est "🇫🇷 France" (flag + espace + nom)
export function countryOptions(selected = '') {
    // Normalise une valeur legacy (juste le nom) vers le format complet
    const normalized = _COUNTRY_FLAG_MAP[selected] ? `${_COUNTRY_FLAG_MAP[selected]} ${selected}` : selected;
    return `<option value="">— Pays —</option>` +
        COUNTRIES.map(([flag, name]) => {
            const val = `${flag} ${name}`;
            return `<option value="${val}"${val === normalized ? ' selected' : ''}>${val}</option>`;
        }).join('');
}

export function populateCountrySelect(id, selected = '') {
    const el = document.getElementById(id);
    if (el) el.innerHTML = countryOptions(selected);
}

// Affiche le pays avec son drapeau (gère ancien format "France" et nouveau "🇫🇷 France")
export function displayCountry(country) {
    if (!country) return '—';
    if (_COUNTRY_FLAG_MAP[country]) return `${_COUNTRY_FLAG_MAP[country]} ${country}`;
    return country;
}

// ── Dropdown pays custom (drapeaux visibles sur Windows) ──────────────────────
export function buildCountryPicker(id, selected = '') {
    const norm = _COUNTRY_FLAG_MAP[selected] ? `${_COUNTRY_FLAG_MAP[selected]} ${selected}` : selected;
    const items = COUNTRIES.map(([flag, name]) => {
        const val = `${flag} ${name}`;
        const active = val === norm;
        return `<div class="cp-item" onclick="window._cpSelect('${id}','${val}')"
            style="padding:8px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;font-size:0.88rem;color:${active ? 'var(--color-accent)' : '#e0e0e0'};background:${active ? 'rgba(0,217,54,0.08)' : 'transparent'}"
            onmouseover="this.style.background='rgba(255,255,255,0.07)'"
            onmouseout="this.style.background='${active ? 'rgba(0,217,54,0.08)' : 'transparent'}'">
            <span style="font-size:1.25rem;line-height:1;flex-shrink:0">${flag}</span>
            <span>${name}</span>
        </div>`;
    }).join('');
    return `<div class="cp-root" id="${id}_root" style="position:relative">
        <div onclick="window._cpToggle('${id}')" style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border-radius:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.14);cursor:pointer;user-select:none;font-family:inherit;font-size:0.9rem;min-height:40px">
            <span id="${id}_display" style="color:${norm ? '#f0f0f0' : '#555'}">${norm || '— Pays —'}</span>
            <svg width="10" height="6" viewBox="0 0 10 6" style="flex-shrink:0"><path d="M1 1l4 4 4-4" stroke="#666" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>
        </div>
        <input type="hidden" id="${id}" value="${norm}">
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
window._cpSelect = function(id, val) {
    const input = document.getElementById(id);
    const display = document.getElementById(`${id}_display`);
    const dd = document.getElementById(`${id}_dd`);
    if (input) input.value = val;
    if (display) { display.textContent = val; display.style.color = '#f0f0f0'; }
    if (dd) dd.style.display = 'none';
};
document.addEventListener('click', e => {
    if (!e.target.closest('.cp-root')) {
        document.querySelectorAll('.cp-dd').forEach(d => { d.style.display = 'none'; });
    }
}, true);
