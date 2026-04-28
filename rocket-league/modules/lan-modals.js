// modules/lan-modals.js — modals UX réutilisables (confirmation pairings, etc.)
import { state } from './state.js';
import { esc, openModal, closeModal } from './utils.js';

/**
 * Affiche un modal stylisé pour confirmer la génération d'un round / bracket.
 *
 * @param {object} opts
 * @param {string} opts.title — titre du modal (ex: "Round 2 — Génération")
 * @param {string} opts.subtitle — sous-titre/description (ex: "8 matchs en BO5")
 * @param {Array<{home:string,away:string}>} opts.pairings — paires de teamIds
 * @param {string} [opts.confirmLabel] — texte du bouton confirmer
 * @param {string} [opts.format] — 'bo5' | 'bo7' (affiché en badge sur chaque carte)
 * @returns {Promise<boolean>} — true si confirmé, false sinon
 */
export function showPairingsConfirmation({ title, subtitle, pairings, confirmLabel = '✓ Confirmer & créer', format = 'bo5' }) {
  return new Promise(resolve => {
    const titleEl = document.getElementById('mo-pairings-title');
    const body = document.getElementById('mo-pairings-body');
    if (!titleEl || !body) { resolve(false); return; }
    titleEl.textContent = title;

    body.innerHTML = `
      ${subtitle ? `<div style="font-size:.84rem;color:var(--text2);margin-bottom:6px">${esc(subtitle)}</div>` : ''}
      <div class="pairings-list">
        ${pairings.map((p, i) => renderPairingCard(p, i + 1, format)).join('')}
      </div>
      <div class="f-actions">
        <button class="btn-p" id="mo-pairings-ok">${esc(confirmLabel)}</button>
        <button class="btn-s" id="mo-pairings-cancel">Annuler</button>
      </div>
    `;

    const cleanup = () => {
      document.getElementById('mo-pairings-ok')?.removeEventListener('click', onOk);
      document.getElementById('mo-pairings-cancel')?.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onKey);
    };
    const onOk = () => { cleanup(); closeModal('mo-pairings'); resolve(true); };
    const onCancel = () => { cleanup(); closeModal('mo-pairings'); resolve(false); };
    const onKey = e => {
      if (e.key === 'Enter') { e.preventDefault(); onOk(); }
      else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    };

    document.getElementById('mo-pairings-ok').addEventListener('click', onOk);
    document.getElementById('mo-pairings-cancel').addEventListener('click', onCancel);
    document.addEventListener('keydown', onKey);

    openModal('mo-pairings');
    setTimeout(() => document.getElementById('mo-pairings-ok')?.focus(), 50);
  });
}

function renderPairingCard(pairing, num, format) {
  const home = state.teamsMap[pairing.home];
  const away = state.teamsMap[pairing.away];
  const homeName = home?.name || '?';
  const awayName = away?.name || '?';
  const homeLogo = home?.logoUrl
    ? `<img class="pairing-logo" src="${esc(home.logoUrl)}" alt="" onerror="this.style.opacity='.2'">`
    : `<div class="pairing-logo-ph"></div>`;
  const awayLogo = away?.logoUrl
    ? `<img class="pairing-logo" src="${esc(away.logoUrl)}" alt="" onerror="this.style.opacity='.2'">`
    : `<div class="pairing-logo-ph"></div>`;
  return `
    <div class="pairing-card">
      <div class="pairing-num">${num}</div>
      <div class="pairing-team">${homeLogo}<span class="pairing-name">${esc(homeName)}</span></div>
      <div class="pairing-vs">VS<br><span style="color:var(--text3);font-weight:600;letter-spacing:0">${esc(format.toUpperCase())}</span></div>
      <div class="pairing-team away"><span class="pairing-name">${esc(awayName)}</span>${awayLogo}</div>
    </div>
  `;
}
