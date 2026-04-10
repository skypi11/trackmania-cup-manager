import { app, db } from '../shared/firebase-config.js';
import { t, setLang, getLang, initLang } from '../shared/i18n.js';
import { collection, getDocs, query, where } from "firebase/firestore";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { state } from './modules/state.js';
import { buildRankingStats, displayGeneralRanking, displayStats } from './modules/display-rankings.js';
import { displayMapsTimeline } from './modules/display-maps.js';
import { displayHome, displayNextEditionBanner } from './modules/display-home.js';
import { displayHallOfFame } from './modules/display-hof.js';
import { displayEditions } from './modules/display-editions.js';
import { displayParticipants } from './modules/display-players.js';
import { displayPredictions } from './modules/display-predictions.js';
import './modules/admin-forms.js';
import { updateDiscordReminders, renderDiscordConfig } from './modules/discord.js';
import { loadSiteConfig, applySiteConfig } from './modules/site-config.js';
import { checkLoaded } from './modules/auth.js';
import { displayRules } from './modules/display-rules.js';
import { displayDuel } from './modules/display-duel.js';

initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider('6Lfc8Y0sAAAAAGozYyv9rRjgG6XUPffi-PsjYIGR'),
    isTokenAutoRefreshEnabled: true
});

// Cup configuration from URL parameter
const cupId = new URLSearchParams(window.location.search).get('cup') || 'monthly';
const CUP = cupId === 'mania'
    ? { name: 'Springs Mania Cup', color: '#FFB800', colorHover: '#ffc733', label: 'LAN' }
    : { name: 'Springs Monthly Cup', color: '#00D936', colorHover: '#00ff3f', label: t('msg.online') };

// Apply cup colors and title
document.documentElement.style.setProperty('--color-accent', CUP.color);
document.documentElement.style.setProperty('--color-accent-hover', CUP.colorHover);
document.title = `${CUP.name} — Trackmania`;
document.getElementById('cupTitle').textContent = CUP.name;
document.getElementById('cupSubtitle').textContent = `Springs E-Sport · ${CUP.label}`;
document.getElementById('authCupName').textContent = CUP.name;

// → site-config.js | discord.js | auth.js

// Section switching
function showSection(id) {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.section-panel').forEach(p => p.style.display = 'none');
    const navItem = document.querySelector(`.nav-item[data-section="${id}"]`);
    if (navItem) navItem.classList.add('active');
    const panel = document.getElementById(id);
    if (panel) panel.style.display = '';
    if (id === 'rankings') displayGeneralRanking();
    else if (id === 'stats') displayStats();
    else if (id === 'home') displayHome();
    else if (id === 'halloffame') displayHallOfFame();
    else if (id === 'administration') { applySiteConfig(); renderDiscordConfig(); window.displayAdminEditions?.(); window.displayAdminPlayers?.(); }
    else if (id === 'maps') displayMapsTimeline();
    else if (id === 'predictions') displayPredictions();
    else if (id === 'reglement') displayRules();
    else if (id === 'duel') displayDuel();
    const titles = { home: t('nav.home'), editions: t('nav.editions'), rankings: t('nav.rankings'), maps: t('nav.maps'), predictions: t('nav.predictions'), participants: t('nav.players'), stats: t('nav.stats'), halloffame: t('nav.hof'), administration: '⚙️ Administration', reglement: t('nav.reglement'), duel: t('nav.duel') };
    const titleEl = document.getElementById('topbarTitle');
    if (titleEl) titleEl.textContent = titles[id] || '';
    // Sync URL hash (replaceState = pas d'entrée dans l'historique pour nav interne)
    if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
}
window.showSection = showSection;

// Nav clicks : pushState pour que le bouton Retour du navigateur fonctionne
document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
        const id = btn.dataset.section;
        history.pushState(null, '', '#' + id);
        showSection(id);
        // Ferme la sidebar sur mobile après navigation
        document.getElementById('sidebar')?.classList.remove('open');
        document.getElementById('sidebarOverlay')?.classList.remove('open');
    });
});

// Bouton retour/avant du navigateur
window.addEventListener('popstate', () => {
    const id = location.hash.slice(1) || 'home';
    if (document.getElementById(id)) showSection(id);
});

// Chargement direct avec un hash dans l'URL (ex: cup.html#rankings)
const _initHash = location.hash.slice(1);
if (_initHash && document.getElementById(_initHash)) {
    showSection(_initHash);
} else {
    history.replaceState(null, '', '#home');
}

// ── i18n ──────────────────────────────────────────────────────────────
const applyI18n = () => {
    if (!state.loaded.participants || !state.loaded.editions || !state.loaded.results) return;
    displayHome();
    displayEditions();
    displayGeneralRanking();
    displayParticipants();
    displayStats();
    displayHallOfFame();
    displayNextEditionBanner();
    if (document.getElementById('maps')?.style.display !== 'none') displayMapsTimeline();
    if (document.getElementById('predictions')?.style.display !== 'none') displayPredictions();
};
window.toggleLang = () => {
    const newLang = getLang() === 'fr' ? 'en' : 'fr';
    setLang(newLang);
    applyI18n();
};
initLang();

// Load site config (async, non-blocking)
loadSiteConfig();

// Chargement unique des données (remplace les listeners temps réel)
async function loadData() {
    try {
        const [pSnap, eSnap, rSnap, predSnap] = await Promise.all([
            getDocs(query(collection(db, 'participants'), where('cupId', '==', cupId))),
            getDocs(query(collection(db, 'editions'), where('cupId', '==', cupId))),
            getDocs(query(collection(db, 'results'), where('cupId', '==', cupId))),
            getDocs(query(collection(db, 'predictions'), where('cupId', '==', cupId))),
        ]);

        state.data.participants = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        state.data.editions = eSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        state.data.results = rSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        state.data.predictions = predSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        ['participants', 'editions', 'results', 'predictions'].forEach(k => { state.loaded[k] = true; });
        checkLoaded();

        displayParticipants(); displayEditions(); displayHome();
        displayHallOfFame(); displayNextEditionBanner(); displayStats();
        displayGeneralRanking(); updateDiscordReminders();
        if (document.getElementById('duel')?.style.display !== 'none') displayDuel();
        if (document.getElementById('predictions')?.style.display !== 'none') displayPredictions();
        if (document.getElementById('maps')?.style.display !== 'none') displayMapsTimeline();
        if (document.getElementById('administration')?.style.display !== 'none') {
            window.displayAdminPlayers?.(); window.displayDiscordMigration?.();
            window.displayAdminResults?.(); window.displayAdminEditions?.();
        }
    } catch (err) {
        console.error('[Firestore] loadData error:', err.code, err.message);
        ['participants', 'editions', 'results', 'predictions'].forEach(k => { state.loaded[k] = true; });
        checkLoaded();
    }
}

// Exposé globalement pour que admin-forms.js puisse déclencher un refresh
// après chaque écriture, sans attendre le prochain cycle automatique
window.reloadData = loadData;

// Chargement initial + auto-refresh toutes les 2 minutes
loadData();
setInterval(loadData, 2 * 60 * 1000);