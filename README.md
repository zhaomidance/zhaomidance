# 🎭 蒙面舞会 · 婚配玩法

多人在线匿名婚配匹配网页，可直接在 QQ 内打开。

## 功能

- 登录自动获取 QQ 号（QQ WebView），输入二字马甲进入
- 报名匹配（999 灵石）→ 摇骰子配对（点数相同即婚配）
- 婚配操作：锁定 1314 / 离婚 1111 / 强制解除 5555
- 实时在线人数、灵石余额

## 本地运行

```bash
npm install
node server.js
# 打开 http://localhost:3000
```

## 部署

### 1. 前端（GitHub Pages）

本仓库已推送到 GitHub，在仓库设置中开启 **Settings → Pages → Source: main branch**，
前端即可通过 `https://<你的组织名>.github.io/<仓库名>/` 访问。

### 2. 后端（WebSocket 服务）

GitHub Pages 不能运行 Node，需单独部署后端。推荐 **Render**（免费）：

1. 登录 [render.com](https://render.com)
2. New → Blueprint → 选择本仓库（含 `render.yaml`）
3. 等待部署完成，得到后端地址如 `https://zhaomidance-server.onrender.com`
4. 修改 `app.js` 顶部的 `BACKEND_URL` 为 `wss://zhaomidance-server.onrender.com`
5. 重新推送代码即可

> Render 免费实例约 15 分钟无请求会休眠，首次访问需等几十秒唤醒。

### 3. QQ 内打开

将前端 GitHub Pages 链接发到 QQ 群，点击即可在 QQ 内置浏览器打开。
- QQ 号会自动获取（需页面在 QQ 内打开）
- 若未获取到，可手动输入

## 规则

| 操作 | 灵石 | 说明 |
|------|------|------|
| 报名 | 999 | 进入匹配队列，匿名 |
| 锁定 | 1314 | 锁定婚配关系，不可被替换 |
| 离婚 | 1111 | 申请离婚，需对方同意 |
| 强制解除 | 5555 | 单方面解除，无需同意 |

- 灵石费用一经缴纳不退
- 一轮婚配解除后，需重新报名（999）开启新一轮
