// modules/state.js — État mutable partagé de l'application

export const state = {
    // Auth
    isAdmin: false,
    currentUser: null,
    currentUserProfile: null,

    // Données Firebase (temps réel)
    data: {
        participants: [],
        editions: [],
        results: [],
        predictions: []
    },

    // Chargement
    loaded: {
        participants: false,
        editions: false,
        results: false,
        predictions: false,
        auth: false
    },

    // UI — navigation
    currentDetailEditionId: null,

    // UI — embeds
    twitchCollapsed: false,
    youtubeCollapsed: false,

    // UI — filtres
    editionFilter: 'all',
    editionSort: 'desc',

    // UI — graphiques
    rankingChart: null,
    playerChart: null,

    // UI — sélecteurs de saison
    selectedMapsSeason: null,
    selectedRankingSeason: null,

    // UI — Rankings : 'competition' (pts F1) ou 'springs' (Springs Rank combiné)
    rankingMode: 'competition',

    // UI — prédictions
    predState: {},

    // Flags
    urlAutoOpenDone: false,

    // Config site (initialisée dans cup.js après CONFIG_DEFAULTS)
    siteConfig: {},

    // Discord OAuth
    pendingDiscordToken: null,
};
