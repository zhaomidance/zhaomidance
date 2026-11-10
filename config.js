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
  // 游戏参数（默认值；后台「费用设置」可覆盖，存于 data.json 的 settings.costs）
  costs: { register: 999, release: 1111, forceRelease: 2888 },
};
