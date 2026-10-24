/**
 * 数据层：通过 GitHub Contents API 读写 data.json
 */
const ZMD = (function () {
  const C = window.ZMD_CONFIG;
  const API = `https://api.github.com/repos/${C.owner}/${C.repo}/contents/data.json?ref=${C.branch}`;
  let cache = null;
  let cacheSha = null;
  let cacheTime = 0;

  // 读取数据
  async function load(force) {
    if (!force && cache && Date.now() - cacheTime < 3000) return cache;
    const res = await fetch(API, {
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
    return data;
  }

  // 工具：随机ID
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // 工具：骰子
  function rollDice() {
    return Math.floor(Math.random() * 6) + 1;
  }

  // 工具：打乱数组
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  return { load, save, uid, rollDice, shuffle, get config() { return C; } };
})();
