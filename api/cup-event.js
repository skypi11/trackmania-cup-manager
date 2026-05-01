// /api/cup-event — POST, appelé par le serveur ManiaScript Trackmania
//
// Auth : header X-API-Key qui doit matcher process.env.CUP_API_KEY.
// Reçoit les events de fin de map qualif et de fin de finale, et écrit
// directement dans la collection `results` au format existant
// ({editionId, playerId, phase, position, map?, cupId}).
//
// Mapping login Trackmania (Score.User.Login) → playerId :
//   - cherche dans `participants` un doc avec `loginTM === login`
//   - les logins inconnus sont retournés dans le payload de réponse mais ignorés
//
// Format des events :
//
//   { editionId, type: "qualif_map_end", map: 1-7, qualified: [{login, position}],
//     livesGained?: [{login}] }
//
//   { editionId, type: "finale_end", ranking: [{login, position}] }
//
// La réponse JSON contient { ok, written, skipped, unknownLogins }.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function initAdmin() {
  if (!getApps().length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({ credential: cert(serviceAccount) });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Auth API Key ──────────────────────────────────────────────────────────
  const expected = process.env.CUP_API_KEY;
  if (!expected) {
    return res.status(500).json({ error: 'CUP_API_KEY not configured on server' });
  }
  const provided = req.headers['x-api-key'] || '';
  if (provided !== expected) {
    return res.status(401).json({ error: 'Invalid X-API-Key' });
  }

  // ── Validation payload ────────────────────────────────────────────────────
  const body = req.body || {};
  const { editionId, type } = body;
  if (!editionId || !type) {
    return res.status(400).json({ error: 'Missing editionId or type' });
  }
  if (!['qualif_map_end', 'finale_end'].includes(type)) {
    return res.status(400).json({ error: `Unknown type "${type}"` });
  }

  initAdmin();
  const db = getFirestore();

  // ── Vérifier que l'édition existe ─────────────────────────────────────────
  const editionSnap = await db.collection('editions').doc(editionId).get();
  if (!editionSnap.exists) {
    return res.status(404).json({ error: `Edition "${editionId}" not found` });
  }
  const edition = editionSnap.data();
  const cupId = edition.cupId || 'monthly';

  // ── Lookup login → participant ────────────────────────────────────────────
  // On charge tous les participants de la cup une fois et on indexe par loginTM
  // (lowercase) pour être tolérant à la casse.
  const participantsSnap = await db.collection('participants')
    .where('cupId', 'in', [cupId, null]) // certains anciens docs n'ont pas cupId
    .get()
    .catch(() => null);

  // Fallback si la query 'in' a échoué (cupId absent) — on charge tout
  const allDocs = participantsSnap
    ? participantsSnap.docs
    : (await db.collection('participants').get()).docs;

  const loginIndex = new Map();
  for (const doc of allDocs) {
    const data = doc.data();
    if (data.loginTM) {
      loginIndex.set(String(data.loginTM).toLowerCase().trim(), doc.id);
    }
  }

  const findPlayerId = (login) => {
    if (!login) return null;
    return loginIndex.get(String(login).toLowerCase().trim()) || null;
  };

  let written = 0;
  const skipped = [];
  const unknownLogins = [];

  // ── Handler qualif map end ────────────────────────────────────────────────
  if (type === 'qualif_map_end') {
    const map = Number(body.map);
    const qualified = Array.isArray(body.qualified) ? body.qualified : [];
    if (!Number.isInteger(map) || map < 1 || map > 7) {
      return res.status(400).json({ error: 'map must be 1-7' });
    }
    if (qualified.length === 0) {
      return res.status(400).json({ error: 'qualified array is empty' });
    }

    for (const entry of qualified) {
      const { login, position } = entry;
      const playerId = findPlayerId(login);
      if (!playerId) {
        unknownLogins.push(login);
        continue;
      }
      const pos = Number(position);
      if (!Number.isInteger(pos) || pos < 1) {
        skipped.push({ login, reason: 'invalid position' });
        continue;
      }
      // Idempotence : ne pas dupliquer si déjà saisi
      const existing = await db.collection('results')
        .where('editionId', '==', editionId)
        .where('phase', '==', 'qualification')
        .where('map', '==', map)
        .where('position', '==', pos)
        .limit(1)
        .get();
      if (!existing.empty) {
        skipped.push({ login, reason: 'already exists' });
        continue;
      }
      await db.collection('results').add({
        editionId, playerId, phase: 'qualification', map, position: pos, cupId,
        source: 'maniascript',
        createdAt: new Date(),
      });
      written++;
    }
  }

  // ── Handler finale end ────────────────────────────────────────────────────
  if (type === 'finale_end') {
    const ranking = Array.isArray(body.ranking) ? body.ranking : [];
    if (ranking.length === 0) {
      return res.status(400).json({ error: 'ranking array is empty' });
    }

    for (const entry of ranking) {
      const { login, position } = entry;
      const playerId = findPlayerId(login);
      if (!playerId) {
        unknownLogins.push(login);
        continue;
      }
      const pos = Number(position);
      if (!Number.isInteger(pos) || pos < 1) {
        skipped.push({ login, reason: 'invalid position' });
        continue;
      }
      const existing = await db.collection('results')
        .where('editionId', '==', editionId)
        .where('phase', '==', 'finale')
        .where('position', '==', pos)
        .limit(1)
        .get();
      if (!existing.empty) {
        skipped.push({ login, reason: 'already exists' });
        continue;
      }
      await db.collection('results').add({
        editionId, playerId, phase: 'finale', position: pos, cupId,
        source: 'maniascript',
        createdAt: new Date(),
      });
      written++;
    }
  }

  return res.status(200).json({
    ok: true,
    type,
    editionId,
    written,
    skipped,
    unknownLogins,
  });
}
