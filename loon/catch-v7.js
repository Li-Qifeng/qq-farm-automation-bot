// QQ农场 code 抓取脚本 (Loon http-request) — NAS 分发版
// 修改此文件后手机无需重导插件，Loon 每次触发都会重新拉取
const NAS = "http://192.168.31.12:3007";
const TOKEN = "***";
const url = $request.url || "";
console.log("[qqfarm] match: " + url.slice(0, 150));
let m = url.match(/[?&]platform=(qq|wx)/i);
const platform = m ? m[1].toLowerCase() : null;
m = url.match(/[?&]code=([^&]+)/);
const code = m ? decodeURIComponent(m[1]) : null;
m = url.match(/[?&]ver=([^&]+)/);
const ver = m ? decodeURIComponent(m[1]) : null;
if (!platform || !code) {
    console.log("[qqfarm] param miss, done");
    $notification.post("QQ农场", "抓到URL但参数不匹配", url.slice(0, 100));
    $done({});
} else {
    const last = $persistentStore.read("qqfarm_last_" + platform) || "";
    if (last === code) {
        console.log("[qqfarm] " + platform + " same code, skip");
        // 同 code 已被消费过，微信重放时拦掉手机请求
        if (platform === "wx") {
            $done({ url: url.replace(/([?&]code=)[^&]+/, "$1" + "00000000000000000000000000000000") });
        } else {
            $done({});
        }
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
            // Loon 对局域网 http 常拿不到 resp（err 为对象但 message 空）——POST 已发出即视为成功，
            // 仅当服务端明确回了非 200 才算失败
            var ok = !(resp && resp.status !== 200);
            var out = {};
            if (ok) {
                $persistentStore.write(code, "qqfarm_last_" + platform);
                let msg = "";
                try { msg = JSON.parse(data).message || ""; } catch (e) {}
                $notification.post("QQ农场", (platform === "wx" ? "微信" : "QQ") + " code 已提交", msg || "已保存");
                if (platform === "wx") {
                    // 微信 code 一次性：手机先连会消费掉它，把手机请求里的 code 改成假值，
                    // 手机连不上（小程序报网络错误，正常），真 code 留给 bot
                    out = { url: url.replace(/([?&]code=)[^&]+/, "$1" + "00000000000000000000000000000000") };
                    console.log("[qqfarm] wx phone WS blocked, code reserved for bot");
                }
            } else {
                $notification.post("QQ农场", "code 提交失败", String((err && err.message) || (resp && resp.status) || "无响应"));
            }
            $done(out);
        });
    }
}
