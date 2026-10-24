/**
 * 蒙面舞会·婚配玩法 - 前端逻辑
 */
(function () {
  'use strict';

  // ---------- 配置 ----------
  // 后端 WebSocket 地址。
  // - 本地开发：留空，自动使用当前域名（ws://localhost:3000）
  // - 部署后：填写你的后端地址，例如 'wss://zhaomidance.onrender.com'
  //   也可在登录页长按"进入舞会"按钮设置自定义后端地址（存 localStorage）
  const BACKEND_URL = ''; // ← 部署后在这里填你的后端地址，如 'wss://xxx.onrender.com'

  function getWsUrl() {
    const custom = localStorage.getItem('zmd_backend');
    if (custom) return custom;
    if (BACKEND_URL) return BACKEND_URL;
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
  }

  // ---------- 状态 ----------
  let ws = null;
  let me = null; // { qq, majia, balance, status, partner, locked }
  let reconnectTimer = null;

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const loginPage = $('loginPage');
  const gamePage = $('gamePage');
  const qqInput = $('qqInput');
  const majiaInput = $('majiaInput');
  const loginBtn = $('loginBtn');

  // ---------- Toast ----------
  let toastTimer = null;
  function toast(msg, type) {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.className = 'toast', 2500);
  }

  // ---------- QQ 号自动获取 ----------
  function detectQQ() {
    // 1. URL 参数
    const urlQq = new URLSearchParams(location.search).get('qq');
    if (urlQq && /^\d{5,12}$/.test(urlQq)) return urlQq;

    // 2. localStorage 缓存
    const cache = localStorage.getItem('zmd_qq');
    if (cache && /^\d{5,12}$/.test(cache)) return cache;

    // 3. QQ WebView mqq bridge
    try {
      if (window.mqq) {
        // mqq.invoke 方式
        if (typeof mqq.invoke === 'function') {
          mqq.invoke('data', 'getQQNumber', function (res) {
            if (res && (res.qq_number || res.qq)) {
              const qq = res.qq_number || res.qq;
              if (/^\d{5,12}$/.test(qq)) fillQQ(qq);
            }
          });
        }
        // mqq.data 方式
        if (mqq.data && typeof mqq.data.getQQNumber === 'function') {
          mqq.data.getQQNumber(function (res) {
            if (res && (res.qq_number || res.qq)) {
              const qq = res.qq_number || res.qq;
              if (/^\d{5,12}$/.test(qq)) fillQQ(qq);
            }
          });
        }
      }
    } catch (e) { /* ignore */ }

    return null;
  }

  function fillQQ(qq) {
    qqInput.value = qq;
    qqInput.removeAttribute('readonly');
    qqInput.setAttribute('readonly', 'readonly');
    localStorage.setItem('zmd_qq', qq);
    $('qqHint').textContent = '已自动获取 QQ 号';
    $('qqHint').style.color = 'var(--green)';
  }

  // ---------- 页面切换 ----------
  function showPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    page.classList.add('active');
  }

  function showState(id) {
    document.querySelectorAll('.state-panel').forEach(p => p.classList.remove('active'));
    const el = $(id);
    if (el) el.classList.add('active');
  }

  // ---------- WebSocket ----------
  function connect() {
    ws = new WebSocket(getWsUrl());
    ws.onopen = () => {
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (me) send({ type: 'login', qq: me.qq, majia: me.majia });
    };
    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      handleMsg(msg);
    };
    ws.onclose = () => {
      // 重连
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(connect, 2000);
      }
    };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }

  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    } else {
      toast('连接已断开，正在重连...');
    }
  }

  // ---------- 消息处理 ----------
  function handleMsg(msg) {
    switch (msg.type) {
      case 'login_ok':
        me = msg.player;
        updateTop();
        renderState();
        showPage(gamePage);
        break;

      case 'error':
        toast(msg.message, 'error');
        break;

      case 'online_count':
        $('online').textContent = '👥 ' + msg.count;
        break;

      case 'balance_update':
        if (me) { me.balance = msg.balance; updateTop(); }
        break;

      case 'queue_update':
        if (me) me.status = 'queue';
        $('queuePos').textContent = msg.position;
        $('queueSize').textContent = msg.queue_size;
        showState('stateQueue');
        break;

      case 'left_queue':
        if (me) me.status = 'idle';
        showState('stateIdle');
        break;

      case 'matched':
        if (me) { me.status = 'rolling'; me.partner = msg.partner; }
        $('rollingPartner').textContent = msg.partner.majia;
        $('myDice').textContent = '?';
        $('partnerDice').textContent = '?';
        $('rollStatus').textContent = '点击下方按钮摇骰子';
        $('rollBtn').disabled = false;
        showState('stateRolling');
        break;

      case 'dice_rolled':
        animateDice('myDice', msg.mine);
        $('rollStatus').textContent = msg.partnerRolled ? '双方已摇，正在结算...' : '等待舞伴摇骰子...';
        $('rollBtn').disabled = true;
        break;

      case 'partner_rolled':
        $('rollStatus').textContent = '舞伴已摇，你也快摇吧！';
        break;

      case 'dice_result':
        animateDice('myDice', msg.mine);
        animateDice('partnerDice', msg.partner);
        if (msg.success) {
          $('rollStatus').textContent = '🎉 点数相同！婚配成功！';
          $('rollStatus').style.color = 'var(--green)';
        } else {
          $('rollStatus').textContent = '点数不同...';
          $('rollStatus').style.color = 'var(--red)';
        }
        break;

      case 'marriage_update':
        if (me) {
          me.status = 'married';
          me.partner = msg.partner;
          me.locked = msg.locked;
        }
        renderMarried();
        showState('stateMarried');
        break;

      case 'locked':
        toast('🔒 关系已锁定！', 'success');
        if (me) me.locked = true;
        renderMarried();
        break;

      case 'divorce_requested':
        if (msg.side === 'self') {
          toast('已发起离婚申请，等待对方回应...');
          $('marriageTip').textContent = '已向舞伴发起离婚申请，等待回应...';
        } else {
          // 对方申请离婚
          $('divorceModalText').textContent = `舞伴「${msg.fromMajia}」向你申请离婚，是否同意？`;
          $('divorceModal').style.display = 'flex';
        }
        break;

      case 'divorce_refused':
        toast(`舞伴「${msg.byMajia}」拒绝了你的离婚申请`, 'error');
        $('marriageTip').textContent = '对方拒绝离婚，可使用「强制解除」';
        break;

      case 'divorce_refuse_sent':
        toast('已拒绝离婚申请');
        break;

      case 'divorced':
        toast('💔 婚配关系已解除', 'error');
        if (me) { me.status = 'idle'; me.partner = null; me.locked = false; }
        $('marriageTip').textContent = '';
        showState('stateIdle');
        break;

      case 'reroll':
        if (me) { me.status = 'rolling'; me.rerolls = msg.rerolls; }
        $('myDice').textContent = '?';
        $('partnerDice').textContent = '?';
        $('rollStatus').textContent = `第 ${msg.rerolls}/${msg.max} 次摇骰，点击按钮`;
        $('rollStatus').style.color = '';
        $('rollBtn').disabled = false;
        showState('stateRolling');
        break;

      case 'partner_choice':
        $('waitingPartner').style.display = 'block';
        $('waitingPartner').textContent = '舞伴已选择，等待你...';
        break;

      case 'partner_offline':
        toast('舞伴已离线，婚配解除');
        if (me) { me.status = 'idle'; me.partner = null; }
        showState('stateIdle');
        break;

      case 'kicked':
        toast(msg.message, 'error');
        setTimeout(() => location.reload(), 1500);
        break;

      case 'pong': break;
    }
  }

  // ---------- 渲染 ----------
  function updateTop() {
    if (!me) return;
    $('topMajia').textContent = me.majia;
    $('balance').textContent = '💎 ' + me.balance;
  }

  function renderState() {
    if (!me) return;
    switch (me.status) {
      case 'idle': showState('stateIdle'); break;
      case 'queue': showState('stateQueue'); break;
      case 'rolling': showState('stateRolling'); break;
      case 'married': renderMarried(); showState('stateMarried'); break;
      default: showState('stateIdle');
    }
  }

  function renderMarried() {
    if (!me || !me.partner) return;
    $('myName').textContent = me.majia;
    $('spouseName').textContent = me.partner.majia;
    const lockEl = $('lockStatus');
    if (me.locked) {
      lockEl.textContent = '🔒 关系已锁定';
      lockEl.className = 'couple-status locked';
      $('lockBtn').disabled = true;
    } else {
      lockEl.textContent = '关系未锁定，可被替换';
      lockEl.className = 'couple-status';
      $('lockBtn').disabled = false;
    }
  }

  function animateDice(elId, value) {
    const el = $(elId);
    el.classList.remove('rolling');
    void el.offsetWidth;
    el.classList.add('rolling');
    let n = 0;
    const timer = setInterval(() => {
      el.textContent = (n % 6) + 1;
      n++;
    }, 60);
    setTimeout(() => {
      clearInterval(timer);
      el.textContent = value;
    }, 500);
  }

  // ---------- 事件绑定 ----------
  function bindEvents() {
    // 登录
    loginBtn.addEventListener('click', () => {
      const qq = qqInput.value.trim();
      const majia = majiaInput.value.trim();
      if (!qq) { toast('请输入 QQ 号', 'error'); return; }
      if (!/^\d{5,12}$/.test(qq)) { toast('QQ 号格式不正确', 'error'); return; }
      if (!majia) { toast('请输入马甲', 'error'); return; }
      if (majia.length !== 2) { toast('马甲必须是两个字', 'error'); return; }

      localStorage.setItem('zmd_qq', qq);
      localStorage.setItem('zmd_majia', majia);

      me = { qq, majia };
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        connect();
      } else {
        send({ type: 'login', qq, majia });
      }
    });

    majiaInput.addEventListener('input', () => {
      majiaInput.value = majiaInput.value.slice(0, 2);
    });

    // 长按"进入舞会"按钮可设置自定义后端地址
    let pressTimer = null;
    const startPress = (e) => {
      pressTimer = setTimeout(() => {
        const cur = localStorage.getItem('zmd_backend') || BACKEND_URL || '(默认)';
        const url = prompt('设置后端 WebSocket 地址（留空恢复默认）', cur === '(默认)' ? '' : cur);
        if (url !== null) {
          if (url.trim()) localStorage.setItem('zmd_backend', url.trim());
          else localStorage.removeItem('zmd_backend');
          toast('后端地址已更新');
        }
      }, 1500);
    };
    const cancelPress = () => clearTimeout(pressTimer);
    loginBtn.addEventListener('touchstart', startPress);
    loginBtn.addEventListener('touchend', cancelPress);
    loginBtn.addEventListener('touchmove', cancelPress);
    loginBtn.addEventListener('mousedown', startPress);
    loginBtn.addEventListener('mouseup', cancelPress);
    loginBtn.addEventListener('mouseleave', cancelPress);

    // 报名
    $('joinQueueBtn').addEventListener('click', () => send({ type: 'join_queue' }));
    $('leaveQueueBtn').addEventListener('click', () => send({ type: 'leave_queue' }));

    // 摇骰子
    $('rollBtn').addEventListener('click', () => {
      $('rollBtn').disabled = true;
      send({ type: 'roll_dice' });
    });

    // 骰子不同时的选择
    $('rerollBtn').addEventListener('click', () => {
      $('waitingPartner').style.display = 'block';
      $('waitingPartner').textContent = '你选择了重摇，等待舞伴...';
      send({ type: 'choice', choice: 'reroll' });
    });
    $('switchBtn').addEventListener('click', () => {
      $('waitingPartner').style.display = 'block';
      $('waitingPartner').textContent = '你选择了换人，等待舞伴...';
      send({ type: 'choice', choice: 'switch' });
    });

    // 婚配操作
    $('lockBtn').addEventListener('click', () => send({ type: 'lock' }));
    $('divorceBtn').addEventListener('click', () => {
      if (confirm('确定申请离婚？将扣除 1111 灵石（对方不同意则不退）')) {
        send({ type: 'divorce' });
      }
    });
    $('forceBtn').addEventListener('click', () => {
      if (confirm('确定强制解除？将扣除 5555 灵石，且无需对方同意')) {
        send({ type: 'force_unbind' });
      }
    });

    // 离婚弹窗
    $('agreeDivorceBtn').addEventListener('click', () => {
      $('divorceModal').style.display = 'none';
      send({ type: 'divorce_respond', agree: true });
    });
    $('refuseDivorceBtn').addEventListener('click', () => {
      $('divorceModal').style.display = 'none';
      send({ type: 'divorce_respond', agree: false });
    });

    // 规则
    $('showRulesBtn').addEventListener('click', () => $('rulesModal').style.display = 'flex');
    $('closeRulesBtn').addEventListener('click', () => $('rulesModal').style.display = 'none');
  }

  // ---------- 初始化 ----------
  function init() {
    bindEvents();

    // 尝试自动获取 QQ
    const qq = detectQQ();
    if (qq) {
      fillQQ(qq);
    } else {
      qqInput.removeAttribute('readonly');
      qqInput.placeholder = '请输入你的 QQ 号';
    }

    // 恢复马甲
    const cacheMajia = localStorage.getItem('zmd_majia');
    if (cacheMajia) majiaInput.value = cacheMajia;
  }

  init();
})();
