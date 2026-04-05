// modules/state.js — État partagé entre tous les modules RL
export const state = {
  lang: 'fr',
  curTab: 'accueil',
  isAdmin: false,
  curUser: null,
  gPool: 1, tPool: 0, rPool: 1, rWeek: 'all',
  rTeam: '', rStatus: 'tous',
  admSec: 'equipes',
  statsSortKey: 'pts', statsSortAsc: false,
  editTeamId: null, editPlayerId: null,
  admMatchPool: 1, admMatchWeek: 1,
  _dataFetched: false,
  teamsMap: {},
  playersMap: {},
  matchesMap: {},
  predictorsMap: {},
};
