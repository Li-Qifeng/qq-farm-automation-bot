// QQ农场 code 抓取脚本 (Loon http-request) — v10.1
// 双平台（QQ/微信）统一：对手机返回 403 假响应拦掉 WS 握手，
// 真 code 不消费、留给 bot（8 秒后接管）。
const NAS = "http://192.168.31.12:3007";
const TOKEN = "qqfarm-loon-2026";
const url = $request.url || "";
console.log("[qqfarm] match: " + url.slice(0, 150));

let m = url.match(/[?&]platform=(qq|wx)/i);
const platform = m ? m[1].toLowerCase() : null;
m = url.match(/[?&]code=([^&]+)/);
const code = m ? decodeURIComponent(m[1]) : null;
m = url.match(/[?&]ver=([^&]+)/);
const ver = m ? decodeURIComponent(m[1]) : null;

function blockPhone() {
    // 对手机返回非 101 响应 → WS 握手失败 → code 不被消费
    return { response: { status: 403, headers: { "Content-Type": "text/plain" }, body: "taken over by NAS bot" } };
}

if (!platform || !code) {
    console.log("[qqfarm] param miss, done");
    $done({});
} else {
    // 1. 防重复与旧 Code 踩踏：若拦截到的 code 与上次相同，说明是热启动复用旧缓存，不重复提交
    const lastCodeKey = "qqfarm_last_code_" + platform;
    const lastCode = $persistentStore.read(lastCodeKey) || "";
    if (lastCode === code) {
        console.log("[qqfarm] " + platform + " same code ignored, needs cold restart");
        $notification.post("QQ农场", (platform === "wx" ? "微信" : "QQ") + " 拦截到重复旧 Code", "请在手机后台彻底划掉应用重新打开！");
        $done(blockPhone());
    } else {
        console.log("[qqfarm] " + platform + " POST ver=" + ver + " -> " + NAS);
        // 不显式指定 policy，让 Loon 自动根据规则走直连(家中Wi-Fi)或WireGuard回家(蜂窝外网)
        $httpClient.post({
            url: NAS + "/api/ingest/code?t=" + TOKEN,
            headers: { "Content-Type": "application/json", "x-ingest-token": TOKEN },
            body: JSON.stringify({ platform: platform, code: code, ver: ver }),
            timeout: 10
        }, function (err, resp, data) {
            console.log("[qqfarm] resp err=" + (err ? err.message : "none") + " status=" + (resp ? resp.status : "none") + " body=" + String(data || "").slice(0, 150));
            var ok = !err && resp && resp.status === 200;
            var out = {};
            if (ok) {
                $persistentStore.write(code, lastCodeKey);
                let msg = "";
                try { msg = JSON.parse(data).message || ""; } catch (e) {}
                $notification.post("QQ农场", (platform === "wx" ? "微信" : "QQ") + " code 已提交", msg || "已保存，8秒后自动上线");
                out = blockPhone();
                console.log("[qqfarm] " + platform + " handshake blocked (403), code reserved for bot");
            } else {
                let errMsg = (err && err.message) || (resp && ("HTTP " + resp.status)) || "无法连接 NAS (检查 Wi-Fi 或 WireGuard)";
                $notification.post("QQ农场", (platform === "wx" ? "微信" : "QQ") + " code 提交失败", errMsg);
                out = blockPhone();
            }
            $done(out);
        });
    }
}
