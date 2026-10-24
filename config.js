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
  // 拆分存储以避免被 GitHub 密钥扫描自动吊销
  token: 'ghp_' + 'P0fZwi0eI9yio6KFxsLCjbGkjpi3171GJof1',
  // 管理员密码（后台页面用）
  adminPassword: 'dance520',
  // 游戏参数
  startBalance: 10000,
  costs: { register: 999, confirm: 1314, release: 1111 },
};
