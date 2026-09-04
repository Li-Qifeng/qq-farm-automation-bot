// ============ Loon 局域网 code 摄取端点 ============
// 手机 Loon 脚本抓到农场 WS URL 里的 code 后 POST 到这里：
//   POST /api/ingest/code  { platform: "qq"|"wx", code: "xxx" }
//   头: x-ingest-token: <INGEST_TOKEN>
// 服务端负责：去重 → 更新账号 code → stop → 等旧连接退出 → start → 回传连接结果
// 状态查询（Loon 插件面板轮询）：
//   GET /api/ingest/status → { accounts: [{id,name,platform,connected,lastError}] }
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const store = require('../models/store');

const PLATFORM_ACCOUNT = { qq: '1', wx: '4' };
const INGEST_TOKEN = process.env.INGEST_TOKEN || 'qqfarm-loon-2026';
const TOKEN_BUF = Buffer.from(INGEST_TOKEN);
const LOON_DIR = path.join(__dirname, '..', '..', 'data', 'loon');

function registerIngestRoutes(app, provider) {
    const restartTimers = new Map(); // accountId -> timeout handle，防抖

    function tokenOk(header) {
        if (typeof header !== 'string' || header.length !== TOKEN_BUF.length) return false;
        return crypto.timingSafeEqual(Buffer.from(header), TOKEN_BUF);
    }

    app.post('/api/ingest/code', (req, res) => {
        if (!tokenOk(req.headers['x-ingest-token'] || ''))
            return res.status(401).json({ ok: false, error: 'bad ingest token' });

        const { platform, code } = req.body || {};
        if (!code || typeof code !== 'string')
            return res.status(400).json({ ok: false, error: 'missing code' });
        const accountId = PLATFORM_ACCOUNT[String(platform || '').toLowerCase()];
        if (!accountId)
            return res.status(400).json({ ok: false, error: `unknown platform: ${platform}` });

        try {
            const before = provider.getAccounts();
            const acct = (before.accounts || []).find(a => String(a.id) === accountId);
            if (!acct)
                return res.status(404).json({ ok: false, error: `account ${accountId} not found` });

            // 去重：同 code 且当前已连接 → 无需重启
            if (String(acct.code) === code && acct.running) {
                let connected = false;
                try {
                    const st = provider.getStatus(accountId);
                    connected = !!(st && st.connection && st.connection.connected);
                } catch (e) { /* ignore */ }
                if (connected)
                    return res.json({ ok: true, action: 'noop', accountId, connected: true, message: 'code 未变化且已连接' });
            }

            // 更新 code（保留账号其他字段）
            store.addOrUpdateAccount({ id: accountId, code });

            // 重启 worker（stop → 等旧进程退出 25s → start），防抖合并短时间多次提交
            if (restartTimers.has(accountId)) {
                clearTimeout(restartTimers.get(accountId));
                restartTimers.delete(accountId);
            }
            try { provider.stopAccount(accountId); } catch (e) { /* ignore */ }
            restartTimers.set(accountId, setTimeout(() => {
                restartTimers.delete(accountId);
                try { provider.startAccount(accountId); } catch (e) { /* ignore */ }
            }, 25000));

            res.json({ ok: true, action: 'restart-scheduled', accountId, platform, connected: false, message: 'code 已保存，25 秒后自动重连' });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // Loon 脚本分发：手机插件用 URL 引用，文件放数据卷，改脚本无需重导插件
    app.get('/api/ingest/script/:name', (req, res) => {
        const name = String(req.params.name || '');
        if (!/^[a-z0-9_-]+\.js$/.test(name)) return res.status(400).json({ ok: false, error: 'bad name' });
        const file = path.join(LOON_DIR, name);
        if (!fs.existsSync(file)) return res.status(404).json({ ok: false, error: 'script not found' });
        res.set('Content-Type', 'application/javascript; charset=utf-8');
        res.set('Cache-Control', 'no-cache');
        fs.createReadStream(file).pipe(res);
    });

    app.get('/api/ingest/status', (req, res) => {
        try {
            const data = provider.getAccounts();
            const accounts = (data.accounts || []).map(a => {
                let connected = false, lastError = null;
                try {
                    const st = provider.getStatus(a.id);
                    connected = !!(st && st.connection && st.connection.connected);
                    if (st && st.wsError) lastError = `${st.wsError.code} ${st.wsError.message || ''}`.trim();
                } catch (e) { /* ignore */ }
                return {
                    id: String(a.id),
                    name: a.name || '',
                    platform: a.platform || 'qq',
                    running: !!a.running,
                    connected,
                    lastError,
                    updatedAt: a.updatedAt || null,
                };
            });
            res.json({ ok: true, at: Date.now(), accounts });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });
}

module.exports = { registerIngestRoutes };
