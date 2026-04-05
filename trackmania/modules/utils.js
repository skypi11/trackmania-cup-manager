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

// Convertisseur Markdown minimal (safe — échappe le HTML avant parsing)
export function parseMarkdown(text) {
    if (!text) return '';
    // Échapper le HTML
    let s = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Titres
    s = s.replace(/^### (.+)$/gm, '<h4 style="font-size:0.95rem;font-weight:700;margin:12px 0 4px">$1</h4>');
    s = s.replace(/^## (.+)$/gm,  '<h3 style="font-size:1.05rem;font-weight:700;margin:14px 0 6px">$1</h3>');
    s = s.replace(/^# (.+)$/gm,   '<h2 style="font-size:1.2rem;font-weight:800;margin:16px 0 8px">$1</h2>');

    // Séparateur
    s = s.replace(/^\*{3,}$/gm, '<hr style="border:none;border-top:1px solid rgba(255,255,255,0.1);margin:12px 0">');

    // Gras + italique
    s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    s = s.replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>');
    s = s.replace(/__(.+?)__/g,          '<strong>$1</strong>');
    s = s.replace(/\*(.+?)\*/g,          '<em>$1</em>');
    s = s.replace(/_(.+?)_/g,            '<em>$1</em>');

    // Blockquote
    s = s.replace(/^&gt; (.+)$/gm, '<blockquote style="border-left:3px solid var(--color-accent);padding:4px 12px;margin:8px 0;color:var(--color-text-secondary);font-size:0.88rem">$1</blockquote>');

    // Listes
    s = s.replace(/^[\*\-] (.+)$/gm, '<li style="margin:3px 0;padding-left:4px">$1</li>');
    s = s.replace(/(<li[^>]*>.*<\/li>\n?)+/gs, m => `<ul style="padding-left:20px;margin:8px 0">${m}</ul>`);

    // Sauts de ligne → <br> (hors balises block)
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
