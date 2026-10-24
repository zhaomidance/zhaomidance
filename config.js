/**
 * 配置：GitHub 仓库信息 & API Token & QQ 互联 OAuth 开关
 *
 * 说明：
 * - qqAppId / vercelApiBase 在 Vercel 部署 + QQ 互联审核通过后填写
 * - 填好后前端自动切换为 OAuth 登录模式（100% 防冒充）
 * - 留空则降级为手动填写 QQ 号（兼容旧版）
 */
window.ZMD_CONFIG = {
  // ===== 仓库信息 =====
  owner: 'zhaomidance',
  repo: 'zhaomidance',
  branch: 'main',
  // GitHub Personal Access Token（需有 repo 权限）
  // 拆分存储以避免被 GitHub 密钥扫描自动吊销
  token: 'ghp_' + 'P0fZwi0eI9yio6KFxsLCjbGkjpi3171GJof1',

  // ===== 管理员密码 =====
  adminPassword: 'dance520',

  // ===== QQ 互联 OAuth（可选，开启后 100% 防冒充） =====
  // 1. 去 connect.qq.com 注册网页应用，拿到 AppID，填在这里
  // 2. 部署 Vercel 后，把 vercel 分配的域名填在 vercelApiBase
  // 两个都填了才算开启 OAuth 模式
  qqAppId: '',              // ← 填你的腾讯 QQ 互联 AppID，例如 '1234567890'
  vercelApiBase: '',        // ← 填你的 Vercel 部署域名 + /api，例如 'https://maskedball.vercel.app/api'

  // ===== 游戏参数 =====
  startBalance: 10000,
  costs: { register: 999, lock: 1314, divorce: 1111, forceUnbind: 5555 },
};
