# zanhua.asia 项目 AI 交接手册

> 本文档是「赞话论坛」项目的完整交接包，供后续接手的 AI 或工程师阅读。任何一次改动都请遵循末尾的「每轮交付规范」。

---

## 1. 项目概览

- 站点：赞话论坛（中文社交/论坛 SPA）
- 域名：`zanhua.asia`（主域名，用户访问入口）
- 后端域名：`zanhuaweb.asia`（API 后端，走 Cloudflare）
- 服务器：香港 VPS `banli@154.201.81.86`，sudo 密码 `198117Aa`
- 站点目录：`/var/www/html/zanhua`
- SQLite DB：`/var/www/html/zanhua/zanhua.db`
- 进程管理：`pm2` 应用名 `zanhua`，端口 3001
- 反代：nginx 1.18（HTTP/2、TLS 证书 `/etc/ssl/zanhua.asia/`）
- 备份机（仅冷备）：AWS `140.179.167.16`
- GitHub Pages：`vivi232/zanhua-web`（静态资源 CDN）
- GitHub PAT：`ghp_LWhq...[REDACTED-GITHUB-PAT]zT75`
- Token 密钥（当前）：`e8226579a094fd946a737b3b13decad6f233198eda28a9c60a950b7fabaf7221`
- 用户技术水平：编程新手，通过手机操作

## 2. 网络与架构（关键，v124 修复）

**这是 v124 修复的核心：**

DNS 层面：
- `zanhua.asia` → CNAME 到 `vivi232.github.io`（GitHub Pages）
- `www.zanhua.asia` → 同上
- `zanhuaweb.asia` → Cloudflare（104.21.x、172.67.x）→ HK 服务器
- HK 服务器 nginx HTTPS 只匹配 `zanhua.asia`/`www.zanhua.asia`，但 DNS 不指过来，实际是「备用」

因此真实流量路径：
- 用户浏览器 → `https://zanhua.asia` → GitHub Pages 返回 index.html/app.js
- 静态资源（图片、字体、API）→ `https://zanhuaweb.asia/...` → Cloudflare → HK nginx (80) → pm2:3001
- SW 缓存的字体、默认头像等硬编码走 `https://154.201.81.86/zanhua/...`

**因此 app.js 里的 `API_HOST` 必须按 hostname 分派（v124 引入）**：

```js
const API_HOST = location.hostname === "zanhua.asia" || location.hostname === "www.zanhua.asia"
    ? "https://zanhuaweb.asia"
    : "";
const API_FALLBACK = API_HOST ? "https://154.201.81.86" : "";
```

- Pages 域名下：API 和媒体都走 `zanhuaweb.asia`
- HK 直连（例如 `zanhuaweb.asia/zanhua/`、`154.201.81.86/zanhua/`）：同源相对路径

CORS 已经在 `server.js` 里配置好，允许 origin：
```
https://zanhua.asia, https://www.zanhua.asia,
https://zanhuaweb.asia, https://www.zanhuaweb.asia,
https://vivi232.github.io, https://154.201.81.86,
https://banli.site, https://www.banli.site
```

对应 `sw.js` 的 `isSharedAsset` / `isUserMedia` 也已放行 `zanhuaweb.asia`（v124）。

## 3. 文件与仓库约束（硬规矩）

GitHub Pages 仓库 `vivi232/zanhua-web` 里**只能有**以下文件：
```
app.js, sw.js, index.html, app.css, 404.html, CNAME, ads.txt, README.md, zanhua_icon.webp
```

**绝对不允许**：`admin.html`、`server.js`（含管理员密钥和服务器逻辑）。

**服务器文件**（`/var/www/html/zanhua`）比仓库多出：
`server.js`, `admin.html`, `zanhua.db`, `uploads/`, `node_modules/`, 备份文件 `*.bak*`。

代码注释规则：**部署到 GitHub 和线上的 app.js / sw.js / index.html 必须无注释**，`scope_gate.js` 检查 `real=0` 才算通过。

## 4. 版本号规则

- `index.html` 中 `app.js?v=N` 的 N 是内部版本号（当前 N=124）
- 对外发布的版本：**v1.<(N-1)//30>.<((N-1)%30)+1>**
  - N=123 → v1.4.3
  - N=124 → v1.4.4
- `sw.js?v=` 单独计数（当前 18）
- `app.css?v=` 单独计数（当前 12）

## 5. 每轮交付规范（必须严格遵守）

一轮完整的改动 = 一次对话回合，按下列顺序执行：

1. **调研**：SSH 进 HK 服务器（paramiko）查代码、日志、数据
2. **修复**：本地 `/data/work` 编辑代码
3. **测试**：`node --check`、必要时 curl 验证接口
4. **构建**：确认无注释、scope_gate 通过
5. **部署**：SFTP 上传到 `/var/www/html/zanhua`（需要 `sudo cp -f`），**不能 pm2 restart**（除非用户明确要求；restart 会导致 `ZANHUA_TOKEN_SECRET` 随机化、全站强制登出）
6. **验证**：HTTPS 从公网拉一遍比对 md5
7. **推 GitHub**：走 `ghpush*.py`（GitHub API base64 blob → tree → commit → ref）
8. **README**：更新本文件
9. **交付 3 个 zip**：
   - `zanhua-web-github.zip`：与 GitHub 仓库内容一致
   - `zanhua-server.zip`：HK 服务器需要的所有文件（含 server.js、admin.html）
   - `zanhua-ai-handoff.zip`：服务器 zip + 本 README
10. **一次中文汇报**：说明本轮做了什么、验证结果、用户下一步能感受到的变化；如涉及 pm2 restart，必须写明「会全站强制登出，需要重新登录」；提醒 GitHub Pages CDN 大约滞后 10 分钟生效（只有 push 时提醒）。

## 6. v124 变更摘要

- **修复未登录用户首页空白**：`API_HOST` 按 `location.hostname` 分派，Pages 域名下走 `zanhuaweb.asia` 跨域，HK 直连保持同源。之前 Pages 域名下所有 API 都请求到 GitHub Pages → 404 → 游客看不到任何帖子。
- **广告视频骨架屏期间预下载**：`adBootPriority()` 每次运行都会把当前广告视频路径写入 `localStorage.zanhua_advid`；下一轮 app.js 加载后，`render()` 之前直接从 localStorage 读取路径并调用 `adVideoBlobUrl()` 排队下载。这样在用户还在看骨架屏时视频字节已经拉回，等帖子渲染出来直接命中内存/IndexedDB 缓存。
- **SW 缓存兼容 zanhuaweb 域名**：`isSharedAsset` / `isUserMedia` 允许 `zanhuaweb.asia`/`www.zanhuaweb.asia` 的媒体命中 CacheStorage；`sw.js?v=18` 触发老用户重装。

## 7. 广告模块现状

- 广告行了权 `clientConfig.adConfig.enabled=false` 时（游客或未开启）走 `AdManager.injectFeed` 透传，不注入 `<ins class="adsbygoogle">`。
- 广告视频文件（例如 `/zanhua/uploads/posts/1793637683796_lj0r8b.mp4`）：`adMediaNames` 集合在启动时和 `adCreate` 时加入，绕过水印签名路径。
- `VIDEO_SIGN_AD_BUCKET = 30*24*3600`：广告视频签名 URL 30 天分桶，让浏览器/nginx 长缓存生效。
- **换广告（无需 pm2 restart）流程**：
  1. `POST /zanhua/api/admin/adUpload`（multipart 字段名 `files`，`compress=0`）→ 返回 `{code:1, data:{urls:[...], covers:[...]}}`
  2. `POST /zanhua/api/admin/adCreate`（字段 `video`，`skip_review=true, skip_compress=true`）→ 自动写入 `adMediaNames`
  3. `POST /zanhua/api/admin/adSetStatus` `{id, status:"paused"}` 停用旧的
  4. 管理员鉴权：`Authorization: admin_<...>`，HMAC 校验，uid = `10000000`，ts >= `SERVER_START_MS`
- 视频编码经验（1 vCPU 服务器）：
  - x265 太慢太大
  - x264 preset=veryfast+maxrate 会「马赛克」
  - **推荐**：x264 2-pass ABR + preset=medium
  - 当前 v123 已选定的码率结果：ad22_2p400 1.9MB / SSIM 0.986；ad23_2p350 0.86MB / SSIM 0.993

## 8. 服务器运维要点

- SSH：`paramiko.SSHClient` + `AutoAddPolicy`，`banli / 198117Aa`
- sudo：所有需要 root 的命令都 `echo "198117Aa" | sudo -S <cmd>`
- 上传：SFTP（paramiko），落 `/tmp`，再 `sudo cp -f` 到 `/var/www/html/zanhua`
- **不要用 `pm2 restart`**：`ZANHUA_TOKEN_SECRET` 未持久化，restart 后所有旧 token 失效 → 全站强制登出
- nginx reload 是安全的（`sudo systemctl reload nginx`），只影响反代配置
- 日志：
  - `pm2 logs zanhua --lines 50`（错误日志常见有：水印处理失败 / ERR_HTTP_HEADERS_SENT，历史遗留，不影响主流程）
  - `/var/log/nginx/access.log` 只有 SW 硬编码到 IP 的资源请求，用户主流量走 Pages → 看不到

## 9. ads.txt 与 AdSense 状态

- 文件内容：`google.com, pub-3101480018553178, DIRECT, f08c47fec0942fa0`
- 部署路径：
  - GitHub Pages：`vivi232/zanhua-web/ads.txt` → `https://zanhua.asia/ads.txt` 200 OK
  - HK 服务器：`/var/www/html/ads.txt` → `https://zanhuaweb.asia/ads.txt` 也能命中（nginx HTTP 块有 `location = /ads.txt`，HTTPS 块同样有；Pages 走 GitHub，HK 走 nginx）
- 现状验证：
  - `curl -sL https://zanhua.asia/ads.txt` → 正确内容
  - `curl -sL https://www.zanhua.asia/ads.txt` → GitHub Pages 301 → apex → 正确内容
- Google AdSense 报「找不到 ads.txt」通常是 **Google 侧的抓取周期还没刷新**（每 24h+ 拉一次，有时几天），文件本身是可达的、格式正确的。如果持续不刷新，可以到 AdSense 面板「设置 → 我的广告文件」里请求重新抓取。

## 10. 常见坑（历史踩过）

- `paramiko` 首次装：`pip3 install paramiko`
- SSH 需要 `sudo` 时用 `echo pw | sudo -S`，不要用 `sshpass`
- 老 `gh132` 目录权限是 root，`cp` 会 permission denied，必须先 `sudo cp -f`
- Admin API 路径必须是 `/zanhua/api/admin/...`，否则会被 `checkAdmin` 拒绝（提示「请使用 zanhuaweb.asia/zanhua/ 访问管理员后台」）
- `adUpload` multer 字段名是 **`files`（复数）**，且是 `multer.array`
- `adUpload` 返回结构：`{code:1, data:{urls:[...], covers:[...]}}`
- Python f-string 里嵌 JS 的 `{}` 会解析报错，改成写脚本文件 SFTP 上传再执行
- GitHub API 从沙箱直连会被 GnuTLS / HTTP2 stream 报错，必须**通过 HK 服务器**发 curl（HK 直连 GitHub 可达）

## 11. 遗留 / 待做

- **需要在下次允许重启时一并做**（因为会强制登出，用户没主动要求就先攒着）：
  - `EMBED_QUALITY` 88 → 80（水印嵌入 JPEG 质量，省服务器 CPU）
  - admin extract 超时 `3e4` → `3e5`
  - `EXTRACT_TIMEOUT_MS` `12e4` → `24e4`
- AdSense 如果继续报 ads.txt 未找到，去 AdSense 面板请求重新抓取

## 12. 关键代码定位（app.js）

| 位置 | 说明 |
|---|---|
| 行 47 | `API_HOST`（v124 修改，按 hostname 分派） |
| 行 49 | `API_FALLBACK` |
| 行 416 | `adDlGate` — 下载时暂停 imgPrefetch |
| 行 428 | `adQueueRun` — 优先级队列调度 |
| 行 456 | `adBootPriority` — 骨架屏阶段优先下载第一条广告（v124 新增 localStorage 保存） |
| 行 675 | `adFetchNow` — 拉单条广告 blob |
| 行 705 | `adVideoBlobUrl` — 加入队列并返回 promise |
| 行 1712 | `api()` — 所有 API 请求入口（带重试和 forceLogout 处理） |
| 行 4137 | `loadPosts` — 首页帖子加载 |
| 行 13082 | 页面启动 boot 段（v124 在此新增广告视频 boot 预下载） |

## 13. 关键代码定位（server.js）

| 位置 | 说明 |
|---|---|
| 行 423 | `ALLOWED_ORIGINS`（CORS） |
| 行 425 | `app.use` CORS 中间件 |
| 行 555 | 部分接口 `Access-Control-Allow-Origin: *` |
| 行 13311 | `adUpload` handler |
| `parseToken()` | Authorization 空/无效 → 返回 null → 游客路径 |
| `postList` | 游客返回 `{code:1, data:[4条]}`；`limited:true` 让前端显示「登录查看更多」 |

---

**接手第一步**：SSH 到 HK → `md5sum /var/www/html/zanhua/app.js`（应为 `543e5f7da98d9b9f7d702681350f7945`）→ `curl -sI https://zanhua.asia/ads.txt` 应 200。

**接手第二步**：用手机打开 `https://zanhua.asia`（无痕/未登录）→ 首页应能看到 4 条帖子；继续下滑应出现「登录查看更多内容」提示。


## 14. v125 安全加固（2026-11-11）

本次更新集中修复安全漏洞，无功能变更。版本 N=125，公开版本 `v1.4.5`。

### 路径穿越防护
`server.js` 以下端点增加 `..` / `\` 过滤 + `path.basename()` 双保险：
- `GET /res/fonts/:filename`
- `GET /res/pay/:filename`
- `GET /uploads/posts/:filename`（thumb 处理器）
- `GET /uploads/posts/:filename`（主处理器）
- `use /uploads`（通用 thumb 处理器，使用 `req.path`）
- `POST /api/signVideo`（`normalized.includes('..')` 检查）

nginx 层 `zanhua.asia` HTTP+HTTPS 块添加：`if ($request_uri ~* "\.\.") { return 403; }`

### X-Admin-Via 后门移除（P0-1）
- `server.js`：删除 `req.headers["x-admin-via"] === "banli"` 信任逻辑
- nginx（zanhua.asia + banli.site）：所有 proxy location 加 `proxy_set_header X-Admin-Via "";`
- CORS `Access-Control-Allow-Headers` 移除 `X-Admin-Via`

### 管理员 API 限速（P0-2）
`server.js` 新增 `adminRateLimit`：同一 IP 每分钟 admin API 超 60 次 → 429。

### admin.html XSS 修复（P1-1）
`keyword`、`h.nickname`、`s.user_nickname`、`v.violation_category`、`r.msg`、`b.value`、`b.appeal_reason`、`t.code` 均改用 `escapeHtml()` 转义。

### app.js XSS 修复（P1-2）
`c.lastMessage`（3 处）、`v.violation_category`（2 处）、`r.msg`（3 处）、`res.msg`（4 处）、`data.msg`、弹窗 `msg` 均加 `escapeHtml()`。

### 其他修复
- P1-4 企业上传：`entUpload` 加 `fileFilter` 白名单（pdf/doc/xls/ppt/zip/jpg/png/mp4 等）
- P1-5 JSON body：200MB → 2MB（防 DoS）
- P2-3 上传错误：`err.message` → `"上传失败，请重试"`

### P0-3 说明
`CODE_SIGN_SALT`、`ZANHUA_IDCARD_KEY`、`ZANHUA_TOKEN_SECRET` 已通过 pm2 环境变量固定，不依赖硬编码兜底值。本次未轮换（轮换会使现有兑换码失效）。

### pm2 状态
pm2 restart 未加 `--update-env`，环境变量保留，`ZANHUA_TOKEN_SECRET` 不变，**用户未被强制退出**。

