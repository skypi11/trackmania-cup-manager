// /api/sync-discord-avatars — POST, admin only
// Récupère les avatars Discord à jour pour tous les participants TM/RL
// qui ont un discordId. Utilise le bot AEDRAL (DISCORD_BOT_TOKEN) pour
// appeler l'API Discord GET /users/{id}.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function initAdmin() {
  if (!getApps().length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({ credential: cert(serviceAccount) });
  }
}

// Petit délai pour rester confortablement sous le rate limit Discord (50/s)
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── 1. Vérification admin via Firebase ID token ────────────────────────
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!idToken) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  initAdmin();
  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(idToken);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const db = getFirestore();
  const adminDoc = await db.collection('admins').doc(decoded.uid).get();
  if (!adminDoc.exists) {
    return res.status(403).json({ error: 'Not an admin' });
  }

  // ── 2. Vérification bot token ──────────────────────────────────────────
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    return res.status(500).json({ error: 'DISCORD_BOT_TOKEN not configured' });
  }

  // ── 3. Récupère tous les participants avec discordId ──────────────────
  // Optionnel : ?force=1 pour rafraîchir tous (pas seulement les vides)
  const force = req.query.force === '1' || req.body?.force === true;

  const snap = await db.collection('participants')
    .where('discordId', '!=', null)
    .get();

  let updated = 0, skipped = 0, failed = 0, notFound = 0;
  const errors = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    if (!data.discordId) { skipped++; continue; }
    if (!force && data.discordAvatar) { skipped++; continue; }

    try {
      const r = await fetch(`https://discord.com/api/v10/users/${data.discordId}`, {
        headers: { Authorization: `Bot ${botToken}` },
      });

      if (r.status === 404) {
        notFound++;
        continue;
      }
      if (!r.ok) {
        failed++;
        const txt = await r.text().catch(() => '');
        errors.push({ id: doc.id, status: r.status, msg: txt.slice(0, 120) });
        continue;
      }

      const user = await r.json();
      const avatarUrl = user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/${(BigInt(user.id) >> 22n) % 6n}.png`;

      // Update si l'URL a changé (ou si on était vide)
      if (data.discordAvatar !== avatarUrl) {
        await doc.ref.update({
          discordAvatar: avatarUrl,
          ...(user.username && user.username !== data.discordUsername
            ? { discordUsername: user.username } : {}),
        });
        updated++;
      } else {
        skipped++;
      }

      // Rate-limit safety : ~20 req/s max
      await sleep(50);
    } catch (err) {
      failed++;
      errors.push({ id: doc.id, msg: err.message });
    }
  }

  return res.status(200).json({
    total: snap.size,
    updated,
    skipped,
    failed,
    notFound,
    errors: errors.slice(0, 10),
  });
}
