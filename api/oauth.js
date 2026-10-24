/**
 * Vercel Serverless 函数：QQ 互联 OAuth 代理
 *
 * 为什么需要它：腾讯 AppSecret 不能放在前端（会被任何人扒到），
 * 必须在服务器侧安全持有。这个函数就是那层薄薄的代理。
 *
 * 环境变量（在 Vercel 控制台 Settings → Environment Variables 里填）：
 *   QQ_APP_ID      —— 腾讯 QQ 互联给的 AppID
 *   QQ_APP_SECRET  —— 腾讯 QQ 互联给的 AppSecret
 *   PUBLIC_BASE    —— 你的主页面域名，例如 https://maskedball.xyz
 *                     （用于拼接 redirect_uri，必须和 QQ 互联后台登记的完全一致）
 *
 * 前端调用：POST /api/oauth  { code: 'xxx' }  →  { openid, nick, avatar }
 */

export default async function handler(req, res) {
  // 只接受 POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { code } = req.body || {};
  if (!code) {
    return res.status(400).json({ error: 'missing code' });
  }

  const appId = process.env.QQ_APP_ID;
  const appSecret = process.env.QQ_APP_SECRET;
  const publicBase = process.env.PUBLIC_BASE;

  if (!appId || !appSecret || !publicBase) {
    return res.status(500).json({ error: 'server not configured' });
  }

  const redirectUri = publicBase.replace(/\/$/, '') + '/';

  try {
    // Step 1: 用 code 换 access_token + openid
    // 腾讯文档：https://wiki.connect.qq.com/%E4%BD%BF%E7%94%A8authorization_code%E6%8D%A2%E5%8F%96access_token
    const tokenUrl = new URL('https://graph.qq.com/oauth2.0/token');
    tokenUrl.searchParams.set('grant_type', 'authorization_code');
    tokenUrl.searchParams.set('client_id', appId);
    tokenUrl.searchParams.set('client_secret', appSecret);
    tokenUrl.searchParams.set('code', code);
    tokenUrl.searchParams.set('redirect_uri', redirectUri);

    const tokenRes = await fetch(tokenUrl.toString());
    const tokenText = await tokenRes.text();

    // 腾讯有些接口返回 form-urlencoded，有些返回 JSON，两种都兜底
    let tokenData;
    if (tokenText.trim().startsWith('{')) {
      tokenData = JSON.parse(tokenText);
    } else {
      const params = new URLSearchParams(tokenText);
      tokenData = Object.fromEntries(params.entries());
    }

    if (!tokenData.access_token || !tokenData.openid) {
      return res.status(400).json({
        error: 'token exchange failed',
        detail: tokenData.error_description || tokenData.error || tokenText,
      });
    }

    const { access_token, openid } = tokenData;

    // Step 2: 拿用户昵称、头像（scope=get_user_info 授权后可用）
    const userUrl = new URL('https://graph.qq.com/user/get_user_info');
    userUrl.searchParams.set('access_token', access_token);
    userUrl.searchParams.set('oauth_consumer_key', appId);
    userUrl.searchParams.set('openid', openid);

    const userRes = await fetch(userUrl.toString());
    const userData = await userRes.json();

    if (userData.ret !== 0) {
      // 用户信息拿不到不致命，openid 已经足够做身份标识
      return res.json({ openid, nick: null, avatar: null });
    }

    return res.json({
      openid,
      nick: userData.nickname || null,
      avatar: userData.figureurl_qq_2 || userData.figureurl_qq_1 || null,
    });
  } catch (err) {
    console.error('oauth error', err);
    return res.status(500).json({ error: 'internal', detail: err.message });
  }
}
