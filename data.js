/**
 * 数据层：通过 GitHub Contents API 读写 data.json
 */
const ZMD = (function () {
  const C = window.ZMD_CONFIG;
  const API = `https://api.github.com/repos/${C.owner}/${C.repo}/contents/data.json?ref=${C.branch}`;
  let cache = null;
  let cacheSha = null;
  let cacheTime = 0;
  let lastWrite = 0;

  // 读取数据
  async function load(force) {
    // 刚写入后优先用本地最新数据，避免读到 GitHub 的旧缓存
    if (lastWrite && Date.now() - lastWrite < 5000) return cache;
    if (!force && cache && Date.now() - cacheTime < 10000) return cache;
    const res = await fetch(API + '&_=' + Date.now(), {
      cache: 'no-store',
      headers: {
        Authorization: `token ${C.token}`,
        Accept: 'application/vnd.github+json',
      },
    });
    if (!res.ok) throw new Error('读取数据失败: ' + res.status);
    const json = await res.json();
    cacheSha = json.sha;
    cache = JSON.parse(decodeURIComponent(escape(atob(json.content))));
    cacheTime = Date.now();
    return cache;
  }

  // 写入数据
  async function save(data, message) {
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
    const body = {
      message: message || 'update game data',
      content: content,
      sha: cacheSha,
      branch: C.branch,
    };
    const res = await fetch(API.split('?')[0], {
      method: 'PUT',
      headers: {
        Authorization: `token ${C.token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error('写入失败: ' + (err.message || res.status));
    }
    const json = await res.json();
    cacheSha = json.content.sha;
    cache = data;
    cacheTime = Date.now();
    lastWrite = Date.now();
    return data;
  }

  // 工具：随机ID
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // 工具：打乱数组
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ===== 缘分匹配算法（参考许愿偏好，不使用骰子） =====
  // 中文关键词提取：去标点空白后按 2 字滑窗切分
  function keywords(text) {
    if (!text) return new Set();
    const clean = String(text)
      .replace(/[\s，,。.、；;：:！!？?~～\-—_/|\\()（）\[\]【】"'“”‘’]/g, '');
    const set = new Set();
    for (let i = 0; i + 2 <= clean.length; i++) set.add(clean.slice(i, i + 2));
    if (clean.length === 1) set.add(clean);
    return set;
  }

  // 缘分分：双方"许愿"与对方"自我描述"的契合度 + 双方许愿相似度
  function affinity(a, b) {
    const aWish = keywords(a.wish);
    const bWish = keywords(b.wish);
    const aAbout = keywords(a.about);
    const bAbout = keywords(b.about);
    let score = 0;
    aWish.forEach(k => { if (bAbout.has(k)) score += 3; }); // 我的许愿，他/她的样子
    bWish.forEach(k => { if (aAbout.has(k)) score += 3; }); // 他/她的许愿，我的样子
    aWish.forEach(k => { if (bWish.has(k)) score += 1; });  // 彼此期许相似
    return score;
  }

  // 全局缘分配对：所有男女组合按缘分分排序后贪心配对
  // 以二字马甲作为玩家唯一主键
  function fateMatch(males, females) {
    const cand = [];
    for (const m of males) {
      for (const f of females) {
        cand.push({ m, f, s: affinity(m, f) + Math.random() * 2.2 });
      }
    }
    cand.sort((x, y) => y.s - x.s);
    const usedM = new Set(), usedF = new Set();
    const pairs = [];
    for (const c of cand) {
      if (usedM.has(c.m.majia) || usedF.has(c.f.majia)) continue;
      usedM.add(c.m.majia); usedF.add(c.f.majia);
      pairs.push({ a: c.m, b: c.f, score: affinity(c.m, c.f) });
    }
    return pairs;
  }

  return {
    load, save, uid, shuffle,
    keywords, affinity, fateMatch,
    get config() { return C; }
  };
})();
