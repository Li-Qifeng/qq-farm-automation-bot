#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { ApiClient, loadConfig, saveConfig, clearConfig } from './utils/client.js';
import { formatTable, formatJson, formatSimple, formatAutomationStatus, formatFarmStatus, formatConnected, printSuccess, printError, printInfo, printWarn } from './utils/format.js';

const program = new Command();

program
  .name('qq-farm')
  .description('QQ 农场自动化 CLI - 覆盖所有 WebUI 端点')
  .version('1.0.0')
  .option('-s, --server <url>', '服务器地址', 'http://localhost:3007')
  .option('-j, --json', 'JSON 输出模式')
  .option('--account <id>', '账号 ID (x-account-id)');

// Helper: get client
function getClient(): ApiClient {
  const cfg = loadConfig();
  if (!cfg) throw new Error('未登录。请先运行: qq-farm login');
  return new ApiClient(cfg.serverUrl, cfg.token);
}

// Helper: resolve account id
function getAccountId(): string | undefined {
  const opts = program.opts();
  return opts.account;
}

// Helper: output
function output(data: any, tableHeaders?: string[], tableRows?: string[][]) {
  const opts = program.opts();
  if (opts.json) {
    console.log(formatJson(data));
  } else if (tableHeaders && tableRows) {
    console.log(formatTable(tableHeaders, tableRows));
  } else {
    console.log(formatJson(data));
  }
}

// ======================== AUTH ========================
const authCmd = program.command('auth').description('认证管理');

authCmd
  .command('login')
  .description('登录到服务器')
  .argument('<username>', '用户名')
  .argument('<password>', '密码')
  .action(async (username, password) => {
    try {
      const opts = program.opts();
      const client = new ApiClient(opts.server, '');
      // Use raw login
      const res = await fetch(`${opts.server}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json();
      if (json.ok === false) throw new Error(json.error);
      const token = json.data?.token || json.token;
      saveConfig({ serverUrl: opts.server, token, username });
      printSuccess(`登录成功 (${username})`);
    } catch (e: any) {
      printError(`登录失败: ${e.message}`);
      process.exit(1);
    }
  });

authCmd
  .command('status')
  .description('查看登录状态')
  .action(async () => {
    const cfg = loadConfig();
    if (!cfg) {
      printInfo('未登录');
      return;
    }
    const client = new ApiClient(cfg.serverUrl, cfg.token);
    try {
      const res = await client.validateToken();
      printSuccess(`已登录 (${cfg.username})`);
      printInfo(`服务器: ${cfg.serverUrl}`);
    } catch {
      printWarn('Token 已过期，请重新登录');
    }
  });

authCmd
  .command('logout')
  .description('登出')
  .action(async () => {
    try {
      const client = getClient();
      await client.logout();
    } catch {}
    clearConfig();
    printSuccess('已登出');
  });

// ======================== ACCOUNT ========================
const accCmd = program.command('account').description('账号管理').alias('acc');

accCmd
  .command('list')
  .description('列出所有账号')
  .action(async () => {
    const client = getClient();
    const res = await client.getAccounts();
    const accounts = res.data?.accounts || res.accounts || [];
    output(res,
      ['ID', '名称', '平台', '状态', '昵称', 'Lv', '金币'],
      accounts.map((a: any) => [
        String(a.id),
        a.name || '-',
        a.platform || 'qq',
        a.status || '-',
        a.nick || '-',
        String(a.level || '-'),
        a.gold ? Number(a.gold).toLocaleString() : '-',
      ])
    );
  });

accCmd
  .command('add')
  .description('添加账号')
  .argument('<code>', '登录 code')
  .option('-n, --name <name>', '账号名称')
  .option('-p, --platform <platform>', '平台 (qq/wechat)', 'qq')
  .option('-q, --qq <qq>', 'QQ号')
  .option('-d, --device-id <id>', '设备ID')
  .action(async (code, options) => {
    const client = getClient();
    const body: any = { code, platform: options.platform };
    if (options.name) body.name = options.name;
    if (options.qq) body.qq = options.qq;
    if (options.deviceId) body.device_id = options.deviceId;
    const res = await client.addAccount(body);
    printSuccess(`账号已添加 (ID: ${res.data?.id || '?'})`);
  });

accCmd
  .command('start')
  .description('启动账号')
  .argument('<id>', '账号 ID')
  .action(async (id) => {
    const client = getClient();
    await client.startAccount(id);
    printSuccess(`账号 ${id} 已启动`);
  });

accCmd
  .command('stop')
  .description('停止账号')
  .argument('<id>', '账号 ID')
  .action(async (id) => {
    const client = getClient();
    await client.stopAccount(id);
    printSuccess(`账号 ${id} 已停止`);
  });

accCmd
  .command('remove')
  .description('删除账号')
  .argument('<id>', '账号 ID')
  .action(async (id) => {
    const client = getClient();
    await client.deleteAccount(id);
    printSuccess(`账号 ${id} 已删除`);
  });

accCmd
  .command('rename')
  .description('重命名账号')
  .argument('<id>', '账号 ID')
  .argument('<name>', '新名称')
  .action(async (id, name) => {
    const client = getClient();
    await client.remarkAccount({ id, name });
    printSuccess(`账号重命名为: ${name}`);
  });

accCmd
  .command('logs')
  .description('查看账号日志')
  .option('-l, --limit <n>', '条数', '100')
  .action(async (options) => {
    const client = getClient();
    const res = await client.getAccountLogs(parseInt(options.limit));
    const logs = res.data || res.logs || [];
    output(res,
      ['时间', '类型', '内容'],
      logs.map((l: any) => [
        l.time || l.ts || '-',
        l.tag || l.type || '-',
        (l.msg || l.message || '').slice(0, 80),
      ])
    );
  });

// ======================== STATUS ========================
const statusCmd = program.command('status').description('查看状态');

statusCmd
  .command('farm')
  .description('查看农场状态')
  .action(async () => {
    const aid = getAccountId();
    if (!aid) { printError('需要 --account <id>'); process.exit(1); }
    const client = getClient();
    const res = await client.getStatus(aid);
    const s = res.data?.status || res.status || {};
    const ops = res.data?.operations || res.operations || {};
    output(res);
    console.log(formatFarmStatus(s));
    if (res.data?.connection) {
      console.log(formatConnected(res.data.connection.connected));
    }
    if (Object.keys(ops).length > 0) {
      console.log(chalk.bold('\n操作统计:'));
      for (const [k, v] of Object.entries(ops)) {
        console.log(`  ${k}: ${v}`);
      }
    }
    if (res.data?.uptime) {
      printInfo(`运行时长: ${Math.round(res.data.uptime / 60)}min`);
    }
  });

statusCmd
  .command('logs')
  .description('查看系统日志')
  .option('-l, --limit <n>', '条数', '50')
  .action(async (options) => {
    const client = getClient();
    const res = await client.getLogs(parseInt(options.limit));
    const logs = res.data || res.logs || [];
    output(res,
      ['时间', '标签', '消息'],
      logs.map((l: any) => [
        l.time || l.ts || '-',
        l.tag || l.type || '-',
        (l.msg || l.message || '').slice(0, 100),
      ])
    );
  });

statusCmd
  .command('clear-logs')
  .description('清除系统日志')
  .action(async () => {
    const client = getClient();
    await client.clearLogs();
    printSuccess('日志已清除');
  });

statusCmd
  .command('scheduler')
  .description('查看调度器状态')
  .action(async () => {
    const client = getClient();
    const res = await client.getScheduler();
    output(res);
  });

statusCmd
  .command('analytics')
  .description('查看数据分析')
  .option('-s, --sort <field>', '排序字段', 'exp')
  .action(async (options) => {
    const client = getClient();
    const res = await client.getAnalytics(options.sort);
    output(res);
  });

statusCmd
  .command('ping')
  .description('Ping 服务器')
  .action(async () => {
    const client = getClient();
    const res = await client.ping();
    printSuccess(`pong (uptime: ${Math.round(res.data?.uptime || 0)}s)`);
  });

statusCmd
  .command('version')
  .description('查看游戏版本')
  .action(async () => {
    const client = getClient();
    const res = await client.getGameVersion();
    printInfo(`游戏版本: ${res.clientVersion || 'unknown'}`);
  });

// ======================== FARM ========================
const farmCmd = program.command('farm').description('农场操作');

farmCmd
  .command('lands')
  .description('查看土地列表')
  .action(async () => {
    const aid = getAccountId();
    if (!aid) { printError('需要 --account <id>'); process.exit(1); }
    const client = getClient();
    const res = await client.getLands(aid);
    output(res);
  });

farmCmd
  .command('seeds')
  .description('查看可用种子')
  .action(async () => {
    const aid = getAccountId();
    if (!aid) { printError('需要 --account <id>'); process.exit(1); }
    const client = getClient();
    const res = await client.getSeeds(aid);
    output(res);
  });

farmCmd
  .command('bag')
  .description('查看背包')
  .action(async () => {
    const aid = getAccountId();
    if (!aid) { printError('需要 --account <id>'); process.exit(1); }
    const client = getClient();
    const res = await client.getBag(aid);
    output(res);
  });

farmCmd
  .command('bag-seeds')
  .description('查看背包种子')
  .action(async () => {
    const aid = getAccountId();
    if (!aid) { printError('需要 --account <id>'); process.exit(1); }
    const client = getClient();
    const res = await client.getBagSeeds(aid);
    output(res);
  });

farmCmd
  .command('operate')
  .description('执行农场操作 (harvest/water/weed/bug/plant)')
  .argument('<type>', '操作类型')
  .action(async (type) => {
    const aid = getAccountId();
    if (!aid) { printError('需要 --account <id>'); process.exit(1); }
    const client = getClient();
    const res = await client.farmOperate(aid, type);
    printSuccess(`操作完成: ${type}`);
  });

farmCmd
  .command('use-item')
  .description('使用背包道具')
  .argument('<itemId>', '道具 ID')
  .option('-c, --count <n>', '数量', '1')
  .action(async (itemId, options) => {
    const aid = getAccountId();
    if (!aid) { printError('需要 --account <id>'); process.exit(1); }
    const client = getClient();
    const res = await client.useBagItem(aid, parseInt(itemId), parseInt(options.count));
    printSuccess('道具已使用');
  });

farmCmd
  .command('sell')
  .description('出售背包物品')
  .argument('<items>', 'JSON: [{"itemId":1,"count":5}]')
  .action(async (items) => {
    const aid = getAccountId();
    if (!aid) { printError('需要 --account <id>'); process.exit(1); }
    const client = getClient();
    const res = await client.sellBagItems(aid, JSON.parse(items));
    printSuccess('物品已出售');
  });

farmCmd
  .command('buy-fertilizer')
  .description('购买化肥')
  .argument('<type>', '类型 (organic/normal)')
  .argument('<count>', '数量')
  .action(async (type, count) => {
    const aid = getAccountId();
    if (!aid) { printError('需要 --account <id>'); process.exit(1); }
    const client = getClient();
    const res = await client.buyFertilizer(aid, type, parseInt(count));
    printSuccess('化肥已购买');
  });

farmCmd
  .command('check-fertilizer')
  .description('检查并自动购买化肥')
  .action(async () => {
    const aid = getAccountId();
    if (!aid) { printError('需要 --account <id>'); process.exit(1); }
    const client = getClient();
    const res = await client.checkAndBuyFertilizer(aid);
    output(res);
  });

farmCmd
  .command('daily-gifts')
  .description('查看每日礼包')
  .action(async () => {
    const aid = getAccountId();
    if (!aid) { printError('需要 --account <id>'); process.exit(1); }
    const client = getClient();
    const res = await client.getDailyGifts(aid);
    output(res);
  });

// ======================== FRIEND ========================
const friendCmd = program.command('friend').description('好友管理');

friendCmd
  .command('list')
  .description('好友列表')
  .action(async () => {
    const aid = getAccountId();
    if (!aid) { printError('需要 --account <id>'); process.exit(1); }
    const client = getClient();
    const res = await client.getFriends(aid);
    const friends = res.data || res.friends || [];
    output(res,
      ['GID', '昵称', 'Lv', '金币'],
      friends.map((f: any) => [
        String(f.gid || f.id || ''),
        f.name || f.nick || '-',
        String(f.level || '-'),
        f.gold ? Number(f.gold).toLocaleString() : '-',
      ])
    );
  });

friendCmd
  .command('clear-cache')
  .description('清除好友缓存')
  .action(async () => {
    const aid = getAccountId();
    if (!aid) { printError('需要 --account <id>'); process.exit(1); }
    const client = getClient();
    await client.clearFriendCache(aid);
    printSuccess('好友缓存已清除');
  });

friendCmd
  .command('records')
  .description('访客记录')
  .action(async () => {
    const aid = getAccountId();
    if (!aid) { printError('需要 --account <id>'); process.exit(1); }
    const client = getClient();
    const res = await client.getInteractRecords(aid);
    output(res);
  });

friendCmd
  .command('gids')
  .description('已知好友 GID 列表')
  .action(async () => {
    const aid = getAccountId();
    if (!aid) { printError('需要 --account <id>'); process.exit(1); }
    const client = getClient();
    const res = await client.getKnownGids(aid);
    output(res);
  });

friendCmd
  .command('add-gid')
  .description('添加已知 GID')
  .argument('<gid>', '好友 GID')
  .action(async (gid) => {
    const aid = getAccountId();
    if (!aid) { printError('需要 --account <id>'); process.exit(1); }
    const client = getClient();
    await client.addKnownGid(aid, parseInt(gid));
    printSuccess(`GID ${gid} 已添加`);
  });

friendCmd
  .command('remove-gid')
  .description('移除已知 GID')
  .argument('<gid>', '好友 GID')
  .action(async (gid) => {
    const aid = getAccountId();
    if (!aid) { printError('需要 --account <id>'); process.exit(1); }
    const client = getClient();
    await client.removeKnownGid(aid, parseInt(gid));
    printSuccess(`GID ${gid} 已移除`);
  });

friendCmd
  .command('batch-add-gids')
  .description('批量添加 GID (JSON数组)')
  .argument('<gids>', 'JSON: [123,456]')
  .action(async (gids) => {
    const aid = getAccountId();
    if (!aid) { printError('需要 --account <id>'); process.exit(1); }
    const client = getClient();
    const res = await client.batchAddGids(aid, JSON.parse(gids));
    printSuccess(`已添加 ${res.data?.addedCount || '?'} 个 GID`);
  });

friendCmd
  .command('batch-remove-gids')
  .description('批量移除 GID (JSON数组)')
  .argument('<gids>', 'JSON: [123,456]')
  .action(async (gids) => {
    const aid = getAccountId();
    if (!aid) { printError('需要 --account <id>'); process.exit(1); }
    const client = getClient();
    const res = await client.batchRemoveGids(aid, JSON.parse(gids));
    printSuccess('GID 已批量移除');
  });

friendCmd
  .command('lands')
  .description('查看好友土地')
  .argument('<gid>', '好友 GID')
  .action(async (gid) => {
    const aid = getAccountId();
    if (!aid) { printError('需要 --account <id>'); process.exit(1); }
    const client = getClient();
    const res = await client.getFriendLands(aid, parseInt(gid));
    output(res);
  });

friendCmd
  .command('op')
  .description('好友操作 (steal/water/weed/bug/help)')
  .argument('<gid>', '好友 GID')
  .argument('<type>', '操作类型')
  .option('-l, --land-ids <ids>', '土地ID列表 JSON')
  .action(async (gid, type, options) => {
    const aid = getAccountId();
    if (!aid) { printError('需要 --account <id>'); process.exit(1); }
    const client = getClient();
    const body: any = { opType: type };
    if (options.landIds) body.landIds = JSON.parse(options.landIds);
    const res = await client.friendOp(aid, parseInt(gid), type, body.landIds);
    printSuccess(`好友操作完成: ${type}`);
  });

friendCmd
  .command('blacklist')
  .description('查看黑名单')
  .action(async () => {
    const aid = getAccountId();
    if (!aid) { printError('需要 --account <id>'); process.exit(1); }
    const client = getClient();
    const res = await client.getBlacklist(aid);
    output(res);
  });

friendCmd
  .command('toggle-blacklist')
  .description('切换黑名单状态')
  .argument('<gid>', '好友 GID')
  .action(async (gid) => {
    const aid = getAccountId();
    if (!aid) { printError('需要 --account <id>'); process.exit(1); }
    const client = getClient();
    await client.toggleBlacklist(aid, parseInt(gid));
    printSuccess(`黑名单已切换 (GID: ${gid})`);
  });

// ======================== CONFIG ========================
const configCmd = program.command('config').description('配置管理');

configCmd
  .command('show')
  .description('查看当前配置')
  .action(async () => {
    const aid = getAccountId();
    if (!aid) { printError('需要 --account <id>'); process.exit(1); }
    const client = getClient();
    const res = await client.getSettings(aid);
    const data = res.data || res;
    output(data);
    if (data.automation) {
      console.log(chalk.bold('\n自动化开关:'));
      console.log(formatAutomationStatus(data.automation));
    }
    if (data.plantingStrategy) {
      console.log(chalk.bold('\n种植策略:'), data.plantingStrategy);
    }
  });

configCmd
  .command('default')
  .description('查看默认配置')
  .action(async () => {
    const client = getClient();
    const res = await client.getDefaultSettings();
    output(res);
  });

configCmd
  .command('set')
  .description('保存配置 (JSON)')
  .argument('<json>', 'JSON 配置')
  .action(async (json) => {
    const aid = getAccountId();
    if (!aid) { printError('需要 --account <id>'); process.exit(1); }
    const client = getClient();
    const res = await client.saveSettings(aid, JSON.parse(json));
    printSuccess('配置已保存');
  });

configCmd
  .command('automation')
  .description('设置自动化开关')
  .argument('<key>', '开关名称')
  .argument('<value>', 'true/false')
  .action(async (key, value) => {
    const aid = getAccountId();
    if (!aid) { printError('需要 --account <id>'); process.exit(1); }
    const client = getClient();
    const val = value === 'true' || value === '1';
    await client.setAutomation(aid, key, val);
    printSuccess(`自动化 ${key} = ${val}`);
  });

configCmd
  .command('theme')
  .description('设置主题')
  .argument('<theme>', '主题名 (light/dark)')
  .action(async (theme) => {
    const client = getClient();
    await client.setTheme(theme);
    printSuccess(`主题已切换: ${theme}`);
  });

configCmd
  .command('offline-reminder')
  .description('查看/设置离线提醒')
  .option('-s, --set <json>', '设置离线提醒 (JSON)')
  .action(async (options) => {
    const client = getClient();
    if (options.set) {
      const res = await client.setOfflineReminder(JSON.parse(options.set));
      printSuccess('离线提醒已设置');
    } else {
      const res = await client.getOfflineReminder();
      output(res);
    }
  });

configCmd
  .command('test-offline')
  .description('测试离线提醒')
  .action(async () => {
    const client = getClient();
    await client.testOfflineReminder();
    printSuccess('离线提醒测试已发送');
  });

// ======================== PLANT BLACKLIST ========================
const plantCmd = program.command('plant-blacklist').description('作物黑名单').alias('pbl');

plantCmd
  .command('list')
  .description('查看作物黑名单')
  .action(async () => {
    const aid = getAccountId();
    if (!aid) { printError('需要 --account <id>'); process.exit(1); }
    const client = getClient();
    const res = await client.getPlantBlacklist(aid);
    output(res);
  });

plantCmd
  .command('add')
  .description('添加作物到黑名单')
  .argument('<seedId>', '种子 ID')
  .action(async (seedId) => {
    const aid = getAccountId();
    if (!aid) { printError('需要 --account <id>'); process.exit(1); }
    const client = getClient();
    await client.addPlantBlacklist(aid, parseInt(seedId));
    printSuccess(`种子 ${seedId} 已加入黑名单`);
  });

plantCmd
  .command('remove')
  .description('从黑名单移除作物')
  .argument('<seedId>', '种子 ID')
  .action(async (seedId) => {
    const aid = getAccountId();
    if (!aid) { printError('需要 --account <id>'); process.exit(1); }
    const client = getClient();
    await client.removePlantBlacklist(aid, parseInt(seedId));
    printSuccess(`种子 ${seedId} 已从黑名单移除`);
  });

plantCmd
  .command('clear')
  .description('清空作物黑名单')
  .action(async () => {
    const aid = getAccountId();
    if (!aid) { printError('需要 --account <id>'); process.exit(1); }
    const client = getClient();
    await client.clearPlantBlacklist(aid);
    printSuccess('作物黑名单已清空');
  });

// ======================== USER ========================
const userCmd = program.command('user').description('用户管理');

userCmd
  .command('me')
  .description('查看当前用户信息')
  .action(async () => {
    const client = getClient();
    const res = await client.getUserMe();
    output(res);
  });

userCmd
  .command('change-password')
  .description('修改密码')
  .argument('<old>', '旧密码')
  .argument('<new>', '新密码')
  .action(async (old, pw) => {
    const client = getClient();
    await client.changePassword(old, pw);
    printSuccess('密码已修改');
  });

userCmd
  .command('renew')
  .description('续费账号')
  .argument('<cardCode>', '卡密')
  .action(async (cardCode) => {
    const client = getClient();
    await client.renewUser(cardCode);
    printSuccess('账号已续费');
  });

userCmd
  .command('announcement')
  .description('查看公告')
  .option('-r, --read', '标记已读')
  .action(async (options) => {
    const client = getClient();
    if (options.read) {
      await client.markAnnouncementRead();
      printSuccess('公告已标记已读');
    } else {
      const res = await client.getAnnouncement();
      output(res);
    }
  });

userCmd
  .command('register')
  .description('注册新用户')
  .argument('<username>', '用户名')
  .argument('<password>', '密码')
  .argument('<cardCode>', '卡密')
  .action(async (username, password, cardCode) => {
    const client = getClient();
    const res = await client.register(username, password, cardCode);
    output(res);
  });

userCmd
  .command('card-info')
  .description('查看卡密信息')
  .argument('<code>', '卡密')
  .action(async (code) => {
    const client = getClient();
    const res = await client.getCardInfo(code);
    output(res);
  });

userCmd
  .command('claim-card')
  .description('领取卡密')
  .argument('<username>', '用户名')
  .action(async (username) => {
    const client = getClient();
    await client.claimCard(username);
    printSuccess('卡密已领取');
  });

// ======================== ADMIN ========================
const adminCmd = program.command('admin').description('管理功能');

// Login logs
adminCmd
  .command('login-logs')
  .description('查看登录日志')
  .option('-l, --limit <n>', '条数', '100')
  .action(async (options) => {
    const client = getClient();
    const res = await client.getLoginLogs(parseInt(options.limit));
    output(res);
  });

adminCmd
  .command('clear-login-logs')
  .description('清除登录日志')
  .action(async () => {
    const client = getClient();
    await client.clearLoginLogs();
    printSuccess('登录日志已清除');
  });

// System config
adminCmd
  .command('system-config')
  .description('查看系统配置')
  .option('-s, --set <json>', '设置系统配置 (JSON)')
  .option('-r, --reset', '重置系统配置')
  .action(async (options) => {
    const client = getClient();
    if (options.reset) {
      await client.resetSystemConfig();
      printSuccess('系统配置已重置');
    } else if (options.set) {
      await client.setSystemConfig(JSON.parse(options.set));
      printSuccess('系统配置已更新');
    } else {
      const res = await client.getSystemConfig();
      output(res);
    }
  });

// WX config
adminCmd
  .command('wx-config')
  .description('查看/设置微信配置')
  .option('-s, --set <json>', '设置微信配置 (JSON)')
  .action(async (options) => {
    const client = getClient();
    if (options.set) {
      await client.setWxConfig(JSON.parse(options.set));
      printSuccess('微信配置已更新');
    } else {
      const res = await client.getWxConfig();
      output(res);
    }
  });

// Cards
adminCmd
  .command('cards')
  .description('卡密管理')
  .option('-c, --create <json>', '创建卡密: {"description":"...","days":30,"count":1,"type":"time"}')
  .option('-b, --batch-delete <codes>', '批量删除卡密 (JSON数组)')
  .option('-u, --update <code>', '更新卡密')
  .option('-d, --delete <code>', '删除卡密')
  .option('--data <json>', '更新数据 (JSON)')
  .option('--claim-status', '查看卡密领取状态')
  .option('--enable-claim <bool>', '开启/关闭卡密领取', 'true')
  .option('--claim-records', '查看领取记录')
  .action(async (options) => {
    const client = getClient();
    if (options.create) {
      const cfg = JSON.parse(options.create);
      await client.createCard(cfg.description, cfg.days, cfg.count, cfg.type);
      printSuccess('卡密已创建');
    } else if (options.batchDelete) {
      const codes = JSON.parse(options.batchDelete);
      await client.batchDeleteCards(codes);
      printSuccess('卡密已批量删除');
    } else if (options.update) {
      const data = options.data ? JSON.parse(options.data) : {};
      await client.updateCard(options.update, data);
      printSuccess('卡密已更新');
    } else if (options.delete) {
      await client.deleteCard(options.delete);
      printSuccess('卡密已删除');
    } else if (options.claimStatus) {
      const res = await client.getCardClaimStatus();
      output(res);
    } else if (options.enableClaim) {
      const enabled = options.enableClaim === 'true';
      await client.setCardClaimStatus(enabled);
      printSuccess(`卡密领取: ${enabled ? '开启' : '关闭'}`);
    } else if (options.claimRecords) {
      const res = await client.getCardClaimRecords();
      output(res);
    } else {
      const res = await client.getCards();
      output(res);
    }
  });

adminCmd
  .command('users')
  .description('用户管理')
  .option('-l, --list', '列出用户')
  .option('--with-password', '列出用户（含密码）')
  .option('-c, --create <username>', '创建用户')
  .option('-e, --edit <username>', '编辑用户')
  .option('-d, --delete <username>', '删除用户')
  .option('-r, --renew <username>', '续费用户')
  .option('--data <json>', '用户数据 (JSON)')
  .action(async (options) => {
    const client = getClient();
    if (options.list) {
      const res = options.withPassword ? await client.getUsersWithPassword() : await client.getUsers();
      output(res);
    } else if (options.create) {
      const data = options.data ? JSON.parse(options.data) : {};
      await client.createUser(options.create, data);
      printSuccess(`用户 ${options.create} 已创建`);
    } else if (options.edit) {
      const data = options.data ? JSON.parse(options.data) : {};
      await client.editUser(options.edit, data);
      printSuccess(`用户 ${options.edit} 已更新`);
    } else if (options.delete) {
      await client.deleteUser(options.delete);
      printSuccess(`用户 ${options.delete} 已删除`);
    } else if (options.renew) {
      const data = options.data ? JSON.parse(options.data) : {};
      await client.renewUserAdmin(options.renew, data);
      printSuccess(`用户 ${options.renew} 已续费`);
    } else {
      const res = await client.getUsers();
      output(res);
    }
  });

// ======================== MAIN ========================
async function main() {
  // Handle global options
  program.parse(process.argv);

  // Show help if no command
  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }
}

main().catch((e) => {
  printError(e.message);
  process.exit(1);
});