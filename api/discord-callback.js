import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function initAdmin() {
  if (!getApps().length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({ credential: cert(serviceAccount) });
  }
}

export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.redirect(302, '/rocket-league/?auth_error=no_code');
  }

  try {
    // Échange du code contre un access token Discord
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'https://springs-esport.vercel.app/api/discord-callback',
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error('Discord token error:', tokenData);
      return res.redirect(302, '/rocket-league/?auth_error=token_failed');
    }

    // Récupération des infos utilisateur Discord
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const discordUser = await userRes.json();

    if (!discordUser.id) {
      console.error('Discord user error:', discordUser);
      return res.redirect(302, '/rocket-league/?auth_error=user_failed');
    }

    // Initialisation Firebase Admin
    initAdmin();
    const auth = getAuth();

    // Création du token Firebase custom (uid = discord_SNOWFLAKE)
    const firebaseToken = await auth.createCustomToken(`discord_${discordUser.id}`, {
      discordId: discordUser.id,
      discordUsername: discordUser.username,
    });

    // URL avatar Discord
    const avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/0.png`;

    const params = new URLSearchParams({
      ft: firebaseToken,
      did: discordUser.id,
      du: discordUser.username,
      da: avatarUrl,
    });

    res.redirect(302, `/rocket-league/?${params.toString()}`);
  } catch (err) {
    console.error('Discord auth error:', err);
    res.redirect(302, '/rocket-league/?auth_error=server_error');
  }
}
