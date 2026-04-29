// modules/display-maps.js — Maps Timeline

import { state } from './state.js';
import { t } from '../../shared/i18n.js';
import { pName, dateLang } from './utils.js';

const cupId = new URLSearchParams(window.location.search).get('cup') || 'monthly';

function extractTmxId(value) {
    if (!value) return null;
    const m = value.match(/trackmania\.exchange\/mapshow\/(\d+)/i);
    if (m) return m[1];
    if (/^\d+$/.test(value.trim())) return value.trim();
    return null;
}

window.setMapsSeason = (s) => { state.selectedMapsSeason = s; displayMapsTimeline(); };

export function displayMapsTimeline() {
    const filterBar  = document.getElementById('mapsSeasonFilter');
    const container  = document.getElementById('mapsTimeline');
    if (!filterBar || !container) return;

    // Seasons with any map data
    const allSeasons = [...new Set(
        state.data.editions.map(e => e.saison || new Date(e.date).getFullYear())
    )].sort((a, b) => b - a);

    if (state.selectedMapsSeason === null) state.selectedMapsSeason = allSeasons[0] ?? 'all';

    const tabs = [
        `<button class="filter-btn${state.selectedMapsSeason === 'all' ? ' active' : ''}" onclick="setMapsSeason('all')">Toutes</button>`,
        ...allSeasons.map(s => `<button class="filter-btn${state.selectedMapsSeason === s ? ' active' : ''}" onclick="setMapsSeason(${s})">${s}</button>`)
    ];
    filterBar.innerHTML = tabs.join('');

    // SÉCURITÉ : on n'affiche les maps QUE pour les éditions terminées ou
    // en cours. Les statuts 'fermee' / 'inscriptions' / 'upcoming' doivent
    // rester secrets — les joueurs ne doivent PAS voir les maps avant la
    // compétition (sinon ils s'entraînent dessus, ça gâche la surprise).
    // Note : pas de bypass admin ici car l'ancien code utilisait
    // state.isAdmin combiné à e.status === 'live' (statut qui n'existe pas
    // dans la base — le vrai est 'en_cours'), ce qui faisait leak les maps
    // d'éditions non publiques côté admin. L'admin peut toujours voir/éditer
    // les maps via l'onglet Admin → Éditions.
    const editions = state.data.editions
        .filter(e => {
            if (state.selectedMapsSeason === 'all') return true;
            return (e.saison || new Date(e.date).getFullYear()) === state.selectedMapsSeason;
        })
        .filter(e => e.status === 'terminee' || e.status === 'en_cours')
        .filter(e => [1,2,3,4,5,6,7].some(n => e[`map${n}tmx`] || e[`map${n}name`]))
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    if (editions.length === 0) {
        container.innerHTML = '<div class="empty-state"><span class="empty-state-icon">🗺️</span><p>Aucune édition avec des maps enregistrées</p></div>';
        return;
    }

    let html = '';
    editions.forEach(e => {
        const winner = state.data.results.find(r => r.editionId === e.id && r.phase === 'finale' && r.position === 1);
        const winnerPlayer = winner ? state.data.participants.find(p => p.id === winner.playerId) : null;
        const dateStr = e.date ? new Date(e.date).toLocaleDateString(dateLang(), { day: 'numeric', month: 'long', year: 'numeric' }) : '';

        let mapsHtml = '';
        for (let n = 1; n <= 7; n++) {
            const tmxVal  = e[`map${n}tmx`]     || '';
            const tmxId   = extractTmxId(tmxVal);
            const name    = e[`map${n}name`]    || '';
            const mapper  = e[`map${n}mapper`]  || '';
            const thumb   = e[`map${n}thumbUrl`] || '';
            const isFinale = n === 7;

            // Skip if no data at all
            if (!tmxId && !name && !thumb) continue;

            const tmxLink = tmxId ? `https://trackmania.exchange/mapshow/${tmxId}` : null;
            const thumbHtml = thumb
                ? `<img class="maps-timeline-thumb" src="${thumb}" alt="Map ${n}" loading="lazy">`
                : `<div class="maps-timeline-thumb-placeholder">${isFinale ? '🏆' : n}</div>`;
            const labelHtml = isFinale
                ? `<div class="maps-timeline-label" style="color:#fbbf24">${t('detail.map.final.label')}</div>`
                : `<div class="maps-timeline-label">${t('detail.map.n')} ${n}</div>`;
            const nameHtml  = name
                ? `<div class="maps-timeline-name">${name}${mapper ? `<div class="maps-timeline-mapper">${t('detail.by')} ${mapper}</div>` : ''}</div>`
                : `<div class="maps-timeline-notmx">${t('detail.unnamed')}</div>`;

            const cardOpen = tmxLink
                ? `<a class="maps-timeline-card${isFinale ? ' finale-map' : ''}" href="${tmxLink}" target="_blank" rel="noopener" title="Voir sur TMX">`
                : `<div class="maps-timeline-card${isFinale ? ' finale-map' : ''}">`;
            const cardClose = tmxLink ? '</a>' : '</div>';
            mapsHtml += `${cardOpen}${thumbHtml}${labelHtml}${nameHtml}${cardClose}`;
        }

        if (!mapsHtml) {
            mapsHtml = '<p style="color:var(--color-text-secondary);font-size:0.85rem;padding:4px 0">Aucune map renseignée pour cette édition.</p>';
        }

        html += `<div class="maps-edition-block">
            <div class="maps-edition-header" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none'">
                <div class="maps-edition-title">${e.name || 'Édition'}</div>
                <div class="maps-edition-date">${dateStr}</div>
                ${winnerPlayer ? `<div class="maps-edition-winner">🏆 ${pName(winnerPlayer)}</div>` : ''}
                <span style="color:rgba(255,255,255,0.2);font-size:0.8rem">▼</span>
            </div>
            <div class="maps-edition-body">
                <div class="maps-timeline-grid">${mapsHtml}</div>
            </div>
        </div>`;
    });

    container.innerHTML = html;
}
