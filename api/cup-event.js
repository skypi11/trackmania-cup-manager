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

// On désactive le bodyParser Vercel pour pouvoir lire le raw stream nous-mêmes.
// Raison : ManiaScript Http.CreatePost envoie un content-type 'application/binary'
// que le parser Vercel ne reconnaît pas → req.body serait undefined sinon.
export const config = {
  api: { bodyParser: false },
};

function initAdmin() {
  if (!getApps().length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({ credential: cert(serviceAccount) });
  }
}

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Auth API Key ──────────────────────────────────────────────────────────
  // Accepte la clé via header X-API-Key OU via body.apiKey (ManiaScript ne
  // peut pas définir de headers HTTP custom dans la version actuelle de l'API
  // CHttpRequest).
  const expected = process.env.CUP_API_KEY;
  if (!expected) {
    return res.status(500).json({ error: 'CUP_API_KEY not configured on server' });
  }
  // bodyParser désactivé → on lit le raw stream et on parse JSON manuellement
  const raw = await readRawBody(req);
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch (err) {
    console.log(`[parse-fail] err=${err.message} rawLen=${raw.length} sample=${raw.slice(0, 80)}`);
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const provided = req.headers['x-api-key'] || body.apiKey || '';
  // DEBUG TEMPORAIRE
  console.log(`[ok] ct=${req.headers['content-type']} rawLen=${raw.length} keys=[${Object.keys(body).join(',')}] match=${provided === expected}`);
  if (provided !== expected) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  // ── Validation payload ────────────────────────────────────────────────────
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
