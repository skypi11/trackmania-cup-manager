import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function initAdmin() {
  if (!getApps().length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({ credential: cert(serviceAccount) });
  }
}

export default async function handler(req, res) {
  const { code, state } = req.query;

  // Determine redirect destination based on state parameter
  // state = 'tm_monthly' | 'tm_mania' → Trackmania
  // state = 'rl' or absent → Rocket League
  function getRedirectBase(st) {
    if (st === 'tm_monthly') return { base: '/trackmania/cup.html', query: 'cup=monthly' };
    if (st === 'tm_mania')   return { base: '/trackmania/cup.html', query: 'cup=mania' };
    return { base: '/rocket-league/', query: '' };
  }

  const { base: redirectBase, query: redirectQuery } = getRedirectBase(state);

  function errorRedirect(code) {
    const sep = redirectQuery ? '&' : '?';
    return res.redirect(302, `${redirectBase}?${redirectQuery}${sep}auth_error=${code}`);
  }

  if (!code) return errorRedirect('no_code');

  try {
    // Exchange code for Discord access token
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
      return errorRedirect('token_failed');
    }

    // Get Discord user info
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const discordUser = await userRes.json();
    if (!discordUser.id) {
      console.error('Discord user error:', discordUser);
      return errorRedirect('user_failed');
    }

    // Create Firebase custom token (uid = discord_SNOWFLAKE)
    initAdmin();
    const firebaseToken = await getAuth().createCustomToken(`discord_${discordUser.id}`, {
      discordId: discordUser.id,
      discordUsername: discordUser.username,
    });

    const avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/0.png`;

    const params = new URLSearchParams({
      ft: firebaseToken,
      did: discordUser.id,
      du: discordUser.username,
      da: avatarUrl,
    });

    const sep = redirectQuery ? '&' : '?';
    res.redirect(302, `${redirectBase}?${redirectQuery}${sep}${params.toString()}`);
  } catch (err) {
    console.error('Discord auth error:', err);
    return errorRedirect('server_error');
  }
}
