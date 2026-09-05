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
if (!platform || !code) {
    console.log("[qqfarm] param miss, done");
    $notification.post("QQ农场", "抓到URL但参数不匹配", url.slice(0, 100));
    $done({});
} else {
    const last = $persistentStore.read("qqfarm_last_" + platform) || "";
    if (last === code) {
        console.log("[qqfarm] " + platform + " same code, skip");
        $done({});
    } else {
        console.log("[qqfarm] " + platform + " POST -> " + NAS);
        $httpClient.post({
            url: NAS + "/api/ingest/code?t=" + TOKEN,
            headers: { "Content-Type": "application/json", "x-ingest-token": TOKEN },
            body: JSON.stringify({ platform: platform, code: code }),
            policy: "DIRECT",
            timeout: 15
        }, function (err, resp, data) {
            console.log("[qqfarm] resp err=" + (err ? err.message : "none") + " status=" + (resp ? resp.status : "none") + " body=" + String(data || "").slice(0, 150));
            if (!err && resp && resp.status === 200) {
                $persistentStore.write(code, "qqfarm_last_" + platform);
                let msg = "";
                try { msg = JSON.parse(data).message || ""; } catch (e) {}
                $notification.post("QQ农场", (platform === "wx" ? "微信" : "QQ") + " code 已提交", msg);
            } else {
                $notification.post("QQ农场", "code 提交失败", String((err && err.message) || (resp && resp.status) || "无响应"));
            }
            $done({});
        });
    }
}
