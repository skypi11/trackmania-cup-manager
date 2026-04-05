// modules/data.js
import { db } from '../../shared/firebase-config.js';
import { collection, getDocs } from 'firebase/firestore';
import { state } from './state.js';

export async function fetchAll(force = false) {
  if (state._dataFetched && !force) return;
  const [ts, ps, ms] = await Promise.all([
    getDocs(collection(db,'rl_teams')),
    getDocs(collection(db,'rl_players')),
    getDocs(collection(db,'rl_matches'))
  ]);
  state.teamsMap = {}; ts.forEach(d => { state.teamsMap[d.id]={id:d.id,...d.data()}; });
  state.playersMap = {}; ps.forEach(d => { state.playersMap[d.id]={id:d.id,...d.data()}; });
  state.matchesMap = {}; ms.forEach(d => { state.matchesMap[d.id]={id:d.id,...d.data()}; });
  state._dataFetched = true;
}

export async function refreshTeams() {
  const s = await getDocs(collection(db,'rl_teams'));
  state.teamsMap = {}; s.forEach(d => { state.teamsMap[d.id]={id:d.id,...d.data()}; });
}

export async function refreshPlayers() {
  const s = await getDocs(collection(db,'rl_players'));
  state.playersMap = {}; s.forEach(d => { state.playersMap[d.id]={id:d.id,...d.data()}; });
}

export async function refreshMatches() {
  const s = await getDocs(collection(db,'rl_matches'));
  state.matchesMap = {}; s.forEach(d => { state.matchesMap[d.id]={id:d.id,...d.data()}; });
}
