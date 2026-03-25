// modules/display-rules.js — Page règlement (affichage + édition admin)

import { db } from '../../shared/firebase-config.js';
import { state } from './state.js';
import { t } from '../../shared/i18n.js';
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

export function displayRules() {
    const container = document.getElementById('rulesContent');
    if (!container) return;
    const rules = state.siteConfig?.rules;
    let html = '';

    if (rules) {
        html += `<div class="card" style="line-height:1.7">${renderMarkdown(rules)}</div>`;
    } else if (!state.isAdmin) {
        html += `<div class="card" style="text-align:center;padding:60px;color:var(--color-text-secondary)">
            <div style="font-size:2.5rem;margin-bottom:12px">📋</div>
            <p>${t('rules.empty')}</p>
        </div>`;
    }

    if (state.isAdmin) {
        html += `<div class="card" style="margin-top:16px">
            <h3 style="margin:0 0 6px;font-size:1rem">${t('rules.edit')}</h3>
            <p style="font-size:0.8rem;color:var(--color-text-secondary);margin-bottom:12px">${t('rules.format.hint')}
                <code style="background:rgba(255,255,255,0.06);padding:1px 6px;border-radius:4px"># Titre</code>
                <code style="background:rgba(255,255,255,0.06);padding:1px 6px;border-radius:4px">## Sous-titre</code>
                <code style="background:rgba(255,255,255,0.06);padding:1px 6px;border-radius:4px">- élément</code>
                <code style="background:rgba(255,255,255,0.06);padding:1px 6px;border-radius:4px">**gras**</code>
            </p>
            <textarea id="rulesEditor" rows="18" style="width:100%;box-sizing:border-box;resize:vertical;font-family:monospace;font-size:0.85rem;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:12px;color:var(--color-text-primary)">${rules || ''}</textarea>
            <button class="btn btn-primary" onclick="saveRules()" style="margin-top:12px">${t('rules.save')}</button>
        </div>`;
    }

    container.innerHTML = html;
}

window.saveRules = async () => {
    const content = document.getElementById('rulesEditor')?.value || '';
    try {
        await updateDoc(doc(db, 'siteContent', `config_${cupId}`), { rules: content });
        state.siteConfig.rules = content;
        showToast(t('rules.saved'));
        displayRules();
    } catch(err) {
        console.error('Save rules error:', err);
        showToast('Erreur lors de la sauvegarde');
    }
};
