// QQ农场 状态面板脚本 (Loon Panel) — NAS 分发版
const NAS = "http://192.168.31.12:3007";
$httpClient.get({ url: NAS + "/api/ingest/status", policy: "DIRECT", timeout: 10 }, function (err, resp, data) {
    console.log("[qqfarm-panel] err=" + (err ? err.message : "none") + " status=" + (resp ? resp.status : "none"));
    if (err || !resp || resp.status !== 200) {
        $done({ title: "QQ农场", content: "NAS 不可达", icon: "xmark.circle" });
        return;
    }
    try {
        const j = JSON.parse(data);
        const qq = j.accounts.find(function (a) { return a.id === "1"; }) || {};
        const wx = j.accounts.find(function (a) { return a.id === "4"; }) || {};
        const on = function (a) { return a.connected; };
        const now = (on(qq) ? "1" : "0") + (on(wx) ? "1" : "0");
        const prev = $persistentStore.read("qqfarm_state") || "";
        if (prev && prev !== now && now !== "11") {
            const off = [];
            if (!on(qq)) off.push("QQ");
            if (!on(wx)) off.push("微信");
            $notification.post("QQ农场 · 掉线提醒", off.join("/") + " 已断开", "打开一次小程序即自动续 code");
        }
        $persistentStore.write(now, "qqfarm_state");
        $done({
            title: "QQ农场",
            content: "QQ " + (on(qq) ? "在线" : "离线") + " · 微信 " + (on(wx) ? "在线" : "离线"),
            icon: (on(qq) && on(wx)) ? "leaf" : "exclamationmark.triangle",
            openUrl: NAS
        });
    } catch (e) {
        console.log("[qqfarm-panel] parse fail: " + e.message);
        $done({ title: "QQ农场", content: "状态解析失败", icon: "questionmark.circle" });
    }
});
