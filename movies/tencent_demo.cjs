/**
 * 腾讯云 TTS 语音合成 — 声音复刻调用
 * 纯原生 Node.js，无需安装任何 npm 包，node index-native.js 直接跑
 */

const https = require("https");
const crypto = require("crypto");
const fs = require("fs");

// ========== 从 .env 读取密钥 ==========
function loadEnv() {
  const envFile = fs.readFileSync(".env", "utf8");
  const vars = {};
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return vars;
}
const env = loadEnv();
const SECRET_ID  = env.TENCENT_SECRET_ID;
const SECRET_KEY = env.TENCENT_SECRET_KEY;
// ===================================

const HOST    = "tts.tencentcloudapi.com";
const SERVICE = "tts";
const VERSION = "2019-08-23";

// 签名算法
function sha256(msg) {
  return crypto.createHash("sha256").update(msg).digest("hex");
}
function hmac(key, msg) {
  return crypto.createHmac("sha256", key).update(msg).digest();
}

function getAuth(secretId, secretKey, payload) {
  const now = Math.floor(Date.now() / 1000);
  const date = new Date(now * 1000).toISOString().slice(0, 10);

  const canonical = [
    "POST", "/", "",
    "content-type:application/json",
    "host:" + HOST, "",
    "content-type;host",
    sha256(payload),
  ].join("\n");

  const toSign = [
    "TC3-HMAC-SHA256",
    now,
    date + "/" + SERVICE + "/tc3_request",
    sha256(canonical),
  ].join("\n");

  const sd  = hmac("TC3" + secretKey, date);
  const ss  = hmac(sd, SERVICE);
  const s   = hmac(ss, "tc3_request");
  const sig = hmac(s, toSign).toString("hex");

  return {
    auth: "TC3-HMAC-SHA256 Credential=" + secretId + "/" + date + "/" + SERVICE + "/tc3_request, SignedHeaders=content-type;host, Signature=" + sig,
    timestamp: now,
  };
}

function call(text) {
  const payload = JSON.stringify({
    Text:          text,
    SessionId:     "s-" + Date.now(),
    VoiceType:     200000000,
    FastVoiceType: "WCHN-7028cbcfea0840858ea2116dae34024e",
    Codec:         "mp3",
  });

  const { auth, timestamp } = getAuth(SECRET_ID, SECRET_KEY, payload);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: HOST,
      method: "POST",
      headers: {
        "Content-Type":    "application/json",
        "Host":            HOST,
        "X-TC-Action":     "TextToVoice",
        "X-TC-Version":    VERSION,
        "X-TC-Timestamp":  timestamp,
        "Authorization":   auth,
        "X-TC-Region":     "",
      },
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        const result = JSON.parse(body);
        if (result.Response.Error) {
          reject(result.Response.Error);
        } else {
          resolve(result.Response);
        }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// 调用
call("你好，AI的世界")
  .then((resp) => {
    const buf = Buffer.from(resp.Audio, "base64");
    fs.writeFileSync("output.mp3", buf);
    console.log("✅ 合成成功 → output.mp3 (" + (buf.length / 1024).toFixed(1) + " KB)");
  })
  .catch((err) => {
    console.error("❌ 失败:", err.Code, "-", err.Message);
  });