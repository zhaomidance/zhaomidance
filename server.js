/**
 * 蒙面舞会·婚配玩法 - WebSocket 后端
 * 协议：JSON 消息，type 字段分发
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname);

// ---------- 游戏常量 ----------
const COSTS = {
  register: 999,     // 报名
  lock: 1314,        // 锁定
  divorce: 1111,     // 离婚
  forceUnbind: 5555, // 强制解除
};
const START_BALANCE = 10000;
const MAX_REROLLS = 5; // 同一对舞伴最多重摇次数

// ---------- 全局状态 ----------
const players = new Map();   // qq -> player object
const queue = [];            // 等待匹配的 qq 列表
const marriages = new Map(); // qq -> marriage object
const pendingDivorce = new Map(); // qq -> { target } 发起的离婚请求

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function now() {
  return Date.now();
}

// ---------- HTTP 静态服务 ----------
const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(PUBLIC_DIR, urlPath);
  // 防止路径穿越
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
    };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server });

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function sendTo(qq, obj) {
  const p = players.get(qq);
  if (p && p.ws) send(p.ws, obj);
}

function broadcast(obj) {
  for (const p of players.values()) {
    if (p.ws) send(p.ws, obj);
  }
}

function broadcastOnline() {
  const count = players.size;
  broadcast({ type: 'online_count', count });
}

function getPublicPlayer(p) {
  return {
    qq: p.qq,
    majia: p.majia,
    balance: p.balance,
    status: p.status,
    partner: p.partner ? { qq: p.partner.qq, majia: p.partner.majia } : null,
    locked: p.locked,
  };
}

// ---------- 匹配逻辑 ----------
function tryMatch() {
  while (queue.length >= 2) {
    const aQq = queue.shift();
    const bQq = queue.shift();
    const a = players.get(aQq);
    const b = players.get(bQq);
    if (!a || !b) continue;
    if (a.status !== 'queue' || b.status !== 'queue') continue;

    const roundId = uid();
    a.status = 'rolling';
    b.status = 'rolling';
    a.partner = b;
    b.partner = a;
    a.roundId = roundId;
    b.roundId = roundId;
    a.rerolls = 0;
    b.rerolls = 0;
    a.dice = null;
    b.dice = null;

    sendTo(aQq, { type: 'matched', roundId, partner: { qq: b.qq, majia: b.majia } });
    sendTo(bQq, { type: 'matched', roundId, partner: { qq: a.qq, majia: a.majia } });
  }
}

function handleRollDice(qq) {
  const p = players.get(qq);
  if (!p || p.status !== 'rolling' || !p.partner) return;
  if (p.dice !== null) {
    sendTo(qq, { type: 'error', message: '你已经摇过了，等待对方...' });
    return;
  }
  p.dice = Math.floor(Math.random() * 6) + 1;

  const partner = p.partner;
  // 通知本人
  sendTo(qq, { type: 'dice_rolled', mine: p.dice, partnerRolled: partner.dice !== null });
  // 通知对方：你已摇
  sendTo(partner.qq, { type: 'partner_rolled' });

  if (partner.dice !== null) {
    // 双方都摇了
    const success = p.dice === partner.dice;
    const result = {
      type: 'dice_result',
      mine: p.dice,
      partner: partner.dice,
      success,
    };
    sendTo(qq, result);
    sendTo(partner.qq, { ...result, mine: partner.dice, partner: p.dice });

    if (success) {
      // 婚配成功
      p.status = 'married';
      partner.status = 'married';
      p.locked = false;
      partner.locked = false;
      p.marriedAt = now();
      partner.marriedAt = now();
      marriages.set(qq, partner.qq);
      marriages.set(partner.qq, qq);
      const msg = { type: 'marriage_update', partner: { qq: partner.qq, majia: partner.majia }, locked: false };
      sendTo(qq, msg);
      sendTo(partner.qq, { type: 'marriage_update', partner: { qq: p.qq, majia: p.majia }, locked: false });
    } else {
      p.status = 'deciding';
      partner.status = 'deciding';
      p.choice = null;
      partner.choice = null;
    }
  }
}

function handleChoice(qq, choice) {
  const p = players.get(qq);
  if (!p || p.status !== 'deciding' || !p.partner) return;
  if (!['reroll', 'switch'].includes(choice)) return;
  if (p.choice) return;
  p.choice = choice;

  const partner = p.partner;
  sendTo(partner.qq, { type: 'partner_choice', choice });

  if (partner.choice) {
    if (p.choice === 'reroll' && partner.choice === 'reroll') {
      // 都选择重摇
      if (p.rerolls >= MAX_REROLLS) {
        // 重摇次数用完，强制换人
        sendTo(qq, { type: 'error', message: '重摇次数已用完，系统自动为你更换舞伴' });
        sendTo(partner.qq, { type: 'error', message: '重摇次数已用完，系统自动为你更换舞伴' });
        backToQueue(qq); backToQueue(partner.qq);
      } else {
        p.rerolls++;
        partner.rerolls++;
        p.dice = null; partner.dice = null;
        p.choice = null; partner.choice = null;
        p.status = 'rolling'; partner.status = 'rolling';
        sendTo(qq, { type: 'reroll', rerolls: p.rerolls, max: MAX_REROLLS });
        sendTo(partner.qq, { type: 'reroll', rerolls: partner.rerolls, max: MAX_REROLLS });
      }
    } else {
      // 至少一个选择换人 -> 都回到队列
      backToQueue(qq);
      backToQueue(partner.qq);
    }
  }
}

function backToQueue(qq) {
  const p = players.get(qq);
  if (!p) return;
  p.partner = null;
  p.roundId = null;
  p.dice = null;
  p.choice = null;
  p.rerolls = 0;
  if (p.status === 'queue') return;
  p.status = 'queue';
  queue.push(qq);
  sendTo(qq, { type: 'queue_update', position: queue.length, queue_size: queue.length });
  tryMatch();
}

function leaveQueue(qq) {
  const idx = queue.indexOf(qq);
  if (idx >= 0) queue.splice(idx, 1);
  const p = players.get(qq);
  if (p) {
    p.status = 'idle';
    sendTo(qq, { type: 'left_queue' });
  }
}

// ---------- 婚配操作 ----------
function checkFee(qq, amount, action) {
  const p = players.get(qq);
  if (!p) return false;
  if (p.balance < amount) {
    sendTo(qq, { type: 'error', message: `灵石不足，${action}需要${amount}灵石，你只有${p.balance}` });
    return false;
  }
  return true;
}

function deduct(qq, amount) {
  const p = players.get(qq);
  if (!p) return;
  p.balance -= amount;
  sendTo(qq, { type: 'balance_update', balance: p.balance });
}

function handleLock(qq) {
  const p = players.get(qq);
  if (!p || p.status !== 'married' || !p.partner) {
    sendTo(qq, { type: 'error', message: '当前没有婚配关系' }); return;
  }
  if (p.locked) { sendTo(qq, { type: 'error', message: '关系已锁定' }); return; }
  if (!checkFee(qq, COSTS.lock, '锁定')) return;
  deduct(qq, COSTS.lock);
  p.locked = true;
  p.partner.locked = true;
  sendTo(qq, { type: 'locked', by: 'self', balance: p.balance });
  sendTo(p.partner.qq, { type: 'locked', by: 'partner', partnerMajia: p.majia, balance: p.partner.balance });
}

function handleDivorceRequest(qq) {
  const p = players.get(qq);
  if (!p || p.status !== 'married' || !p.partner) {
    sendTo(qq, { type: 'error', message: '当前没有婚配关系' }); return;
  }
  if (!checkFee(qq, COSTS.divorce, '离婚')) return;
  const partner = p.partner;
  if (pendingDivorce.has(qq)) { sendTo(qq, { type: 'error', message: '你已发起离婚请求' }); return; }

  pendingDivorce.set(qq, { target: partner.qq, at: now() });
  deduct(qq, COSTS.divorce); // 申请即扣费
  sendTo(qq, { type: 'divorce_requested', side: 'self', balance: p.balance });
  sendTo(partner.qq, { type: 'divorce_requested', side: 'partner', fromMajia: p.majia, balance: partner.balance });
}

function handleDivorceRespond(qq, agree) {
  const p = players.get(qq);
  if (!p || p.status !== 'married' || !p.partner) return;
  const partner = p.partner;
  // 找到谁发起的
  const requesterQq = pendingDivorce.has(partner.qq) ? partner.qq : (pendingDivorce.has(qq) ? qq : null);
  if (!requesterQq) { sendTo(qq, { type: 'error', message: '没有待处理的离婚请求' }); return; }

  const requester = players.get(requesterQq);
  if (!requester) return;

  if (agree) {
    dissolveMarriage(p.qq, partner.qq, 'divorce');
    pendingDivorce.delete(requesterQq);
  } else {
    // 拒绝，退还申请者费用？规则说费用不退。那就不退。
    sendTo(requester.qq, { type: 'divorce_refused', byMajia: p.majia });
    sendTo(qq, { type: 'divorce_refuse_sent' });
    pendingDivorce.delete(requesterQq);
  }
}

function handleForceUnbind(qq) {
  const p = players.get(qq);
  if (!p || p.status !== 'married' || !p.partner) {
    sendTo(qq, { type: 'error', message: '当前没有婚配关系' }); return;
  }
  if (!checkFee(qq, COSTS.forceUnbind, '强制解除')) return;
  const partner = p.partner;
  deduct(qq, COSTS.forceUnbind);
  pendingDivorce.delete(qq);
  pendingDivorce.delete(partner.qq);
  dissolveMarriage(p.qq, partner.qq, 'force');
}

function dissolveMarriage(qqA, qqB, reason) {
  const a = players.get(qqA);
  const b = players.get(qqB);
  if (a) {
    a.status = 'idle';
    a.partner = null;
    a.locked = false;
    a.marriedAt = null;
    marriages.delete(qqA);
    sendTo(qqA, { type: 'divorced', reason, balance: a.balance });
  }
  if (b) {
    b.status = 'idle';
    b.partner = null;
    b.locked = false;
    b.marriedAt = null;
    marriages.delete(qqB);
    sendTo(qqB, { type: 'divorced', reason, balance: b.balance });
  }
}

// ---------- 消息分发 ----------
wss.on('connection', (ws) => {
  let currentQq = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    const { type } = msg;

    if (type === 'login') {
      const { qq, majia } = msg;
      if (!qq || !majia) { send(ws, { type: 'error', message: 'QQ号和马甲必填' }); return; }
      if (majia.length !== 2) { send(ws, { type: 'error', message: '马甲必须是两个字' }); return; }

      // 同QQ重复登录 -> 踢掉旧连接
      const old = players.get(qq);
      if (old && old.ws) {
        send(old.ws, { type: 'kicked', message: '你的账号在别处登录了' });
        old.ws.close();
      }

      const player = old || {
        qq, majia, balance: START_BALANCE, status: 'idle',
        partner: null, locked: false, dice: null, choice: null, rerolls: 0,
      };
      player.majia = majia;
      player.ws = ws;
      players.set(qq, player);
      currentQq = qq;

      send(ws, { type: 'login_ok', player: getPublicPlayer(player) });
      broadcastOnline();
      return;
    }

    // 后续操作需要已登录
    if (!currentQq || !players.has(currentQq)) {
      send(ws, { type: 'error', message: '请先登录' }); return;
    }
    const p = players.get(currentQq);

    switch (type) {
      case 'join_queue':
        if (p.status === 'married') { send(ws, { type: 'error', message: '你已有婚配，需先解除' }); break; }
        if (p.status === 'queue' || p.status === 'rolling' || p.status === 'deciding') {
          send(ws, { type: 'error', message: '你已在匹配中' }); break;
        }
        if (!checkFee(currentQq, COSTS.register, '报名')) break;
        deduct(currentQq, COSTS.register);
        p.status = 'queue';
        queue.push(currentQq);
        send(ws, { type: 'queue_update', position: queue.length, queue_size: queue.length });
        tryMatch();
        break;

      case 'leave_queue':
        leaveQueue(currentQq);
        break;

      case 'roll_dice':
        handleRollDice(currentQq);
        break;

      case 'choice':
        handleChoice(currentQq, msg.choice);
        break;

      case 'lock':
        handleLock(currentQq);
        break;

      case 'divorce':
        handleDivorceRequest(currentQq);
        break;

      case 'divorce_respond':
        handleDivorceRespond(currentQq, !!msg.agree);
        break;

      case 'force_unbind':
        handleForceUnbind(currentQq);
        break;

      case 'ping':
        send(ws, { type: 'pong' });
        break;
    }
  });

  ws.on('close', () => {
    if (!currentQq) return;
    const p = players.get(currentQq);
    if (!p) return;
    p.ws = null;
    // 从队列移除
    const idx = queue.indexOf(currentQq);
    if (idx >= 0) queue.splice(idx, 1);
    // 如果在匹配/婚配中，标记离线（暂不解散，保留状态，等重连）
    if (p.status === 'queue' || p.status === 'rolling' || p.status === 'deciding') {
      p.status = 'idle';
      p.partner = null;
    }
    // 玩家数据保留 5 分钟，便于重连
    setTimeout(() => {
      const cur = players.get(currentQq);
      if (cur && !cur.ws) {
        // 清理婚配
        if (cur.partner) {
          const partner = cur.partner;
          partner.partner = null;
          partner.status = 'idle';
          partner.locked = false;
          marriages.delete(partner.qq);
          sendTo(partner.qq, { type: 'partner_offline' });
        }
        marriages.delete(currentQq);
        players.delete(currentQq);
        broadcastOnline();
      }
    }, 5 * 60 * 1000);
    broadcastOnline();
  });
});

server.listen(PORT, () => {
  console.log(`🎭 蒙面舞会服务启动: http://localhost:${PORT}`);
});
