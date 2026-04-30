// modules/display-rules.js — Page règlement (affichage + édition admin)

import { db, POINTS } from '../../shared/firebase-config.js';
import { state } from './state.js';
import { t, getLang } from '../../shared/i18n.js';
import { showToast } from './utils.js';
import { updateDoc, doc } from 'firebase/firestore';

const cupId = new URLSearchParams(window.location.search).get('cup') || 'monthly';

function esc(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function inlineMd(str) {
    return str.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}
function renderMarkdown(text) {
    return text.split('\n').map(line => {
        if (line.startsWith('# '))  return `<h2 style="color:var(--color-accent);margin:20px 0 10px;font-size:1.2rem;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:8px">${inlineMd(esc(line.slice(2)))}</h2>`;
        if (line.startsWith('## ')) return `<h3 style="color:var(--color-text-primary);margin:16px 0 6px;font-size:1rem;font-weight:700">${inlineMd(esc(line.slice(3)))}</h3>`;
        if (line.startsWith('- '))  return `<div style="display:flex;gap:8px;margin:4px 0;line-height:1.6"><span style="color:var(--color-accent);flex-shrink:0">▸</span><span>${inlineMd(esc(line.slice(2)))}</span></div>`;
        if (line.trim() === '')      return '<div style="height:8px"></div>';
        return `<p style="margin:6px 0;line-height:1.7">${inlineMd(esc(line))}</p>`;
    }).join('');
}

export function pointsTableHtml() {
    // Génère la table de répartition des points à partir de la constante POINTS
    // Toujours visible — pas besoin que l'admin édite quoi que ce soit
    const medals = ['🥇', '🥈', '🥉'];
    const rowsHtml = POINTS.map((pts, i) => {
        const pos = i + 1;
        const isTop3 = pos <= 3;
        const medal = isTop3 ? medals[i] : '';
        const posLabel = pos === 1 ? `${pos}er` : `${pos}ème`;
        const colorStyle = isTop3
            ? `color:${pos === 1 ? '#fbbf24' : pos === 2 ? '#cbd5e1' : '#cd7f32'};font-weight:var(--fw-black)`
            : 'color:var(--color-text-primary)';
        return `<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
            <td style="padding:10px 14px;${colorStyle}">${medal} ${posLabel}</td>
            <td style="padding:10px 14px;text-align:right;font-weight:var(--fw-black);color:var(--color-accent);font-size:var(--text-md)">${pts} pts</td>
        </tr>`;
    }).join('');

    return `<div class="card" style="margin-top:var(--space-lg)">
        <h2 style="margin-bottom:var(--space-sm);display:flex;align-items:center;gap:10px;font-size:var(--text-lg);font-weight:var(--fw-black);letter-spacing:var(--tracking-tight)">
            🏆 ${t('rules.points.title') || 'Système de points'}
        </h2>
        <p style="font-size:var(--text-sm);color:var(--color-text-secondary);line-height:1.6;margin-bottom:var(--space-md)">
            ${t('rules.points.desc') || 'Les points sont attribués lors de la finale de chaque édition selon la grille suivante (inspirée de la F1). Les joueurs qui atteignent la finale au-delà de la 10ème place reçoivent <strong style="color:var(--color-accent)">1 point</strong> chacun.'}
        </p>
        <div style="overflow:hidden;border-radius:var(--radius-md);border:var(--border-subtle)">
            <table style="width:100%;border-collapse:collapse;background:rgba(255,255,255,0.02)">
                <thead>
                    <tr style="background:rgba(255,255,255,0.03)">
                        <th style="padding:10px 14px;text-align:left;font-size:var(--text-xs);font-weight:var(--fw-bold);text-transform:uppercase;letter-spacing:var(--tracking-wider);color:var(--color-text-secondary)">${t('rules.points.position') || 'Position'}</th>
                        <th style="padding:10px 14px;text-align:right;font-size:var(--text-xs);font-weight:var(--fw-bold);text-transform:uppercase;letter-spacing:var(--tracking-wider);color:var(--color-text-secondary)">${t('rules.points.value') || 'Points'}</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                    <tr>
                        <td style="padding:10px 14px;color:var(--color-text-secondary);font-style:italic">${t('rules.points.beyond') || '11ème et au-delà'}</td>
                        <td style="padding:10px 14px;text-align:right;font-weight:var(--fw-bold);color:var(--color-accent)">1 pt</td>
                    </tr>
                </tbody>
            </table>
        </div>
        <p style="font-size:var(--text-xs);color:var(--color-text-secondary);margin-top:var(--space-md);font-style:italic">
            ${t('rules.points.note') || 'ℹ️ Les phases de qualification ne donnent pas de points — seule la finale compte au classement général.'}
        </p>
    </div>`;
}

export function displayRules() {
    const container = document.getElementById('rulesContent');
    if (!container) return;
    const rules = state.siteConfig?.rules;
    const rulesEn = state.siteConfig?.rulesEn;
    const content = (getLang() === 'en' && rulesEn) ? rulesEn : rules;
    let html = '';

    if (content) {
        html += `<div class="card" style="line-height:1.7">${renderMarkdown(content)}</div>`;
    } else if (!state.isAdmin) {
        html += `<div class="card" style="text-align:center;padding:60px;color:var(--color-text-secondary)">
            <div style="font-size:2.5rem;margin-bottom:12px">📋</div>
            <p>${t('rules.empty')}</p>
        </div>`;
    }

    // Section système de points (toujours affichée, même si pas de rules markdown)
    html += pointsTableHtml();

    if (state.isAdmin) {
        const fmtCodes = `<code style="background:rgba(255,255,255,0.06);padding:1px 6px;border-radius:4px"># Titre</code>
                <code style="background:rgba(255,255,255,0.06);padding:1px 6px;border-radius:4px">## Sous-titre</code>
                <code style="background:rgba(255,255,255,0.06);padding:1px 6px;border-radius:4px">- élément</code>
                <code style="background:rgba(255,255,255,0.06);padding:1px 6px;border-radius:4px">**gras**</code>`;
        const taStyle = `width:100%;box-sizing:border-box;resize:vertical;font-family:monospace;font-size:0.85rem;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:12px;color:var(--color-text-primary)`;
        html += `<div class="card" style="margin-top:16px">
            <h3 style="margin:0 0 6px;font-size:1rem">${t('rules.edit')}</h3>
            <p style="font-size:0.8rem;color:var(--color-text-secondary);margin-bottom:16px">${t('rules.format.hint')} ${fmtCodes}</p>

            <label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:6px">${t('rules.tab.fr')}</label>
            <textarea id="rulesEditor" rows="14" style="${taStyle}">${rules || ''}</textarea>

            <label style="display:block;font-size:0.85rem;font-weight:600;margin-top:16px;margin-bottom:4px">${t('rules.tab.en')}</label>
            <p style="font-size:0.78rem;color:var(--color-text-secondary);margin:0 0 6px">${t('rules.en.hint')}</p>
            <textarea id="rulesEditorEn" rows="14" style="${taStyle}">${rulesEn || ''}</textarea>

            <button class="btn btn-primary" onclick="saveRules()" style="margin-top:12px">${t('rules.save')}</button>
        </div>`;
    }

    container.innerHTML = html;
}

window.saveRules = async () => {
    const frContent = document.getElementById('rulesEditor')?.value || '';
    const enContent = document.getElementById('rulesEditorEn')?.value || '';
    try {
        await updateDoc(doc(db, 'siteContent', `config_${cupId}`), { rules: frContent, rulesEn: enContent });
        state.siteConfig.rules = frContent;
        state.siteConfig.rulesEn = enContent;
        showToast(t('rules.saved'));
        displayRules();
    } catch(err) {
        console.error('Save rules error:', err);
        showToast('Erreur lors de la sauvegarde');
    }
};
