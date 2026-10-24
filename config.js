/**
 * 配置：GitHub 仓库信息 & API Token
 * 数据存储在仓库的 data.json 文件中，通过 GitHub Contents API 读写
 */
window.ZMD_CONFIG = {
  // 仓库信息
  owner: 'zhaomidance',
  repo: 'zhaomidance',
  branch: 'main',
  // GitHub Personal Access Token（需有 repo 权限）
  // 注意：此 token 会暴露在前端代码中，仅用于本项目。
  // 如需更高安全性，可换成细粒度 token（仅允许访问本仓库 contents）
  token: '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',
  // 管理员密码（后台页面用）
  adminPassword: 'zhaomidance2024',
  // 游戏参数
  startBalance: 10000,
  costs: { register: 999, lock: 1314, divorce: 1111, forceUnbind: 5555 },
};
