// QQ农场 code 抓取脚本 (Loon http-request) — v8
// 微信 code 一次性且不支持顶号：直接对手机返回 403 假响应拦掉 WS 握手，
// 真 code 不消费、留给 bot（8 秒后接管）。QQ 支持顶号，不拦。
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
    console.log("[qqfarm] " + platform + " POST ver=" + ver + " -> " + NAS);
    $httpClient.post({
        url: NAS + "/api/ingest/code?t=" + TOKEN,
        headers: { "Content-Type": "application/json", "x-ingest-token": TOKEN },
        body: JSON.stringify({ platform: platform, code: code, ver: ver }),
        policy: "DIRECT",
        timeout: 15
    }, function (err, resp, data) {
        console.log("[qqfarm] resp err=" + (err ? err.message : "none") + " status=" + (resp ? resp.status : "none") + " body=" + String(data || "").slice(0, 150));
        // Loon 对局域网 http 常拿不到 resp —— POST 已发出即视为成功
        var ok = !(resp && resp.status !== 200);
        var out = {};
        if (ok) {
            let msg = "";
            try { msg = JSON.parse(data).message || ""; } catch (e) {}
            $notification.post("QQ农场", (platform === "wx" ? "微信" : "QQ") + " code 已提交", msg || "已保存");
            if (platform === "wx") {
                out = blockPhone();
                console.log("[qqfarm] wx handshake blocked (403), code reserved for bot");
            }
        } else {
            $notification.post("QQ农场", "code 提交失败", String((err && err.message) || (resp && resp.status) || "无响应"));
        }
        $done(out);
    });
}
