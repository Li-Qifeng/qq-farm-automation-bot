import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';

interface StoredConfig {
  serverUrl: string;
  token: string;
  username: string;
}

const CONFIG_DIR = join(homedir(), '.config', 'qq-farm');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

function ensureConfigDir() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig(): StoredConfig | null {
  try {
    ensureConfigDir();
    if (!existsSync(CONFIG_FILE)) return null;
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  } catch { return null; }
}

export function saveConfig(config: StoredConfig) {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export function clearConfig() {
  try {
    if (existsSync(CONFIG_FILE)) {
      writeFileSync(CONFIG_FILE, '{}', 'utf-8');
    }
  } catch {}
}

export class ApiClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
  }

  static fromConfig(): ApiClient | null {
    const cfg = loadConfig();
    if (!cfg || !cfg.serverUrl || !cfg.token) return null;
    return new ApiClient(cfg.serverUrl, cfg.token);
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {}
  ): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const opts: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': this.token,
        ...headers,
      },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = await res.json();
    if (json.ok === false) throw new Error(json.error || 'API error');
    return json;
  }

  /** Public endpoints (no auth) */
  // Auth
  async login(username: string, password: string) {
    const res = await fetch(`${this.baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const json = await res.json();
    if (json.ok === false) throw new Error(json.error || 'Login failed');
    return json;
  }

  // Account CRUD
  async getAccounts() { return this.request('GET', '/api/accounts'); }
  async addAccount(body: { code: string; qq?: string; platform?: string; name?: string; device_id?: string }) { return this.request('POST', '/api/accounts', body); }
  async deleteAccount(id: string | number) { return this.request('DELETE', `/api/accounts/${id}`); }
  async remarkAccount(body: { id?: string | number; accountId?: string | number; name?: string }) { return this.request('POST', '/api/account/remark', body); }
  async startAccount(id: string | number) { return this.request('POST', `/api/accounts/${id}/start`, {}); }
  async stopAccount(id: string | number) { return this.request('POST', `/api/accounts/${id}/stop`, {}); }
  async getAccountLogs(limit = 100) { return this.request('GET', `/api/account-logs?limit=${limit}`); }

  // Status & Logs
  async getStatus(accountId: string) { return this.request('GET', '/api/status', undefined, { 'x-account-id': accountId }); }
  async getLogs(limit = 50) { return this.request('GET', `/api/logs?limit=${limit}`); }
  async clearLogs() { return this.request('DELETE', '/api/logs'); }
  async getScheduler() { return this.request('GET', '/api/scheduler'); }
  async getAnalytics(sort = 'exp') { return this.request('GET', `/api/analytics?sort=${sort}`); }

  // Farm
  async getLands(accountId: string) { return this.request('GET', '/api/lands', undefined, { 'x-account-id': accountId }); }
  async getSeeds(accountId: string) { return this.request('GET', '/api/seeds', undefined, { 'x-account-id': accountId }); }
  async getBag(accountId: string) { return this.request('GET', '/api/bag', undefined, { 'x-account-id': accountId }); }
  async getBagSeeds(accountId: string) { return this.request('GET', '/api/bag/seeds', undefined, { 'x-account-id': accountId }); }
  async useBagItem(accountId: string, itemId: number, count = 1) { return this.request('POST', '/api/bag/use', { itemId, count }, { 'x-account-id': accountId }); }
  async sellBagItems(accountId: string, items: { itemId: number; count: number }[]) { return this.request('POST', '/api/bag/sell', { items }, { 'x-account-id': accountId }); }
  async farmOperate(accountId: string, opType: string) { return this.request('POST', '/api/farm/operate', { opType }, { 'x-account-id': accountId }); }
  async buyFertilizer(accountId: string, type: string, count: number) { return this.request('POST', '/api/fertilizer/buy', { type, count }, { 'x-account-id': accountId }); }
  async checkAndBuyFertilizer(accountId: string) { return this.request('POST', '/api/fertilizer/check-and-buy', {}, { 'x-account-id': accountId }); }
  async getDailyGifts(accountId: string) { return this.request('GET', '/api/daily-gifts', undefined, { 'x-account-id': accountId }); }

  // Friends
  async getFriends(accountId: string) { return this.request('GET', '/api/friends', undefined, { 'x-account-id': accountId }); }
  async clearFriendCache(accountId: string) { return this.request('POST', '/api/friends/clear-cache', {}, { 'x-account-id': accountId }); }
  async getInteractRecords(accountId: string) { return this.request('GET', '/api/interact-records', undefined, { 'x-account-id': accountId }); }
  async getFriendLands(accountId: string, gid: number) { return this.request('GET', `/api/friend/${gid}/lands`, undefined, { 'x-account-id': accountId }); }
  async friendOp(accountId: string, gid: number, opType: string, landIds?: number[]) { return this.request('POST', `/api/friend/${gid}/op`, { opType, landIds }, { 'x-account-id': accountId }); }
  async getBlacklist(accountId: string) { return this.request('GET', '/api/friend-blacklist', undefined, { 'x-account-id': accountId }); }
  async toggleBlacklist(accountId: string, gid: number) { return this.request('POST', '/api/friend-blacklist/toggle', { gid }, { 'x-account-id': accountId }); }
  async getKnownGids(accountId: string) { return this.request('GET', '/api/friend-known-gids', undefined, { 'x-account-id': accountId }); }
  async addKnownGid(accountId: string, gid: number) { return this.request('POST', '/api/friend-known-gids', { gid }, { 'x-account-id': accountId }); }
  async removeKnownGid(accountId: string, gid: number) { return this.request('POST', '/api/friend-known-gids/remove', { gid }, { 'x-account-id': accountId }); }
  async batchAddGids(accountId: string, gids: number[]) { return this.request('POST', '/api/friend-known-gids/batch-add', { gids }, { 'x-account-id': accountId }); }
  async batchRemoveGids(accountId: string, gids: number[]) { return this.request('POST', '/api/friend-known-gids/batch-remove', { gids }, { 'x-account-id': accountId }); }

  // Plant Blacklist
  async getPlantBlacklist(accountId: string) { return this.request('GET', '/api/plant-blacklist', undefined, { 'x-account-id': accountId }); }
  async addPlantBlacklist(accountId: string, seedId: number) { return this.request('POST', '/api/plant-blacklist', { seedId }, { 'x-account-id': accountId }); }
  async removePlantBlacklist(accountId: string, seedId: number) { return this.request('DELETE', `/api/plant-blacklist/${seedId}`, undefined, { 'x-account-id': accountId }); }
  async clearPlantBlacklist(accountId: string) { return this.request('DELETE', '/api/plant-blacklist', undefined, { 'x-account-id': accountId }); }

  // Settings
  async getSettings(accountId: string) { return this.request('GET', '/api/settings', undefined, { 'x-account-id': accountId }); }
  async getDefaultSettings() { return this.request('GET', '/api/settings/default'); }
  async saveSettings(accountId: string, body: Record<string, any>) { return this.request('POST', '/api/settings/save', body, { 'x-account-id': accountId }); }
  async setAutomation(accountId: string, key: string, value: any) { return this.request('POST', '/api/automation', { [key]: value }, { 'x-account-id': accountId }); }
  async setTheme(theme: string) { return this.request('POST', '/api/settings/theme', { theme }); }
  async setOfflineReminder(cfg: Record<string, any>) { return this.request('POST', '/api/settings/offline-reminder', cfg); }
  async testOfflineReminder() { return this.request('POST', '/api/settings/offline-reminder/test', {}); }

  // User
  async getUserMe() { return this.request('GET', '/api/user/me'); }
  async changePassword(oldPassword: string, newPassword: string) { return this.request('POST', '/api/user/change-password', { oldPassword, newPassword }); }
  async renewUser(cardCode: string) { return this.request('POST', '/api/user/renew', { cardCode }); }

  // Announcement
  async getAnnouncement() { return this.request('GET', '/api/announcement'); }
  async markAnnouncementRead() { return this.request('POST', '/api/announcement/read', {}); }

  // Admin
  async getLoginLogs(limit = 100) { return this.request('GET', `/api/admin/login-logs?limit=${limit}`); }
  async clearLoginLogs() { return this.request('DELETE', '/api/admin/login-logs'); }
  async getSystemConfig() { return this.request('GET', '/api/admin/system-config'); }
  async setSystemConfig(body: Record<string, any>) { return this.request('POST', '/api/admin/system-config', body); }
  async resetSystemConfig() { return this.request('POST', '/api/admin/system-config/reset'); }
  async getWxConfig() { return this.request('GET', '/api/admin/wx-config'); }
  async setWxConfig(body: Record<string, any>) { return this.request('POST', '/api/admin/wx-config', body); }
  async getCards() { return this.request('GET', '/api/admin/cards'); }
  async createCard(description: string, days: number, count: number, type: string) { return this.request('POST', '/api/admin/cards', { description, days, count, type }); }
  async updateCard(code: string, body: Record<string, any>) { return this.request('POST', `/api/admin/cards/${code}`, body); }
  async deleteCard(code: string) { return this.request('DELETE', `/api/admin/cards/${code}`); }
  async batchDeleteCards(codes: string[]) { return this.request('POST', '/api/admin/cards/batch-delete', { codes }); }
  async getCardClaimStatus() { return this.request('GET', '/api/card-claim/status'); }
  async setCardClaimStatus(enabled: boolean) { return this.request('POST', '/api/admin/card-claim/status', { enabled }); }
  async getCardClaimRecords() { return this.request('GET', '/api/admin/card-claim/records'); }
  async getUsers() { return this.request('GET', '/api/admin/users'); }
  async getUsersWithPassword() { return this.request('GET', '/api/admin/users-with-password'); }
  async createUser(username: string, body: Record<string, any>) { return this.request('POST', `/api/admin/users/${username}`, body); }
  async editUser(username: string, body: Record<string, any>) { return this.request('POST', `/api/admin/users/${username}/edit`, body); }
  async deleteUser(username: string) { return this.request('DELETE', `/api/admin/users/${username}`); }
  async renewUserAdmin(username: string, body: Record<string, any>) { return this.request('POST', `/api/admin/users/${username}/renew`, body); }

  // Misc
  async ping() { return this.request('GET', '/api/ping'); }
  async getGameVersion() { return this.request('GET', '/api/game-version'); }
  async validateToken() { return this.request('GET', '/api/auth/validate'); }
  async logout() { return this.request('POST', '/api/logout'); }
  async register(username: string, password: string, cardCode: string) {
    return this.request('POST', '/api/register', { username, password, cardCode });
  }
  async getCardInfo(code: string) { return this.request('GET', `/api/card/info/${code}`); }
  async claimCard(username: string) { return this.request('POST', '/api/card-claim/claim', { username }); }
}