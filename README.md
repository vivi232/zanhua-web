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
- Token 密钥（当前）：`e8226579...[REDACTED-ZANHUA-TOKEN-SECRET]`
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



## 15. v1.4.6（index.html N=126）评论加载修复

### 根因：评论广告导致无限递归崩溃（Stack Overflow）

`commentList` API 为已登录用户注入广告评论（`withCommentAds` → `injectCommentAdsFor`）。
广告对象由 `adCommentToSend()` 生成，其 `post_seq: 0`、`parent_seq: 0`。

`app.js` `loadComments()` 中 `buildTree(0)` 会取所有 `parent_seq == 0` 的条目，包括该广告。
`renderTopLevel(ad)` 调用 `collectAllDescendants(ad.post_seq = 0)`，后者再次找到 `parent_seq == 0` 的所有条目（包括广告本身），递归调用 → 无限递归 → 浏览器抛出 `RangeError: Maximum call stack size exceeded` → `list.innerHTML` 永不赋值 → 骨架屏永久停留。

**用户可见症状**：登录后打开任何有评论的帖子，评论区永久停留在加载骨架状态。未登录时广告不注入，故未登录用户不受影响。

### 修复（app.js v126）

三处 `renderTopLevel` 函数（帖子详情、表白墙、作业）均在开头加入：
```js
if (c.is_ad) return renderComment(c, "", "");
// 或 renderHwComment(c, "", "") 视场景而定
```

广告作为顶层元素直接渲染，不再参与 `collectAllDescendants` 递归。

### 附带修复：评论缓存竞态条件（race condition）

`_goPostDetailDirect()` 在命中 `postDetailCache` 时并行发起两个请求：`commentList` 和后台 `postDetail` 刷新。若 `postDetail` 先返回且数据有变（`!_same`），则触发第二次 `render()`，此时 `#commentList` 节点被替换，`loadComments()` 第二次运行时检查到缓存与数据相同（`_cc0.raw === html`）却跳过 `list.innerHTML = html` → 骨架持续。

修复：在缓存命中判断中加 DOM 有效性检查：
```js
if (_cc0 && _cc0.raw === html) {
    if (!list.querySelector(".comment-item")) list.innerHTML = _cc0.html;
    _rebindCommentExpandButtons(list);
    bindCommentLongPress();
    return;
}
```


## 16. v1.4.7（index.html N=127）广告评论 + 导航提速

### 评论广告图片不可见（collapsed 截断）

广告评论的 `content` 被包裹在 `.c-content.collapsed`（`-webkit-line-clamp: 3`），图片在折叠区外，用户必须点"展开"才能看到。

修复（app.js）：两处 `loadComments`（帖子详情、表白墙）渲染逻辑：
```js
`<div class="c-content${c.is_ad ? "" : " collapsed"}" ...>`
```
广告条目直接去掉 `collapsed`，全图无需展开即可见。

### 评论广告图片 1:1 裁剪

CSS `.post-images img { aspect-ratio: 1; object-fit: cover; }` 将所有帖子图片强制裁剪为 1:1。

修复（app.css）：在 `.comment-replies .c-content` 规则后新增：
```css
.comment-item .post-images img { aspect-ratio: auto; object-fit: contain; }
```
评论区图片按原比例显示。

### 评论广告位置：随机 → 始终最顶部

`injectCommentAds()` 原来使用 `feedAdSlots()` 随机插位。

修复（server.js）：固定插入位置：
```js
out.splice(0, 0, { ...onlyAd, is_ad: true });
```

### 帖子详情导航慢（水印预检阻塞）

`goPostDetail()` 原来先 `await` 一次 `checkWatermark` API，再跳转，导致点击后白等。

修复：水印检查移入 `_goPostDetailDirect()` 的 `postDetail` API 回调中；
`showProtectedPostWarning(postId, onConfirm)` 新增第二个参数，点击确认后直接渲染，不再重复压栈。

### 后台 postDetail 刷新触发不必要重渲染

缓存命中路径中，`_goPostDetailDirect()` 并行发 `api("/postDetail")` 后台刷新；
原逻辑：数据有任何差异（含点赞数）就 `render()` → 闪屏。

修复：只比较 `content` / `title` / `images`，其余字段静默更新：
```js
const contentChanged = r.data.content !== _pd.data.content
    || r.data.title !== _pd.data.title
    || r.data.images !== _pd.data.images;
if (contentChanged && document.getElementById("commentList")) { currentPostDetail = r.data; render(); }
else { currentPostDetail = r.data; }
```



## 17. v1.4.8（index.html N=128）帖子信息流广告文案样式

### 问题

`adRowToSend()` 返回帖子广告对象，文案放在 `title` 字段，`content` 字段为空。
`renderFeedItem()` 对 `p.title` 使用 `font-weight: 600` 标题样式，广告文案看起来像标题加粗，与正常帖子标题无异。

### 修复（app.js）

`renderFeedItem` 中区分广告与非广告的 title 渲染：
```js
${p.title && !isAd ? `<div style="padding:0 16px 6px;font-size:16px;font-weight:600;">${escapeHtml(p.title)}</div>` : ""}
${isAd && p.title ? `<div class="post-content" style="padding:0 16px 6px;">${formatContentWithTopics(p.title)}</div>` : ""}
```
广告文案改为 `.post-content` 正文样式（正常字重），视觉与帖子正文一致。


## 18. v1.4.9（index.html N=129）广告视频循环 + 评论图片布局 + 导航加速

### 广告视频反复重载问题

广告视频播放结束后，`IntersectionObserver` 或定时器触发 `playAdVideo()`，该函数对已有 `src` 的视频调用 `v.play()`，导致浏览器从头重新播放（blob URL 播放结束→再play→回到0秒）。

**修复（app.js）**：广告视频 `<video>` 添加 `loop` 属性：
```html
<video muted playsinline autoplay loop preload="auto" ...>
```

视频自然循环播放，不再触发 IO 重启。

同时改善 `hookAdVideoPlayer` 的 `error` 事件处理：若视频已处于 `ready` 状态且有 `src`，仅记录当前时间戳、延迟 400ms 重试 play，不删除 `src`、不显示加载图标：
```js
if (pl.classList.contains("ready") && vv.getAttribute("src")) {
    const _t = vv.currentTime;
    setTimeout(function() { vv.currentTime = _t; vv.play(); }, 400);
    return;
}
```

### 评论广告图片：对齐正文首字 + 缩至 2/3 宽

`.post-images { padding: 0 16px 8px; }` 的全局左 padding 使图片偏离文字左边 16px。

**修复（app.css）**：
```css
.c-content .post-images { padding: 0 0 8px; }
.c-content .post-images.single img { width: 66.67%; }
```

图片左边与正文首字对齐，宽度为文字区域的 2/3。

### 帖子详情导航仍慢：预填充缓存

首次点击帖子进入详情时，`postDetailCache` 为空，必须等待 `/postDetail` API 响应，期间显示"加载中"。

**修复（app.js）**：feed 数据加载完成后，立即用 feed 数据填充 `postDetailCache`（排除广告帖和受水印保护帖）。用户点击任意 feed 中的帖子时，缓存路径命中，立即渲染内容；后台 `/postDetail` 刷新补充 liked/collected 状态。
```js
list.forEach(function(p) {
    if (p && p.id && !p.is_ad && p.watermark_protected != 1) {
        postDetailCache[String(p.id)] = { data: p, ts: Date.now(), raw: JSON.stringify(p) };
    }
});
```

`refreshFeedDelta()` 中新增帖子同样写入缓存。
