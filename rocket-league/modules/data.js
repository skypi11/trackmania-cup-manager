// modules/data.js
import { db } from '../../shared/firebase-config.js';
import { collection, getDocs } from 'firebase/firestore';
import { state } from './state.js';

const COOLDOWN_MS = 60_000; // 1 minute entre deux lectures de la même collection
const _lastFetch = { teams: 0, players: 0, matches: 0 };

export async function fetchAll(force = false) {
  if (state._dataFetched && !force) return;
  const now = Date.now();
  const [ts, ps, ms] = await Promise.all([
    getDocs(collection(db,'rl_teams')),
    getDocs(collection(db,'rl_players')),
    getDocs(collection(db,'rl_matches'))
  ]);
  state.teamsMap = {}; ts.forEach(d => { state.teamsMap[d.id]={id:d.id,...d.data()}; });
  state.playersMap = {}; ps.forEach(d => { state.playersMap[d.id]={id:d.id,...d.data()}; });
  state.matchesMap = {}; ms.forEach(d => { state.matchesMap[d.id]={id:d.id,...d.data()}; });
  _lastFetch.teams = _lastFetch.players = _lastFetch.matches = now;
  state._dataFetched = true;
}

export async function refreshTeams(force = false) {
  const now = Date.now();
  if (!force && now - _lastFetch.teams < COOLDOWN_MS) return;
  const s = await getDocs(collection(db,'rl_teams'));
  state.teamsMap = {}; s.forEach(d => { state.teamsMap[d.id]={id:d.id,...d.data()}; });
  _lastFetch.teams = now;
}

export async function refreshPlayers(force = false) {
  const now = Date.now();
  if (!force && now - _lastFetch.players < COOLDOWN_MS) return;
  const s = await getDocs(collection(db,'rl_players'));
  state.playersMap = {}; s.forEach(d => { state.playersMap[d.id]={id:d.id,...d.data()}; });
  _lastFetch.players = now;
}

export async function refreshMatches(force = false) {
  const now = Date.now();
  if (!force && now - _lastFetch.matches < COOLDOWN_MS) return;
  const s = await getDocs(collection(db,'rl_matches'));
  state.matchesMap = {}; s.forEach(d => { state.matchesMap[d.id]={id:d.id,...d.data()}; });
  _lastFetch.matches = now;
}
