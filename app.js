const _pathFirst = function() {
    const _segs = window.location.pathname.split("/").filter(Boolean);
    if (_segs.length && _segs[0] === "appeal") return "";
    if (_segs.length && /^inv=/.test(_segs[0])) return "";
    return _segs[0] || "";
}();

const BASE_PATH = _pathFirst ? "/" + _pathFirst : "";

(function() {
    try {
        let inv = "";
        const pm = window.location.pathname.match(/\/inv=([A-Za-z0-9]{8})/);
        const qm = window.location.search.match(/[?&]inv=([A-Za-z0-9]{8})/);
        if (pm) inv = pm[1]; else if (qm) inv = qm[1];
        if (inv) {
            try {
                localStorage.setItem("zanhua_invite_code", inv);
            } catch (e) {}
        }
        if (/\/inv=/.test(window.location.pathname) || window.location.search.indexOf("inv=") !== -1) {
            const qs = function() {
                try {
                    const u = new URLSearchParams(window.location.search);
                    u.delete("inv");
                    return u.toString();
                } catch (e) {
                    return "";
                }
            }();
            const cleanUrl = window.location.origin + window.location.pathname.replace(/\/inv=[^/?#]+$/, "") + (qs ? "?" + qs : "");
            try {
                history.replaceState({}, "", cleanUrl);
            } catch (e) {}
        }
    } catch (e) {}
})();

function getInviteCode() {
    try {
        return localStorage.getItem("zanhua_invite_code") || "";
    } catch (e) {
        return "";
    }
}

const API_HOST = "https://154.201.81.86";

const API_BASE = API_HOST + "/api";

const MEDIA_BASE = API_HOST + "/zanhua";

const DEFAULT_AVATAR = MEDIA_BASE + "/uploads/default_avatar.webp";

const PAY_QR_URL = MEDIA_BASE + "/res/pay/wechat_pay_qr.webp";

function resolveMediaUrl(url) {
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    const s = String(url);
    if (s.indexOf("/zanhua/") === 0) {
        return API_HOST + s;
    }
    if (s.indexOf("/uploads/") === 0 || s.indexOf("/res/") === 0) {
        return MEDIA_BASE + s;
    }
    if (s.indexOf("uploads/") === 0 || s.indexOf("res/") === 0) {
        return MEDIA_BASE + "/" + s;
    }
    return MEDIA_BASE + "/" + s.replace(/^\/+/, "");
}

function withMediaAuth(url) {
    const u = resolveMediaUrl(url);
    if (!u) return "";
    const tok = getToken();
    if (!tok) return u;
    return u + (u.indexOf("?") >= 0 ? "&" : "?") + "token=" + encodeURIComponent(tok);
}

function resolveThumb(url) {
    const u = resolveMediaUrl(url);
    if (/\/uploads\/posts\/[^?]*\.(webp|jpe?g)/i.test(u)) {
        const sep = u.indexOf("?") >= 0 ? "&" : "?";
        const tok = getToken();
        return u + sep + "thumb=1" + (tok ? "&token=" + encodeURIComponent(tok) : "");
    }
    return u;
}

function thumbToOrig(thumbUrl) {
    try {
        const u = new URL(thumbUrl, location.href);
        u.searchParams.delete("thumb");
        return u.href;
    } catch (e) {
        return "";
    }
}

const imgPrefetch = function() {
    let queue = [];
    let active = 0;
    let paused = false;
    const seen = new Set;
    const MAX_ACTIVE = 2;
    function pump() {
        if (paused) return;
        while (active < MAX_ACTIVE && queue.length) {
            const url = queue.shift();
            if (!url || seen.has(url)) continue;
            seen.add(url);
            active++;
            const img = new Image;
            img.onload = img.onerror = function() {
                active--;
                pump();
            };
            img.src = url;
        }
    }
    return {
        push: function(urls) {
            for (let i = 0; i < urls.length; i++) {
                if (urls[i] && !seen.has(urls[i])) queue.push(urls[i]);
            }
            pump();
        },
        pause: function() {
            paused = true;
        },
        resume: function() {
            paused = false;
            pump();
        }
    };
}();

function trackImagesContainer(container) {
    if (!container) return;
    if (container._prefetchTracked) return;
    container._prefetchTracked = true;
    const imgs = container.querySelectorAll('img[src*="thumb=1"]');
    if (!imgs.length) return;
    const origUrls = [];
    let done = 0;
    const total = imgs.length;
    function onOne() {
        done++;
        if (done >= total) imgPrefetch.push(origUrls);
    }
    for (let i = 0; i < imgs.length; i++) {
        const orig = thumbToOrig(imgs[i].currentSrc || imgs[i].src);
        if (orig) origUrls.push(orig);
        if (imgs[i].complete) {
            done++;
        } else {
            imgs[i].addEventListener("load", onOne);
            imgs[i].addEventListener("error", onOne);
        }
    }
    if (done >= total) imgPrefetch.push(origUrls);
}

function initImagePrefetchObserver() {
    const root = document.getElementById("app") || document.body;
    if (!root || root._prefetchObserverInit) return;
    root._prefetchObserverInit = true;
    const mo = new MutationObserver(function(muts) {
        for (let i = 0; i < muts.length; i++) {
            const m = muts[i];
            if (m.type !== "childList") continue;
            const nodes = m.addedNodes;
            for (let j = 0; j < nodes.length; j++) {
                const node = nodes[j];
                if (node.nodeType !== 1) continue;
                if (node.classList && node.classList.contains("post-images")) {
                    trackImagesContainer(node);
                    continue;
                }
                if (node.querySelectorAll) {
                    const containers = node.querySelectorAll(".post-images");
                    for (let k = 0; k < containers.length; k++) trackImagesContainer(containers[k]);
                }
            }
        }
    });
    mo.observe(root, {
        childList: true,
        subtree: true
    });
}

function cleanProvince(p) {
    if (!p) return "";
    const s = String(p);
    if (/台湾|臺灣|台灣|Taiwan|TW/i.test(s)) return "中国台湾";
    if (/香港|Hong\s?Kong|HK/i.test(s)) return "中国香港";
    if (/澳门|澳門|Macau|Macao|MO/i.test(s)) return "中国澳门";
    return s;
}

const _videoSignCache = new Map;

async function resolveVideoUrl(url) {
    const fixed = resolveMediaUrl(url);
    if (!fixed) return "";
    if (/^(blob:|data:)/i.test(fixed)) return fixed;
    let signPath = fixed;
    if (/^https?:/i.test(fixed)) {
        try {
            const u = new URL(fixed);
            const api = API_HOST ? new URL(API_HOST) : location;
            if (u.host !== api.host || u.pathname.indexOf("/zanhua/uploads/") !== 0) return fixed;
            signPath = u.pathname + u.search;
        } catch (e) {
            return fixed;
        }
    }
    const cached = _videoSignCache.get(signPath);
    if (cached && Math.floor(Date.now() / 1e3) < cached.exp - 30) {
        return cached.url;
    }
    try {
        const res = await api("/signVideo", "POST", {
            path: signPath
        });
        if (res.code === 1 && res.url) {
            let exp = 0;
            try {
                const u = new URL(res.url, location.origin);
                exp = parseInt(u.searchParams.get("exp")) || 0;
            } catch (e) {}
            _videoSignCache.set(signPath, {
                url: res.url,
                exp: exp
            });
            return res.url;
        }
    } catch (e) {}
    return "";
}

let currentPage = "home";

let prevPage = "home";

let pageHistory = [];

const TAB_PAGES = [ "home", "discover", "message", "profile" ];

const envSafeAreaBottom = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--safe-area-inset-bottom")) || 0;

function getViewportRect() {
    let height = window.innerHeight;
    let width = window.innerWidth;
    let top = 0;
    let bottom = height;
    if (window.visualViewport) {
        height = window.visualViewport.height;
        width = window.visualViewport.width;
        top = window.visualViewport.offsetTop;
        bottom = top + height;
    }
    return {
        width: width,
        height: height,
        top: top,
        bottom: bottom
    };
}

function getKeyboardOffset() {
    if (!window.visualViewport) return 0;
    const vv = window.visualViewport;
    if (vv.height >= window.innerHeight) return 0;
    return window.innerHeight - vv.height;
}

function ensureTabbarVisible() {
    const tabbar = document.querySelector(".tab-bar");
    if (!tabbar) return;
    const offset = getKeyboardOffset();
    if (offset > 0) {
        tabbar.style.transform = `translateY(${offset}px)`;
    } else {
        tabbar.style.transform = "";
    }
}

function ensureChatInputVisible() {
    const bar = document.querySelector(".chat-input-bar");
    if (!bar) return;
    const rect = getViewportRect();
    const safeBottom = envSafeAreaBottom || 0;
    let bottom = Math.max(0, window.innerHeight - rect.bottom);
    if (bottom === 0) bottom = safeBottom; else bottom = bottom + Math.max(0, safeBottom - rect.top);
    bar.style.bottom = `${bottom}px`;
    bar.style.paddingBottom = bottom <= safeBottom ? safeBottom > 0 ? safeBottom + "px" : "" : "0px";
}

function ensureCommentInputVisible() {
    const bar = document.querySelector(".comment-input-bar");
    if (!bar) return;
    const rect = getViewportRect();
    const safeBottom = envSafeAreaBottom || 0;
    let bottom = Math.max(0, window.innerHeight - rect.bottom);
    if (bottom === 0) bottom = safeBottom;
    bar.style.bottom = `${bottom}px`;
    bar.style.paddingBottom = bottom <= safeBottom ? safeBottom > 0 ? safeBottom + "px" : "" : "0px";
}

function adjustModalsToKeyboard() {
    const rect = getViewportRect();
    const safeBottom = envSafeAreaBottom || 0;
    const availableTop = rect.top;
    const availableHeight = rect.height;
    document.querySelectorAll(".dialog-modal").forEach(overlay => {
        overlay.style.top = availableTop + "px";
        overlay.style.bottom = "0px";
        overlay.style.height = availableHeight + "px";
        overlay.style.alignItems = "center";
    });
    document.querySelectorAll(".modal-overlay").forEach(overlay => {
        let bottomPad = Math.max(0, window.innerHeight - rect.bottom);
        if (bottomPad === 0) bottomPad = safeBottom; else bottomPad = bottomPad + Math.max(0, safeBottom - rect.top);
        overlay.style.top = availableTop + "px";
        overlay.style.bottom = "0px";
        overlay.style.height = availableHeight + "px";
        overlay.style.paddingBottom = bottomPad + "px";
    });
}

window.adjustModalsToKeyboard = adjustModalsToKeyboard;

function ensureFabVisible() {
    const fab = document.getElementById("fabCreateBtn");
    if (!fab) return;
    const offset = getKeyboardOffset();
    if (offset > 0) {
        fab.style.bottom = `${offset + 80}px`;
    } else {
        fab.style.bottom = "calc(80px + env(safe-area-inset-bottom))";
    }
}

function navigateTo(page) {
    pageHistory.push(currentPage);
    currentPage = page;
    try {
        history.pushState({
            page: page
        }, "", "#" + page);
    } catch (e) {}
    window.scrollTo(0, 0);
    render();
    updateTabbar();
}

let posts = [];

let feedCache = null;

let discoverCache = {};

let discoverActiveTab = "hot";

let chatListCache = null;

let profileHeaderCache = null;

let profileGridCache = {};

let homeworkListCache = {};

let homeworkActiveSubject = "全部";

let asyncHtmlCache = {};

let commentListCache = {};

let postDetailCache = {};

let userProfileObjCache = {};

let topicDetailCache = {};

let userProfileCache = {};

function cacheGet(store, key) {
    const it = store[key];
    return it && it.html ? it : null;
}

function cacheSet(store, key, html, extra) {
    if (!html) return;
    store[key] = Object.assign({
        html: html,
        ts: Date.now()
    }, extra || {});
}

function clearContentCaches() {
    discoverCache = {};
    discoverActiveTab = "hot";
    chatListCache = null;
    profileHeaderCache = null;
    profileGridCache = {};
    homeworkListCache = {};
    homeworkActiveSubject = "全部";
    asyncHtmlCache = {};
    commentListCache = {};
    topicDetailCache = {};
    userProfileCache = {};
    userProfileObjCache = {};
    postDetailCache = {};
}

let postPage = 1;

let loading = false;

let noMorePosts = false;

let currentPostDetail = null;

let myAvatar = "";

let myVerificationTypes = [];

let myVerifications = [];

let visibleWatermarkEnabled = false;

let currentConfessionDetail = null;

let confessionReplyTargetSeq = 0;

let currentViewUser = null;

let chatUser = null;

let chatMessages = [];

let chatTimer = null;

let currentSearchResult = {
    posts: [],
    users: []
};

let selectedCreateImages = [];

let codeTimer = 0;

let captchaIns = null;

let loginCaptchaIns = null;

let captchaRequestLock = false;

let loginCaptchaRequestLock = false;

let clientConfigPromise = null;

let clientConfig = {
    captchaSceneId: ""
};

const AdManager = function() {
    let scriptPromise = null;
    function cfg() {
        return clientConfig && clientConfig.adConfig && clientConfig.adConfig.enabled === true ? clientConfig.adConfig : null;
    }
    function tier() {
        const t = typeof myVerificationTypes !== "undefined" && Array.isArray(myVerificationTypes) ? myVerificationTypes : [];
        if (t.includes("premium") || t.includes("enterprise")) return "adfree";
        if (t.includes("advanced")) return "reduced";
        return "normal";
    }
    function isAdFree() {
        return cfg() !== null && tier() === "adfree";
    }
    function skipAt(index) {
        const c = cfg();
        if (!c) return true;
        if (isAdFree()) return true;
        if (tier() === "reduced") {
            return index * 7919 % 100 < 30;
        }
        return false;
    }
    function ensureScript() {
        const c = cfg();
        if (!c) return Promise.resolve();
        if (scriptPromise) return scriptPromise;
        if (window.adsbygoogle) return Promise.resolve();
        scriptPromise = new Promise(function(resolve) {
            try {
                const s = document.createElement("script");
                s.async = true;
                s.crossOrigin = "anonymous";
                s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(c.client || "");
                s.onload = resolve;
                s.onerror = resolve;
                document.head.appendChild(s);
            } catch (e) {
                resolve();
            }
        });
        return scriptPromise;
    }
    function injectFeed(cardHtmlArr) {
        const c = cfg();
        if (!c || isAdFree()) return cardHtmlArr;
        const every = c.slots && c.slots.feedEvery || 8;
        const slotId = c.slots && c.slots.feedSlot || "";
        const out = [];
        let adIndex = 0;
        for (let i = 0; i < cardHtmlArr.length; i++) {
            out.push(cardHtmlArr[i]);
            if ((i + 1) % every === 0 && i + 1 < cardHtmlArr.length) {
                if (!skipAt(adIndex)) {
                    out.push('<div class="ad-slot ad-feed" data-ad-index="' + adIndex + '" style="margin:8px 0;">' + '<ins class="adsbygoogle" style="display:block" data-ad-client="' + (c.client || "") + '"' + (slotId ? ' data-ad-slot="' + slotId + '"' : "") + ' data-ad-format="fluid" data-ad-layout-key="-6t+ed+2i-1n-4w"></ins></div>');
                }
                adIndex++;
            }
        }
        return out;
    }
    function fill(container) {
        const c = cfg();
        if (!c || isAdFree()) return Promise.resolve();
        return ensureScript().then(function() {
            try {
                if (!window.adsbygoogle) return;
                (container || document).querySelectorAll(".ad-slot ins.adsbygoogle:not([data-pushed])").forEach(function(el) {
                    el.setAttribute("data-pushed", "1");
                    try {
                        (window.adsbygoogle = window.adsbygoogle || []).push({});
                    } catch (e) {}
                });
            } catch (e) {}
        });
    }
    return {
        injectFeed: injectFeed,
        fill: fill,
        isAdFree: isAdFree,
        cfg: cfg
    };
}();

let isPublishing = false;

let isFileUploading = false;

let scrollToCommentFlag = false;

let createTitle = "";

let createContent = "";

let createLocation = "";

let createVisibility = "public";

let createDeclaration = "";

let createAllowDownload = 0;

function removeVisibleUidWatermark() {
    const visibleWm = document.getElementById("visible-wm-overlay");
    if (visibleWm) visibleWm.remove();
}

function _isCurrentPostProtected() {
    const p = currentPostDetail || currentConfessionDetail || currentHomeworkDetail;
    return p && p.watermark_protected == 1;
}

function injectVisibleUidWatermark() {
    const old = document.getElementById("visible-wm-overlay");
    if (old) old.remove();
    const needShow = visibleWatermarkEnabled || _isCurrentPostProtected();
    if (!needShow) return;
    const uid = getUid();
    if (!uid) return;
    const overlay = document.createElement("div");
    overlay.id = "visible-wm-overlay";
    overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;overflow:hidden;will-change:transform;-webkit-transform:translateZ(0);transform:translateZ(0);";
    const inner = document.createElement("div");
    inner.style.cssText = "position:absolute;top:-50%;left:-50%;width:220%;height:220%;transform:rotate(-30deg);transform-origin:center center;display:flex;flex-wrap:wrap;gap:0;align-content:center;justify-content:center;";
    const cssW = window.innerWidth || 375;
    const cssH = window.innerHeight || 812;
    const cellW = Math.max(140, Math.round(Math.min(cssW, cssH) * .45));
    const cellH = Math.round(cellW * .75);
    const fontSize = Math.max(11, Math.round(cellW / 16));
    const color = "rgba(0,0,0,0.18)";
    const perRow = Math.ceil(cssW * 2.2 / cellW) + 2;
    const rows = Math.ceil(cssH * 2.2 / cellH) + 2;
    const total = perRow * rows;
    let html = "";
    for (let i = 0; i < total; i++) {
        html += '<span style="display:inline-block;width:' + cellW + "px;text-align:center;font-size:" + fontSize + "px;color:" + color + ";padding:" + Math.round(cellH / 4) + 'px 0;white-space:nowrap;font-weight:600;letter-spacing:1px;line-height:1;">UID' + uid + "</span>";
    }
    inner.innerHTML = html;
    overlay.appendChild(inner);
    document.body.appendChild(overlay);
}

function _ensureVisibleWmOnScroll() {
    const overlay = document.getElementById("visible-wm-overlay");
    if (!overlay) {
        const needShow = visibleWatermarkEnabled || _isCurrentPostProtected();
        if (needShow && (currentPage === "postDetail" || currentPage === "confessionDetail" || currentPage === "homeworkDetail")) {
            injectVisibleUidWatermark();
        }
    }
}

function updateScreenWatermark() {
    if (currentPage === "postDetail" || currentPage === "confessionDetail" || currentPage === "homeworkDetail") {
        const needShow = visibleWatermarkEnabled || _isCurrentPostProtected();
        if (needShow) {
            requestAnimationFrame(injectVisibleUidWatermark);
        } else {
            removeVisibleUidWatermark();
        }
    } else {
        removeVisibleUidWatermark();
    }
    requestAnimationFrame(updateDctScreenWatermark);
}

const DCT_WM_PAGES = [ "postDetail", "confessionDetail", "homeworkDetail", "userProfile", "discover", "chat" ];

const DCT_WM_OPACITY = 1;

let dctWmCanvas = null;

let dctWmTileImg = null;

let dctWmTileLoading = null;

let dctWmTileUrl = null;

function dctWmShouldShow() {
    if (!getUid()) return false;
    return DCT_WM_PAGES.indexOf(currentPage) >= 0;
}

function dctWmLoadTile() {
    if (dctWmTileImg) return Promise.resolve(dctWmTileImg);
    if (dctWmTileLoading) return dctWmTileLoading;
    dctWmTileLoading = fetch(API_BASE + "/screenWmTile", {
        headers: {
            Authorization: getToken()
        },
        cache: "no-store"
    }).then(r => {
        if (!r.ok) throw new Error("tile HTTP " + r.status);
        return r.blob();
    }).then(blob => new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image;
        img.onload = () => {
            dctWmTileImg = img;
            dctWmTileUrl = url;
            dctWmTileLoading = null;
            resolve(img);
        };
        img.onerror = () => {
            try {
                URL.revokeObjectURL(url);
            } catch (e) {}
            dctWmTileLoading = null;
            reject(new Error("tile decode fail"));
        };
        img.src = url;
    })).catch(e => {
        dctWmTileLoading = null;
        throw e;
    });
    return dctWmTileLoading;
}

function dctWmClearTile() {
    if (dctWmTileUrl) {
        try {
            URL.revokeObjectURL(dctWmTileUrl);
        } catch (e) {}
    }
    dctWmTileImg = null;
    dctWmTileLoading = null;
    dctWmTileUrl = null;
}

function dctWmRemoveCanvas() {
    if (dctWmCanvas) {
        dctWmCanvas.remove();
        dctWmCanvas = null;
    }
}

function dctWmPaint(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const vw = Math.max(1, Math.round(window.innerWidth * dpr));
    const vh = Math.max(1, Math.round(window.innerHeight * dpr));
    if (canvas.width !== vw || canvas.height !== vh) {
        canvas.width = vw;
        canvas.height = vh;
    }
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, vw, vh);
    if (!dctWmTileImg) return;
    const tileSrc = dctWmTileImg.naturalWidth || dctWmTileImg.width || 1024;
    const L = Math.max(vw, vh);
    const S = tileSrc / L;
    ctx.globalAlpha = DCT_WM_OPACITY;
    ctx.imageSmoothingEnabled = true;
    for (let y = 0; y < vh; y += L) {
        for (let x = 0; x < vw; x += L) {
            const dw = Math.min(L, vw - x);
            const dh = Math.min(L, vh - y);
            ctx.drawImage(dctWmTileImg, 0, 0, dw * S, dh * S, x, y, dw, dh);
        }
    }
    ctx.globalAlpha = 1;
}

function updateDctScreenWatermark() {
    if (!dctWmShouldShow()) {
        dctWmRemoveCanvas();
        return;
    }
    let canvas = dctWmCanvas;
    if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9997;mix-blend-mode:multiply;";
        document.body.appendChild(canvas);
        dctWmCanvas = canvas;
    }
    dctWmLoadTile().then(() => {
        if (!dctWmShouldShow()) {
            dctWmRemoveCanvas();
            return;
        }
        dctWmPaint(canvas);
    }).catch(() => {});
}

let createScheduleTime = "";

let createPollData = {
    options: [],
    votes: {}
};

let createVisibleUsers = [];

let createBlockedUsers = [];

let tempUserSelectType = "visible";

let replyTargetSeq = 0;

let inputCallback = null;

let badgeRefreshTimer = null;

let unreadTotalCount = 0;

let atSearchCache = {};

let atSearchTimer = null;

let currentUploadXhr = null;

let uploadProgressCache = {};

function getToken() {
    return localStorage.getItem("zanhua_token") || "";
}

function getDeviceId() {
    let did = localStorage.getItem("zanhua_device_id");
    if (!did) {
        did = "d_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 12);
        localStorage.setItem("zanhua_device_id", did);
    }
    return did;
}

function getClientFp() {
    try {
        let fp = localStorage.getItem("zanhua_client_fp");
        if (fp) return fp;
        const parts = [ navigator.userAgent, String(screen.width) + "x" + String(screen.height) + "x" + String(screen.colorDepth), String(screen.availWidth) + "x" + String(screen.availHeight), navigator.language || "", String((new Date).getTimezoneOffset()), String(navigator.hardwareConcurrency || ""), String(navigator.maxTouchPoints || 0), navigator.platform || "", navigator.deviceMemory || "", String(window.devicePixelRatio || 1), String(screen.orientation && screen.orientation.type || ""), navigator.cookieEnabled ? "1" : "0", function() {
            try {
                localStorage.setItem("_fp_t", "1");
                localStorage.removeItem("_fp_t");
                return "1";
            } catch (e) {
                return "0";
            }
        }(), function() {
            try {
                sessionStorage.setItem("_fp_t", "1");
                sessionStorage.removeItem("_fp_t");
                return "1";
            } catch (e) {
                return "0";
            }
        }(), function() {
            try {
                var c = document.createElement("canvas");
                c.width = 200;
                c.height = 50;
                var x = c.getContext("2d");
                x.fillStyle = "#f60";
                x.fillRect(0, 0, 200, 50);
                x.fillStyle = "#069";
                x.font = "14px Arial";
                x.fillText("zanhua_fp", 10, 30);
                x.strokeStyle = "#9ac";
                x.beginPath();
                x.arc(50, 25, 15, 0, Math.PI * 2);
                x.stroke();
                return c.toDataURL().slice(-60);
            } catch (e) {
                return "no_canvas";
            }
        }() ];
        let seed = parts.join("|");
        let h = 0;
        for (let i = 0; i < seed.length; i++) {
            h = (h << 5) - h + seed.charCodeAt(i) | 0;
        }
        fp = "fp_" + Math.abs(h).toString(36) + "_" + Date.now().toString(36);
        localStorage.setItem("zanhua_client_fp", fp);
        return fp;
    } catch (e) {
        return "";
    }
}

(function() {
    let _lastRiskPhone = "", _lastRiskAt = 0;
    document.addEventListener("focusout", function(ev) {
        const el = ev.target;
        if (!el || el.id !== "loginAuthPhone") return;
        const raw = String(el.value || "").trim();
        if (!raw) return;
        let v = raw.replace(/[\s\-\(\)\u3000]/g, "");
        if (/^\+86\d{11}$/.test(v)) v = v.slice(3); else if (/^86\d{11}$/.test(v)) v = v.slice(2);
        if (!/^1\d{10}$/.test(v)) return;
        const now = Date.now();
        if (v === _lastRiskPhone && now - _lastRiskAt < 2e3) return;
        _lastRiskPhone = v;
        _lastRiskAt = now;
        const old = document.getElementById("phoneRiskWarning");
        if (old) old.remove();
        fetch(API_BASE + "/checkPhoneRisk", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                phone: v
            })
        }).then(x => x.json()).then(() => {}).catch(() => {});
    });
})();

function showBanNotice(msg) {
    let popup = document.getElementById("ban-notice-popup");
    if (!popup) {
        popup = document.createElement("div");
        popup.id = "ban-notice-popup";
        popup.style.cssText = "position:fixed;top:0;left:0;right:0;background:rgba(255,36,66,0.97);color:#fff;text-align:center;padding:12px 16px;font-size:14px;font-weight:500;z-index:999999;transform:translateY(-100%);transition:transform 0.3s cubic-bezier(0.23, 1, 0.32, 1);";
        document.body.appendChild(popup);
    }
    popup.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> ' + (msg || "您的账号已被限制登录") + ' <a href="javascript:void(0)" onclick="hideLoginModal();goPage(\'violationDetail\')" style="color:#ffe58f;text-decoration:underline;margin-left:6px;">查看详情</a>';
    popup.style.display = "block";
    requestAnimationFrame(() => {
        popup.style.transform = "translateY(0)";
    });
    clearTimeout(window._banNoticeTimer);
    window._banNoticeTimer = setTimeout(() => {
        popup.style.transform = "translateY(-100%)";
        setTimeout(() => {
            popup.style.display = "none";
        }, 300);
    }, 6e3);
}

let currentUsername = "";

let currentNickname = "";

function requireLogin() {
    if (!getToken()) {
        showLoginModal();
        return false;
    }
    return true;
}

function handleActionError(res, fallbackMsg) {
    if (res && res.msg && res.msg.indexOf("涉嫌") !== -1) {
        showViolationBubble("已违规");
        return true;
    }
    showToast(res && res.msg || fallbackMsg);
    return false;
}

function setToken(t) {
    const _prevUid = getUid();
    localStorage.setItem("zanhua_token", t);
    if (_prevUid && _prevUid !== getUid()) clearUserMediaCache();
    feedCache = null;
    clearContentCaches();
    if (typeof dctWmClearTile === "function") dctWmClearTile();
    dctWmRemoveCanvas();
}

function getUid() {
    try {
        return atob(getToken().replace(/^admin_/, "").split(".")[0]).split(":")[0];
    } catch (e) {
        return "";
    }
}

function isAdminAccount() {
    return getToken().indexOf("admin_") === 0 || currentNickname === "管理员";
}

function clearUserMediaCache() {
    try {
        if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: "clearUserMedia"
            });
        } else if ("caches" in window) {
            caches.delete("zanhua-usermedia-v1");
        }
    } catch (e) {}
}

async function api(url, method = "GET", data = null) {
    const controller = new AbortController;
    const timeoutId = setTimeout(() => controller.abort(), 15e3);
    const opts = {
        method: method,
        headers: {
            Authorization: getToken(),
            "X-Device-Id": getDeviceId(),
            "X-Client-Fp": getClientFp()
        },
        signal: controller.signal
    };
    if (data && method === "POST") {
        opts.headers["Content-Type"] = "application/json";
        opts.body = JSON.stringify(data);
    }
    try {
        const res = await fetch(API_BASE + url, opts);
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error("网络响应异常 (HTTP " + res.status + ")");
        const json = await res.json();
        if (json && json.code === 403 && json.forceLogout) {
            localStorage.removeItem("zanhua_token");
            clearUserMediaCache();
            const info = json.banInfo && typeof json.banInfo === "object" ? json.banInfo : {};
            localStorage.setItem("zanhua_ban_info", JSON.stringify(info));
            showBanNotice(info.userMsg || "账号已被限制");
            throw new Error("账号已封禁");
        }
        if (json && (json.needLogin || json.code === 0 && json.msg === "未登录") && getToken()) {
            localStorage.removeItem("zanhua_token");
            clearUserMediaCache();
        }
        return json;
    } catch (e) {
        clearTimeout(timeoutId);
        if (e.name === "AbortError") throw new Error("请求超时，请检查网络");
        throw e;
    }
}

function apiForm(url, formData, onProgress, timeoutMs, xhrRef) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest;
        if (xhrRef) xhrRef.xhr = xhr;
        xhr.open("POST", API_BASE + url, true);
        xhr.setRequestHeader("Authorization", getToken());
        xhr.setRequestHeader("X-Device-Id", getDeviceId());
        xhr.setRequestHeader("X-Client-Fp", getClientFp());
        if (onProgress && typeof onProgress === "function") {
            xhr.upload.onprogress = e => {
                if (e.lengthComputable) {
                    onProgress(e.loaded, e.total);
                }
            };
        }
        xhr.onload = function() {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    resolve(JSON.parse(xhr.responseText));
                } catch (e) {
                    reject(new Error("服务器返回数据格式错误"));
                }
            } else if (xhr.status === 413) {
                reject(new Error("文件过大，请压缩后重试"));
            } else {
                reject(new Error("上传失败，状态码: " + xhr.status));
            }
        };
        xhr.onerror = function() {
            reject(new Error("网络请求失败，请检查网络连接"));
        };
        xhr.ontimeout = function() {
            reject(new Error("上传请求超时，请检查网络"));
        };
        xhr.onabort = function() {
            reject(new Error("上传已取消"));
        };
        xhr.timeout = timeoutMs || 0;
        xhr.send(formData);
    });
}

function generateVideoThumbnail(file) {
    return new Promise(resolve => {
        try {
            const video = document.createElement("video");
            video.muted = true;
            video.playsInline = true;
            video.setAttribute("playsinline", "");
            video.setAttribute("webkit-playsinline", "");
            video.setAttribute("muted", "");
            video.preload = "auto";
            video.crossOrigin = "anonymous";
            const url = URL.createObjectURL(file);
            video.src = url;
            let resolved = false;
            const SIZE = 320;
            function done(thumbUrl) {
                if (resolved) return;
                resolved = true;
                try {
                    URL.revokeObjectURL(url);
                } catch (e) {}
                resolve(thumbUrl);
            }
            function tryCapture() {
                if (resolved) return;
                if (video.readyState >= 2 && video.videoWidth > 0) {
                    captureThumb();
                }
            }
            video.addEventListener("loadedmetadata", function() {
                try {
                    const seekTime = Math.min(1, (video.duration || 0) * .1 || .5);
                    video.currentTime = seekTime;
                } catch (e) {
                    tryCapture();
                }
            });
            video.addEventListener("loadeddata", tryCapture);
            video.addEventListener("seeked", captureThumb);
            video.addEventListener("canplay", captureThumb);
            video.addEventListener("canplaythrough", captureThumb);
            video.addEventListener("error", function() {
                done(null);
            });
            try {
                video.load();
            } catch (e) {}
            try {
                video.play().catch(() => {});
            } catch (e) {}
            setTimeout(function() {
                if (!resolved && video.readyState >= 2 && video.videoWidth > 0) {
                    captureThumb();
                } else if (!resolved) {
                    done(null);
                }
            }, 8e3);
            function captureThumb() {
                if (resolved) return;
                try {
                    const canvas = document.createElement("canvas");
                    const vw = video.videoWidth || 320;
                    const vh = video.videoHeight || 320;
                    if (vw === 0 || vh === 0) {
                        setTimeout(tryCapture, 200);
                        return;
                    }
                    canvas.width = SIZE;
                    canvas.height = SIZE;
                    const ctx = canvas.getContext("2d");
                    ctx.fillStyle = "#000";
                    ctx.fillRect(0, 0, SIZE, SIZE);
                    const scale = Math.max(SIZE / vw, SIZE / vh);
                    const dw = vw * scale;
                    const dh = vh * scale;
                    const dx = (SIZE - dw) / 2;
                    const dy = (SIZE - dh) / 2;
                    ctx.drawImage(video, dx, dy, dw, dh);
                    const thumb = canvas.toDataURL("image/jpeg", .7);
                    if (thumb && thumb.length > 1e3) {
                        done(thumb);
                    } else {
                        done(null);
                    }
                } catch (e) {
                    done(null);
                }
            }
        } catch (e) {
            resolve(null);
        }
    });
}

function compressImage(file) {
    return new Promise(resolve => {
        if (!file.type.startsWith("image/")) {
            resolve(file);
            return;
        }
        try {
            const reader = new FileReader;
            reader.onerror = () => {
                resolve(file);
            };
            reader.onload = e => {
                const img = new Image;
                img.onerror = () => {
                    resolve(file);
                };
                img.onload = () => {
                    try {
                        const canvas = document.createElement("canvas");
                        const MAX = 1200;
                        let width = img.width, height = img.height;
                        if (width > height) {
                            if (width > MAX) {
                                height *= MAX / width;
                                width = MAX;
                            }
                        } else {
                            if (height > MAX) {
                                width *= MAX / height;
                                height = MAX;
                            }
                        }
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext("2d");
                        ctx.drawImage(img, 0, 0, width, height);
                        canvas.toBlob(blob => {
                            if (!blob) {
                                resolve(file);
                                return;
                            }
                            resolve(new File([ blob ], `compressed_${Date.now()}.webp`, {
                                type: "image/webp"
                            }));
                        }, "image/webp", .85);
                    } catch (err) {
                        resolve(file);
                    }
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        } catch (err) {
            resolve(file);
        }
    });
}

function parseBeijingTime(t) {
    if (!t) return Date.now();
    const s = String(t).trim();
    if (!s) return Date.now();
    if (s.includes("+08:00") || s.includes("Z") || s.includes("GMT")) {
        return new Date(s).getTime();
    }
    const iso = s.replace(" ", "T") + "+08:00";
    return new Date(iso).getTime();
}

function timeAgo(t) {
    if (!t) return "刚刚";
    const diff = Date.now() - parseBeijingTime(t);
    if (isNaN(diff)) return "刚刚";
    if (diff < 3e4) return "刚刚";
    if (diff < 6e4) return Math.floor(diff / 1e3) + "秒前";
    if (diff < 36e5) return Math.floor(diff / 6e4) + "分钟前";
    if (diff < 864e5) return Math.floor(diff / 36e5) + "小时前";
    if (diff < 2592e6) return Math.floor(diff / 864e5) + "天前";
    return String(t).slice(0, 10);
}

function formatNumber(n) {
    n = parseInt(n) || 0;
    if (n >= 1e4) return (n / 1e4).toFixed(1) + "w";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
    return n.toString();
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function formatContentWithTopics(content) {
    if (!content) return "";
    let html = escapeHtml(content).replace(/\n/g, "<br>");
    html = html.replace(/＃/g, "#");
    html = html.replace(/＠/g, "@");
    html = html.replace(/#([^#\s\n]{1,20})#/g, function(m, name) {
        const enc = encodeURIComponent(name);
        return '<span class="post-topic-tag" onclick="event.stopPropagation();goTopicDetail(decodeURIComponent(\'' + enc + "'))\">#" + name + "#</span>";
    });
    html = html.replace(/@\[(\d+)\]([^\s\[\]<]{1,30})/g, function(m, uid, name) {
        return '<span class="post-at-tag" onclick="event.stopPropagation();goUserProfile(\'' + uid + "')\"> @" + name + "</span>";
    });
    return html;
}

function formatCommentContent(content) {
    if (!content) return "";
    let html = escapeHtml(content).replace(/\n/g, "<br>");
    html = html.replace(/@\[(\d+)\]([^\s\[\]<]{1,30})/g, function(m, uid, name) {
        return '<span class="post-at-tag" onclick="event.stopPropagation();goUserProfile(\'' + uid + "')\"> @" + name + "</span>";
    });
    return html;
}

function getVerifSvg(type, size = 14, inline = false) {
    const align = inline ? "vertical-align:-2px;" : "";
    const s = `width:${size}px;height:${size}px;flex-shrink:0;${align}`;
    if (type === "enterprise") {
        return `<img src="${MEDIA_BASE}/res/icons/icon-i5xq4thdo.svg" style="${s};filter:invert(35%) sepia(94%) saturate(1587%) hue-rotate(185deg) brightness(97%) contrast(95%);" class="verif-icon verif-enterprise" alt="认证">`;
    }
    if (type === "basic") {
        return `<img src="${MEDIA_BASE}/res/icons/icon-i5xq4thdo.svg" style="${s};filter:invert(52%) sepia(28%) saturate(614%) hue-rotate(86deg) brightness(94%) contrast(90%);" class="verif-icon verif-basic" alt="普通认证">`;
    }
    if (type === "personal") {
        return `<img src="${MEDIA_BASE}/res/icons/icon-i5xq4thdo.svg" style="${s};filter:invert(68%) sepia(98%) saturate(2000%) hue-rotate(10deg) brightness(95%) contrast(105%);" class="verif-icon verif-personal" alt="认证">`;
    }
    if (type === "advanced") {
        return `<img src="${MEDIA_BASE}/res/icons/icon-jztvozsrv.svg" style="${s};filter:grayscale(100%) brightness(0.82) contrast(1.15);" class="verif-icon verif-advanced" alt="进阶认证">`;
    }
    if (type === "premium") {
        return `<img src="${MEDIA_BASE}/res/icons/icon-jztvozsrv.svg" style="${s}" class="verif-icon verif-premium" alt="高级认证">`;
    }
    return "";
}

function getVerificationTypes(data) {
    if (!data) return [];
    let arr = [];
    if (Array.isArray(data.user_verifications)) arr = data.user_verifications; else if (typeof data.user_verifications === "string") arr = data.user_verifications.split(",").filter(x => x); else if (Array.isArray(data.verifications)) arr = data.verifications; else if (typeof data.verifications === "string") arr = data.verifications.split(",").filter(x => x);
    return arr.map(v => typeof v === "string" ? v : v.type).filter(Boolean);
}

function getVerifOrgName(data, type) {
    let arr = [];
    if (Array.isArray(data.verifications)) arr = data.verifications;
    if (Array.isArray(data.user_verifications)) arr = data.user_verifications;
    const found = arr.find(v => (typeof v === "string" ? v : v.type) === type);
    if (found && typeof found === "object" && found.org_name) return found.org_name;
    return "";
}

function renderListVerification(data) {
    const types = getVerificationTypes(data);
    if (!types.length) return "";
    const priority = [ "enterprise", "premium", "advanced", "personal", "basic" ];
    let displayType = null;
    const settings = data.verif_settings && typeof data.verif_settings === "string" ? JSON.parse(data.verif_settings) : data.verif_settings || {};
    if (settings.name_display && settings.name_display !== "earliest" && types.includes(settings.name_display)) {
        displayType = settings.name_display;
    } else {
        const reversePriority = [ ...priority ].reverse();
        for (const t of reversePriority) {
            if (types.includes(t)) {
                displayType = t;
                break;
            }
        }
    }
    if (!displayType) return "";
    return `<span class="verif-badge">${getVerifSvg(displayType, 15, true)}</span>`;
}

const _NICK_BUBBLE_BG = {
    gradient1: "linear-gradient(135deg,#667eea,#764ba2)",
    gradient2: "linear-gradient(135deg,#f093fb,#f5576c)",
    gradient3: "linear-gradient(135deg,#4facfe,#00f2fe)",
    solid_pink: "#ff6b9d",
    solid_blue: "#1d9bf0",
    solid_gold: "#f5a623"
};

function getNickSettings(data) {
    let s = data && data.verif_settings;
    if (typeof s === "string") {
        try {
            s = JSON.parse(s);
        } catch (e) {
            s = {};
        }
    }
    return s && typeof s === "object" ? s : {};
}

function wrapNick(innerHtml, data) {
    const s = getNickSettings(data);
    const bg = _NICK_BUBBLE_BG[s.nick_bubble];
    const color = /^#[0-9a-fA-F]{6}$/.test(s.nick_color || "") ? s.nick_color : "";
    if (!bg && !color) return innerHtml;
    const pad = bg ? "padding:1px 7px;border-radius:10px;" : "";
    const style = `display:inline-block;${pad}${bg ? "background:" + bg + ";" : ""}${color ? "color:" + color + " !important;" : ""}max-width:100%;overflow:hidden;text-overflow:ellipsis;vertical-align:middle;`;
    return `<span style="${style}">${innerHtml}</span>`;
}

function renderProfileVerificationRows(data) {
    const types = getVerificationTypes(data);
    if (!types.length) return "";
    const settings = data.verif_settings && typeof data.verif_settings === "string" ? JSON.parse(data.verif_settings) : data.verif_settings || {};
    const hidden = settings.profile_hidden && Array.isArray(settings.profile_hidden) ? settings.profile_hidden : [];
    const configs = [ {
        type: "enterprise",
        label: "企业/机构/团体认证"
    }, {
        type: "premium",
        label: "高级认证用户"
    }, {
        type: "advanced",
        label: "进阶认证用户"
    }, {
        type: "personal",
        label: "Beta版内测用户纪念认证"
    }, {
        type: "basic",
        label: "普通认证用户"
    } ];
    const rows = [];
    for (const cfg of configs) {
        if (types.includes(cfg.type) && !hidden.includes(cfg.type)) {
            let label = cfg.label;
            if (cfg.type === "enterprise") {
                const orgName = getVerifOrgName(data, "enterprise");
                if (orgName) label = orgName;
            }
            rows.push(`<div style="display:flex;align-items:center;gap:6px;padding:3px 0;">${getVerifSvg(cfg.type, 16)}<span style="font-size:13px;color:#666;">${label}</span></div>`);
        }
    }
    return rows.join("");
}

function goUserByNickname(nickname) {
    api("/searchUser?keyword=" + encodeURIComponent(nickname)).then(r => {
        if (r.code === 1 && r.data && r.data.length > 0) {
            const user = r.data.find(u => u.nickname === nickname) || r.data[0];
            goUserProfile(user.uid);
        } else {
            showToast("未找到该用户");
        }
    }).catch(() => {
        showToast("查找用户失败");
    });
}

function showToast(msg) {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        container.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;pointer-events:none;display:flex;flex-direction:column;gap:8px;";
        document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    toast.style.cssText = "background:rgba(0,0,0,0.8);color:#fff;padding:12px 24px;border-radius:8px;font-size:14px;white-space:pre-line;max-width:85vw;min-width:200px;text-align:center;line-height:1.6;word-break:break-word;animation:toastFadeIn 200ms var(--ease-out);";
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.transition = "opacity 0.25s cubic-bezier(0.23, 1, 0.32, 1), transform 0.25s cubic-bezier(0.23, 1, 0.32, 1)";
        toast.style.opacity = "0";
        toast.style.transform = "translateY(-10px)";
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

function buildAppealUrl(token) {
    var base = window.__BASE || "";
    return window.location.origin + base + "/appeal/" + token;
}

function fallbackCopyText(text, okCb, errCb) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0;pointer-events:none;";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
        document.execCommand("copy");
        okCb();
    } catch (e) {
        errCb();
    }
    document.body.removeChild(ta);
}

function copyAppealLink(token, el) {
    const url = buildAppealUrl(token);
    const done = () => {
        if (el) {
            el.classList.remove("fa-copy");
            el.classList.add("fa-check");
            el.style.color = "#52c41a";
            setTimeout(() => {
                el.classList.add("fa-copy");
                el.classList.remove("fa-check");
                el.style.color = "";
            }, 2e3);
        }
        showToast("复制成功");
    };
    const fail = () => showToast("复制失败");
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done).catch(() => fallbackCopyText(url, done, fail));
    } else {
        fallbackCopyText(url, done, fail);
    }
}

function renderAppealLinkSection(token) {
    const url = buildAppealUrl(token);
    return `<div style="background:#F0F7FF;border:0.5px solid #D6E8FF;border-radius:10px;padding:12px;margin-top:10px;">\n        <div style="font-size:13px;color:#1677ff;margin-bottom:8px;">您可通过以下链接查询申诉进度与结果</div>\n        <div style="display:flex;align-items:center;gap:8px;">\n          <i class="fa-solid fa-copy" onclick="copyAppealLink('${token}', this)" style="font-size:16px;color:#1677ff;cursor:pointer;flex-shrink:0;"></i>\n          <span style="font-size:12px;color:#333;word-break:break-all;">${url}</span>\n        </div>\n      </div>`;
}

function showCustomDialog(opts) {
    const overlay = document.createElement("div");
    overlay.className = "dialog-modal";
    const confirmBtnStyle = opts.danger ? "background:#ff2442;color:#fff;border:none;border-radius:22px;padding:11px 0;font-size:15px;font-weight:600;cursor:pointer;flex:1;" : "background:var(--color-primary);color:#fff;border:none;border-radius:22px;padding:11px 0;font-size:15px;font-weight:600;cursor:pointer;flex:1;";
    overlay.innerHTML = `<div class="dialog-modal-content" style="width:84%;max-width:360px;padding:24px 20px;text-align:center;" onclick="event.stopPropagation()">\n        ${opts.title ? `<div class="dialog-title" style="font-size:17px;font-weight:600;color:#1a1a1a;margin-bottom:12px;"></div>` : ""}\n        <div class="dialog-message" style="font-size:14px;color:#5f6368;line-height:1.7;white-space:pre-line;word-break:break-word;margin-bottom:20px;"></div>\n        <div style="display:flex;gap:12px;${opts.hideCancel ? "justify-content:center;" : ""}">\n          ${opts.hideCancel ? "" : `<button class="dialog-cancel-btn" style="background:#f5f5f7;color:#333;border:none;border-radius:22px;padding:11px 0;font-size:15px;cursor:pointer;flex:1;">取消</button>`}\n          <button class="dialog-ok-btn" style="${confirmBtnStyle}">${opts.okText || "确定"}</button>\n        </div>\n      </div>`;
    document.body.appendChild(overlay);
    const titleEl = overlay.querySelector(".dialog-title");
    if (titleEl) titleEl.textContent = opts.title;
    overlay.querySelector(".dialog-message").textContent = opts.message;
    requestAnimationFrame(() => overlay.classList.add("active"));
    overlay._resolve = null;
    const done = val => {
        overlay.classList.remove("active");
        setTimeout(() => overlay.remove(), 250);
        if (overlay._resolve) overlay._resolve(val);
    };
    overlay.querySelector(".dialog-ok-btn").addEventListener("click", () => done(true));
    const cancelBtn = overlay.querySelector(".dialog-cancel-btn");
    if (cancelBtn) cancelBtn.addEventListener("click", () => done(false));
    overlay.addEventListener("click", e => {
        if (e.target === overlay && !opts.hideCancel) done(false);
    });
    return new Promise(resolve => {
        overlay._resolve = resolve;
    });
}

function customConfirm(message, okText) {
    return showCustomDialog({
        title: "提示",
        message: message,
        okText: okText || "确定"
    });
}

function customAlert(message, okText) {
    return showCustomDialog({
        title: "提示",
        message: message,
        okText: okText || "知道了",
        hideCancel: true
    });
}

function customDangerConfirm(message, okText) {
    return showCustomDialog({
        title: "提示",
        message: message,
        okText: okText || "确定",
        danger: true
    });
}

async function replaceNativeConfirm(message, okText, danger) {
    const res = await (danger ? customDangerConfirm(message, okText) : customConfirm(message, okText));
    return res;
}

async function replaceNativeAlert(message, okText) {
    await customAlert(message, okText);
}

let currentVideoSrc = "";

let currentVideoAllowDownload = true;

let playerVideoBlobUrl = null;

let playerLongPressTimer = null;

let playerSpeedIndicator = null;

let playerFirstTipShown = false;

async function openVideoPlayer(src, poster, allowDownload = true) {
    if (!requireLogin()) return;
    currentVideoSrc = src;
    currentVideoAllowDownload = allowDownload;
    let player = document.getElementById("custom-video-player");
    if (!player) {
        player = document.createElement("div");
        player.id = "custom-video-player";
        player.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:10000;display:flex;align-items:center;justify-content:center;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;touch-action:manipulation;";
        player.innerHTML = `\n          <video id="player-video" playsinline webkit-playsinline controlslist="nodownload nofullscreen noremoteplayback" style="max-width:100%;max-height:100%;object-fit:contain;pointer-events:none;-webkit-touch-callout:none;" oncontextmenu="return false;"></video>\n          <div id="player-loading" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10001;display:none;">\n            <div style="width:40px;height:40px;border:3px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:player-spin 0.8s linear infinite;"></div>\n          </div>\n          <style>@keyframes player-spin { to { transform: rotate(360deg); } }</style>\n          <div id="player-close" style="position:absolute;top:20px;right:20px;width:40px;height:40px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.2);z-index:10001;" onclick="closeVideoPlayer()">\n            <i class="fa-solid fa-xmark" style="color:#000;font-size:20px;"></i>\n          </div>\n          <div id="player-more" style="position:absolute;top:20px;right:70px;width:40px;height:40px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.2);z-index:10001;" onclick="togglePlayerMore()">\n            <i class="fa-solid fa-ellipsis" style="color:#000;font-size:18px;"></i>\n          </div>\n          <div id="player-more-menu" style="position:absolute;top:70px;right:20px;background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.3);padding:8px 0;min-width:140px;display:none;z-index:10003;">\n            <div class="player-menu-item" onclick="togglePlayerMute();togglePlayerMore()"><span id="player-menu-mute-text">开启静音</span></div>\n            <div class="player-menu-item" onclick="togglePlayerSpeedMenu()">倍速 <span id="player-current-speed" style="color:#999;font-size:12px;float:right;">1.0x</span></div>\n            <div class="player-menu-item" onclick="downloadVideo();togglePlayerMore()">下载视频</div>\n          </div>\n          <div id="player-speed-menu" style="position:absolute;top:70px;right:20px;background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.3);padding:8px 0;min-width:140px;display:none;z-index:10003;">\n            <div class="player-menu-item" style="font-weight:600;color:#666;border-bottom:1px solid #eee;" onclick="togglePlayerSpeedMenu()">← 返回</div>\n            <div class="player-menu-item" onclick="setPlayerSpeed(0.5)">0.5倍速</div>\n            <div class="player-menu-item" onclick="setPlayerSpeed(1)">1.0倍速</div>\n            <div class="player-menu-item" onclick="setPlayerSpeed(1.25)">1.25倍速</div>\n            <div class="player-menu-item" onclick="setPlayerSpeed(1.5)">1.5倍速</div>\n            <div class="player-menu-item" onclick="setPlayerSpeed(2)">2.0倍速</div>\n            <div class="player-menu-item" onclick="setPlayerSpeed(3)">3.0倍速</div>\n          </div>\n          <div id="player-controls" style="position:absolute;bottom:20px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:16px;color:#fff;">\n            <div id="player-play-btn" style="width:44px;height:44px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.2);" onclick="togglePlayerPlay()">\n              <i class="fa-solid fa-play" style="color:#000;font-size:18px;margin-left:2px;"></i>\n            </div>\n            <div style="display:flex;align-items:center;gap:8px;font-size:13px;text-shadow:0 1px 2px rgba(0,0,0,0.5);">\n              <span id="player-current" style="min-width:35px;text-align:right;">0:00</span>\n              <div id="player-progress" style="width:150px;height:4px;background:rgba(255,255,255,0.3);border-radius:2px;cursor:pointer;position:relative;box-shadow:0 1px 2px rgba(0,0,0,0.3);border:0.5px solid rgba(0,0,0,0.2);">\n                <div id="player-progress-bar" style="height:100%;background:#fff;border-radius:2px;width:0;"></div>\n                <div id="player-progress-thumb" style="position:absolute;top:50%;left:0;transform:translate(-50%,-50%);width:12px;height:12px;background:#fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.3);display:none;"></div>\n              </div>\n              <span id="player-duration" style="min-width:35px;">0:00</span>\n            </div>\n            <div style="width:36px;height:36px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.2);" onclick="togglePlayerFullscreen()">\n              <i class="fa-solid fa-expand" style="color:#000;font-size:16px;"></i>\n            </div>\n          </div>\n        `;
        document.body.appendChild(player);
        const video = document.getElementById("player-video");
        video.addEventListener("timeupdate", updatePlayerProgress);
        video.addEventListener("loadedmetadata", updatePlayerDuration);
        video.addEventListener("waiting", () => {
            const loading = document.getElementById("player-loading");
            if (loading) loading.style.display = "block";
        });
        video.addEventListener("playing", () => {
            const loading = document.getElementById("player-loading");
            if (loading) loading.style.display = "none";
        });
        video.addEventListener("canplay", () => {
            const loading = document.getElementById("player-loading");
            if (loading) loading.style.display = "none";
        });
        video.addEventListener("play", () => {
            document.getElementById("player-play-btn").innerHTML = '<i class="fa-solid fa-pause" style="color:#000;font-size:18px;"></i>';
        });
        video.addEventListener("pause", () => {
            document.getElementById("player-play-btn").innerHTML = '<i class="fa-solid fa-play" style="color:#000;font-size:18px;margin-left:2px;"></i>';
        });
        video.addEventListener("ended", () => {
            document.getElementById("player-play-btn").innerHTML = '<i class="fa-solid fa-play" style="color:#000;font-size:18px;margin-left:2px;"></i>';
            const loading = document.getElementById("player-loading");
            if (loading) loading.style.display = "none";
            video.currentTime = 0;
            video.playbackRate = 1;
            hidePlayerSpeedIndicator();
            const bar = document.getElementById("player-progress-bar");
            const thumb = document.getElementById("player-progress-thumb");
            const current = document.getElementById("player-current");
            if (bar) bar.style.width = "0%";
            if (thumb) thumb.style.left = "0%";
            if (current) current.textContent = "0:00";
        });
        document.getElementById("player-progress").addEventListener("click", e => {
            if (playerDragging) return;
            const rect = e.target.closest("#player-progress").getBoundingClientRect();
            const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const video = document.getElementById("player-video");
            if (video && video.duration) {
                video.currentTime = percent * video.duration;
            }
        });
        let playerDragging = false;
        const progressEl = document.getElementById("player-progress");
        const thumbEl = document.getElementById("player-progress-thumb");
        function handleProgressDrag(e) {
            const rect = progressEl.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            const video = document.getElementById("player-video");
            const bar = document.getElementById("player-progress-bar");
            if (bar) bar.style.width = percent * 100 + "%";
            if (thumbEl) thumbEl.style.left = percent * 100 + "%";
            if (video && video.duration) {
                video.currentTime = percent * video.duration;
            }
        }
        progressEl.addEventListener("mousedown", e => {
            playerDragging = true;
            handleProgressDrag(e);
            e.preventDefault();
        });
        progressEl.addEventListener("touchstart", e => {
            playerDragging = true;
            handleProgressDrag(e);
        }, {
            passive: true
        });
        document.addEventListener("mousemove", e => {
            if (playerDragging) handleProgressDrag(e);
        });
        document.addEventListener("touchmove", e => {
            if (playerDragging) handleProgressDrag(e);
        }, {
            passive: true
        });
        document.addEventListener("mouseup", () => {
            playerDragging = false;
        });
        document.addEventListener("touchend", () => {
            playerDragging = false;
        });
        player.addEventListener("click", e => {
            if (e.target === player) {
                togglePlayerControls();
                const menu = document.getElementById("player-more-menu");
                if (menu) menu.style.display = "none";
            }
        });
        player.addEventListener("mousedown", handlePlayerLongPressStart);
        player.addEventListener("touchstart", handlePlayerLongPressStart, {
            passive: false
        });
        player.addEventListener("mouseup", handlePlayerLongPressEnd);
        player.addEventListener("mouseleave", handlePlayerLongPressEnd);
        player.addEventListener("touchend", handlePlayerLongPressEnd);
        player.addEventListener("touchcancel", handlePlayerLongPressEnd);
        player.addEventListener("contextmenu", e => e.preventDefault());
    }
    const video = document.getElementById("player-video");
    player.style.display = "flex";
    const loadingEl = document.getElementById("player-loading");
    if (loadingEl) loadingEl.style.display = "block";
    const resolvedSrc = await resolveVideoUrl(src);
    if (!resolvedSrc) {
        if (loadingEl) loadingEl.style.display = "none";
        player.style.display = "none";
        showToast("视频加载失败，请重试");
        return;
    }
    const resolvedPoster = withMediaAuth(poster);
    currentVideoSrc = resolvedSrc;
    video.src = resolvedSrc;
    video.poster = resolvedPoster || "";
    video.playbackRate = 1;
    video.muted = false;
    const muteText = document.getElementById("player-menu-mute-text");
    if (muteText) muteText.textContent = "开启静音";
    const speedLabel = document.getElementById("player-current-speed");
    if (speedLabel) speedLabel.textContent = "1.0x";
    const speedMenu = document.getElementById("player-speed-menu");
    if (speedMenu) speedMenu.style.display = "none";
    video.play().catch(() => {});
    if (!localStorage.getItem("video_player_tip_shown")) {
        setTimeout(() => {
            showPlayerFirstTip();
        }, 800);
    }
}

function showPlayerFirstTip() {
    const player = document.getElementById("custom-video-player");
    if (!player) return;
    const tip = document.createElement("div");
    tip.id = "player-first-tip";
    tip.style.cssText = "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.75);color:#fff;padding:20px 24px;border-radius:16px;font-size:15px;text-align:center;z-index:10005;max-width:280px;line-height:1.6;pointer-events:none;";
    tip.innerHTML = `\n        <div style="font-size:17px;font-weight:600;margin-bottom:10px;">💡 小提示</div>\n        <div style="margin-bottom:8px;">长按屏幕左右两侧</div>\n        <div style="color:#90EE90;font-weight:500;">可 2 倍速播放</div>\n        <div style="margin-top:14px;font-size:12px;color:#aaa;">松开手指恢复正常速度</div>\n        <div style="margin-top:16px;font-size:11px;color:#888;">点击任意位置关闭</div>\n      `;
    player.appendChild(tip);
    playerFirstTipShown = true;
    localStorage.setItem("video_player_tip_shown", "1");
    const closeTip = () => {
        if (tip && tip.parentNode) {
            tip.style.transition = "opacity 0.3s";
            tip.style.opacity = "0";
            setTimeout(() => tip.remove(), 300);
        }
        player.removeEventListener("click", closeTip);
        player.removeEventListener("touchstart", closeTip);
    };
    setTimeout(() => {
        player.addEventListener("click", closeTip);
        player.addEventListener("touchstart", closeTip);
    }, 100);
    setTimeout(() => {
        closeTip();
    }, 6e3);
}

function closeVideoPlayer() {
    const player = document.getElementById("custom-video-player");
    if (player) {
        const video = document.getElementById("player-video");
        video.pause();
        video.src = "";
        player.style.display = "none";
    }
    if (playerVideoBlobUrl) {
        try {
            URL.revokeObjectURL(playerVideoBlobUrl);
        } catch (e) {}
        playerVideoBlobUrl = null;
    }
}

function togglePlayerPlay() {
    const video = document.getElementById("player-video");
    if (video.paused) {
        video.play();
    } else {
        video.pause();
    }
}

function updatePlayerProgress() {
    const video = document.getElementById("player-video");
    const bar = document.getElementById("player-progress-bar");
    const current = document.getElementById("player-current");
    const thumb = document.getElementById("player-progress-thumb");
    if (video && bar && current && video.duration) {
        const percent = video.currentTime / video.duration * 100;
        bar.style.width = percent + "%";
        if (thumb) thumb.style.left = percent + "%";
        const mins = Math.floor(video.currentTime / 60);
        const secs = Math.floor(video.currentTime % 60);
        current.textContent = mins + ":" + (secs < 10 ? "0" + secs : secs);
    }
}

function updatePlayerDuration() {
    const video = document.getElementById("player-video");
    const duration = document.getElementById("player-duration");
    const thumb = document.getElementById("player-progress-thumb");
    if (video && duration && video.duration) {
        const mins = Math.floor(video.duration / 60);
        const secs = Math.floor(video.duration % 60);
        duration.textContent = mins + ":" + (secs < 10 ? "0" + secs : secs);
        if (thumb) thumb.style.display = "block";
    }
}

function togglePlayerControls() {
    const controls = document.getElementById("player-controls");
    if (controls) {
        controls.style.opacity = controls.style.opacity === "0" ? "1" : "0";
        controls.style.transition = "opacity 0.3s";
    }
}

function togglePlayerFullscreen() {
    const player = document.getElementById("custom-video-player");
    if (player) {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            player.requestFullscreen().catch(() => {});
        }
    }
}

function togglePlayerMore() {
    const menu = document.getElementById("player-more-menu");
    const speedMenu = document.getElementById("player-speed-menu");
    if (!menu) return;
    const isHidden = menu.style.display === "none";
    menu.style.display = isHidden ? "block" : "none";
    if (speedMenu && !isHidden) speedMenu.style.display = "none";
}

function togglePlayerSpeedMenu() {
    const menu = document.getElementById("player-more-menu");
    const speedMenu = document.getElementById("player-speed-menu");
    if (!menu || !speedMenu) return;
    if (speedMenu.style.display === "block") {
        speedMenu.style.display = "none";
        menu.style.display = "block";
    } else {
        menu.style.display = "none";
        speedMenu.style.display = "block";
    }
}

function setPlayerSpeed(speed) {
    const video = document.getElementById("player-video");
    if (video) {
        video.playbackRate = speed;
    }
    const speedMenu = document.getElementById("player-speed-menu");
    const menu = document.getElementById("player-more-menu");
    if (speedMenu) speedMenu.style.display = "none";
    if (menu) menu.style.display = "none";
    const speedLabel = document.getElementById("player-current-speed");
    if (speedLabel) speedLabel.textContent = speed + "x";
    showPlayerToast("正在以 " + speed + " 倍速播放");
}

let playerToastTimer = null;

function showPlayerToast(text) {
    const player = document.getElementById("custom-video-player");
    if (!player) return;
    let toast = document.getElementById("player-toast");
    if (toast) toast.remove();
    toast = document.createElement("div");
    toast.id = "player-toast";
    toast.style.cssText = "position:absolute;top:80px;left:50%;transform:translateX(-50%);background:#fff;color:#000;padding:8px 16px;border-radius:8px;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.2);z-index:10004;white-space:nowrap;";
    toast.textContent = text;
    player.appendChild(toast);
    if (playerToastTimer) clearTimeout(playerToastTimer);
    playerToastTimer = setTimeout(() => {
        if (toast && toast.parentNode) toast.remove();
    }, 2e3);
}

function togglePlayerMute() {
    const video = document.getElementById("player-video");
    const text = document.getElementById("player-menu-mute-text");
    if (video) {
        video.muted = !video.muted;
        if (text) {
            text.textContent = video.muted ? "关闭静音" : "开启静音";
        }
    }
}

function downloadVideo() {
    if (!currentVideoAllowDownload && currentNickname !== "管理员") {
        showToast("作者设置了不允许下载");
        return;
    }
    if (!currentVideoSrc) return;
    const link = document.createElement("a");
    link.href = currentVideoSrc;
    link.download = "video.mp4";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function handlePlayerLongPressStart(e) {
    const player = document.getElementById("custom-video-player");
    if (!player) return;
    const target = e.target;
    if (target.closest("#player-close") || target.closest("#player-more") || target.closest("#player-more-menu") || target.closest("#player-controls") || target.closest("#player-progress")) {
        return;
    }
    const rect = player.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const xPercent = (clientX - rect.left) / rect.width;
    if (xPercent < .25 || xPercent > .75) {
        if (e.cancelable && e.type === "touchstart") e.preventDefault();
        playerLongPressTimer = setTimeout(() => {
            const video = document.getElementById("player-video");
            if (video) {
                if (video.paused) {
                    video.play().catch(() => {});
                }
                video.playbackRate = 2;
                showPlayerSpeedIndicator();
            }
        }, 300);
    }
}

function handlePlayerLongPressEnd() {
    if (playerLongPressTimer) {
        clearTimeout(playerLongPressTimer);
        playerLongPressTimer = null;
    }
    const video = document.getElementById("player-video");
    if (video) {
        video.playbackRate = 1;
    }
    hidePlayerSpeedIndicator();
}

function showPlayerSpeedIndicator() {
    if (playerSpeedIndicator) return;
    playerSpeedIndicator = document.createElement("div");
    playerSpeedIndicator.style.cssText = "position:absolute;top:80px;left:50%;transform:translateX(-50%);background:#fff;color:#000;padding:8px 16px;border-radius:8px;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.2);z-index:10002;white-space:nowrap;";
    playerSpeedIndicator.textContent = "2倍速播放中...";
    const player = document.getElementById("custom-video-player");
    if (player) player.appendChild(playerSpeedIndicator);
}

function hidePlayerSpeedIndicator() {
    if (playerSpeedIndicator) {
        playerSpeedIndicator.remove();
        playerSpeedIndicator = null;
    }
}

let isPageAnimating = false;

let isPopState = false;

function goPage(p, skipHistory, param2) {
    if (TAB_PAGES.includes(p) && p === currentPage && !param2) {
        return;
    }
    if (p === "discover" && !getToken()) {
        showLoginModal();
        return;
    }
    if (chatTimer && currentPage === "chat") {
        clearInterval(chatTimer);
        chatTimer = null;
    }
    if (TAB_PAGES.includes(p)) {
        pageHistory = [];
    } else {
        pageHistory.push(currentPage);
    }
    if (!skipHistory && !isPopState) {
        try {
            history.pushState({
                page: p
            }, "", "#" + p);
        } catch (e) {}
    }
    if (isPageAnimating) return;
    isPageAnimating = true;
    prevPage = currentPage;
    currentPage = p;
    window._pageParam2 = param2 || null;
    const app = document.getElementById("app");
    const isTabPage = TAB_PAGES.includes(p) && TAB_PAGES.includes(prevPage);
    const direction = TAB_PAGES.includes(p) && !TAB_PAGES.includes(prevPage) ? "forward" : !TAB_PAGES.includes(p) && TAB_PAGES.includes(prevPage) ? "back" : isTabPage ? "fade" : "forward";
    if (direction === "back") {
        const oldContent = app.innerHTML;
        const exitLayer = document.createElement("div");
        exitLayer.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:9998;background:#fff;overflow:hidden;";
        exitLayer.innerHTML = oldContent;
        document.body.appendChild(exitLayer);
        render();
        updateTabbar();
        window.scrollTo(0, 0);
        requestAnimationFrame(() => {
            exitLayer.style.transition = "transform 0.28s cubic-bezier(0.23, 1, 0.32, 1), opacity 0.28s cubic-bezier(0.23, 1, 0.32, 1)";
            exitLayer.style.transform = "translateX(100%)";
            exitLayer.style.opacity = "0";
            app.style.transition = "opacity 0.2s ease";
            app.style.opacity = "0";
            requestAnimationFrame(() => {
                app.style.opacity = "1";
            });
            setTimeout(() => {
                exitLayer.remove();
                isPageAnimating = false;
                app.style.transition = "";
                app.style.opacity = "";
                ensureTabbarVisible();
                ensureCommentInputVisible();
                ensureFabVisible();
            }, 300);
        });
    } else {
        app.style.transition = "none";
        app.style.opacity = direction === "fade" ? "0.5" : "0";
        app.style.transform = direction === "forward" ? "translateX(30px)" : "none";
        render();
        updateTabbar();
        window.scrollTo(0, 0);
        requestAnimationFrame(() => {
            app.style.transition = "opacity 0.25s cubic-bezier(0.23, 1, 0.32, 1), transform 0.25s cubic-bezier(0.23, 1, 0.32, 1)";
            app.style.opacity = "1";
            app.style.transform = "translateX(0)";
            setTimeout(() => {
                isPageAnimating = false;
                app.style.transition = "";
                app.style.opacity = "";
                app.style.removeProperty("transform");
                ensureTabbarVisible();
                ensureCommentInputVisible();
                ensureFabVisible();
            }, 280);
        });
    }
}

function render() {
    const app = document.getElementById("app");
    const fl0 = document.getElementById("fixed-layer");
    if (fl0) fl0.innerHTML = "";
    switch (currentPage) {
      case "home":
        app.innerHTML = renderHome();
        bindHomeEvents();
        break;

      case "discover":
        app.innerHTML = renderDiscover();
        bindDiscoverEvents();
        break;

      case "message":
        app.innerHTML = renderMessage();
        bindMessageEvents();
        break;

      case "profile":
        app.innerHTML = renderProfile();
        bindProfileEvents();
        break;

      case "auth":
        app.innerHTML = renderAuth();
        bindAuthEvents();
        initCaptchaIfNeeded();
        break;

      case "postDetail":
        app.innerHTML = renderPostDetail();
        bindPostDetailEvents();
        break;

      case "topicDetail":
        app.innerHTML = renderTopicDetail();
        bindTopicDetailEvents();
        break;

      case "search":
        app.innerHTML = renderSearch();
        bindSearchEvents();
        break;

      case "userProfile":
        app.innerHTML = renderUserProfile();
        bindUserProfileEvents();
        break;

      case "chat":
        app.innerHTML = renderChat();
        bindChatEvents();
        break;

      case "strangerList":
        app.innerHTML = renderStrangerList();
        bindStrangerListEvents();
        break;

      case "editProfile":
        if (editProfileTab !== "profile") editProfileTab = "profile";
        app.innerHTML = renderEditProfile();
        bindEditProfileEvents();
        break;

      case "securitySettings":
        if (editProfileTab !== "security") editProfileTab = "security";
        app.innerHTML = renderEditProfile();
        bindEditProfileEvents();
        break;

      case "feedback":
        app.innerHTML = renderFeedback();
        bindFeedbackEvents();
        break;

      case "createPost":
        app.innerHTML = renderCreatePost();
        bindCreatePostEvents();
        break;

      case "confessionDetail":
        app.innerHTML = renderConfessionDetail();
        bindConfessionDetailEvents();
        break;

      case "notificationLikes":
        app.innerHTML = renderNotificationLikes();
        bindNotificationLikesEvents();
        break;

      case "notificationFollows":
        app.innerHTML = renderNotificationFollows();
        bindNotificationFollowsEvents();
        break;

      case "notificationComments":
        app.innerHTML = renderNotificationComments();
        bindNotificationCommentsEvents();
        break;

      case "realnameVerify":
        app.innerHTML = renderRealnameVerify();
        bindRealnameVerifyEvents();
        break;

      case "parentConsent":
        app.innerHTML = renderParentConsent();
        bindParentConsentEvents();
        break;

      case "enterpriseApply":
        app.innerHTML = renderEnterpriseApply();
        bindEnterpriseApplyEvents();
        break;

      case "buyExposure":
        app.innerHTML = renderBuyExposure();
        bindBuyExposureEvents();
        break;

      case "buyPin":
        app.innerHTML = renderBuyPin();
        bindBuyPinEvents();
        break;

      case "paySubscribe":
        _renderAsyncCached("paySubscribe", renderPaySubscribe, bindPaySubscribeEvents);
        break;

      case "mySubOrders":
        _renderAsyncCached("mySubOrders", renderMySubOrders, bindMySubOrdersEvents);
        break;

      case "myServiceOrders":
        _renderAsyncCached("myServiceOrders", renderMyServiceOrders, bindMyServiceOrdersEvents);
        break;

      case "youthMode":
        app.innerHTML = renderYouthModePage();
        bindYouthModeEvents();
        break;

      case "verifSubscribe":
        _renderAsyncCached("verifSubscribe", renderVerifSubscribe, bindVerifSubscribeEvents);
        break;

      case "safetyCenter":
        app.innerHTML = renderSafetyCenter();
        bindSafetyCenterEvents();
        break;

      case "followListPage":
        app.innerHTML = renderFollowListPage();
        bindFollowListPageEvents();
        break;

      case "fansListPage":
        app.innerHTML = renderFansListPage();
        bindFansListPageEvents();
        break;

      case "violationDetail":
        app.innerHTML = renderViolationDetail();
        bindViolationDetailEvents();
        break;

      case "rulesCenter":
        app.innerHTML = renderRulesCenter();
        bindRulesCenterEvents();
        break;

      case "homeworkDetail":
        app.innerHTML = renderHomeworkDetail();
        bindHomeworkDetailEvents();
        break;

      case "report":
        app.innerHTML = renderReportPage();
        bindReportEvents();
        break;

      case "agreement":
        app.innerHTML = renderAgreementPage();
        break;

      case "privacy":
        app.innerHTML = renderPrivacyPage();
        break;

      case "minorPrivacy":
        app.innerHTML = renderMinorPrivacyPage();
        break;

      case "intlLegal":
        app.innerHTML = '<div style="min-height:80vh;display:flex;align-items:center;justify-content:center;"><div style="color:#999;font-size:14px;">资源正在下载中，请稍候</div></div>';
        renderIntlLegalPage().then(html => {
            app.innerHTML = html;
        });
        break;

      case "verifSubAgreement":
        app.innerHTML = renderVerifSubAgreementPage();
        break;

      case "enterpriseAgreement":
        app.innerHTML = renderEnterpriseAgreementPage();
        break;

      case "redeemCode":
        app.innerHTML = renderRedeemCode();
        bindRedeemCodeEvents();
        break;
    }
    const fl = document.getElementById("fixed-layer");
    if (fl) {
        const fab = document.getElementById("fabCreateBtn");
        if (fab) {
            fab.style.pointerEvents = "auto";
            fl.appendChild(fab);
        }
        document.querySelectorAll(".comment-input-bar, .chat-input-bar").forEach(el => {
            el.style.pointerEvents = "auto";
            fl.appendChild(el);
        });
    }
    updateScreenWatermark();
    if (_lastRenderedPage !== currentPage) {
        triggerPageEnterAnim();
        _lastRenderedPage = currentPage;
    }
    if (currentPage === "home") {
        const _plHome = document.getElementById("postList");
        if (_plHome && _plHome.innerHTML.trim()) hideAppSkeleton(); else showAppSkeleton();
    } else {
        hideAppSkeleton();
    }
}

function hideAppSkeleton() {
    const sk = document.getElementById("app-skeleton");
    if (sk) sk.style.display = "none";
}

function showAppSkeleton() {
    const sk = document.getElementById("app-skeleton");
    if (sk) sk.style.display = "";
}

function _renderAsyncCached(name, renderFn, bindFn) {
    const _app = document.getElementById("app");
    const _key = name + ":" + (name === "paySubscribe" ? (window._pageParam2 || "advanced") + ":" + (window._verifSubTab || "month") : name === "verifSubscribe" ? window._verifSubTab || "month" : "def");
    const _set = html => {
        asyncHtmlCache[_key] = {
            html: html,
            ts: Date.now()
        };
        _app.innerHTML = html;
        if (bindFn) bindFn();
    };
    const _c = asyncHtmlCache[_key];
    if (_c) {
        _set(_c.html);
        renderFn().then(html => {
            asyncHtmlCache[_key] = {
                html: html,
                ts: Date.now()
            };
            if (html === _c.html) return;
            const _ae = document.activeElement;
            if (_ae && (_ae.tagName === "INPUT" || _ae.tagName === "TEXTAREA") && _ae !== document.body && _app.contains(_ae)) return;
            if (_app.querySelector(".modal-overlay.active")) return;
            _app.innerHTML = html;
            if (bindFn) bindFn();
        }).catch(() => {});
        return;
    }
    _app.innerHTML = '<div style="min-height:100vh;background:#0d0d0f;display:flex;align-items:center;justify-content:center;"><div style="color:rgba(255,255,255,0.4);font-size:14px;">加载中...</div></div>';
    renderFn().then(_set).catch(() => {});
}

function waitImagesLoaded(container, timeout) {
    return new Promise(function(resolve) {
        var done = false;
        var finish = function() {
            if (!done) {
                done = true;
                resolve();
            }
        };
        var realSrc = function(img) {
            return !!(img.getAttribute("src") && img.getAttribute("src").indexOf("data:") !== 0);
        };
        var checkAll = function() {
            if (!container) {
                finish();
                return;
            }
            var all = container.querySelectorAll("img");
            for (var i = 0; i < all.length; i++) {
                if (realSrc(all[i]) && !all[i].complete) {
                    wait();
                    return;
                }
            }
            finish();
        };
        var wait = function() {
            clearTimeout(pollT);
            pollT = setTimeout(checkAll, 150);
        };
        var pollT = null;
        var bind = function() {
            var all = container ? container.querySelectorAll("img") : [];
            for (var i = 0; i < all.length; i++) {
                if (!realSrc(all[i]) || all[i].__skBound) continue;
                all[i].__skBound = true;
                all[i].addEventListener("load", checkAll);
                all[i].addEventListener("error", checkAll);
            }
        };
        bind();
        checkAll();
        setTimeout(finish, timeout || 8e3);
    });
}

function waitIconFontsReady(timeout) {
    return new Promise(function(resolve) {
        var done = false;
        var finish = function() {
            if (!done) {
                done = true;
                resolve();
            }
        };
        try {
            if (!document.fonts || typeof document.fonts.load !== "function") {
                finish();
                return;
            }
            var loads = [ document.fonts.load('900 16px "Font Awesome 6 Free"'), document.fonts.load('400 16px "Font Awesome 6 Free"'), document.fonts.load('400 16px "Font Awesome 6 Brands"') ];
            Promise.all(loads.map(function(p) {
                return p.then(function() {}, function() {});
            })).then(function() {
                finish();
            });
            setTimeout(finish, timeout || 5e3);
        } catch (e) {
            finish();
        }
    });
}

function waitSkeletonReady(container, timeout) {
    return Promise.all([ waitImagesLoaded(container, timeout), waitIconFontsReady(5e3) ]).then(function() {});
}

let _lastRenderedPage = null;

const PAGE_ANIM_SLIDE = new Set([ "topicDetail", "chat", "violationDetail", "report", "feedback", "editProfile", "securitySettings", "search", "strangerList", "followListPage", "fansListPage", "notificationLikes", "notificationFollows", "notificationComments", "safetyCenter", "rulesCenter", "createPost", "agreement", "privacy", "minorPrivacy" ]);

function triggerPageEnterAnim() {
    const app = document.getElementById("app");
    if (!app) return;
    app.classList.remove("page-enter", "page-enter-soft");
    const NO_ANIM_PAGES = new Set([ "postDetail", "confessionDetail", "homeworkDetail", "userProfile" ]);
    if (NO_ANIM_PAGES.has(currentPage)) return;
    void app.offsetWidth;
    if (PAGE_ANIM_SLIDE.has(currentPage)) {
        app.classList.add("page-enter");
    } else {
        app.classList.add("page-enter-soft");
    }
}

let homeFeedTab = "recommend";

function goSearchGuard() {
    if (!requireLogin()) return;
    goPage("search");
}

function renderNavbar(title, showSearch = true) {
    if (showSearch) {
        return `<div class="navbar"><div style="width:40px;"></div><h1 style="flex:1;text-align:center;">${title}</h1><div class="search-btn" onclick="goSearchGuard()"><i class="fa-solid fa-magnifying-glass"></i></div></div>`;
    }
    return `<div class="navbar"><div style="width:40px;"></div><h1 style="flex:1;text-align:center;">${title}</h1><div style="width:40px;"></div></div>`;
}

function renderTabbar() {
    const icons = {
        home: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 3l9 8h-2.5v9h-5v-6h-3v6h-5v-9H3l9-8z"/></svg>',
        discover: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.5 6.5l-2.2 5.5-5.5 2.2 2.2-5.5 5.5-2.2z"/></svg>',
        message: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>',
        profile: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>'
    };
    const totalBadge = unreadTotalCount > 0 ? `<span class="tabbar-badge" style="position:absolute;top:-2px;right:-6px;min-width:18px;height:18px;line-height:18px;border-radius:9px;padding:0 5px;background:#ff2442;color:#fff;font-size:10px;font-weight:600;display:flex;align-items:center;justify-content:center;box-sizing:border-box;">${unreadTotalCount > 99 ? "99+" : unreadTotalCount}</span>` : "";
    if (window.matchMedia && window.matchMedia("(min-width: 1024px)").matches) {
        return `<div class="tabbar sidebar-nav">\n          <div class="sidebar-brand"><span class="sidebar-brand-dot"></span>赞话</div>\n          <div class="tab-item ${currentPage === "home" ? "active" : ""}" onclick="goPage('home')"><div class="tab-icon">${icons.home}</div><div>首页</div></div>\n          <div class="tab-item ${currentPage === "discover" ? "active" : ""}" onclick="goPage('discover')"><div class="tab-icon">${icons.discover}</div><div>发现</div></div>\n          <div class="tab-item ${currentPage === "message" ? "active" : ""}" onclick="goPage('message')" style="position:relative;"><div class="tab-icon" style="position:relative;">${icons.message}${totalBadge}</div><div>消息</div></div>\n          <div class="tab-item ${currentPage === "profile" ? "active" : ""}" onclick="goPage('profile')"><div class="tab-icon">${icons.profile}</div><div>我的</div></div>\n          <div class="sidebar-create" onclick="goCreatePostGuard()"><i class="fa-solid fa-plus"></i> 发布</div>\n        </div>`;
    }
    return `<div class="tabbar">\n        <div class="tab-item ${currentPage === "home" ? "active" : ""}" onclick="goPage('home')"><div class="tab-icon">${icons.home}</div><div>首页</div></div>\n        <div class="tab-item ${currentPage === "discover" ? "active" : ""}" onclick="goPage('discover')"><div class="tab-icon">${icons.discover}</div><div>发现</div></div>\n        <div class="tab-item ${currentPage === "message" ? "active" : ""}" onclick="goPage('message')" style="position:relative;"><div class="tab-icon" style="position:relative;">${icons.message}${totalBadge}</div><div>消息</div></div>\n        <div class="tab-item ${currentPage === "profile" ? "active" : ""}" onclick="goPage('profile')"><div class="tab-icon">${icons.profile}</div><div>我的</div></div>\n      </div>`;
}

const TABBAR_PAGES = [ "home", "discover", "message", "profile" ];

function setTabbarVisible(visible, withAnim) {
    const container = document.getElementById("tabbar-container");
    if (!container) return;
    if (visible) {
        container.style.display = "block";
        void container.offsetHeight;
        container.classList.remove("tabbar-hidden");
    } else {
        container.classList.add("tabbar-hidden");
        clearTimeout(container._hideTimer);
        container._hideTimer = setTimeout(() => {
            if (container.classList.contains("tabbar-hidden")) {
                container.style.display = "none";
            }
        }, 260);
    }
}

function updateTabbar() {
    const container = document.getElementById("tabbar-container");
    if (!container) return;
    const isDesktopNav = window.matchMedia && window.matchMedia("(min-width: 1024px)").matches;
    if (TABBAR_PAGES.includes(currentPage) || isDesktopNav) {
        container.innerHTML = renderTabbar();
        setTabbarVisible(true);
    } else {
        container.innerHTML = "";
        setTabbarVisible(false);
    }
}

if (window.matchMedia) {
    const _bp = window.matchMedia("(min-width: 1024px)");
    const _bpChange = () => updateTabbar();
    if (_bp.addEventListener) _bp.addEventListener("change", _bpChange); else if (_bp.addListener) _bp.addListener(_bpChange);
}

function renderPostCard(p) {
    const imgs = p.images ? p.images.split(",").filter(x => x) : [];
    const imgsJson = imgsJsonStr(imgs);
    const hasVideo = p.video && p.video.length > 0;
    const hasMedia = imgs.length > 0 || hasVideo;
    const imgClass = imgs.length === 1 ? "single" : "";
    const liked = p.liked || false;
    const collected = p.collected || false;
    const contentHtml = formatContentWithTopics(p.content || "");
    const isMine = p.user_id && getUid() && p.user_id === getUid();
    const isProtected = p.watermark_protected == 1 && !isMine;
    const cardClass = hasMedia ? "card card-media" : "card card-text-only";
    const cardId = "pc-" + p.id;
    let contentBlock = "";
    if (isProtected) {
        contentBlock = `<div class="post-content" style="display:flex;align-items:center;gap:8px;color:#999;font-size:14px;"><i class="fa-solid fa-lock" style="color:#f59e0b;"></i>该帖子受保护，请点击进入详情页查看</div>`;
    } else if (p.content) {
        contentBlock = `<div id="${cardId}-wrap" class="post-content-wrap">\n          <div id="${cardId}-content" class="post-content post-content-collapsed">${contentHtml}</div>\n          <div id="${cardId}-btn" class="post-expand-btn"><span onclick="event.stopPropagation();togglePostExpand('${cardId}')"><i class="fa-solid fa-angles-down" style="margin-right:3px;"></i>展开全文</span></div>\n        </div>`;
    }
    return `<div class="${cardClass}" id="pc-${p.id}" onclick="goPostDetail('${p.id}')">\n        <div class="post-header">\n          <img class="avatar" src="${resolveMediaUrl(p.avatar) || DEFAULT_AVATAR}" onclick="event.stopPropagation();goUserProfile('${p.user_id}')" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">\n          <div class="post-user">\n            <div class="post-nickname">${wrapNick(p.nickname || "用户" + p.user_id, p)}${renderListVerification(p)}</div>\n            <div class="post-time">${timeAgo(p.create_time)} · ${cleanProvince(p.province) || "未知"}</div>\n          </div>\n          ${isMine ? `<div onclick="event.stopPropagation();showPostActionSheet('${p.id}')" style="cursor:pointer;padding:4px 8px;margin-left:auto;"><i class="fa-solid fa-ellipsis" style="color:#999;font-size:16px;"></i></div>` : ""}\n        </div>\n        ${p.title ? `<div style="padding:0 16px 6px;font-size:16px;font-weight:600;">${escapeHtml(p.title)}</div>` : ""}\n        ${contentBlock}\n        ${isProtected ? "" : `${imgs.length ? `<div class="post-images ${imgClass}">${imgs.map((i, idx) => `<img loading="lazy" src="${resolveThumb(i)}" onclick="event.stopPropagation();showFullImage('${i}','${imgsJson}',${idx})">`).join("")}</div>` : ""}`}\n        ${isProtected ? "" : `${hasVideo ? `<div class="post-images single">\n          <div onclick="event.stopPropagation();openVideoPlayer('${p.video}', '${p.video_cover || ""}', ${p.allow_download != 0 ? "true" : "false"})" style="position:relative;cursor:pointer;width:75%;aspect-ratio:1;border-radius:8px;overflow:hidden;">\n            ${p.video_cover ? `<img loading="lazy" src="${resolveThumb(p.video_cover)}" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">` : ""}\n            <div style="display:${p.video_cover ? "none" : "flex"};position:absolute;inset:0;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);align-items:center;justify-content:center;">\n              <div style="text-align:center;">\n                <i class="fa-solid fa-video" style="font-size:32px;color:rgba(255,255,255,0.9);"></i>\n                <div style="color:rgba(255,255,255,0.8);font-size:11px;margin-top:4px;">点击播放</div>\n              </div>\n            </div>\n            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:40px;height:40px;background:rgba(0,0,0,0.5);border-radius:50%;display:flex;align-items:center;justify-content:center;pointer-events:none;">\n              <i class="fa-solid fa-play" style="color:#fff;font-size:16px;margin-left:2px;"></i>\n            </div>\n          </div>\n        </div>` : ""}`}\n        <div class="post-actions" onclick="event.stopPropagation()">\n          <div class="action-item" onclick="likePost('${p.id}',this)"><i class="${liked ? "fa-solid fa-heart" : "fa-regular fa-heart"}" style="color:${liked ? "var(--color-red)" : ""}"></i><span>${p.likes || 0}</span></div>\n          <div class="action-item" onclick="goPostDetailAndScroll('${p.id}')"><i class="fa-regular fa-comment"></i><span>${p.comments || 0}</span></div>\n          <div class="action-item" onclick="collectPost('${p.id}',this)"><i class="${collected ? "fa-solid fa-star" : "fa-regular fa-star"}" style="color:${collected ? "var(--color-yellow)" : ""}"></i><span>${p.collects || 0}</span></div>\n        </div>\n      </div>`;
}

function togglePostExpand(cardId) {
    const contentEl = document.getElementById(cardId + "-content");
    const btnEl = document.getElementById(cardId + "-btn");
    if (!contentEl || !btnEl) return;
    const collapsed = contentEl.classList.contains("post-content-collapsed");
    if (collapsed) {
        if (contentEl.dataset.fullHtml) {
            contentEl.innerHTML = contentEl.dataset.fullHtml;
        }
        contentEl.classList.remove("post-content-collapsed");
        btnEl.innerHTML = `<span><i class="fa-solid fa-angles-up" style="margin-right:3px;"></i>收起</span>`;
    } else {
        contentEl.classList.add("post-content-collapsed");
        btnEl.innerHTML = `<span><i class="fa-solid fa-angles-down" style="margin-right:3px;"></i>展开全文</span>`;
        ensureCollapsedContentTruncated(contentEl);
    }
}

function getContentLineHeight(contentEl) {
    const cs = getComputedStyle(contentEl);
    let lineH = parseFloat(cs.lineHeight);
    if (!lineH || isNaN(lineH)) lineH = (parseFloat(cs.fontSize) || 15) * 1.6;
    return lineH;
}

function ensureCollapsedContentTruncated(contentEl) {
    if (!contentEl.dataset.fullHtml) {
        contentEl.dataset.fullHtml = contentEl.innerHTML;
    }
    if (!contentEl.offsetWidth) return;
    const testEl = contentEl.cloneNode(true);
    testEl.classList.remove("post-content-collapsed");
    testEl.style.visibility = "hidden";
    testEl.style.position = "absolute";
    testEl.style.left = "-99999px";
    testEl.style.width = contentEl.offsetWidth + "px";
    testEl.style.padding = getComputedStyle(contentEl).padding;
    testEl.style.fontSize = "15px";
    testEl.style.lineHeight = "1.6";
    document.body.appendChild(testEl);
    const lineH = getContentLineHeight(contentEl);
    const needsTruncation = testEl.scrollHeight > lineH * 3 + 2;
    document.body.removeChild(testEl);
    if (!needsTruncation) return;
    const fullHtml = contentEl.dataset.fullHtml;
    contentEl.classList.remove("post-content-collapsed");
    const rawText = contentEl.textContent || "";
    contentEl.classList.add("post-content-collapsed");
    if (rawText.length < 20) return;
    const probe = contentEl.cloneNode(true);
    probe.classList.remove("post-content-collapsed");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.left = "-99999px";
    probe.style.width = contentEl.offsetWidth + "px";
    probe.style.paddingLeft = getComputedStyle(contentEl).paddingLeft;
    probe.style.paddingRight = getComputedStyle(contentEl).paddingRight;
    probe.style.paddingTop = "0";
    probe.style.paddingBottom = "0";
    probe.style.fontSize = "15px";
    probe.style.lineHeight = "1.6";
    probe.style.wordBreak = "break-word";
    document.body.appendChild(probe);
    const MAX_H = lineH * 3 + 2;
    let lo = 0, hi = rawText.length, best = 0;
    for (let iter = 0; iter < 22 && lo <= hi; iter++) {
        const mid = lo + hi >> 1;
        probe.textContent = rawText.slice(0, mid) + "…";
        if (probe.scrollHeight <= MAX_H) {
            best = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    document.body.removeChild(probe);
    if (best > 5) {
        contentEl.classList.remove("post-content-collapsed");
        contentEl.textContent = rawText.slice(0, best) + "…";
        contentEl.classList.add("post-content-collapsed");
    } else {
        contentEl.innerHTML = fullHtml;
    }
}

function refreshCardExpandButtons() {
    const buttons = document.querySelectorAll(".post-expand-btn");
    buttons.forEach(btn => {
        const wrap = btn.closest(".post-content-wrap");
        if (!wrap) return;
        const content = wrap.querySelector(".post-content");
        if (!content) return;
        const collapsed = content.classList.contains("post-content-collapsed");
        if (!collapsed) {
            btn.classList.add("visible");
            return;
        }
        if (!content.dataset.fullHtml) {
            content.dataset.fullHtml = content.innerHTML;
        }
        content.classList.remove("post-content-collapsed");
        const naturalH = content.scrollHeight;
        const padBottom = parseFloat(getComputedStyle(content).paddingBottom) || 0;
        content.classList.add("post-content-collapsed");
        const lineH = getContentLineHeight(content);
        const overflow = naturalH - padBottom > lineH * 3 + 2;
        if (overflow || btn.classList.contains("visible")) {
            btn.classList.add("visible");
            ensureCollapsedContentTruncated(content);
        } else {
            btn.classList.remove("visible");
        }
    });
}

function renderConfessionCard(c) {
    const imgs = c.images ? c.images.split(",").filter(x => x) : [];
    const imgsJson = imgsJsonStr(imgs);
    const imgClass = imgs.length === 1 ? "single" : "";
    const showUser = !c.is_anonymous && c.user_id;
    const avatar = showUser ? resolveMediaUrl(c.avatar) || DEFAULT_AVATAR : DEFAULT_AVATAR;
    const nickname = showUser ? c.nickname || "用户" + c.user_id : "匿名用户";
    return `<div class="card" onclick="goConfessionDetail(${c.id})" style="margin:0 8px 8px;">\n        <div class="post-header">\n          <img class="avatar" src="${avatar}" onclick="event.stopPropagation();${showUser ? `goUserProfile('${c.user_id}')` : ""}" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">\n          <div class="post-user">\n            <div class="post-nickname">${wrapNick(nickname, c)}${showUser ? renderListVerification(c) : ""}</div>\n            <div class="post-time">${timeAgo(c.create_time)}</div>\n          </div>\n        </div>\n        <div class="post-content">${formatContentWithTopics(c.content || "")}</div>\n        ${imgs.length ? `<div class="post-images ${imgClass}" style="padding:0 16px 8px;">${imgs.map((i, idx) => `<img loading="lazy" src="${resolveThumb(i)}" onclick="event.stopPropagation();showFullImage('${i}','${imgsJson}',${idx})">`).join("")}</div>` : ""}\n        <div class="post-actions" onclick="event.stopPropagation()">\n          <div class="action-item" onclick="likeConfession(${c.id},this)"><i class="${c.liked ? "fa-solid fa-heart" : "fa-regular fa-heart"}" style="color:${c.liked ? "var(--color-red)" : ""}"></i><span>${c.likes || 0}</span></div>\n          <div class="action-item" onclick="goConfessionDetail(${c.id})"><i class="fa-regular fa-comment"></i><span>${c.comment_count || 0}</span></div>\n        </div>\n      </div>`;
}

function goConfessionDetail(id) {
    pageHistory.push(currentPage);
    prevPage = currentPage;
    currentPage = "confessionDetail";
    setTabbarVisible(false);
    try {
        history.pushState({
            page: "confessionDetail"
        }, "", "#confessionDetail");
    } catch (e) {}
    api("/confessionDetail?id=" + id).then(r => {
        if (r.code === 1) {
            currentConfessionDetail = r.data;
            try {
                window.scrollTo(0, 0);
                render();
                updateTabbar();
            } catch (renderErr) {
                console.error("render confessionDetail error:", renderErr);
                pageHistory.pop();
                currentPage = prevPage;
                showToast("加载失败，请稍后重试");
            }
        } else {
            showToast(r.msg || "加载失败");
        }
    });
}

function renderNotificationLikes() {
    if (!getToken()) {
        showLoginModal();
        return `<div class="page">\n          <div class="navbar" style="position:fixed;top:0;left:0;right:0;z-index:100;background:#fff;">\n            <div onclick="goBack()" style="font-size:22px;cursor:pointer;color:#333;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div>\n            <h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">收到的赞和收藏</h1>\n            <div style="width:28px;"></div>\n          </div>\n          <div style="padding-top:calc(50px + env(safe-area-inset-top));"></div>\n          <div class="empty" style="text-align:center;padding:40px;">请先登录</div>\n        </div>`;
    }
    return `<div class="page">\n        <div class="navbar" style="position:fixed;top:0;left:0;right:0;z-index:100;background:#fff;">\n          <div onclick="goBack()" style="font-size:22px;cursor:pointer;color:#333;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div>\n          <h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">收到的赞和收藏</h1>\n          <div style="width:28px;"></div>\n        </div>\n        <div style="padding-top:calc(50px + env(safe-area-inset-top));"></div>\n        <div id="notificationLikesList" style="background:#fff;"></div>\n        <div style="height:20px;"></div>\n      </div>`;
}

async function bindNotificationLikesEvents() {
    try {
        const res = await api("/notifications?type=like");
        const list = document.getElementById("notificationLikesList");
        if (!res.data || res.data.length === 0) {
            list.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#999;">暂无赞和收藏</div>';
            return;
        }
        list.innerHTML = res.data.map(n => {
            const typeText = n.type === "like" ? "赞了你的帖子" : "收藏了你的帖子";
            const icon = n.type === "like" ? "fa-heart" : "fa-star";
            return `<div class="notify-item" style="display:flex;padding:12px 16px;border-bottom:0.5px solid #f0f0f0;">\n            <img src="${resolveMediaUrl(n.avatar) || DEFAULT_AVATAR}" onclick="goUserProfile('${n.from_user}')" style="width:44px;height:44px;border-radius:50%;flex-shrink:0;cursor:pointer;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">\n            <div style="flex:1;margin-left:12px;overflow:hidden;">\n              <div style="display:flex;align-items:center;gap:4px;">\n                <span style="font-weight:600;font-size:15px;">${n.nickname || "用户" + n.from_user}</span>\n                <span style="font-size:13px;color:#999;">${typeText}</span>\n              </div>\n              <div style="font-size:12px;color:#999;margin-top:2px;">${timeAgo(n.create_time)}</div>\n            </div>\n            ${n.post_id ? `<div onclick="goPostDetail('${n.post_id}')" style="width:64px;height:64px;border-radius:8px;overflow:hidden;flex-shrink:0;cursor:pointer;background:#f5f5f5;">\n              <img src="${resolveThumb(n.post_cover || DEFAULT_AVATAR)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='';this.style.backgroundColor='#f5f5f5';this.onerror=null">\n            </div>` : ""}\n          </div>`;
        }).join("");
        api("/readNotify", "POST");
    } catch (e) {
        document.getElementById("notificationLikesList").innerHTML = '<div style="text-align:center;padding:40px;color:#999;">加载失败</div>';
    }
}

function renderNotificationFollows() {
    if (!getToken()) {
        showLoginModal();
        return `<div class="page">\n          <div class="navbar" style="position:fixed;top:0;left:0;right:0;z-index:100;background:#fff;">\n            <div onclick="goBack()" style="font-size:22px;cursor:pointer;color:#333;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div>\n            <h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">新增关注</h1>\n            <div style="width:28px;"></div>\n          </div>\n          <div style="padding-top:calc(50px + env(safe-area-inset-top));"></div>\n          <div class="empty" style="text-align:center;padding:40px;">请先登录</div>\n        </div>`;
    }
    return `<div class="page">\n        <div class="navbar" style="position:fixed;top:0;left:0;right:0;z-index:100;background:#fff;">\n          <div onclick="goBack()" style="font-size:22px;cursor:pointer;color:#333;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div>\n          <h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">新增关注</h1>\n          <div style="width:28px;"></div>\n        </div>\n        <div style="padding-top:calc(50px + env(safe-area-inset-top));"></div>\n        <div id="notificationFollowsList" style="background:#fff;"></div>\n        <div style="height:20px;"></div>\n      </div>`;
}

async function bindNotificationFollowsEvents() {
    try {
        const res = await api("/notifications?type=follow");
        const list = document.getElementById("notificationFollowsList");
        if (!res.data || res.data.length === 0) {
            list.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#999;">暂无新增关注</div>';
            return;
        }
        list.innerHTML = res.data.map(n => {
            const isFollowed = n.followed || false;
            const followStatus = n.follow_status || "approved";
            let btnHtml = "";
            if (followStatus === "pending") {
                btnHtml = `<button onclick="approveFollowRequest('${n.from_user}', this)" data-uid="${n.from_user}" style="padding:6px 16px;border:none;background:var(--color-primary);color:#fff;border-radius:20px;font-size:13px;font-weight:500;cursor:pointer;">通过</button>`;
            } else if (isFollowed) {
                btnHtml = `<button data-uid="${n.from_user}" style="padding:6px 16px;border:1px solid #ddd;color:#999;border-radius:20px;font-size:13px;font-weight:500;cursor:pointer;background:#f5f5f5;">已关注</button>`;
            } else {
                btnHtml = `<button onclick="followUser('${n.from_user}', this)" data-uid="${n.from_user}" style="padding:6px 16px;border:1px solid var(--color-primary);color:var(--color-primary);border-radius:20px;font-size:13px;font-weight:500;cursor:pointer;background:#fff;">回关</button>`;
            }
            return `<div class="notify-item" style="display:flex;align-items:center;padding:12px 16px;border-bottom:0.5px solid #f0f0f0;">\n            <img src="${resolveMediaUrl(n.avatar) || DEFAULT_AVATAR}" onclick="goUserProfile('${n.from_user}')" style="width:44px;height:44px;border-radius:50%;flex-shrink:0;cursor:pointer;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">\n            <div style="flex:1;margin-left:12px;overflow:hidden;">\n              <div style="font-weight:600;font-size:15px;">${n.nickname || "用户" + n.from_user}</div>\n              <div style="font-size:13px;color:#999;margin-top:2px;">开始关注你了 · ${timeAgo(n.create_time)}</div>\n            </div>\n            ${btnHtml}\n          </div>`;
        }).join("");
        api("/readNotify", "POST");
    } catch (e) {
        document.getElementById("notificationFollowsList").innerHTML = '<div style="text-align:center;padding:40px;color:#999;">加载失败</div>';
    }
}

async function approveFollowRequest(applicantId, btn) {
    if (!requireLogin()) return;
    try {
        const r = await api("/approveFollow", "POST", {
            applicantId: applicantId
        });
        if (r.code === 1) {
            btn.textContent = "回关";
            btn.style.background = "#fff";
            btn.style.color = "var(--color-primary)";
            btn.style.border = "1px solid var(--color-primary)";
            btn.setAttribute("onclick", `followUser('${applicantId}', this)`);
            showToast("已通过");
        } else {
            showToast(r.msg || "操作失败");
        }
    } catch (e) {
        showToast("操作失败");
    }
}

function renderNotificationComments() {
    if (!getToken()) {
        showLoginModal();
        return `<div class="page">\n          <div class="navbar" style="position:fixed;top:0;left:0;right:0;z-index:100;background:#fff;">\n            <div onclick="goBack()" style="font-size:22px;cursor:pointer;color:#333;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div>\n            <h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">收到的评论和@</h1>\n            <div style="width:28px;"></div>\n          </div>\n          <div style="padding-top:calc(50px + env(safe-area-inset-top));"></div>\n          <div class="empty" style="text-align:center;padding:40px;">请先登录</div>\n        </div>`;
    }
    return `<div class="page">\n        <div class="navbar" style="position:fixed;top:0;left:0;right:0;z-index:100;background:#fff;">\n          <div onclick="goBack()" style="font-size:22px;cursor:pointer;color:#333;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div>\n          <h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">收到的评论和@</h1>\n          <div style="width:28px;"></div>\n        </div>\n        <div style="padding-top:calc(50px + env(safe-area-inset-top));"></div>\n        <div id="notificationCommentsList" style="background:#fff;"></div>\n        <div style="height:20px;"></div>\n      </div>`;
}

async function bindNotificationCommentsEvents() {
    try {
        const res = await api("/notifications?type=comment");
        const list = document.getElementById("notificationCommentsList");
        if (!res.data || res.data.length === 0) {
            list.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#999;">暂无评论和@</div>';
            return;
        }
        list.innerHTML = res.data.map(n => {
            const actionText = n.type === "mention" ? "在评论中@了你" : "评论了你的帖子";
            return `<div class="notify-item" style="display:flex;padding:12px 16px;border-bottom:0.5px solid #f0f0f0;">\n            <img src="${resolveMediaUrl(n.avatar) || DEFAULT_AVATAR}" onclick="goUserProfile('${n.from_user}')" style="width:44px;height:44px;border-radius:50%;flex-shrink:0;cursor:pointer;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">\n            <div style="flex:1;margin-left:12px;overflow:hidden;">\n              <div style="display:flex;align-items:center;gap:4px;">\n                <span style="font-weight:600;font-size:15px;">${n.nickname || "用户" + n.from_user}</span>\n                <span style="font-size:13px;color:#999;">${actionText}</span>\n              </div>\n              <div style="font-size:12px;color:#999;margin-top:2px;">${timeAgo(n.create_time)}</div>\n              ${n.content ? `<div style="font-size:14px;color:#333;margin-top:4px;">${formatPostContent(n.content)}</div>` : ""}\n              <div style="display:flex;gap:16px;margin-top:8px;">\n                <span class="notify-action" onclick="goPostDetail('${n.post_id}');goCommentScroll()">回复</span>\n              </div>\n            </div>\n            ${n.post_id ? `<div onclick="goPostDetail('${n.post_id}')" style="width:64px;height:64px;border-radius:8px;overflow:hidden;flex-shrink:0;cursor:pointer;background:#f5f5f5;">\n              <img src="${resolveThumb(n.post_cover || DEFAULT_AVATAR)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='';this.style.backgroundColor='#f5f5f5';this.onerror=null">\n            </div>` : ""}\n          </div>`;
        }).join("");
        api("/readNotify", "POST");
    } catch (e) {
        document.getElementById("notificationCommentsList").innerHTML = '<div style="text-align:center;padding:40px;color:#999;">加载失败</div>';
    }
}

function goCommentScroll() {
    scrollToCommentFlag = true;
}

function followUser(followId, btn) {
    if (!requireLogin()) return;
    api("/follow", "POST", {
        followId: followId
    }).then(r => {
        if (r.code === 1) {
            const followed = r.data.followed;
            const pending = r.data.pending;
            if (followed && pending) {
                btn.textContent = "申请中";
                btn.style.backgroundColor = "#f5f5f5";
                btn.style.color = "#999";
                btn.style.borderColor = "#ddd";
            } else if (followed) {
                btn.textContent = "已关注";
                btn.style.backgroundColor = "#f5f5f5";
                btn.style.color = "#999";
                btn.style.borderColor = "#ddd";
            } else {
                btn.textContent = "回关";
                btn.style.backgroundColor = "#fff";
                btn.style.color = "var(--color-primary)";
                btn.style.borderColor = "var(--color-primary)";
            }
        } else {
            showToast(r.msg || "操作失败");
        }
    }).catch(() => {
        showToast("操作失败");
    });
}

function renderConfessionDetail() {
    if (!currentConfessionDetail) return '<div style="padding:40px;text-align:center;">表白不存在或已删除</div>';
    const c = currentConfessionDetail;
    const imgs = c.images ? c.images.split(",").filter(x => x) : [];
    const imgsJson = imgsJsonStr(imgs);
    const imgClass = imgs.length === 1 ? "single" : "";
    const liked = c.liked || false;
    const showUser = !c.is_anonymous && c.user_id;
    const avatar = showUser ? resolveMediaUrl(c.avatar) || DEFAULT_AVATAR : DEFAULT_AVATAR;
    const nickname = showUser ? c.nickname || "用户" + c.user_id : "匿名用户";
    const isMine = c.user_id && c.user_id === getUid();
    const isAdmin = currentNickname === "管理员";
    const canChat = c.user_id && c.user_id !== getUid();
    return `<div class="post-detail" style="background:#fff;min-height:100vh;">\n        <div class="navbar" style="position:fixed;top:0;z-index:100;background:#fff;border-bottom:0.5px solid #eee;"><div onclick="goBack()" style="font-size:22px;cursor:pointer;color:#333;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div><h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">详情</h1>${isMine || isAdmin ? '<div onclick="showConfessionManageMenu(' + c.id + ')" style="font-size:20px;cursor:pointer;color:#333;padding:0 4px;"><i class="fa-solid fa-ellipsis"></i></div>' : "<div onclick=\"goReport('confession'," + c.id + ')" style="font-size:18px;cursor:pointer;padding:0 4px;"><i class="fa-solid fa-triangle-exclamation"></i></div>'}</div>\n        <div style="padding-top:50px;">\n          <div class="post-header" style="padding:12px 16px;">\n            <img class="avatar" src="${avatar}" onclick="${showUser ? `goUserProfile('${c.user_id}')` : ""}" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">\n            <div class="post-user">\n              <div class="post-nickname">${wrapNick(nickname, c)}${c.is_anonymous ? '<span style="margin-left:6px;padding:2px 6px;background:#f0f0f0;color:#999;border-radius:10px;font-size:11px;">匿名</span>' : ""}${showUser ? renderListVerification(c) : ""}</div>\n              <div class="post-time">${timeAgo(c.create_time)}</div>\n            </div>\n            ${canChat ? `<button onclick="goChat('${c.user_id}', ${c.is_anonymous ? "true" : "false"}, ${c.id})" style="padding:6px 16px;background:var(--color-primary);color:#fff;border:none;border-radius:20px;font-size:13px;font-weight:500;">${c.is_anonymous ? "匿名私信" : "发私信"}</button>` : ""}\n          </div>\n          <div class="post-content">${formatContentWithTopics(c.content || "")}</div>\n          ${imgs.length ? `<div class="post-images ${imgClass}">${imgs.map((i, idx) => `<img loading="lazy" src="${resolveThumb(i)}" onclick="showFullImage('${i}','${imgsJson}',${idx})">`).join("")}</div>` : ""}\n          <div class="post-actions" style="border-bottom:1px solid #eee;border-top:1px solid #eee;margin:0 16px;">\n            <div class="action-item" onclick="likeConfession(${c.id},this)"><i class="${liked ? "fa-solid fa-heart" : "fa-regular fa-heart"}" style="color:${liked ? "var(--color-red)" : ""}"></i><span>${c.likes || 0}</span></div>\n            <div class="action-item" id="confessionCommentScrollTarget"><i class="fa-regular fa-comment"></i><span>${c.comment_count || 0}</span></div>\n          </div>\n          <div id="confessionCommentList" style="padding:16px;"></div>\n          <div style="height:60px;"></div>\n        </div>\n        <div class="comment-input-bar">\n          <img class="comment-input-avatar" src="${resolveMediaUrl(myAvatar) || DEFAULT_AVATAR}" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">\n          <input class="comment-input" id="confessionCommentInput" placeholder="说点什么...">\n          <span id="confessionCommentCharCount" class="comment-char-count"></span>\n          <div class="comment-send" id="confessionCommentSendBtn" onclick="sendConfessionComment()">发送</div>\n        </div>\n      </div>`;
}

async function bindConfessionDetailEvents() {
    if (!currentConfessionDetail) return;
    const ci = document.getElementById("confessionCommentInput");
    if (ci) {
        ci.addEventListener("input", updateConfessionCharCount);
        ci.addEventListener("focus", ensureCommentInputVisible);
        ci.addEventListener("blur", () => {
            setTimeout(ensureCommentInputVisible, 100);
        });
    }
    await loadConfessionComments(currentConfessionDetail.id);
}

function updateConfessionCharCount() {
    const input = document.getElementById("confessionCommentInput");
    if (!input) return;
    const count = input.value.length;
    const remaining = 150 - count;
    const el = document.getElementById("confessionCommentCharCount");
    if (!el) return;
    if (remaining <= 20) {
        el.textContent = remaining;
        el.style.color = remaining < 0 ? "var(--color-red)" : "#999";
    } else {
        el.textContent = "";
        el.style.color = "#999";
    }
}

function setConfessionReply(seq) {
    confessionReplyTargetSeq = seq;
    const ci = document.getElementById("confessionCommentInput");
    if (ci) {
        ci.focus();
        ci.placeholder = "回复中...";
    }
}

async function loadConfessionComments(confessionId) {
    const res = await api("/confessionCommentList?confessionId=" + confessionId);
    const list = document.getElementById("confessionCommentList");
    if (!list) return;
    if (!res.data || res.data.length === 0) {
        list.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#999;">还没有评论，快来抢沙发吧</div>';
        return;
    }
    const myUid = getUid();
    const seqMap = {};
    res.data.forEach(c => {
        seqMap[c.post_seq] = c;
    });
    const renderComment = (c, repliesHtml, parentName) => {
        const content = formatCommentContent(c.content);
        const nameHtml = parentName ? `<span class="c-name">${c.nickname}</span><span class="reply-arrow"></span><span class="reply-parent-name">${parentName}</span>` : `<span class="c-name">${c.nickname}</span>`;
        const isMine = c.user_id === myUid || currentNickname === "管理员";
        return `<div class="comment-item" data-ccomment-id="${c.id}" data-cis-mine="${isMine}">\n            <img class="c-avatar" src="${resolveMediaUrl(c.avatar) || DEFAULT_AVATAR}" onclick="goUserProfile('${c.user_id}')" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">\n            <div class="c-body">\n              <div class="c-header">\n                ${nameHtml}\n                ${c.post_seq === 1 ? '<span class="comment-tag-first">首评</span>' : ""}\n              </div>\n              <div class="c-content collapsed" id="ccc-${c.id}">${content}</div>\n              <div class="c-meta">\n                <div class="c-meta-left">\n                  <span class="c-time">${timeAgo(c.create_time)}</span>\n                  ${cleanProvince(c.province) ? `<span>${cleanProvince(c.province)}</span>` : ""}\n                  <span class="c-action" onclick="setConfessionReply(${c.post_seq})">回复</span>\n                </div>\n                <span class="c-like" onclick="likeConfessionComment(${c.id},this)">\n                  <i class="${c.liked ? "fa-solid fa-heart" : "fa-regular fa-heart"}" style="color:${c.liked ? "var(--color-red)" : ""}"></i>\n                  <span>${c.likes || 0}</span>\n                </span>\n              </div>\n              ${repliesHtml || ""}\n            </div>\n          </div>`;
    };
    const collectAllDescendants = parentSeq => {
        const direct = res.data.filter(c => c.parent_seq == parentSeq);
        let all = [];
        for (const c of direct) {
            all.push(c);
            all = all.concat(collectAllDescendants(c.post_seq));
        }
        return all;
    };
    const buildTree = parentSeq => res.data.filter(c => c.parent_seq == parentSeq).map(c => {
        const allDescendants = collectAllDescendants(c.post_seq);
        const repliesHtml = allDescendants.length > 0 ? `<div class="comment-replies">${allDescendants.map(d => {
            const parent = seqMap[d.parent_seq];
            const parentName = parent ? parent.nickname : "";
            return renderComment(d, "", parentName);
        }).join("")}</div>` : "";
        return renderComment(c, repliesHtml, "");
    });
    let html = buildTree(0).join("");
    if (!html.trim()) {
        list.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#999;">还没有评论，快来抢沙发吧</div>';
    } else {
        list.innerHTML = html;
        list.querySelectorAll(".c-content.collapsed").forEach(el => {
            const overflow = checkCommentOverflow(el);
            if (overflow) {
                const id = el.id.replace("ccc-", "");
                const btn = document.createElement("span");
                btn.className = "c-expand";
                btn.setAttribute("data-cexpand-id", id);
                btn.innerHTML = '展开<span class="c-expand-arrow"></span>';
                btn.onclick = () => toggleConfessionCommentExpand(id);
                el.insertAdjacentElement("afterend", btn);
                ensureCommentContentTruncated(el);
            } else {
                el.classList.remove("collapsed");
            }
        });
        bindConfessionCommentLongPress();
    }
}

function bindConfessionCommentLongPress() {
    const items = document.querySelectorAll(".comment-item[data-ccomment-id]");
    items.forEach(item => {
        let timer = null;
        const start = e => {
            timer = setTimeout(() => {
                showConfessionCommentMenu(item.dataset.ccommentId, item.dataset.cisMine === "true");
            }, 500);
        };
        const cancel = () => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        };
        const move = () => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        };
        item.addEventListener("touchstart", start, {
            passive: true
        });
        item.addEventListener("touchend", cancel);
        item.addEventListener("touchmove", move, {
            passive: true
        });
        item.addEventListener("mousedown", start);
        item.addEventListener("mouseup", cancel);
        item.addEventListener("mouseleave", cancel);
        item.addEventListener("contextmenu", e => {
            e.preventDefault();
            showConfessionCommentMenu(item.dataset.ccommentId, item.dataset.cisMine === "true");
        });
    });
}

function showConfessionCommentMenu(commentId, isMine) {
    const existing = document.getElementById("confessionCommentMenuOverlay");
    if (existing) existing.remove();
    const overlay = document.createElement("div");
    overlay.id = "confessionCommentMenuOverlay";
    overlay.className = "modal-overlay active";
    overlay.onclick = e => {
        if (e.target === overlay) overlay.remove();
    };
    if (isMine) {
        overlay.innerHTML = `<div class="modal-content" style="max-height:40vh;">\n          <div class="modal-handler"></div>\n          <div class="modal-item" style="border-bottom:none;color:var(--color-red);text-align:center;" onclick="deleteConfessionComment(${commentId})">\n            <span class="label" style="justify-content:center;width:100%;"><i class="fa-solid fa-trash-can"></i> 删除评论</span>\n          </div>\n        </div>`;
    } else {
        overlay.innerHTML = `<div class="modal-content" style="max-height:40vh;">\n          <div class="modal-handler"></div>\n          <div class="modal-item" style="border-bottom:none;color:var(--color-primary);text-align:center;" onclick="document.getElementById('confessionCommentMenuOverlay').remove();goReport('confession_comment',${commentId})">\n            <span class="label" style="justify-content:center;width:100%;"><i class="fa-solid fa-triangle-exclamation"></i> 举报评论</span>\n          </div>\n        </div>`;
    }
    document.body.appendChild(overlay);
}

async function deleteConfessionComment(commentId) {
    try {
        const res = await api("/deleteConfessionComment", "POST", {
            commentId: commentId
        });
        if (res.code === 1) {
            showToast("已删除");
            document.getElementById("confessionCommentMenuOverlay")?.remove();
            if (currentConfessionDetail) {
                currentConfessionDetail.comment_count = Math.max(0, (currentConfessionDetail.comment_count || 0) - 1);
                await loadConfessionComments(currentConfessionDetail.id);
            }
        } else {
            showToast(res.msg || "删除失败");
        }
    } catch (e) {
        showToast("删除失败");
    }
}

async function likeConfessionComment(id, el) {
    if (!getToken()) {
        showLoginModal();
        return;
    }
    const res = await api("/likeConfessionComment", "POST", {
        commentId: id
    });
    if (res.code === 1) {
        const liked = res.data.liked;
        const icon = el.querySelector("i");
        const span = el.querySelector("span");
        icon.className = liked ? "fa-solid fa-heart" : "fa-regular fa-heart";
        icon.style.color = liked ? "var(--color-red)" : "";
        span.textContent = parseInt(span.textContent) + (liked ? 1 : -1);
    }
}

async function sendConfessionComment() {
    const content = document.getElementById("confessionCommentInput").value.trim();
    if (!content) return;
    if (content.length > 150) {
        showToast("评论不能超过150字");
        return;
    }
    if (!getToken()) {
        showLoginModal();
        return;
    }
    document.getElementById("confessionCommentInput").value = "";
    document.getElementById("confessionCommentInput").placeholder = "说点什么...";
    updateConfessionCharCount();
    confessionReplyTargetSeq = 0;
    const sendBtn = document.getElementById("confessionCommentSendBtn");
    if (sendBtn) {
        sendBtn.style.pointerEvents = "none";
        sendBtn.style.opacity = "0.5";
        setTimeout(() => {
            sendBtn.style.pointerEvents = "";
            sendBtn.style.opacity = "";
        }, 1e3);
    }
    const res = await api("/confessionComment", "POST", {
        confessionId: currentConfessionDetail.id,
        content: content,
        parentSeq: confessionReplyTargetSeq
    });
    if (res.code === 1) {
        await loadConfessionComments(currentConfessionDetail.id);
        if (currentConfessionDetail) {
            currentConfessionDetail.comment_count = (currentConfessionDetail.comment_count || 0) + 1;
        }
    } else {
        handleActionError(res, "评论失败");
    }
}

function showConfessionManageMenu(id) {
    const existing = document.getElementById("confessionManageOverlay");
    if (existing) existing.remove();
    const overlay = document.createElement("div");
    overlay.id = "confessionManageOverlay";
    overlay.className = "modal-overlay active";
    overlay.onclick = e => {
        if (e.target === overlay) overlay.remove();
    };
    overlay.innerHTML = `<div class="modal-content" style="max-height:40vh;">\n        <div class="modal-handler"></div>\n        <div class="modal-item" style="border-bottom:none;color:var(--color-red);text-align:center;" onclick="confirmDeleteConfession(${id})">\n          <span class="label" style="justify-content:center;width:100%;"><i class="fa-solid fa-trash-can"></i> 删除表白</span>\n        </div>\n      </div>`;
    document.body.appendChild(overlay);
}

function confirmDeleteConfession(id) {
    const existing = document.getElementById("confirmDeleteConfessionOverlay");
    if (existing) existing.remove();
    const overlay = document.createElement("div");
    overlay.id = "confirmDeleteConfessionOverlay";
    overlay.className = "modal-overlay active";
    overlay.onclick = e => {
        if (e.target === overlay) overlay.remove();
    };
    overlay.innerHTML = `<div class="modal-content" style="max-height:35vh;">\n        <div class="modal-handler"></div>\n        <div style="font-weight:600;font-size:16px;margin-bottom:16px;text-align:center;">确认删除这条表白？</div>\n        <div style="display:flex;gap:10px;">\n          <button onclick="document.getElementById('confirmDeleteConfessionOverlay').remove()" style="flex:1;height:44px;background:#f5f5f5;border-radius:12px;font-weight:500;">取消</button>\n          <button onclick="doDeleteConfession(${id})" style="flex:1;height:44px;background:var(--color-red);color:#fff;border-radius:12px;font-weight:500;">删除</button>\n        </div>\n      </div>`;
    document.body.appendChild(overlay);
}

async function doDeleteConfession(id) {
    try {
        const res = await api("/deleteConfession", "POST", {
            id: id
        });
        if (res.code === 1) {
            showToast("已删除");
            document.getElementById("confirmDeleteConfessionOverlay")?.remove();
            document.getElementById("confessionManageOverlay")?.remove();
            goBack();
        } else {
            showToast(res.msg || "删除失败");
        }
    } catch (e) {
        showToast("删除失败");
    }
}

function renderHome() {
    return `<div class="page">\n        <div class="home-top-bar" style="position:sticky;top:0;z-index:100;background:#fff;">\n          <div class="home-tabs" style="display:flex;position:relative;align-items:center;justify-content:center;padding:10px 20px 8px;gap:24px;">\n            <div class="home-tab ${homeFeedTab === "recommend" ? "active" : ""}" data-tab="recommend" style="position:relative;padding:8px 0;font-size:18px;font-weight:${homeFeedTab === "recommend" ? "700" : "400"};color:${homeFeedTab === "recommend" ? "#333" : "#999"};cursor:pointer;">\n              推荐\n              ${homeFeedTab === "recommend" ? '<div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:20px;height:3px;background:var(--color-primary);border-radius:2px;"></div>' : ""}\n            </div>\n            <div class="home-tab ${homeFeedTab === "follow" ? "active" : ""}" data-tab="follow" style="position:relative;padding:8px 0;font-size:18px;font-weight:${homeFeedTab === "follow" ? "700" : "400"};color:${homeFeedTab === "follow" ? "#333" : "#999"};cursor:pointer;">\n              关注\n              ${homeFeedTab === "follow" ? '<div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:20px;height:3px;background:var(--color-primary);border-radius:2px;"></div>' : ""}\n            </div>\n          </div>\n          <div style="height:0.5px;background:#e5e5e5;"></div>\n          <div class="home-search-bar" onclick="goSearchGuard()" style="margin:10px 16px;height:36px;background:#f5f5f5;border-radius:18px;display:flex;align-items:center;padding:0 14px;gap:8px;color:#999;font-size:14px;cursor:pointer;">\n            <i class="fa-solid fa-magnifying-glass" style="font-size:13px;"></i>\n            <span>搜索感兴趣的内容</span>\n          </div>\n          <div style="height:0.5px;background:#e5e5e5;"></div>\n        </div>\n        <div id="postList">${feedCache && feedCache.feed === (homeFeedTab || "recommend") && feedCache.html ? feedCache.html : ""}</div>\n        <div id="loadMore" style="display:none;padding:16px 16px 24px;"><div class="sk-item" style="height:14px;margin-bottom:8px;"></div><div class="sk-item" style="height:14px;margin-bottom:8px;"></div><div class="sk-item" style="height:14px;width:60%;"></div></div>\n        <div id="noMoreTip" style="display:none;text-align:center;padding:20px;color:#ccc;font-size:13px;">— 没有更多了 —</div>\n        <div id="fabCreateBtn" class="fab" onclick="goCreatePostGuard()" style="position:fixed;bottom:calc(80px + env(safe-area-inset-bottom));right:16px;width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg, #099536, #0BB84D);color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;z-index:101;box-shadow:0 4px 10px rgba(0,0,0,0.2);pointer-events:auto;"><i class="fa-solid fa-plus"></i></div>\n      </div>`;
}

function bindHomeEvents() {
    initImagePrefetchObserver();
    document.querySelectorAll(".home-tab").forEach(tab => {
        tab.onclick = () => {
            if (tab.dataset.tab === "follow" && !getToken()) {
                showLoginModal();
                return;
            }
            homeFeedTab = tab.dataset.tab;
            render();
        };
    });
    loadPosts(true);
    window.onscroll = () => {
        if (currentPage !== "home") return;
        if (noMorePosts || loading) return;
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 200) loadPosts();
    };
}

async function refreshFeedDelta() {
    if (!posts.length) return;
    try {
        const ids = posts.map(p => p.id);
        const since = feedCache && feedCache.maxTime ? feedCache.maxTime : posts[0] && posts[0].create_time || "";
        const res = await api(`/postFeedDelta?ids=${encodeURIComponent(JSON.stringify(ids))}&since=${encodeURIComponent(since)}`);
        if (!res || res.code !== 1 || !res.data) return;
        const {newPosts: newPosts, changed: changed, removed: removed} = res.data;
        let dirty = false;
        if (Array.isArray(removed) && removed.length) {
            const rmSet = new Set(removed.map(Number));
            const before = posts.length;
            posts = posts.filter(p => !rmSet.has(p.id));
            if (posts.length !== before) dirty = true;
        }
        if (Array.isArray(changed)) {
            changed.forEach(c => {
                const local = posts.find(p => p.id === c.id);
                if (!local) return;
                if (local.likes !== c.likes) {
                    local.likes = c.likes;
                    dirty = updateCardCount(c.id, 0, c.likes, local.liked) || dirty;
                }
                if (local.comments !== c.comments) {
                    local.comments = c.comments;
                    dirty = updateCardCount(c.id, 1, c.comments) || dirty;
                }
                if (local.collects !== c.collects) {
                    local.collects = c.collects;
                    dirty = updateCardCount(c.id, 2, c.collects, local.collected) || dirty;
                }
                if (c.liked !== undefined && c.liked !== local.liked) {
                    local.liked = c.liked;
                    dirty = true;
                }
                if (c.collected !== undefined && c.collected !== local.collected) {
                    local.collected = c.collected;
                    dirty = true;
                }
            });
        }
        if (Array.isArray(newPosts) && newPosts.length) {
            let insertAt = 0;
            while (insertAt < posts.length && posts[insertAt].pinned) insertAt++;
            posts = [ ...posts.slice(0, insertAt), ...newPosts.map(n => ({
                ...n,
                liked: n.liked !== undefined ? n.liked : false,
                collected: n.collected !== undefined ? n.collected : false
            })), ...posts.slice(insertAt) ];
            dirty = true;
        }
        if (dirty) {
            const el = document.getElementById("postList");
            if (el && currentPage === "home") {
                el.innerHTML = AdManager.injectFeed(posts.map(renderPostCard)).join("");
                AdManager.fill(el);
                setTimeout(refreshCardExpandButtons, 0);
                feedCache = {
                    posts: posts,
                    feed: homeFeedTab || "recommend",
                    html: el.innerHTML,
                    ts: Date.now(),
                    pages: postPage,
                    maxTime: maxCreateTime(posts)
                };
            }
        }
    } catch (e) {}
}

function maxCreateTime(list) {
    let m = "";
    list.forEach(p => {
        if (p.create_time && p.create_time > m) m = p.create_time;
    });
    return m;
}

function updateCardCount(postId, idx, val, active) {
    const card = document.getElementById("pc-" + postId);
    if (!card) return false;
    const items = card.querySelectorAll(".post-actions .action-item");
    if (items.length <= idx) return false;
    const span = items[idx].querySelector("span");
    if (!span) return false;
    span.textContent = val || 0;
    return true;
}

async function loadPosts(refresh = false) {
    if (loading) return;
    const noMoreEl = document.getElementById("noMoreTip");
    if (refresh) {
        postPage = 1;
        posts = [];
        noMorePosts = false;
        if (noMoreEl) noMoreEl.style.display = "none";
    }
    if (refresh) {
        const _feedKey = homeFeedTab || "recommend";
        const _cacheFresh = feedCache && feedCache.feed === _feedKey && Array.isArray(feedCache.posts) && feedCache.posts.length && Date.now() - feedCache.ts < 5 * 60 * 1e3;
        if (_cacheFresh) {
            posts = feedCache.posts;
            postPage = (feedCache.pages || 1) + 1;
            const _plEl0 = document.getElementById("postList");
            if (_plEl0 && !_plEl0.innerHTML.trim()) _plEl0.innerHTML = feedCache.html || "";
            hideAppSkeleton();
            loading = false;
            refreshFeedDelta();
            return;
        }
    }
    if (noMorePosts) return;
    loading = true;
    const loadMoreEl = document.getElementById("loadMore");
    if (loadMoreEl) loadMoreEl.style.display = "block";
    const feed = homeFeedTab || "recommend";
    try {
        const res = await api(`/postList?page=${postPage}&size=10&feed=${feed}`);
        if (loadMoreEl) loadMoreEl.style.display = "none";
        if (res.code === 0 && res.msg === "未登录") {
            showLoginModal();
            loading = false;
            hideAppSkeleton();
            return;
        }
        if (res.code === 1) {
            const list = res.data || [];
            posts = refresh ? list : [ ...posts, ...list ];
            const _plEl = document.getElementById("postList");
            if (posts.length) {
                const _cards = AdManager.injectFeed(posts.map(renderPostCard));
                _plEl.innerHTML = _cards.join("");
                AdManager.fill(_plEl);
                feedCache = {
                    posts: posts,
                    feed: homeFeedTab || "recommend",
                    html: _plEl.innerHTML,
                    ts: Date.now(),
                    pages: postPage,
                    maxTime: maxCreateTime(posts)
                };
            } else {
                _plEl.innerHTML = '<div class="empty"><i class="fa-solid fa-pen-to-square"></i><p>暂无动态</p></div>';
            }
            setTimeout(refreshCardExpandButtons, 0);
            if (res.limited) {
                noMorePosts = true;
                if (noMoreEl && posts.length > 0) {
                    if (getToken()) {
                        noMoreEl.innerHTML = "— 没有更多了 —";
                    } else {
                        noMoreEl.innerHTML = '<i class="fa-solid fa-lock"></i> 登录查看更多内容';
                    }
                    noMoreEl.style.display = "block";
                }
            } else if (list.length < 10) {
                noMorePosts = true;
                if (noMoreEl && posts.length > 0) {
                    noMoreEl.innerHTML = "— 没有更多了 —";
                    noMoreEl.style.display = "block";
                }
            } else {
                postPage++;
            }
        }
    } catch (e) {
        if (loadMoreEl) loadMoreEl.style.display = "none";
        hideAppSkeleton();
    }
    loading = false;
    if (posts.length || refresh && document.getElementById("postList")) {
        hideAppSkeleton();
    } else {
        waitSkeletonReady(document.getElementById("app"), 1500).then(function() {
            hideAppSkeleton();
        });
    }
}

async function likePost(id, el) {
    if (!getToken()) {
        showLoginModal();
        return;
    }
    event.stopPropagation();
    try {
        const res = await api("/likePost", "POST", {
            postId: id
        });
        if (res.code === 1) {
            const liked = res.data.liked;
            const icon = el.querySelector("i");
            const span = el.querySelector("span");
            icon.className = liked ? "fa-solid fa-heart" : "fa-regular fa-heart";
            icon.style.color = liked ? "var(--color-red)" : "";
            span.textContent = parseInt(span.textContent) + (liked ? 1 : -1);
            if (typeof posts !== "undefined" && posts.length) {
                const p = posts.find(x => x.id === id);
                if (p) {
                    p.liked = liked;
                    p.likes = parseInt(span.textContent);
                }
            }
            if (typeof currentPost !== "undefined" && currentPost && currentPost.id === id) {
                currentPost.liked = liked;
                currentPost.likes = parseInt(span.textContent);
            }
        }
    } catch (e) {
        showToast("操作失败");
    }
}

async function collectPost(id, el) {
    if (!getToken()) {
        showLoginModal();
        return;
    }
    event.stopPropagation();
    try {
        const res = await api("/collectPost", "POST", {
            postId: id
        });
        if (res.code === 1) {
            const collected = res.data.collected;
            const icon = el.querySelector("i");
            const span = el.querySelector("span");
            icon.className = collected ? "fa-solid fa-star" : "fa-regular fa-star";
            icon.style.color = collected ? "var(--color-yellow)" : "";
            span.textContent = parseInt(span.textContent) + (collected ? 1 : -1);
            if (typeof posts !== "undefined" && posts.length) {
                const p = posts.find(x => x.id === id);
                if (p) {
                    p.collected = collected;
                    p.collects = parseInt(span.textContent);
                }
            }
            if (typeof currentPost !== "undefined" && currentPost && currentPost.id === id) {
                currentPost.collected = collected;
                currentPost.collects = parseInt(span.textContent);
            }
        }
    } catch (e) {
        showToast("操作失败");
    }
}

function openConfessionModal() {
    if (!getToken()) {
        showLoginModal();
        return;
    }
    const modal = document.getElementById("confessionModal");
    if (modal) modal.classList.add("active");
}

function toggleConfessionWarning() {
    const checkbox = document.getElementById("confessionAnonymous");
    const warning = document.getElementById("confessionWarning");
    if (warning) {
        warning.style.display = checkbox?.checked ? "block" : "none";
    }
}

function closeConfessionModal() {
    const modal = document.getElementById("confessionModal");
    if (modal) modal.classList.remove("active");
    const content = document.getElementById("confessionContent");
    if (content) content.value = "";
    const anon = document.getElementById("confessionAnonymous");
    if (anon) anon.checked = false;
    toggleConfessionWarning();
}

async function submitConfession() {
    const content = document.getElementById("confessionContent")?.value.trim();
    if (!content) {
        showToast("请输入内容");
        return;
    }
    const is_anonymous = document.getElementById("confessionAnonymous")?.checked ? 1 : 0;
    try {
        const res = await api("/confession", "POST", {
            content: content,
            is_anonymous: is_anonymous
        });
        if (res.code === 1) {
            showToast("发布成功");
            closeConfessionModal();
            loadDiscoverContent("confession");
        } else {
            handleActionError(res, "发布失败");
        }
    } catch (e) {
        showToast("网络异常");
    }
}

let homeworkImages = [];

let isHomeworkUploading = false;

let isHomeworkPublishing = false;

function openHomeworkModal() {
    if (!getToken()) {
        showLoginModal();
        return;
    }
    const avatarImg = document.getElementById("hwModalAvatar");
    if (avatarImg) avatarImg.src = resolveMediaUrl(myAvatar) || DEFAULT_AVATAR;
    const modal = document.getElementById("homeworkModal");
    if (modal) modal.classList.add("active");
    homeworkImages = [];
    isHomeworkUploading = false;
    isHomeworkPublishing = false;
    renderHomeworkImgPreview();
    resetHwPublishBtn();
}

function closeHomeworkModal() {
    const modal = document.getElementById("homeworkModal");
    if (modal) modal.classList.remove("active");
    const content = document.getElementById("homeworkContent");
    if (content) content.value = "";
    homeworkImages = [];
    isHomeworkUploading = false;
    isHomeworkPublishing = false;
    renderHomeworkImgPreview();
    resetHwPublishBtn();
}

function resetHwPublishBtn() {
    isHomeworkPublishing = false;
    const btn = document.getElementById("hwPublishBtn");
    if (btn) {
        btn.textContent = "发布";
        btn.style.opacity = "1";
        btn.style.pointerEvents = "auto";
    }
}

async function handleHomeworkImgUpload(files) {
    const fileArr = Array.from(files || []);
    if (fileArr.length === 0) return;
    if (isHomeworkUploading) {
        showToast("正在上传，请稍候");
        return;
    }
    if (homeworkImages.length + fileArr.length > 15) {
        showToast("最多上传15张图片");
        return;
    }
    const imgFiles = fileArr.filter(f => f.type.startsWith("image/"));
    if (imgFiles.length !== fileArr.length) showToast("只能上传图片");
    if (imgFiles.length === 0) return;
    isHomeworkUploading = true;
    const processedFiles = [];
    for (let f of imgFiles) {
        try {
            const compressed = await compressImage(f);
            compressed._previewUrl = URL.createObjectURL(compressed);
            processedFiles.push(compressed);
        } catch (e) {
            f._previewUrl = URL.createObjectURL(f);
            processedFiles.push(f);
        }
    }
    homeworkImages.push(...processedFiles);
    renderHomeworkImgPreview();
    try {
        const fd = new FormData;
        processedFiles.forEach(f => fd.append("images", f));
        const xhrRef = {};
        const res = await apiForm("/uploadImage", fd, (loaded, total) => {
            const pct = Math.round(loaded / total * 100);
            document.querySelectorAll("#homeworkImgPreview .create-media-item .progress-ring").forEach(el => {
                el.style.background = `conic-gradient(#fff 0% ${pct}%, rgba(255,255,255,0.2) ${pct}%)`;
            });
        }, 12e4, xhrRef);
        if (res && res.code === 1 && res.data && res.data.urls) {
            const urls = res.data.urls;
            processedFiles.forEach((f, i) => {
                if (urls[i]) f._uploadedUrl = urls[i];
            });
        } else {
            processedFiles.forEach(f => {
                f._uploadFailed = true;
            });
            showToast(res?.msg || "上传失败");
        }
    } catch (e) {
        processedFiles.forEach(f => {
            f._uploadFailed = true;
        });
        showToast("图片上传失败，点击重试");
    } finally {
        isHomeworkUploading = false;
        renderHomeworkImgPreview();
    }
}

function renderHomeworkImgPreview() {
    const preview = document.getElementById("homeworkImgPreview");
    const addBtn = document.getElementById("homeworkImgAddBtn");
    if (!preview) return;
    let html = "";
    homeworkImages.forEach((f, idx) => {
        const thumbUrl = f._previewUrl || "";
        const isUploading = isHomeworkUploading && !f._uploadFailed && !f._uploadedUrl;
        if (f._uploadFailed) {
            html += `<div class="create-media-item" style="position:relative;">\n            ${thumbUrl ? `<img src="${thumbUrl}" style="opacity:0.4;">` : `<div style="width:100%;height:100%;background:#f0f0f0;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-image" style="font-size:24px;color:#999;"></i></div>`}\n            <div onclick="event.stopPropagation();retryHomeworkUpload(${idx})" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:4px;z-index:2;cursor:pointer;">\n              <div style="width:36px;height:36px;background:rgba(0,0,0,0.6);border-radius:50%;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-rotate-right" style="color:#fff;font-size:16px;"></i></div>\n              <span style="color:#fff;font-size:10px;text-shadow:0 1px 2px rgba(0,0,0,0.5);">重试</span>\n            </div>\n            <div class="del" onclick="event.stopPropagation();removeHomeworkImg(${idx})"><i class="fa-solid fa-xmark"></i></div>\n          </div>`;
        } else {
            html += `<div class="create-media-item" style="position:relative;">\n            ${thumbUrl ? `<img src="${thumbUrl}">` : `<div style="width:100%;height:100%;background:#f0f0f0;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-image" style="font-size:24px;color:#999;"></i></div>`}\n            ${isUploading ? `<div class="upload-overlay"><div class="progress-ring"></div></div>` : ""}\n            <div class="del" onclick="event.stopPropagation();removeHomeworkImg(${idx})"><i class="fa-solid fa-xmark"></i></div>\n          </div>`;
        }
    });
    if (homeworkImages.length < 15) {
        html += `<div class="create-media-item" onclick="document.getElementById('homeworkImgInput').click()"><i class="fa-solid fa-plus"></i></div>`;
    }
    preview.innerHTML = html;
}

async function retryHomeworkUpload(idx) {
    const f = homeworkImages[idx];
    if (!f || f._uploadedUrl) return;
    delete f._uploadFailed;
    isHomeworkUploading = true;
    renderHomeworkImgPreview();
    try {
        const fd = new FormData;
        fd.append("images", f);
        const res = await apiForm("/uploadImage", fd, (loaded, total) => {
            const pct = Math.round(loaded / total * 100);
            const items = document.querySelectorAll("#homeworkImgPreview .create-media-item");
            if (items[idx]) {
                const ring = items[idx].querySelector(".progress-ring");
                if (ring) ring.style.background = `conic-gradient(#fff 0% ${pct}%, rgba(255,255,255,0.2) ${pct}%)`;
            }
        }, 12e4);
        if (res && res.code === 1 && res.data && res.data.urls && res.data.urls[0]) {
            f._uploadedUrl = res.data.urls[0];
        } else {
            f._uploadFailed = true;
            showToast(res?.msg || "重试失败");
        }
    } catch (e) {
        f._uploadFailed = true;
        showToast("重试失败");
    } finally {
        isHomeworkUploading = false;
        renderHomeworkImgPreview();
    }
}

function removeHomeworkImg(idx) {
    homeworkImages.splice(idx, 1);
    renderHomeworkImgPreview();
}

async function submitHomework() {
    if (isHomeworkPublishing) return;
    if (!requireLogin()) return;
    if (isHomeworkUploading) {
        showToast("图片正在上传中，请稍候");
        return;
    }
    const hasFailed = homeworkImages.some(f => f._uploadFailed);
    if (hasFailed) {
        showToast("有图片上传失败，请重试或删除");
        return;
    }
    const content = document.getElementById("homeworkContent")?.value.trim();
    const subjectEl = document.querySelector(".hw-subject-select.active");
    const subject = subjectEl?.dataset.subject || "其它";
    if (!content && homeworkImages.length === 0) {
        showToast("请输入内容或上传图片");
        return;
    }
    const imageUrls = homeworkImages.map(f => f._uploadedUrl).filter(x => x);
    isHomeworkPublishing = true;
    const btn = document.getElementById("hwPublishBtn");
    if (btn) {
        btn.textContent = "发布中...";
        btn.style.opacity = "0.6";
        btn.style.pointerEvents = "none";
    }
    try {
        const res = await api("/homeworkCreate", "POST", {
            content: content || "",
            subject: subject,
            images: imageUrls
        });
        if (res.code === 1) {
            showToast("发布成功");
            closeHomeworkModal();
            loadHomeworkList(subject);
        } else {
            handleActionError(res, "发布失败");
        }
    } catch (e) {
        showToast("网络异常");
    } finally {
        resetHwPublishBtn();
    }
}

async function loadHomeworkList(subject, _silent) {
    const listEl = document.getElementById("homeworkList");
    if (!listEl) return;
    homeworkActiveSubject = subject || "全部";
    const _stale = listEl.dataset.subject && listEl.dataset.subject !== subject;
    if (!listEl.innerHTML.trim() || _stale) listEl.innerHTML = '<div class="loading" style="text-align:center;padding:20px;">加载中...</div>';
    const _snapHw = () => {
        const _subj = homeworkActiveSubject || "全部";
        const _hl = cacheGet(homeworkListCache, _subj);
        cacheSet(discoverCache, "homework", _homeworkShellHtml(_hl ? _hl.html : "", _hl ? _subj : ""));
    };
    try {
        const apiSubject = subject === "全部" ? "all" : subject;
        const res = await api(`/homeworkList?subject=${encodeURIComponent(apiSubject)}&page=1&size=20`);
        if (res.code === 0 && res.msg === "未登录") {
            if (!_silent) listEl.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#999;"><i class="fa-solid fa-lock" style="font-size:32px;margin-bottom:12px;display:block;"></i>登录后查看作业</div>';
            return;
        }
        if (res.code === 1) {
            const list = res.data || [];
            let _newHtml;
            if (list.length === 0) {
                _newHtml = '<div style="text-align:center;padding:60px 20px;color:#999;">暂无作业，来上传第一个吧</div>';
            } else {
                _newHtml = list.map(item => {
                    const imgs = item.images ? item.images.split(",").filter(x => x).map(img => img.includes("/") ? img : "/uploads/homework/" + img) : [];
                    const imgsJson = imgsJsonStr(imgs);
                    const imgClass = imgs.length === 1 ? "single" : "";
                    let imagesHtml = "";
                    if (imgs.length > 0) {
                        if (imgs.length <= 9) {
                            imagesHtml = `<div class="post-images ${imgClass}">${imgs.map((i, idx) => `<img loading="lazy" src="${resolveThumb(i)}" onclick="event.stopPropagation();showFullImage('${i}','${imgsJson}',${idx})">`).join("")}</div>`;
                        } else {
                            const first8 = imgs.slice(0, 8);
                            const rest = imgs.slice(8);
                            const restCount = imgs.length - 8;
                            imagesHtml = `<div class="post-images">\n                    ${first8.map((i, idx) => `<img loading="lazy" src="${resolveThumb(i)}" onclick="event.stopPropagation();showFullImage('${i}','${imgsJson}',${idx})">`).join("")}\n                    <div onclick="event.stopPropagation();showFullImage('${rest[0]}','${imgsJson}',8)" style="position:relative;aspect-ratio:1;border-radius:8px;overflow:hidden;cursor:pointer;border:0.5px solid rgba(0,0,0,0.08);box-sizing:border-box;">\n                      <div style="display:grid;grid-template-columns:repeat(3,1fr);width:100%;height:100%;">\n                        ${rest.slice(0, 9).map(i => `<img loading="lazy" src="${resolveThumb(i)}" style="width:100%;height:100%;aspect-ratio:1;object-fit:cover;border:none;">`).join("")}\n                      </div>\n                      <div style="position:absolute;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;">\n                        <span style="color:#fff;font-size:22px;font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,0.5);">+${restCount}</span>\n                      </div>\n                    </div>\n                  </div>`;
                        }
                    }
                    return `\n                <div class="card" onclick="goHomeworkDetail(${item.id})">\n                  <div class="post-header">\n                    <img class="avatar" src="${resolveMediaUrl(item.avatar) || DEFAULT_AVATAR}" onclick="event.stopPropagation();goUserProfile('${item.user_id}')" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">\n                    <div class="post-user">\n                      <div class="post-nickname">${wrapNick(escapeHtml(item.nickname || "用户"), item)}${renderListVerification(item)}</div>\n                      <div class="post-time">${timeAgo(item.create_time)} · ${cleanProvince(item.province) || "未知"}</div>\n                    </div>\n                  </div>\n                  <div style="padding:0 16px 6px;">\n                    <span style="display:inline-block;padding:2px 10px;background:var(--color-primary-light);color:var(--color-primary);border-radius:10px;font-size:12px;font-weight:500;">${escapeHtml(item.subject || "其它")}</span>\n                  </div>\n                  ${item.content ? `<div class="post-content">${escapeHtml(item.content).replace(/@\[\d+\]([^\s\[\]<]{1,30})/g, "@$1")}</div>` : ""}\n                  ${imagesHtml}\n                  <div class="post-actions" onclick="event.stopPropagation()">\n                    <div class="action-item"><i class="fa-regular fa-eye"></i><span>${item.views || 0}</span></div>\n                    <div class="action-item"><i class="fa-regular fa-comment"></i><span>${item.comments || 0}</span></div>\n                    <div class="action-item"><i class="fa-regular fa-heart"></i><span>${item.likes || 0}</span></div>\n                  </div>\n                </div>\n              `;
                }).join("");
            }
            const _oldHw = cacheGet(homeworkListCache, subject);
            if (!(_oldHw && _oldHw.html === _newHtml)) listEl.innerHTML = _newHtml;
            listEl.dataset.subject = subject;
            cacheSet(homeworkListCache, subject, _newHtml);
            _snapHw();
        }
    } catch (e) {
        if (!_silent) listEl.innerHTML = '<div class="network-error">网络异常</div>';
    }
}

function goHomeworkDetail(id) {
    if (!requireLogin()) return;
    pageHistory.push(currentPage);
    prevPage = currentPage;
    currentPage = "homeworkDetail";
    homeworkDetailId = id;
    setTabbarVisible(false);
    try {
        history.pushState({
            page: "homeworkDetail"
        }, "", "#homeworkDetail");
    } catch (e) {}
    render();
    updateTabbar();
}

let homeworkDetail = null;

let homeworkComments = [];

let homeworkReplyTargetSeq = 0;

function renderHomeworkDetail() {
    return `<div class="post-detail" style="background:#fff;min-height:100vh;">\n        <div class="detail-navbar">\n          <div class="detail-navbar-back" onclick="goBack()"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div>\n          <div class="detail-navbar-title">作业详情</div>\n          <div style="display:flex;gap:12px;"><div id="hwDeleteBtn" style="display:none;width:32px;text-align:center;cursor:pointer;"><i class="fa-solid fa-trash"></i></div><div id="hwReportBtn" style="width:32px;text-align:center;cursor:pointer;"><i class="fa-solid fa-triangle-exclamation"></i></div></div>\n        </div>\n        <div id="homeworkDetailContent" style="padding-top:calc(50px + env(safe-area-inset-top));min-height:50vh;"><div class="loading" style="text-align:center;padding:60px;">加载中...</div></div>\n        <div class="comment-input-bar">\n          <img class="comment-input-avatar" src="${resolveMediaUrl(myAvatar) || DEFAULT_AVATAR}" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">\n          <input class="comment-input" id="hwCommentInput" placeholder="说点什么...">\n          <div class="comment-send" onclick="sendHomeworkComment()">发送</div>\n        </div>\n      </div>`;
}

async function bindHomeworkDetailEvents() {
    homeworkReplyTargetSeq = 0;
    const replyInput = document.getElementById("hwCommentInput");
    if (replyInput) {
        replyInput.placeholder = "说点什么...";
        replyInput.addEventListener("focus", ensureCommentInputVisible);
        replyInput.addEventListener("blur", () => {
            setTimeout(ensureCommentInputVisible, 100);
        });
    }
    const res = await api(`/homeworkDetail?id=${homeworkDetailId}`);
    const content = document.getElementById("homeworkDetailContent");
    if (res.code !== 1 || !res.data) {
        content.innerHTML = '<div class="network-error">加载失败</div>';
        return;
    }
    homeworkDetail = res.data;
    const isMine = homeworkDetail.user_id == getUid() || currentNickname === "管理员";
    const reportBtn = document.getElementById("hwReportBtn");
    if (reportBtn) {
        if (isMine) {
            reportBtn.style.display = "none";
        } else {
            reportBtn.style.display = "block";
            reportBtn.onclick = () => goReport("homework", homeworkDetailId);
        }
    }
    const deleteBtn = document.getElementById("hwDeleteBtn");
    if (deleteBtn) {
        if (isMine) {
            deleteBtn.style.display = "block";
            deleteBtn.onclick = () => deleteHomework(homeworkDetailId);
        } else {
            deleteBtn.style.display = "none";
        }
    }
    const imgs = homeworkDetail.images ? homeworkDetail.images.split(",").filter(x => x).map(img => img.includes("/") ? img : "/uploads/homework/" + img) : [];
    const imgsJson = imgsJsonStr(imgs);
    const imgClass = imgs.length === 1 ? "single" : "";
    content.innerHTML = `\n        <div style="padding-top:0;">\n          <div class="post-header">\n            <img class="avatar" src="${resolveMediaUrl(homeworkDetail.avatar) || DEFAULT_AVATAR}" onclick="goUserProfile('${homeworkDetail.user_id}')" style="cursor:pointer;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">\n            <div class="post-user">\n              <div class="post-nickname">${wrapNick(escapeHtml(homeworkDetail.nickname || "用户"), homeworkDetail)}${renderListVerification(homeworkDetail)}</div>\n              <div class="post-time">${timeAgo(homeworkDetail.create_time)} · ${cleanProvince(homeworkDetail.province) || "未知"}</div>\n            </div>\n          </div>\n          <div style="padding:0 16px 8px;">\n            <span style="display:inline-block;padding:2px 10px;background:var(--color-primary-light);color:var(--color-primary);border-radius:10px;font-size:12px;font-weight:500;">${escapeHtml(homeworkDetail.subject || "其它")}</span>\n          </div>\n          ${homeworkDetail.content ? `<div class="post-content">${formatContentWithTopics(homeworkDetail.content)}</div>` : ""}\n          ${imgs.length ? `<div class="post-images ${imgClass}">${imgs.map((img, idx) => `<img loading="lazy" src="${resolveThumb(img)}" onclick="showFullImage('${img}','${imgsJson}',${idx})">`).join("")}</div>` : ""}\n          <div class="post-actions" style="border-bottom:1px solid #eee;border-top:1px solid #eee;margin:0 16px;">\n            <div class="action-item" onclick="toggleHomeworkLike(this)"><i class="${homeworkDetail.liked ? "fa-solid fa-heart" : "fa-regular fa-heart"}" style="color:${homeworkDetail.liked ? "var(--color-red)" : ""}"></i><span>${homeworkDetail.likes || 0}</span></div>\n            <div class="action-item" id="hwCommentScrollTarget"><i class="fa-regular fa-comment"></i><span>${homeworkDetail.comments || 0}</span></div>\n            <div class="action-item" onclick="toggleHomeworkCollect(this)"><i class="${homeworkDetail.collected ? "fa-solid fa-star" : "fa-regular fa-star"}" style="color:${homeworkDetail.collected ? "var(--color-yellow)" : ""}"></i><span>${homeworkDetail.collects || 0}</span></div>\n          </div>\n          <div id="homeworkCommentsList" style="padding:16px;"></div>\n          <div style="height:60px;"></div>\n        </div>\n      `;
    loadHomeworkComments();
}

async function toggleHomeworkLike(el) {
    if (!requireLogin()) return;
    const res = await api("/likeHomework", "POST", {
        id: homeworkDetailId
    });
    if (res.code === 1) {
        homeworkDetail.liked = res.data.liked;
        homeworkDetail.likes = (homeworkDetail.likes || 0) + (res.data.liked ? 1 : -1);
        if (el) {
            const icon = el.querySelector("i");
            const span = el.querySelector("span");
            if (icon) {
                icon.className = res.data.liked ? "fa-solid fa-heart" : "fa-regular fa-heart";
                icon.style.color = res.data.liked ? "var(--color-red)" : "";
            }
            if (span) span.textContent = homeworkDetail.likes;
        }
    }
}

async function toggleHomeworkCollect(el) {
    if (!requireLogin()) return;
    const res = await api("/collectHomework", "POST", {
        id: homeworkDetailId
    });
    if (res.code === 1) {
        homeworkDetail.collected = res.data.collected;
        homeworkDetail.collects = (homeworkDetail.collects || 0) + (res.data.collected ? 1 : -1);
        if (el) {
            const icon = el.querySelector("i");
            const span = el.querySelector("span");
            if (icon) {
                icon.className = res.data.collected ? "fa-solid fa-star" : "fa-regular fa-star";
                icon.style.color = res.data.collected ? "var(--color-yellow)" : "";
            }
            if (span) span.textContent = homeworkDetail.collects;
        }
    }
}

async function loadHomeworkComments() {
    const listEl = document.getElementById("homeworkCommentsList");
    if (!listEl) return;
    const res = await api(`/homeworkComments?homeworkId=${homeworkDetailId}`);
    if (res.code !== 1) return;
    homeworkComments = res.data || [];
    if (homeworkComments.length === 0) {
        listEl.innerHTML = '<div style="text-align:center;padding:30px 20px;color:#999;font-size:13px;">暂无评论</div>';
        return;
    }
    const myUid = getUid();
    const seqMap = {};
    homeworkComments.forEach(c => {
        seqMap[c.post_seq] = c;
    });
    const renderHwComment = (c, repliesHtml, parentName) => {
        const text = formatCommentContent(c.content);
        const nameHtml = parentName ? `<span class="c-name">${escapeHtml(c.nickname || "用户")}</span><span class="reply-arrow"></span><span class="reply-parent-name">${escapeHtml(parentName)}</span>` : `<span class="c-name">${escapeHtml(c.nickname || "用户")}</span>`;
        const isMine = c.user_id === myUid || currentNickname === "管理员";
        const avatar = resolveMediaUrl(c.avatar) || DEFAULT_AVATAR;
        return `<div class="comment-item" data-comment-id="${c.id}" data-is-mine="${isMine}">\n            <img class="c-avatar" src="${avatar}" onclick="goUserProfile('${c.user_id}')" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">\n            <div class="c-body">\n              <div class="c-header">${nameHtml}${c.post_seq === 1 ? '<span class="comment-tag-first">首评</span>' : ""}</div>\n              <div class="c-content">${text}</div>\n              <div class="c-meta">\n                <div class="c-meta-left">\n                  <span class="c-time">${timeAgo(c.create_time)}</span>\n                  ${cleanProvince(c.province) ? `<span>${escapeHtml(cleanProvince(c.province))}</span>` : ""}\n                  <span class="c-action" onclick="setHwReply(${c.post_seq})">回复</span>\n                  ${isMine ? `<span class="c-action" onclick="deleteHomeworkComment(${c.id})" style="color:#ff2442;">删除</span>` : ""}\n                </div>\n                <span class="c-like" onclick="toggleHomeworkCommentLike(${c.id},this)">\n                  <i class="${c.liked ? "fa-solid fa-heart" : "fa-regular fa-heart"}" style="color:${c.liked ? "var(--color-red)" : ""}"></i>\n                  <span>${c.likes || 0}</span>\n                </span>\n              </div>\n              ${repliesHtml || ""}\n            </div>\n          </div>`;
    };
    const collectAllDescendants = parentSeq => {
        const direct = homeworkComments.filter(c => c.parent_seq == parentSeq);
        let all = [];
        for (const c of direct) {
            all.push(c);
            all = all.concat(collectAllDescendants(c.post_seq));
        }
        return all;
    };
    const buildTree = parentSeq => homeworkComments.filter(c => c.parent_seq == parentSeq).map(c => {
        const allDescendants = collectAllDescendants(c.post_seq);
        const repliesHtml = allDescendants.length > 0 ? `<div class="comment-replies">${allDescendants.map(d => {
            const parent = seqMap[d.parent_seq];
            const parentName = parent ? parent.nickname : "";
            return renderHwComment(d, "", parentName);
        }).join("")}</div>` : "";
        return renderHwComment(c, repliesHtml, "");
    });
    let html = buildTree(0).join("");
    if (!html.trim()) {
        listEl.innerHTML = '<div style="text-align:center;padding:30px 20px;color:#999;font-size:13px;">暂无评论</div>';
    } else {
        listEl.innerHTML = html;
    }
}

function setHwReply(seq) {
    homeworkReplyTargetSeq = seq;
    const input = document.getElementById("hwCommentInput");
    if (input) {
        input.focus();
        input.placeholder = "回复中...";
    }
}

async function toggleHomeworkCommentLike(commentId, el) {
    if (!requireLogin()) return;
    const res = await api("/likeHomeworkComment", "POST", {
        commentId: commentId
    });
    if (res.code === 1) {
        const c = homeworkComments.find(x => x.id === commentId);
        if (c) {
            c.liked = res.data.liked;
            c.likes = (c.likes || 0) + (res.data.liked ? 1 : -1);
        }
        loadHomeworkComments();
    }
}

async function deleteHomeworkComment(commentId) {
    if (!await customConfirm("确定删除这条评论吗？")) return;
    try {
        const res = await api("/deleteHomeworkComment", "POST", {
            commentId: commentId
        });
        if (res.code === 1) {
            showToast("已删除");
            homeworkDetail.comments = Math.max(0, (homeworkDetail.comments || 0) - 1);
            loadHomeworkComments();
        } else {
            showToast(res.msg || "删除失败");
        }
    } catch (e) {
        showToast("删除失败");
    }
}

async function deleteHomework(id) {
    if (!await customConfirm("确定删除这条作业吗？")) return;
    try {
        const res = await api("/deleteHomework", "POST", {
            id: id
        });
        if (res.code === 1) {
            showToast("已删除");
            goBack();
        } else {
            showToast(res.msg || "删除失败");
        }
    } catch (e) {
        showToast("删除失败");
    }
}

async function sendHomeworkComment() {
    const input = document.getElementById("hwCommentInput");
    const content = input?.value.trim();
    if (!content) {
        showToast("请输入内容");
        return;
    }
    if (content.length > 150) {
        showToast("评论不能超过150字");
        return;
    }
    if (!requireLogin()) return;
    const parentSeq = homeworkReplyTargetSeq;
    input.value = "";
    input.placeholder = "说点什么...";
    homeworkReplyTargetSeq = 0;
    try {
        const res = await api("/homeworkComment", "POST", {
            homeworkId: homeworkDetailId,
            content: content,
            parentSeq: parentSeq
        });
        if (res.code === 1) {
            showToast("评论成功");
            homeworkDetail.comments = (homeworkDetail.comments || 0) + 1;
            loadHomeworkComments();
        } else {
            handleActionError(res, "评论失败");
        }
    } catch (e) {
        showToast("网络异常");
    }
}

async function likeConfession(id, el) {
    if (!getToken()) {
        showLoginModal();
        return;
    }
    event.stopPropagation();
    try {
        const res = await api("/likeConfession", "POST", {
            id: id
        });
        if (res.code === 1) {
            const liked = res.data.liked;
            const icon = el.querySelector("i");
            const span = el.querySelector("span");
            icon.className = liked ? "fa-solid fa-heart" : "fa-regular fa-heart";
            icon.style.color = liked ? "var(--color-red)" : "";
            span.textContent = parseInt(span.textContent) + (liked ? 1 : -1);
        }
    } catch (e) {
        showToast("操作失败");
    }
}

function goCreatePostGuard() {
    if (!getToken()) {
        showLoginModal();
        return;
    }
    goPage("createPost");
}

function clearLocation() {
    createLocation = "";
    document.getElementById("locationDisp").textContent = "添加地点";
    document.getElementById("locationDisp").style.color = "#999";
    const spans = document.querySelectorAll("#createLocList span");
    spans.forEach(span => {
        span.classList.remove("active");
        span.style.color = "#333";
        span.style.background = "#f5f5f5";
    });
    if (spans.length > 0) {
        spans[0].classList.add("active");
        spans[0].style.color = "var(--color-primary)";
        spans[0].style.background = "var(--color-primary-light)";
    }
}

function buildPollPreviewHtml() {
    const opts = (createPollData.options || []).filter(o => o.trim());
    if (opts.length === 0) return "";
    return `<div style="background:#f9f9f9;padding:12px;border-radius:8px;margin-top:12px;">\n        <div style="font-weight:600;font-size:14px;color:#333;margin-bottom:6px;">投票预览</div>\n        ${opts.map(opt => `<div class="poll-preview-item"><div class="icon"><i class="fa-solid fa-circle-check"></i></div><div class="text">${opt}</div></div>`).join("")}\n      </div>`;
}

function renderCreatePost() {
    const iconVis = createVisibility === "public" ? "fa-solid fa-lock-open" : "fa-solid fa-lock";
    let mediaGridHtml = "";
    selectedCreateImages.forEach((f, i) => {
        const isVideo = f._isVideo || [ "mp4", "mov", "avi", "mkv" ].includes(f.name?.split(".")?.pop()?.toLowerCase());
        const thumbUrl = isVideo ? f._uploadedCover || f._thumbnailUrl || "" : f._previewUrl || "";
        const isUploading = isFileUploading && !f._uploadFailed && !f._uploadedUrl;
        const hasProgressCache = !f._uploadedUrl && !f._uploadFailed && uploadProgressCache.lastPct > 0;
        mediaGridHtml += `<div class="create-media-item" style="position:relative;">\n          ${thumbUrl ? `<img src="${thumbUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">` : `<div style="width:100%;height:100%;background:${isVideo ? "linear-gradient(135deg,#667eea 0%,#764ba2 100%)" : "#f0f0f0"};border-radius:8px;display:flex;align-items:center;justify-content:center;"><i class="fa-solid ${isVideo ? "fa-video" : "fa-image"}" style="font-size:28px;color:${isVideo ? "rgba(255,255,255,0.8)" : "#999"};"></i></div>`}\n          ${isVideo ? `<div onclick="event.stopPropagation();playCreateVideo(${i})" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:36px;height:36px;background:rgba(0,0,0,0.5);border-radius:50%;display:flex;align-items:center;justify-content:center;z-index:2;cursor:pointer;"><i class="fa-solid fa-play" style="color:#fff;font-size:14px;margin-left:2px;"></i></div>` : ""}\n          ${isUploading || hasProgressCache ? `<div class="progress-ring" style="position:absolute;inset:0;border-radius:8px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.3);z-index:3;">\n            <div style="width:40px;height:40px;border-radius:50%;border:3px solid rgba(255,255,255,0.3);border-top-color:#fff;animation:spin 1s linear infinite;"></div>\n          </div>` : ""}\n          ${f._uploadFailed ? `<div onclick="event.stopPropagation();retryUploadFile(${i})" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:4px;z-index:2;cursor:pointer;">\n            <div style="width:36px;height:36px;background:rgba(0,0,0,0.6);border-radius:50%;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-rotate-right" style="color:#fff;font-size:16px;"></i></div>\n            <span style="color:#fff;font-size:10px;text-shadow:0 1px 2px rgba(0,0,0,0.5);">重试</span>\n          </div>` : ""}\n          <div class="del" onclick="event.stopPropagation();delCreateImage(${i})"><i class="fa-solid fa-xmark"></i></div>\n        </div>`;
    });
    if (selectedCreateImages.length < 9) {
        mediaGridHtml += `<div class="create-media-item" onclick="document.getElementById('createImgInput').click()"><i class="fa-solid fa-plus"></i></div>`;
        mediaGridHtml += `<div class="create-media-item" onclick="document.getElementById('createVideoInput').click()" title="上传视频"><i class="fa-solid fa-video"></i></div>`;
    }
    return `<div class="create-page">\n        <div class="create-nav">\n          <div onclick="goPage('home')" style="font-size:24px;color:#333;cursor:pointer;"><i class="fa-solid fa-xmark"></i></div>\n          <div style="font-weight:600;font-size:16px;position:absolute;left:50%;transform:translateX(-50%);">发布帖子</div>\n          <div class="btn-publish" onclick="submitCreatePost()">发布</div>\n        </div>\n        <div class="create-content" id="createContentWrap">\n          <input class="create-title-input" id="createTitle" placeholder="添加标题" maxlength="30">\n          <div style="position:relative;">\n            <textarea class="create-body-input" id="createBody" placeholder="添加正文或发语音..."></textarea>\n          </div>\n          <div class="create-media-grid" id="createImageGrid">${mediaGridHtml}</div>\n          <input type="file" id="createImgInput" accept="image/*" multiple style="display:none" onchange="handleCreateImages(this.files); this.value=''">\n          <input type="file" id="createVideoInput" accept="video/*" multiple style="display:none" onchange="handleCreateVideos(this.files); this.value=''">\n          <div class="create-toolbar">\n            <span onclick="insertSymbol('#')"><i class="fa-solid fa-hashtag"></i> 话题</span>\n            <span onclick="openAtUserModal()"><i class="fa-solid fa-at"></i> 用户</span>\n            <span onclick="openPollModal()"><i class="fa-solid fa-chart-simple"></i> 投票</span>\n            <span style="margin-left:auto;color:#999;font-size:12px;" id="createCharCount">0</span>\n          </div>\n          <div id="pollPreviewWrap">${buildPollPreviewHtml()}</div>\n          <div class="create-tags" id="createHotTags">\n            <span style="color:#999;">加载中...</span>\n          </div>\n          <div class="create-setting-item" onclick="showLocationModal()">\n            <div class="left"><i class="fa-solid fa-location-dot" style="color:#333;"></i> 标记地点</div>\n            <div class="right" id="createLocationText"><span id="locationDisp">添加地点</span> <i class="fa-solid fa-chevron-right"></i></div>\n          </div>\n          <div class="create-locations" id="createLocList" onclick="selectQuickLocation(event)">\n            <span class="active" style="background:var(--color-primary-light);color:var(--color-primary);">不标记地点</span>\n          </div>\n          <div class="create-setting-item" onclick="openVisibilityModal()">\n            <div class="left"><i class="${iconVis}" style="color:#333;"></i> <span id="createVisibilityText">${createVisibility === "public" ? "公开可见" : createVisibility === "friends" ? "仅互关好友可见" : "仅自己可见"}</span></div>\n            <div class="right"><i class="fa-solid fa-chevron-right"></i></div>\n          </div>\n          <div class="create-setting-item" onclick="openAdvancedModal()" style="border-bottom:none;margin-top:8px;">\n            <div class="left"><i class="fa-solid fa-gear" style="color:#333;"></i> 高级选项</div>\n            <div class="right"><i class="fa-solid fa-chevron-right"></i></div>\n          </div>\n        </div>\n        <div class="topic-suggest-bar" id="topicSuggestBar" style="display:none;">\n          <div class="topic-suggest-header">\n            <span>推荐话题</span>\n            <span class="topic-suggest-close" onclick="hideTopicSuggest()"><i class="fa-solid fa-xmark"></i></span>\n          </div>\n          <div id="topicSuggestList"></div>\n        </div>\n        <div class="modal-overlay" id="advancedModal" onclick="if(event.target===this)closeAdvancedModal()">\n          <div class="modal-content">\n            <div class="modal-handler"></div>\n            <div class="modal-item">\n              <span class="label">原创声明</span>\n              <label class="switch"><input type="checkbox" id="declarationSwitch" onchange="toggleDeclarationOptions()"><span class="slider"></span></label>\n            </div>\n            <div id="declarationOptions" style="display:none;">\n              <div class="radio-list">\n                <div class="radio-item" onclick="selectDeclaration('自行拍摄')"><span>内容为自行拍摄</span><div class="radio-icon"><i class="fa-regular fa-circle"></i></div></div>\n                <div class="radio-item" onclick="selectDeclaration('转载')"><span>内容为转载</span><div class="radio-icon"><i class="fa-regular fa-circle"></i></div></div>\n                <div class="radio-item" onclick="selectDeclaration('虚构演绎')"><span>含虚构演绎内容</span><div class="radio-icon"><i class="fa-regular fa-circle"></i></div></div>\n                <div class="radio-item" onclick="selectDeclaration('AI合成')"><span>含 AI 合成内容</span><div class="radio-icon"><i class="fa-regular fa-circle"></i></div></div>\n                <div class="radio-item" onclick="selectDeclaration('营销信息')"><span>内容含营销信息</span><div class="radio-icon"><i class="fa-regular fa-circle"></i></div></div>\n                <div class="radio-item" onclick="selectDeclaration('仅供参考')"><span>个人观点，仅供参考</span><div class="radio-icon"><i class="fa-regular fa-circle"></i></div></div>\n              </div>\n            </div>\n            <div class="modal-item">\n              <span class="label"><i class="fa-regular fa-circle-down"></i> 允许下载帖子</span>\n              <label class="switch"><input type="checkbox" id="createAllowDownload"><span class="slider"></span></label>\n            </div>\n            <div class="modal-item" onclick="openSchedulePicker()">\n              <span class="label"><i class="fa-regular fa-clock"></i> 定时发布</span>\n              <div class="right" style="display:flex;align-items:center;gap:6px;color:#999;font-size:13px;">\n                <span id="scheduleTimeDisplay">未设置定时发布</span>\n                <i class="fa-solid fa-chevron-right" style="font-size:12px;color:#ccc;"></i>\n              </div>\n              <input type="hidden" id="scheduleTimePicker">\n            </div>\n          </div>\n        </div>\n        <div class="modal-overlay" id="visibilityModal" onclick="if(event.target===this)closeVisibilityModal()">\n          <div class="modal-content">\n            <div class="modal-handler"></div>\n            <div class="radio-item ${createVisibility === "public" ? "active" : ""}" data-vis="public" onclick="selectVisibility('public')">\n              <span><i class="fa-solid fa-lock-open"></i> 公开可见</span>\n              <div class="radio-icon">${createVisibility === "public" ? '<i class="fa-solid fa-circle-check"></i>' : '<i class="fa-regular fa-circle"></i>'}</div>\n            </div>\n            <div class="radio-item ${createVisibility === "friends" ? "active" : ""}" data-vis="friends" onclick="selectVisibility('friends')">\n              <span><i class="fa-solid fa-user-group"></i> 仅互关好友可见</span>\n              <div class="radio-icon">${createVisibility === "friends" ? '<i class="fa-solid fa-circle-check"></i>' : '<i class="fa-regular fa-circle"></i>'}</div>\n            </div>\n            <div class="radio-item ${createVisibility === "private" ? "active" : ""}" data-vis="private" onclick="selectVisibility('private')">\n              <span><i class="fa-solid fa-lock"></i> 仅自己可见</span>\n              <div class="radio-icon">${createVisibility === "private" ? '<i class="fa-solid fa-circle-check"></i>' : '<i class="fa-regular fa-circle"></i>'}</div>\n            </div>\n            <div style="height:1px;background:#f0f0f0;margin:12px 0;"></div>\n            <div class="modal-item" onclick="openUserSelectModal('visible')">\n              <span class="label"><i class="fa-regular fa-user"></i> 只给谁看</span>\n              <div class="right"><span style="color:#333;font-size:13px;">${createVisibleUsers.length > 0 ? createVisibleUsers.length + "人" : "选择"}</span> <i class="fa-solid fa-chevron-right"></i></div>\n            </div>\n            <div class="modal-item" style="border-bottom:none;" onclick="openUserSelectModal('blocked')">\n              <span class="label"><i class="fa-solid fa-eye-slash"></i> 不给谁看</span>\n              <div class="right"><span style="color:#333;font-size:13px;">${createBlockedUsers.length > 0 ? createBlockedUsers.length + "人" : "选择"}</span> <i class="fa-solid fa-chevron-right"></i></div>\n            </div>\n          </div>\n        </div>\n        <div class="dialog-modal" id="inputModal" onclick="if(event.target===this)document.getElementById('inputModal').classList.remove('active')">\n          <div class="dialog-modal-content" style="width:90%;max-width:360px;">\n            <div style="font-weight:600;font-size:16px;margin-bottom:16px;" id="inputModalTitle">输入内容</div>\n            <input id="inputModalValue" style="width:100%;background:#f5f5f5;border:none;border-radius:8px;padding:12px;font-size:15px;box-sizing:border-box;" placeholder="请输入...">\n            <div style="display:flex;gap:10px;margin-top:16px;">\n              <button onclick="document.getElementById('inputModal').classList.remove('active')" style="flex:1;height:44px;background:#f5f5f5;border-radius:12px;font-weight:500;border:none;">取消</button>\n              <button onclick="confirmInputModal()" style="flex:1;height:44px;background:var(--color-primary);color:#fff;border-radius:12px;font-weight:500;border:none;">确认</button>\n            </div>\n          </div>\n        </div>\n        <div class="modal-overlay" id="pollModal" onclick="if(event.target===this)closePollModal()">\n          <div class="modal-content">\n            <div class="modal-handler"></div>\n            <div style="font-weight:600;font-size:16px;margin-bottom:16px;">创建投票</div>\n            <div id="pollOptionsList"></div>\n            <div onclick="addPollOption()" style="color:var(--color-primary);font-weight:500;cursor:pointer;padding:8px 0;display:inline-block;"><i class="fa-solid fa-plus"></i> 添加选项</div>\n            <button onclick="closePollModal()" style="width:100%;height:48px;background:var(--color-primary);color:#fff;border-radius:12px;font-weight:600;margin-top:12px;">完成</button>\n          </div>\n        </div>\n        <div class="modal-overlay" id="userSelectModal" onclick="if(event.target===this)closeUserSelectModal()">\n          <div class="modal-content">\n            <div class="modal-handler"></div>\n            <div style="font-weight:600;font-size:16px;margin-bottom:12px;" id="userSelectTitle">选择用户</div>\n            <div style="position:relative;margin-bottom:12px;">\n              <input id="userSelectSearch" style="width:100%;background:#f5f5f5;border:none;border-radius:8px;padding:12px;font-size:14px;" placeholder="搜索用户..." oninput="searchUserSelect()">\n            </div>\n            <div id="userSelectList"></div>\n            <button onclick="closeUserSelectModal()" style="width:100%;height:48px;background:var(--color-primary);color:#fff;border-radius:12px;font-weight:600;margin-top:12px;">确认</button>\n          </div>\n        </div>\n      </div>`;
}

function showInputModal(title, placeholder, cb) {
    document.getElementById("inputModalTitle").textContent = title;
    document.getElementById("inputModalValue").placeholder = placeholder;
    document.getElementById("inputModalValue").value = "";
    document.getElementById("inputModal").classList.add("active");
    inputCallback = cb;
    setTimeout(() => document.getElementById("inputModalValue").focus(), 100);
}

function confirmInputModal() {
    const val = document.getElementById("inputModalValue").value.trim();
    document.getElementById("inputModal").classList.remove("active");
    if (val && inputCallback) {
        inputCallback(val);
        inputCallback = null;
    }
}

function openSchedulePicker() {
    const picker = document.getElementById("scheduleTimePicker");
    const modal = document.getElementById("scheduleModal");
    if (modal) {
        modal.classList.add("active");
    } else {
        const m = document.createElement("div");
        m.id = "scheduleModal";
        m.className = "dialog-modal";
        m.onclick = e => {
            if (e.target === m) m.classList.remove("active");
        };
        m.innerHTML = `\n          <div class="dialog-modal-content" style="width:90%;max-width:360px;" onclick="event.stopPropagation()">\n            <div style="font-weight:600;font-size:16px;margin-bottom:16px;">选择定时发布时间</div>\n            <input type="datetime-local" id="scheduleModalInput" style="width:100%;background:#f5f5f5;border:none;border-radius:8px;padding:12px;font-size:15px;box-sizing:border-box;">\n            <div style="display:flex;gap:10px;margin-top:16px;">\n              <button onclick="clearScheduleTime()" style="flex:1;height:44px;background:#f5f5f5;border-radius:12px;font-weight:500;border:none;">清除</button>\n              <button onclick="confirmScheduleTime()" style="flex:1;height:44px;background:var(--color-primary);color:#fff;border-radius:12px;font-weight:500;border:none;">确认</button>\n            </div>\n          </div>\n        `;
        document.body.appendChild(m);
        setTimeout(() => m.classList.add("active"), 10);
    }
    setTimeout(() => {
        const input = document.getElementById("scheduleModalInput");
        if (input && picker) input.value = picker.value || "";
    }, 50);
}

function confirmScheduleTime() {
    const input = document.getElementById("scheduleModalInput");
    const picker = document.getElementById("scheduleTimePicker");
    const display = document.getElementById("scheduleTimeDisplay");
    const modal = document.getElementById("scheduleModal");
    if (input && picker && display) {
        picker.value = input.value;
        if (input.value) {
            const d = new Date(input.value);
            display.textContent = `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
            display.style.color = "var(--color-primary)";
        } else {
            display.textContent = "未设置定时发布";
            display.style.color = "#999";
        }
    }
    if (modal) modal.classList.remove("active");
}

function clearScheduleTime() {
    const input = document.getElementById("scheduleModalInput");
    const picker = document.getElementById("scheduleTimePicker");
    const display = document.getElementById("scheduleTimeDisplay");
    if (input) input.value = "";
    if (picker) picker.value = "";
    if (display) {
        display.textContent = "未设置定时发布";
        display.style.color = "#999";
    }
}

function insertSymbol(sym) {
    const body = document.getElementById("createBody");
    const start = body.selectionStart;
    const end = body.selectionEnd;
    body.value = body.value.substring(0, start) + sym + body.value.substring(end);
    body.selectionStart = body.selectionEnd = start + 1;
    body.focus();
    if (sym === "#" || sym === "＃") {
        checkTopicTrigger(body);
    }
}

let currentTopicKeyword = "";

let topicStartPos = -1;

let topicStartChar = "";

let hotTopicsCache = [];

let topicSearchTimer = null;

async function loadHotTopics() {
    try {
        const res = await api("/topicHot?limit=3");
        if (res.code === 1) hotTopicsCache = res.data;
        renderHotTags();
    } catch (e) {
        renderHotTags();
    }
}

function renderHotTags() {
    const el = document.getElementById("createHotTags");
    if (!el) return;
    if (!hotTopicsCache || hotTopicsCache.length === 0) {
        el.style.display = "none";
        return;
    }
    el.style.display = "";
    el.innerHTML = hotTopicsCache.map(t => `<span onclick="insertHotTopic('${t.name.replace(/'/g, "\\'")}')">#${escapeHtml(t.name)}#</span>`).join("");
}

function insertHotTopic(name) {
    const ta = document.getElementById("createBody");
    if (!ta) return;
    const pos = ta.selectionStart;
    const val = ta.value;
    const before = val.substring(0, pos);
    const after = val.substring(pos);
    let prefix = "";
    if (before.length > 0 && before[before.length - 1] !== " " && before[before.length - 1] !== "\n") {
        prefix = " ";
    }
    const newVal = before + prefix + "#" + name + "# " + after;
    ta.value = newVal;
    const newPos = before.length + prefix.length + name.length + 3;
    ta.selectionStart = ta.selectionEnd = newPos;
    ta.focus();
    document.getElementById("createCharCount").textContent = ta.value.length;
}

function checkTopicTrigger(ta) {
    const val = ta.value;
    const pos = ta.selectionStart;
    let hashIdx = -1;
    let hashChar = "";
    for (let i = pos - 1; i >= 0; i--) {
        if (val[i] === "#" || val[i] === "＃") {
            hashIdx = i;
            hashChar = val[i];
            break;
        }
        if (val[i] === " " || val[i] === "\n") break;
    }
    if (hashIdx >= 0) {
        const afterHash = val.substring(hashIdx + 1, pos);
        if (afterHash.indexOf("#") === -1 && afterHash.indexOf("＃") === -1 && afterHash.length <= 20) {
            topicStartPos = hashIdx;
            topicStartChar = hashChar;
            currentTopicKeyword = afterHash;
            showTopicSuggest(afterHash);
            return;
        }
    }
    hideTopicSuggest();
}

function showTopicSuggest(keyword) {
    const bar = document.getElementById("topicSuggestBar");
    const list = document.getElementById("topicSuggestList");
    if (!bar || !list) return;
    bar.style.display = "block";
    if (window._adjustTopicBarsKeyboard) {
        window._adjustTopicBarsKeyboard();
    } else {
        const kb = Math.max(0, window.innerHeight - (window.visualViewport ? window.visualViewport.height : window.innerHeight));
        bar.style.bottom = kb + "px";
    }
    bar.classList.add("show");
    if (topicSearchTimer) clearTimeout(topicSearchTimer);
    if (!keyword) {
        renderTopicSuggest(hotTopicsCache, "");
        return;
    }
    topicSearchTimer = setTimeout(async () => {
        try {
            const res = await api("/topicSearch?keyword=" + encodeURIComponent(keyword) + "&limit=6");
            if (res.code === 1) {
                renderTopicSuggest(res.data, keyword);
            }
        } catch (e) {}
    }, 200);
}

function renderTopicSuggest(topics, keyword) {
    const list = document.getElementById("topicSuggestList");
    if (!list) return;
    let html = "";
    const hasExact = topics.some(t => t.name === keyword);
    if (keyword && !hasExact) {
        html += `<div class="topic-suggest-item" onclick="selectTopic('${keyword.replace(/'/g, "\\'")}', true)">\n          <div class="topic-suggest-name"><span class="topic-hash">#</span>${escapeHtml(keyword)}</div>\n          <div class="topic-suggest-views" style="color:var(--color-primary);">创建新话题</div>\n        </div>`;
    }
    topics.forEach(t => {
        html += `<div class="topic-suggest-item" onclick="selectTopic('${t.name.replace(/'/g, "\\'")}', false)">\n          <div class="topic-suggest-name"><span class="topic-hash">#</span>${escapeHtml(t.name)}</div>\n          <div class="topic-suggest-views">${formatNumber(t.views)} 浏览</div>\n        </div>`;
    });
    if (!topics.length && !keyword) {
        html = '<div style="padding:30px;text-align:center;color:#999;font-size:14px;">暂无话题，输入#创建新话题</div>';
    }
    list.innerHTML = html;
}

async function selectTopic(name, isNew) {
    const ta = document.getElementById("createBody");
    if (!ta) return;
    if (isNew) {
        try {
            const res = await api("/topicCreate", "POST", {
                name: name
            });
            if (res.code !== 1) {
                showToast("话题创建失败");
                return;
            }
        } catch (e) {
            showToast("话题创建失败");
            return;
        }
    }
    const val = ta.value;
    const pos = ta.selectionStart;
    const before = val.substring(0, topicStartPos);
    const after = val.substring(pos);
    const newVal = before + "#" + name + "# " + after;
    ta.value = newVal;
    const newPos = before.length + name.length + 3;
    ta.selectionStart = ta.selectionEnd = newPos;
    ta.focus();
    hideTopicSuggest();
    document.getElementById("createCharCount").textContent = ta.value.length;
}

function hideTopicSuggest() {
    const bar = document.getElementById("topicSuggestBar");
    if (bar) bar.classList.remove("show");
    setTimeout(function() {
        if (bar && !bar.classList.contains("show")) bar.style.display = "none";
    }, 300);
    topicStartPos = -1;
    currentTopicKeyword = "";
}

let atTriggerPos = -1;

function checkAtTrigger(ta) {
    const val = ta.value;
    const pos = ta.selectionStart;
    if (pos > 0 && (val[pos - 1] === "@" || val[pos - 1] === "＠")) {
        atTriggerPos = pos - 1;
        openAtUserModal();
    }
}

function insertAtUser(nickname, uid) {
    const textarea = document.getElementById("createBody");
    const val = textarea.value;
    let insertPos = atTriggerPos >= 0 ? atTriggerPos : textarea.selectionStart;
    const before = val.substring(0, insertPos);
    const triggerLen = atTriggerPos >= 0 && (val[atTriggerPos] === "＠" || val[atTriggerPos] === "@") ? 1 : 0;
    const after = val.substring(insertPos + triggerLen);
    const insertText = "@[" + uid + "]" + nickname + " ";
    const newText = before + insertText + after;
    textarea.value = newText;
    const newPos = before.length + insertText.length;
    textarea.selectionStart = textarea.selectionEnd = newPos;
    textarea.focus();
    document.getElementById("createCharCount").textContent = newText.length;
    closeAtUserModal();
    atTriggerPos = -1;
}

function extractTopics(text) {
    const topics = [];
    const normalized = text.replace(/＃/g, "#");
    const regex = /#([^#\s\n]{1,20})#/g;
    let match;
    while ((match = regex.exec(normalized)) !== null) {
        if (topics.indexOf(match[1]) === -1) topics.push(match[1]);
    }
    return topics;
}

function showLocationModal() {
    showInputModal("标记地点", "输入地点或当前位置", val => {
        createLocation = val;
        document.getElementById("locationDisp").textContent = val;
        document.getElementById("locationDisp").style.color = "var(--color-primary)";
        const spans = document.querySelectorAll("#createLocList span");
        spans.forEach(span => {
            span.classList.remove("active");
            span.style.color = "#333";
            span.style.background = "#f5f5f5";
        });
    });
}

function selectQuickLocation(el) {
    if (el.target && el.target.tagName === "SPAN") {
        if (el.target.textContent === "不标记地点") {
            clearLocation();
            return;
        }
        const val = el.target.textContent;
        createLocation = val;
        document.getElementById("locationDisp").textContent = val;
        document.getElementById("locationDisp").style.color = "var(--color-primary)";
        const spans = document.querySelectorAll("#createLocList span");
        spans.forEach(span => {
            span.classList.remove("active");
            span.style.color = "#333";
            span.style.background = "#f5f5f5";
        });
        el.target.classList.add("active");
        el.target.style.color = "var(--color-primary)";
        el.target.style.background = "var(--color-primary-light)";
    }
}

function bindCreatePostEvents() {
    const ta = document.getElementById("createBody");
    ta.addEventListener("input", e => {
        document.getElementById("createCharCount").textContent = e.target.value.length;
        checkTopicTrigger(e.target);
        checkAtTrigger(e.target);
    });
    ta.addEventListener("keyup", e => {
        if (e.key === "Escape") {
            hideTopicSuggest();
        }
    });
    if (!window.__topicKeyboardBound && window.visualViewport) {
        window.__topicKeyboardBound = true;
        const adjustBarsToKeyboard = () => {
            const rect = getViewportRect();
            const safeBottom = envSafeAreaBottom || 0;
            let bottom = Math.max(0, window.innerHeight - rect.bottom);
            if (bottom === 0) bottom = safeBottom; else bottom = bottom + Math.max(0, safeBottom - rect.top);
            const bottomPx = bottom + "px";
            [ "topicSuggestBar", "atUserModal" ].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.style.bottom = bottomPx;
                    el.style.paddingBottom = bottom <= safeBottom ? safeBottom > 0 ? safeBottom + "px" : "" : "0px";
                }
            });
            adjustModalsToKeyboard();
        };
        window.visualViewport.addEventListener("resize", adjustBarsToKeyboard);
        window.visualViewport.addEventListener("scroll", adjustBarsToKeyboard);
        window.addEventListener("resize", adjustBarsToKeyboard);
        window._adjustTopicBarsKeyboard = adjustBarsToKeyboard;
        if (!window.__modalObserverBound) {
            window.__modalObserverBound = true;
            const mo = new MutationObserver(() => {
                if (document.querySelector(".dialog-modal.active, .modal-overlay.active")) adjustModalsToKeyboard();
            });
            mo.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: [ "class" ]
            });
        }
    }
    loadHotTopics();
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async pos => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            let pois = [];
            try {
                const res = await api("/nearbyPOI?lat=" + lat + "&lng=" + lng);
                if (res.code === 1) {
                    pois = res.data.map(p => ({
                        name: p.name
                    }));
                }
            } catch (e) {
                showToast("获取附近位置失败，请手动选择");
            }
            let listHtml = `<span class="active" style="background:var(--color-primary-light);color:var(--color-primary);">不标记地点</span>`;
            listHtml += pois.map(p => `<span>${p.name}</span>`).join("");
            document.getElementById("createLocList").innerHTML = listHtml;
            createLocation = "";
            document.getElementById("locationDisp").textContent = "添加地点";
            document.getElementById("locationDisp").style.color = "#999";
        }, () => {
            document.getElementById("createLocList").innerHTML = `<span class="active" style="background:var(--color-primary-light);color:var(--color-primary);">不标记地点</span>`;
        });
    } else {
        document.getElementById("createLocList").innerHTML = `<span class="active" style="background:var(--color-primary-light);color:var(--color-primary);">不标记地点</span>`;
    }
}

function handleCreateVideos(files) {
    handleCreateImages(files);
}

async function handleCreateImages(files) {
    if (isFileUploading) {
        showToast("正在上传，请稍候");
        return;
    }
    const MAX_TOTAL = 9;
    const MAX_VIDEO = 2;
    if (selectedCreateImages.length >= MAX_TOTAL) {
        showToast("最多只能上传" + MAX_TOTAL + "个媒体文件");
        return;
    }
    const existingHasImg = selectedCreateImages.some(x => !x._isVideo);
    const existingHasVideo = selectedCreateImages.some(x => x._isVideo);
    const existingType = existingHasImg ? "image" : existingHasVideo ? "video" : "";
    let batchHasImg = false, batchHasVideo = false;
    const checkBatch = [];
    for (let f of files) {
        const name = (f.name || "").toLowerCase();
        const ext = name.split(".").pop();
        const isImg = [ "jpg", "jpeg", "png", "gif", "webp", "bmp" ].includes(ext) || f.type && f.type.startsWith("image/");
        const isVideo = [ "mp4", "mov", "avi", "mkv" ].includes(ext) || f.type && f.type.startsWith("video/");
        if (isImg) batchHasImg = true;
        if (isVideo) batchHasVideo = true;
        checkBatch.push({
            isImg: isImg,
            isVideo: isVideo,
            f: f
        });
    }
    if (batchHasImg && batchHasVideo) {
        showToast("不允许图片和视频混排，请只选择其中一种类型");
        return;
    }
    if (existingType === "image" && batchHasVideo) {
        showToast("不允许图片和视频混排，当前已有图片，请继续选择图片");
        return;
    }
    if (existingType === "video" && batchHasImg) {
        showToast("不允许图片和视频混排，当前已有视频，请继续选择视频");
        return;
    }
    const processedFiles = [];
    for (let item of checkBatch) {
        if (!item.isImg && !item.isVideo) {
            showToast("仅支持图片和视频");
            continue;
        }
        if (selectedCreateImages.length + processedFiles.length >= MAX_TOTAL) {
            showToast("最多只能上传" + MAX_TOTAL + "个媒体文件");
            break;
        }
        const f = item.f;
        if (item.isVideo) {
            const existing = [ ...selectedCreateImages, ...processedFiles ].filter(x => x._isVideo || [ "mp4", "mov", "avi", "mkv" ].includes(((x.name || "").split(".").pop() || "").toLowerCase())).length;
            if (existing >= MAX_VIDEO) {
                showToast("最多只能上传" + MAX_VIDEO + "个视频");
                continue;
            }
            const videoFile = f;
            const thumbnailUrl = await generateVideoThumbnail(videoFile);
            videoFile._isVideo = true;
            videoFile._thumbnailUrl = thumbnailUrl;
            processedFiles.push(videoFile);
        } else {
            const compressed = await compressImage(f);
            compressed._previewUrl = URL.createObjectURL(compressed);
            processedFiles.push(compressed);
        }
    }
    if (processedFiles.length === 0) return;
    selectedCreateImages.push(...processedFiles);
    updateCreateImageGridWithUploading(processedFiles);
    isFileUploading = true;
    const hasVideo = processedFiles.some(f => f._isVideo);
    const fd = new FormData;
    processedFiles.forEach(f => fd.append("images", f));
    let processingTimer = null;
    let uploadFinished = false;
    let processingStarted = false;
    let uploadSuccess = false;
    let lastProgress = 0;
    let lastProgressPaint = 0;
    const updateProgress = (loaded, total) => {
        if (processingStarted) return;
        if (!total || total === 0) return;
        const pct = loaded / total;
        if (pct < lastProgress) return;
        lastProgress = pct;
        uploadProgressCache.lastPct = pct;
        try {
            localStorage.setItem("uploadProgress", JSON.stringify({
                pct: pct,
                time: Date.now(),
                hasVideo: hasVideo
            }));
        } catch (e) {}
        const progressPct = hasVideo ? Math.min(Math.round(pct * 60), 59) : Math.round(pct * 100);
        const now = Date.now();
        if (now - lastProgressPaint < 120) return;
        lastProgressPaint = now;
        document.querySelectorAll("#createImageGrid .create-media-item .progress-ring").forEach(el => {
            el.style.background = `conic-gradient(#fff 0% ${progressPct}%, rgba(255,255,255,0.2) ${progressPct}%)`;
        });
        if (hasVideo && pct >= .99 && !uploadFinished) {
            uploadFinished = true;
            processingStarted = true;
            let processingPct = 60;
            document.querySelectorAll("#createImageGrid .create-media-item .progress-ring").forEach(el => {
                el.style.transition = "none";
            });
            const statusEl = document.getElementById("upload-status-text");
            if (statusEl) statusEl.textContent = "处理中...";
            processingTimer = setInterval(() => {
                const decay = (99 - processingPct) * .04;
                processingPct = Math.min(99, processingPct + (decay < .1 ? .1 : decay));
                document.querySelectorAll("#createImageGrid .create-media-item .progress-ring").forEach(el => {
                    el.style.background = `conic-gradient(#fff 0% ${processingPct}%, rgba(255,255,255,0.2) ${processingPct}%)`;
                });
            }, 500);
        }
    };
    const xhrRef = {};
    let retryCount = 0;
    const maxRetries = 3;
    const uploadTimeoutMs = hasVideo ? 6e5 : 12e4;
    async function doUpload() {
        try {
            const uploadFd = new FormData;
            processedFiles.forEach(f => uploadFd.append("images", f));
            const res = await apiForm("/uploadImage", uploadFd, updateProgress, uploadTimeoutMs, xhrRef);
            return res;
        } catch (e) {
            if (retryCount < maxRetries && navigator.onLine) {
                retryCount++;
                showToast(`上传中断，正在重试 (${retryCount}/${maxRetries})...`);
                processingStarted = false;
                uploadFinished = false;
                lastProgress = 0;
                lastProgressPaint = 0;
                if (processingTimer) {
                    clearInterval(processingTimer);
                    processingTimer = null;
                }
                document.querySelectorAll("#createImageGrid .create-media-item .progress-ring").forEach(el => {
                    el.style.background = `conic-gradient(#fff 0% 0%, rgba(255,255,255,0.2) 0%)`;
                });
                await new Promise(r => setTimeout(r, 1e3 * retryCount));
                return doUpload();
            }
            throw e;
        }
    }
    try {
        const res = await doUpload();
        if (processingTimer) clearInterval(processingTimer);
        if (res.code !== 1 || !res.data || !res.data.urls) {
            showToast(res.msg || "上传失败，点击重试");
            processedFiles.forEach(f => {
                f._uploadFailed = true;
            });
        } else {
            const failedFiles = [];
            const covers = res.data.covers || [];
            processedFiles.forEach((f, i) => {
                if (res.data.urls[i]) {
                    f._uploadedUrl = res.data.urls[i];
                    if (f._isVideo && covers[i]) {
                        f._uploadedCover = covers[i];
                    }
                } else {
                    failedFiles.push(f);
                }
            });
            if (failedFiles.length > 0) {
                failedFiles.forEach(f => {
                    f._uploadFailed = true;
                });
                showToast("部分文件上传失败，点击重试");
            }
            uploadSuccess = true;
            if (hasVideo) {
                document.querySelectorAll("#createImageGrid .create-media-item .progress-ring").forEach(el => {
                    el.style.background = `conic-gradient(#fff 0% 100%, rgba(255,255,255,0.2) 100%)`;
                });
            }
        }
    } catch (e) {
        if (processingTimer) clearInterval(processingTimer);
        showToast(hasVideo ? "视频上传失败，点击重试" : "文件上传失败，点击重试");
        processedFiles.forEach(f => {
            f._uploadFailed = true;
        });
    }
    try {
        localStorage.removeItem("uploadProgress");
    } catch (e) {}
    if (hasVideo && uploadSuccess) {
        await new Promise(r => setTimeout(r, 400));
    }
    isFileUploading = false;
    updateCreateImageGrid();
}

async function retryUploadFile(index) {
    const file = selectedCreateImages[index];
    if (!file || !file._uploadFailed || isFileUploading) return;
    file._uploadFailed = false;
    isFileUploading = true;
    updateCreateImageGridWithUploading([ file ]);
    const isVideo = file._isVideo || [ "mp4", "mov", "avi", "mkv" ].includes(file.name?.split(".").pop()?.toLowerCase());
    const fd = new FormData;
    fd.append("images", file);
    let processingTimer = null;
    let uploadFinished = false;
    let lastPaint = 0;
    const uploadTimeoutMs = isVideo ? 6e5 : 12e4;
    try {
        const res = await apiForm("/uploadImage", fd, (loaded, total) => {
            const uploadPct = loaded / total;
            if (isVideo) {
                const pct = Math.min(Math.round(uploadPct * 60), 59);
                const now = Date.now();
                if (now - lastPaint < 120) return;
                lastPaint = now;
                document.querySelectorAll("#createImageGrid .create-media-item .progress-ring").forEach(el => {
                    el.style.background = `conic-gradient(#fff 0% ${pct}%, rgba(255,255,255,0.2) ${pct}%)`;
                });
                if (uploadPct >= .99 && !uploadFinished) {
                    uploadFinished = true;
                    const statusEl = document.getElementById("upload-status-text");
                    if (statusEl) statusEl.textContent = "处理中...";
                    let processingPct = 60;
                    processingTimer = setInterval(() => {
                        const decay = (99 - processingPct) * .04;
                        processingPct = Math.min(99, processingPct + (decay < .1 ? .1 : decay));
                        document.querySelectorAll("#createImageGrid .create-media-item .progress-ring").forEach(el => {
                            el.style.background = `conic-gradient(#fff 0% ${processingPct}%, rgba(255,255,255,0.2) ${processingPct}%)`;
                        });
                    }, 500);
                }
            } else {
                const pct = Math.round(uploadPct * 100);
                const now = Date.now();
                if (now - lastPaint < 120) return;
                lastPaint = now;
                document.querySelectorAll("#createImageGrid .create-media-item .progress-ring").forEach(el => {
                    el.style.background = `conic-gradient(#fff 0% ${pct}%, rgba(255,255,255,0.2) ${pct}%)`;
                });
            }
        }, uploadTimeoutMs);
        if (processingTimer) clearInterval(processingTimer);
        if (res.code !== 1 || !res.data || !res.data.urls || !res.data.urls[0]) {
            showToast(res.msg || "重试失败，点击重试");
            file._uploadFailed = true;
        } else {
            file._uploadedUrl = res.data.urls[0];
            if (isVideo) {
                document.querySelectorAll("#createImageGrid .create-media-item .progress-ring").forEach(el => {
                    el.style.background = `conic-gradient(#fff 0% 100%, rgba(255,255,255,0.2) 100%)`;
                });
            }
            if (isVideo) await new Promise(r => setTimeout(r, 400));
        }
    } catch (e) {
        if (processingTimer) clearInterval(processingTimer);
        showToast("重试失败，点击重试");
        file._uploadFailed = true;
    }
    isFileUploading = false;
    updateCreateImageGrid();
}

function updateCreateImageGridWithUploading(files) {
    const grid = document.getElementById("createImageGrid");
    if (!grid) return;
    let html = "";
    selectedCreateImages.forEach((f, i) => {
        const isUploading = files && files.includes(f);
        const isVideo = f._isVideo || [ "mp4", "mov", "avi", "mkv" ].includes(f.name?.split(".").pop()?.toLowerCase());
        const thumbUrl = isVideo ? f._thumbnailUrl || "" : f._previewUrl || "";
        html += `<div class="create-media-item" style="position:relative;">\n          ${isVideo && thumbUrl ? `<img src="${thumbUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">` : thumbUrl ? `<img src="${thumbUrl}">` : `<div style="width:100%;height:100%;background:#f0f0f0;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-film" style="font-size:24px;color:#999;"></i></div>`}\n          ${isVideo && !isUploading ? `<div id="createPlayBtn_${i}" onclick="event.stopPropagation();playCreateVideo(${i})" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:36px;height:36px;background:rgba(0,0,0,0.5);border-radius:50%;display:flex;align-items:center;justify-content:center;z-index:2;cursor:pointer;"><i class="fa-solid fa-play" style="color:#fff;font-size:14px;margin-left:2px;"></i></div>` : ""}\n          <div class="del" onclick="event.stopPropagation();delCreateImage(${i})"><i class="fa-solid fa-xmark"></i></div>\n          ${isUploading ? `<div class="upload-overlay"><div class="progress-ring"></div><div id="upload-status-text" style="position:absolute;bottom:-22px;left:50%;transform:translateX(-50%);font-size:11px;color:#fff;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,0.5);">上传中...</div></div>` : ""}\n        </div>`;
    });
    if (selectedCreateImages.length < 9) {
        html += `<div class="create-media-item" onclick="document.getElementById('createImgInput').click()"><i class="fa-solid fa-plus"></i></div>`;
        html += `<div class="create-media-item" onclick="document.getElementById('createVideoInput').click()" title="上传视频"><i class="fa-solid fa-video"></i></div>`;
    }
    grid.innerHTML = html;
}

function playCreateVideo(idx) {
    const file = selectedCreateImages[idx];
    if (!file) return;
    const isVideo = file._isVideo || [ "mp4", "mov", "avi", "mkv" ].includes(file.name?.split(".").pop()?.toLowerCase());
    if (!isVideo) return;
    if (playerVideoBlobUrl) {
        try {
            URL.revokeObjectURL(playerVideoBlobUrl);
        } catch (e) {}
        playerVideoBlobUrl = null;
    }
    const videoUrl = file._uploadedUrl || URL.createObjectURL(file);
    if (!file._uploadedUrl) playerVideoBlobUrl = videoUrl;
    const thumbUrl = file._thumbnailUrl || "";
    openVideoPlayer(videoUrl, thumbUrl);
}

function updateCreateImageGrid() {
    const grid = document.getElementById("createImageGrid");
    if (!grid) return;
    let html = "";
    selectedCreateImages.forEach((f, i) => {
        const isVideo = f._isVideo || [ "mp4", "mov", "avi", "mkv" ].includes(f.name?.split(".").pop()?.toLowerCase());
        const thumbUrl = isVideo ? f._thumbnailUrl || "" : f._previewUrl || "";
        if (f._uploadFailed) {
            html += `<div class="create-media-item" style="position:relative;">\n            ${isVideo && thumbUrl ? `<img src="${thumbUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;opacity:0.4;">` : thumbUrl ? `<img src="${thumbUrl}" style="opacity:0.4;">` : `<div style="width:100%;height:100%;background:#f0f0f0;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-film" style="font-size:24px;color:#999;"></i></div>`}\n            <div onclick="event.stopPropagation();retryUploadFile(${i})" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:4px;z-index:2;cursor:pointer;">\n              <div style="width:36px;height:36px;background:rgba(0,0,0,0.6);border-radius:50%;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-rotate-right" style="color:#fff;font-size:16px;"></i></div>\n              <span style="color:#fff;font-size:10px;text-shadow:0 1px 2px rgba(0,0,0,0.5);">重试</span>\n            </div>\n            <div class="del" onclick="event.stopPropagation();delCreateImage(${i})"><i class="fa-solid fa-xmark"></i></div>\n          </div>`;
        } else {
            html += `<div class="create-media-item" style="position:relative;">\n            ${isVideo && thumbUrl ? `<img src="${thumbUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">` : thumbUrl ? `<img src="${thumbUrl}">` : `<div style="width:100%;height:100%;background:#f0f0f0;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-film" style="font-size:24px;color:#999;"></i></div>`}\n            ${isVideo ? `<div id="createPlayBtn_${i}" onclick="event.stopPropagation();playCreateVideo(${i})" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:36px;height:36px;background:rgba(0,0,0,0.5);border-radius:50%;display:flex;align-items:center;justify-content:center;z-index:2;cursor:pointer;"><i class="fa-solid fa-play" style="color:#fff;font-size:14px;margin-left:2px;"></i></div>` : ""}\n            <div class="del" onclick="event.stopPropagation();delCreateImage(${i})"><i class="fa-solid fa-xmark"></i></div>\n          </div>`;
        }
    });
    if (selectedCreateImages.length < 9) {
        html += `<div class="create-media-item" onclick="document.getElementById('createImgInput').click()"><i class="fa-solid fa-plus"></i></div>`;
        html += `<div class="create-media-item" onclick="document.getElementById('createVideoInput').click()" title="上传视频"><i class="fa-solid fa-video"></i></div>`;
    }
    grid.innerHTML = html;
}

function delCreateImage(i) {
    const f = selectedCreateImages[i];
    if (f) {
        if (f._previewUrl) {
            try {
                URL.revokeObjectURL(f._previewUrl);
            } catch (e) {}
            f._previewUrl = null;
        }
        if (f._thumbnailUrl) {
            try {
                URL.revokeObjectURL(f._thumbnailUrl);
            } catch (e) {}
            f._thumbnailUrl = null;
        }
        if (f._playerBlobUrl) {
            try {
                URL.revokeObjectURL(f._playerBlobUrl);
            } catch (e) {}
            f._playerBlobUrl = null;
        }
    }
    selectedCreateImages.splice(i, 1);
    updateCreateImageGrid();
}

function openAdvancedModal() {
    document.getElementById("advancedModal").classList.add("active");
}

function closeAdvancedModal() {
    document.getElementById("advancedModal").classList.remove("active");
}

function toggleDeclarationOptions() {
    const checked = document.getElementById("declarationSwitch").checked;
    document.getElementById("declarationOptions").style.display = checked ? "block" : "none";
    if (!checked) createDeclaration = "";
}

function selectDeclaration(type) {
    createDeclaration = type;
    document.querySelectorAll("#declarationOptions .radio-item").forEach(el => {
        const icon = el.querySelector(".radio-icon");
        if (el.querySelector("span").textContent === type) icon.innerHTML = '<i class="fa-solid fa-circle-check" style="color:var(--color-primary);"></i>'; else icon.innerHTML = '<i class="fa-regular fa-circle"></i>';
    });
    closeAdvancedModal();
    showToast("已选择：" + type);
}

function openVisibilityModal() {
    document.getElementById("visibilityModal").classList.add("active");
}

function closeVisibilityModal() {
    document.getElementById("visibilityModal").classList.remove("active");
}

function selectVisibility(type) {
    createVisibility = type;
    const textMap = {
        public: "公开可见",
        friends: "仅互关好友可见",
        private: "仅自己可见"
    };
    const textEl = document.getElementById("createVisibilityText");
    if (textEl) textEl.textContent = textMap[type];
    const settingItem = textEl ? textEl.closest(".create-setting-item") : null;
    if (settingItem) {
        const icon = settingItem.querySelector("i");
        if (icon) icon.className = type === "public" ? "fa-solid fa-lock-open" : "fa-solid fa-lock";
    }
    document.querySelectorAll("#visibilityModal .radio-item").forEach(el => {
        const isActive = el.getAttribute("data-vis") === type;
        el.classList.toggle("active", isActive);
        const icon = el.querySelector(".radio-icon");
        if (icon) icon.innerHTML = isActive ? '<i class="fa-solid fa-circle-check"></i>' : '<i class="fa-regular fa-circle"></i>';
    });
    closeVisibilityModal();
}

function openPollModal() {
    if (createPollData.options.length === 0) {
        createPollData = {
            options: [ "", "" ],
            votes: {}
        };
    }
    renderPollOptions();
    document.getElementById("pollModal").classList.add("active");
}

function closePollModal() {
    document.getElementById("pollModal").classList.remove("active");
    const cleanOpts = createPollData.options.filter(o => o.trim());
    if (cleanOpts.length === 0) {
        createPollData = {
            options: [],
            votes: {}
        };
    }
    const wrap = document.getElementById("pollPreviewWrap");
    if (wrap) {
        wrap.innerHTML = buildPollPreviewHtml();
    }
}

function renderPollOptions() {
    const container = document.getElementById("pollOptionsList");
    container.innerHTML = createPollData.options.map((opt, i) => `\n        <div class="poll-option-row">\n          <input value="${opt}" placeholder="选项 ${i + 1}" oninput="updatePollOption(${i}, this.value)">\n          <div class="del" onclick="removePollOption(${i})"><i class="fa-solid fa-trash-can"></i></div>\n        </div>\n      `).join("");
}

function addPollOption() {
    createPollData.options.push("");
    renderPollOptions();
}

function removePollOption(index) {
    createPollData.options.splice(index, 1);
    if (createPollData.options.length === 0) createPollData.options = [ "", "" ];
    renderPollOptions();
}

function updatePollOption(index, val) {
    createPollData.options[index] = val;
}

function openUserSelectModal(type) {
    tempUserSelectType = type;
    document.getElementById("userSelectTitle").textContent = type === "visible" ? "只给谁看" : "不给谁看";
    document.getElementById("userSelectSearch").value = "";
    document.getElementById("userSelectModal").classList.add("active");
    searchUserSelect();
}

function closeUserSelectModal() {
    document.getElementById("userSelectModal").classList.remove("active");
}

async function searchUserSelect() {
    const keyword = document.getElementById("userSelectSearch").value.trim();
    const list = document.getElementById("userSelectList");
    list.innerHTML = '<div style="text-align:center;padding:20px;color:#999;">加载中...</div>';
    const res = await api("/searchUser?keyword=" + encodeURIComponent(keyword));
    if (res.code === 1) {
        const targetList = tempUserSelectType === "visible" ? createVisibleUsers : createBlockedUsers;
        list.innerHTML = res.data.map(u => `\n          <div class="user-select-item" onclick="toggleUserSelect('${u.uid}')">\n            <img src="${resolveMediaUrl(u.avatar) || DEFAULT_AVATAR}" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">\n            <div class="info">${u.nickname}</div>\n            <div class="check ${targetList.includes(u.uid) ? "checked" : ""}"><i class="${targetList.includes(u.uid) ? "fa-solid fa-circle-check" : "fa-regular fa-circle"}"></i></div>\n          </div>\n        `).join("");
    } else {
        list.innerHTML = '<div style="text-align:center;padding:20px;color:#999;">加载失败</div>';
    }
}

function toggleUserSelect(uid) {
    if (tempUserSelectType === "visible") {
        const idx = createVisibleUsers.indexOf(uid);
        if (idx > -1) createVisibleUsers.splice(idx, 1); else createVisibleUsers.push(uid);
    } else {
        const idx = createBlockedUsers.indexOf(uid);
        if (idx > -1) createBlockedUsers.splice(idx, 1); else createBlockedUsers.push(uid);
    }
    searchUserSelect();
}

function openAtUserModal() {
    const atM = document.getElementById("atUserModal");
    if (atM) atM.style.display = "block";
    if (window._adjustTopicBarsKeyboard) {
        window._adjustTopicBarsKeyboard();
    } else if (atM) {
        const kb = Math.max(0, window.innerHeight - (window.visualViewport ? window.visualViewport.height : window.innerHeight));
        atM.style.bottom = kb + "px";
    }
    document.getElementById("atUserSearchInput").value = "";
    document.getElementById("atUserList").innerHTML = '<div style="text-align:center;padding:20px;color:#999;">输入昵称搜索用户...</div>';
    document.getElementById("atUserModal").classList.add("show");
    setTimeout(() => {
        const input = document.getElementById("atUserSearchInput");
        if (input) {
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
        }
    }, 100);
}

function closeAtUserModal() {
    const atM = document.getElementById("atUserModal");
    if (atM) atM.classList.remove("show");
    setTimeout(function() {
        if (atM && !atM.classList.contains("show")) atM.style.display = "none";
    }, 300);
}

function searchAtUsers() {
    const keyword = document.getElementById("atUserSearchInput").value.trim();
    const list = document.getElementById("atUserList");
    if (!keyword) {
        list.innerHTML = '<div style="text-align:center;padding:20px;color:#999;">输入昵称搜索用户...</div>';
        if (atSearchTimer) {
            clearTimeout(atSearchTimer);
            atSearchTimer = null;
        }
        return;
    }
    if (atSearchCache[keyword]) {
        renderAtUserList(atSearchCache[keyword]);
        return;
    }
    if (atSearchTimer) clearTimeout(atSearchTimer);
    atSearchTimer = setTimeout(async () => {
        list.innerHTML = '<div style="text-align:center;padding:20px;color:#999;">搜索中...</div>';
        try {
            const res = await api("/searchUser?keyword=" + encodeURIComponent(keyword));
            if (res.code === 1) {
                atSearchCache[keyword] = res.data;
                renderAtUserList(res.data);
            } else {
                list.innerHTML = '<div style="text-align:center;padding:20px;color:#999;">加载失败</div>';
            }
        } catch (e) {
            list.innerHTML = '<div style="text-align:center;padding:20px;color:#999;">加载失败</div>';
        }
        atSearchTimer = null;
    }, 300);
}

function renderAtUserList(users) {
    const list = document.getElementById("atUserList");
    if (!list) return;
    list.innerHTML = users.map(u => `\n        <div class="user-select-item" onclick="insertAtUser('${u.nickname}', '${u.uid}')">\n          <img src="${resolveMediaUrl(u.avatar) || DEFAULT_AVATAR}" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">\n          <div class="info">${u.nickname}</div>\n        </div>\n      `).join("") || '<div style="text-align:center;padding:20px;color:#999;">未找到相关用户</div>';
}

async function submitCreatePost() {
    if (isPublishing) return;
    try {
        if (!getToken()) {
            showLoginModal();
            return;
        }
        if (isFileUploading) {
            showToast("文件正在上传中，请稍候再试");
            return;
        }
        const hasFailedUpload = selectedCreateImages.some(f => f._uploadFailed);
        if (hasFailedUpload) {
            showToast("有文件上传失败，请点击重试或删除");
            return;
        }
        const title = document.getElementById("createTitle").value.trim();
        const rawContent = document.getElementById("createBody").value.trim();
        const content = rawContent.replace(/＃/g, "#").replace(/＠/g, "@");
        if (!content && selectedCreateImages.length === 0 && createPollData.options.filter(o => o.trim()).length === 0) {
            showToast("请输入内容或添加图片");
            return;
        }
        isPublishing = true;
        const btn = document.querySelector(".create-nav .btn-publish");
        if (btn) {
            btn.textContent = "发布中...";
            btn.classList.add("disabled");
        }
        let imageUrls = [];
        let videoUrls = [];
        let videoCoverUrl = "";
        if (selectedCreateImages.length > 0) {
            selectedCreateImages.forEach(f => {
                const isVideo = f._isVideo || [ "mp4", "mov", "avi", "mkv" ].includes(f.name?.split(".").pop()?.toLowerCase());
                if (isVideo && f._uploadedUrl) {
                    videoUrls.push(f._uploadedUrl);
                    if (f._uploadedCover && !videoCoverUrl) videoCoverUrl = f._uploadedCover;
                } else if (f._uploadedUrl) imageUrls.push(f._uploadedUrl);
            });
        }
        let topic = "";
        const m = content.match(/#([^#]+)#/);
        if (m) topic = m[1];
        const topics = extractTopics(content);
        const pollDataStr = createPollData.options.filter(o => o.trim()).length > 0 ? JSON.stringify(createPollData) : "";
        const scheduleTimePicker = document.getElementById("scheduleTimePicker");
        let scheduled_time = null;
        if (scheduleTimePicker && scheduleTimePicker.value) {
            scheduled_time = scheduleTimePicker.value;
        }
        const res = await api("/createPost", "POST", {
            title: title,
            content: content,
            images: imageUrls.join(","),
            video: videoUrls.join(","),
            video_cover: videoCoverUrl,
            location: createLocation,
            poll_data: pollDataStr,
            category: "all",
            visibility: createVisibility,
            original_declaration: createDeclaration,
            allow_download: document.getElementById("createAllowDownload").checked ? 1 : 0,
            scheduled_time: scheduled_time,
            topic: topic,
            topics: topics
        });
        if (res && res.code === 1) {
            showToast(res.msg || "发布成功");
            createPollData = {
                options: [],
                votes: {}
            };
            createVisibleUsers = [];
            createBlockedUsers = [];
            selectedCreateImages.forEach(f => {
                if (f._previewUrl) {
                    try {
                        URL.revokeObjectURL(f._previewUrl);
                    } catch (e) {}
                }
                if (f._thumbnailUrl) {
                    try {
                        URL.revokeObjectURL(f._thumbnailUrl);
                    } catch (e) {}
                }
                if (f._playerBlobUrl) {
                    try {
                        URL.revokeObjectURL(f._playerBlobUrl);
                    } catch (e) {}
                }
            });
            selectedCreateImages = [];
            try {
                document.getElementById("createBody").value = "";
                document.getElementById("createTitle").value = "";
            } catch (e) {}
            resetPublishBtn();
            const allTab = document.querySelector('.cat-item[data-cat="all"]');
            if (allTab) {
                document.querySelectorAll(".cat-item").forEach(i => i.classList.remove("active"));
                allTab.classList.add("active");
            }
            goPage("home");
            loadPosts(true);
        } else {
            handleActionError(res, "发布失败");
            resetPublishBtn();
        }
    } catch (e) {
        console.error("发布流程彻底崩溃：", e);
        showToast("系统错误: " + (e.message || "未知异常，请检查控制台"));
        resetPublishBtn();
    }
}

function resetPublishBtn() {
    isPublishing = false;
    const btn = document.querySelector(".create-nav .btn-publish");
    if (btn) {
        btn.textContent = "发布";
        btn.classList.remove("disabled");
    }
}

function showPostActionSheet(postId) {
    const existing = document.getElementById("postActionOverlay");
    if (existing) existing.remove();
    const overlay = document.createElement("div");
    overlay.id = "postActionOverlay";
    overlay.className = "modal-overlay active";
    overlay.onclick = e => {
        if (e.target === overlay) overlay.remove();
    };
    overlay.innerHTML = `<div class="modal-content" style="max-height:50vh;">\n        <div class="modal-handler"></div>\n        <div style="font-weight:600;font-size:16px;margin-bottom:12px;">帖子推广</div>\n        <div class="modal-item" onclick="document.getElementById('postActionOverlay').remove();goPage('buyExposure',null,'${postId}')">\n          <span class="label"><i class="fa-solid fa-bullhorn" style="color:var(--color-primary);"></i> 获取曝光</span>\n          <div class="right"><span style="font-size:13px;color:#999;">提升推送优先级</span> <i class="fa-solid fa-chevron-right"></i></div>\n        </div>\n        <div class="modal-item" onclick="document.getElementById('postActionOverlay').remove();goPage('buyPin',null,'${postId}')">\n          <span class="label"><i class="fa-solid fa-thumbtack" style="color:#f59e0b;"></i> 置顶推广</span>\n          <div class="right"><span style="font-size:13px;color:#999;">¥5起</span> <i class="fa-solid fa-chevron-right"></i></div>\n        </div>\n      </div>`;
    document.body.appendChild(overlay);
}

function showPostManageMenu(postId) {
    const existing = document.getElementById("postManageOverlay");
    if (existing) existing.remove();
    const p = currentPostDetail;
    const visText = p.visibility === "private" ? "仅自己可见" : p.visibility === "friends" ? "仅互关好友可见" : "公开可见";
    const overlay = document.createElement("div");
    overlay.id = "postManageOverlay";
    overlay.className = "modal-overlay active";
    overlay.onclick = e => {
        if (e.target === overlay) overlay.remove();
    };
    overlay.innerHTML = `<div class="modal-content" style="max-height:60vh;">\n        <div class="modal-handler"></div>\n        <div style="font-weight:600;font-size:16px;margin-bottom:12px;">管理帖子</div>\n        <div class="modal-item" onclick="document.getElementById('postManageOverlay').remove();openEditPostModal('${postId}')">\n          <span class="label"><i class="fa-solid fa-pen-to-square" style="color:#333;"></i> 编辑帖子</span>\n          <div class="right"><i class="fa-solid fa-chevron-right"></i></div>\n        </div>\n        <div class="modal-item" onclick="setPostVisibility('${postId}','public')">\n          <span class="label"><i class="fa-solid fa-lock-open" style="color:#333;"></i> 公开可见</span>\n          <div class="right">${p.visibility === "public" ? '<i class="fa-solid fa-check" style="color:var(--color-primary);"></i>' : ""}</div>\n        </div>\n        <div class="modal-item" onclick="setPostVisibility('${postId}','friends')">\n          <span class="label"><i class="fa-solid fa-user-group" style="color:#333;"></i> 仅互关好友可见</span>\n          <div class="right">${p.visibility === "friends" ? '<i class="fa-solid fa-check" style="color:var(--color-primary);"></i>' : ""}</div>\n        </div>\n        <div class="modal-item" onclick="setPostVisibility('${postId}','private')">\n          <span class="label"><i class="fa-solid fa-lock" style="color:#333;"></i> 仅自己可见（私密）</span>\n          <div class="right">${p.visibility === "private" ? '<i class="fa-solid fa-check" style="color:var(--color-primary);"></i>' : ""}</div>\n        </div>\n        <div class="modal-item" onclick="document.getElementById('postManageOverlay').remove();openPostVisibleUsers('${postId}')">\n          <span class="label"><i class="fa-regular fa-user"></i> 仅谁可见</span>\n          <div class="right"><span style="font-size:13px;color:#999;">${p.visible_users ? p.visible_users.split(",").filter(x => x).length + "人" : "未设置"}</span> <i class="fa-solid fa-chevron-right"></i></div>\n        </div>\n        <div class="modal-item" onclick="document.getElementById('postManageOverlay').remove();openPostBlockedUsers('${postId}')">\n          <span class="label"><i class="fa-solid fa-eye-slash"></i> 不给谁看</span>\n          <div class="right"><span style="font-size:13px;color:#999;">${p.blocked_users ? p.blocked_users.split(",").filter(x => x).length + "人" : "未设置"}</span> <i class="fa-solid fa-chevron-right"></i></div>\n        </div>\n        <div style="height:8px;background:#f5f5f5;"></div>\n        <div class="modal-item" onclick="document.getElementById('postManageOverlay').remove();goPage('buyExposure',null,'${postId}')">\n          <span class="label"><i class="fa-solid fa-bullhorn" style="color:var(--color-primary);"></i> 获取曝光</span>\n          <div class="right"><span style="font-size:13px;color:#999;">提升推送优先级</span> <i class="fa-solid fa-chevron-right"></i></div>\n        </div>\n        <div class="modal-item" onclick="document.getElementById('postManageOverlay').remove();goPage('buyPin',null,'${postId}')">\n          <span class="label"><i class="fa-solid fa-thumbtack" style="color:#f59e0b;"></i> 置顶推广</span>\n          <div class="right"><span style="font-size:13px;color:#999;">¥5起</span> <i class="fa-solid fa-chevron-right"></i></div>\n        </div>\n        <div class="modal-item" onclick="togglePostProtection('${postId}', ${p.watermark_protected == 1 ? "false" : "true"})">\n          <span class="label"><i class="fa-solid fa-lock" style="color:#1D9BF0;"></i> 帖子保护</span>\n          <div class="right">${p.watermark_protected == 1 ? '<i class="fa-solid fa-check" style="color:var(--color-primary);"></i>' : '<span style="font-size:13px;color:#999;">未开启</span>'} <i class="fa-solid fa-chevron-right"></i></div>\n        </div>\n        <div class="modal-item" style="border-bottom:none;color:var(--color-red);" onclick="confirmDeletePost('${postId}')">\n          <span class="label"><i class="fa-solid fa-trash-can"></i> 删除帖子</span>\n        </div>\n      </div>`;
    document.body.appendChild(overlay);
}

async function setPostVisibility(postId, visibility) {
    try {
        const res = await api("/updatePost", "POST", {
            postId: postId,
            visibility: visibility
        });
        if (res.code === 1) {
            showToast("已设置为" + (visibility === "public" ? "公开可见" : visibility === "friends" ? "仅互关好友可见" : "仅自己可见"));
            document.getElementById("postManageOverlay")?.remove();
            if (currentPostDetail) {
                currentPostDetail.visibility = visibility;
                render();
            }
        } else {
            showToast(res.msg || "修改失败");
        }
    } catch (e) {
        showToast("修改失败");
    }
}

async function togglePostProtection(postId, enable) {
    if (enable) {
        const canUse = myVerificationTypes.includes("advanced") || myVerificationTypes.includes("premium") || myVerificationTypes.includes("enterprise");
        if (!canUse) {
            showToast("该功能为进阶/高级认证功能，请先订阅认证");
            setTimeout(function() {
                document.getElementById("postManageOverlay")?.remove();
                goPage("verifSubscribe");
            }, 800);
            return;
        }
    }
    try {
        const res = await api("/updatePost", "POST", {
            postId: postId,
            watermark_protected: enable ? 1 : 0
        });
        if (res.code === 1) {
            showToast(enable ? "帖子保护已开启" : "帖子保护已关闭");
            document.getElementById("postManageOverlay")?.remove();
            if (currentPostDetail) {
                currentPostDetail.watermark_protected = enable ? 1 : 0;
                render();
            }
        } else {
            showToast(res.msg || "操作失败");
        }
    } catch (e) {
        showToast("操作失败");
    }
}

window.togglePostProtection = togglePostProtection;

function openEditPostModal(postId) {
    const p = currentPostDetail;
    if (!p) return;
    const overlay = document.createElement("div");
    overlay.id = "editPostOverlay";
    overlay.className = "modal-overlay active";
    overlay.onclick = e => {
        if (e.target === overlay) overlay.remove();
    };
    overlay.innerHTML = `<div class="modal-content" style="max-height:85vh;">\n        <div class="modal-handler"></div>\n        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">\n          <div style="font-weight:600;font-size:16px;">编辑帖子</div>\n          <div style="font-size:14px;color:var(--color-primary);cursor:pointer;font-weight:500;" onclick="saveEditPost('${postId}')">保存</div>\n        </div>\n        <div style="margin-bottom:12px;">\n          <div style="font-size:14px;color:#666;margin-bottom:8px;">标题</div>\n          <input id="editPostTitle" type="text" value="${escapeHtml(p.title || "")}" placeholder="标题（可选）" style="width:100%;padding:12px;border:1px solid #eee;border-radius:8px;font-size:15px;box-sizing:border-box;">\n        </div>\n        <div style="margin-bottom:12px;">\n          <div style="font-size:14px;color:#666;margin-bottom:8px;">内容</div>\n          <textarea id="editPostContent" placeholder="分享你的想法..." style="width:100%;min-height:150px;padding:12px;border:1px solid #eee;border-radius:8px;font-size:15px;box-sizing:border-box;resize:vertical;font-family:inherit;line-height:1.5;">${escapeHtml(p.content || "")}</textarea>\n          <div style="text-align:right;font-size:12px;color:#999;margin-top:4px;"><span id="editPostCharCount">${(p.content || "").length}</span>/500</div>\n        </div>\n      </div>`;
    document.body.appendChild(overlay);
    const ta = document.getElementById("editPostContent");
    if (ta) {
        ta.addEventListener("input", () => {
            const len = ta.value.length;
            const cnt = document.getElementById("editPostCharCount");
            if (cnt) cnt.textContent = len;
        });
    }
}

async function saveEditPost(postId) {
    const title = document.getElementById("editPostTitle")?.value.trim() || "";
    const content = document.getElementById("editPostContent")?.value.trim() || "";
    if (!content) {
        showToast("内容不能为空");
        return;
    }
    if (content.length > 500) {
        showToast("内容不能超过500字");
        return;
    }
    try {
        const res = await api("/updatePost", "POST", {
            postId: postId,
            title: title,
            content: content
        });
        if (res.code === 1) {
            showToast("保存成功");
            document.getElementById("editPostOverlay")?.remove();
            if (currentPostDetail) {
                currentPostDetail.title = title;
                currentPostDetail.content = content;
                render();
            }
        } else {
            showToast(res.msg || "保存失败");
        }
    } catch (e) {
        showToast("保存失败");
    }
}

let tempPostUserType = "visible";

let tempPostVisibleUsers = [];

let tempPostBlockedUsers = [];

let tempPostId = "";

function openPostVisibleUsers(postId) {
    tempPostUserType = "visible";
    tempPostId = postId;
    tempPostVisibleUsers = currentPostDetail.visible_users ? currentPostDetail.visible_users.split(",").filter(x => x) : [];
    showPostUserSelectModal();
}

function openPostBlockedUsers(postId) {
    tempPostUserType = "blocked";
    tempPostId = postId;
    tempPostBlockedUsers = currentPostDetail.blocked_users ? currentPostDetail.blocked_users.split(",").filter(x => x) : [];
    showPostUserSelectModal();
}

function showPostUserSelectModal() {
    const existing = document.getElementById("postUserSelectOverlay");
    if (existing) existing.remove();
    const title = tempPostUserType === "visible" ? "仅谁可见" : "不给谁看";
    const overlay = document.createElement("div");
    overlay.id = "postUserSelectOverlay";
    overlay.className = "modal-overlay active";
    overlay.onclick = e => {
        if (e.target === overlay) overlay.remove();
    };
    overlay.innerHTML = `<div class="modal-content" style="max-height:70vh;">\n        <div class="modal-handler"></div>\n        <div style="font-weight:600;font-size:16px;margin-bottom:12px;">${title}</div>\n        <div style="position:relative;margin-bottom:12px;">\n          <input id="postUserSearchInput" style="width:100%;background:#f5f5f5;border:none;border-radius:8px;padding:12px;font-size:14px;" placeholder="搜索用户..." oninput="searchPostUserSelect()">\n        </div>\n        <div id="postUserSelectList" style="max-height:300px;overflow-y:auto;"></div>\n        <button onclick="savePostUserSelect()" style="width:100%;height:48px;background:var(--color-primary);color:#fff;border-radius:12px;font-weight:600;margin-top:12px;">确认</button>\n      </div>`;
    document.body.appendChild(overlay);
    searchPostUserSelect();
}

async function searchPostUserSelect() {
    const keyword = document.getElementById("postUserSearchInput").value.trim();
    const list = document.getElementById("postUserSelectList");
    list.innerHTML = '<div style="text-align:center;padding:20px;color:#999;">加载中...</div>';
    const res = await api("/searchUser?keyword=" + encodeURIComponent(keyword));
    if (res.code === 1) {
        const targetList = tempPostUserType === "visible" ? tempPostVisibleUsers : tempPostBlockedUsers;
        list.innerHTML = res.data.map(u => `\n          <div class="user-select-item" onclick="togglePostUserSelect('${u.uid}')">\n            <img src="${resolveMediaUrl(u.avatar) || DEFAULT_AVATAR}" style="width:36px;height:36px;border-radius:50%;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">\n            <div class="info">${u.nickname}</div>\n            <div class="check ${targetList.includes(u.uid) ? "checked" : ""}"><i class="${targetList.includes(u.uid) ? "fa-solid fa-circle-check" : "fa-regular fa-circle"}"></i></div>\n          </div>\n        `).join("") || '<div style="text-align:center;padding:20px;color:#999;">未找到用户</div>';
    } else {
        list.innerHTML = '<div style="text-align:center;padding:20px;color:#999;">加载失败</div>';
    }
}

function togglePostUserSelect(uid) {
    if (tempPostUserType === "visible") {
        const idx = tempPostVisibleUsers.indexOf(uid);
        if (idx > -1) tempPostVisibleUsers.splice(idx, 1); else tempPostVisibleUsers.push(uid);
    } else {
        const idx = tempPostBlockedUsers.indexOf(uid);
        if (idx > -1) tempPostBlockedUsers.splice(idx, 1); else tempPostBlockedUsers.push(uid);
    }
    searchPostUserSelect();
}

async function savePostUserSelect() {
    const users = tempPostUserType === "visible" ? tempPostVisibleUsers : tempPostBlockedUsers;
    const field = tempPostUserType === "visible" ? "visible_users" : "blocked_users";
    try {
        const res = await api("/updatePost", "POST", {
            postId: tempPostId,
            [field]: users.join(",")
        });
        if (res.code === 1) {
            showToast("已保存");
            document.getElementById("postUserSelectOverlay")?.remove();
            if (currentPostDetail) {
                currentPostDetail[field] = users.join(",");
            }
        } else {
            showToast(res.msg || "保存失败");
        }
    } catch (e) {
        showToast("保存失败");
    }
}

function confirmDeletePost(postId) {
    const existing = document.getElementById("confirmDeleteOverlay");
    if (existing) existing.remove();
    const overlay = document.createElement("div");
    overlay.id = "confirmDeleteOverlay";
    overlay.className = "modal-overlay active";
    overlay.onclick = e => {
        if (e.target === overlay) overlay.remove();
    };
    overlay.innerHTML = `<div class="modal-content" style="max-height:35vh;">\n        <div class="modal-handler"></div>\n        <div style="font-weight:600;font-size:16px;margin-bottom:16px;text-align:center;">确认删除这篇帖子？</div>\n        <div style="display:flex;gap:10px;">\n          <button onclick="document.getElementById('confirmDeleteOverlay').remove()" style="flex:1;height:44px;background:#f5f5f5;border-radius:12px;font-weight:500;">取消</button>\n          <button onclick="doDeletePost('${postId}')" style="flex:1;height:44px;background:var(--color-red);color:#fff;border-radius:12px;font-weight:500;">删除</button>\n        </div>\n      </div>`;
    document.body.appendChild(overlay);
}

async function doDeletePost(postId) {
    try {
        const res = await api("/deletePost", "POST", {
            postId: postId
        });
        if (res.code === 1) {
            showToast("已删除");
            document.getElementById("confirmDeleteOverlay")?.remove();
            document.getElementById("postManageOverlay")?.remove();
            goPage("home");
            loadPosts(true);
        } else {
            showToast(res.msg || "删除失败");
        }
    } catch (e) {
        showToast("删除失败");
    }
}

function imgsJsonStr(arr) {
    if (!arr || !arr.length) return "''";
    return JSON.stringify(arr).replace(/"/g, "&quot;").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

const _fullImageCache = {};

const _IMG_STYLE = "max-width:100%;max-height:100%;object-fit:contain;border-radius:4px;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;";

function _fullImageKey(item) {
    try {
        return withMediaAuth(item);
    } catch (e) {
        return String(item);
    }
}

function _fullImageThumb(item) {
    try {
        return resolveThumb(item) || "";
    } catch (e) {
        return "";
    }
}

function showFullImage(src, imgsJson, idx) {
    if (!requireLogin()) return;
    let all = [];
    if (typeof imgsJson === "string" && imgsJson) {
        try {
            const parsed = JSON.parse(imgsJson);
            if (Array.isArray(parsed) && parsed.length) all = parsed;
        } catch (e) {}
    }
    if (!all.length) all = [ src ];
    let cur = typeof idx === "number" && idx >= 0 && idx < all.length ? idx : 0;
    const multi = all.length > 1;
    const existing = document.getElementById("fullscreen-overlay");
    if (existing) existing.remove();
    const overlay = document.createElement("div");
    overlay.id = "fullscreen-overlay";
    overlay.style.cssText = `position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.95);z-index:9999;display:flex;align-items:center;justify-content:center;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;`;
    const closeBtn = document.createElement("div");
    closeBtn.className = "close-btn";
    closeBtn.innerHTML = '<i class="fa-solid fa-xmark" style="color:#fff;font-size:28px;"></i>';
    closeBtn.style.cssText = `position:absolute;top:20px;left:20px;z-index:10000;cursor:pointer;padding:10px;background:rgba(0,0,0,0.6);border-radius:50%;width:44px;height:44px;display:flex;align-items:center;justify-content:center;`;
    const holder = document.createElement("img");
    holder.id = "full-image-holder";
    holder.style.cssText = "position:absolute;max-width:100%;max-height:100%;width:100%;height:100%;object-fit:contain;opacity:0;filter:blur(22px) saturate(1.2);transform:scale(1.03);pointer-events:none;transition:opacity .25s ease;";
    const ring = document.createElement("div");
    ring.style.cssText = "position:absolute;top:50%;left:50%;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;background:conic-gradient(#fff 0% 0%,rgba(255,255,255,0.2) 0%);mask:radial-gradient(transparent 21px,#000 22px);-webkit-mask:radial-gradient(transparent 21px,#000 22px);transition:background .08s linear;z-index:10001;";
    let loadPct = 0;
    let loadTimer = null;
    let stallUntil = 0;
    function paintRing(pct) {
        ring.style.background = "conic-gradient(#fff 0% " + pct + "%,rgba(255,255,255,0.2) " + pct + "%)";
    }
    function startRing() {
        stopRing();
        loadPct = 0;
        stallUntil = 0;
        paintRing(0);
        ring.style.display = "block";
        const tick = function() {
            if (!loadTimer) return;
            const now = Date.now();
            if (now >= stallUntil) {
                const chance = loadPct < 30 ? 88 : loadPct < 55 ? 70 : loadPct < 75 ? 50 : 34;
                if (Math.random() * 100 < chance) {
                    loadPct = Math.min(88, loadPct + (loadPct < 45 ? .4 + Math.random() * 1.4 : .15 + Math.random() * .7));
                    paintRing(Math.round(loadPct));
                }
                if (Math.random() < (loadPct > 55 ? .3 : .13)) {
                    stallUntil = now + 160 + Math.random() * 820;
                }
            }
            loadTimer = setTimeout(tick, 130 + Math.random() * 180);
        };
        loadTimer = setTimeout(tick, 110);
    }
    function stopRing() {
        if (loadTimer) {
            clearTimeout(loadTimer);
            loadTimer = null;
        }
        ring.style.display = "none";
    }
    const failText = document.createElement("div");
    failText.style.cssText = `position:absolute;top:calc(50% + 70px);left:50%;transform:translateX(-50%);color:rgba(255,255,255,0.75);font-size:15px;text-align:center;line-height:1.6;`;
    let counter = null;
    if (multi) {
        counter = document.createElement("div");
        counter.style.cssText = `position:absolute;top:20px;right:20px;z-index:10000;color:#fff;font-size:15px;background:rgba(0,0,0,0.6);padding:6px 14px;border-radius:20px;`;
    }
    const prevBtn = document.createElement("div");
    prevBtn.innerHTML = '<i class="fa-solid fa-chevron-left" style="color:#fff;font-size:26px;"></i>';
    prevBtn.style.cssText = `position:absolute;left:8px;top:50%;transform:translateY(-50%);z-index:10000;cursor:pointer;padding:12px;background:rgba(0,0,0,0.5);border-radius:50%;width:46px;height:46px;display:flex;align-items:center;justify-content:center;`;
    prevBtn.onclick = function(e) {
        e.stopPropagation();
        cur = (cur - 1 + all.length) % all.length;
        showCur();
    };
    const nextBtn = document.createElement("div");
    nextBtn.innerHTML = '<i class="fa-solid fa-chevron-right" style="color:#fff;font-size:26px;"></i>';
    nextBtn.style.cssText = `position:absolute;right:8px;top:50%;transform:translateY(-50%);z-index:10000;cursor:pointer;padding:12px;background:rgba(0,0,0,0.5);border-radius:50%;width:46px;height:46px;display:flex;align-items:center;justify-content:center;`;
    nextBtn.onclick = function(e) {
        e.stopPropagation();
        cur = (cur + 1) % all.length;
        showCur();
    };
    let disp = null;
    function hideDisp() {
        if (disp) {
            disp.style.display = "none";
            disp = null;
        }
    }
    function showCur() {
        const item = all[cur];
        const key = _fullImageKey(item);
        imgPrefetch.pause();
        if (counter) counter.textContent = cur + 1 + " / " + all.length;
        prevBtn.style.display = multi ? "flex" : "none";
        nextBtn.style.display = multi ? "flex" : "none";
        hideDisp();
        failText.style.display = "none";
        const cached = _fullImageCache[key];
        if (cached && cached.naturalWidth) {
            disp = cached;
            cached.style.display = "block";
            if (cached.parentNode !== overlay) overlay.appendChild(cached);
            stopRing();
            holder.style.opacity = "0";
            imgPrefetch.resume();
            return;
        }
        const fresh = new Image;
        disp = fresh;
        fresh.style.cssText = _IMG_STYLE + "display:block;opacity:0;transition:opacity .22s ease;";
        fresh.onload = function() {
            if (disp !== fresh) return;
            _fullImageCache[key] = fresh;
            stopRing();
            fresh.style.opacity = "1";
            holder.style.opacity = "0";
            failText.style.display = "none";
            imgPrefetch.resume();
        };
        fresh.onerror = function() {
            if (disp !== fresh) return;
            disp = null;
            stopRing();
            failText.textContent = "图片加载失败\n请检查网络后重试";
            failText.style.display = "block";
            imgPrefetch.resume();
        };
        const th = _fullImageThumb(item);
        holder.onload = null;
        holder.onerror = null;
        if (th) {
            holder.onload = function() {
                holder.style.opacity = "1";
            };
            if (holder.src === th && holder.complete) {
                holder.style.opacity = "1";
            } else {
                holder.style.opacity = "0";
                holder.src = th;
            }
        } else {
            holder.style.opacity = "0";
        }
        startRing();
        fresh.src = key;
        overlay.appendChild(fresh);
    }
    let touchX = 0;
    overlay.addEventListener("touchstart", function(e) {
        touchX = e.touches[0].clientX;
    }, {
        passive: true
    });
    overlay.addEventListener("touchend", function(e) {
        if (!multi) return;
        const dx = e.changedTouches[0].clientX - touchX;
        if (Math.abs(dx) > 50) {
            if (dx < 0) {
                cur = (cur + 1) % all.length;
            } else {
                cur = (cur - 1 + all.length) % all.length;
            }
            showCur();
        }
    }, {
        passive: true
    });
    overlay.onclick = function(e) {
        if (e.target === overlay || e.target === closeBtn || closeBtn && e.target.closest && e.target.closest(".close-btn")) closeFullImage();
    };
    if (counter) overlay.appendChild(counter);
    overlay.appendChild(prevBtn);
    overlay.appendChild(nextBtn);
    overlay.appendChild(ring);
    overlay.appendChild(holder);
    overlay.appendChild(failText);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
    showCur();
}

function closeFullImage() {
    const overlay = document.getElementById("fullscreen-overlay");
    if (overlay) overlay.remove();
    imgPrefetch.resume();
}

function goPostDetailAndScroll(id) {
    if (!requireLogin()) return;
    scrollToCommentFlag = true;
    goPostDetail(id);
}

function renderPostDetail() {
    if (!currentPostDetail) return '<div style="padding:40px;text-align:center;">帖子不存在或已删除</div>';
    const p = currentPostDetail;
    const imgs = p.images ? p.images.split(",").filter(x => x) : [];
    const imgsJson = imgsJsonStr(imgs);
    const imgClass = imgs.length === 1 ? "single" : "";
    const liked = p.liked || false;
    const collected = p.collected || false;
    const contentHtml = formatContentWithTopics(p.content || "");
    let pollHtml = "";
    try {
        if (p.poll_data && typeof p.poll_data === "string") {
            const parsed = JSON.parse(p.poll_data);
            if (parsed.options && parsed.options.filter(o => o.trim()).length > 0) {
                const votes = parsed.votes || {};
                const totalVotes = Object.values(votes).reduce((a, b) => a + b, 0);
                const hasVoted = p.voted_index !== undefined && p.voted_index >= 0;
                pollHtml = `<div class="poll-area" style="background:#f9f9f9;padding:16px;border-radius:8px;margin:8px 16px;">\n              <div style="font-weight:600;margin-bottom:12px;">投票 <span style="font-size:12px;color:#999;font-weight:normal;">共 ${totalVotes} 票</span></div>\n              ${parsed.options.map((opt, idx) => {
                    const v = votes && votes[idx] || 0;
                    const pct = totalVotes > 0 ? Math.round(v / totalVotes * 100) : 0;
                    return `\n                <div onclick="votePost('${p.id}', ${idx})" style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;cursor:${hasVoted ? "default" : "pointer"};border-bottom:0.5px solid #eee;">\n                  <div style="display:flex;align-items:center;gap:10px;">\n                    <i class="fa-solid fa-circle-check" style="color:${hasVoted && p.voted_index == idx ? "var(--color-primary)" : "#ccc"};"></i>\n                    <span style="color:${hasVoted && p.voted_index == idx ? "var(--color-primary)" : "#333"}; font-weight:${hasVoted && p.voted_index == idx ? "600" : "normal"};">\n                      ${opt} ${hasVoted ? `<span style="font-size:12px;color:#999;font-weight:normal;margin-left:4px;">(${v}票, ${pct}%)</span>` : ""}\n                    </span>\n                  </div>\n                  <div style="width:60px;height:6px;background:#eee;border-radius:4px;overflow:hidden;">\n                    <div style="height:100%;width:${pct}%;background:var(--color-primary);border-radius:4px;"></div>\n                  </div>\n                </div>`;
                }).join("")}\n            </div>`;
            }
        }
    } catch (e) {
        pollHtml = "";
    }
    let html = `<div class="post-detail" style="background:#fff;min-height:100vh;">\n        <div class="detail-navbar">\n          <div class="detail-navbar-back" onclick="goBack()"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div>\n          <div class="detail-navbar-title">详情</div>\n          <div style="display:flex;align-items:center;gap:4px;">\n            ${p.is_owner === true || String(p.user_id) === getUid() || isAdminAccount() ? '<div class="detail-navbar-more" onclick="showPostManageMenu(\'' + p.id + '\')"><i class="fa-solid fa-ellipsis"></i></div>' : '<div class="detail-navbar-more" onclick="goReport(\'post\',' + p.id + ')"><i class="fa-solid fa-triangle-exclamation"></i></div>'}\n          </div>\n        </div>\n        <div class="pd-layout" style="padding-top:calc(50px + env(safe-area-inset-top));">\n          <div class="pd-main">\n          <div class="post-header">\n            <img class="avatar" src="${resolveMediaUrl(p.avatar) || DEFAULT_AVATAR}" onclick="goUserProfile('${p.user_id}')" style="cursor:pointer;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">\n            <div class="post-user">\n            <div class="post-nickname">${wrapNick(p.nickname || "用户" + p.user_id, p)}${renderListVerification(p)}</div>\n            <div class="post-time">${timeAgo(p.create_time)} · ${cleanProvince(p.province) || "未知"}</div>\n          </div>\n        </div>\n        ${p.title ? `<div style="padding:0 16px 8px;font-size:18px;font-weight:600;">${p.title}</div>` : ""}\n          ${p.content ? `<div class="post-content">${contentHtml}</div>` : ""}\n          ${p.location ? `<div style="padding:0 16px 8px;font-size:13px;color:#666;"><i class="fa-solid fa-location-dot" style="color:var(--color-primary);"></i> ${p.location}</div>` : ""}\n          ${p.original_declaration ? `<div style="padding:0 16px 8px;font-size:13px;color:#999;">声明: ${p.original_declaration}</div>` : ""}\n          ${pollHtml}\n          ${imgs.length ? `<div class="post-images ${imgClass}">${imgs.map((i, idx) => `<img loading="lazy" src="${resolveThumb(i)}" onclick="showFullImage('${i}','${imgsJson}',${idx})">`).join("")}</div>` : ""}\n          ${p.video ? `<div style="padding:0 16px 8px;">\n            <div onclick="openVideoPlayer('${p.video}', '${p.video_cover || ""}', ${p.allow_download != 0 ? "true" : "false"})" style="position:relative;cursor:pointer;width:100%;aspect-ratio:1;border-radius:8px;overflow:hidden;">\n              ${p.video_cover ? `<img loading="lazy" src="${resolveThumb(p.video_cover)}" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">` : ""}\n              <div style="display:${p.video_cover ? "none" : "flex"};position:absolute;inset:0;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);align-items:center;justify-content:center;">\n                <div style="text-align:center;">\n                  <i class="fa-solid fa-video" style="font-size:48px;color:rgba(255,255,255,0.9);"></i>\n                  <div style="color:rgba(255,255,255,0.8);font-size:14px;margin-top:8px;">点击播放视频</div>\n                </div>\n              </div>\n              <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:48px;height:48px;background:rgba(0,0,0,0.5);border-radius:50%;display:flex;align-items:center;justify-content:center;pointer-events:none;">\n                <i class="fa-solid fa-play" style="color:#fff;font-size:20px;margin-left:2px;"></i>\n              </div>\n            </div>\n          </div>` : ""}\n          <div class="post-actions" style="border-bottom:1px solid #eee;border-top:1px solid #eee;margin:0 16px;">\n            <div class="action-item" onclick="likePost('${p.id}',this)"><i class="${liked ? "fa-solid fa-heart" : "fa-regular fa-heart"}" style="color:${liked ? "var(--color-red)" : ""}"></i><span>${p.likes || 0}</span></div>\n            <div class="action-item" id="commentScrollTarget"><i class="fa-regular fa-comment"></i><span>${p.comments || 0}</span></div>\n            <div class="action-item" onclick="collectPost('${p.id}',this)"><i class="${collected ? "fa-solid fa-star" : "fa-regular fa-star"}" style="color:${collected ? "var(--color-yellow)" : ""}"></i><span>${p.collects || 0}</span></div>\n          </div>\n          </div>\n          <div class="pd-comments">\n          <div class="pd-comments-title">评论</div>\n          <div id="commentList" style="padding:16px;">\n            ${(() => {
        const _cc = cacheGet(commentListCache, p.id);
        return _cc ? _cc.html : new Array(3).fill(0).map(() => `\n              <div style="display:flex;gap:10px;margin-bottom:16px;">\n                <div class="sk-item" style="width:36px;height:36px;border-radius:50%;flex-shrink:0;"></div>\n                <div style="flex:1;">\n                  <div style="display:flex;gap:8px;margin-bottom:6px;align-items:center;">\n                    <div class="sk-item" style="width:80px;height:13px;"></div>\n                    <div class="sk-item" style="width:45px;height:10px;"></div>\n                  </div>\n                  <div class="sk-item" style="width:100%;height:12px;margin-bottom:4px;"></div>\n                  <div class="sk-item" style="width:75%;height:12px;"></div>\n                </div>\n              </div>\n            `).join("");
    })()}\n          </div>\n          </div>\n          <div style="height:60px;"></div>\n        </div>\n        <div class="comment-input-bar">\n          <img class="comment-input-avatar" src="${resolveMediaUrl(myAvatar) || DEFAULT_AVATAR}" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">\n          <input class="comment-input" id="commentInput" placeholder="说点什么...">\n          <span id="commentCharCount" class="comment-char-count"></span>\n          <div class="comment-send" id="commentSendBtn" onclick="sendComment()">发送</div>\n        </div>\n      </div>`;
    if (false && visibleWatermarkEnabled) {
        const uid = getUid();
        html += "";
    }
    return html;
}

let goBackLock = false;

function goBack() {
    if (chatTimer && currentPage === "chat") {
        clearInterval(chatTimer);
        chatTimer = null;
    }
    if (goBackLock) return;
    goBackLock = true;
    setTimeout(() => {
        goBackLock = false;
    }, 300);
    if (pageHistory.length > 0) {
        const prev = pageHistory.pop();
        currentPage = prev;
        prevPage = currentPage;
        try {
            history.pushState({
                page: currentPage,
                handled: true
            }, "", "#" + currentPage);
        } catch (e) {}
        window.scrollTo(0, 0);
        render();
        updateTabbar();
    } else {
        currentPage = "home";
        prevPage = "home";
        window.scrollTo(0, 0);
        render();
        updateTabbar();
    }
}

async function bindPostDetailEvents() {
    if (!currentPostDetail) return;
    const ci = document.getElementById("commentInput");
    if (ci) {
        ci.addEventListener("input", updateCharCount);
        ci.addEventListener("focus", ensureCommentInputVisible);
        ci.addEventListener("blur", () => {
            setTimeout(ensureCommentInputVisible, 100);
        });
    }
    await loadComments(currentPostDetail.id);
    if (scrollToCommentFlag) {
        setTimeout(() => {
            const target = document.getElementById("commentScrollTarget");
            if (target) target.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });
            scrollToCommentFlag = false;
        }, 500);
    }
}

function setReply(seq) {
    replyTargetSeq = seq;
    document.getElementById("commentInput").focus();
    document.getElementById("commentInput").placeholder = "回复中...";
}

function updateCharCount() {
    const input = document.getElementById("commentInput");
    if (!input) return;
    const count = input.value.length;
    const remaining = 150 - count;
    const el = document.getElementById("commentCharCount");
    if (!el) return;
    if (remaining <= 20) {
        el.textContent = remaining;
        el.style.color = remaining < 0 ? "var(--color-red)" : "#999";
    } else {
        el.textContent = "";
        el.style.color = "#999";
    }
}

function ensureCommentContentTruncated(el) {
    if (!el.dataset.fullHtml) el.dataset.fullHtml = el.innerHTML;
    const probe = el.cloneNode(true);
    probe.classList.remove("collapsed");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.left = "-99999px";
    probe.style.width = (el.offsetWidth || el.parentElement?.offsetWidth || 280) + "px";
    probe.style.fontSize = "14px";
    probe.style.lineHeight = "1.5";
    probe.style.margin = "2px 0";
    probe.style.wordBreak = "break-word";
    document.body.appendChild(probe);
    const rawText = probe.textContent || "";
    const needsTruncation = probe.scrollHeight > 65;
    if (needsTruncation && rawText.length >= 10) {
        const MAX_H = 63;
        let lo = 0, hi = rawText.length, best = 0;
        for (let iter = 0; iter < 20 && lo <= hi; iter++) {
            const mid = lo + hi >> 1;
            probe.textContent = rawText.slice(0, mid) + "…";
            if (probe.scrollHeight <= MAX_H) {
                best = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        if (best > 4) {
            el.classList.remove("collapsed");
            el.textContent = rawText.slice(0, best) + "…";
            el.classList.add("collapsed");
        } else {
            el.innerHTML = el.dataset.fullHtml;
        }
    }
    document.body.removeChild(probe);
}

function checkCommentOverflow(el) {
    if (!el.dataset.fullHtml) el.dataset.fullHtml = el.innerHTML;
    const probe = el.cloneNode(true);
    probe.classList.remove("collapsed");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.left = "-99999px";
    probe.style.width = (el.offsetWidth || el.parentElement?.offsetWidth || 280) + "px";
    probe.style.fontSize = "14px";
    probe.style.lineHeight = "1.5";
    probe.style.margin = "2px 0";
    probe.style.wordBreak = "break-word";
    document.body.appendChild(probe);
    const overflow = probe.scrollHeight > 65;
    document.body.removeChild(probe);
    return overflow;
}

function toggleCommentExpand(id) {
    const el = document.getElementById("cc-" + id);
    const btn = document.querySelector(`[data-expand-id="${id}"]`);
    if (!el) return;
    if (el.classList.contains("collapsed")) {
        if (el.dataset.fullHtml) el.innerHTML = el.dataset.fullHtml;
        el.classList.remove("collapsed");
        if (btn) btn.innerHTML = '收起<span class="c-expand-arrow up"></span>';
    } else {
        el.classList.add("collapsed");
        if (btn) btn.innerHTML = '展开<span class="c-expand-arrow"></span>';
        ensureCommentContentTruncated(el);
    }
}

function toggleConfessionCommentExpand(id) {
    const el = document.getElementById("ccc-" + id);
    const btn = document.querySelector(`[data-cexpand-id="${id}"]`);
    if (!el) return;
    if (el.classList.contains("collapsed")) {
        if (el.dataset.fullHtml) el.innerHTML = el.dataset.fullHtml;
        el.classList.remove("collapsed");
        if (btn) btn.innerHTML = '收起<span class="c-expand-arrow up"></span>';
    } else {
        el.classList.add("collapsed");
        if (btn) btn.innerHTML = '展开<span class="c-expand-arrow"></span>';
        ensureCommentContentTruncated(el);
    }
}

async function loadComments(postId) {
    const list = document.getElementById("commentList");
    if (!list) return;
    let res;
    const _hadCache = !!cacheGet(commentListCache, postId);
    try {
        res = await api("/commentList?postId=" + postId);
    } catch (e) {
        if (_hadCache) return;
        list.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#999;">评论加载失败，点击重试</div>';
        list.onclick = () => loadComments(postId);
        return;
    }
    if (!res || res.code !== 1 || !res.data || res.data.length === 0) {
        list.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#999;">还没有评论，快来抢沙发吧</div>';
        return;
    }
    const myUid = getUid();
    const seqMap = {};
    res.data.forEach(c => {
        seqMap[c.post_seq] = c;
    });
    const renderComment = (c, repliesHtml, parentName) => {
        const content = formatCommentContent(c.content);
        const nameHtml = parentName ? `<span class="c-name">${c.nickname}</span><span class="reply-arrow"></span><span class="reply-parent-name">${parentName}</span>` : `<span class="c-name">${c.nickname}</span>`;
        const isMine = c.user_id === myUid || currentNickname === "管理员";
        return `<div class="comment-item" data-comment-id="${c.id}" data-is-mine="${isMine}">\n            <img class="c-avatar" src="${resolveMediaUrl(c.avatar) || DEFAULT_AVATAR}" onclick="goUserProfile('${c.user_id}')" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">\n            <div class="c-body">\n              <div class="c-header">\n                ${nameHtml}\n                ${c.post_seq === 1 ? '<span class="comment-tag-first">首评</span>' : ""}\n              </div>\n              <div class="c-content collapsed" id="cc-${c.id}">${content}</div>\n              <div class="c-meta">\n                <div class="c-meta-left">\n                  <span class="c-time">${timeAgo(c.create_time)}</span>\n                  ${cleanProvince(c.province) ? `<span>${cleanProvince(c.province)}</span>` : ""}\n                  <span class="c-action" onclick="setReply(${c.post_seq})">回复</span>\n                </div>\n                <span class="c-like" onclick="likeComment(${c.id},this)">\n                  <i class="${c.liked ? "fa-solid fa-heart" : "fa-regular fa-heart"}" style="color:${c.liked ? "var(--color-red)" : ""}"></i>\n                  <span>${c.likes || 0}</span>\n                </span>\n              </div>\n              ${repliesHtml || ""}\n            </div>\n          </div>`;
    };
    const collectAllDescendants = parentSeq => {
        const direct = res.data.filter(c => c.parent_seq == parentSeq);
        let all = [];
        for (const c of direct) {
            all.push(c);
            all = all.concat(collectAllDescendants(c.post_seq));
        }
        return all;
    };
    const buildTree = parentSeq => res.data.filter(c => c.parent_seq == parentSeq).map(c => {
        const allDescendants = collectAllDescendants(c.post_seq);
        const repliesHtml = allDescendants.length > 0 ? `<div class="comment-replies">${allDescendants.map(d => {
            const parent = seqMap[d.parent_seq];
            const parentName = parent ? parent.nickname : "";
            return renderComment(d, "", parentName);
        }).join("")}</div>` : "";
        return renderComment(c, repliesHtml, "");
    });
    let html = buildTree(0).join("");
    if (!html.trim()) {
        list.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#999;">还没有评论，快来抢沙发吧</div>';
        cacheSet(commentListCache, postId, list.innerHTML);
    } else {
        const _cc0 = cacheGet(commentListCache, postId);
        if (_cc0 && _cc0.raw === html) {
            _rebindCommentExpandButtons(list);
            bindCommentLongPress();
            return;
        }
        list.innerHTML = html;
        list.querySelectorAll(".c-content.collapsed").forEach(el => {
            const overflow = checkCommentOverflow(el);
            if (overflow) {
                const id = el.id.replace("cc-", "");
                const btn = document.createElement("span");
                btn.className = "c-expand";
                btn.setAttribute("data-expand-id", id);
                btn.innerHTML = '展开<span class="c-expand-arrow"></span>';
                btn.onclick = () => toggleCommentExpand(id);
                el.insertAdjacentElement("afterend", btn);
                ensureCommentContentTruncated(el);
            } else {
                el.classList.remove("collapsed");
            }
        });
        bindCommentLongPress();
        cacheSet(commentListCache, postId, list.innerHTML, {
            raw: html
        });
    }
}

function _rebindCommentExpandButtons(list) {
    list.querySelectorAll(".c-expand[data-expand-id]").forEach(btn => {
        const id = btn.getAttribute("data-expand-id");
        btn.onclick = () => toggleCommentExpand(id);
    });
}

function bindCommentLongPress() {
    const items = document.querySelectorAll(".comment-item[data-comment-id]");
    items.forEach(item => {
        let timer = null;
        let triggered = false;
        const start = e => {
            triggered = false;
            timer = setTimeout(() => {
                triggered = true;
                showCommentMenu(item.dataset.commentId, item.dataset.isMine === "true");
            }, 500);
        };
        const cancel = () => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        };
        const move = () => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        };
        item.addEventListener("touchstart", start, {
            passive: true
        });
        item.addEventListener("touchend", cancel);
        item.addEventListener("touchmove", move, {
            passive: true
        });
        item.addEventListener("mousedown", start);
        item.addEventListener("mouseup", cancel);
        item.addEventListener("mouseleave", cancel);
        item.addEventListener("contextmenu", e => {
            e.preventDefault();
            showCommentMenu(item.dataset.commentId, item.dataset.isMine === "true");
        });
    });
}

function showCommentMenu(commentId, isMine) {
    const existing = document.getElementById("commentMenuOverlay");
    if (existing) existing.remove();
    const overlay = document.createElement("div");
    overlay.id = "commentMenuOverlay";
    overlay.className = "modal-overlay active";
    overlay.onclick = e => {
        if (e.target === overlay) overlay.remove();
    };
    if (isMine) {
        overlay.innerHTML = `<div class="modal-content" style="max-height:40vh;">\n          <div class="modal-handler"></div>\n          <div class="modal-item" style="border-bottom:none;color:var(--color-red);text-align:center;" onclick="deleteComment(${commentId})">\n            <span class="label" style="justify-content:center;width:100%;"><i class="fa-solid fa-trash-can"></i> 删除评论</span>\n          </div>\n        </div>`;
    } else {
        overlay.innerHTML = `<div class="modal-content" style="max-height:40vh;">\n          <div class="modal-handler"></div>\n          <div class="modal-item" style="border-bottom:none;color:var(--color-primary);text-align:center;" onclick="document.getElementById('commentMenuOverlay').remove();goReport('comment',${commentId})">\n            <span class="label" style="justify-content:center;width:100%;"><i class="fa-solid fa-triangle-exclamation"></i> 举报评论</span>\n          </div>\n        </div>`;
    }
    document.body.appendChild(overlay);
}

async function deleteComment(commentId) {
    try {
        const res = await api("/deleteComment", "POST", {
            commentId: commentId
        });
        if (res.code === 1) {
            showToast("已删除");
            document.getElementById("commentMenuOverlay")?.remove();
            if (currentPostDetail) {
                currentPostDetail.comments = Math.max(0, (currentPostDetail.comments || 0) - 1);
                await loadComments(currentPostDetail.id);
            }
        } else {
            showToast(res.msg || "删除失败");
        }
    } catch (e) {
        showToast("删除失败");
    }
}

async function votePost(postId, idx) {
    if (!getToken()) {
        showLoginModal();
        return;
    }
    const res = await api("/votePost", "POST", {
        postId: postId,
        optionIndex: idx
    });
    if (res.code === 1) {
        showToast("投票成功");
        currentPostDetail.poll_data = JSON.stringify(res.data.poll_data);
        currentPostDetail.voted_index = idx;
        render();
        bindPostDetailEvents();
    } else {
        showToast(res.msg || "投票失败");
    }
}

async function sendComment() {
    const input = document.getElementById("commentInput");
    const content = input.value.trim();
    if (!content) return;
    if (content.length > 150) {
        showToast("评论不能超过150字");
        return;
    }
    if (!requireLogin()) return;
    input.value = "";
    input.placeholder = "说点什么...";
    updateCharCount();
    replyTargetSeq = 0;
    const sendBtn = document.getElementById("commentSendBtn");
    if (sendBtn) {
        sendBtn.style.pointerEvents = "none";
        sendBtn.style.opacity = "0.5";
        setTimeout(() => {
            sendBtn.style.pointerEvents = "";
            sendBtn.style.opacity = "";
        }, 1e3);
    }
    const res = await api("/commentPost", "POST", {
        postId: currentPostDetail.id,
        content: content,
        parentSeq: replyTargetSeq
    });
    if (res.code === 1) {
        await loadComments(currentPostDetail.id);
        if (currentPostDetail) {
            currentPostDetail.comments = (currentPostDetail.comments || 0) + 1;
        }
    } else {
        handleActionError(res, "评论失败");
    }
}

async function likeComment(id, el) {
    if (!getToken()) {
        showLoginModal();
        return;
    }
    const res = await api("/likeComment", "POST", {
        commentId: id
    });
    if (res.code === 1) {
        const liked = res.data.liked;
        const icon = el.querySelector("i");
        const span = el.querySelector("span");
        icon.className = liked ? "fa-solid fa-heart" : "fa-regular fa-heart";
        icon.style.color = liked ? "var(--color-red)" : "";
        span.textContent = parseInt(span.textContent) + (liked ? 1 : -1);
    }
}

function _discoverSkeletonHtml() {
    return new Array(3).fill(0).map(() => `\n        <div class="sk-post" style="margin:12px 16px 0;">\n          <div class="sk-post-header" style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">\n            <div class="sk-item sk-avatar"></div>\n            <div class="sk-item sk-name" style="width:100px;height:14px;"></div>\n            <div class="sk-item sk-time" style="margin-left:auto;"></div>\n          </div>\n          <div class="sk-item sk-title"></div>\n          <div style="height:10px;"></div>\n          <div class="sk-item sk-line"></div>\n          <div class="sk-item sk-line"></div>\n          <div class="sk-item sk-line short" style="width:60%;"></div>\n          <div class="sk-actions" style="display:flex;justify-content:space-around;padding-top:12px;">\n            <div class="sk-item sk-action"></div>\n            <div class="sk-item sk-action"></div>\n            <div class="sk-item sk-action"></div>\n          </div>\n        </div>\n      `).join("");
}

function renderDiscover() {
    const skeletonCards = _discoverSkeletonHtml();
    const _tab = discoverActiveTab || "hot";
    const _tabColor = t => t === _tab ? "#333" : "#999";
    return `<div class="page">${renderNavbar("发现", false)}\n        <div class="tabs" id="discoverTabs" style="display:flex;background:#fff;padding:10px 0;border-bottom:0.5px solid #eee;">\n          <div class="tab${_tab === "hot" ? " active" : ""}" data-tab="hot" style="flex:1;text-align:center;font-weight:600;color:${_tabColor("hot")};">热门</div>\n          <div class="tab${_tab === "confession" ? " active" : ""}" data-tab="confession" style="flex:1;text-align:center;font-weight:600;color:${_tabColor("confession")};">表白墙</div>\n          <div class="tab${_tab === "homework" ? " active" : ""}" data-tab="homework" style="flex:1;text-align:center;font-weight:600;color:${_tabColor("homework")};">作业</div>\n          <div class="tab${_tab === "topic" ? " active" : ""}" data-tab="topic" style="flex:1;text-align:center;font-weight:600;color:${_tabColor("topic")};">话题</div>\n        </div>\n        <div style="margin:12px 16px 0;background:linear-gradient(135deg,#1C1C1E,#2C2C2E);border-radius:14px;padding:16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;" onclick="goPage('verifSubscribe')">\n          <div style="display:flex;align-items:center;gap:10px;">\n            <img src="${MEDIA_BASE}/res/icons/icon-jztvozsrv.svg" style="width:40px;height:40px;" alt="认证">\n            <div>\n              <div style="font-size:15px;font-weight:700;color:#fff;">认证中心</div>\n              <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:2px;">解锁创作者专属特权</div>\n            </div>\n          </div>\n          <i class="fa-solid fa-chevron-right" style="color:rgba(255,255,255,0.3);font-size:14px;"></i>\n        </div>\n        <div id="discoverContent">${_dcContentHtml(skeletonCards)}</div>\n      </div>`;
}

function _dcContentHtml(skeletonCards) {
    const _tab = discoverActiveTab || "hot";
    if (_tab === "homework" && cacheGet(discoverCache, "homework")) {
        const _subj = homeworkActiveSubject || "全部";
        const _hl = cacheGet(homeworkListCache, _subj);
        return _homeworkShellHtml(_hl ? _hl.html : "", _hl ? _subj : "");
    }
    const _dc = cacheGet(discoverCache, _tab);
    return _dc && _dc.html ? _dc.html : skeletonCards;
}

function bindDiscoverEvents() {
    const _tabs = document.querySelectorAll("#discoverTabs .tab");
    const _curActive = (() => {
        const el = document.querySelector("#discoverTabs .tab.active");
        return el ? el.dataset.tab : "hot";
    })();
    _tabs.forEach(tab => {
        tab.onclick = () => {
            if ((tab.dataset.tab === "hot" || tab.dataset.tab === "topic" || tab.dataset.tab === "homework") && !getToken()) {
                showLoginModal();
                return;
            }
            document.querySelectorAll("#discoverTabs .tab").forEach(t => {
                t.style.color = "#999";
                t.classList.remove("active");
            });
            tab.style.color = "#333";
            tab.classList.add("active");
            loadDiscoverContent(tab.dataset.tab);
        };
    });
    loadDiscoverContent(_curActive);
}

async function loadDiscoverContent(tab) {
    discoverActiveTab = tab;
    const content = document.getElementById("discoverContent");
    if (!content) return;
    const _cached = cacheGet(discoverCache, tab);
    if (!_cached) {
        content.innerHTML = '<div style="padding:16px;"><div class="sk-item" style="height:120px;margin-bottom:10px;"></div><div class="sk-item" style="height:14px;margin-bottom:8px;"></div><div class="sk-item" style="height:14px;margin-bottom:8px;"></div><div class="sk-item" style="height:14px;width:60%;"></div></div>';
    }
    const _setError = html => {
        if (_cached) return;
        content.innerHTML = html;
    };
    const _apply = html => {
        if (_cached && content.querySelector(".modal-overlay.active, textarea:not(:placeholder-shown), input:not(:placeholder-shown)")) return;
        if (!(_cached && _cached.html === html)) content.innerHTML = html;
        cacheSet(discoverCache, tab, html);
    };
    const _store = html => {
        cacheSet(discoverCache, tab, html);
    };
    try {
        if (tab === "hot") {
            const res = await api("/hotPosts");
            if (res.code === 0 && res.msg === "未登录") {
                _setError('<div style="text-align:center;padding:60px 20px;color:#999;"><i class="fa-solid fa-lock" style="font-size:32px;margin-bottom:12px;display:block;"></i>登录后查看热门</div>');
            } else if (res.code === 1 || res.data) {
                _apply(res.data && res.data.length ? res.data.map(renderPostCard).join("") : '<div class="empty">暂无热门</div>');
                setTimeout(refreshCardExpandButtons, 0);
            }
        } else if (tab === "confession") {
            const res = await api("/confessionList?page=1&size=20");
            let listHtml = "";
            if (res.data && res.data.length > 0) {
                listHtml = res.data.map(renderConfessionCard).join("");
            } else {
                listHtml = '<div style="text-align:center;padding:60px 20px;color:#999;">暂无表白，来发布第一条吧</div>';
            }
            if (res.limited && !getToken()) {
                listHtml += '<div style="text-align:center;padding:20px;color:#999;font-size:13px;"><i class="fa-solid fa-lock"></i> 登录查看更多内容</div>';
            } else if (res.limited) {
                listHtml += '<div style="text-align:center;padding:20px;color:#ccc;font-size:13px;">— 没有更多了 —</div>';
            }
            _apply(`\n            <div style="padding:12px 16px;">\n              <button onclick="openConfessionModal()" style="width:100%;height:44px;background:var(--color-primary);color:#fff;border:none;border-radius:22px;font-size:15px;font-weight:600;cursor:pointer;">\n                <i class="fa-solid fa-pen-to-square"></i> 发布表白\n              </button>\n            </div>\n            ${listHtml}\n            <div class="modal-overlay" id="confessionModal" onclick="if(event.target===this)closeConfessionModal()">\n              <div class="modal-content" style="max-height:85vh;overflow-y:auto;">\n                <div class="modal-handler"></div>\n                <div style="font-weight:600;font-size:16px;margin-bottom:12px;">发布表白</div>\n                <textarea id="confessionContent" style="width:100%;min-height:120px;border:1px solid #eee;border-radius:8px;padding:12px;font-size:15px;resize:none;" placeholder="写下你的表白..."></textarea>\n                <div style="display:flex;align-items:center;gap:8px;margin-top:12px;font-size:14px;">\n                  <input type="checkbox" id="confessionAnonymous" style="width:18px;height:18px;accent-color:var(--color-primary);" onchange="toggleConfessionWarning()">\n                  <span>匿名发布</span>\n                </div>\n                <div id="confessionWarning" style="display:none;margin-top:12px;padding:12px;background:var(--color-red-light);border-radius:8px;font-size:13px;color:var(--color-red);line-height:1.6;">\n                  <div style="font-weight:600;margin-bottom:4px;">⚠️ 匿名发布须知</div>\n                  <div>• 请遵守平台社区准则及相关法律法规</div>\n                  <div>• 不得发布违法、违规、色情、暴力、侮辱性内容</div>\n                  <div>• 不得侵犯他人隐私或恶意诽谤</div>\n                  <div>• 违规发布将被封禁账号，情节严重者将追究法律责任</div>\n                </div>\n                <button onclick="submitConfession()" style="width:100%;height:48px;background:var(--color-primary);color:#fff;border-radius:12px;font-weight:600;margin-top:16px;">发布</button>\n              </div>\n            </div>\n          `);
        } else if (tab === "topic") {
            const res = await api("/topics");
            if (res.code === 0 && res.msg === "未登录") {
                _setError('<div style="text-align:center;padding:60px 20px;color:#999;"><i class="fa-solid fa-lock" style="font-size:32px;margin-bottom:12px;display:block;"></i>登录后查看话题</div>');
            } else {
                const topicList = res.data || [];
                if (topicList.length === 0) {
                    _setError('<div style="text-align:center;padding:60px 20px;color:#999;">暂无话题</div>');
                } else {
                    _apply('<div style="background:#fff;">' + topicList.map(t => `\n                <div class="topic-list-item" onclick="goTopicDetail('${escapeHtml(t.topic)}')" style="display:flex;align-items:center;padding:14px 16px;border-bottom:0.5px solid #f0f0f0;cursor:pointer;">\n                  <span style="flex:1;font-size:15px;color:#333;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">#${escapeHtml(t.topic)}</span>\n                  <div style="display:flex;align-items:center;color:#999;font-size:13px;margin-left:12px;">\n                    <i class="fa-regular fa-eye" style="margin-right:4px;font-size:14px;"></i>\n                    <span>${formatNumber(t.views || 0)}</span>\n                  </div>\n                </div>\n              `).join("") + "</div>");
                }
            }
        } else if (tab === "homework") {
            if (!_cached) {
                _apply(_homeworkShellHtml());
                loadHomeworkList("全部");
            } else {
                _bindHomeworkControls();
                loadHomeworkList(homeworkActiveSubject || "全部");
            }
        }
    } catch (e) {
        _setError('<div class="network-error">网络异常</div>');
    }
}

function _homeworkShellHtml(listHtml, listSubject) {
    const subjects = [ "全部", "语文", "数学", "英语", "物理", "化学", "其它" ];
    const _active = homeworkActiveSubject || "全部";
    return `\n        <div class="homework-subject-bar" style="display:flex;gap:8px;padding:10px 16px;background:#fff;overflow-x:auto;border-bottom:0.5px solid #eee;">\n          ${subjects.map(s => {
        const a = s === _active;
        return `<div class="hw-subject-item ${a ? "active" : ""}" data-subject="${s}" style="padding:6px 16px;background:${a ? "var(--color-primary)" : "#f5f5f5"};color:${a ? "#fff" : "#666"};border-radius:16px;font-size:13px;white-space:nowrap;cursor:pointer;">${s}</div>`;
    }).join("")}\n        </div>\n        <div style="padding:12px 16px;">\n          <button onclick="openHomeworkModal()" style="width:100%;height:44px;background:var(--color-primary);color:#fff;border:none;border-radius:22px;font-size:15px;font-weight:600;cursor:pointer;">\n            <i class="fa-solid fa-cloud-arrow-up"></i> 上传作业\n          </button>\n        </div>\n        <div id="homeworkList"${listSubject ? ` data-subject="${listSubject}"` : ""}>${listHtml || ""}</div>\n        <div class="modal-overlay" id="homeworkModal" onclick="if(event.target===this)closeHomeworkModal()">\n          <div class="modal-content" style="max-height:90vh;overflow-y:auto;box-sizing:border-box;">\n            <div class="modal-handler"></div>\n            <div style="font-weight:600;font-size:16px;margin-bottom:12px;">上传作业</div>\n            <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:12px;border-bottom:0.5px solid #f0f0f0;">\n              <img id="hwModalAvatar" src="${resolveMediaUrl(myAvatar) || DEFAULT_AVATAR}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">\n              <div style="font-size:15px;font-weight:600;color:#333;">${currentNickname || "用户"}</div>\n            </div>\n            <div style="margin-bottom:12px;font-size:14px;color:#666;">选择科目</div>\n            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">\n              ${subjects.filter(s => s !== "全部").map((s, i) => `<div class="hw-subject-select ${i === 0 ? "active" : ""}" data-subject="${s}" style="padding:6px 14px;background:${i === 0 ? "var(--color-primary)" : "#f5f5f5"};color:${i === 0 ? "#fff" : "#666"};border-radius:14px;font-size:13px;cursor:pointer;">${s}</div>`).join("")}\n            </div>\n            <div style="margin-bottom:12px;font-size:14px;color:#666;">作业描述</div>\n            <textarea id="homeworkContent" style="width:100%;min-height:80px;border:1px solid #eee;border-radius:8px;padding:12px;font-size:15px;resize:none;" placeholder="简单描述一下作业内容..."></textarea>\n            <div style="margin-top:12px;margin-bottom:8px;font-size:14px;color:#666;">上传图片（最多15张）</div>\n            <div id="homeworkImgPreview" class="create-media-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;"></div>\n            <input type="file" id="homeworkImgInput" accept="image/*" multiple style="display:none;" onchange="handleHomeworkImgUpload(this.files); this.value=''">\n            <button id="hwPublishBtn" onclick="submitHomework()" style="width:100%;height:48px;background:var(--color-primary);color:#fff;border:none;border-radius:12px;font-weight:600;margin-top:20px;">发布</button>\n          </div>\n        </div>\n      `;
}

function _bindHomeworkControls() {
    document.querySelectorAll(".hw-subject-item").forEach(item => {
        item.onclick = () => {
            document.querySelectorAll(".hw-subject-item").forEach(i => {
                i.style.background = "#f5f5f5";
                i.style.color = "#666";
                i.classList.remove("active");
            });
            item.style.background = "var(--color-primary)";
            item.style.color = "#fff";
            item.classList.add("active");
            loadHomeworkList(item.dataset.subject);
        };
    });
    document.querySelectorAll(".hw-subject-select").forEach(item => {
        item.onclick = () => {
            document.querySelectorAll(".hw-subject-select").forEach(i => {
                i.style.background = "#f5f5f5";
                i.style.color = "#666";
                i.classList.remove("active");
            });
            item.style.background = "var(--color-primary)";
            item.style.color = "#fff";
            item.classList.add("active");
        };
    });
}

function renderAuth() {
    return `<div class="auth-container">\n        <div class="auth-title">欢迎登录</div>\n        <div class="auth-subtitle">若您没有赞话账号，我们将会为您自动创建赞话账号</div>\n        <div class="auth-input-group"><input id="authPhone" type="tel" maxlength="11" placeholder="请输入手机号"></div>\n        <div class="tip-text" id="tipPhone"></div>\n        <div class="auth-input-group" style="padding-right:0;">\n          <input id="authCode" type="text" maxlength="6" placeholder="验证码">\n          <button class="btn-code" id="sendCodeBtn">获取验证码</button>\n        </div>\n        <div class="tip-text" id="tipCode"></div>\n        <div class="auth-agreement" style="display:flex;align-items:flex-start;gap:8px;line-height:1.6;"><input type="checkbox" id="agreeTerms" style="margin-top:2px;flex-shrink:0;"> <span style="flex:1;">我已阅读并同意<span class="agreement-link" onclick="navigateTo('agreement')" style="color:var(--color-primary);cursor:pointer;">《赞话用户服务协议》</span>、<span class="agreement-link" onclick="navigateTo('privacy')" style="color:var(--color-primary);cursor:pointer;">《赞话用户隐私政策》</span>及<span class="agreement-link" onclick="navigateTo('minorPrivacy')" style="color:var(--color-primary);cursor:pointer;">《赞话未成年人（含儿童）隐私政策》</span></span></div>\n        <div class="tip-text" id="tipAgreement"></div>\n        <button class="auth-btn" id="btnLogin">登录 / 注册</button>\n        <div id="captchaBox"></div>\n      </div>`;
}

let captchaSdkPromise = null;

function getClientConfig() {
    if (clientConfigPromise) return clientConfigPromise;
    clientConfigPromise = api("/clientConfig").then(function(res) {
        if (res && res.code === 1 && res.data) clientConfig = res.data;
        return clientConfig;
    }).catch(function() {
        return clientConfig;
    });
    return clientConfigPromise;
}

function getCaptchaSceneId() {
    return getClientConfig().then(function(cfg) {
        return cfg.captchaSceneId || "";
    });
}

function ensureCaptchaSdk() {
    if (typeof window.initAliyunCaptcha === "function") return Promise.resolve();
    if (captchaSdkPromise) return captchaSdkPromise;
    captchaSdkPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js";
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => {
            captchaSdkPromise = null;
            reject(new Error("captcha sdk load failed"));
        };
        document.head.appendChild(s);
    });
    return captchaSdkPromise;
}

let _pnvsSdkPromise = null;

let _pnvsServer = null;

let _pnvsToken = null;

let _pnvsAvailable = false;

let _pnvsChecked = false;

let _pnvsVendor = "";

const PNVS_VENDOR_MAP = {
    CM: "中国移动",
    CU: "中国联通",
    CT: "中国电信"
};

let _pnvsStyleInjected = false;

const PNVS_CSS = [ "#pnvsHost.page-type-container-wrap{height:auto!important;width:100%!important;min-height:200px;overflow:visible!important;}", "#pnvsHost .page-type-container{position:relative!important;top:auto!important;left:auto!important;height:auto!important;width:100%!important;background:transparent!important;overflow:visible!important;align-items:stretch!important;}", "#pnvsHost .page-type-container .nav{height:26px!important;line-height:26px!important;padding:0!important;width:100%!important;}", "#pnvsHost .page-type-container .nav .nav-title{font-size:15px!important;font-weight:600;color:#1c1c1e!important;width:auto!important;text-align:center!important;}", "#pnvsHost .page-type-container .nav .nav-back-icon{padding:0!important;}", "#pnvsHost .page-type-container .nav .nav-back-icon-img{width:8px!important;height:auto!important;}", "#pnvsHost .page-type-container .number-con-wrap{width:100%!important;margin:20px 0 6px!important;}", "#pnvsHost .page-type-container .number-con{height:auto!important;line-height:1.4!important;font-size:24px!important;letter-spacing:1px!important;color:#1c1c1e!important;}", "#pnvsHost .page-type-container .number-con div{margin:0 1px!important;}", "#pnvsHost .page-type-container .number-con input{width:26px!important;height:30px!important;font-size:24px!important;margin:0 2px!important;border:0!important;border-bottom:1px solid #d1d1d6!important;border-radius:0!important;background:#fff!important;}", "#pnvsHost .page-type-container .number-con input.focus{border-bottom:1px solid var(--color-primary,#099536)!important;}", "#pnvsHost .page-type-container .number-tip{visibility:hidden!important;height:18px!important;font-size:11px!important;}", "#pnvsHost .page-type-container .agreement{margin:12px 0 0!important;padding:0 2px!important;align-items:flex-start!important;}", "#pnvsHost .page-type-container .agreement .agree-content{width:100%!important;font-size:11px!important;color:#8e8e93!important;line-height:1.6!important;}", "#pnvsHost .page-type-container .agreement .agreement-privacy-link,#pnvsHost .page-type-container .agreement a{color:var(--color-primary,#099536)!important;font-size:11px!important;display:inline!important;}", "#pnvsHost .page-type-container .agreement .check-box{display:none!important;}", "#pnvsHost .page-type-container .agreement .checke-0,#pnvsHost .page-type-container .agreement .checke-1{height:14px!important;width:14px!important;border-radius:3px!important;margin:2px 5px 0 0!important;flex-shrink:0!important;transition:none!important;}", "#pnvsHost .page-type-container .agreement .checke-1{background:var(--color-primary,#099536)!important;border:1px solid var(--color-primary,#099536)!important;}", "#pnvsHost .page-type-container .agreement .checke-0 img,#pnvsHost .page-type-container .agreement .checke-1 img{width:14px!important;height:14px!important;}", "#pnvsHost .page-type-container .agreement .agree-content-tip{font-size:11px!important;}", "#pnvsHost .page-type-container .submit-btn{width:100%!important;margin:16px 0 0!important;padding:13px 0!important;border:none!important;border-radius:12px!important;background:var(--color-primary,#099536)!important;background-image:none!important;color:#fff!important;font-size:16px!important;font-weight:600!important;}", "#pnvsHost .custom-view-box{margin:10px 0 0!important;width:100%!important;padding:0 2px!important;}", "#pnvsHost .pnvs-extra{font-size:11px!important;line-height:1.6!important;color:#8e8e93!important;text-align:center;}", "#pnvsHost .pnvs-extra a{color:var(--color-primary,#099536)!important;font-size:11px!important;text-decoration:none;}", "#pnvsHost .dialog-type-container .dialog-type-inner-content>.custom-view-box{order:5;margin:6px 0 0!important;}", "#pnvsHost .dialog-type-container .dialog-type-inner-content>.submit-btn{order:6;}", "#pnvsHost .page-type-container .submit-btn.submit-disabled{opacity:.6!important;}", "#pnvsHost .dialog-type-container{position:relative!important;width:100%!important;height:auto!important;background:transparent!important;}", "#pnvsHost .dialog-type-container .dialog-type-inner-content{position:relative!important;top:auto!important;left:auto!important;transform:none!important;width:100%!important;padding:0!important;box-shadow:none!important;background:transparent!important;}", "#pnvsHost .dialog-type-container .dialog-title{font-size:15px!important;font-weight:600;color:#1c1c1e!important;margin-top:0!important;text-align:center!important;}", "#pnvsHost .dialog-type-container .close-btn,#pnvsHost .dialog-type-container .close-img{align-self:flex-start!important;}", "#pnvsHost .dialog-type-container .logo{display:none!important;}", "#pnvsHost .dialog-type-container .number-con-wrap{width:100%!important;margin:16px 0 6px!important;}", "#pnvsHost .dialog-type-container .number-con{height:auto!important;line-height:1.4!important;font-size:24px!important;letter-spacing:1px!important;color:#1c1c1e!important;}", "#pnvsHost .dialog-type-container .number-con div{margin:0 1px!important;}", "#pnvsHost .dialog-type-container .number-con input{width:26px!important;height:30px!important;font-size:24px!important;margin:0 2px!important;border:0!important;border-bottom:1px solid #d1d1d6!important;background:#fff!important;}", "#pnvsHost .dialog-type-container .number-tip{visibility:hidden!important;font-size:11px!important;}", "#pnvsHost .dialog-type-container .agreement{margin:12px 0 0!important;padding:0 2px!important;align-items:flex-start!important;}", "#pnvsHost .dialog-type-container .agreement .agree-content{width:100%!important;font-size:11px!important;color:#8e8e93!important;line-height:1.6!important;}", "#pnvsHost .dialog-type-container .agreement .agreement-privacy-link,#pnvsHost .dialog-type-container .agreement a{color:var(--color-primary,#099536)!important;font-size:11px!important;display:inline!important;}", "#pnvsHost .dialog-type-container .agreement .check-box{display:none!important;}", "#pnvsHost .dialog-type-container .agreement .checke-0,#pnvsHost .dialog-type-container .agreement .checke-1{height:14px!important;width:14px!important;border-radius:3px!important;margin:2px 5px 0 0!important;transition:none!important;}", "#pnvsHost .dialog-type-container .agreement .checke-1{background:var(--color-primary,#099536)!important;border:1px solid var(--color-primary,#099536)!important;}", "#pnvsHost .agreement .checke-1 svg,#pnvsHost .dialog-type-container .agreement .checke-1 svg{fill:#fff!important;width:14px!important;height:14px!important;}", "#pnvsHost .agreement .checke-1 svg g,#pnvsHost .dialog-type-container .agreement .checke-1 svg g{fill:#fff!important;}", "#pnvsHost .dialog-type-container .submit-btn{width:100%!important;margin:16px 0 0!important;padding:13px 0!important;border:none!important;border-radius:12px!important;background:var(--color-primary,#099536)!important;background-image:none!important;color:#fff!important;font-size:16px!important;font-weight:600!important;}" ].join("");

function injectPnvsStyle() {
    if (_pnvsStyleInjected) return;
    _pnvsStyleInjected = true;
    const st = document.createElement("style");
    st.id = "pnvsStyle";
    st.textContent = PNVS_CSS;
    document.head.appendChild(st);
}

function ensurePnvsSdk() {
    if (typeof window.PhoneNumberServer === "function") return Promise.resolve();
    if (_pnvsSdkPromise) return _pnvsSdkPromise;
    _pnvsSdkPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = MEDIA_BASE + "/static/numberAuth-web-sdk.js";
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => {
            _pnvsSdkPromise = null;
            reject(new Error("pnvs sdk load failed"));
        };
        document.head.appendChild(s);
    });
    return _pnvsSdkPromise;
}

function getPnvsServer() {
    if (_pnvsServer) return _pnvsServer;
    _pnvsServer = new window.PhoneNumberServer;
    return _pnvsServer;
}

function fetchPnvsToken(force) {
    if (!force && _pnvsToken && Date.now() < _pnvsToken.expireAt) return Promise.resolve(_pnvsToken);
    return api("/numberAuth/token").then(function(res) {
        if (res && res.code === 1 && res.data && res.data.accessToken) {
            _pnvsToken = {
                accessToken: res.data.accessToken,
                jwtToken: res.data.jwtToken,
                expireAt: Date.now() + 7 * 6e4
            };
            return _pnvsToken;
        }
        throw new Error(res && res.msg ? res.msg : "token失败");
    });
}

function initNumberAuthCheck() {
    if (_pnvsChecked) return;
    _pnvsChecked = true;
    getClientConfig().then(function(cfg) {
        if (!cfg || !cfg.pnvsEnabled) {
            _pnvsChecked = false;
            return;
        }
        try {
            Promise.all([ ensurePnvsSdk(), fetchPnvsToken(false) ]).then(function(results) {
                const tk = results[1];
                getPnvsServer().checkLoginAvailable({
                    accessToken: tk.accessToken,
                    jwtToken: tk.jwtToken,
                    timeout: 5,
                    success: function(res) {
                        if (res && res.code === 6e5) _pnvsAvailable = true;
                    },
                    error: function() {
                        _pnvsAvailable = false;
                    }
                });
            }).catch(function() {});
        } catch (e) {
            _pnvsAvailable = false;
        }
        api("/numberAuth/carrier").then(function(res) {
            if (res && res.code === 1 && res.data && res.data.carrier) {
                _pnvsVendor = res.data.carrier;
                updatePnvsCarrierLine();
            }
        }).catch(function() {});
    }).catch(function() {});
}

function updatePnvsCarrierLine() {
    const el = document.getElementById("loginOneCarrier");
    if (!el) return;
    el.textContent = _pnvsVendor ? "由" + _pnvsVendor + "提供服务" : "由中国移动／联通／电信提供服务";
}

function switchLoginToSms() {
    const ov = document.getElementById("loginOneView");
    const sv = document.getElementById("loginSmsView");
    if (ov) ov.style.display = "none";
    if (sv) sv.style.display = "";
    initLoginCaptchaIfNeeded();
}

function getPnvsHost() {
    return document.getElementById("pnvsHost");
}

function setPnvsHostLoading(text) {
    const ld = document.getElementById("pnvsHostLoading");
    if (!ld) return;
    ld.textContent = text;
    ld.style.display = text ? "" : "none";
}

function closePnvsAuthPage() {
    try {
        if (_pnvsServer && typeof _pnvsServer.closeLoginPage === "function") _pnvsServer.closeLoginPage();
    } catch (e) {}
    try {
        const h = getPnvsHost();
        if (h) {
            Array.prototype.slice.call(h.children).forEach(function(n) {
                if (n && n.id !== "pnvsHostLoading") h.removeChild(n);
            });
        }
    } catch (e) {}
    const ld = document.getElementById("pnvsHostLoading");
    if (ld) {
        ld.textContent = "正在获取本机号码...";
        ld.style.display = "";
    }
}

function openPnvsAuthPage() {
    const h = getPnvsHost();
    if (!h) {
        switchLoginToSms();
        return;
    }
    closePnvsAuthPage();
    injectPnvsStyle();
    updatePnvsCarrierLine();
    setPnvsHostLoading("正在获取本机号码...");
    const finishToSms = function(msg) {
        closePnvsAuthPage();
        if (msg) showToast(msg);
        switchLoginToSms();
    };
    const docBase = location.origin + (window.__BASE || "");
    let srv = null;
    try {
        srv = getPnvsServer();
    } catch (e) {}
    if (!srv) {
        finishToSms("认证组件加载失败，请使用验证码登录");
        return;
    }
    srv.getLoginToken({
        authPageOption: {
            mount: "pnvsHost",
            isDialog: false,
            isHideLogo: true,
            navText: "本机号码登录",
            btnText: "登录",
            numberLabel: "",
            privacyBefore: "我已阅读并同意",
            agreeSymbol: "、",
            vendorPrivacyPrefix: "《",
            vendorPrivacySuffix: "》",
            privacyVenderIndex: 0,
            privacyOne: [ "《赞话用户服务协议》", docBase + "/#agreement" ],
            privacyTwo: [ "《赞话用户隐私政策》", docBase + "/#privacy" ],
            showCustomView: true,
            customView: {
                element: '<div class="pnvs-extra"><a href="' + docBase + '/#minorPrivacy" target="_blank" rel="noopener noreferrer">《赞话未成年人（含儿童）隐私政策》</a></div>'
            },
            manualClose: true
        },
        timeout: 12,
        success: function(res) {
            if (!res || res.code !== 6e5 || !res.spToken) {
                finishToSms("认证失败，请使用验证码登录");
                return;
            }
            setPnvsHostLoading("正在登录...");
            api("/numberAuthLogin", "POST", {
                spToken: res.spToken,
                inviteCode: getInviteCode()
            }).then(function(json) {
                closePnvsAuthPage();
                if (json && json.code === 1) {
                    setToken(json.data.token);
                    currentUsername = json.data.phone || "";
                    currentNickname = json.data.nickname || "";
                    showToast("登录成功");
                    hideLoginModal();
                    goPage("home");
                    loadPosts(true);
                } else {
                    if (json && json.banInfo && json.banInfo.blocked) {
                        try {
                            localStorage.setItem("zanhua_ban_info", JSON.stringify(json.banInfo));
                        } catch (_) {}
                        hideLoginModal();
                        showBanNotice(json.banInfo.userMsg || json.msg || "账号已被限制");
                    } else {
                        showToast(json && json.msg || "登录失败");
                        switchLoginToSms();
                    }
                }
            }).catch(function() {
                finishToSms("网络异常，请使用验证码登录");
            });
        },
        error: function() {
            finishToSms("");
        },
        watch: function(status, netType) {
            if (status === 1 && netType && PNVS_VENDOR_MAP[netType]) {
                _pnvsVendor = PNVS_VENDOR_MAP[netType];
                updatePnvsCarrierLine();
                setPnvsHostLoading("");
            } else if (status === 2) {
                finishToSms("");
            } else if (status === 5) {
                setPnvsHostLoading("正在登录...");
            }
        }
    });
}

function handleOneTapLogin() {
    openPnvsAuthPage();
}

function showNumberAuthCard() {
    injectPnvsStyle();
    updatePnvsCarrierLine();
    const tkStale = !_pnvsToken || Date.now() >= _pnvsToken.expireAt;
    if (!tkStale && _pnvsAvailable) {
        handleOneTapLogin();
        return;
    }
    setPnvsHostLoading("正在获取本机号码...");
    Promise.all([ ensurePnvsSdk(), fetchPnvsToken(true) ]).then(function(results) {
        const tk = results[1];
        getPnvsServer().checkLoginAvailable({
            accessToken: tk.accessToken,
            jwtToken: tk.jwtToken,
            timeout: 6,
            success: function(res) {
                if (res && res.code === 6e5) {
                    _pnvsAvailable = true;
                    handleOneTapLogin();
                } else switchLoginToSms();
            },
            error: function() {
                switchLoginToSms();
            }
        });
    }).catch(function() {
        switchLoginToSms();
    });
}

function bindNumberAuthLogin() {
    document.getElementById("loginOtherAccount")?.addEventListener("click", function() {
        closePnvsAuthPage();
        switchLoginToSms();
    });
}

function initCaptchaIfNeeded() {
    if (captchaIns) return;
    Promise.all([ ensureCaptchaSdk(), getCaptchaSceneId() ]).then(function(results) {
        const sceneId = results[1];
        if (captchaIns) return;
        if (typeof window.initAliyunCaptcha !== "function") return;
        if (!sceneId) return;
        window.initAliyunCaptcha({
            SceneId: sceneId,
            mode: "popup",
            element: "#captchaBox",
            language: "cn",
            timeout: 1e4,
            getInstance: function(ins) {
                captchaIns = ins;
            },
            captchaVerifyCallback: captchaVerifyCallback,
            onBizResultCallback: onBizResultCallback
        });
    });
}

function bindAuthEvents() {
    document.getElementById("sendCodeBtn")?.addEventListener("click", handleSendCode);
    document.getElementById("btnLogin")?.addEventListener("click", handleAuth);
}

function captchaVerifyCallback(param) {
    if (captchaRequestLock) return Promise.resolve({
        captchaResult: false,
        bizResult: false
    });
    captchaRequestLock = true;
    const phone = document.getElementById("authPhone").value.trim();
    return fetch(API_BASE + "/sendSms", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            phone: phone,
            captchaVerifyParam: param
        })
    }).then(function(res) {
        return res.json();
    }).then(function(data) {
        captchaRequestLock = false;
        if (data.code === 1) return {
            captchaResult: true,
            bizResult: true
        }; else {
            document.getElementById("tipCode").textContent = data.msg || "发送失败";
            return {
                captchaResult: false,
                bizResult: false
            };
        }
    }).catch(function() {
        captchaRequestLock = false;
        document.getElementById("tipCode").textContent = "网络异常";
        return {
            captchaResult: false,
            bizResult: false
        };
    });
}

function onBizResultCallback(bizResult) {
    if (bizResult) startCountDown();
}

function startCountDown() {
    codeTimer = 60;
    const btn = document.getElementById("sendCodeBtn");
    btn.disabled = true;
    btn.textContent = codeTimer + "s后重发";
    const timer = setInterval(() => {
        codeTimer--;
        btn.textContent = codeTimer + "s后重发";
        if (codeTimer <= 0) {
            clearInterval(timer);
            btn.disabled = false;
            btn.textContent = "获取验证码";
        }
    }, 1e3);
}

function handleSendCode() {
    const phone = document.getElementById("authPhone").value.trim();
    document.getElementById("tipPhone").textContent = "";
    document.getElementById("tipCode").textContent = "";
    if (!/^1\d{10}$/.test(phone)) {
        document.getElementById("tipPhone").textContent = "请输入正确的手机号";
        return;
    }
    if (captchaIns) captchaIns.show(); else showToast("验证组件加载中，请稍后");
}

async function handleAuth() {
    const phone = document.getElementById("authPhone").value.trim();
    const code = document.getElementById("authCode").value.trim();
    const agree = document.getElementById("agreeTerms").checked;
    document.getElementById("tipPhone").textContent = "";
    document.getElementById("tipCode").textContent = "";
    document.getElementById("tipAgreement").textContent = "";
    if (!/^1\d{10}$/.test(phone)) {
        document.getElementById("tipPhone").textContent = "请输入正确的手机号";
        return;
    }
    if (!code) {
        document.getElementById("tipCode").textContent = "请输入验证码";
        return;
    }
    if (!agree) {
        document.getElementById("tipAgreement").textContent = "请阅读并勾选同意《用户服务协议》《隐私政策》《未成年人隐私政策》";
        return;
    }
    try {
        const res = await api("/auth", "POST", {
            phone: phone,
            code: code,
            inviteCode: getInviteCode()
        });
        if (res.code === 1) {
            setToken(res.data.token);
            showToast("登录成功");
            goPage("home");
        } else {
            if (res.banInfo && res.banInfo.blocked) {
                try {
                    localStorage.setItem("zanhua_ban_info", JSON.stringify(res.banInfo));
                } catch (_) {}
                showBanNotice(res.banInfo.userMsg || res.msg || "账号已被限制");
            } else {
                showToast(res.msg || "登录失败");
            }
        }
    } catch (e) {
        showToast("网络异常，请重试");
    }
}

function showLoginModal() {
    document.getElementById("loginModal").classList.add("active");
    document.getElementById("loginTipPhone").textContent = "";
    document.getElementById("loginTipCode").textContent = "";
    document.getElementById("loginTipAgreement").textContent = "";
    document.getElementById("loginAuthPhone").value = "";
    document.getElementById("loginAuthCode").value = "";
    const ov = document.getElementById("loginOneView");
    const sv = document.getElementById("loginSmsView");
    if (_pnvsAvailable && ov && sv) {
        ov.style.display = "";
        sv.style.display = "none";
        showNumberAuthCard();
    } else {
        if (ov) ov.style.display = "none";
        if (sv) sv.style.display = "";
        initLoginCaptchaIfNeeded();
    }
}

function hideLoginModal() {
    document.getElementById("loginModal").classList.remove("active");
    cleanupPnvsAuthPage();
}

function cleanupPnvsAuthPage() {
    closePnvsAuthPage();
    try {
        Array.prototype.slice.call(document.body.children).forEach(function(n) {
            if (!n || !n.className || typeof n.className !== "string") return;
            if (n.id === "app" || n.id === "app-skeleton" || n.id === "loginModal") return;
            if (/container-wrap|page-type-container|auth-container|aliyun-auth/.test(n.className)) n.parentNode.removeChild(n);
        });
    } catch (e) {}
}

function openAgreementFromLogin(page) {
    hideLoginModal();
    pageHistory.push(currentPage);
    prevPage = currentPage;
    currentPage = page;
    setTabbarVisible(false);
    try {
        history.pushState({
            page: page
        }, "", "#" + page);
    } catch (e) {}
    window.scrollTo(0, 0);
    render();
    updateTabbar();
}

function initLoginCaptchaIfNeeded() {
    if (loginCaptchaIns) return;
    Promise.all([ ensureCaptchaSdk(), getCaptchaSceneId() ]).then(function(results) {
        const sceneId = results[1];
        if (loginCaptchaIns) return;
        if (typeof window.initAliyunCaptcha !== "function") return;
        if (!sceneId) return;
        window.initAliyunCaptcha({
            SceneId: sceneId,
            mode: "popup",
            element: "#loginCaptchaBox",
            language: "cn",
            timeout: 1e4,
            getInstance: function(ins) {
                loginCaptchaIns = ins;
            },
            captchaVerifyCallback: loginCaptchaVerifyCallback,
            onBizResultCallback: loginOnBizResultCallback
        });
    });
}

function loginCaptchaVerifyCallback(param) {
    if (loginCaptchaRequestLock) return Promise.resolve({
        captchaResult: false,
        bizResult: false
    });
    loginCaptchaRequestLock = true;
    const phone = document.getElementById("loginAuthPhone").value.trim();
    return fetch(API_BASE + "/sendSms", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            phone: phone,
            captchaVerifyParam: param
        })
    }).then(function(res) {
        return res.json();
    }).then(function(data) {
        loginCaptchaRequestLock = false;
        if (data.code === 1) return {
            captchaResult: true,
            bizResult: true
        }; else {
            document.getElementById("loginTipCode").textContent = data.msg || "发送失败";
            return {
                captchaResult: false,
                bizResult: false
            };
        }
    }).catch(function() {
        loginCaptchaRequestLock = false;
        document.getElementById("loginTipCode").textContent = "网络异常";
        return {
            captchaResult: false,
            bizResult: false
        };
    });
}

function loginOnBizResultCallback(bizResult) {
    if (bizResult) loginStartCountDown();
}

function loginStartCountDown() {
    codeTimer = 60;
    const btn = document.getElementById("loginSendCodeBtn");
    btn.disabled = true;
    btn.textContent = codeTimer + "s后重发";
    const timer = setInterval(() => {
        codeTimer--;
        btn.textContent = codeTimer + "s后重发";
        if (codeTimer <= 0) {
            clearInterval(timer);
            btn.disabled = false;
            btn.textContent = "获取验证码";
        }
    }, 1e3);
}

function handleLoginSendCode() {
    const phone = document.getElementById("loginAuthPhone").value.trim();
    document.getElementById("loginTipPhone").textContent = "";
    document.getElementById("loginTipCode").textContent = "";
    if (!/^1\d{10}$/.test(phone)) {
        document.getElementById("loginTipPhone").textContent = "请输入正确的手机号";
        return;
    }
    if (loginCaptchaIns) loginCaptchaIns.show(); else showToast("验证组件加载中，请稍后");
}

async function handleLoginAuth() {
    const phone = document.getElementById("loginAuthPhone").value.trim();
    const code = document.getElementById("loginAuthCode").value.trim();
    const agree = document.getElementById("loginAgreeTerms").checked;
    document.getElementById("loginTipPhone").textContent = "";
    document.getElementById("loginTipCode").textContent = "";
    document.getElementById("loginTipAgreement").textContent = "";
    if (!phone) {
        document.getElementById("loginTipPhone").textContent = "请输入手机号";
        return;
    }
    if (!code) {
        document.getElementById("loginTipCode").textContent = "请输入验证码";
        return;
    }
    if (!agree) {
        document.getElementById("loginTipAgreement").textContent = "请阅读并勾选同意《用户服务协议》《隐私政策》《未成年人隐私政策》";
        return;
    }
    try {
        const res = await api("/auth", "POST", {
            phone: phone,
            code: code,
            inviteCode: getInviteCode()
        });
        if (res.code === 1) {
            setToken(res.data.token);
            currentUsername = res.data.phone || "";
            currentNickname = res.data.nickname || "";
            showToast("登录成功");
            hideLoginModal();
            if (currentPage === "createPost") {
                goPage("home");
            } else {
                goPage("home");
                loadPosts(true);
            }
        } else {
            if (res.banInfo && res.banInfo.blocked) {
                try {
                    localStorage.setItem("zanhua_ban_info", JSON.stringify(res.banInfo));
                } catch (_) {}
                showBanNotice(res.banInfo.userMsg || res.msg || "账号已被限制");
            } else {
                showToast(res.msg || "登录失败");
            }
        }
    } catch (e) {
        showToast("网络异常，请重试");
    }
}

function bindLoginEvents() {
    document.getElementById("loginSendCodeBtn")?.addEventListener("click", handleLoginSendCode);
    document.getElementById("loginBtn")?.addEventListener("click", handleLoginAuth);
    bindNumberAuthLogin();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindLoginEvents);
} else {
    bindLoginEvents();
}

let _wmResizeTimer = null;

window.addEventListener("resize", function() {
    if (_wmResizeTimer) clearTimeout(_wmResizeTimer);
    _wmResizeTimer = setTimeout(function() {
        updateScreenWatermark();
    }, 300);
});

function goPostDetail(id) {
    if (!requireLogin()) return;
    if (!id || id === "undefined") {
        showToast("帖子ID异常");
        return;
    }
    const dismissed = localStorage.getItem("zanhua_protected_post_dismissed") === "1";
    if (!dismissed) {
        api("/postDetail?id=" + encodeURIComponent(id)).then(r => {
            if (r.needLogin) {
                showLoginModal();
                return;
            }
            if (r.code === 1 && r.data && r.data.watermark_protected == 1 && r.data.user_id !== getUid()) {
                showProtectedPostWarning(id);
            } else if (r.code === 1) {
                _goPostDetailDirect(id);
            } else {
                showToast(r.msg || "加载失败");
            }
        }).catch(() => {
            _goPostDetailDirect(id);
        });
        return;
    }
    _goPostDetailDirect(id);
}

function _goPostDetailDirect(id) {
    pageHistory.push(currentPage);
    prevPage = currentPage;
    currentPage = "postDetail";
    setTabbarVisible(false);
    try {
        history.pushState({
            page: "postDetail"
        }, "", "#postDetail");
    } catch (e) {}
    const _pd = postDetailCache[id];
    if (_pd && _pd.data) {
        currentPostDetail = _pd.data;
        try {
            window.scrollTo(0, 0);
            render();
            updateTabbar();
        } catch (e) {}
        api("/postDetail?id=" + encodeURIComponent(id)).then(r => {
            if (r.code === 1 && r.data) {
                let _same = false;
                try {
                    _same = JSON.stringify(r.data) === _pd.raw;
                } catch (e) {}
                postDetailCache[id] = {
                    data: r.data,
                    ts: Date.now(),
                    raw: _pd.raw
                };
                if (!_same && currentPage === "postDetail" && document.getElementById("commentList")) {
                    currentPostDetail = r.data;
                    try {
                        postDetailCache[id].raw = JSON.stringify(r.data);
                        render();
                        updateTabbar();
                    } catch (e) {}
                }
            }
        }).catch(() => {});
        return;
    }
    api("/postDetail?id=" + encodeURIComponent(id)).then(r => {
        if (r.code === 1) {
            currentPostDetail = r.data;
            if (r.data && r.data.id) {
                try {
                    postDetailCache[String(r.data.id)] = {
                        data: r.data,
                        ts: Date.now(),
                        raw: JSON.stringify(r.data)
                    };
                } catch (e) {}
            }
            try {
                window.scrollTo(0, 0);
                render();
                updateTabbar();
            } catch (renderErr) {
                console.error("render postDetail error:", renderErr);
                pageHistory.pop();
                currentPage = prevPage;
                showToast("加载失败，请稍后重试");
            }
        } else {
            showToast(r.msg || "加载失败");
        }
    }).catch(e => {
        console.error("goPostDetail error:", e);
        showToast(e.message || "网络异常，请稍后重试");
    });
}

function showProtectedPostWarning(postId) {
    const existing = document.getElementById("protectedPostWarnOverlay");
    if (existing) existing.remove();
    const overlay = document.createElement("div");
    overlay.id = "protectedPostWarnOverlay";
    overlay.className = "modal-overlay active";
    overlay.style.alignItems = "center";
    overlay.style.zIndex = "500";
    overlay.innerHTML = `<div class="modal-content" style="border-radius:20px;max-width:340px;width:90%;padding:28px 24px;text-align:center;">\n        <div style="width:56px;height:56px;margin:0 auto 16px;background:rgba(245,158,11,0.12);border-radius:50%;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-shield-halved" style="font-size:24px;color:#f59e0b;"></i></div>\n        <div style="font-size:17px;font-weight:700;margin-bottom:12px;">该帖子受内容保护</div>\n        <div style="font-size:14px;color:#666;line-height:1.7;margin-bottom:20px;text-align:left;">\n          本帖子已开启内容保护，页面内嵌有暗码水印技术。任何截图均携带可溯源的数字水印信息，平台可通过水印追踪到截图来源用户。<br><br>\n          <strong style="color:#e53e3e;">违规处罚：</strong>未经授权截图传播受保护内容的用户，一经溯源核实，账号将被<strong style="color:#e53e3e;">永久封禁</strong>，同时禁止登录及接收新帖子。\n        </div>\n        <div style="display:flex;gap:12px;">\n          <button id="protectedWarnDontShow" style="flex:1;padding:12px;border:1.5px solid #ddd;border-radius:10px;background:#fff;color:#666;font-size:14px;font-weight:600;cursor:not-allowed;opacity:0.5;" disabled>不再提示(10s)</button>\n          <button id="protectedWarnConfirm" style="flex:1;padding:12px;border:none;border-radius:10px;background:#ccc;color:#fff;font-size:14px;font-weight:600;cursor:not-allowed;" disabled>确定(10s)</button>\n        </div>\n      </div>`;
    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";
    let countdown = 10;
    const confirmBtn = overlay.querySelector("#protectedWarnConfirm");
    const dontShowBtn = overlay.querySelector("#protectedWarnDontShow");
    const timer = setInterval(() => {
        countdown--;
        if (countdown > 0) {
            confirmBtn.textContent = "确定(" + countdown + "s)";
            dontShowBtn.textContent = "不再提示(" + countdown + "s)";
        } else {
            clearInterval(timer);
            confirmBtn.textContent = "确定";
            confirmBtn.style.background = "var(--color-primary)";
            confirmBtn.style.cursor = "pointer";
            confirmBtn.disabled = false;
            dontShowBtn.textContent = "不再提示";
            dontShowBtn.style.borderColor = "var(--color-primary)";
            dontShowBtn.style.color = "var(--color-primary)";
            dontShowBtn.style.cursor = "pointer";
            dontShowBtn.disabled = false;
        }
    }, 1e3);
    confirmBtn.onclick = () => {
        if (confirmBtn.disabled) return;
        clearInterval(timer);
        overlay.remove();
        document.body.style.overflow = "";
        _goPostDetailDirect(postId);
    };
    dontShowBtn.onclick = () => {
        if (dontShowBtn.disabled) return;
        clearInterval(timer);
        localStorage.setItem("zanhua_protected_post_dismissed", "1");
        overlay.remove();
        document.body.style.overflow = "";
        _goPostDetailDirect(postId);
    };
}

window.goPostDetail = goPostDetail;

let currentTopicDetail = null;

let topicPosts = [];

let topicPage = 1;

let topicLoading = false;

let topicNoMore = false;

function goTopicDetail(name) {
    if (!requireLogin()) return;
    pageHistory.push(currentPage);
    prevPage = currentPage;
    currentPage = "topicDetail";
    setTabbarVisible(false);
    try {
        history.pushState({
            page: "topicDetail"
        }, "", "#topicDetail");
    } catch (e) {}
    const _tc = topicDetailCache[name];
    if (_tc && _tc.topic) {
        currentTopicDetail = _tc.topic;
        topicPosts = _tc.posts || [];
        topicPage = _tc.page || 2;
        topicNoMore = !!_tc.noMore;
        try {
            window.scrollTo(0, 0);
            render();
            updateTabbar();
        } catch (e) {}
        return;
    }
    api("/topicDetail?name=" + encodeURIComponent(name) + "&page=1&size=10").then(r => {
        if (r.code === 1) {
            currentTopicDetail = r.data.topic;
            topicPosts = r.data.posts || [];
            topicPage = 2;
            topicNoMore = topicPosts.length < 10;
            topicDetailCache[name] = {
                topic: r.data.topic,
                posts: topicPosts,
                page: topicPage,
                noMore: topicNoMore,
                ts: Date.now()
            };
            try {
                window.scrollTo(0, 0);
                render();
                updateTabbar();
            } catch (renderErr) {
                console.error("render topicDetail error:", renderErr);
                pageHistory.pop();
                currentPage = prevPage;
                showToast("加载失败，请稍后重试");
            }
        } else {
            showToast(r.msg || "话题不存在");
        }
    }).catch(() => {
        showToast("加载失败");
    });
}

function renderTopicDetail() {
    if (!currentTopicDetail) return '<div style="padding:40px;text-align:center;">话题不存在</div>';
    const t = currentTopicDetail;
    return `<div class="page" style="padding-bottom:0;">\n        <div class="navbar" style="position:sticky;top:0;z-index:100;background:#fff;">\n          <div onclick="goBack()" style="font-size:22px;cursor:pointer;color:#333;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div>\n          <h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">话题详情</h1>\n          <div style="width:28px;"></div>\n        </div>\n        <div style="background:#fff;padding:20px 16px;border-bottom:0.5px solid #eee;">\n          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">\n            <div style="width:48px;height:48px;border-radius:12px;background:var(--color-primary-light);display:flex;align-items:center;justify-content:center;">\n              <i class="fa-solid fa-hashtag" style="font-size:24px;color:var(--color-primary);"></i>\n            </div>\n            <div style="flex:1;">\n              <div style="font-size:18px;font-weight:700;color:#333;">#${escapeHtml(t.name)}#</div>\n              <div style="font-size:12px;color:#999;margin-top:2px;">${formatNumber(t.views)} 浏览 · ${formatNumber(t.post_count)} 条帖子</div>\n            </div>\n          </div>\n          <div style="display:flex;gap:10px;">\n            <button onclick="goCreatePostWithTopic('${escapeHtml(t.name)}')" style="flex:1;height:36px;background:var(--color-primary);color:#fff;border:none;border-radius:18px;font-size:14px;font-weight:500;cursor:pointer;">\n              <i class="fa-solid fa-pen-to-square"></i> 参与话题\n            </button>\n          </div>\n        </div>\n        <div id="topicPostList"></div>\n        <div class="loading" id="topicLoadMore" style="display:none;text-align:center;padding:20px;color:#999;">加载中...</div>\n        <div id="topicNoMoreTip" style="display:none;text-align:center;padding:20px;color:#ccc;font-size:13px;">— 没有更多了 —</div>\n        <div style="height:20px;"></div>\n      </div>`;
}

async function bindTopicDetailEvents() {
    if (!currentTopicDetail) return;
    const list = document.getElementById("topicPostList");
    if (list) {
        list.innerHTML = topicPosts.length ? topicPosts.map(renderPostCard).join("") : '<div style="text-align:center;padding:60px 20px;color:#999;">该话题暂无帖子，快来发布第一条吧</div>';
    }
    window.onscroll = () => {
        if (currentPage !== "topicDetail") return;
        if (topicNoMore || topicLoading) return;
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 200) loadTopicPosts();
    };
    const noMoreEl = document.getElementById("topicNoMoreTip");
    if (noMoreEl) noMoreEl.style.display = topicNoMore && topicPosts.length > 0 ? "block" : "none";
}

async function loadTopicPosts() {
    if (topicLoading || topicNoMore || !currentTopicDetail) return;
    topicLoading = true;
    const el = document.getElementById("topicLoadMore");
    if (el) el.style.display = "block";
    try {
        const res = await api("/topicDetail?name=" + encodeURIComponent(currentTopicDetail.name) + "&page=" + topicPage + "&size=10");
        if (el) el.style.display = "none";
        const list = res.data && res.data.posts ? res.data.posts : [];
        if (list.length > 0) {
            topicPosts = [ ...topicPosts, ...list ];
            const postList = document.getElementById("topicPostList");
            if (postList) {
                const newHtml = list.map(renderPostCard).join("");
                postList.insertAdjacentHTML("beforeend", newHtml);
            }
        }
        if (list.length < 10) {
            topicNoMore = true;
            const noMoreEl = document.getElementById("topicNoMoreTip");
            if (noMoreEl && topicPosts.length > 0) noMoreEl.style.display = "block";
        } else {
            topicPage++;
        }
    } catch (e) {
        if (el) el.style.display = "none";
    }
    topicLoading = false;
}

function goCreatePostWithTopic(topicName) {
    if (!requireLogin()) return;
    createContent = "#" + topicName + "# ";
    goPage("createPost");
    setTimeout(() => {
        const ta = document.getElementById("createBody");
        if (ta) {
            ta.value = createContent;
            document.getElementById("createCharCount").textContent = ta.value.length;
        }
    }, 100);
}

function renderMessage() {
    if (!getToken()) {
        showLoginModal();
        return `<div class="page">${renderNavbar("消息", false)}<div class="empty" style="text-align:center;padding:40px;">请先登录</div></div>`;
    }
    const chatSkel = new Array(4).fill(0).map(() => `\n        <div style="display:flex;align-items:center;padding:12px 16px;border-bottom:0.5px solid #f0f0f0;background:#ffffff !important;background-color:#ffffff !important;box-sizing:border-box;width:100%;">\n          <div class="sk-item" style="width:44px;height:44px;border-radius:50%;flex-shrink:0;"></div>\n          <div style="flex:1;margin-left:12px;">\n            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">\n              <div class="sk-item" style="width:90px;height:15px;"></div>\n              <div class="sk-item" style="width:40px;height:11px;"></div>\n            </div>\n            <div class="sk-item" style="width:75%;height:12px;"></div>\n          </div>\n        </div>\n      `).join("");
    return `<div class="page">${renderNavbar("消息", false)}\n        <div class="msg-func-row">\n          <div class="msg-func-item" onclick="goPage('notificationLikes')">\n            <div class="msg-func-icon-wrap">\n              <div class="msg-func-icon" style="background:#FFEAEA;color:#ff2442;"><i class="fa-solid fa-heart"></i></div>\n              <span id="likeBadge" class="msg-badge" style="display:none;"></span>\n            </div>\n            <div class="msg-func-label">赞和收藏</div>\n          </div>\n          <div class="msg-func-item" onclick="goPage('notificationFollows')">\n            <div class="msg-func-icon-wrap">\n              <div class="msg-func-icon" style="background:#E8F0FE;color:#1677ff;"><i class="fa-solid fa-user-plus"></i></div>\n              <span id="followBadge" class="msg-badge" style="display:none;"></span>\n            </div>\n            <div class="msg-func-label">新增关注</div>\n          </div>\n          <div class="msg-func-item" onclick="goPage('notificationComments')">\n            <div class="msg-func-icon-wrap">\n              <div class="msg-func-icon" style="background:#E6F7EC;color:var(--color-primary);"><i class="fa-solid fa-comment-dots"></i></div>\n              <span id="commentBadge" class="msg-badge" style="display:none;"></span>\n            </div>\n            <div class="msg-func-label">评论和@</div>\n          </div>\n        </div>\n        <div id="chatList" style="margin-top:8px;">${chatListCache && chatListCache.html ? chatListCache.html : chatSkel}</div>\n      </div>`;
}

async function bindMessageEvents() {
    try {
        const [chatRes, countRes] = await Promise.all([ api("/chatList"), api("/unreadCount") ]);
        const list = document.getElementById("chatList");
        if (!list) return;
        let _listHtml;
        if (!chatRes.data || chatRes.data.length === 0) {
            _listHtml = '<div style="text-align:center;padding:40px;color:#999;">暂无消息</div>';
        } else {
            _listHtml = chatRes.data.map(c => {
                if (c.is_system) {
                    return `\n            <div class="chat-list-item" onclick="goChat('system')" style="display:flex;align-items:center;padding:12px 16px;border-bottom:0.5px solid #f0f0f0;cursor:pointer;background:#ffffff !important;background-color:#ffffff !important;box-sizing:border-box;width:100%;">\n              <div style="width:44px;height:44px;border-radius:50%;flex-shrink:0;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;"><i class="fa-solid fa-bell"></i></div>\n              <div style="flex:1;margin-left:12px;overflow:hidden;">\n                <div style="display:flex;justify-content:space-between;align-items:center;">\n                  <span style="font-weight:600;font-size:15px;">系统消息</span>\n                  <span style="font-size:12px;color:#999;">${c.lastTime ? timeAgo(c.lastTime) : ""}</span>\n                </div>\n                <div style="font-size:13px;color:#999;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;">${(c.lastMessage || "").replace(/\n/g, " ")}</div>\n              </div>\n              ${c.unread ? `<span style="background:#ff2442;color:#fff;font-size:11px;border-radius:10px;padding:2px 6px;margin-left:4px;">${c.unread}</span>` : ""}\n            </div>`;
                }
                if (c.is_stranger_list) {
                    return `\n            <div class="chat-list-item" onclick="goStrangerList()" style="display:flex;align-items:center;padding:12px 16px;border-bottom:0.5px solid #f0f0f0;cursor:pointer;background:#ffffff !important;background-color:#ffffff !important;box-sizing:border-box;width:100%;">\n              <div style="width:44px;height:44px;border-radius:50%;flex-shrink:0;background:linear-gradient(135deg,#f093fb,#f5576c);display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;"><i class="fa-solid fa-user-secret"></i></div>\n              <div style="flex:1;margin-left:12px;overflow:hidden;">\n                <div style="display:flex;justify-content:space-between;align-items:center;">\n                  <span style="font-weight:600;font-size:15px;">陌生人消息</span>\n                  <span style="font-size:12px;color:#999;">${c.lastTime ? timeAgo(c.lastTime) : ""}</span>\n                </div>\n                <div style="font-size:13px;color:#999;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;">${c.type === "image" ? "[图片]" : c.type === "video" ? "[视频]" : c.lastMessage || ""}</div>\n              </div>\n              ${c.unread ? `<span style="background:#ff2442;color:#fff;font-size:11px;border-radius:10px;padding:2px 6px;margin-left:4px;">${c.unread}</span>` : ""}\n            </div>`;
                }
                return `\n            <div class="chat-list-item" onclick="goChat('${c.otherUser}', ${c.is_anonymous ? "true" : "false"})" style="display:flex;align-items:center;padding:12px 16px;border-bottom:0.5px solid #f0f0f0;cursor:pointer;background:#ffffff !important;background-color:#ffffff !important;box-sizing:border-box;width:100%;">\n              <img src="${c.is_anonymous ? DEFAULT_AVATAR : resolveMediaUrl(c.avatar) || DEFAULT_AVATAR}" style="width:44px;height:44px;border-radius:50%;flex-shrink:0;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">\n              <div style="flex:1;margin-left:12px;overflow:hidden;">\n                <div style="display:flex;justify-content:space-between;align-items:center;">\n                  <span style="font-weight:600;font-size:15px;">${c.nickname || "用户" + c.otherUser}${c.is_anonymous ? '<span style="margin-left:6px;padding:2px 6px;background:#f0f0f0;color:#999;border-radius:10px;font-size:11px;">匿名</span>' : ""}</span>\n                  <span style="font-size:12px;color:#999;">${timeAgo(c.lastTime)}</span>\n                </div>\n                <div style="font-size:13px;color:#999;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;">${c.type === "image" ? "[图片]" : c.type === "video" ? "[视频]" : c.lastMessage || ""}</div>\n              </div>\n            </div>`;
            }).join("");
        }
        if (!(chatListCache && chatListCache.html === _listHtml)) {
            list.innerHTML = _listHtml;
            chatListCache = {
                html: _listHtml,
                ts: Date.now()
            };
        }
        if (countRes.code === 1 && countRes.data) {
            const {likeCount: likeCount, followCount: followCount, commentCount: commentCount} = countRes.data;
            updateAllBadges(likeCount, followCount, commentCount);
        }
    } catch (e) {
        const _cl = document.getElementById("chatList");
        if (_cl && !(chatListCache && chatListCache.html)) _cl.innerHTML = '<div style="text-align:center;padding:20px;color:#999;">加载失败</div>';
    }
}

function updateBadge(id, count) {
    const el = document.getElementById(id);
    if (!el) return;
    if (count > 0) {
        el.style.display = "flex";
        el.textContent = count > 99 ? "99+" : count;
    } else {
        el.style.display = "none";
    }
}

function updateAllBadges(likeCount, followCount, commentCount) {
    updateBadge("likeBadge", likeCount);
    updateBadge("followBadge", followCount);
    updateBadge("commentBadge", commentCount);
    const total = (likeCount || 0) + (followCount || 0) + (commentCount || 0);
    unreadTotalCount = total;
    const tabbarBadge = document.querySelector(".tabbar-badge");
    if (tabbarBadge) {
        if (total > 0) {
            tabbarBadge.style.display = "flex";
            tabbarBadge.textContent = total > 99 ? "99+" : total;
        } else {
            tabbarBadge.style.display = "none";
        }
    }
}

function startBadgeRefresh() {
    if (badgeRefreshTimer) return;
    refreshBadges();
    badgeRefreshTimer = setInterval(refreshBadges, 15e3);
}

function stopBadgeRefresh() {
    if (badgeRefreshTimer) {
        clearInterval(badgeRefreshTimer);
        badgeRefreshTimer = null;
    }
}

async function refreshBadges() {
    if (!getToken()) return;
    try {
        const res = await api("/unreadCount");
        if (res.code === 1 && res.data) {
            const {likeCount: likeCount, followCount: followCount, commentCount: commentCount} = res.data;
            updateAllBadges(likeCount, followCount, commentCount);
        }
    } catch (e) {}
}

let profileCurrentTab = "posts";

function renderProfile() {
    if (!getToken()) {
        showLoginModal();
        return `<div class="page">${renderNavbar("我的", false)}<div class="empty" style="text-align:center;padding:40px;">请先登录</div></div>`;
    }
    const gridSkel = new Array(6).fill(0).map(() => `\n        <div class="profile-grid-item" style="background:#fff;">\n          <div class="sk-item" style="width:100%;aspect-ratio:3/4;"></div>\n          <div class="info" style="padding:6px 8px;">\n            <div class="sk-item" style="width:85%;height:12px;margin-bottom:4px;"></div>\n            <div class="sk-item" style="width:40%;height:10px;"></div>\n          </div>\n        </div>\n      `).join("");
    const _hc = profileHeaderCache;
    const _gc = cacheGet(profileGridCache, profileCurrentTab);
    const _gridCls = _gc ? _gc.cls !== undefined ? _gc.cls : "profile-grid" : "profile-grid";
    const _gridPad = _gc ? _gc.pad || "" : "";
    return `<div class="page">\n        ${_hc ? _hc.html : `<div class="profile-header">\n          <div class="profile-top">\n            <img id="myAvatar" class="sk-item profile-avatar" src="" style="width:60px;height:60px;border-radius:50%;cursor:pointer;" onclick="goUserProfile(getUid())">\n            <div class="profile-info">\n              <div id="myNickname" class="sk-item profile-name" style="width:120px;height:22px;margin-bottom:6px;"></div>\n              <div id="myUid" class="sk-item profile-id" style="width:90px;height:12px;"></div>\n            </div>\n          </div>\n          <div id="myBio" class="sk-item profile-bio" style="height:14px;width:70%;margin-bottom:10px;"></div>\n          <div class="profile-stats">\n            <div class="profile-stat" onclick="goFollowList(getUid())" style="cursor:pointer;"><span id="followsCount" class="sk-item num" style="width:30px;height:18px;display:inline-block;margin-bottom:4px;"></span><span class="label">关注</span></div>\n            <div class="profile-stat" onclick="goPage('notificationFollows')" style="cursor:pointer;"><span id="fansCount" class="sk-item num" style="width:30px;height:18px;display:inline-block;margin-bottom:4px;"></span><span class="label">粉丝</span></div>\n            <div class="profile-stat" onclick="goPage('notificationLikes')" style="cursor:pointer;"><span id="likesCount" class="sk-item num" style="width:40px;height:18px;display:inline-block;margin-bottom:4px;"></span><span class="label">获赞与收藏</span></div>\n          </div>\n        </div>`}\n        <div style="display:flex;gap:8px;padding:0 16px 12px;background:#fff;">\n          <button onclick="goPage('editProfile')" style="flex:1;padding:8px;background:#f5f5f5;border:none;border-radius:8px;font-size:14px;cursor:pointer;"><i class="fa-regular fa-pen-to-square"></i> 编辑资料</button>\n          <button onclick="goPage('safetyCenter')" style="flex:1;padding:8px;background:#f5f5f5;border:none;border-radius:8px;font-size:14px;cursor:pointer;"><i class="fa-solid fa-shield-halved"></i> 账号安全</button>\n          <button onclick="confirmLogout()" style="flex:1;padding:8px;background:#f5f5f5;border:none;border-radius:8px;font-size:14px;cursor:pointer;"><i class="fa-solid fa-arrow-right-from-bracket"></i> 退出登录</button>\n        </div>\n        <div class="profile-tabs">\n          <div class="profile-tab ${profileCurrentTab === "posts" ? "active" : ""}" onclick="switchProfileTab('posts')">帖子</div>\n          <div class="profile-tab ${profileCurrentTab === "confession" ? "active" : ""}" onclick="switchProfileTab('confession')">表白墙</div>\n          <div class="profile-tab ${profileCurrentTab === "homework" ? "active" : ""}" onclick="switchProfileTab('homework')">作业</div>\n        </div>\n        <div id="myProfileContent" class="${_gridCls}"${_gc && _gc.pad ? ` style="padding:${_gc.pad};"` : ""}>${_gc ? _gc.html : gridSkel}</div>\n        ${renderLogoutConfirmModal()}\n      </div>`;
}

function switchProfileTab(tab) {
    profileCurrentTab = tab;
    document.querySelectorAll(".profile-tabs .profile-tab").forEach(el => {
        el.classList.remove("active");
    });
    const tabIndex = tab === "posts" ? 1 : tab === "confession" ? 2 : 3;
    const activeTab = document.querySelector(`.profile-tabs .profile-tab:nth-child(${tabIndex})`);
    if (activeTab) activeTab.classList.add("active");
    loadMyProfileContent();
}

async function loadMyProfileContent() {
    await _loadMyProfileContentInner();
}

async function _loadMyProfileContentInner() {
    const container = document.getElementById("myProfileContent");
    if (!container) return;
    const myUid = getUid();
    const _tabAtStart = profileCurrentTab;
    const _hadCache = !!cacheGet(profileGridCache, _tabAtStart);
    const _write = (cls, pad, html) => {
        if (profileCurrentTab !== _tabAtStart) return;
        const _cur = profileGridCache[_tabAtStart];
        if (_cur && _cur.raw === html) return;
        const _curPad = pad === undefined ? container.style.padding : pad;
        if (container.innerHTML === html && container.className === cls && container.style.padding === _curPad) return;
        container.className = cls;
        if (pad !== undefined) container.style.padding = pad;
        container.innerHTML = html;
        cacheSet(profileGridCache, _tabAtStart, container.innerHTML, {
            raw: html,
            cls: cls,
            pad: pad === undefined ? "" : pad
        });
    };
    if (profileCurrentTab === "posts") {
        try {
            const postRes = await api("/myPosts?page=1&size=20");
            if (postRes.code === 1 && postRes.data.length > 0) {
                _write("profile-grid", undefined, postRes.data.map(p => {
                    const imgs = p.images ? p.images.split(",").filter(x => x) : [];
                    const hasVideo = p.video && p.video.length > 0;
                    const cover = hasVideo ? resolveThumb(p.video_cover || "") : resolveThumb(imgs[0] || "");
                    const isVideo = hasVideo && !imgs.length;
                    const isTextOnly = !cover && !isVideo;
                    const textPreview = escapeHtml(p.content || "").replace(/@\[\d+\]([^\s\[\]<]{1,30})/g, "@$1").slice(0, 80);
                    let mediaHtml = "";
                    if (isTextOnly) {
                        mediaHtml = `<div class="pg-text-only" style="width:100%;aspect-ratio:3/4;background:#FAFAFA;position:relative;padding:10px 8px;box-sizing:border-box;border-radius:0 0 10px 10px;overflow:hidden;display:flex;flex-direction:column;">\n                  <div style="font-size:10px;color:#999;font-weight:500;margin-bottom:6px;letter-spacing:0.2px;display:flex;align-items:center;gap:3px;"><i class="fa-regular fa-file-lines" style="font-size:9px;"></i>纯文本</div>\n                  ${p.title ? `<div style="font-size:11px;color:#333;font-weight:600;line-height:1.4;margin-bottom:5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(p.title)}</div>` : ""}\n                  <div style="flex:1;font-size:10px;color:#666;line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;">${textPreview}</div>\n                </div>`;
                    } else {
                        mediaHtml = cover ? `<img src="${cover}" loading="lazy">` : `<div style="width:100%;aspect-ratio:3/4;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);display:flex;align-items:center;justify-content:center;font-size:24px;color:rgba(255,255,255,0.8);"><i class="fa-solid fa-video"></i></div>`;
                    }
                    return `<div class="profile-grid-item ${isTextOnly ? "pg-item-text" : ""}" onclick="goPostDetail('${p.id}')">\n                ${mediaHtml}\n                <div class="info"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.title || (p.content || "").replace(/@\[\d+\]([^\s\[\]<]{1,30})/g, "@$1").slice(0, 20)}</div><div style="color:#999;font-size:11px;margin-top:2px;"><i class="fa-regular fa-heart"></i> ${p.likes || 0}</div></div>\n              </div>`;
                }).join(""));
            } else {
                _write("", "", '<div style="text-align:center;padding:40px;color:#999;">还没有发过帖子</div>');
            }
        } catch (e) {
            if (_hadCache) return;
            container.className = "";
            container.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">加载失败</div>';
        }
    } else if (profileCurrentTab === "homework") {
        try {
            const res = await api("/homeworkList?uid=" + myUid + "&page=1&size=20");
            if (res.code === 1 && res.data.length > 0) {
                _write("", "8px 0", res.data.map(hw => {
                    const imgs = hw.images ? hw.images.split(",").filter(x => x) : [];
                    const hasImages = imgs.length > 0;
                    const hwImgs = hasImages ? imgs.map(i => `<div style="padding:0 12px 8px;"><img loading="lazy" src="${resolveThumb(i)}" style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:6px;"></div>`).join("") : "";
                    return `<div class="card" onclick="goHomeworkDetail(${hw.id})" style="margin:0 8px 8px;">\n                <div class="post-header" style="padding:10px 12px;">\n                  <img class="avatar" src="${resolveMediaUrl(hw.avatar) || DEFAULT_AVATAR}" onclick="event.stopPropagation();goUserProfile('${hw.user_id}')" style="width:32px;height:32px;cursor:pointer;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">\n                  <div class="post-user">\n                    <div class="post-nickname" style="font-size:13px;">${wrapNick(escapeHtml(hw.nickname || "用户"), hw)}${renderListVerification(hw)}</div>\n                    <div class="post-time" style="font-size:11px;">${timeAgo(hw.create_time)} · ${cleanProvince(hw.province) || "未知"}</div>\n                  </div>\n                </div>\n                <div style="padding:0 12px 6px;">\n                  <span style="display:inline-block;padding:2px 10px;background:var(--color-primary-light);color:var(--color-primary);border-radius:10px;font-size:12px;font-weight:500;">${escapeHtml(hw.subject || "其它")}</span>\n                </div>\n                ${hw.content ? `<div class="post-content" style="padding:0 12px 8px;font-size:13px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(hw.content).replace(/@\[\d+\]([^\s\[\]<]{1,30})/g, "@$1").replace(/\n/g, " ")}</div>` : ""}\n                ${hwImgs}\n                <div class="post-actions" style="padding:6px 0 10px;font-size:12px;">\n                  <div class="action-item"><i class="fa-regular fa-eye"></i><span>${hw.views || 0}</span></div>\n                  <div class="action-item"><i class="fa-regular fa-comment"></i><span>${hw.comments || 0}</span></div>\n                  <div class="action-item"><i class="fa-regular fa-heart"></i><span>${hw.likes || 0}</span></div>\n                </div>\n              </div>`;
                }).join(""));
            } else {
                _write("", "", '<div style="text-align:center;padding:40px 20px;color:#999;">还没有发布过作业</div>');
            }
        } catch (e) {
            if (_hadCache) return;
            container.className = "";
            container.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">加载失败</div>';
        }
    } else {
        try {
            const res = await api("/userConfessions?uid=" + myUid + "&page=1&size=20");
            if (res.code === 1 && res.data.length > 0) {
                _write("", "8px 0", res.data.map(c => {
                    const imgs = c.images ? c.images.split(",").filter(x => x) : [];
                    const cover = imgs[0] || "";
                    const hasImages = imgs.length > 0;
                    return `<div class="card" onclick="goConfessionDetail(${c.id})" style="margin:0 8px 8px;">\n                <div class="post-header" style="padding:10px 12px;">\n                  <img class="avatar" src="${c.is_anonymous ? DEFAULT_AVATAR : resolveMediaUrl(c.avatar) || DEFAULT_AVATAR}" style="width:32px;height:32px;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">\n                  <div class="post-user">\n                    <div class="post-nickname" style="font-size:13px;">${c.is_anonymous ? "匿名用户" : wrapNick(c.nickname || "用户" + c.user_id, c)}${c.is_anonymous ? '<span style="margin-left:4px;padding:1px 5px;background:#f0f0f0;color:#999;border-radius:8px;font-size:10px;">匿名</span>' : ""}${!c.is_anonymous ? renderListVerification(c) : ""}</div>\n                    <div class="post-time" style="font-size:11px;">${timeAgo(c.create_time)}</div>\n                  </div>\n                </div>\n                <div class="post-content" style="padding:0 12px 8px;font-size:13px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;height:78px;max-height:78px;box-sizing:content-box;">${escapeHtml(c.content || "").replace(/@\[\d+\]([^\s\[\]<]{1,30})/g, "@$1").replace(/\n/g, " ")}</div>\n                ${hasImages ? `<div style="padding:0 12px 8px;"><img loading="lazy" src="${resolveThumb(cover)}" style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:6px;"></div>` : ""}\n                <div class="post-actions" style="padding:6px 0 10px;font-size:12px;">\n                  <div class="action-item"><i class="${c.liked ? "fa-solid fa-heart" : "fa-regular fa-heart"}" style="color:${c.liked ? "var(--color-red)" : ""}"></i><span>${c.likes || 0}</span></div>\n                  <div class="action-item"><i class="fa-regular fa-comment"></i><span>${c.comment_count || 0}</span></div>\n                </div>\n              </div>`;
                }).join(""));
            } else {
                _write("", "", '<div style="text-align:center;padding:40px 20px;color:#999;">还没有发布过表白</div>');
            }
        } catch (e) {
            if (_hadCache) return;
            container.className = "";
            container.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">加载失败</div>';
        }
    }
}

async function bindProfileEvents() {
    try {
        const res = await api("/userInfo", "POST");
        if (res.code === 1) {
            myAvatar = res.data.avatar || "";
            currentUsername = res.data.phone || "";
            currentNickname = res.data.nickname || "";
            myVerificationTypes = getVerificationTypes(res.data);
            myVerifications = Array.isArray(res.data.verifications) ? res.data.verifications : [];
            visibleWatermarkEnabled = localStorage.getItem("zanhua_visible_wm") === "1";
            const wmToggle = document.getElementById("visibleWmSwitch");
            if (wmToggle) {
                const canUseWm = myVerificationTypes.includes("advanced") || myVerificationTypes.includes("premium") || myVerificationTypes.includes("enterprise");
                const wmItem = document.getElementById("visibleWmItem");
                if (wmItem) wmItem.style.display = canUseWm ? "flex" : "none";
                wmToggle.checked = visibleWatermarkEnabled;
            }
            const myAvatarEl = document.getElementById("myAvatar");
            myAvatarEl.src = resolveMediaUrl(res.data.avatar) || DEFAULT_AVATAR;
            myAvatarEl.classList.remove("sk-item");
            const nickEl = document.getElementById("myNickname");
            if (nickEl) {
                nickEl.classList.remove("sk-item");
                nickEl.style.cssText = "";
                const verifBadge = renderListVerification(res.data);
                nickEl.innerHTML = (res.data.nickname || "用户" + res.data.uid) + (verifBadge || "");
            }
            const uidEl = document.getElementById("myUid");
            uidEl.classList.remove("sk-item");
            uidEl.style.cssText = "";
            uidEl.textContent = "赞话号: " + res.data.uid;
            const bioEl = document.getElementById("myBio");
            bioEl.classList.remove("sk-item");
            bioEl.style.cssText = "";
            bioEl.textContent = res.data.bio || "这个人很懒，什么都没写";
            const profileVerifRows = renderProfileVerificationRows(res.data);
            if (profileVerifRows && bioEl) {
                const existing = document.getElementById("myProfileVerifRows");
                if (existing) existing.remove();
                const div = document.createElement("div");
                div.id = "myProfileVerifRows";
                div.className = "profile-verifications";
                div.style.cssText = "padding:0 0 8px;background:#fff;";
                div.innerHTML = profileVerifRows;
                bioEl.parentNode.insertBefore(div, bioEl.nextSibling);
            }
            const profileRes = await api("/userProfile?uid=" + res.data.uid);
            if (profileRes.code === 1) {
                const fEl = document.getElementById("followsCount");
                fEl.classList.remove("sk-item");
                fEl.style.cssText = "";
                fEl.textContent = profileRes.data.follows || 0;
                const faEl = document.getElementById("fansCount");
                faEl.classList.remove("sk-item");
                faEl.style.cssText = "";
                faEl.textContent = profileRes.data.fans || 0;
                const lEl = document.getElementById("likesCount");
                lEl.classList.remove("sk-item");
                lEl.style.cssText = "";
                lEl.textContent = profileRes.data.total_likes_collects || 0;
            }
        }
    } catch (e) {}
    loadMyProfileContent();
    if (currentPage === "profile" && document.getElementById("myAvatar")) {
        const _ph = document.querySelector(".profile-header");
        if (_ph) profileHeaderCache = {
            html: _ph.outerHTML,
            ts: Date.now()
        };
    }
}

function logout() {
    localStorage.removeItem("zanhua_token");
    clearUserMediaCache();
    feedCache = null;
    clearContentCaches();
    myAvatar = "";
    currentUsername = "";
    currentNickname = "";
    myVerificationTypes = [];
    myVerifications = [];
    visibleWatermarkEnabled = false;
    chatUserProfile = null;
    goPage("home");
}

window.toggleVisibleWatermark = function(enabled) {
    visibleWatermarkEnabled = !!enabled;
    localStorage.setItem("zanhua_visible_wm", visibleWatermarkEnabled ? "1" : "0");
    if (!visibleWatermarkEnabled) {
        const overlay = document.getElementById("visible-wm-overlay");
        if (overlay) overlay.remove();
    }
    const prevScroll = window.scrollY || 0;
    render();
    requestAnimationFrame(function() {
        window.scrollTo(0, prevScroll);
    });
    updateScreenWatermark();
    showToast(visibleWatermarkEnabled ? "满屏水印已开启" : "满屏水印已关闭");
};

let chatUserProfile = null;

let isAnonymousChat = false;

let currentConfessionChatId = null;

let searchCurrentTab = "all";

function renderSearch() {
    return `<div class="search-page" style="background:#fff;min-height:100vh;">\n        <div class="navbar" style="position:sticky;top:0;z-index:10;">\n          <div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;width:40px;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div>\n          <h1 style="flex:1;text-align:center;font-size:18px;font-weight:600;">搜索</h1>\n          <div style="width:40px;"></div>\n        </div>\n        <div style="padding:12px 16px;">\n          <div class="search-bar" style="display:flex;gap:10px;">\n            <input class="search-input" id="searchInput" placeholder="搜索帖子或用户..." style="flex:1;background:#f2f2f2;border-radius:20px;padding:10px 16px;border:none;">\n            <button class="btn" onclick="doSearch()" style="background:var(--color-primary);color:#fff;padding:8px 20px;border-radius:20px;border:none;font-weight:500;">搜索</button>\n          </div>\n        </div>\n        <div class="search-tabs" style="display:flex;background:#fff;border-bottom:0.5px solid #eee;overflow-x:auto;">\n          <div class="search-tab ${searchCurrentTab === "all" ? "active" : ""}" data-tab="all" onclick="switchSearchTab('all')" style="flex:1;text-align:center;padding:10px;font-size:14px;color:#999;font-weight:500;white-space:nowrap;">全部</div>\n          <div class="search-tab ${searchCurrentTab === "posts" ? "active" : ""}" data-tab="posts" onclick="switchSearchTab('posts')" style="flex:1;text-align:center;padding:10px;font-size:14px;color:#999;font-weight:500;white-space:nowrap;">帖子</div>\n          <div class="search-tab ${searchCurrentTab === "users" ? "active" : ""}" data-tab="users" onclick="switchSearchTab('users')" style="flex:1;text-align:center;padding:10px;font-size:14px;color:#999;font-weight:500;white-space:nowrap;">用户</div>\n          <div class="search-tab ${searchCurrentTab === "confession" ? "active" : ""}" data-tab="confession" onclick="switchSearchTab('confession')" style="flex:1;text-align:center;padding:10px;font-size:14px;color:#999;font-weight:500;white-space:nowrap;">表白墙</div>\n          <div class="search-tab ${searchCurrentTab === "topics" ? "active" : ""}" data-tab="topics" onclick="switchSearchTab('topics')" style="flex:1;text-align:center;padding:10px;font-size:14px;color:#999;font-weight:500;white-space:nowrap;">话题</div>\n          <div class="search-tab ${searchCurrentTab === "homework" ? "active" : ""}" data-tab="homework" onclick="switchSearchTab('homework')" style="flex:1;text-align:center;padding:10px;font-size:14px;color:#999;font-weight:500;white-space:nowrap;">作业</div>\n        </div>\n        <div id="searchResult"></div>\n      </div>`;
}

function switchSearchTab(tab) {
    searchCurrentTab = tab;
    document.querySelectorAll(".search-tab").forEach(t => {
        t.classList.remove("active");
        t.style.color = "#999";
    });
    const active = document.querySelector(`.search-tab[data-tab="${tab}"]`);
    if (active) {
        active.classList.add("active");
        active.style.color = "#333";
    }
    const keyword = document.getElementById("searchInput")?.value.trim();
    if (keyword) doSearch();
}

function bindSearchEvents() {
    const input = document.getElementById("searchInput");
    if (input) {
        input.addEventListener("keydown", e => {
            if (e.key === "Enter") doSearch();
        });
        input.focus();
    }
    document.querySelectorAll(".search-tab").forEach(tab => {
        tab.style.color = tab.classList.contains("active") ? "#333" : "#999";
    });
}

function renderSearchHomeworkCard(item) {
    const imgs = item.images ? item.images.split(",").filter(x => x).map(img => img.includes("/") ? img : "/uploads/homework/" + img) : [];
    const imgsJson = imgsJsonStr(imgs);
    const imgClass = imgs.length === 1 ? "single" : "";
    let imagesHtml = "";
    if (imgs.length > 0 && imgs.length <= 9) {
        imagesHtml = `<div class="post-images ${imgClass}">${imgs.map((i, idx) => `<img loading="lazy" src="${resolveThumb(i)}" onclick="event.stopPropagation();showFullImage('${i}','${imgsJson}',${idx})">`).join("")}</div>`;
    } else if (imgs.length > 9) {
        const first8 = imgs.slice(0, 8);
        const rest = imgs.slice(8);
        const restCount = imgs.length - 8;
        imagesHtml = `<div class="post-images">\n          ${first8.map((i, idx) => `<img loading="lazy" src="${resolveThumb(i)}" onclick="event.stopPropagation();showFullImage('${i}','${imgsJson}',${idx})">`).join("")}\n          <div onclick="event.stopPropagation();showFullImage('${rest[0]}','${imgsJson}',8)" style="position:relative;aspect-ratio:1;border-radius:8px;overflow:hidden;cursor:pointer;border:0.5px solid rgba(0,0,0,0.08);box-sizing:border-box;">\n            <div style="display:grid;grid-template-columns:repeat(3,1fr);width:100%;height:100%;">\n              ${rest.slice(0, 9).map(i => `<img loading="lazy" src="${resolveThumb(i)}" style="width:100%;height:100%;aspect-ratio:1;object-fit:cover;border:none;">`).join("")}\n            </div>\n            <div style="position:absolute;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;">\n              <span style="color:#fff;font-size:22px;font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,0.5);">+${restCount}</span>\n            </div>\n          </div>\n        </div>`;
    }
    return `<div class="card" onclick="goHomeworkDetail(${item.id})">\n        <div class="post-header">\n          <img class="avatar" src="${resolveMediaUrl(item.avatar) || DEFAULT_AVATAR}" onclick="event.stopPropagation();goUserProfile('${item.user_id}')" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">\n          <div class="post-user">\n            <div class="post-nickname">${wrapNick(escapeHtml(item.nickname || "用户"), item)}${renderListVerification(item)}</div>\n            <div class="post-time">${timeAgo(item.create_time)} · ${cleanProvince(item.province) || "未知"}</div>\n          </div>\n        </div>\n        <div style="padding:0 16px 6px;">\n          <span style="display:inline-block;padding:2px 10px;background:var(--color-primary-light);color:var(--color-primary);border-radius:10px;font-size:12px;font-weight:500;">${escapeHtml(item.subject || "其它")}</span>\n        </div>\n        ${item.content ? `<div class="post-content">${escapeHtml(item.content).replace(/@\[\d+\]([^\s\[\]<]{1,30})/g, "@$1")}</div>` : ""}\n        ${imagesHtml}\n        <div class="post-actions" onclick="event.stopPropagation()">\n          <div class="action-item"><i class="fa-regular fa-eye"></i><span>${item.views || 0}</span></div>\n          <div class="action-item"><i class="fa-regular fa-comment"></i><span>${item.comments || 0}</span></div>\n          <div class="action-item"><i class="fa-regular fa-heart"></i><span>${item.likes || 0}</span></div>\n        </div>\n      </div>`;
}

function renderSearchTopicCard(t) {
    return `<div class="topic-list-item" onclick="goTopicDetail('${escapeHtml(t.topic)}')" style="display:flex;align-items:center;padding:14px 16px;border-bottom:0.5px solid #f0f0f0;cursor:pointer;">\n        <span style="flex:1;font-size:15px;color:#333;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">#${escapeHtml(t.topic)}</span>\n        <div style="display:flex;align-items:center;color:#999;font-size:13px;margin-left:12px;">\n          <i class="fa-regular fa-eye" style="margin-right:4px;font-size:14px;"></i>\n          <span>${formatNumber(t.views || 0)}</span>\n        </div>\n      </div>`;
}

function renderSearchUserCard(u) {
    return `<div class="user-select-item" onclick="goUserProfile('${u.uid}')" style="cursor:pointer;padding:12px 16px;border-bottom:0.5px solid #f0f0f0;">\n        <img src="${resolveMediaUrl(u.avatar) || DEFAULT_AVATAR}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">\n        <div class="info">${u.nickname}<div style="font-size:12px;color:#999;">赞话号: ${u.uid}</div></div>\n      </div>`;
}

function renderSearchSection(title, html) {
    return `<div style="margin-bottom:8px;">\n        <div style="padding:10px 16px 6px;font-size:13px;font-weight:600;color:#999;">${title}</div>\n        ${html}\n      </div>`;
}

async function doSearch() {
    const keyword = document.getElementById("searchInput").value.trim();
    const result = document.getElementById("searchResult");
    if (!keyword) {
        result.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">请输入关键词</div>';
        return;
    }
    result.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">搜索中...</div>';
    try {
        const res = await api("/search?keyword=" + encodeURIComponent(keyword) + "&tab=" + searchCurrentTab);
        if (res.code !== 1) {
            if (res.msg === "未登录") {
                result.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#999;"><i class="fa-solid fa-lock" style="font-size:32px;margin-bottom:12px;display:block;"></i>登录后使用搜索功能</div>';
            } else {
                result.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">' + (res.msg || "搜索失败") + "</div>";
            }
            return;
        }
        const data = res.data || {};
        const posts = data.posts || [];
        const confession = data.confession || [];
        const users = data.users || [];
        const topics = data.topics || [];
        const homework = data.homework || [];
        if (searchCurrentTab === "all") {
            let allEmpty = posts.length === 0 && confession.length === 0 && users.length === 0 && topics.length === 0 && homework.length === 0;
            if (allEmpty) {
                result.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">未找到相关内容</div>';
                return;
            }
            let html = "";
            if (posts.length > 0) {
                html += renderSearchSection("帖子", posts.map(renderPostCard).join(""));
            }
            if (homework.length > 0) {
                html += renderSearchSection("作业", homework.map(renderSearchHomeworkCard).join(""));
            }
            if (confession.length > 0) {
                html += renderSearchSection("表白墙", confession.map(renderConfessionCard).join(""));
            }
            if (topics.length > 0) {
                html += renderSearchSection("话题", '<div style="background:#fff;">' + topics.map(renderSearchTopicCard).join("") + "</div>");
            }
            if (users.length > 0) {
                html += renderSearchSection("用户", '<div style="background:#fff;">' + users.map(renderSearchUserCard).join("") + "</div>");
            }
            result.innerHTML = html;
            if (posts.length > 0) setTimeout(refreshCardExpandButtons, 0);
        } else if (searchCurrentTab === "posts") {
            if (posts.length > 0) {
                result.innerHTML = posts.map(renderPostCard).join("");
                setTimeout(refreshCardExpandButtons, 0);
            } else {
                result.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">未找到帖子</div>';
            }
        } else if (searchCurrentTab === "users") {
            if (users.length > 0) {
                result.innerHTML = '<div style="background:#fff;">' + users.map(renderSearchUserCard).join("") + "</div>";
            } else {
                result.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">未找到用户</div>';
            }
        } else if (searchCurrentTab === "confession") {
            if (confession.length > 0) {
                result.innerHTML = confession.map(renderConfessionCard).join("");
            } else {
                result.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">未找到表白</div>';
            }
        } else if (searchCurrentTab === "topics") {
            if (topics.length > 0) {
                result.innerHTML = '<div style="background:#fff;">' + topics.map(renderSearchTopicCard).join("") + "</div>";
            } else {
                result.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">未找到话题</div>';
            }
        } else if (searchCurrentTab === "homework") {
            if (homework.length > 0) {
                result.innerHTML = homework.map(renderSearchHomeworkCard).join("");
                setTimeout(refreshCardExpandButtons, 0);
            } else {
                result.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">未找到作业</div>';
            }
        }
    } catch (e) {
        result.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">网络异常</div>';
    }
}

let userProfileCurrentTab = "posts";

function goUserProfile(uid) {
    if (!requireLogin()) return;
    pageHistory.push(currentPage);
    prevPage = currentPage;
    currentPage = "userProfile";
    try {
        history.pushState({
            page: "userProfile"
        }, "", "#userProfile");
    } catch (e) {}
    setTabbarVisible(false);
    const _uc = userProfileObjCache[uid];
    if (_uc && _uc.data) {
        userProfileCurrentTab = _uc.tab || "posts";
        currentViewUser = _uc.data;
        try {
            window.scrollTo(0, 0);
            render();
            updateTabbar();
        } catch (e) {}
        api("/userProfile?uid=" + uid).then(r => {
            if (r.code === 1 && r.data) {
                let _same = false;
                try {
                    _same = JSON.stringify(r.data) === _uc.raw;
                } catch (e) {}
                if (!_same && currentPage === "userProfile" && document.getElementById("userProfileContent")) {
                    currentViewUser = r.data;
                    try {
                        userProfileObjCache[uid] = {
                            data: r.data,
                            raw: JSON.stringify(r.data),
                            ts: Date.now(),
                            tab: userProfileCurrentTab
                        };
                        render();
                        updateTabbar();
                    } catch (e) {}
                } else {
                    userProfileObjCache[uid] = {
                        data: r.data,
                        raw: _uc.raw,
                        ts: Date.now(),
                        tab: userProfileCurrentTab
                    };
                }
            }
        }).catch(() => {});
        return;
    }
    userProfileCurrentTab = "posts";
    api("/userProfile?uid=" + uid).then(r => {
        if (r.code === 1) {
            currentViewUser = r.data;
            if (r.data) {
                try {
                    userProfileObjCache[uid] = {
                        data: r.data,
                        raw: JSON.stringify(r.data),
                        ts: Date.now(),
                        tab: "posts"
                    };
                } catch (e) {}
            }
            try {
                window.scrollTo(0, 0);
                render();
                updateTabbar();
            } catch (renderErr) {
                console.error("render userProfile error:", renderErr);
                pageHistory.pop();
                currentPage = prevPage;
                showToast("加载失败，请稍后重试");
            }
        }
    });
}

function renderUserProfile() {
    if (!currentViewUser) return '<div style="padding:40px;text-align:center;">用户不存在</div>';
    const u = currentViewUser;
    const isMine = u.uid == getUid();
    const isPrivate = u.is_private === 1;
    const followStatus = u.follow_status || "none";
    const isApproved = followStatus === "approved";
    const isPending = followStatus === "pending";
    const blockedByPrivate = !isMine && isPrivate && !isApproved;
    const _uc = blockedByPrivate ? null : cacheGet(userProfileCache, u.uid + ":" + userProfileCurrentTab);
    const _ucCls = _uc ? _uc.cls !== undefined ? _uc.cls : "profile-grid" : "profile-grid";
    const _ucPad = _uc && _uc.pad ? ` style="padding:${_uc.pad};"` : "";
    let followBtnHtml = "";
    if (isMine) {
        followBtnHtml = `<button id="followBtn" onclick="goPage('editProfile')" style="flex:1;padding:10px;border:none;border-radius:20px;font-size:15px;font-weight:600;cursor:pointer;background:#f5f5f5;color:#333;">编辑资料</button>`;
    } else if (isPending) {
        followBtnHtml = `<button id="followBtn" onclick="toggleFollow()" style="flex:1;padding:10px;border:none;border-radius:20px;font-size:15px;font-weight:600;cursor:pointer;background:#f5f5f5;color:#999;">申请中</button>`;
    } else if (u.followed) {
        followBtnHtml = `<button id="followBtn" onclick="toggleFollow()" style="flex:1;padding:10px;border:none;border-radius:20px;font-size:15px;font-weight:600;cursor:pointer;background:#f5f5f5;color:#333;">已关注</button>`;
    } else {
        followBtnHtml = `<button id="followBtn" onclick="toggleFollow()" style="flex:1;padding:10px;border:none;border-radius:20px;font-size:15px;font-weight:600;cursor:pointer;background:var(--color-primary);color:#fff;">关注</button>`;
    }
    let privateBadge = isPrivate ? '<span style="margin-left:6px;padding:2px 6px;background:#fff3e0;color:#ff9800;border-radius:10px;font-size:11px;">私密</span>' : "";
    return `<div class="page">\n        <div class="navbar"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div><h1 style="flex:1;text-align:center;">主页</h1>${isMine ? '<div style="width:40px;"></div>' : "<div onclick=\"goReport('user','" + u.uid + '\')" style="width:40px;text-align:center;cursor:pointer;"><i class="fa-solid fa-triangle-exclamation"></i></div>'}</div>\n        <div class="profile-header">\n          <div class="profile-top">\n            <img class="profile-avatar" src="${resolveMediaUrl(u.avatar) || DEFAULT_AVATAR}" style="width:60px;height:60px;border-radius:50%;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">\n            <div class="profile-info">\n              <div class="profile-name">${u.nickname || "用户" + u.uid}${privateBadge}</div>\n              <div class="profile-id">赞话号: ${u.uid} · IP: ${cleanProvince(u.province) || "未知"}</div>\n            </div>\n          </div>\n          ${(() => {
        const vRows = renderProfileVerificationRows(u);
        if (!vRows) return "";
        return '<div class="profile-verifications">' + vRows + "</div>" + (!isMine ? '<div style="padding:6px 0 0;"><span style="font-size:13px;color:var(--color-primary);cursor:pointer;" onclick="goPage(\'verifSubscribe\')">我也要申请认证 <i class="fa-solid fa-chevron-right" style="font-size:11px;"></i></span></div>' : "");
    })()}\n          <div class="profile-bio">${u.bio || "这个人很懒，什么都没写"}</div>\n          <div class="profile-stats">\n            <div class="profile-stat" onclick="goFollowList('${u.uid}')" style="cursor:pointer;"><span class="num">${u.follows || 0}</span><span class="label">关注</span></div>\n            <div class="profile-stat" onclick="goFansList('${u.uid}')" style="cursor:pointer;"><span class="num">${u.fans || 0}</span><span class="label">粉丝</span></div>\n            <div class="profile-stat" onclick="goPage('notificationLikes')" style="cursor:pointer;"><span class="num">${u.total_likes_collects || 0}</span><span class="label">获赞与收藏</span></div>\n          </div>\n          <div style="display:flex;gap:8px;margin-top:12px;">\n            ${followBtnHtml}\n            ${isMine ? "" : `<button onclick="goChat('${u.uid}')" style="flex:1;padding:10px;background:#f5f5f5;border:none;border-radius:20px;font-size:15px;font-weight:600;cursor:pointer;">发私信</button>`}\n          </div>\n        </div>\n        ${blockedByPrivate ? '<div id="userProfileContent" style="text-align:center;padding:60px 20px;color:#999;"><i class="fa-solid fa-lock" style="font-size:32px;margin-bottom:12px;display:block;"></i>该用户已设为私密账号，关注通过后可查看内容</div>' : `<div class="profile-tabs">\n          <div class="profile-tab ${userProfileCurrentTab === "posts" ? "active" : ""}" onclick="switchUserProfileTab('posts')">帖子</div>\n          <div class="profile-tab ${userProfileCurrentTab === "confession" ? "active" : ""}" onclick="switchUserProfileTab('confession')">表白墙</div>\n          <div class="profile-tab ${userProfileCurrentTab === "homework" ? "active" : ""}" onclick="switchUserProfileTab('homework')">作业</div>\n        </div>\n        <div id="userProfileContent" class="${_ucCls}"${_ucPad}>${_uc ? _uc.html : new Array(6).fill(0).map(() => `\n          <div class="profile-grid-item" style="background:#fff;">\n            <div class="sk-item" style="width:100%;aspect-ratio:3/4;"></div>\n            <div class="info" style="padding:6px 8px;">\n              <div class="sk-item" style="width:85%;height:12px;margin-bottom:4px;"></div>\n              <div class="sk-item" style="width:40%;height:10px;"></div>\n            </div>\n          </div>\n        `).join("")}</div>`}\n      </div>`;
}

function switchUserProfileTab(tab) {
    userProfileCurrentTab = tab;
    if (currentViewUser && userProfileObjCache[currentViewUser.uid]) userProfileObjCache[currentViewUser.uid].tab = tab;
    document.querySelectorAll(".profile-tabs .profile-tab").forEach(el => {
        el.classList.remove("active");
    });
    const tabIndex = tab === "posts" ? 1 : tab === "confession" ? 2 : 3;
    const activeTab = document.querySelector(`.profile-tabs .profile-tab:nth-child(${tabIndex})`);
    if (activeTab) activeTab.classList.add("active");
    loadUserProfileContent();
}

async function loadUserProfileContent() {
    const container = document.getElementById("userProfileContent");
    if (!container || !currentViewUser) return;
    const uid = currentViewUser.uid;
    const _hadCache = !!cacheGet(userProfileCache, uid + ":" + userProfileCurrentTab);
    const _write = (cls, pad, html) => {
        const _key = uid + ":" + userProfileCurrentTab;
        const _cur = userProfileCache[_key];
        if (_cur && _cur.raw === html) return;
        const _curPad = pad === undefined ? container.style.padding : pad;
        if (container.innerHTML === html && container.className === cls && container.style.padding === _curPad) return;
        container.className = cls;
        if (pad !== undefined) container.style.padding = pad;
        container.innerHTML = html;
        cacheSet(userProfileCache, _key, container.innerHTML, {
            raw: html,
            cls: cls,
            pad: pad === undefined ? "" : pad
        });
    };
    if (userProfileCurrentTab === "posts") {
        try {
            const res = await api("/myPosts?page=1&size=20&uid=" + uid);
            if (res.code === 1 && res.data.length > 0) {
                _write("profile-grid", undefined, res.data.map(p => {
                    const imgs = p.images ? p.images.split(",").filter(x => x) : [];
                    const hasVideo = p.video && p.video.length > 0;
                    const cover = hasVideo ? resolveThumb(p.video_cover || "") : resolveThumb(imgs[0] || "");
                    const isVideo = hasVideo && !imgs.length;
                    const isTextOnly = !cover && !isVideo;
                    const textPreview = escapeHtml(p.content || "").replace(/@\[\d+\]([^\s\[\]<]{1,30})/g, "@$1").slice(0, 80);
                    let mediaHtml = "";
                    if (isTextOnly) {
                        mediaHtml = `<div class="pg-text-only" style="width:100%;aspect-ratio:3/4;background:#FAFAFA;position:relative;padding:10px 8px;box-sizing:border-box;border-radius:0 0 10px 10px;overflow:hidden;display:flex;flex-direction:column;">\n                  <div style="font-size:10px;color:#999;font-weight:500;margin-bottom:6px;letter-spacing:0.2px;display:flex;align-items:center;gap:3px;"><i class="fa-regular fa-file-lines" style="font-size:9px;"></i>纯文本</div>\n                  ${p.title ? `<div style="font-size:11px;color:#333;font-weight:600;line-height:1.4;margin-bottom:5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(p.title)}</div>` : ""}\n                  <div style="flex:1;font-size:10px;color:#666;line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;">${textPreview}</div>\n                </div>`;
                    } else {
                        mediaHtml = cover ? `<img src="${cover}" loading="lazy">` : `<div style="width:100%;aspect-ratio:3/4;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);display:flex;align-items:center;justify-content:center;font-size:24px;color:rgba(255,255,255,0.8);"><i class="fa-solid fa-video"></i></div>`;
                    }
                    return `<div class="profile-grid-item ${isTextOnly ? "pg-item-text" : ""}" onclick="goPostDetail('${p.id}')">\n                ${mediaHtml}\n                <div class="info"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.title || (p.content || "").replace(/@\[\d+\]([^\s\[\]<]{1,30})/g, "@$1").slice(0, 20)}</div><div style="color:#999;font-size:11px;margin-top:2px;"><i class="fa-regular fa-heart"></i> ${p.likes || 0}</div></div>\n              </div>`;
                }).join(""));
            } else {
                _write("", "", '<div style="text-align:center;padding:40px;color:#999;">TA还没有发过帖子</div>');
            }
        } catch (e) {
            if (_hadCache) return;
            container.className = "";
            container.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">加载失败</div>';
        }
    } else if (userProfileCurrentTab === "homework") {
        try {
            const res = await api("/homeworkList?uid=" + uid + "&page=1&size=20");
            if (res.code === 1 && res.data.length > 0) {
                _write("", "8px 0", res.data.map(hw => {
                    const imgs = hw.images ? hw.images.split(",").filter(x => x) : [];
                    const hasImages = imgs.length > 0;
                    const hwImgs = hasImages ? imgs.map(i => `<div style="padding:0 12px 8px;"><img loading="lazy" src="${resolveThumb(i)}" style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:6px;"></div>`).join("") : "";
                    return `<div class="card" onclick="goHomeworkDetail(${hw.id})" style="margin:0 8px 8px;">\n                <div class="post-header" style="padding:10px 12px;">\n                  <img class="avatar" src="${resolveMediaUrl(hw.avatar) || DEFAULT_AVATAR}" onclick="event.stopPropagation();goUserProfile('${hw.user_id}')" style="width:32px;height:32px;cursor:pointer;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">\n                  <div class="post-user">\n                    <div class="post-nickname" style="font-size:13px;">${wrapNick(escapeHtml(hw.nickname || "用户"), hw)}${renderListVerification(hw)}</div>\n                    <div class="post-time" style="font-size:11px;">${timeAgo(hw.create_time)} · ${cleanProvince(hw.province) || "未知"}</div>\n                  </div>\n                </div>\n                <div style="padding:0 12px 6px;">\n                  <span style="display:inline-block;padding:2px 10px;background:var(--color-primary-light);color:var(--color-primary);border-radius:10px;font-size:12px;font-weight:500;">${escapeHtml(hw.subject || "其它")}</span>\n                </div>\n                ${hw.content ? `<div class="post-content" style="padding:0 12px 8px;font-size:13px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(hw.content).replace(/@\[\d+\]([^\s\[\]<]{1,30})/g, "@$1").replace(/\n/g, " ")}</div>` : ""}\n                ${hwImgs}\n                <div class="post-actions" style="padding:6px 0 10px;font-size:12px;">\n                  <div class="action-item"><i class="fa-regular fa-eye"></i><span>${hw.views || 0}</span></div>\n                  <div class="action-item"><i class="fa-regular fa-comment"></i><span>${hw.comments || 0}</span></div>\n                  <div class="action-item"><i class="fa-regular fa-heart"></i><span>${hw.likes || 0}</span></div>\n                </div>\n              </div>`;
                }).join(""));
            } else {
                _write("", "", '<div style="text-align:center;padding:40px 20px;color:#999;">TA还没有发布过作业</div>');
            }
        } catch (e) {
            if (_hadCache) return;
            container.className = "";
            container.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">加载失败</div>';
        }
    } else {
        try {
            const res = await api("/userConfessions?uid=" + uid + "&page=1&size=20");
            if (res.code === 1 && res.data.length > 0) {
                _write("", "8px 0", res.data.map(c => {
                    const imgs = c.images ? c.images.split(",").filter(x => x) : [];
                    const cover = imgs[0] || "";
                    const hasImages = imgs.length > 0;
                    return `<div class="card" onclick="goConfessionDetail(${c.id})" style="margin:0 8px 8px;">\n                <div class="post-header" style="padding:10px 12px;">\n                  <img class="avatar" src="${c.is_anonymous ? DEFAULT_AVATAR : resolveMediaUrl(c.avatar) || DEFAULT_AVATAR}" style="width:32px;height:32px;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">\n                  <div class="post-user">\n                    <div class="post-nickname" style="font-size:13px;">${c.is_anonymous ? "匿名用户" : wrapNick(c.nickname || "用户" + c.user_id, c)}${c.is_anonymous ? '<span style="margin-left:4px;padding:1px 5px;background:#f0f0f0;color:#999;border-radius:8px;font-size:10px;">匿名</span>' : ""}${!c.is_anonymous ? renderListVerification(c) : ""}</div>\n                    <div class="post-time" style="font-size:11px;">${timeAgo(c.create_time)}</div>\n                  </div>\n                </div>\n                <div class="post-content" style="padding:0 12px 8px;font-size:13px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;height:78px;max-height:78px;box-sizing:content-box;">${escapeHtml(c.content || "").replace(/@\[\d+\]([^\s\[\]<]{1,30})/g, "@$1").replace(/\n/g, " ")}</div>\n                ${hasImages ? `<div style="padding:0 12px 8px;"><img loading="lazy" src="${resolveThumb(cover)}" style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:6px;"></div>` : ""}\n                <div class="post-actions" style="padding:6px 0 10px;font-size:12px;">\n                  <div class="action-item"><i class="${c.liked ? "fa-solid fa-heart" : "fa-regular fa-heart"}" style="color:${c.liked ? "var(--color-red)" : ""}"></i><span>${c.likes || 0}</span></div>\n                  <div class="action-item"><i class="fa-regular fa-comment"></i><span>${c.comment_count || 0}</span></div>\n                </div>\n              </div>`;
                }).join(""));
            } else {
                _write("", "", '<div style="text-align:center;padding:40px 20px;color:#999;">TA还没有发布过表白</div>');
            }
        } catch (e) {
            if (_hadCache) return;
            container.className = "";
            container.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">加载失败</div>';
        }
    }
}

async function bindUserProfileEvents() {
    if (!currentViewUser) return;
    const isMine = currentViewUser.uid == getUid();
    const isPrivate = currentViewUser.is_private === 1;
    const followStatus = currentViewUser.follow_status || "none";
    const isApproved = followStatus === "approved";
    if (!isMine && isPrivate && !isApproved) return;
    loadUserProfileContent();
}

async function toggleFollow() {
    if (!getToken()) {
        showLoginModal();
        return;
    }
    const res = await api("/follow", "POST", {
        followId: currentViewUser.uid
    });
    if (res.code === 1) {
        currentViewUser.followed = res.data.followed;
        currentViewUser.follow_status = res.data.followed ? res.data.pending ? "pending" : "approved" : "none";
        const btn = document.getElementById("followBtn");
        if (res.data.followed && res.data.pending) {
            btn.style.background = "#f5f5f5";
            btn.style.color = "#999";
            btn.textContent = "申请中";
        } else if (res.data.followed) {
            btn.style.background = "#f5f5f5";
            btn.style.color = "#333";
            btn.textContent = "已关注";
        } else {
            btn.style.background = "var(--color-primary)";
            btn.style.color = "#fff";
            btn.textContent = "关注";
        }
    }
}

function goStrangerList() {
    pageHistory.push(currentPage);
    prevPage = currentPage;
    currentPage = "strangerList";
    try {
        history.pushState({
            page: "strangerList"
        }, "", "#strangerList");
    } catch (e) {}
    window.scrollTo(0, 0);
    render();
    updateTabbar();
}

function renderStrangerList() {
    if (!getToken()) {
        showLoginModal();
        return `<div class="page" style="background:#fff;min-height:100vh;">\n          <div class="navbar"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div><h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">陌生人消息</h1><div style="width:40px;"></div></div>\n          <div class="empty" style="text-align:center;padding:40px;">请先登录</div>\n        </div>`;
    }
    return `<div class="page" style="background:#fff;min-height:100vh;">\n        <div class="navbar"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div><h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">陌生人消息</h1><div style="width:40px;"></div></div>\n        <div id="strangerChatList" style="background:#fff;"></div>\n      </div>`;
}

async function bindStrangerListEvents() {
    try {
        const res = await api("/strangerChatList");
        const list = document.getElementById("strangerChatList");
        if (!res.data || res.data.length === 0) {
            list.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">暂无陌生人消息</div>';
        } else {
            list.innerHTML = res.data.map(c => `\n            <div class="chat-list-item" onclick="goChat('${c.otherUser}', ${c.is_anonymous ? "true" : "false"})" style="display:flex;align-items:center;padding:12px 16px;border-bottom:0.5px solid #f0f0f0;cursor:pointer;">\n              <img src="${c.is_anonymous ? DEFAULT_AVATAR : resolveMediaUrl(c.avatar) || DEFAULT_AVATAR}" style="width:44px;height:44px;border-radius:50%;flex-shrink:0;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">\n              <div style="flex:1;margin-left:12px;overflow:hidden;">\n                <div style="display:flex;justify-content:space-between;align-items:center;">\n                  <span style="font-weight:600;font-size:15px;">${c.nickname || "用户" + c.otherUser}${c.is_anonymous ? '<span style="margin-left:6px;padding:2px 6px;background:#f0f0f0;color:#999;border-radius:10px;font-size:11px;">匿名</span>' : ""}</span>\n                  <span style="font-size:12px;color:#999;">${timeAgo(c.lastTime)}</span>\n                </div>\n                <div style="font-size:13px;color:#999;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;">${c.type === "image" ? "[图片]" : c.type === "video" ? "[视频]" : c.lastMessage || ""}</div>\n              </div>\n            </div>\n          `).join("");
        }
    } catch (e) {
        document.getElementById("strangerChatList").innerHTML = '<div style="text-align:center;padding:20px;color:#999;">加载失败</div>';
    }
}

function goChat(uid, anonymous = false, confessionId = null) {
    chatUser = uid;
    chatMessages = [];
    chatUserProfile = null;
    isAnonymousChat = anonymous;
    currentConfessionChatId = confessionId;
    pageHistory.push(currentPage);
    prevPage = currentPage;
    currentPage = "chat";
    try {
        history.pushState({
            page: "chat"
        }, "", "#chat");
    } catch (e) {}
    window.scrollTo(0, 0);
    render();
    updateTabbar();
}

function renderChat() {
    if (!getToken()) {
        showLoginModal();
        return `<div class="page"><div class="navbar"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div><h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">消息</h1><div style="width:40px;"></div></div><div class="empty" style="text-align:center;padding:40px;">请先登录</div></div>`;
    }
    if (!chatUser) {
        goPage("message");
        return "";
    }
    const isSystemChat = chatUser === "system";
    const isStrangerChat = chatUser === "__stranger__";
    if (isSystemChat) {
        return `<div class="chat-page" style="background:#ededed;min-height:100vh;display:flex;flex-direction:column;">\n          <div class="navbar" style="background:#f7f7f7;"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div><h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">系统消息</h1><div style="width:40px;"></div></div>\n          <div id="chatMessages" class="chat-messages" style="flex:1;overflow-y:auto;padding:12px;"></div>\n        </div>`;
    }
    return `<div class="chat-page" style="background:#ededed;min-height:100vh;display:flex;flex-direction:column;">\n        <div class="navbar" style="background:#f7f7f7;"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div><h1 id="chatTitle" style="flex:1;text-align:center;font-size:17px;font-weight:600;">${isAnonymousChat ? "匿名用户" : "加载中..."}</h1><div style="width:40px;"></div></div>\n        <div id="chatAnonymousTip" style="display:${isAnonymousChat ? "block" : "none"};background:#f5f5f7;color:#666;font-size:12px;padding:8px 16px;text-align:center;border-bottom:0.5px solid #eee;">\n          <i class="fa-solid fa-eye-slash"></i> 匿名聊天中，双方均无法查看对方真实身份\n        </div>\n        <div id="chatStrangerTip" style="display:none;background:#f5f5f7;color:#666;font-size:12px;padding:8px 16px;text-align:center;border-bottom:0.5px solid #eee;">\n          <i class="fa-solid fa-circle-info"></i> 你们不是好友，对方未回复前你只能发送一条消息\n        </div>\n        <div id="chatMessages" class="chat-messages" style="flex:1;overflow-y:auto;padding:12px;"></div>\n        <div id="violationBubble" style="display:none;position:fixed;bottom:0;left:0;right:0;background:rgba(255,36,66,0.95);color:#fff;text-align:center;padding:10px 16px;font-size:14px;font-weight:500;z-index:10;transform:translateY(100%);transition:transform 0.3s cubic-bezier(0.23, 1, 0.32, 1);">\n          <i class="fa-solid fa-circle-exclamation"></i> <span id="violationText">已违规</span>\n        </div>\n        <div class="chat-input-bar" style="display:flex;gap:8px;padding:10px;background:#f7f7f7;border-top:0.5px solid #ddd;position:fixed;left:0;right:0;z-index:20;">\n          <input id="chatInput" placeholder="${isAnonymousChat ? "匿名发送消息..." : "发送消息..."}" style="flex:1;background:#fff;border:none;border-radius:20px;padding:10px 16px;">\n          <button onclick="sendMsg()" style="background:var(--color-primary);color:#fff;border:none;border-radius:20px;padding:10px 20px;font-weight:600;">发送</button>\n        </div>\n      </div>`;
}

async function bindChatEvents() {
    await loadChatMessages();
    chatTimer = setInterval(loadChatMessages, 5e3);
    ensureChatInputVisible();
}

function checkAnonymousChat(messages) {
    if (!messages || messages.length === 0) return isAnonymousChat;
    const myUid = getUid();
    for (const m of messages) {
        if (m.from_user === myUid && m.is_anonymous) {
            return true;
        }
    }
    return false;
}

function updateChatStrangerTip() {
    const tipEl = document.getElementById("chatStrangerTip");
    if (!tipEl || !chatUserProfile) return;
    const isFriend = !!chatUserProfile.isFriend;
    if (isFriend) {
        tipEl.style.display = "none";
    } else if (chatUserProfile.allow_stranger_msg) {
        tipEl.style.display = "block";
        tipEl.innerHTML = '<i class="fa-solid fa-circle-info"></i> 你们不是好友，对方已开启陌生人私信，可自由发送消息';
    } else {
        tipEl.style.display = "block";
        tipEl.innerHTML = '<i class="fa-solid fa-circle-info"></i> 你们不是好友，对方未回复前你只能发送一条消息。等待对方回复或关注你后即可继续发送';
    }
}

async function loadChatMessages() {
    try {
        const res = await api("/messageList?otherUser=" + chatUser + "&page=1&size=50");
        const container = document.getElementById("chatMessages");
        if (!container) {
            clearInterval(chatTimer);
            return;
        }
        if (res.code === 1) {
            if (chatUser === "system") {
                container.innerHTML = res.data.length === 0 ? '<div style="text-align:center;padding:40px;color:#999;">暂无系统消息</div>' : res.data.map(m => {
                    const isViolation = m.content && m.content.includes("用户违规通知");
                    const isAppeal = m.content && m.content.includes("用户申诉处理结果通知");
                    const isFeedback = m.content && m.content.includes("帮助与反馈回复通知");
                    if (isFeedback) {
                        const lines = m.content.split("\n");
                        let fbContent = "", fbReply = "", fbTime = "";
                        lines.forEach(line => {
                            if (line.includes("反馈内容：")) fbContent = line.replace("反馈内容：", "");
                            if (line.includes("回复内容：")) fbReply = line.replace("回复内容：", "");
                            if (line.includes("处理时间：")) fbTime = line.replace("处理时间：", "");
                        });
                        return `\n                      <div style="margin-bottom:16px;padding:0 12px;">\n                        <div style="font-size:11px;color:#999;margin-bottom:6px;text-align:center;">${m.create_time || fbTime}</div>\n                        <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">\n                          <div style="padding:14px 16px;border-bottom:0.5px solid #f5f5f5;">\n                            <div style="font-size:15px;font-weight:700;color:#1D9BF0;">💬 帮助与反馈回复</div>\n                          </div>\n                          <div style="padding:12px 16px;">\n                            <div style="font-size:12px;color:#999;margin-bottom:4px;">您的反馈</div>\n                            <div style="font-size:13px;color:#666;background:#f9f9f9;border-radius:8px;padding:10px 12px;margin-bottom:10px;">${fbContent || "-"}</div>\n                            <div style="font-size:12px;color:#999;margin-bottom:4px;">官方回复</div>\n                            <div style="font-size:13px;color:#333;background:#f0f9ff;border-radius:8px;padding:10px 12px;">${fbReply || "-"}</div>\n                          </div>\n                          <div style="padding:12px 16px;border-top:0.5px solid #f5f5f5;">\n                            <div style="font-size:12px;color:#999;line-height:1.5;">感谢您的反馈与支持，赞话团队将持续努力为您提供更好的体验。</div>\n                          </div>\n                          <div onclick="goPage('feedback')" style="padding:12px 16px;background:#f5f5f7;display:flex;justify-content:space-between;align-items:center;cursor:pointer;">\n                            <span style="font-size:13px;color:#666;">再次反馈</span>\n                            <i class="fa-solid fa-chevron-right" style="color:#ccc;"></i>\n                          </div>\n                        </div>\n                      </div>\n                    `;
                    }
                    if (isViolation || isAppeal) {
                        const lines = m.content.split("\n");
                        let reason = "", category = "", result = "", time = "", contentPreview = "", appealType = "", oldCategory = "", oldReason = "", appealRemark = "";
                        lines.forEach(line => {
                            if (isViolation) {
                                if (line.includes("违规原因")) reason = line.replace("违规原因：", "");
                                if (line.includes("违规类型")) category = line.replace("违规类型：", "");
                                if (line.includes("处理结果")) result = line.replace("处理结果：", "");
                                if (line.includes("处理时间")) time = line.replace("处理时间：", "");
                                if (line.includes("您发布的")) {
                                    const match = line.match(/您发布的(.+)"(.+)"因包含违规内容已被系统删除/);
                                    if (match) contentPreview = match[2];
                                }
                            } else {
                                if (line.includes("申诉类型：")) appealType = line.replace("申诉类型：", "");
                                if (line.includes("原违规类型：")) oldCategory = line.replace("原违规类型：", "");
                                if (line.includes("原违规原因：")) oldReason = line.replace("原违规原因：", "");
                                if (line.includes("申诉处理结果：")) result = line.replace("申诉处理结果：", "");
                                if (line.includes("处理时间：")) time = line.replace("处理时间：", "");
                                if (line.includes("处理意见：")) appealRemark = line.replace("处理意见：", "");
                                if (line.includes("您提交的内容：")) {
                                    const match = line.match(/您提交的内容："(.+)"/);
                                    if (match) contentPreview = match[1];
                                }
                            }
                        });
                        const titleColor = isAppeal ? result.includes("通过") ? "#099536" : "#f59e0b" : "#ff2442";
                        const headerTitle = isAppeal ? result.includes("通过") ? "✅ 申诉处理结果：已通过" : "⚠️ 申诉处理结果：未通过" : "用户违规通知";
                        const footerText = isAppeal ? result.includes("通过") ? "您的申诉已复核通过，原处罚已解除，相关内容已恢复可见。感谢您对赞话社区规范的理解与支持。" : "您的申诉经人工复核后仍判定为违规，原处罚继续有效。如您仍有异议，可再次提交相关证明材料重新申诉。" : "您发布的内容因包含违规信息已被处理，请遵守赞话社区规范，维护良好的社区氛围。";
                        const fields = isAppeal ? [ [ "申诉类型", appealType ], [ "原违规类型", oldCategory ], [ "原违规原因", oldReason ], [ "申诉结果", result ] ].filter(x => x[1]) : [ [ "违规类型", category ], [ "违规原因", reason ], [ "处理结果", result ] ].filter(x => x[1]);
                        const previewLabel = isAppeal ? "您提交的内容" : "违规内容";
                        return `\n                      <div style="margin-bottom:16px;padding:0 12px;">\n                        <div style="font-size:11px;color:#999;margin-bottom:6px;text-align:center;">${m.create_time || time}</div>\n                        <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">\n                          <div style="padding:14px 16px;border-bottom:0.5px solid #f5f5f5;">\n                            <div style="font-size:15px;font-weight:700;color:${titleColor};">${headerTitle}</div>\n                          </div>\n                          <div style="padding:12px 16px;border-bottom:0.5px solid #f5f5f5;">\n                            ${fields.map(f => `\n                              <div style="display:flex;justify-content:space-between;margin-bottom:6px;">\n                                <span style="font-size:12px;color:#999;">${f[0]}</span>\n                                <span style="font-size:12px;color:#333;max-width:60%;text-align:right;">${f[1]}</span>\n                              </div>\n                            `).join("")}\n                          </div>\n                          ${appealRemark ? `<div style="padding:10px 16px;background:#fff7ed;font-size:12px;color:#92400e;border-bottom:0.5px solid #f5f5f5;">💬 处理意见：${appealRemark}</div>` : ""}\n                          ${contentPreview ? `<div style="padding:12px 16px;background:#f9f9f9;font-size:13px;color:#666;">${previewLabel}：${contentPreview}</div>` : ""}\n                          <div style="padding:12px 16px;border-top:0.5px solid #f5f5f5;">\n                            <div style="font-size:12px;color:#999;line-height:1.5;">${footerText}</div>\n                          </div>\n                          <div onclick="goPage('safetyCenter')" style="padding:12px 16px;background:#f5f5f7;display:flex;justify-content:space-between;align-items:center;cursor:pointer;">\n                            <span style="font-size:13px;color:#666;">查看详情</span>\n                            <i class="fa-solid fa-chevron-right" style="color:#ccc;"></i>\n                          </div>\n                        </div>\n                      </div>\n                    `;
                    }
                    return `\n                    <div style="text-align:center;margin-bottom:16px;">\n                      <div style="font-size:11px;color:#999;margin-bottom:6px;">${m.create_time || ""}</div>\n                      <div style="display:inline-block;max-width:80%;background:#fff;color:#333;padding:12px 16px;border-radius:12px;font-size:14px;line-height:1.6;text-align:left;box-shadow:0 1px 2px rgba(0,0,0,0.05);white-space:pre-wrap;">${m.content || ""}</div>\n                    </div>\n                  `;
                }).join("");
                container.scrollTop = container.scrollHeight;
                return;
            }
            const myUid = getUid();
            const isAnon = checkAnonymousChat(res.data);
            const titleEl = document.getElementById("chatTitle");
            const anonTipEl = document.getElementById("chatAnonymousTip");
            const strangerTipEl = document.getElementById("chatStrangerTip");
            if (isAnon) {
                if (titleEl) titleEl.textContent = "匿名用户";
                if (anonTipEl) anonTipEl.style.display = "block";
                if (strangerTipEl) strangerTipEl.style.display = "none";
            } else {
                if (titleEl && chatUserProfile) {
                    titleEl.textContent = chatUserProfile.nickname || "用户" + chatUser;
                } else if (titleEl) {
                    titleEl.textContent = "用户" + chatUser;
                }
                if (anonTipEl) anonTipEl.style.display = "none";
            }
            if (!isAnon && !chatUserProfile) {
                try {
                    const profileRes = await api("/userProfile?uid=" + chatUser);
                    if (profileRes.code === 1) {
                        chatUserProfile = profileRes.data;
                        if (titleEl) titleEl.textContent = profileRes.data.nickname || "用户" + chatUser;
                        updateChatStrangerTip();
                    }
                } catch (e) {}
            }
            const wasNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
            const otherAvatar = chatUserProfile ? resolveMediaUrl(chatUserProfile.avatar) || DEFAULT_AVATAR : DEFAULT_AVATAR;
            const myAvatarUrl = resolveMediaUrl(myAvatar) || DEFAULT_AVATAR;
            container.innerHTML = res.data.map(m => {
                const isMe = m.from_user === myUid;
                const failed = isMe && m.status === 0;
                const failReason = m.fail_reason || "";
                const contentHtml = m.type === "image" ? `<img loading="lazy" src="${resolveThumb(m.content)}" style="max-width:200px;border-radius:8px;" onclick="showFullImage('${m.content}')">` : m.content || "";
                const avatarUrl = isMe ? myAvatarUrl : otherAvatar;
                const avatarHtml = !isAnon && !isMe ? `<img src="${avatarUrl}" onclick="event.stopPropagation();goUserProfile('${m.from_user}')" style="width:36px;height:36px;border-radius:50%;flex-shrink:0;cursor:pointer;margin-right:8px;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">` : isMe ? "" : `<div style="width:36px;margin-right:8px;flex-shrink:0;"></div>`;
                const avatarRightHtml = !isAnon && isMe ? `<img src="${avatarUrl}" onclick="event.stopPropagation();goUserProfile('${myUid}')" style="width:36px;height:36px;border-radius:50%;flex-shrink:0;cursor:pointer;margin-left:8px;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">` : isMe ? "" : `<div style="width:36px;margin-left:8px;flex-shrink:0;"></div>`;
                if (failed) {
                    const safeReason = failReason.replace(/'/g, "\\'").replace(/"/g, "&quot;");
                    const safeReasonAttr = safeReason.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                    return `<div style="display:flex;flex-direction:column;align-items:flex-end;margin-bottom:10px;">\n                <div style="display:flex;justify-content:flex-end;align-items:center;gap:6px;">\n                  <i class="fa-solid fa-circle-exclamation" title="${safeReasonAttr}" style="color:#ff2442;font-size:18px;cursor:pointer;" onclick="customAlert('发送失败：${safeReasonAttr.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n")}')"></i>\n                  <div class="chat-bubble" style="max-width:70%;padding:10px 14px;border-radius:16px;font-size:15px;line-height:1.4;background:#fafafa;color:#888;border:0.5px dashed #ff9bab;border-bottom-right-radius:4px;">${contentHtml}</div>\n                  ${avatarRightHtml}\n                </div>\n                ${failReason ? `<div style="color:#ff2442;font-size:11px;margin-top:4px;margin-right:54px;line-height:1.5;max-width:75%;text-align:right;">发送失败：${failReason}</div>` : ""}\n              </div>`;
                }
                return `<div style="display:flex;${isMe ? "justify-content:flex-end" : ""};align-items:flex-end;margin-bottom:10px;">\n              ${!isMe ? avatarHtml : ""}\n              <div class="chat-bubble" style="max-width:70%;padding:10px 14px;border-radius:16px;font-size:15px;line-height:1.4;${isMe ? "background:var(--color-primary);color:#fff;border-bottom-right-radius:4px;" : "background:#fff;color:#333;border-bottom-left-radius:4px;"}">\n                ${contentHtml}\n              </div>\n              ${isMe ? avatarRightHtml : ""}\n            </div>`;
            }).join("");
            if (wasNearBottom) container.scrollTop = container.scrollHeight;
        }
    } catch (e) {}
}

function showViolationBubble(msg) {
    const bubble = document.getElementById("violationBubble");
    if (bubble) {
        const textEl = document.getElementById("violationText");
        if (textEl) textEl.textContent = msg || "已违规";
        bubble.style.display = "block";
        bubble.style.transform = "translateY(0)";
        clearTimeout(window._violationTimer);
        window._violationTimer = setTimeout(() => {
            bubble.style.transform = "translateY(100%)";
            setTimeout(() => {
                bubble.style.display = "none";
            }, 300);
        }, 3e3);
        return;
    }
    let popup = document.getElementById("global-violation-popup");
    if (!popup) {
        popup = document.createElement("div");
        popup.id = "global-violation-popup";
        popup.style.cssText = "position:fixed;top:0;left:0;right:0;background:rgba(255,36,66,0.95);color:#fff;text-align:center;padding:14px 16px;font-size:15px;font-weight:500;z-index:99999;transform:translateY(-100%);transition:transform 0.3s cubic-bezier(0.23, 1, 0.32, 1);";
        document.body.appendChild(popup);
    }
    popup.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> ' + (msg || "已违规");
    popup.style.display = "block";
    requestAnimationFrame(() => {
        popup.style.transform = "translateY(0)";
    });
    clearTimeout(window._violationTimer);
    window._violationTimer = setTimeout(() => {
        popup.style.transform = "translateY(-100%)";
        setTimeout(() => {
            popup.style.display = "none";
        }, 300);
    }, 3e3);
}

async function sendMsg() {
    const input = document.getElementById("chatInput");
    const content = input.value.trim();
    if (!content) return;
    input.value = "";
    try {
        const res = await api("/sendMessage", "POST", {
            toUser: chatUser,
            content: content,
            isAnonymous: isAnonymousChat ? 1 : 0,
            confessionId: currentConfessionChatId || null
        });
        if (res.code === 1) {
            await loadChatMessages();
        } else {
            if (res.msg && res.msg.indexOf("涉嫌") !== -1) {
                showViolationBubble("已违规：" + res.msg);
            } else if (res.data && res.data.messageId) {
                showToast(res.msg || "发送失败");
                await loadChatMessages();
            } else {
                showToast(res.msg || "发送失败");
            }
        }
    } catch (e) {
        showToast("发送失败");
    }
}

async function retrySendMessage(messageId) {
    if (!messageId) return;
    try {
        const res = await api("/retryMessage", "POST", {
            messageId: messageId
        });
        if (res.code === 1) {
            showToast("发送成功");
            await loadChatMessages();
        } else {
            showToast(res.msg || "重试失败");
        }
    } catch (e) {
        showToast("重试失败");
    }
}

const ALL_COUNTRIES = [ {
    name: "中国大陆",
    code: "CN"
}, {
    name: "中国台湾",
    code: "TW"
}, {
    name: "中国香港",
    code: "HK"
}, {
    name: "中国澳门",
    code: "MO"
}, {
    name: "美国",
    code: "US"
}, {
    name: "日本",
    code: "JP"
}, {
    name: "韩国",
    code: "KR"
}, {
    name: "英国",
    code: "GB"
}, {
    name: "法国",
    code: "FR"
}, {
    name: "德国",
    code: "DE"
}, {
    name: "加拿大",
    code: "CA"
}, {
    name: "澳大利亚",
    code: "AU"
}, {
    name: "新加坡",
    code: "SG"
}, {
    name: "马来西亚",
    code: "MY"
}, {
    name: "泰国",
    code: "TH"
}, {
    name: "越南",
    code: "VN"
}, {
    name: "印度",
    code: "IN"
}, {
    name: "巴西",
    code: "BR"
}, {
    name: "俄罗斯",
    code: "RU"
}, {
    name: "南非",
    code: "ZA"
}, {
    name: "埃及",
    code: "EG"
}, {
    name: "尼日利亚",
    code: "NG"
}, {
    name: "肯尼亚",
    code: "KE"
}, {
    name: "阿联酋",
    code: "AE"
}, {
    name: "沙特阿拉伯",
    code: "SA"
}, {
    name: "以色列",
    code: "IL"
}, {
    name: "乌克兰",
    code: "UA"
}, {
    name: "捷克",
    code: "CZ"
}, {
    name: "希腊",
    code: "GR"
}, {
    name: "葡萄牙",
    code: "PT"
}, {
    name: "爱尔兰",
    code: "IE"
}, {
    name: "比利时",
    code: "BE"
}, {
    name: "奥地利",
    code: "AT"
}, {
    name: "匈牙利",
    code: "HU"
}, {
    name: "罗马尼亚",
    code: "RO"
}, {
    name: "保加利亚",
    code: "BG"
}, {
    name: "克罗地亚",
    code: "HR"
}, {
    name: "斯洛伐克",
    code: "SK"
}, {
    name: "斯洛文尼亚",
    code: "SI"
}, {
    name: "立陶宛",
    code: "LT"
}, {
    name: "拉脱维亚",
    code: "LV"
}, {
    name: "爱沙尼亚",
    code: "EE"
}, {
    name: "冰岛",
    code: "IS"
}, {
    name: "卢森堡",
    code: "LU"
}, {
    name: "摩纳哥",
    code: "MC"
}, {
    name: "列支敦士登",
    code: "LI"
}, {
    name: "马耳他",
    code: "MT"
}, {
    name: "塞浦路斯",
    code: "CY"
}, {
    name: "新西兰",
    code: "NZ"
}, {
    name: "菲律宾",
    code: "PH"
}, {
    name: "印度尼西亚",
    code: "ID"
}, {
    name: "巴基斯坦",
    code: "PK"
}, {
    name: "孟加拉国",
    code: "BD"
}, {
    name: "斯里兰卡",
    code: "LK"
}, {
    name: "尼泊尔",
    code: "NP"
}, {
    name: "柬埔寨",
    code: "KH"
}, {
    name: "老挝",
    code: "LA"
}, {
    name: "缅甸",
    code: "MM"
}, {
    name: "蒙古",
    code: "MN"
}, {
    name: "哈萨克斯坦",
    code: "KZ"
}, {
    name: "乌兹别克斯坦",
    code: "UZ"
}, {
    name: "土库曼斯坦",
    code: "TM"
}, {
    name: "吉尔吉斯斯坦",
    code: "KG"
}, {
    name: "塔吉克斯坦",
    code: "TJ"
}, {
    name: "阿塞拜疆",
    code: "AZ"
}, {
    name: "格鲁吉亚",
    code: "GE"
}, {
    name: "亚美尼亚",
    code: "AM"
}, {
    name: "白俄罗斯",
    code: "BY"
}, {
    name: "摩尔多瓦",
    code: "MD"
}, {
    name: "塞尔维亚",
    code: "RS"
}, {
    name: "波黑",
    code: "BA"
}, {
    name: "北马其顿",
    code: "MK"
}, {
    name: "阿尔巴尼亚",
    code: "AL"
}, {
    name: "黑山",
    code: "ME"
}, {
    name: "摩洛哥",
    code: "MA"
}, {
    name: "阿尔及利亚",
    code: "DZ"
}, {
    name: "突尼斯",
    code: "TN"
}, {
    name: "利比亚",
    code: "LY"
}, {
    name: "苏丹",
    code: "SD"
}, {
    name: "埃塞俄比亚",
    code: "ET"
}, {
    name: "坦桑尼亚",
    code: "TZ"
}, {
    name: "乌干达",
    code: "UG"
}, {
    name: "卢旺达",
    code: "RW"
}, {
    name: "布隆迪",
    code: "BI"
}, {
    name: "刚果（金）",
    code: "CD"
}, {
    name: "刚果（布）",
    code: "CG"
}, {
    name: "加纳",
    code: "GH"
}, {
    name: "科特迪瓦",
    code: "CI"
}, {
    name: "塞内加尔",
    code: "SN"
}, {
    name: "喀麦隆",
    code: "CM"
}, {
    name: "安哥拉",
    code: "AO"
}, {
    name: "莫桑比克",
    code: "MZ"
}, {
    name: "赞比亚",
    code: "ZM"
}, {
    name: "津巴布韦",
    code: "ZW"
}, {
    name: "博茨瓦纳",
    code: "BW"
}, {
    name: "纳米比亚",
    code: "NA"
}, {
    name: "毛里求斯",
    code: "MU"
}, {
    name: "塞舌尔",
    code: "SC"
}, {
    name: "古巴",
    code: "CU"
}, {
    name: "牙买加",
    code: "JM"
}, {
    name: "巴哈马",
    code: "BS"
}, {
    name: "多米尼加",
    code: "DO"
}, {
    name: "海地",
    code: "HT"
}, {
    name: "危地马拉",
    code: "GT"
}, {
    name: "洪都拉斯",
    code: "HN"
}, {
    name: "萨尔瓦多",
    code: "SV"
}, {
    name: "尼加拉瓜",
    code: "NI"
}, {
    name: "哥斯达黎加",
    code: "CR"
}, {
    name: "巴拿马",
    code: "PA"
}, {
    name: "哥伦比亚",
    code: "CO"
}, {
    name: "委内瑞拉",
    code: "VE"
}, {
    name: "秘鲁",
    code: "PE"
}, {
    name: "智利",
    code: "CL"
}, {
    name: "乌拉圭",
    code: "UY"
}, {
    name: "巴拉圭",
    code: "PY"
}, {
    name: "玻利维亚",
    code: "BO"
}, {
    name: "厄瓜多尔",
    code: "EC"
}, {
    name: "圭亚那",
    code: "GY"
}, {
    name: "苏里南",
    code: "SR"
}, {
    name: "马尔代夫",
    code: "MV"
}, {
    name: "不丹",
    code: "BT"
}, {
    name: "文莱",
    code: "BN"
}, {
    name: "东帝汶",
    code: "TL"
}, {
    name: "斐济",
    code: "FJ"
}, {
    name: "巴布亚新几内亚",
    code: "PG"
}, {
    name: "所罗门群岛",
    code: "SB"
}, {
    name: "瓦努阿图",
    code: "VU"
}, {
    name: "萨摩亚",
    code: "WS"
}, {
    name: "汤加",
    code: "TO"
}, {
    name: "基里巴斯",
    code: "KI"
}, {
    name: "密克罗尼西亚",
    code: "FM"
}, {
    name: "帕劳",
    code: "PW"
}, {
    name: "马绍尔群岛",
    code: "MH"
}, {
    name: "瑙鲁",
    code: "NR"
}, {
    name: "图瓦卢",
    code: "TV"
}, {
    name: "库克群岛",
    code: "CK"
}, {
    name: "纽埃",
    code: "NU"
} ];

let editCountryCode = "CN";

let editCountryName = "中国大陆";

let editProfileTab = "profile";

function renderEditProfile() {
    return `<div class="page">\n        <div class="navbar"><div onclick="goPage('profile')" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div><h1 style="flex:1;text-align:center;">${editProfileTab === "profile" ? "编辑资料" : "安全设置"}</h1><div style="width:60px;"></div></div>\n        <div class="ep-tab-bar">\n          <div class="ep-tab ${editProfileTab === "profile" ? "ep-tab-active" : ""}" onclick="switchEditProfileTab('profile')">编辑资料</div>\n          <div class="ep-tab ${editProfileTab === "security" ? "ep-tab-active" : ""}" onclick="switchEditProfileTab('security')">安全设置</div>\n          <div class="ep-tab-indicator" style="transform:translateX(${editProfileTab === "security" ? "100%" : "0"});"></div>\n        </div>\n        ${editProfileTab === "profile" ? renderEditProfileContent() : renderEditSecurityContent()}\n      </div>`;
}

function switchEditProfileTab(tab) {
    editProfileTab = tab;
    if (tab === "profile") {
        currentPage = "editProfile";
    } else {
        currentPage = "securitySettings";
    }
    render();
    updateTabbar();
}

function renderEditProfileContent() {
    return `<div class="edit-profile-page">\n        <div class="ep-section ep-section-animate" style="animation-delay:0.02s;">\n          <div class="ep-avatar-card">\n            <div class="ep-avatar-wrap" onclick="document.getElementById('avatarInput').click()">\n              <img id="editAvatar" src="${DEFAULT_AVATAR}" class="ep-avatar-img">\n              <div class="ep-avatar-badge"><i class="fa-solid fa-camera"></i></div>\n            </div>\n            <input type="file" id="avatarInput" accept="image/*" style="display:none" onchange="uploadNewAvatar(this.files[0])">\n            <div class="ep-avatar-info">\n              <div class="ep-avatar-title">头像</div>\n              <div class="ep-avatar-hint">点击更换，支持 JPG、PNG</div>\n            </div>\n            <div class="ep-arrow"><i class="fa-solid fa-chevron-right"></i></div>\n          </div>\n        </div>\n        <div class="ep-section ep-section-animate" style="animation-delay:0.06s;">\n          <div class="ep-section-title">基本信息</div>\n          <div class="ep-item">\n            <div class="ep-item-label">昵称</div>\n            <div class="ep-item-value"><input id="editNickname" class="ep-input" placeholder="请输入昵称"></div>\n          </div>\n          <div class="ep-item">\n            <div class="ep-item-label">简介</div>\n            <div class="ep-item-value"><textarea id="editBio" class="ep-textarea" placeholder="介绍一下自己吧"></textarea></div>\n          </div>\n          <div class="ep-item">\n            <div class="ep-item-label">性别</div>\n            <div class="ep-item-value ep-select-wrap">\n              <select id="editGender" class="ep-select">\n                <option value="0">不公开</option>\n                <option value="1">男</option>\n                <option value="2">女</option>\n              </select>\n              <i class="fa-solid fa-chevron-down ep-select-arrow"></i>\n            </div>\n          </div>\n          <div class="ep-item">\n            <div class="ep-item-label">生日</div>\n            <div class="ep-item-value">\n              <div class="ep-birth-row">\n                <select id="editBirthYear" class="ep-birth-select"><option value="">年</option></select>\n                <span class="ep-birth-sep">/</span>\n                <select id="editBirthMonth" class="ep-birth-select"><option value="">月</option></select>\n                <span class="ep-birth-sep">/</span>\n                <select id="editBirthDay" class="ep-birth-select"><option value="">日</option></select>\n              </div>\n            </div>\n          </div>\n          <div class="ep-item ep-item-tappable" onclick="openCountryPicker()">\n            <div class="ep-item-label">国家/地区</div>\n            <div class="ep-item-value ep-item-value-arrow">\n              <span id="editCountryDisplay">中国大陆</span>\n              <i class="fa-solid fa-chevron-right ep-chevron"></i>\n            </div>\n          </div>\n        </div>\n        <div id="verifSettingsArea"></div>\n        <div class="ep-section ep-section-animate" style="animation-delay:0.08s;">\n          <div class="ep-item" onclick="goPage('verifSubscribe')" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;">\n            <div>\n              <div class="ep-item-label">订阅认证</div>\n              <div class="ep-item-desc">解锁进阶/高级认证专属特权</div>\n            </div>\n            <i class="fa-solid fa-chevron-right" style="color:#ccc;font-size:14px;"></i>\n          </div>\n        </div>\n        <div class="ep-section ep-section-animate" style="animation-delay:0.095s;">\n          <div class="ep-item ep-item-row" onclick="goPage('youthMode')" style="cursor:pointer;">\n            <div style="display:flex;align-items:center;gap:8px;"><i class="fa-solid fa-child" style="color:#3E993C;font-size:16px;"></i><span class="ep-item-label">青少年模式</span></div>\n            <div style="display:flex;align-items:center;gap:6px;"><span id="youthModeStatus" style="font-size:13px;color:#999;">未开启</span><i class="fa-solid fa-chevron-right" style="color:#ccc;font-size:14px;"></i></div>\n          </div>\n        </div>\n        <div class="ep-section ep-section-animate" style="animation-delay:0.10s;">\n          <div class="ep-section-title">隐私与沟通</div>\n          <div class="ep-item ep-item-row">\n            <div class="ep-item-left-col">\n              <div class="ep-item-label" style="color:#333;">允许陌生人私信</div>\n              <div class="ep-item-desc">开启后，陌生人可在你未关注时给你发消息</div>\n            </div>\n            <label class="switch"><input type="checkbox" id="editStrangerMsg"><span class="slider"></span></label>\n          </div>\n        </div>\n        <div class="ep-section ep-section-animate" style="animation-delay:0.14s;background:transparent;padding:4px 0;">\n          <button class="ep-save-btn" onclick="saveProfile()">保存修改</button>\n        </div>\n        <div class="country-picker-overlay" id="countryPickerOverlay" onclick="closeCountryPicker()">\n          <div class="country-picker-panel" onclick="event.stopPropagation()">\n            <div class="cp-header">\n              <div class="cp-title">选择国家/地区</div>\n              <div class="cp-close" onclick="closeCountryPicker()"><i class="fa-solid fa-xmark"></i></div>\n            </div>\n            <div class="cp-search-wrap">\n              <i class="fa-solid fa-magnifying-glass cp-search-icon"></i>\n              <input type="text" id="countrySearchInput" class="cp-search-input" placeholder="搜索国家或地区" oninput="filterCountries(this.value)">\n            </div>\n            <div id="countryList" class="cp-list"></div>\n          </div>\n        </div>\n      </div>`;
}

function applyFansListSwitchStyle(on) {
    const sw = document.getElementById("showFansListSwitch");
    if (sw) sw.checked = on;
}

function applyPrivateSwitchStyle(on) {
    const sw = document.getElementById("isPrivateSwitch");
    if (sw) sw.checked = on;
}

async function updatePrivateAccount(checked) {
    applyPrivateSwitchStyle(checked);
    try {
        const r = await api("/updatePrivate", "POST", {
            is_private: checked ? 1 : 0
        });
        if (r.code === 1) {
            showToast(checked ? "已开启私密账号" : "已关闭私密账号");
        } else {
            showToast(r.msg || "修改失败");
            const sw = document.getElementById("isPrivateSwitch");
            if (sw) {
                sw.checked = !checked;
                applyPrivateSwitchStyle(!checked);
            }
        }
    } catch (e) {
        showToast("修改失败");
        const sw = document.getElementById("isPrivateSwitch");
        if (sw) {
            sw.checked = !checked;
            applyPrivateSwitchStyle(!checked);
        }
    }
}

async function updateFansListVisible(checked) {
    applyFansListSwitchStyle(checked);
    try {
        const r = await api("/updateFansListVisible", "POST", {
            show_fans_list: checked ? 1 : 0
        });
        if (r.code === 1) {
            showToast(checked ? "已开启粉丝列表展示" : "已关闭粉丝列表展示");
        } else {
            showToast(r.msg || "修改失败");
            const sw = document.getElementById("showFansListSwitch");
            if (sw) {
                sw.checked = !checked;
                applyFansListSwitchStyle(!checked);
            }
        }
    } catch (e) {
        showToast("修改失败");
        const sw = document.getElementById("showFansListSwitch");
        if (sw) {
            sw.checked = !checked;
            applyFansListSwitchStyle(!checked);
        }
    }
}

function renderEditSecurityContent() {
    return `<div class="security-page">\n        <div class="sec-card sec-card-animate" style="animation-delay:0.02s;">\n          <div class="sec-card-title">账号安全</div>\n          <div class="sec-item" onclick="showChangePhoneModal()">\n            <div class="sec-item-icon sec-icon-phone"><i class="fa-solid fa-mobile-screen-button"></i></div>\n            <div class="sec-item-body">\n              <div class="sec-item-label">手机号</div>\n              <div class="sec-item-sub" id="secPhone">加载中...</div>\n            </div>\n            <div class="sec-item-action"><span class="sec-action-btn">修改</span><i class="fa-solid fa-chevron-right sec-chevron"></i></div>\n          </div>\n        </div>\n        <div class="sec-card sec-card-animate" style="animation-delay:0.06s;">\n          <div class="sec-card-title">隐私设置</div>\n          <div class="sec-item">\n            <div class="sec-item-icon sec-icon-lock"><i class="fa-solid fa-lock"></i></div>\n            <div class="sec-item-body">\n              <div class="sec-item-label">私密账号</div>\n              <div class="sec-item-desc">开启后，他人需通过你的关注申请才能查看你的帖子和表白墙</div>\n            </div>\n            <label class="switch switch-sm"><input type="checkbox" id="isPrivateSwitch" onchange="updatePrivateAccount(this.checked)"><span class="slider"></span></label>\n          </div>\n          <div class="sec-item" id="visibleWmItem" style="display:none;">\n            <div class="sec-item-icon"><i class="fa-solid fa-fingerprint"></i></div>\n            <div class="sec-item-body">\n              <div class="sec-item-label">满屏水印保护</div>\n              <div class="sec-item-desc">开启后，帖子详情页将显示满屏斜排水印，防止内容被盗用截图</div>\n            </div>\n            <label class="switch switch-sm"><input type="checkbox" id="visibleWmSwitch" onchange="toggleVisibleWatermark(this.checked)"><span class="slider"></span></label>\n          </div>\n          <div class="sec-item">\n            <div class="sec-item-icon sec-icon-fans"><i class="fa-solid fa-users"></i></div>\n            <div class="sec-item-body">\n              <div class="sec-item-label">展示粉丝列表</div>\n              <div class="sec-item-desc">关闭后，他人查看你的主页时将无法看到你的粉丝列表</div>\n            </div>\n            <label class="switch switch-sm"><input type="checkbox" id="showFansListSwitch" onchange="updateFansListVisible(this.checked)"><span class="slider"></span></label>\n          </div>\n        </div>\n        <div class="sec-card sec-card-animate" style="animation-delay:0.10s;">\n          <div class="sec-card-title">意见反馈</div>\n          <div class="sec-feedback-card">\n            <div class="sec-feedback-icon"><i class="fa-solid fa-comment-dots"></i></div>\n            <div class="sec-feedback-body">\n              <div class="sec-feedback-title">我们重视你的声音</div>\n              <div class="sec-feedback-desc">无论是功能建议还是问题反馈，都欢迎随时告诉我们</div>\n            </div>\n            <button class="sec-feedback-btn" onclick="openFeedbackModal()">立即反馈</button>\n          </div>\n        </div>\n        <div class="sec-card sec-card-danger sec-card-animate" style="animation-delay:0.14s;">\n          <div class="sec-item" onclick="confirmLogout()">\n            <div class="sec-item-icon sec-icon-logout"><i class="fa-solid fa-arrow-right-from-bracket"></i></div>\n            <div class="sec-item-body">\n              <div class="sec-item-label sec-label-danger">退出登录</div>\n              <div class="sec-item-desc">返回登录页面</div>\n            </div>\n            <i class="fa-solid fa-chevron-right sec-chevron"></i>\n          </div>\n          <div class="sec-item" onclick="showDeleteAccountModal()">\n            <div class="sec-item-icon sec-icon-delete"><i class="fa-solid fa-trash-can"></i></div>\n            <div class="sec-item-body">\n              <div class="sec-item-label sec-label-danger">注销账号</div>\n              <div class="sec-item-desc">删除所有数据，不可恢复</div>\n            </div>\n            <i class="fa-solid fa-chevron-right sec-chevron"></i>\n          </div>\n        </div>\n        ${renderChangePhoneModal()}\n        ${renderConfirmDeleteFirstModal()}\n        ${renderDeleteAccountModal()}\n        ${renderLogoutConfirmModal()}\n        ${renderFeedbackModal()}\n      </div>`;
}

function renderChangePhoneModal() {
    return `<div class="dialog-modal" id="changePhoneModal" onclick="event.target.id==='changePhoneModal' && event.target.classList.remove('active')">\n        <div class="dialog-modal-content" onclick="event.stopPropagation()">\n          <h3>修改手机号</h3>\n          <div class="form-group"><label>当前手机号</label><input type="text" id="curPhoneDisplay" readonly disabled style="background:#f5f5f5;"></div>\n          <div class="form-group"><label>验证码</label><div style="display:flex; gap:8px;"><input type="text" id="changePhoneCode" maxlength="6" placeholder="请输入验证码" style="flex:1;"><button class="btn btn-outline" id="getChangePhoneCodeBtn" onclick="sendChangePhoneCode()">获取验证码</button></div></div>\n          <div class="form-group"><label>新手机号</label><input type="tel" id="newPhone" maxlength="11" placeholder="请输入新手机号"></div>\n          <div class="btn-group"><button class="btn btn-outline" onclick="document.getElementById('changePhoneModal').classList.remove('active')">取消</button><button class="btn btn-primary" onclick="submitChangePhone()">保存</button></div>\n        </div>\n      </div>`;
}

function renderConfirmDeleteFirstModal() {
    return `<div class="dialog-modal" id="confirmDeleteFirstModal" onclick="event.target.id==='confirmDeleteFirstModal' && event.target.classList.remove('active')">\n        <div class="dialog-modal-content" onclick="event.stopPropagation()">\n          <h3 style="color:#e53935;">确认注销账号</h3>\n          <p>您确定要注销账号吗？此操作将会清除您所有的账号数据，且不可逆。请务必谨慎操作。</p>\n          <div class="btn-group">\n            <button class="btn btn-outline" onclick="document.getElementById('confirmDeleteFirstModal').classList.remove('active')">取消</button>\n            <button class="btn btn-danger" onclick="proceedToDeleteAccountModal()">确定注销</button>\n          </div>\n        </div>\n      </div>`;
}

function renderDeleteAccountModal() {
    const CONFIRM_TEXT = currentNickname === "管理员" ? "开发者测试" : "我已知晓我现在的行为，此操作将会删除我的所有账户数据，我愿意承担所有的责任";
    return `<div class="dialog-modal" id="deleteAccountModal" onclick="event.target.id==='deleteAccountModal' && event.target.classList.remove('active')">\n        <div class="dialog-modal-content" onclick="event.stopPropagation()">\n          <h3 style="color:#e53935;">注销账号</h3>\n          <div class="form-group">\n            <label>请逐字输入下方确认短语（禁止粘贴）</label>\n            <div class="confirm-phrase-box" oncontextmenu="return false;" onselectstart="return false;">${CONFIRM_TEXT}</div>\n            <input type="text" id="deleteAccountConfirm" placeholder="请在此输入上方短语" onpaste="return false;" ondrop="return false;" oncontextmenu="return false;" autocomplete="off">\n          </div>\n          <div class="form-group">\n            <label>手机验证码</label>\n            <div style="display:flex; gap:8px;">\n              <input type="text" id="deleteAccountCode" maxlength="6" placeholder="请输入验证码" style="flex:1;">\n              <button class="btn btn-outline" id="getDeleteCodeBtn" onclick="sendDeleteAccountCode()">获取验证码</button>\n            </div>\n          </div>\n          <div class="btn-group">\n            <button class="btn btn-outline" onclick="document.getElementById('deleteAccountModal').classList.remove('active')">取消</button>\n            <button class="btn btn-danger" onclick="submitDeleteAccount()">确认注销</button>\n          </div>\n        </div>\n      </div>`;
}

function renderLogoutConfirmModal() {
    return `<div class="dialog-modal" id="logoutConfirmModal" onclick="event.target.id==='logoutConfirmModal' && event.target.classList.remove('active')">\n        <div class="dialog-modal-content" onclick="event.stopPropagation()">\n          <h3>确认退出登录</h3>\n          <p>确定要退出登录吗？</p>\n          <div class="btn-group">\n            <button class="btn btn-outline" onclick="document.getElementById('logoutConfirmModal').classList.remove('active')">取消</button>\n            <button class="btn btn-primary" onclick="document.getElementById('logoutConfirmModal').classList.remove('active'); logout();">确定</button>\n          </div>\n        </div>\n      </div>`;
}

let feedbackFiles = [];

function renderFeedbackModal() {
    return `<div class="dialog-modal" id="feedbackModal" onclick="event.target.id==='feedbackModal' && event.target.classList.remove('active')">\n        <div class="dialog-modal-content" onclick="event.stopPropagation()">\n          <h3>提交反馈</h3>\n          <div class="form-group">\n            <textarea id="feedbackContent" rows="5" placeholder="请详细描述您的建议或遇到的问题..."></textarea>\n          </div>\n          <div class="feedback-upload-area" id="feedbackUploadArea">\n            <div class="feedback-upload-btn" onclick="document.getElementById('feedbackFileInput').click()">+</div>\n            <input type="file" id="feedbackFileInput" accept="image/*,video/*" multiple style="display:none;" onchange="handleFeedbackFileSelect(event)">\n          </div>\n          <div class="btn-group">\n            <button class="btn btn-outline" onclick="closeFeedbackModal()">取消</button>\n            <button class="btn btn-primary" onclick="submitFeedbackModal()">提交</button>\n          </div>\n        </div>\n      </div>`;
}

function openFeedbackModal() {
    feedbackFiles = [];
    const m = document.getElementById("feedbackModal");
    const ta = document.getElementById("feedbackContent");
    const area = document.getElementById("feedbackUploadArea");
    if (ta) ta.value = "";
    if (area) renderFeedbackUploadItems();
    if (m) m.classList.add("active");
}

function closeFeedbackModal() {
    document.getElementById("feedbackModal").classList.remove("active");
}

function handleFeedbackFileSelect(event) {
    const files = Array.from(event.target.files || []);
    const MAX_SIZE = 200 * 1024 * 1024;
    for (const f of files) {
        if (f.size > MAX_SIZE) {
            showToast(`文件 "${f.name}" 超过200MB，已拒绝上传`);
            continue;
        }
        if (feedbackFiles.length >= 9) {
            showToast("最多上传9个文件");
            break;
        }
        feedbackFiles.push(f);
    }
    event.target.value = "";
    renderFeedbackUploadItems();
}

function renderFeedbackUploadItems() {
    const area = document.getElementById("feedbackUploadArea");
    if (!area) return;
    let html = "";
    for (let i = 0; i < feedbackFiles.length; i++) {
        const f = feedbackFiles[i];
        const isImage = f.type.startsWith("image/");
        const url = URL.createObjectURL(f);
        html += `<div class="feedback-upload-item">\n          ${isImage ? `<img src="${url}" alt="">` : `<video src="${url}"></video><div class="play-icon"><i class="fa-solid fa-play"></i></div>`}\n          <div class="feedback-upload-remove" onclick="removeFeedbackFile(${i})">&times;</div>\n        </div>`;
    }
    if (feedbackFiles.length < 9) {
        html += `<div class="feedback-upload-btn" onclick="document.getElementById('feedbackFileInput').click()">+</div>`;
    }
    html += `<input type="file" id="feedbackFileInput" accept="image/*,video/*" multiple style="display:none;" onchange="handleFeedbackFileSelect(event)">`;
    area.innerHTML = html;
}

function removeFeedbackFile(index) {
    feedbackFiles.splice(index, 1);
    renderFeedbackUploadItems();
}

async function submitFeedbackModal() {
    const content = document.getElementById("feedbackContent").value.trim();
    if (!content) return showToast("请输入反馈内容");
    if (!currentUsername) {
        try {
            const r = await api("/userInfo", "POST");
            if (r.code === 1 && r.data && r.data.phone) currentUsername = r.data.phone;
        } catch (e) {}
    }
    if (!currentUsername) return showToast("请先登录");
    const submitBtn = event.target;
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "提交中...";
    try {
        const formData = new FormData;
        formData.append("username", currentUsername);
        formData.append("content", content);
        for (let i = 0; i < feedbackFiles.length; i++) {
            formData.append("file" + i, feedbackFiles[i]);
        }
        formData.append("fileCount", feedbackFiles.length);
        const res = await fetch(API_BASE + "/submitFeedback", {
            method: "POST",
            headers: {
                Authorization: "Bearer " + getToken()
            },
            body: formData
        }).then(r => r.json());
        if (res.code === 1) {
            showToast("感谢您的反馈！");
            closeFeedbackModal();
        } else {
            showToast(res.msg || "提交失败");
        }
    } catch (e) {
        showToast("提交失败");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

async function bindEditProfileEvents() {
    let tokenPhone = "";
    try {
        const t = getToken();
        if (t) {
            const decoded = atob(t.replace(/^admin_/, "").split(".")[0]);
            const parts = decoded.split(":");
            if (parts.length >= 2) tokenPhone = parts[1];
        }
    } catch (e) {}
    try {
        const res = await api("/userInfo", "POST");
        if (res.code === 1) {
            const u = res.data;
            const avatarEl = document.getElementById("editAvatar");
            const nicknameEl = document.getElementById("editNickname");
            const bioEl = document.getElementById("editBio");
            const genderEl = document.getElementById("editGender");
            if (avatarEl) avatarEl.src = resolveMediaUrl(u.avatar) || DEFAULT_AVATAR;
            if (nicknameEl) nicknameEl.value = u.nickname || "";
            if (bioEl) bioEl.value = u.bio || "";
            if (genderEl) genderEl.value = u.gender || "0";
            initBirthSelects(u.birthday || "");
            editCountryCode = u.country_code || "CN";
            editCountryName = u.country_name || "中国大陆";
            const countryDisplay = document.getElementById("editCountryDisplay");
            if (countryDisplay) countryDisplay.textContent = editCountryName;
            const strangerSwitch = document.getElementById("editStrangerMsg");
            if (strangerSwitch) {
                strangerSwitch.checked = !!u.allow_stranger_msg;
                strangerSwitch.onchange = async function() {
                    try {
                        const r = await api("/updateStrangerSetting", "POST", {
                            allow_stranger_msg: this.checked ? 1 : 0
                        });
                        if (r.code === 1) {
                            showToast(this.checked ? "已开启陌生人私信" : "已关闭陌生人私信");
                        } else {
                            showToast(r.msg || "修改失败");
                            this.checked = !this.checked;
                        }
                    } catch (e) {
                        showToast("修改失败");
                        this.checked = !this.checked;
                    }
                };
            }
            const phone = u.phone || tokenPhone || "";
            currentUsername = phone;
            const masked = phone ? phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2") : "未绑定";
            const secPhoneEl = document.getElementById("secPhone");
            const curPhoneDisplayEl = document.getElementById("curPhoneDisplay");
            if (secPhoneEl) secPhoneEl.textContent = masked;
            if (curPhoneDisplayEl) curPhoneDisplayEl.value = masked;
            const fansSwitch = document.getElementById("showFansListSwitch");
            if (fansSwitch) {
                const showFans = u.show_fans_list === undefined ? 1 : u.show_fans_list;
                fansSwitch.checked = !!showFans;
                applyFansListSwitchStyle(!!showFans);
            }
            const privateSwitch = document.getElementById("isPrivateSwitch");
            if (privateSwitch) {
                const isPrivate = u.is_private === 1;
                privateSwitch.checked = isPrivate;
                applyPrivateSwitchStyle(isPrivate);
            }
            const youthMode = u.youth_mode;
            const ymEl = document.getElementById("youthModeStatus");
            if (ymEl) ymEl.textContent = youthMode ? "已开启" : "未开启";
            const verifTypesRaw = u.verifications || [];
            const verifTypes = verifTypesRaw.map(v => typeof v === "string" ? v : v.type);
            if (verifTypes.length > 0) {
                const verifArea = document.getElementById("verifSettingsArea");
                if (verifArea) {
                    let settings = {};
                    try {
                        settings = u.verif_settings ? typeof u.verif_settings === "string" ? JSON.parse(u.verif_settings) : u.verif_settings : {};
                    } catch (e) {}
                    const nameDisplay = settings.name_display || "earliest";
                    const profileHidden = settings.profile_hidden && Array.isArray(settings.profile_hidden) ? settings.profile_hidden : [];
                    const verifConfigs = [ {
                        type: "personal",
                        label: "Beta版内测用户纪念认证"
                    }, {
                        type: "advanced",
                        label: "进阶认证用户"
                    }, {
                        type: "premium",
                        label: "高级认证用户"
                    }, {
                        type: "enterprise",
                        label: "企业/机构/团体认证"
                    }, {
                        type: "basic",
                        label: "普通认证用户"
                    } ];
                    const userVerifs = verifConfigs.filter(c => verifTypes.includes(c.type));
                    const sortedVerifs = [];
                    verifTypes.forEach(t => {
                        const found = userVerifs.find(c => c.type === t);
                        if (found) sortedVerifs.push(found);
                    });
                    const defaultMain = sortedVerifs.length ? sortedVerifs[0].type : "";
                    let html = '<div class="ep-section ep-section-animate" style="animation-delay:0.09s;"><div class="ep-section-title">认证设置</div>';
                    html += '<div class="ep-item"><div class="ep-item-label">主要认证</div><div class="ep-item-desc" style="margin-bottom:10px;">选中的认证将在名字旁边展示</div>';
                    html += '<div id="verifMainList" style="display:flex;flex-direction:column;gap:0;">';
                    sortedVerifs.forEach(c => {
                        const isSelected = nameDisplay === c.type;
                        const isDefault = nameDisplay === "earliest" && c.type === defaultMain;
                        const active = isSelected || isDefault;
                        html += '<div class="verif-radio-item' + (active ? " active" : "") + '" data-verif-type="' + c.type + '" onclick="selectVerifMain(this)">' + getVerifSvg(c.type, 16) + '<span style="flex:1;margin-left:8px;font-size:14px;">' + c.label + "</span>" + (active ? '<i class="fa-solid fa-circle-check" style="color:var(--color-primary);font-size:18px;"></i>' : '<i class="fa-regular fa-circle" style="color:#ccc;font-size:18px;"></i>') + "</div>";
                    });
                    html += "</div></div>";
                    html += '<div class="ep-item" style="margin-top:4px;"><div class="ep-item-label">主页展示认证</div><div class="ep-item-desc" style="margin-bottom:10px;">选中的认证将在个人主页中展示，可多选</div>';
                    html += '<div id="verifProfileList" style="display:flex;flex-direction:column;gap:0;">';
                    sortedVerifs.forEach(c => {
                        const checked = !profileHidden.includes(c.type);
                        html += '<div class="verif-check-item' + (checked ? " active" : "") + '" data-verif-type="' + c.type + '" onclick="toggleVerifProfile(this)">' + getVerifSvg(c.type, 16) + '<span style="flex:1;margin-left:8px;font-size:14px;">' + c.label + "</span>" + (checked ? '<i class="fa-solid fa-square-check" style="color:var(--color-primary);font-size:18px;"></i>' : '<i class="fa-regular fa-square" style="color:#ccc;font-size:18px;"></i>') + "</div>";
                    });
                    html += "</div></div>";
                    if (verifTypes.includes("premium")) {
                        const bubbles = [ {
                            v: "none",
                            label: "无气泡"
                        }, {
                            v: "gradient1",
                            label: "紫"
                        }, {
                            v: "gradient2",
                            label: "粉"
                        }, {
                            v: "gradient3",
                            label: "蓝"
                        }, {
                            v: "solid_pink",
                            label: "桃"
                        }, {
                            v: "solid_blue",
                            label: "海"
                        }, {
                            v: "solid_gold",
                            label: "金"
                        } ];
                        const curBubble = _NICK_BUBBLE_BG[settings.nick_bubble] ? settings.nick_bubble : "none";
                        const curColor = /^#[0-9a-fA-F]{6}$/.test(settings.nick_color || "") ? settings.nick_color : "";
                        html += '<div class="ep-item" style="margin-top:4px;"><div class="ep-item-label">昵称外观</div><div class="ep-item-desc" style="margin-bottom:10px;">高级认证专属：自定义昵称气泡与文字颜色</div>';
                        html += '<div id="nickBubbleList" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">';
                        bubbles.forEach(b => {
                            const active = curBubble === b.v;
                            const bg = _NICK_BUBBLE_BG[b.v] || "transparent";
                            const sw = b.v === "none" ? "background:transparent;border:1px solid #ccc;" : "background:" + bg + ";";
                            html += '<div class="verif-radio-item' + (active ? " active" : "") + '" data-bubble="' + b.v + '" onclick="selectNickBubble(this)" style="flex:0 0 auto;padding:6px 12px;border:1px solid ' + (active ? "var(--color-primary)" : "#3a3a3c") + ';border-radius:10px;font-size:13px;color:#fff;cursor:pointer;display:flex;align-items:center;gap:6px;"><span style="width:14px;height:14px;border-radius:50%;' + sw + '"></span>' + b.label + "</div>";
                        });
                        html += "</div>";
                        html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;"><span style="font-size:14px;color:#fff;">文字颜色</span><input type="color" id="nickColorInput" value="' + (curColor || "#ffffff") + '" style="width:48px;height:32px;border:none;background:none;cursor:pointer;padding:0;"><span id="nickColorLabel" style="font-size:12px;color:rgba(255,255,255,0.5);">' + (curColor || "默认") + "</span></div>";
                        html += '<div style="display:flex;gap:10px;"><button onclick="resetNickAppearance()" style="flex:1;padding:10px;border:1px solid #3a3a3c;border-radius:10px;background:transparent;color:#fff;font-size:14px;cursor:pointer;">重置默认</button><button id="saveNickAppBtn" onclick="saveNickAppearance()" style="flex:1;padding:10px;border:none;border-radius:10px;background:var(--color-primary);color:#fff;font-size:14px;font-weight:600;cursor:pointer;">保存外观</button></div>';
                        html += '<div id="nickPreviewWrap" style="margin-top:12px;padding:12px;background:rgba(255,255,255,0.04);border-radius:10px;"><span style="font-size:12px;color:rgba(255,255,255,0.5);">预览：</span><span id="nickPreview" class="post-nickname" style="display:inline-block;"></span></div>';
                        html += "</div>";
                    }
                    html += "</div>";
                    verifArea.innerHTML = html;
                    if (verifTypes.includes("premium")) {
                        const _nickName = escapeHtml(u.nickname || "用户" + (u.uid || ""));
                        const pv = document.getElementById("nickPreview");
                        if (pv) pv.setAttribute("data-nick", _nickName);
                        window._nickBubbleSel = settings.nick_bubble || "none";
                        window._nickColorSel = /^#[0-9a-fA-F]{6}$/.test(settings.nick_color || "") ? settings.nick_color : "";
                        _renderNickPreviewSafe();
                        const ci = document.getElementById("nickColorInput");
                        if (ci) ci.addEventListener("input", () => {
                            window._nickColorSel = ci.value;
                            const lbl = document.getElementById("nickColorLabel");
                            if (lbl) lbl.textContent = ci.value;
                            _renderNickPreviewSafe();
                        });
                    }
                    window._verifMainSelected = nameDisplay === "earliest" ? defaultMain : nameDisplay;
                }
            }
        } else {
            const phone = tokenPhone;
            currentUsername = phone;
            const masked = phone ? phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2") : "未登录";
            const secPhoneEl = document.getElementById("secPhone");
            const curPhoneDisplayEl = document.getElementById("curPhoneDisplay");
            if (secPhoneEl) secPhoneEl.textContent = masked;
            if (curPhoneDisplayEl) curPhoneDisplayEl.value = masked;
        }
    } catch (e) {
        const phone = tokenPhone;
        currentUsername = phone;
        const masked = phone ? phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2") : "加载失败";
        const secPhoneEl = document.getElementById("secPhone");
        const curPhoneDisplayEl = document.getElementById("curPhoneDisplay");
        if (secPhoneEl) secPhoneEl.textContent = masked;
        if (curPhoneDisplayEl) curPhoneDisplayEl.value = masked;
    }
    const confirmInput = document.getElementById("deleteAccountConfirm");
    if (confirmInput) {
        window.deleteAccountLastValid = "";
        confirmInput.addEventListener("input", function(e) {
            if (this.dataset.composing === "true") return;
            const val = this.value;
            if (val.length - window.deleteAccountLastValid.length > 1) {
                this.value = window.deleteAccountLastValid;
                showToast("禁止粘贴，请逐字输入");
            } else {
                window.deleteAccountLastValid = val;
            }
        });
        confirmInput.addEventListener("compositionstart", function() {
            this.dataset.composing = "true";
        });
        confirmInput.addEventListener("compositionend", function() {
            this.dataset.composing = "false";
            const event = new Event("input", {
                bubbles: true
            });
            this.dispatchEvent(event);
        });
    }
}

function initBirthSelects(birthday) {
    const yearSel = document.getElementById("editBirthYear");
    const monthSel = document.getElementById("editBirthMonth");
    const daySel = document.getElementById("editBirthDay");
    const currentYear = (new Date).getFullYear();
    for (let y = currentYear; y >= 1900; y--) {
        const opt = document.createElement("option");
        opt.value = y;
        opt.textContent = y;
        yearSel.appendChild(opt);
    }
    for (let m = 1; m <= 12; m++) {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = m + "月";
        monthSel.appendChild(opt);
    }
    function fillDays() {
        daySel.innerHTML = '<option value="">日</option>';
        const y = parseInt(yearSel.value);
        const m = parseInt(monthSel.value);
        if (!y || !m) return;
        const maxDay = new Date(y, m, 0).getDate();
        for (let d = 1; d <= maxDay; d++) {
            const opt = document.createElement("option");
            opt.value = d;
            opt.textContent = d + "日";
            daySel.appendChild(opt);
        }
    }
    yearSel.addEventListener("change", fillDays);
    monthSel.addEventListener("change", fillDays);
    if (birthday) {
        const clean = birthday.replace(/-/g, "/");
        if (/^\d{4}\/\d{2}\/\d{2}$/.test(clean)) {
            const parts = clean.split("/");
            yearSel.value = parts[0];
            monthSel.value = parseInt(parts[1]);
            fillDays();
            daySel.value = parseInt(parts[2]);
        }
    }
}

function openCountryPicker() {
    const overlay = document.getElementById("countryPickerOverlay");
    if (overlay) overlay.classList.add("active");
    renderCountryList("");
}

function closeCountryPicker() {
    const overlay = document.getElementById("countryPickerOverlay");
    if (overlay) overlay.classList.remove("active");
}

function filterCountries(keyword) {
    renderCountryList(keyword || "");
}

function renderCountryList(filter) {
    const listEl = document.getElementById("countryList");
    if (!listEl) return;
    const keyword = filter || "";
    listEl.innerHTML = ALL_COUNTRIES.filter(c => c.name.indexOf(keyword) !== -1).map(c => `\n        <div style="padding:12px 16px;cursor:pointer;font-size:15px;border-radius:8px;${c.code === editCountryCode ? "background:var(--color-primary-light);color:var(--color-primary);font-weight:600;" : ""}" onclick="selectCountry('${c.code}', '${c.name}')">${c.name}</div>\n      `).join("");
}

function selectCountry(code, name) {
    editCountryCode = code;
    editCountryName = name;
    document.getElementById("editCountryDisplay").textContent = name;
    closeCountryPicker();
}

async function uploadNewAvatar(file) {
    if (!file) return;
    const fd = new FormData;
    fd.append("avatar", file);
    try {
        const res = await apiForm("/uploadAvatar", fd);
        if (res.code === 1) {
            document.getElementById("editAvatar").src = resolveMediaUrl(res.data.avatar);
            showToast("头像上传成功");
        } else {
            handleActionError(res, "上传失败");
        }
    } catch (e) {
        showToast("上传失败");
    }
}

function selectVerifMain(el) {
    document.querySelectorAll(".verif-radio-item").forEach(item => {
        item.classList.remove("active");
        const icon = item.querySelector("i");
        if (icon) {
            icon.className = "fa-regular fa-circle";
            icon.style.color = "#ccc";
        }
    });
    el.classList.add("active");
    const icon = el.querySelector("i");
    if (icon) {
        icon.className = "fa-solid fa-circle-check";
        icon.style.color = "var(--color-primary)";
    }
    window._verifMainSelected = el.dataset.verifType;
}

function toggleVerifProfile(el) {
    el.classList.toggle("active");
    const icon = el.querySelector("i");
    if (el.classList.contains("active")) {
        if (icon) {
            icon.className = "fa-solid fa-square-check";
            icon.style.color = "var(--color-primary)";
        }
    } else {
        if (icon) {
            icon.className = "fa-regular fa-square";
            icon.style.color = "#ccc";
        }
    }
}

function selectNickBubble(el) {
    document.querySelectorAll("#nickBubbleList .verif-radio-item").forEach(o => {
        o.classList.remove("active");
        o.style.borderColor = "#3a3a3c";
    });
    el.classList.add("active");
    el.style.borderColor = "var(--color-primary)";
    window._nickBubbleSel = el.dataset.bubble;
    _renderNickPreviewSafe();
}

function _renderNickPreviewSafe() {
    const el = document.getElementById("nickPreview");
    if (!el) return;
    el.innerHTML = wrapNick(el.getAttribute("data-nick") || "", {
        verif_settings: {
            nick_bubble: window._nickBubbleSel || "none",
            nick_color: window._nickColorSel || ""
        }
    });
}

function resetNickAppearance() {
    window._nickBubbleSel = "none";
    window._nickColorSel = "";
    const ci = document.getElementById("nickColorInput");
    if (ci) ci.value = "#ffffff";
    const lbl = document.getElementById("nickColorLabel");
    if (lbl) lbl.textContent = "默认";
    document.querySelectorAll("#nickBubbleList .verif-radio-item").forEach(o => {
        const on = o.dataset.bubble === "none";
        o.classList.toggle("active", on);
        o.style.borderColor = on ? "var(--color-primary)" : "#3a3a3c";
    });
    _renderNickPreviewSafe();
    saveNickAppearance(true);
}

async function saveNickAppearance(isReset) {
    const btn = document.getElementById("saveNickAppBtn");
    if (btn) {
        btn.disabled = true;
        btn.textContent = "保存中...";
    }
    try {
        const r = await api("/updateNickAppearance", "POST", {
            nick_bubble: window._nickBubbleSel || "none",
            nick_color: window._nickColorSel || ""
        });
        showToast(r.msg || (isReset ? "已重置" : "已保存"));
        if (r.code === 1) {
            _reloadVerifSettingsIntoCache();
        }
    } catch (e) {
        showToast("网络异常");
    }
    if (btn) {
        btn.disabled = false;
        btn.textContent = "保存外观";
    }
}

function _reloadVerifSettingsIntoCache() {}

async function saveProfile() {
    const nickname = document.getElementById("editNickname").value.trim();
    const bio = document.getElementById("editBio").value.trim();
    const gender = document.getElementById("editGender").value;
    const y = document.getElementById("editBirthYear").value;
    const m = document.getElementById("editBirthMonth").value;
    const d = document.getElementById("editBirthDay").value;
    const birthday = y && m && d ? y + "/" + String(m).padStart(2, "0") + "/" + String(d).padStart(2, "0") : "";
    const mainType = window._verifMainSelected || "";
    const profileItems = document.querySelectorAll(".verif-check-item");
    let verif_settings = "";
    if (mainType || profileItems.length) {
        const profileHidden = [];
        profileItems.forEach(el => {
            if (!el.classList.contains("active")) profileHidden.push(el.dataset.verifType);
        });
        const _vsObj = {
            name_display: mainType || "earliest",
            profile_hidden: profileHidden
        };
        if (window._nickBubbleSel && window._nickBubbleSel !== "none") _vsObj.nick_bubble = window._nickBubbleSel;
        if (/^#[0-9a-fA-F]{6}$/.test(window._nickColorSel || "")) _vsObj.nick_color = window._nickColorSel;
        verif_settings = JSON.stringify(_vsObj);
    }
    try {
        const payload = {
            nickname: nickname,
            bio: bio,
            gender: gender,
            birthday: birthday,
            country_code: editCountryCode,
            country_name: editCountryName
        };
        if (verif_settings) payload.verif_settings = verif_settings;
        const res = await api("/updateProfile", "POST", payload);
        if (res.code === 1) {
            showToast("保存成功");
            goPage("profile");
        } else {
            showToast(res.msg || "保存失败");
        }
    } catch (e) {
        showToast("保存失败");
    }
}

function maskPhone(phone) {
    if (!phone || phone.length < 7) return "****";
    return phone = phone.replace(/^\+?(\d{3})\d{4}(\d{4})$/, "+86 $1****$2");
}

function renderSecuritySettings() {
    return `<div class="page">\n        <div class="navbar"><div onclick="goPage('profile')" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div><h1 style="flex:1;text-align:center;">账号与安全</h1><div style="width:60px;"></div></div>\n        <div class="security-page">\n          <div class="sec-card sec-card-animate" style="animation-delay:0.02s;">\n            <div class="sec-card-title">账号安全</div>\n            <div class="sec-item" onclick="showChangePhoneModal()">\n              <div class="sec-item-icon sec-icon-phone"><i class="fa-solid fa-mobile-screen-button"></i></div>\n              <div class="sec-item-body">\n                <div class="sec-item-label">手机号</div>\n                <div class="sec-item-sub" id="secPhone">加载中...</div>\n              </div>\n              <div class="sec-item-action"><span class="sec-action-btn">修改</span><i class="fa-solid fa-chevron-right sec-chevron"></i></div>\n            </div>\n          </div>\n          <div class="sec-card sec-card-animate" style="animation-delay:0.06s;">\n            <div class="sec-card-title">意见反馈</div>\n            <div class="sec-item" onclick="goPage('feedback')">\n              <div class="sec-item-icon sec-icon-feedback"><i class="fa-regular fa-comment-dots"></i></div>\n              <div class="sec-item-body">\n                <div class="sec-item-label">意见反馈</div>\n                <div class="sec-item-desc">帮助我们改进产品</div>\n              </div>\n              <i class="fa-solid fa-chevron-right sec-chevron"></i>\n            </div>\n          </div>\n          <div class="sec-card sec-card-danger sec-card-animate" style="animation-delay:0.10s;">\n            <div class="sec-item" onclick="confirmLogout()">\n              <div class="sec-item-icon sec-icon-logout"><i class="fa-solid fa-arrow-right-from-bracket"></i></div>\n              <div class="sec-item-body">\n                <div class="sec-item-label sec-label-danger">退出登录</div>\n              </div>\n              <i class="fa-solid fa-chevron-right sec-chevron"></i>\n            </div>\n          </div>\n          <div class="sec-card sec-card-animate" style="animation-delay:0.14s;padding:16px;">\n            <button class="sec-danger-full-btn" onclick="showDeleteAccountModal()"><i class="fa-solid fa-triangle-exclamation"></i> 注销账号</button>\n          </div>\n        </div>\n        ${renderChangePhoneModal()}\n        ${renderConfirmDeleteFirstModal()}\n        ${renderDeleteAccountModal()}\n        ${renderLogoutConfirmModal()}\n        ${renderFeedbackModal()}\n      </div>`;
}

async function bindSecuritySettingsEvents() {
    try {
        const res = await api("/userInfo", "POST");
        if (res.code === 1) {
            const phone = res.data.phone || "";
            const masked = maskPhone(phone);
            const p1 = document.getElementById("secPhone");
            const p2 = document.getElementById("curPhoneDisplay");
            if (p1) p1.textContent = masked;
            if (p2) p2.textContent = masked;
        }
    } catch (e) {}
}

let changePhoneCodeTimer = null;

let changePhoneCountdown = 0;

async function sendChangePhoneCode() {
    if (changePhoneCountdown > 0) return;
    if (!currentUsername) {
        try {
            const r = await api("/userInfo", "POST");
            if (r.code === 1 && r.data && r.data.phone) currentUsername = r.data.phone;
        } catch (e) {}
    }
    if (!currentUsername) return showToast("请先登录");
    const res = await openCaptchaForAction("changePhone", "/sendChangePhoneCode", {
        username: currentUsername
    });
    if (res && (res.code === 1 || res.Code === "Success")) {
        showToast("验证码已发送");
        changePhoneCountdown = 60;
        const btn = document.getElementById("getChangePhoneCodeBtn");
        if (btn) {
            btn.disabled = true;
            btn.style.opacity = "0.6";
            btn.textContent = changePhoneCountdown + "s后重新发送";
        }
        changePhoneCodeTimer = setInterval(() => {
            changePhoneCountdown--;
            if (changePhoneCountdown <= 0) {
                clearInterval(changePhoneCodeTimer);
                if (btn) {
                    btn.disabled = false;
                    btn.style.opacity = "1";
                    btn.textContent = "获取验证码";
                }
            } else {
                if (btn) btn.textContent = changePhoneCountdown + "s后重新发送";
            }
        }, 1e3);
    } else {
        showToast(res && (res.msg || res.Message) || "发送失败");
    }
}

function showChangePhoneModal() {
    const m = document.getElementById("changePhoneModal");
    if (m) m.classList.add("active");
}

function showDeleteAccountModal() {
    const m = document.getElementById("confirmDeleteFirstModal");
    if (m) m.classList.add("active");
}

function proceedToDeleteAccountModal() {
    document.getElementById("confirmDeleteFirstModal").classList.remove("active");
    document.getElementById("deleteAccountConfirm").value = "";
    window.deleteAccountLastValid = "";
    document.getElementById("deleteAccountCode").value = "";
    document.getElementById("deleteAccountModal").classList.add("active");
}

function closeChangePhoneModal() {
    const m = document.getElementById("changePhoneModal");
    if (m) m.classList.remove("active");
}

async function submitChangePhone() {
    const code = document.getElementById("changePhoneCode").value.trim();
    const newPhone = document.getElementById("newPhone").value.trim();
    if (!code) return showToast("请输入验证码");
    if (!/^1\d{10}$/.test(newPhone)) return showToast("请输入正确的手机号");
    try {
        const res = await api("/changePhone", "POST", {
            username: currentUsername,
            code: code,
            newPhone: newPhone
        });
        if (res.code === 1) {
            showToast("手机号已修改");
            if (res.data && res.data.token) setToken(res.data.token);
            currentUsername = newPhone;
            document.getElementById("changePhoneModal").classList.remove("active");
            setTimeout(() => {
                const secPhoneEl = document.getElementById("secPhone");
                const curPhoneDisplayEl = document.getElementById("curPhoneDisplay");
                const masked = newPhone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");
                if (secPhoneEl) secPhoneEl.textContent = masked;
                if (curPhoneDisplayEl) curPhoneDisplayEl.value = masked;
            }, 300);
        } else {
            showToast(res.msg || "修改失败");
        }
    } catch (e) {
        showToast("修改失败");
    }
}

let deleteAccountCodeTimer = null;

let deleteAccountCountdown = 0;

async function sendDeleteAccountCode() {
    if (deleteAccountCountdown > 0) return;
    const confirmText = document.getElementById("deleteAccountConfirm").value.trim();
    const requiredText = currentNickname === "管理员" ? "开发者测试" : "我已知晓我现在的行为，此操作将会删除我的所有账户数据，我愿意承担所有的责任";
    if (confirmText !== requiredText) {
        showToast("请先正确输入确认短语");
        return;
    }
    if (!currentUsername) {
        try {
            const r = await api("/userInfo", "POST");
            if (r.code === 1 && r.data && r.data.phone) currentUsername = r.data.phone;
        } catch (e) {}
    }
    if (!currentUsername) return showToast("请先登录");
    const res = await openCaptchaForAction("deleteAccount", "/sendDeleteAccountCode", {
        username: currentUsername
    });
    if (res && (res.code === 1 || res.Code === "Success")) {
        showToast("验证码已发送");
        deleteAccountCountdown = 60;
        const btn = document.getElementById("getDeleteCodeBtn");
        if (btn) {
            btn.disabled = true;
            btn.style.opacity = "0.6";
            btn.textContent = deleteAccountCountdown + "s后重新发送";
        }
        deleteAccountCodeTimer = setInterval(() => {
            deleteAccountCountdown--;
            if (deleteAccountCountdown <= 0) {
                clearInterval(deleteAccountCodeTimer);
                if (btn) {
                    btn.disabled = false;
                    btn.style.opacity = "1";
                    btn.textContent = "获取验证码";
                }
            } else {
                if (btn) btn.textContent = deleteAccountCountdown + "s后重新发送";
            }
        }, 1e3);
    } else {
        showToast(res && (res.msg || res.Message) || "发送失败");
    }
}

function closeDeleteAccountModal() {
    const m = document.getElementById("deleteAccountModal");
    if (m) m.classList.remove("active");
}

async function submitDeleteAccount() {
    const confirmText = document.getElementById("deleteAccountConfirm").value.trim();
    const requiredText = currentNickname === "管理员" ? "开发者测试" : "我已知晓我现在的行为，此操作将会删除我的所有账户数据，我愿意承担所有的责任";
    if (confirmText !== requiredText) return showToast("请逐字输入确认短语");
    const code = document.getElementById("deleteAccountCode").value.trim();
    if (!code) return showToast("请输入验证码");
    if (!currentUsername) {
        try {
            const r = await api("/userInfo", "POST");
            if (r.code === 1 && r.data && r.data.phone) currentUsername = r.data.phone;
        } catch (e) {}
    }
    try {
        const res = await api("/deleteAccount", "POST", {
            username: currentUsername,
            code: code
        });
        if (res.code === 1) {
            showToast("账号已注销");
            document.getElementById("deleteAccountModal").classList.remove("active");
            setTimeout(() => {
                localStorage.removeItem("zanhua_token");
                clearUserMediaCache();
                location.reload();
            }, 1500);
        } else {
            showToast(res.msg || "注销失败");
        }
    } catch (e) {
        showToast("注销失败");
    }
}

function confirmLogout() {
    const m = document.getElementById("logoutConfirmModal");
    if (m) m.classList.add("active");
}

function closeLogoutModal() {
    const m = document.getElementById("logoutConfirmModal");
    if (m) m.classList.remove("active");
}

function renderFeedback() {
    return `<div class="page">\n        <div class="navbar"><div onclick="goPage('securitySettings')" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div><h1 style="flex:1;text-align:center;">意见反馈</h1><div style="width:60px;"></div></div>\n        <div style="padding:16px;">\n          <div style="background:#fff;border-radius:12px;padding:16px;margin-bottom:16px;">\n            <div style="font-size:15px;font-weight:600;margin-bottom:10px;">我们重视你的声音</div>\n            <div style="font-size:13px;color:#999;line-height:1.6;">无论是功能建议还是问题反馈，都欢迎随时告诉我们</div>\n          </div>\n          <textarea id="feedbackContent" class="feedback-textarea" placeholder="请详细描述您的建议或遇到的问题..."></textarea>\n          <button class="feedback-submit-btn" onclick="submitFeedback()">提交反馈</button>\n        </div>\n      </div>`;
}

function bindFeedbackEvents() {
    const ta = document.getElementById("feedbackContent");
    if (ta) {
        ta.addEventListener("input", function() {
            if (this.value.length > 2e3) {
                this.value = this.value.slice(0, 2e3);
                showToast("反馈内容最多2000字");
            }
        });
    }
}

async function submitFeedback() {
    const content = document.getElementById("feedbackContent").value.trim();
    if (!content) return showToast("请输入反馈内容");
    if (!currentUsername) {
        try {
            const r = await api("/userInfo", "POST");
            if (r.code === 1 && r.data && r.data.phone) currentUsername = r.data.phone;
        } catch (e) {}
    }
    if (!currentUsername) return showToast("请先登录");
    try {
        const res = await api("/submitFeedback", "POST", {
            username: currentUsername,
            content: content
        });
        if (res.code === 1) {
            showToast("感谢您的反馈！");
            setTimeout(() => {
                goPage("securitySettings");
            }, 1e3);
        } else {
            showToast(res.msg || "提交失败");
        }
    } catch (e) {
        showToast("提交失败");
    }
}

function openCaptchaForAction(action, apiPath, extraData) {
    return new Promise(resolve => {
        let tempCaptchaIns = null;
        let resolved = false;
        const boxId = "tempCaptchaBox_" + Date.now();
        const captchaEl = document.createElement("div");
        captchaEl.id = boxId;
        captchaEl.style.display = "none";
        document.body.appendChild(captchaEl);
        const postData = Object.assign({}, extraData || {});
        function cleanup() {
            if (document.body.contains(captchaEl)) {
                try {
                    captchaEl.remove();
                } catch (e) {}
            }
        }
        function tryInit(sceneId) {
            if (typeof window.initAliyunCaptcha !== "function") {
                setTimeout(function() {
                    tryInit(sceneId);
                }, 200);
                return;
            }
            if (!sceneId) {
                if (!resolved) {
                    resolve(null);
                    resolved = true;
                }
                cleanup();
                return;
            }
            window.initAliyunCaptcha({
                SceneId: sceneId,
                mode: "popup",
                element: "#" + boxId,
                language: "cn",
                timeout: 1e4,
                getInstance: function(ins) {
                    tempCaptchaIns = ins;
                    if (ins && ins.show) ins.show();
                },
                captchaVerifyCallback: function(param) {
                    postData.captchaVerifyParam = param;
                    return fetch(API_BASE + apiPath, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: "Bearer " + getToken()
                        },
                        body: JSON.stringify(postData)
                    }).then(res => res.json()).then(data => {
                        const ok = data.code === 1 || data.Code === "Success";
                        if (ok) {
                            if (!resolved) {
                                resolve(data);
                                resolved = true;
                            }
                            setTimeout(cleanup, 300);
                            return {
                                captchaResult: true,
                                bizResult: true
                            };
                        } else {
                            showToast(data.msg || data.Message || "验证失败");
                            return {
                                captchaResult: false,
                                bizResult: false
                            };
                        }
                    }).catch(() => {
                        showToast("网络异常");
                        return {
                            captchaResult: false,
                            bizResult: false
                        };
                    });
                },
                onBizResultCallback: function(bizResult) {},
                closeCallback: function() {
                    if (!resolved) {
                        resolve(null);
                        resolved = true;
                    }
                    setTimeout(cleanup, 100);
                }
            });
        }
        Promise.all([ ensureCaptchaSdk(), getCaptchaSceneId() ]).then(function(results) {
            tryInit(results[1]);
        }).catch(function() {
            if (!resolved) {
                resolve(null);
                resolved = true;
            }
            cleanup();
        });
    });
}

async function checkAccountValid() {
    const token = getToken();
    if (!token) return;
    try {
        const res = await api("/userInfo", "POST");
        if (res.code !== 1) {
            localStorage.clear();
            goPage("home");
            showToast("登录状态已失效，请重新登录");
        } else {
            if (res.data) {
                myAvatar = res.data.avatar || "";
                currentNickname = res.data.nickname || "";
                myVerificationTypes = getVerificationTypes(res.data);
                myVerifications = Array.isArray(res.data.verifications) ? res.data.verifications : [];
            }
        }
    } catch (e) {
        localStorage.clear();
        goPage("home");
        showToast("登录状态已失效，请重新登录");
    }
}

let followListUid = "";

let followListSelected = new Set;

let fansListUid = "";

function goFollowList(uid) {
    if (!requireLogin()) return;
    followListUid = uid;
    followListSelected = new Set;
    goPage("followListPage");
}

function goFansList(uid) {
    if (!requireLogin()) return;
    fansListUid = uid;
    goPage("fansListPage");
}

function renderFollowListPage() {
    return `<div class="page" style="background:#fff;min-height:100vh;">\n        <div class="navbar" style="position:sticky;top:0;z-index:100;background:#fff;">\n          <div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div>\n          <h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">关注列表</h1>\n          <div id="followBatchEntry" style="width:60px;text-align:center;font-size:14px;color:var(--color-primary);cursor:pointer;display:none;" onclick="toggleFollowBatchMode()">管理</div>\n        </div>\n        <div id="followListContent" style="padding-top:calc(50px + env(safe-area-inset-top));"><div class="loading" style="text-align:center;padding:40px;">加载中...</div></div>\n        <div id="followBatchBar" style="display:none;position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:0.5px solid #eee;padding:12px 16px calc(12px + env(safe-area-inset-bottom));align-items:center;gap:12px;z-index:200;">\n          <label style="display:flex;align-items:center;gap:6px;font-size:14px;cursor:pointer;">\n            <input type="checkbox" id="followSelectAll" onchange="toggleFollowSelectAll(this.checked)" style="width:18px;height:18px;">\n            <span>全选</span>\n          </label>\n          <button id="batchUnfollowBtn" onclick="confirmBatchUnfollow()" style="margin-left:auto;padding:8px 24px;background:#ff2442;color:#fff;border:none;border-radius:20px;font-size:14px;font-weight:500;cursor:pointer;opacity:0.5;pointer-events:none;">取消关注</button>\n        </div>\n      </div>`;
}

async function bindFollowListPageEvents() {
    try {
        const res = await api("/followList?uid=" + followListUid);
        const content = document.getElementById("followListContent");
        if (res.code !== 1) {
            content.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#999;">加载失败：' + (res.msg || "未知错误") + "</div>";
            return;
        }
        const list = res.data || [];
        const isMine = followListUid === getUid();
        if (list.length === 0) {
            content.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#999;">还没有关注任何人</div>';
            return;
        }
        window._followListData = list;
        renderFollowListItems(list, isMine);
        const entry = document.getElementById("followBatchEntry");
        if (isMine && entry) entry.style.display = "block";
    } catch (e) {
        console.error("followList error:", e);
        console.error("error stack:", e.stack);
        const content = document.getElementById("followListContent");
        if (content) {
            content.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#999;">加载失败：' + (e.message || "网络异常") + "</div>";
        }
    }
}

function renderFollowListItems(list, isMine) {
    const isBatch = document.getElementById("followBatchBar").style.display === "flex";
    const content = document.getElementById("followListContent");
    content.innerHTML = list.map(u => {
        const checked = followListSelected.has(u.uid);
        return `<div style="display:flex;align-items:center;padding:12px 16px;border-bottom:0.5px solid #f0f0f0;${isBatch ? "cursor:pointer;" : ""}" ${isBatch ? `onclick="toggleFollowSelect('${u.uid}')"` : ""}>\n          ${isBatch ? `<div style="width:24px;height:24px;border:2px solid ${checked ? "var(--color-primary)" : "#ccc"};border-radius:50%;margin-right:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${checked ? '<i class="fa-solid fa-check" style="color:var(--color-primary);font-size:12px;"></i>' : ""}</div>` : ""}\n          <img src="${resolveMediaUrl(u.avatar) || DEFAULT_AVATAR}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">\n          <div style="flex:1;margin-left:12px;overflow:hidden;">\n            <div style="font-size:15px;font-weight:500;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(u.nickname || "用户" + u.uid)}</div>\n          </div>\n          ${isMine && !isBatch ? `<button onclick="event.stopPropagation();goUserProfile('${u.uid}')" style="padding:6px 14px;background:#f5f5f5;color:#333;border:none;border-radius:14px;font-size:13px;cursor:pointer;">主页</button>` : ""}\n        </div>`;
    }).join("");
    updateBatchBtn();
}

function toggleFollowBatchMode() {
    const bar = document.getElementById("followBatchBar");
    const entry = document.getElementById("followBatchEntry");
    const isOn = bar.style.display === "flex";
    if (isOn) {
        bar.style.display = "none";
        entry.textContent = "管理";
        followListSelected = new Set;
    } else {
        bar.style.display = "flex";
        entry.textContent = "完成";
    }
    renderFollowListItems(window._followListData || [], true);
}

function toggleFollowSelect(uid) {
    if (followListSelected.has(uid)) followListSelected.delete(uid); else followListSelected.add(uid);
    renderFollowListItems(window._followListData || [], true);
    const allSelected = (window._followListData || []).length > 0 && (window._followListData || []).every(u => followListSelected.has(u.uid));
    const selectAll = document.getElementById("followSelectAll");
    if (selectAll) selectAll.checked = allSelected;
}

function toggleFollowSelectAll(checked) {
    const list = window._followListData || [];
    if (checked) list.forEach(u => followListSelected.add(u.uid)); else followListSelected.clear();
    renderFollowListItems(list, true);
}

function updateBatchBtn() {
    const btn = document.getElementById("batchUnfollowBtn");
    if (!btn) return;
    const count = followListSelected.size;
    btn.textContent = count > 0 ? `取消关注(${count})` : "取消关注";
    btn.style.opacity = count > 0 ? "1" : "0.5";
    btn.style.pointerEvents = count > 0 ? "auto" : "none";
}

function confirmBatchUnfollow() {
    const count = followListSelected.size;
    if (count === 0) return;
    const existing = document.getElementById("batchUnfollowConfirm");
    if (existing) existing.remove();
    const overlay = document.createElement("div");
    overlay.id = "batchUnfollowConfirm";
    overlay.className = "dialog-modal active";
    overlay.onclick = e => {
        if (e.target === overlay) overlay.remove();
    };
    overlay.innerHTML = `<div class="dialog-modal-content" onclick="event.stopPropagation()" style="max-width:320px;">\n        <h3 style="text-align:center;font-size:16px;">取消关注</h3>\n        <p style="text-align:center;font-size:14px;color:#666;margin:12px 0 20px;">确定取消关注选中的 ${count} 个用户？</p>\n        <div style="display:flex;gap:10px;">\n          <button onclick="document.getElementById('batchUnfollowConfirm').remove()" style="flex:1;height:44px;background:#f5f5f5;border:none;border-radius:12px;font-weight:500;cursor:pointer;">取消</button>\n          <button id="batchUnfollowOkBtn" style="flex:1;height:44px;background:#ff2442;color:#fff;border:none;border-radius:12px;font-weight:500;cursor:pointer;">确定</button>\n        </div>\n      </div>`;
    document.body.appendChild(overlay);
    document.getElementById("batchUnfollowOkBtn").onclick = async () => {
        overlay.remove();
        try {
            const res = await api("/batchUnfollow", "POST", {
                uids: Array.from(followListSelected)
            });
            if (res.code === 1) {
                showToast("已取消关注");
                window._followListData = (window._followListData || []).filter(u => !followListSelected.has(u.uid));
                followListSelected = new Set;
                const selectAll = document.getElementById("followSelectAll");
                if (selectAll) selectAll.checked = false;
                renderFollowListItems(window._followListData, true);
            } else {
                showToast(res.msg || "操作失败");
            }
        } catch (e) {
            showToast("网络异常");
        }
    };
}

function renderFansListPage() {
    return `<div class="page" style="background:#fff;min-height:100vh;">\n        <div class="navbar" style="position:sticky;top:0;z-index:100;background:#fff;">\n          <div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div>\n          <h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">粉丝列表</h1>\n          <div style="width:60px;"></div>\n        </div>\n        <div id="fansListContent" style="padding-top:calc(50px + env(safe-area-inset-top));"><div class="loading" style="text-align:center;padding:40px;">加载中...</div></div>\n      </div>`;
}

async function bindFansListPageEvents() {
    try {
        const res = await api("/fansList?uid=" + fansListUid);
        const content = document.getElementById("fansListContent");
        if (res.code !== 1) {
            if (res.hidden) {
                content.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#999;"><i class="fa-solid fa-lock" style="font-size:36px;margin-bottom:12px;display:block;"></i>' + (res.msg || "对方暂未开放展示粉丝列表") + "</div>";
            } else {
                content.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#999;">' + (res.msg || "加载失败") + "</div>";
            }
            return;
        }
        const list = res.data || [];
        if (list.length === 0) {
            content.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#999;">还没有粉丝</div>';
            return;
        }
        content.innerHTML = list.map(u => `<div style="display:flex;align-items:center;padding:12px 16px;border-bottom:0.5px solid #f0f0f0;cursor:pointer;" onclick="goUserProfile('${u.uid}')">\n            <img src="${resolveMediaUrl(u.avatar) || DEFAULT_AVATAR}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">\n            <div style="flex:1;margin-left:12px;overflow:hidden;">\n              <div style="font-size:15px;font-weight:500;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(u.nickname || "用户" + u.uid)}</div>\n            </div>\n            <button onclick="event.stopPropagation();goUserProfile('${u.uid}')" style="padding:6px 14px;background:#f5f5f5;color:#333;border:none;border-radius:14px;font-size:13px;cursor:pointer;">主页</button>\n          </div>`).join("");
    } catch (e) {
        console.error("fansList error:", e);
        document.getElementById("fansListContent").innerHTML = '<div style="text-align:center;padding:60px 20px;color:#999;">加载失败：' + (e.message || "网络异常") + "</div>";
    }
}

function renderRealnameVerify() {
    return `<div class="page" style="background:#000;min-height:100vh;">\n        <div class="navbar" style="background:#000;border-bottom:0.5px solid rgba(255,255,255,0.08);"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;color:#fff;"></i></div><h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;color:#fff;">实名认证</h1><div style="width:40px;"></div></div>\n        <div style="padding:24px 20px;">\n          <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">${getVerifSvg("basic", 28)}<div><div style="font-size:20px;font-weight:700;color:#fff;">普通认证</div><div style="font-size:13px;color:#8E8E93;margin-top:2px;">通过实名认证即可获得认证标识</div></div></div>\n          <div style="background:#1C1C1E;border-radius:12px;padding:4px 16px;">\n            <div style="padding:14px 0;border-bottom:0.5px solid rgba(255,255,255,0.06);">\n              <div style="font-size:13px;color:#8E8E93;margin-bottom:8px;">真实姓名</div>\n              <input id="rvName" type="text" placeholder="请输入真实姓名" style="width:100%;background:transparent;border:none;outline:none;font-size:16px;color:#fff;" maxlength="20">\n            </div>\n            <div style="padding:14px 0;">\n              <div style="font-size:13px;color:#8E8E93;margin-bottom:8px;">身份证号码</div>\n              <input id="rvIdcard" type="text" placeholder="请输入18位身份证号码" maxlength="18" style="width:100%;background:transparent;border:none;outline:none;font-size:16px;color:#fff;letter-spacing:1px;">\n            </div>\n          </div>\n          <div style="margin-top:16px;padding:14px 16px;background:#1C1C1E;border-radius:12px;">\n            <div style="font-size:12px;color:#8E8E93;line-height:1.8;">\n              <i class="fa-solid fa-shield-halved" style="color:#3E993C;margin-right:4px;"></i>您的个人信息将被严格加密存储，仅用于身份核验。我们严格遵循《中华人民共和国个人信息保护法》及相关法律法规，不会将您的信息用于任何其他用途或向第三方泄露。\n            </div>\n          </div>\n          <button id="rvSubmitBtn" style="width:100%;margin-top:24px;padding:14px;border:none;border-radius:12px;background:#3E993C;color:#fff;font-size:16px;font-weight:700;cursor:pointer;">提交认证</button>\n        </div>\n      </div>`;
}

function bindRealnameVerifyEvents() {
    document.getElementById("rvSubmitBtn").onclick = async () => {
        const name = document.getElementById("rvName").value.trim();
        const idcard = document.getElementById("rvIdcard").value.trim();
        if (!name) {
            showToast("请输入真实姓名");
            return;
        }
        if (!idcard || idcard.length !== 18) {
            showToast("请输入18位身份证号码");
            return;
        }
        const btn = document.getElementById("rvSubmitBtn");
        btn.textContent = "提交中...";
        btn.style.opacity = "0.6";
        btn.disabled = true;
        try {
            const r = await api("/realnameVerify", "POST", {
                name: name,
                idcard: idcard
            });
            if (r.code === 1) {
                window._rvName = name;
                window._rvIdcard = idcard;
                if (r.data.is_minor) {
                    pageHistory.push(currentPage);
                    prevPage = currentPage;
                    currentPage = "parentConsent";
                    setTabbarVisible(false);
                    render();
                } else {
                    showToast("认证成功");
                    setTimeout(() => goBack(), 800);
                }
            } else {
                showToast(r.msg || "认证失败");
            }
        } catch (e) {
            showToast("网络异常");
        }
        btn.textContent = "提交认证";
        btn.style.opacity = "1";
        btn.disabled = false;
    };
}

function renderParentConsent() {
    return `<div class="page" style="background:#000;min-height:100vh;">\n        <div class="navbar" style="background:#000;border-bottom:0.5px solid rgba(255,255,255,0.08);"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;color:#fff;"></i></div><h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;color:#fff;">家长同意书</h1><div style="width:40px;"></div></div>\n        <div style="padding:24px 20px;">\n          <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;"><div style="width:48px;height:48px;border-radius:12px;background:rgba(62,153,60,0.15);display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-child" style="font-size:24px;color:#3E993C;"></i></div><div><div style="font-size:18px;font-weight:700;color:#fff;">未成年人保护</div><div style="font-size:13px;color:#8E8E93;margin-top:2px;">检测到您是未成年人，需家长确认</div></div></div>\n          <div style="background:#1C1C1E;border-radius:12px;padding:20px;margin-bottom:16px;">\n            <div style="font-size:15px;font-weight:600;color:#fff;margin-bottom:12px;">家长/监护人同意书</div>\n            <div style="font-size:13px;color:rgba(255,255,255,0.65);line-height:1.9;">\n              <p style="margin-bottom:10px;">根据《中华人民共和国未成年人保护法》及相关法规，未成年人使用网络服务需取得家长或监护人的同意。</p>\n              <p style="margin-bottom:10px;">本平台将自动开启<strong style="color:#fff;">青少年模式</strong>，在该模式下：</p>\n              <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:12px;margin:10px 0;">\n                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><i class="fa-solid fa-check" style="color:#3E993C;font-size:12px;"></i><span style="color:rgba(255,255,255,0.75);">内容安全过滤，屏蔽不适宜内容</span></div>\n                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><i class="fa-solid fa-check" style="color:#3E993C;font-size:12px;"></i><span style="color:rgba(255,255,255,0.75);">限制使用时长，保护视力健康</span></div>\n                <div style="display:flex;align-items:center;gap:8px;"><i class="fa-solid fa-check" style="color:#3E993C;font-size:12px;"></i><span style="color:rgba(255,255,255,0.75);">禁止充值打赏等消费行为</span></div>\n              </div>\n              <p>请家长/监护人仔细阅读后，点击下方按钮表示同意。</p>\n            </div>\n          </div>\n          <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:20px;padding:0 4px;">\n            <input type="checkbox" id="parentAgree" style="margin-top:3px;flex-shrink:0;width:18px;height:18px;accent-color:#3E993C;">\n            <span style="flex:1;font-size:12px;color:#8E8E93;line-height:1.7;">我已阅读并同意<span onclick="navigateTo('minorPrivacy')" style="color:var(--color-primary);cursor:pointer;">《赞话未成年人（含儿童）隐私政策》</span>，确认本人为该用户的家长/法定监护人，同意其使用赞话平台服务。</span>\n          </div>\n          <button id="pcSubmitBtn" style="width:100%;padding:14px;border:none;border-radius:12px;background:#3E993C;color:#fff;font-size:16px;font-weight:700;cursor:pointer;">我已阅读并同意，确认提交</button>\n          <div style="text-align:center;margin-top:12px;font-size:12px;color:rgba(255,255,255,0.25);">您也可以在设置中随时关闭青少年模式</div>\n        </div>\n      </div>`;
}

function bindParentConsentEvents() {
    document.getElementById("pcSubmitBtn").onclick = async () => {
        if (!document.getElementById("parentAgree").checked) {
            showToast("请先阅读并同意协议");
            return;
        }
        const btn = document.getElementById("pcSubmitBtn");
        btn.textContent = "提交中...";
        btn.style.opacity = "0.6";
        btn.disabled = true;
        try {
            const r = await api("/parentConsent", "POST", {
                name: window._rvName || "",
                idcard: window._rvIdcard || ""
            });
            if (r.code === 1) {
                showToast("认证成功，已开启青少年模式");
                setTimeout(() => {
                    goBack();
                    goBack();
                }, 1e3);
            } else {
                showToast(r.msg || "提交失败");
            }
        } catch (e) {
            showToast("网络异常");
        }
        btn.textContent = "我已阅读并同意，确认提交";
        btn.style.opacity = "1";
        btn.disabled = false;
    };
}

function renderEnterpriseApply() {
    const entVerif = myVerifications.find(v => (typeof v === "string" ? v : v.type) === "enterprise");
    if (entVerif) {
        const orgName = typeof entVerif === "object" && entVerif.org_name ? entVerif.org_name : "已认证企业";
        return `<div class="page" style="background:#000;min-height:100vh;">\n        <div class="navbar" style="background:#000;border-bottom:0.5px solid rgba(255,255,255,0.08);"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;color:#fff;"></i></div><h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;color:#fff;">企业/机构/团体认证</h1><div style="width:40px;"></div></div>\n        <div style="padding:24px 20px;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;">\n          <div style="width:72px;height:72px;border-radius:50%;background:rgba(29,155,240,0.12);display:flex;align-items:center;justify-content:center;margin-bottom:20px;">${getVerifSvg("enterprise", 40)}</div>\n          <div style="font-size:20px;font-weight:700;color:#fff;margin-bottom:8px;">已认证</div>\n          <div style="font-size:15px;color:#8E8E93;margin-bottom:6px;">${orgName}</div>\n          <div style="font-size:13px;color:rgba(255,255,255,0.3);">企业/机构/团体认证已通过</div>\n        </div>\n      </div>`;
    }
    return `<div class="page" style="background:#000;min-height:100vh;">\n        <div class="navbar" style="background:#000;border-bottom:0.5px solid rgba(255,255,255,0.08);"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;color:#fff;"></i></div><h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;color:#fff;">企业/机构/团体认证</h1><div style="width:40px;"></div></div>\n        <div style="padding:24px 20px;">\n          <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">${getVerifSvg("enterprise", 28)}<div><div style="font-size:20px;font-weight:700;color:#fff;">企业/机构/团体认证</div><div id="eaPriceHint" style="font-size:13px;color:#8E8E93;margin-top:2px;">¥249/年 · 审核3-5个工作日</div></div></div>\n          <div style="font-size:15px;font-weight:600;color:#fff;margin-bottom:12px;">主体类型</div>\n          <div style="background:#1C1C1E;border-radius:12px;padding:4px 16px;margin-bottom:20px;">\n            <label class="ea-type-row" onclick="selectEntType('commercial')"><div style="display:flex;align-items:center;gap:10px;"><i class="fa-regular fa-circle" id="eaTypeCommercialIcon" style="font-size:18px;color:rgba(255,255,255,0.4);"></i><span style="color:#fff;font-size:15px;">营利性组织</span></div><span style="color:rgba(255,255,255,0.4);font-size:13px;">企业、公司等商业实体</span></label>\n            <div style="height:0.5px;background:rgba(255,255,255,0.06);"></div>\n            <label class="ea-type-row" onclick="selectEntType('government')"><div style="display:flex;align-items:center;gap:10px;"><i class="fa-regular fa-circle" id="eaTypeGovernmentIcon" style="font-size:18px;color:rgba(255,255,255,0.4);"></i><span style="color:#fff;font-size:15px;">党政机关/事业单位</span></div><span style="color:rgba(255,255,255,0.4);font-size:13px;">政府机关、事业单位、群体组织</span></label>\n            <div style="height:0.5px;background:rgba(255,255,255,0.06);"></div>\n            <label class="ea-type-row" onclick="selectEntType('ngo')"><div style="display:flex;align-items:center;gap:10px;"><i class="fa-regular fa-circle" id="eaTypeNgoIcon" style="font-size:18px;color:rgba(255,255,255,0.4);"></i><span style="color:#fff;font-size:15px;">民间非营利组织</span></div><span style="color:rgba(255,255,255,0.4);font-size:13px;">社会团体、基金会、民办非企业</span></label>\n            <div style="height:0.5px;background:rgba(255,255,255,0.06);"></div>\n            <label class="ea-type-row" onclick="selectEntType('education')"><div style="display:flex;align-items:center;gap:10px;"><i class="fa-regular fa-circle" id="eaTypeEducationIcon" style="font-size:18px;color:rgba(255,255,255,0.4);"></i><span style="color:#fff;font-size:15px;">教育机构</span></div><span style="color:rgba(255,255,255,0.4);font-size:13px;">学校、培训机构等教育单位</span></label>\n          </div>\n          <div id="eaFormFields">\n            <div style="font-size:15px;font-weight:600;color:#fff;margin-bottom:12px;">主体信息</div>\n            <div style="background:#1C1C1E;border-radius:12px;padding:4px 16px;margin-bottom:16px;">\n              <div style="padding:14px 0;border-bottom:0.5px solid rgba(255,255,255,0.06);">\n                <div style="font-size:13px;color:#8E8E93;margin-bottom:8px;">主体全称</div>\n                <input id="eaFullName" type="text" placeholder="请输入主体全称" style="width:100%;background:transparent;border:none;outline:none;font-size:16px;color:#fff;">\n              </div>\n              <div style="padding:14px 0;border-bottom:0.5px solid rgba(255,255,255,0.06);">\n                <div style="font-size:13px;color:#8E8E93;margin-bottom:8px;">统一社会信用代码</div>\n                <input id="eaCreditCode" type="text" placeholder="请输入18位统一社会信用代码" maxlength="18" style="width:100%;background:transparent;border:none;outline:none;font-size:16px;color:#fff;letter-spacing:1px;">\n              </div>\n              <div id="eaDunsRow" style="padding:14px 0;border-bottom:0.5px solid rgba(255,255,255,0.06);display:none;">\n                <div style="font-size:13px;color:#8E8E93;margin-bottom:8px;">D-U-N-S®编号（9位）</div>\n                <input id="eaDuns" type="text" placeholder="请输入9位邓白氏编号" maxlength="9" style="width:100%;background:transparent;border:none;outline:none;font-size:16px;color:#fff;">\n              </div>\n              <div style="padding:14px 0;">\n                <div style="font-size:13px;color:#8E8E93;margin-bottom:8px;">运营联系人姓名</div>\n                <input id="eaContactName" type="text" placeholder="请输入联系人姓名" style="width:100%;background:transparent;border:none;outline:none;font-size:16px;color:#fff;">\n              </div>\n            </div>\n            <div id="eaUploadSection" style="display:none;">\n              <div style="font-size:15px;font-weight:600;color:#fff;margin-bottom:12px;">资质文件</div>\n              <div style="background:#1C1C1E;border-radius:12px;padding:16px;margin-bottom:16px;">\n                <div style="font-size:13px;color:rgba(255,255,255,0.4);line-height:1.6;" id="eaFileHint">请根据选择的主体类型上传对应材料</div>\n                <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px;" id="eaFileList"></div>\n                <label style="display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:8px 16px;border-radius:8px;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.7);font-size:13px;cursor:pointer;"><i class="fa-solid fa-plus"></i>上传文件<input type="file" multiple accept="image/*,.pdf" style="display:none;" onchange="uploadEntFiles(this)"></label>\n              </div>\n            </div>\n          </div>\n          <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:20px;padding:0 4px;">\n            <input type="checkbox" id="eaAgree" style="margin-top:3px;flex-shrink:0;width:18px;height:18px;accent-color:#1D9BF0;">\n            <span style="font-size:12px;color:#8E8E93;line-height:1.7;">我已阅读并同意<span onclick="goPage('enterpriseAgreement')" style="color:#10b981;cursor:pointer;text-decoration:underline;">《赞话认证服务协议》</span>，确认所填信息真实有效。</span>\n          </div>\n          <button id="eaSubmitBtn" onclick="submitEntApply()" style="width:100%;padding:14px;border:none;border-radius:12px;background:#1D9BF0;color:#fff;font-size:16px;font-weight:700;cursor:pointer;">提交申请</button>\n          <div style="text-align:center;margin-top:12px;font-size:12px;color:rgba(255,255,255,0.25);">审核周期3-5个工作日，结果通过站内信通知</div>\n        </div>\n      </div>`;
}

function bindEnterpriseApplyEvents() {
    window._entType = "commercial";
    window._entFiles = [];
}

window.uploadEntFiles = async function(input) {
    const files = input.files;
    if (!files.length) return;
    const fd = new FormData;
    for (const f of files) fd.append("files", f);
    try {
        const r = await fetch(API_BASE + "/uploadEnterpriseFile", {
            method: "POST",
            body: fd,
            headers: {
                Authorization: getToken()
            }
        });
        const res = await r.json();
        if (res.code === 1) {
            window._entFiles = window._entFiles.concat(res.data.urls);
            const listEl = document.getElementById("eaFileList");
            if (listEl) {
                listEl.innerHTML = window._entFiles.map((u, i) => '<div style="display:flex;align-items:center;gap:6px;padding:6px 10px;background:rgba(255,255,255,0.06);border-radius:6px;font-size:12px;color:rgba(255,255,255,0.7);">' + '<i class="fa-solid fa-file" style="color:#1D9BF0;"></i>' + '<span style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + u.split("/").pop() + "</span>" + '<i class="fa-solid fa-xmark" style="cursor:pointer;color:rgba(255,255,255,0.3);" onclick="removeEntFile(' + i + ')"></i></div>').join("");
            }
            showToast("上传成功");
        } else {
            showToast(res.msg || "上传失败");
        }
    } catch (e) {
        showToast("上传失败");
    }
    input.value = "";
};

window.removeEntFile = function(idx) {
    window._entFiles.splice(idx, 1);
    const listEl = document.getElementById("eaFileList");
    if (listEl) {
        const items = listEl.querySelectorAll("div");
        if (items[idx]) items[idx].remove();
    }
};

window.submitEntApply = async function() {
    const fullName = document.getElementById("eaFullName").value.trim();
    const creditCode = document.getElementById("eaCreditCode").value.trim();
    const contactName = document.getElementById("eaContactName").value.trim();
    const duns = document.getElementById("eaDuns") ? document.getElementById("eaDuns").value.trim() : "";
    const agree = document.getElementById("eaAgree").checked;
    if (!fullName) {
        showToast("请输入主体全称");
        return;
    }
    if (!creditCode) {
        showToast("请输入统一社会信用代码");
        return;
    }
    if (!contactName) {
        showToast("请输入运营联系人姓名");
        return;
    }
    if (!agree) {
        showToast("请先阅读并同意协议");
        return;
    }
    if (!window._entFiles || window._entFiles.length === 0) {
        showToast("请上传资质材料文件");
        return;
    }
    const btn = document.getElementById("eaSubmitBtn");
    btn.textContent = "提交中...";
    btn.style.opacity = "0.6";
    btn.disabled = true;
    try {
        const r = await api("/enterpriseApply", "POST", {
            org_type: window._entType,
            full_name: fullName,
            credit_code: creditCode,
            duns_number: duns,
            contact_name: contactName,
            files: (window._entFiles || []).join(",")
        });
        if (r.code === 1) {
            showToast("申请已提交，请等待审核");
            setTimeout(() => goBack(), 1e3);
        } else {
            showToast(r.msg || "提交失败");
        }
    } catch (e) {
        showToast("网络异常");
    }
    btn.textContent = "提交申请";
    btn.style.opacity = "1";
    btn.disabled = false;
};

window.selectEntType = function(type) {
    window._entType = type;
    [ "Public", "Commercial", "Government", "Ngo", "Education" ].forEach(t => {
        const icon = document.getElementById("eaType" + t + "Icon");
        if (icon) {
            icon.className = t.toLowerCase() === type ? "fa-solid fa-circle-check" : "fa-regular fa-circle";
            icon.style.color = t.toLowerCase() === type ? "var(--color-primary)" : "rgba(255,255,255,0.4)";
        }
    });
    const uploadSec = document.getElementById("eaUploadSection");
    const dunsRow = document.getElementById("eaDunsRow");
    const priceHint = document.getElementById("eaPriceHint");
    const isFree = type === "government" || type === "ngo";
    if (type === "commercial" || type === "education") {
        if (uploadSec) uploadSec.style.display = "block";
        if (dunsRow) dunsRow.style.display = "block";
    } else if (type === "government" || type === "ngo") {
        if (uploadSec) uploadSec.style.display = "block";
        if (dunsRow) dunsRow.style.display = "none";
    } else {
        if (uploadSec) uploadSec.style.display = "none";
        if (dunsRow) dunsRow.style.display = "none";
    }
    if (priceHint) {
        priceHint.textContent = isFree ? "免费 · 审核3-5个工作日" : "¥249/年 · 审核3-5个工作日";
    }
    const hint = document.getElementById("eaFileHint");
    if (!hint) return;
    const hints = {
        commercial: "营利性组织必备材料：营业执照正本或副本彩色照片、法定代表人身份证正反面、经办人身份证正反面、组织认证授权公函（加盖公章）。分公司另需：总公司营业执照+总公司授权书。",
        government: "党政机关/事业单位必备材料：统一社会信用代码证书（政府机关）或事业单位法人证书（事业单位）、单位负责人（法定代表人）身份证正反面、加盖公章的官方认证申请公函、账号经办人身份证。",
        ngo: "民间非营利组织必备材料：社会团体法人登记证书/基金会法人登记证书/民办非企业单位登记证书（根据类型选择）、法定代表人身份证正反面、经办人身份证、加盖公章的认证授权公函。",
        education: "教育机构必备材料：办学许可证或事业单位法人证书、法定代表人身份证正反面、经办人身份证、加盖公章的认证授权公函。"
    };
    hint.textContent = hints[type] || "请上传相关资质材料";
};

function renderYouthModePage() {
    return `<div class="page" style="background:#000;min-height:100vh;">\n        <div class="navbar" style="background:#000;border-bottom:0.5px solid rgba(255,255,255,0.08);"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;color:#fff;"></i></div><h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;color:#fff;">青少年模式</h1><div style="width:40px;"></div></div>\n        <div style="padding:24px 20px;">\n          <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">\n            <div style="width:48px;height:48px;border-radius:12px;background:rgba(62,153,60,0.15);display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-child" style="font-size:24px;color:#3E993C;"></i></div>\n            <div><div style="font-size:18px;font-weight:700;color:#fff;">青少年模式</div><div style="font-size:13px;color:#8E8E93;margin-top:2px;">保护未成年人健康上网</div></div>\n          </div>\n          <div style="background:#1C1C1E;border-radius:12px;padding:20px;margin-bottom:16px;">\n            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">\n              <span style="font-size:15px;color:#fff;font-weight:600;">开启青少年模式</span>\n              <label class="switch"><input type="checkbox" id="youthModeSwitch" class="ym-switch"><span class="slider"></span></label>\n            </div>\n            <div style="font-size:13px;color:rgba(255,255,255,0.65);line-height:1.9;">\n              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><i class="fa-solid fa-check" style="color:#3E993C;font-size:12px;"></i><span>内容安全过滤，屏蔽不适宜内容</span></div>\n              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><i class="fa-solid fa-check" style="color:#3E993C;font-size:12px;"></i><span>限制使用时长，保护视力健康</span></div>\n              <div style="display:flex;align-items:center;gap:8px;"><i class="fa-solid fa-check" style="color:#3E993C;font-size:12px;"></i><span>禁止充值打赏等消费行为</span></div>\n            </div>\n          </div>\n          <div style="font-size:12px;color:rgba(255,255,255,0.25);line-height:1.7;padding:0 4px;">\n            * 青少年模式仅限已实名认证的未成年用户使用。关闭后内容过滤将停止，请谨慎操作。\n          </div>\n        </div>\n      </div>`;
}

function bindYouthModeEvents() {
    const sw = document.getElementById("youthModeSwitch");
    if (!sw) return;
    api("/userInfo").then(u => {
        if (u.code === 1 && u.data && u.data.youth_mode) {
            sw.checked = true;
            applyPrivateSwitchStyle(true);
        }
    });
    sw.onchange = async function() {
        const enabled = this.checked ? 1 : 0;
        try {
            const r = await api("/toggleYouthMode", "POST", {
                enabled: enabled
            });
            if (r.code === 1) {
                showToast(enabled ? "已开启青少年模式" : "已关闭青少年模式");
                applyPrivateSwitchStyle(!!enabled);
            } else {
                showToast(r.msg || "操作失败");
                this.checked = !this.checked;
                applyPrivateSwitchStyle(!enabled);
            }
        } catch (e) {
            showToast("网络异常");
            this.checked = !this.checked;
        }
    };
}

function renderBuyExposure() {
    const postId = window._pageParam2 || "";
    return `<div class="vs-page">\n        <div class="vs-nav"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;width:40px;"><i class="fa-solid fa-angle-left" style="font-weight:600;color:#fff;"></i></div><h1>获取曝光</h1><div style="width:40px;"></div></div>\n        <div style="padding:24px 20px;text-align:center;">\n          <div style="display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,var(--color-primary),#2d7a2b);margin-bottom:12px;"><i class="fa-solid fa-bullhorn" style="font-size:28px;color:#fff;"></i></div>\n          <div style="font-size:20px;font-weight:800;color:#fff;margin-bottom:6px;">获取曝光</div>\n          <div style="font-size:13px;color:rgba(255,255,255,0.5);">提升帖子推送优先级，让更多人看到你的作品</div>\n        </div>\n        <div style="padding:0 20px;">\n          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:20px;margin-bottom:16px;">\n            <div style="font-size:14px;color:rgba(255,255,255,0.6);margin-bottom:12px;">选择曝光量</div>\n            <div style="display:flex;gap:10px;margin-bottom:16px;">\n              <div class="exposure-option" data-count="100" data-price="0.99" onclick="selectExposureOption(this)" style="flex:1;padding:16px 8px;background:rgba(255,255,255,0.06);border:2px solid transparent;border-radius:12px;text-align:center;cursor:pointer;">\n                <div style="font-size:18px;font-weight:700;color:#fff;">100次</div>\n                <div style="font-size:14px;color:var(--color-primary);font-weight:600;margin-top:4px;">¥0.99</div>\n              </div>\n              <div class="exposure-option active" data-count="500" data-price="3.99" onclick="selectExposureOption(this)" style="flex:1;padding:16px 8px;background:rgba(255,255,255,0.06);border:2px solid var(--color-primary);border-radius:12px;text-align:center;cursor:pointer;">\n                <div style="font-size:18px;font-weight:700;color:#fff;">500次</div>\n                <div style="font-size:14px;color:var(--color-primary);font-weight:600;margin-top:4px;">¥3.99</div>\n              </div>\n              <div class="exposure-option" data-count="1000" data-price="6.99" onclick="selectExposureOption(this)" style="flex:1;padding:16px 8px;background:rgba(255,255,255,0.06);border:2px solid transparent;border-radius:12px;text-align:center;cursor:pointer;">\n                <div style="font-size:18px;font-weight:700;color:#fff;">1000次</div>\n                <div style="font-size:14px;color:var(--color-primary);font-weight:600;margin-top:4px;">¥6.99</div>\n              </div>\n            </div>\n            <div style="font-size:15px;font-weight:600;color:#fff;text-align:center;margin-bottom:12px;">应付金额：<span id="exposurePrice" style="color:var(--color-primary);font-size:24px;">¥3.99</span></div>\n            <div style="width:180px;height:180px;background:#fff;border-radius:12px;margin:0 auto;display:flex;align-items:center;justify-content:center;">\n              <div style="text-align:center;"><img src="${PAY_QR_URL}" style="width:160px;height:160px;border-radius:8px;" alt="微信支付二维码"><div style="font-size:11px;color:#999;margin-top:6px;">微信扫码支付</div></div>\n            </div>\n            <div style="font-size:12px;color:rgba(255,255,255,0.3);margin-top:12px;text-align:center;">请在30分钟内完成支付</div>\n          </div>\n          <div style="background:rgba(255,255,255,0.03);border-radius:12px;padding:16px;margin-bottom:20px;">\n            <div style="font-size:13px;color:rgba(255,255,255,0.5);line-height:1.8;">\n              <p style="margin-bottom:6px;">· 曝光将提升帖子在信息流中的推送优先级</p>\n              <p style="margin-bottom:6px;">· 曝光次数为预估推送量，实际效果因内容质量等因素有所不同</p>\n              <p style="margin-bottom:6px;">· 支付成功后将在3个工作日内完成审核并发放</p>\n              <p>· 发布违规内容，平台有权收回推广并下架帖子</p>\n            </div>\n          </div>\n          <button id="exposurePayBtn" style="width:100%;padding:14px;border:none;border-radius:12px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-size:15px;font-weight:600;cursor:pointer;" onclick="confirmExposurePay()">我已完成支付</button>\n        </div>\n      </div>`;
}

function bindBuyExposureEvents() {
    window.selectExposureOption = function(el) {
        document.querySelectorAll(".exposure-option").forEach(o => {
            o.classList.remove("active");
            o.style.borderColor = "transparent";
        });
        el.classList.add("active");
        el.style.borderColor = "var(--color-primary)";
        document.getElementById("exposurePrice").textContent = "¥" + el.dataset.price;
    };
    window.confirmExposurePay = async function() {
        const activeOpt = document.querySelector(".exposure-option.active");
        if (!activeOpt) {
            showToast("请选择曝光量");
            return;
        }
        const postId = window._pageParam2 || "";
        if (!postId) {
            showToast("参数错误");
            return;
        }
        const count = activeOpt.dataset.count;
        const btn = document.getElementById("exposurePayBtn");
        btn.textContent = "处理中...";
        btn.disabled = true;
        try {
            const r = await api("/buyExposure", "POST", {
                post_id: postId,
                count: parseInt(count)
            });
            if (r.code === 1) {
                showToast("订单已提交！订单号：" + (r.data?.order_no || ""));
                setTimeout(() => goPage("myServiceOrders"), 1500);
            } else {
                showToast(r.msg || "提交失败");
            }
        } catch (e) {
            showToast("网络异常");
        }
        btn.textContent = "我已完成支付";
        btn.disabled = false;
    };
}

function renderBuyPin() {
    const param = window._pageParam2 || "";
    const isFromSubscribe = param === "scroll" || param === "fixed";
    const postId = isFromSubscribe ? "" : param;
    const initialPinType = isFromSubscribe ? param : "scroll";
    const initialPrice = initialPinType === "scroll" ? "5.00" : "0.45";
    return `<div class="vs-page">\n        <div class="vs-nav"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;width:40px;"><i class="fa-solid fa-angle-left" style="font-weight:600;color:#fff;"></i></div><h1>置顶推广</h1><div style="width:40px;"></div></div>\n        <div style="padding:24px 20px;text-align:center;">\n          <div style="display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#d97706);margin-bottom:12px;"><i class="fa-solid fa-thumbtack" style="font-size:28px;color:#fff;"></i></div>\n          <div style="font-size:20px;font-weight:800;color:#fff;margin-bottom:6px;">置顶推广</div>\n          <div style="font-size:13px;color:rgba(255,255,255,0.5);">将帖子展示在首页顶部，获得更多曝光</div>\n        </div>\n        ${isFromSubscribe ? `\n        <div id="postSelectWrap" style="padding:0 20px;margin-bottom:20px;">\n          <div style="font-size:14px;color:#fff;font-weight:600;margin-bottom:12px;">第一步：选择要置顶的帖子</div>\n          <div id="postSelectList" style="display:flex;flex-direction:column;gap:8px;"><div style="text-align:center;padding:20px;color:rgba(255,255,255,0.4);font-size:13px;">加载中...</div></div>\n        </div>\n        ` : ""}\n        <div style="padding:0 20px;${isFromSubscribe ? "opacity:0.4;pointer-events:none;" : ""}" id="pinPaySection">\n          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:20px;margin-bottom:16px;">\n            ${isFromSubscribe ? '<div style="font-size:14px;color:#fff;font-weight:600;margin-bottom:12px;">第二步：选择置顶方式并支付</div>' : '<div style="font-size:14px;color:rgba(255,255,255,0.6);margin-bottom:12px;">选择置顶方式</div>'}\n            <div class="pin-option" data-type="scroll" data-price="5" onclick="selectPinOption(this)" style="background:rgba(255,255,255,0.06);border:2px solid ${initialPinType === "scroll" ? "var(--color-primary)" : "transparent"};border-radius:12px;padding:16px;margin-bottom:10px;cursor:pointer;">\n              <div style="display:flex;align-items:center;justify-content:space-between;">\n                <div>\n                  <div style="font-size:16px;font-weight:700;color:#fff;">滚动置顶</div>\n                  <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:4px;">展示于未浏览用户首页顶部，浏览后不再重复展示</div>\n                </div>\n                <div style="font-size:16px;color:#fff;font-weight:700;">¥5<span style="font-size:12px;font-weight:400;opacity:0.7;">/次</span></div>\n              </div>\n            </div>\n            <div class="pin-option" data-type="fixed" data-price="0.15" onclick="selectPinOption(this)" style="background:rgba(255,255,255,0.06);border:2px solid ${initialPinType === "fixed" ? "var(--color-primary)" : "transparent"};border-radius:12px;padding:16px;margin-bottom:16px;cursor:pointer;">\n              <div style="display:flex;align-items:center;justify-content:space-between;">\n                <div>\n                  <div style="font-size:16px;font-weight:700;color:#fff;">长效固定置顶</div>\n                  <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:4px;">持续置顶首页顶部，刷新页面持续显示</div>\n                </div>\n                <div style="font-size:16px;color:#fff;font-weight:700;">¥0.15<span style="font-size:12px;font-weight:400;opacity:0.7;">/10分钟</span></div>\n              </div>\n            </div>\n            <div id="fixedDurationWrap" style="display:${initialPinType === "fixed" ? "block" : "none"};margin-bottom:16px;">\n              <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:8px;">置顶时长</div>\n              <div style="display:flex;gap:8px;">\n                <div class="pin-duration" data-mins="30" onclick="selectPinDuration(this)" style="flex:1;padding:10px;background:rgba(255,255,255,0.06);border:2px solid ${initialPinType === "fixed" ? "var(--color-primary)" : "transparent"};border-radius:10px;text-align:center;cursor:pointer;color:#fff;font-size:14px;font-weight:600;">30分钟<br><span style="font-size:12px;color:#fff;font-weight:400;opacity:0.7;">¥0.45</span></div>\n                <div class="pin-duration" data-mins="60" onclick="selectPinDuration(this)" style="flex:1;padding:10px;background:rgba(255,255,255,0.06);border:2px solid transparent;border-radius:10px;text-align:center;cursor:pointer;color:#fff;font-size:14px;font-weight:600;">1小时<br><span style="font-size:12px;color:#fff;font-weight:400;opacity:0.7;">¥0.90</span></div>\n                <div class="pin-duration" data-mins="120" onclick="selectPinDuration(this)" style="flex:1;padding:10px;background:rgba(255,255,255,0.06);border:2px solid transparent;border-radius:10px;text-align:center;cursor:pointer;color:#fff;font-size:14px;font-weight:600;">2小时<br><span style="font-size:12px;color:#fff;font-weight:400;opacity:0.7;">¥1.80</span></div>\n                <div class="pin-duration" data-mins="360" onclick="selectPinDuration(this)" style="flex:1;padding:10px;background:rgba(255,255,255,0.06);border:2px solid transparent;border-radius:10px;text-align:center;cursor:pointer;color:#fff;font-size:14px;font-weight:600;">6小时<br><span style="font-size:12px;color:#fff;font-weight:400;opacity:0.7;">¥5.40</span></div>\n              </div>\n              <div style="margin-top:10px;display:flex;align-items:center;gap:8px;">\n                <input id="pinCustomMins" type="number" min="10" step="10" placeholder="自定义分钟数" style="flex:1;padding:10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);border-radius:10px;color:#fff;font-size:14px;text-align:center;outline:none;" oninput="applyCustomPinDuration()">\n                <span style="font-size:12px;color:rgba(255,255,255,0.5);white-space:nowrap;">分钟（≥10，10的倍数）</span>\n              </div>\n            </div>\n            <div id="freeQuotaRow" style="display:none;margin-bottom:16px;">\n              <label style="display:flex;align-items:center;gap:8px;background:rgba(139,92,246,0.12);border:1px solid rgba(139,92,246,0.4);border-radius:10px;padding:12px;cursor:pointer;">\n                <input type="checkbox" id="useFreeQuota" onchange="toggleUseFreeQuota(this.checked)" style="width:16px;height:16px;accent-color:#8b5cf6;">\n                <span style="font-size:13px;color:#c4b5fd;" id="freeQuotaText"></span>\n              </label>\n            </div>\n            <div style="font-size:15px;font-weight:600;color:#fff;text-align:center;margin-bottom:12px;">应付金额：<span id="pinPrice" style="color:#fff;font-size:24px;">¥${initialPrice}</span></div>\n            <div id="pinQrWrap" style="width:180px;height:180px;background:#fff;border-radius:12px;margin:0 auto;display:flex;align-items:center;justify-content:center;">\n              <div style="text-align:center;"><img src="${PAY_QR_URL}" style="width:160px;height:160px;border-radius:8px;" alt="微信支付二维码"><div style="font-size:11px;color:#999;margin-top:6px;">微信扫码支付</div></div>\n            </div>\n            <div id="pinPayNote" style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:12px;text-align:center;">请在30分钟内完成支付</div>\n          </div>\n          <div style="background:rgba(255,255,255,0.03);border-radius:12px;padding:16px;margin-bottom:20px;">\n            <div style="font-size:13px;color:rgba(255,255,255,0.6);line-height:1.8;">\n              <p style="margin-bottom:6px;">· 滚动置顶：展示于未浏览用户首页顶部，浏览后不再重复展示</p>\n              <p style="margin-bottom:6px;">· 长效固定置顶：持续置顶首页顶部，刷新页面持续显示</p>\n              <p style="margin-bottom:6px;">· 长效固定置顶需要高级认证用户方可购买</p>\n              <p style="margin-bottom:6px;">· 支付成功后将在3个工作日内完成审核并发放</p>\n              <p>· 发布违规内容，平台有权收回推广并下架帖子</p>\n            </div>\n          </div>\n          <button id="pinPayBtn" style="width:100%;padding:14px;border:none;border-radius:12px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;font-size:15px;font-weight:600;cursor:pointer;" onclick="confirmPinPay()">我已完成支付</button>\n        </div>\n      </div>`;
}

function bindBuyPinEvents() {
    const param = window._pageParam2 || "";
    const isFromSubscribe = param === "scroll" || param === "fixed";
    let selectedPostId = isFromSubscribe ? "" : param || "";
    let currentPinType = isFromSubscribe ? param : "scroll";
    let currentPinPrice = currentPinType === "scroll" ? 5 : .45;
    let currentPinDuration = currentPinType === "fixed" ? 30 : 0;
    let pinPerks = null;
    let usingFree = false;
    function freeAvailForCurrent() {
        if (!pinPerks) return 0;
        return currentPinType === "scroll" ? pinPerks.scroll_avail || 0 : pinPerks.fixed_min_avail || 0;
    }
    function freeCoversCurrent() {
        const avail = freeAvailForCurrent();
        if (avail <= 0) return false;
        return currentPinType === "scroll" ? true : currentPinDuration <= avail;
    }
    function refreshFreeQuotaUI() {
        const row = document.getElementById("freeQuotaRow");
        const cb = document.getElementById("useFreeQuota");
        const txt = document.getElementById("freeQuotaText");
        const priceEl = document.getElementById("pinPrice");
        const qrWrap = document.getElementById("pinQrWrap");
        const note = document.getElementById("pinPayNote");
        const btn = document.getElementById("pinPayBtn");
        if (!row) return;
        const avail = freeAvailForCurrent();
        const canUseFree = avail > 0 && freeCoversCurrent();
        if (avail <= 0) {
            row.style.display = "none";
            usingFree = false;
            if (cb) cb.checked = false;
        } else {
            row.style.display = "block";
            if (txt) txt.textContent = currentPinType === "scroll" ? `使用本月免费额度（剩余 ${avail} 次，立即生效）` : `使用本月免费额度（剩余 ${avail} 分钟，本次需 ${currentPinDuration} 分钟${currentPinDuration > avail ? "，超出额度" : ""}）`;
            if (!canUseFree && usingFree) {
                usingFree = false;
                if (cb) cb.checked = false;
            }
        }
        if (usingFree) {
            if (priceEl) priceEl.textContent = "¥0.00";
            if (qrWrap) qrWrap.style.display = "none";
            if (note) note.textContent = "免费额度即时生效，无需支付";
            if (btn) btn.textContent = "立即使用免费置顶";
        } else {
            if (priceEl) priceEl.textContent = "¥" + currentPinPrice.toFixed(2);
            if (qrWrap) qrWrap.style.display = "flex";
            if (note) note.textContent = "请在30分钟内完成支付";
            if (btn) btn.textContent = "我已完成支付";
        }
    }
    window.toggleUseFreeQuota = function(on) {
        usingFree = !!on && freeCoversCurrent();
        refreshFreeQuotaUI();
    };
    api("/myPinPerks").then(r => {
        if (r.code === 1 && r.data) {
            pinPerks = r.data;
            refreshFreeQuotaUI();
        }
    }).catch(() => {});
    if (isFromSubscribe) {
        loadPinPostList();
    }
    async function loadPinPostList() {
        try {
            const res = await api("/myPosts?page=1&size=20");
            const list = document.getElementById("postSelectList");
            if (!list) return;
            if (res.code === 1 && res.data && res.data.length > 0) {
                list.innerHTML = res.data.map(p => {
                    const title = p.title || "无标题帖子";
                    const preview = (p.content || "").replace(/@\[\d+\]([^\s\[\]<]{1,30})/g, "@$1").replace(/<[^>]*>/g, "").substring(0, 60);
                    const firstImg = (p.images || "").split(",").map(s => s.trim()).filter(Boolean)[0] || "";
                    const imgHtml = firstImg ? `<img src="${resolveMediaUrl(firstImg.replace("thumb_", ""))}" style="width:40px;height:40px;border-radius:6px;object-fit:cover;flex-shrink:0;">` : "";
                    return `<div class="post-select-item" data-post-id="${p.id}" onclick="selectPinPost(this)" style="background:rgba(255,255,255,0.06);border:2px solid transparent;border-radius:12px;padding:12px;cursor:pointer;display:flex;align-items:center;gap:10px;">\n                ${imgHtml}\n                <div style="flex:1;min-width:0;">\n                  <div style="font-size:14px;color:#fff;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${title}</div>\n                  <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${preview}</div>\n                </div>\n                <i class="fa-solid fa-circle-check" style="font-size:18px;color:var(--color-primary);display:none;"></i>\n              </div>`;
                }).join("");
            } else {
                list.innerHTML = '<div style="text-align:center;padding:30px;color:rgba(255,255,255,0.4);font-size:13px;">您还没有可以置顶的帖子<br>请先发布帖子后再来购买置顶</div>';
            }
        } catch (e) {
            const list = document.getElementById("postSelectList");
            if (list) list.innerHTML = '<div style="text-align:center;padding:20px;color:rgba(255,255,255,0.4);font-size:13px;">加载失败，请返回重试</div>';
        }
    }
    window.selectPinPost = function(el) {
        document.querySelectorAll(".post-select-item").forEach(item => {
            item.style.borderColor = "transparent";
            const check = item.querySelector(".fa-circle-check");
            if (check) check.style.display = "none";
        });
        el.style.borderColor = "var(--color-primary)";
        const check = el.querySelector(".fa-circle-check");
        if (check) check.style.display = "block";
        selectedPostId = el.dataset.postId;
        const section = document.getElementById("pinPaySection");
        if (section) {
            section.style.opacity = "1";
            section.style.pointerEvents = "auto";
        }
    };
    window.selectPinOption = function(el) {
        document.querySelectorAll(".pin-option").forEach(o => {
            o.style.borderColor = "transparent";
        });
        el.style.borderColor = "var(--color-primary)";
        currentPinType = el.dataset.type;
        const fixedWrap = document.getElementById("fixedDurationWrap");
        if (currentPinType === "fixed") {
            fixedWrap.style.display = "block";
            const customInput = document.getElementById("pinCustomMins");
            if (customInput && parseInt(customInput.value) >= 10) {
                const customMins = Math.max(10, Math.ceil(parseInt(customInput.value) / 10) * 10);
                currentPinPrice = parseFloat((customMins * .015).toFixed(2));
                currentPinDuration = customMins;
            } else {
                const activeDur = document.querySelector('.pin-duration[style*="border-color: var(--color-primary)"]');
                if (activeDur) {
                    const priceText = activeDur.querySelector("span").textContent.replace("¥", "");
                    currentPinPrice = parseFloat(priceText);
                    currentPinDuration = parseInt(activeDur.dataset.mins);
                } else {
                    currentPinPrice = .45;
                    currentPinDuration = 30;
                }
            }
        } else {
            fixedWrap.style.display = "none";
            currentPinPrice = 5;
            currentPinDuration = 0;
        }
        document.getElementById("pinPrice").textContent = "¥" + currentPinPrice.toFixed(2);
        refreshFreeQuotaUI();
    };
    window.selectPinDuration = function(el) {
        document.querySelectorAll(".pin-duration").forEach(o => {
            o.style.borderColor = "transparent";
        });
        el.style.borderColor = "var(--color-primary)";
        const priceText = el.querySelector("span").textContent.replace("¥", "");
        currentPinPrice = parseFloat(priceText);
        currentPinDuration = parseInt(el.dataset.mins);
        document.getElementById("pinPrice").textContent = "¥" + currentPinPrice.toFixed(2);
        refreshFreeQuotaUI();
    };
    window.applyCustomPinDuration = function() {
        const input = document.getElementById("pinCustomMins");
        if (!input) return;
        let mins = parseInt(input.value);
        if (isNaN(mins) || mins < 10) {
            input.value = "";
            return;
        }
        mins = Math.max(10, Math.ceil(mins / 10) * 10);
        input.value = mins;
        document.querySelectorAll(".pin-duration").forEach(o => {
            o.style.borderColor = "transparent";
        });
        currentPinDuration = mins;
        currentPinPrice = parseFloat((mins * .015).toFixed(2));
        document.getElementById("pinPrice").textContent = "¥" + currentPinPrice.toFixed(2);
        refreshFreeQuotaUI();
    };
    window.confirmPinPay = async function() {
        if (!selectedPostId) {
            showToast("请先选择要置顶的帖子");
            return;
        }
        const btn = document.getElementById("pinPayBtn");
        const wasFree = usingFree && freeCoversCurrent();
        btn.textContent = "处理中...";
        btn.disabled = true;
        try {
            const payload = {
                post_id: selectedPostId,
                pin_type: currentPinType
            };
            if (currentPinType === "fixed") payload.duration_minutes = currentPinDuration;
            if (wasFree) payload.use_free = 1;
            const r = await api("/buyPin", "POST", payload);
            if (r.code === 1) {
                if (wasFree) {
                    showToast(r.msg || "已使用本月免费额度，置顶即时生效");
                    usingFree = false;
                    if (pinPerks) {
                        if (currentPinType === "scroll") pinPerks.scroll_avail = r.data && typeof r.data.remain === "number" ? r.data.remain : Math.max(0, pinPerks.scroll_avail - 1); else pinPerks.fixed_min_avail = r.data && typeof r.data.remain === "number" ? r.data.remain : Math.max(0, pinPerks.fixed_min_avail - currentPinDuration);
                    }
                    refreshFreeQuotaUI();
                    setTimeout(() => goPage("home"), 1200);
                } else {
                    showToast("订单已提交！订单号：" + (r.data?.order_no || ""));
                    setTimeout(() => goPage("myServiceOrders"), 1500);
                }
            } else {
                showToast(r.msg || "提交失败");
            }
        } catch (e) {
            showToast("网络异常");
        }
        btn.textContent = usingFree ? "立即使用免费置顶" : "我已完成支付";
        btn.disabled = false;
    };
}

async function renderPaySubscribe() {
    const type = window._pageParam2 || "advanced";
    const sub_period = window._verifSubTab || "month";
    const isAdv = type === "advanced";
    const name = isAdv ? "进阶认证" : "高级认证";
    const firstPrice = isAdv ? "¥0.99" : "¥3.99";
    const normalPrice = isAdv ? "¥3.99" : "¥11.99";
    const yearlyPrice = isAdv ? "¥29.9" : "¥79.9";
    let showFirstMonth = true;
    try {
        const r = await api("/userInfo", "POST");
        if (r.code === 1 && r.data.verifications) {
            const hasAdv = r.data.verifications.some(v => (typeof v === "string" ? v : v.type) === "advanced");
            const hasPrem = r.data.verifications.some(v => (typeof v === "string" ? v : v.type) === "premium");
            if (hasAdv || hasPrem) showFirstMonth = false;
        }
    } catch (e) {}
    const displayPrice = sub_period === "year" ? yearlyPrice : showFirstMonth ? firstPrice : normalPrice;
    const priceLabel = sub_period === "year" ? "年付" : showFirstMonth ? "首月特惠" : "按月订阅";
    return `<div class="vs-page">\n        <div class="vs-nav"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;width:40px;"><i class="fa-solid fa-angle-left" style="font-weight:600;color:#fff;"></i></div><h1>订阅${name}</h1><div style="width:40px;"></div></div>\n        <div style="padding:24px 20px;text-align:center;">\n          <div style="display:inline-flex;align-items:center;gap:8px;margin-bottom:8px;">${getVerifSvg(type, 28)}<span style="font-size:22px;font-weight:800;color:#fff;">${name}</span></div>\n          <div style="font-size:14px;color:rgba(255,255,255,0.5);">${priceLabel} · ${displayPrice}</div>\n        </div>\n        <div style="padding:0 20px;">\n          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:24px;text-align:center;margin-bottom:20px;">\n            <div style="font-size:15px;font-weight:600;color:#fff;margin-bottom:4px;">微信支付</div>\n            <div style="font-size:28px;font-weight:800;color:#fff;margin:16px 0;">${displayPrice}</div>\n            <div style="width:180px;height:180px;background:#fff;border-radius:12px;margin:0 auto;display:flex;align-items:center;justify-content:center;">\n              <div style="text-align:center;"><img src="${PAY_QR_URL}" style="width:160px;height:160px;border-radius:8px;" alt="微信支付二维码"><div style="font-size:11px;color:#999;margin-top:6px;">微信扫码支付</div></div>\n            </div>\n            <div style="font-size:12px;color:rgba(255,255,255,0.3);margin-top:12px;">请在30分钟内完成支付</div>\n          </div>\n          <div style="background:rgba(255,255,255,0.03);border-radius:12px;padding:16px;margin-bottom:16px;">\n            <div style="font-size:13px;color:rgba(255,255,255,0.5);line-height:1.8;">\n              <p style="margin-bottom:6px;">· 扫码支付完成后请点击下方的"我已完成支付"，否则不能到账。如果您已支付但忘记点击"我已完成支付"，我们将会在三个工作日内为您发起退款。</p>\n              <p style="margin-bottom:6px;">· 将在3个工作日内完成后台审核，审核通过后发放相关权益</p>\n              <p style="margin-bottom:6px;">· 若您不是首次购买，将无法享受首月优惠价格</p>\n              <p style="margin-bottom:6px;">· 已享受首月优惠的订单若未在3个工作日内审核通过，将会自动取消订单并退还对应费用</p>\n              <p>· 权益将在审核通过后立即生效</p>\n            </div>\n          </div>\n          <div style="display:flex;align-items:flex-start;gap:8px;line-height:1.6;margin-bottom:10px;">\n            <input type="checkbox" id="subPayAgreeChk" style="margin-top:3px;flex-shrink:0;accent-color:#10b981;">\n            <span style="flex:1;font-size:12px;color:rgba(255,255,255,0.7);">我已阅读并同意<span onclick="goPage('verifSubAgreement')" style="color:#10b981;cursor:pointer;text-decoration:underline;">《赞话用户认证订阅协议》</span>，且我不是未成年人或我是未成年人但此订阅已受到监护人的许可。</span>\n          </div>\n          <div id="subPayAgreeTip" style="font-size:12px;color:#ef4444;margin-bottom:8px;display:none;">请先阅读并勾选同意《赞话用户认证订阅协议》</div>\n          <button id="subPayBtn" style="width:100%;padding:14px;border:none;border-radius:12px;background:${isAdv ? "linear-gradient(135deg,#10b981,#059669)" : "linear-gradient(135deg,#8b5cf6,#7c3aed)"};color:#fff;font-size:15px;font-weight:600;cursor:pointer;" onclick="confirmSubPay('${type}','${sub_period}')">我已完成支付</button>\n        </div>\n      </div>`;
}

function bindPaySubscribeEvents() {
    let _subPaySubmitted = false;
    window.confirmSubPay = async function(type, sub_period) {
        if (_subPaySubmitted) {
            showToast("订单已提交，请勿重复提交");
            return;
        }
        const agree = document.getElementById("subPayAgreeChk").checked;
        const tip = document.getElementById("subPayAgreeTip");
        if (!agree) {
            if (tip) tip.style.display = "block";
            showToast("请先勾选同意《赞话用户认证订阅协议》");
            return;
        }
        if (tip) tip.style.display = "none";
        const btn = document.getElementById("subPayBtn");
        btn.textContent = "处理中...";
        btn.disabled = true;
        try {
            const r = await api("/subscribeVerif", "POST", {
                type: type,
                sub_period: sub_period || "month"
            });
            if (r.code === 1) {
                _subPaySubmitted = true;
                showToast("订单已提交！订单号：" + (r.data?.order_no || ""));
                setTimeout(() => goPage("mySubOrders"), 1500);
            } else {
                showToast(r.msg || "确认失败");
                btn.textContent = "我已完成支付";
                btn.disabled = false;
            }
        } catch (e) {
            showToast("网络异常");
            btn.textContent = "我已完成支付";
            btn.disabled = false;
        }
    };
}

async function renderVerifSubscribe() {
    const tab = window._verifSubTab || "month";
    let basicVerified = false;
    let hasAdvanced = false;
    let hasPremium = false;
    let expiryData = {};
    try {
        const [r1, r2] = await Promise.all([ api("/userInfo", "POST"), api("/subscriptionExpiry") ]);
        if (r1.code === 1) {
            if (r1.data.realname_status === "verified") basicVerified = true;
            if (r1.data.verifications) {
                basicVerified = basicVerified || r1.data.verifications.some(v => (typeof v === "string" ? v : v.type) === "basic");
                hasAdvanced = r1.data.verifications.some(v => (typeof v === "string" ? v : v.type) === "advanced");
                hasPremium = r1.data.verifications.some(v => (typeof v === "string" ? v : v.type) === "premium");
            }
        }
        if (r2.code === 1) expiryData = r2.data || {};
    } catch (e) {}
    const showFirstMonth = !(hasAdvanced || hasPremium);
    function remainInfo(type) {
        if (!expiryData[type]) return null;
        const ms = parseBeijingTime(expiryData[type]) - Date.now();
        if (ms <= 0) return null;
        const totalDays = Math.ceil(ms / 864e5);
        if (totalDays > 30) {
            const months = Math.floor(totalDays / 30);
            const days = totalDays % 30;
            return {
                text: days > 0 ? `${months}个月${days}天` : `${months}个月`,
                totalDays: totalDays
            };
        }
        return {
            text: `${totalDays}天`,
            totalDays: totalDays
        };
    }
    const advRemain = remainInfo("advanced");
    const premRemain = remainInfo("premium");
    const basicCard = basicVerified ? `<div style="font-size:11px;color:#3E993C;background:rgba(62,153,60,0.12);padding:3px 8px;border-radius:6px;font-weight:600;">已认证</div>` : `<div style="font-size:11px;color:#3E993C;background:rgba(62,153,60,0.12);padding:3px 8px;border-radius:6px;font-weight:600;">免费</div>`;
    const basicBtn = basicVerified ? `<div style="margin-top:14px;padding:13px;border-radius:12px;background:rgba(62,153,60,0.15);color:#3E993C;font-size:15px;font-weight:700;text-align:center;">已认证</div>` : `<button class="vs-btn" style="background:linear-gradient(135deg,#3E993C,#2d7a2b);margin-top:14px;" onclick="goPage('realnameVerify')">立即认证</button>`;
    return `<div class="vs-page">\n    <div class="vs-nav"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;width:40px;"><i class="fa-solid fa-angle-left" style="font-weight:600;color:#fff;"></i></div><h1>认证订阅</h1><div style="width:40px;"></div></div>\n    <div class="vs-hero">\n      <div class="vs-hero-title">解锁创作者专属特权</div>\n      <div class="vs-hero-sub">提升你的影响力与创作体验</div>\n      <div class="vs-tabs">\n        <div class="vs-tab${tab === "month" ? " active" : ""}" onclick="window._verifSubTab='month';render();">按月订阅</div>\n        <div class="vs-tab${tab === "year" ? " active" : ""}" onclick="window._verifSubTab='year';render();">按年订阅</div>\n      </div>\n    </div>\n    <div style="margin:32px 16px 36px;background:linear-gradient(135deg,#1a2e1a,#1e3e1a);border:1px solid rgba(62,153,60,0.25);border-radius:16px;padding:18px 20px;position:relative;overflow:hidden;">\n      <div style="display:flex;align-items:center;justify-content:space-between;">\n        <div style="display:flex;align-items:center;gap:8px;">${getVerifSvg("basic", 20)}<span style="font-size:17px;font-weight:700;color:#fff;">普通认证</span></div>\n        ${basicCard}\n      </div>\n      <div style="font-size:13px;color:rgba(255,255,255,0.5);margin-top:8px;">实名认证即可获得，展示已认证标识</div>\n      <div style="margin-top:10px;padding:10px 12px;background:rgba(255,255,255,0.04);border-radius:8px;font-size:11px;color:rgba(255,255,255,0.4);line-height:1.7;">根据《中华人民共和国网络安全法》第二十四条规定，网络运营者为用户提供信息发布、即时通讯等服务，应当要求用户提供真实身份信息。用户不提供真实身份信息的，网络运营者不得为其提供相关服务。赞话平台依法要求用户完成实名认证后方可使用相关功能。</div>\n      ${basicBtn}\n    </div>\n    <div class="vs-cards">\n      <div class="vs-card vs-card-advanced">\n        <div class="vs-card-header">\n          <div style="display:flex;align-items:center;gap:8px;">${getVerifSvg("advanced", 20)}<span style="font-size:17px;font-weight:700;color:#fff;">进阶认证</span></div>\n          ${tab === "year" ? '<div class="vs-save-badge">年付省 ¥18</div>' : ""}\n        </div>\n        <div class="vs-card-price">\n          <span class="vs-price">${tab === "year" ? "¥29.9" : "¥3.99"}</span>\n          <span class="vs-period">/${tab === "year" ? "年" : "月"}</span>\n          ${tab === "year" ? '<span class="vs-monthly">¥2.49/月</span>' : ""}\n        </div>\n        ${tab === "month" && showFirstMonth ? '<div class="vs-first-month"><i class="fa-solid fa-tag" style="margin-right:4px;"></i>首月仅 ¥0.99</div>' : ""}\n        ${advRemain ? '<div style="text-align:center;font-size:13px;color:#10b981;font-weight:600;margin-bottom:10px;"><i class="fa-regular fa-clock" style="margin-right:4px;"></i>剩余 ' + advRemain.text + "</div>" : ""}\n        <button class="vs-btn vs-btn-advanced" onclick="goPage('paySubscribe',null,'advanced')">${advRemain ? "续费" : tab === "month" && showFirstMonth ? "首月 ¥0.99 开通" : "立即开通"}</button>\n        <div class="vs-card-features">\n          <div class="vs-val-row"><span>综合权益估值</span><span style="color:#fff;font-weight:600;">¥37</span></div>\n          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>帖子保护：开启后访客端强制显示满屏UID水印（防截图追溯）</div>\n          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>单条作品最高500次流量曝光推送</div>\n          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>信息流广告减少30%</div>\n          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>每月最多3次昵称修改</div>\n          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>私信限速提升至40条/分钟</div>\n          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>举报请求优先处理</div>\n          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>每月附赠1次全站首页滚动置顶</div>\n        </div>\n      </div>\n      <div class="vs-card vs-card-premium">\n        <div class="vs-card-header">\n          <div style="display:flex;align-items:center;gap:8px;">${getVerifSvg("premium", 20)}<span style="font-size:17px;font-weight:700;color:#fff;">高级认证</span></div>\n          ${tab === "year" ? '<div class="vs-save-badge">年付省 ¥64</div>' : '<div class="vs-hot-badge">最受欢迎</div>'}\n        </div>\n        <div class="vs-card-price">\n          <span class="vs-price">${tab === "year" ? "¥79.9" : "¥11.99"}</span>\n          <span class="vs-period">/${tab === "year" ? "年" : "月"}</span>\n          ${tab === "year" ? '<span class="vs-monthly">¥6.66/月</span>' : ""}\n        </div>\n        ${tab === "month" && showFirstMonth ? '<div class="vs-first-month"><i class="fa-solid fa-tag" style="margin-right:4px;"></i>首月仅 ¥3.99</div>' : ""}\n        ${premRemain ? '<div style="text-align:center;font-size:13px;color:#8b5cf6;font-weight:600;margin-bottom:10px;"><i class="fa-regular fa-clock" style="margin-right:4px;"></i>剩余 ' + premRemain.text + "</div>" : ""}\n        <button class="vs-btn vs-btn-premium" onclick="goPage('paySubscribe',null,'premium')">${premRemain ? "续费" : tab === "month" && showFirstMonth ? "首月 ¥3.99 开通" : "立即开通"}</button>\n        <div class="vs-card-features">\n          <div class="vs-val-row"><span>综合权益估值</span><span style="color:#fff;font-weight:600;">¥112</span></div>\n          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>帖子保护：开启后访客端强制显示满屏UID水印（防截图追溯）</div>\n          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>单条作品最高1000次流量曝光推送</div>\n          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>完整移除全部信息流广告</div>\n          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>每月最多8次昵称修改</div>\n          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>私信限速提升至60条/分钟</div>\n          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>最高优先级极速举报通道</div>\n          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>昵称气泡、文字颜色自定义</div>\n          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>每年享有1次账号封禁解除机会*</div>\n          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>每月附赠5次全站首页滚动置顶</div>\n          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>解锁长效固定置顶购买权限</div>\n        </div>\n      </div>\n    </div>\n    <div style="margin:4px 16px 0;background:#1C1C1E;border:1px solid rgba(29,155,240,0.2);border-radius:16px;padding:18px 20px;cursor:pointer;" onclick="goPage('enterpriseApply')">\n      <div style="display:flex;align-items:center;justify-content:space-between;">\n        <div style="display:flex;align-items:center;gap:8px;">${getVerifSvg("enterprise", 20)}<span style="font-size:17px;font-weight:700;color:#fff;">企业/机构/团体认证</span></div>\n        <div style="font-size:13px;color:#1D9BF0;font-weight:700;">¥249/年 <i class="fa-solid fa-chevron-right" style="font-size:12px;margin-left:4px;"></i></div>\n      </div>\n      <div style="font-size:13px;color:rgba(255,255,255,0.5);margin-top:8px;">公共机构/商业组织，审核3-5个工作日 · 含帖子保护特权</div>\n    </div>\n    <div class="vs-compare">\n      <div class="vs-section-title">功能对比</div>\n      <div class="vs-table-wrap"><table class="vs-table"><thead><tr><th></th><th>进阶认证</th><th>高级认证</th></tr></thead><tbody>\n        <tr><td class="vs-td-cat" colspan="3">基础权益</td></tr>\n        <tr><td>信息流广告</td><td>减少30%</td><td>完全无广告</td></tr>\n        <tr><td>帖子保护</td><td><i class="fa-solid fa-check" style="color:#10b981;"></i></td><td><i class="fa-solid fa-check" style="color:#10b981;"></i></td></tr>\n        <tr><td>作品曝光上限</td><td>500次/单条</td><td>1000次/单条</td></tr>\n        <tr><td>私信发送速率</td><td>40条/分钟</td><td>60条/分钟</td></tr>\n        <tr><td>每月昵称修改</td><td>3次</td><td>8次</td></tr>\n        <tr><td>举报处理</td><td>优先响应</td><td>极速优先通道</td></tr>\n        <tr><td class="vs-td-cat" colspan="3">专属特权</td></tr>\n        <tr><td>昵称外观自定义</td><td>—</td><td><i class="fa-solid fa-check" style="color:#10b981;"></i></td></tr>\n        <tr><td>年度解封机会*</td><td>—</td><td><i class="fa-solid fa-check" style="color:#10b981;"></i></td></tr>\n        <tr><td>月度滚动置顶</td><td>1次</td><td>5次</td></tr>\n        <tr><td>长效置顶购买</td><td>—</td><td><i class="fa-solid fa-check" style="color:#10b981;"></i></td></tr>\n      </tbody></table></div>\n    </div>\n    <div class="vs-extras">\n      <div class="vs-section-title">增值推广服务</div>\n      <div class="vs-extra-card" style="cursor:pointer;" onclick="goPage('buyPin',null,'scroll')">\n        <div class="vs-extra-header"><span style="font-size:15px;font-weight:600;color:#fff;">全站滚动置顶</span><span style="font-size:13px;color:#fff;font-weight:700;">¥5 / 次</span></div>\n        <div style="font-size:13px;color:#fff;margin-top:4px;">展示于未浏览用户首页顶部，浏览后不再重复展示</div>\n        <div style="font-size:12px;color:#fff;margin-top:8px;font-weight:600;">点击购买 <i class="fa-solid fa-chevron-right" style="font-size:11px;"></i></div>\n      </div>\n      <div class="vs-extra-card" style="cursor:pointer;" onclick="goPage('buyPin',null,'fixed')">\n        <div class="vs-extra-header"><span style="font-size:15px;font-weight:600;color:#fff;">长效固定置顶</span><span style="font-size:13px;color:#fff;font-weight:700;">¥0.15 / 10分钟</span></div>\n        <div style="font-size:13px;color:#fff;margin-top:4px;">持续置顶首页顶部，刷新页面持续显示</div>\n        <div style="font-size:12px;color:#fff;margin-top:8px;font-weight:600;">点击购买 <i class="fa-solid fa-chevron-right" style="font-size:11px;"></i></div>\n      </div>\n    </div>\n    <div style="margin:8px 16px 4px;text-align:center;display:flex;justify-content:center;align-items:center;gap:24px;"><span style="font-size:13px;color:rgba(255,255,255,0.5);cursor:pointer;text-decoration:underline;" onclick="goPage('mySubOrders')"><i class="fa-solid fa-receipt" style="margin-right:4px;"></i>订阅订单记录</span><span style="font-size:13px;color:rgba(255,255,255,0.5);cursor:pointer;text-decoration:underline;" onclick="goPage('redeemCode')"><i class="fa-solid fa-ticket" style="margin-right:4px;"></i>输入兑换序列号</span></div>\n    <div class="vs-footer">*曝光仅提升平台推送优先级，不承诺固定访问人数；平台持续设置私信速率限制，保障站点稳定。发布违规内容，平台有权收回全部推广特权。*年度解封机会在订阅满一年后发放，每个订阅周期仅限一次。高级认证订阅用户每月附赠24小时（1440分钟）长效固定置顶推广额度。</div>\n  </div>`;
}

async function renderMySubOrders() {
    let orders = [];
    try {
        const r = await api("/mySubscriptions");
        if (r.code === 1) orders = r.data || [];
    } catch (e) {}
    const subTypeMap = {
        advanced: "进阶认证",
        premium: "高级认证"
    };
    const periodMap = {
        month: "月订阅",
        year: "年订阅"
    };
    const statusMap = {
        querying: {
            text: "正在查询支付结果",
            color: "#f59e0b"
        },
        completed: {
            text: "已完成",
            color: "#10b981"
        },
        refunding: {
            text: "退款申请中",
            color: "#f59e0b"
        },
        refunded: {
            text: "已退款",
            color: "#ef4444"
        },
        rejected: {
            text: "已拒绝",
            color: "#ef4444"
        }
    };
    function remainDays(expireAt) {
        if (!expireAt) return null;
        const ms = parseBeijingTime(expireAt) - Date.now();
        if (ms <= 0) return 0;
        return Math.ceil(ms / 864e5);
    }
    if (orders.length === 0) {
        return `<div class="vs-page">\n          <div class="vs-nav"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;width:40px;"><i class="fa-solid fa-angle-left" style="font-weight:600;color:#fff;"></i></div><h1>订阅订单</h1><div style="width:40px;"></div></div>\n          <div style="padding:60px 20px;text-align:center;color:rgba(255,255,255,0.4);font-size:14px;"><i class="fa-solid fa-receipt" style="font-size:40px;margin-bottom:16px;display:block;opacity:0.3;"></i>暂无订阅订单</div>\n        </div>`;
    }
    return `<div class="vs-page">\n        <div class="vs-nav"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;width:40px;"><i class="fa-solid fa-angle-left" style="font-weight:600;color:#fff;"></i></div><h1>订阅订单</h1><div style="width:40px;"></div></div>\n        <div style="padding:12px 16px;">${orders.map(o => {
        const st = statusMap[o.status] || {
            text: o.status,
            color: "#999"
        };
        const rd = o.status === "completed" ? remainDays(o.expire_at) : null;
        const orderDays = o.sub_period === "year" ? 365 : 30;
        const canRefund = o.status === "completed" && rd !== null && rd > orderDays;
        return `<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px;margin-bottom:10px;">\n            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">\n              <div style="display:flex;align-items:center;gap:6px;"><span style="font-size:15px;font-weight:600;color:#fff;">${subTypeMap[o.sub_type] || o.sub_type}</span><span style="font-size:11px;color:rgba(255,255,255,0.4);">${periodMap[o.sub_period] || o.sub_period}</span></div>\n              <span style="font-size:12px;font-weight:600;color:${st.color};">${st.text}</span>\n            </div>\n            <div style="display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px;"><span>订单号</span><span style="color:rgba(255,255,255,0.7);font-family:monospace;">${o.order_no || "-"}</span></div>\n            <div style="display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px;"><span>金额</span><span style="color:#fff;font-weight:600;">¥${o.amount || 0}</span></div>\n            <div style="display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px;"><span>创建时间</span><span>${o.created_at || "-"}</span></div>\n            ${o.expire_at ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px;"><span>到期时间</span><span>${o.expire_at}</span></div>` : ""}\n            ${rd !== null ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px;"><span>剩余时间</span><span style="color:${rd > 30 ? "#10b981" : rd > 0 ? "#f59e0b" : "#ef4444"};font-weight:600;">${rd > 0 ? rd > 30 ? Math.floor(rd / 30) + "个月" + (rd % 30 > 0 ? rd % 30 + "天" : "") : rd + "天" : "已过期"}</span></div>` : ""}\n            ${o.wechat_pay_no ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px;"><span>支付单号</span><span style="font-family:monospace;">${o.wechat_pay_no}</span></div>` : ""}\n            ${canRefund ? `<div style="margin-top:10px;"><button style="width:100%;padding:10px;border:1px solid rgba(239,68,68,0.4);border-radius:10px;background:rgba(239,68,68,0.08);color:#ef4444;font-size:13px;font-weight:600;cursor:pointer;" onclick="requestRefund(${o.id})">申请退款</button></div>` : ""}\n          </div>`;
    }).join("")}</div>\n      </div>`;
}

function bindMySubOrdersEvents() {
    window.requestRefund = async function(orderId) {
        if (!await customDangerConfirm("确定要申请退款吗？退款后认证将被收回。")) return;
        try {
            const r = await api("/requestRefund", "POST", {
                order_id: orderId
            });
            if (r.code === 1) {
                showToast("退款申请已提交");
                setTimeout(() => render(), 1e3);
            } else showToast(r.msg || "申请失败");
        } catch (e) {
            showToast("网络异常");
        }
    };
}

async function renderMyServiceOrders() {
    let orders = [];
    try {
        const r = await api("/myServiceOrders");
        if (r.code === 1) orders = r.data || [];
    } catch (e) {}
    const serviceMap = {
        exposure: "曝光推广",
        pin: "置顶推广"
    };
    const statusMap = {
        querying: {
            text: "正在查询支付结果",
            color: "#f59e0b"
        },
        completed: {
            text: "已完成",
            color: "#10b981"
        },
        refunded: {
            text: "已退款",
            color: "#ef4444"
        }
    };
    if (orders.length === 0) {
        return `<div class="vs-page">\n          <div class="vs-nav"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;width:40px;"><i class="fa-solid fa-angle-left" style="font-weight:600;color:#fff;"></i></div><h1>服务订单</h1><div style="width:40px;"></div></div>\n          <div style="padding:60px 20px;text-align:center;color:rgba(255,255,255,0.4);font-size:14px;"><i class="fa-solid fa-receipt" style="font-size:40px;margin-bottom:16px;display:block;opacity:0.3;"></i>暂无服务订单</div>\n        </div>`;
    }
    return `<div class="vs-page">\n        <div class="vs-nav"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;width:40px;"><i class="fa-solid fa-angle-left" style="font-weight:600;color:#fff;"></i></div><h1>服务订单</h1><div style="width:40px;"></div></div>\n        <div style="padding:12px 16px;">${orders.map(o => {
        const st = statusMap[o.status] || {
            text: o.status,
            color: "#999"
        };
        let detailHtml = "";
        try {
            const d = JSON.parse(o.details || "{}");
            if (o.service_type === "exposure") detailHtml = `<div style="display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px;"><span>曝光量</span><span style="color:#fff;">${d.count || "-"}次</span></div>`;
            if (o.service_type === "pin") detailHtml = `<div style="display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px;"><span>置顶类型</span><span style="color:#fff;">${d.pin_type === "scroll" ? "滚动置顶" : "长效固定置顶"}</span></div>`;
        } catch (e) {}
        return `<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px;margin-bottom:10px;">\n            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">\n              <span style="font-size:15px;font-weight:600;color:#fff;">${serviceMap[o.service_type] || o.service_type}</span>\n              <span style="font-size:12px;font-weight:600;color:${st.color};">${st.text}</span>\n            </div>\n            <div style="display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px;"><span>订单号</span><span style="color:rgba(255,255,255,0.7);font-family:monospace;">${o.order_no || "-"}</span></div>\n            <div style="display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px;"><span>金额</span><span style="color:#fff;font-weight:600;">¥${o.amount || 0}</span></div>\n            <div style="display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px;"><span>创建时间</span><span>${o.created_at || "-"}</span></div>\n            ${detailHtml}\n          </div>`;
    }).join("")}</div>\n      </div>`;
}

function bindMyServiceOrdersEvents() {}

function bindVerifSubscribeEvents() {}

function renderSafetyCenter() {
    return `<div class="page" style="background:#f5f5f7;min-height:100vh;">\n        <div class="navbar"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div><h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">账号安全中心</h1><div style="width:40px;"></div></div>\n        <div style="padding:12px;">\n          <div style="background:#fff;border-radius:12px;overflow:hidden;">\n            <div onclick="goPage('rulesCenter')" style="display:flex;align-items:center;padding:14px 16px;border-bottom:0.5px solid #f0f0f0;cursor:pointer;">\n              <div style="width:36px;height:36px;border-radius:50%;background:#E6F7EC;display:flex;align-items:center;justify-content:center;color:var(--color-primary);font-size:18px;"><i class="fa-solid fa-book-open"></i></div>\n              <div style="flex:1;margin-left:12px;">\n                <div style="font-size:15px;color:#333;">规则中心</div>\n                <div style="font-size:12px;color:#999;margin-top:2px;">了解社区规范和违规处罚标准</div>\n              </div>\n              <i class="fa-solid fa-chevron-right" style="color:#ccc;"></i>\n            </div>\n            <div onclick="loadViolationsList()" style="display:flex;align-items:center;padding:14px 16px;border-bottom:0.5px solid #f0f0f0;cursor:pointer;">\n              <div style="width:36px;height:36px;border-radius:50%;background:#FFF1F0;display:flex;align-items:center;justify-content:center;color:#ff2442;font-size:18px;"><i class="fa-solid fa-triangle-exclamation"></i></div>\n              <div style="flex:1;margin-left:12px;">\n                <div style="font-size:15px;color:#333;">违规记录</div>\n                <div style="font-size:12px;color:#999;margin-top:2px;">查看账号违规历史和处理结果</div>\n              </div>\n              <i class="fa-solid fa-chevron-right" style="color:#ccc;"></i>\n            </div>\n          </div>\n        </div>\n        <div id="violationsContent"></div>\n      </div>`;
}

async function bindSafetyCenterEvents() {
    loadViolationsList();
}

async function loadViolationsList() {
    try {
        const res = await api("/violations");
        const container = document.getElementById("violationsContent");
        if (!container) return;
        if (!res.data || res.data.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">暂无违规记录</div>';
        } else {
            container.innerHTML = `<div style="padding:0 12px 12px;">\n            <div style="font-size:14px;color:#666;margin-bottom:12px;padding-left:4px;">违规记录（共${res.data.length}条）</div>\n            ${res.data.map(v => `\n              <div onclick="goViolationDetail(${v.id})" style="background:#fff;border-radius:12px;padding:14px 16px;margin-bottom:10px;cursor:pointer;">\n                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">\n                  <span style="font-size:15px;font-weight:600;color:#333;">${v.content_type === "post" ? "帖子" : v.content_type === "comment" ? "评论" : v.content_type === "message" ? "私信" : v.content_type === "confession" ? "表白墙" : "内容"}违规</span>\n                  <span style="font-size:12px;color:#999;">${v.create_time || ""}</span>\n                </div>\n                <div style="display:flex;justify-content:space-between;margin-bottom:8px;">\n                  <span style="font-size:13px;color:#ff2442;">${v.violation_category}</span>\n                  <span style="font-size:13px;color:#999;">${v.penalty_type === "警告" ? "警告" : v.penalty_days + "天封禁"}</span>\n                </div>\n                <div style="font-size:13px;color:#666;line-height:1.5;">${v.content || ""}</div>\n                <div style="margin-top:8px;padding-top:8px;border-top:0.5px solid #f5f5f5;display:flex;justify-content:space-between;align-items:center;">\n                  <span style="font-size:12px;color:#999;">违规原因：${v.violation_reason}</span>\n                  ${v.appeal_status === "pending" ? '<span style="font-size:12px;color:var(--color-primary);">可申诉</span>' : v.appeal_status === "processing" ? '<span style="font-size:12px;color:#1677ff;">申诉处理中</span>' : v.appeal_status === "approved" ? '<span style="font-size:12px;color:#52c41a;">申诉通过</span>' : '<span style="font-size:12px;color:#999;">申诉失败</span>'}\n                </div>\n              </div>\n            `).join("")}\n          </div>`;
        }
    } catch (e) {
        document.getElementById("violationsContent").innerHTML = '<div style="text-align:center;padding:20px;color:#999;">加载失败</div>';
    }
}

function goViolationDetail(id) {
    window._currentViolationId = id;
    goPage("violationDetail");
}

function renderViolationDetail() {
    return `<div class="page" style="background:#f5f5f7;min-height:100vh;">\n        <div class="navbar"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div><h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">违规详情</h1><div style="width:40px;"></div></div>\n        <div id="violationDetailContent"></div>\n      </div>`;
}

async function bindViolationDetailEvents() {
    await loadViolationDetail();
}

function renderCachedAppealSection(info) {
    const token = info && info.appealToken || "";
    if (!token) {
        return `<div style="text-align:center;padding:8px;background:#f5f5f7;border-radius:8px;">\n          <span style="font-size:13px;color:#666;">如需申诉，请点击下方查看详情。</span>\n        </div>`;
    }
    const status = localStorage.getItem("zanhua_appeal_status_" + token) || (info.appealStatus || "");
    if (status === "processing") {
        return `<div style="margin-bottom:12px;">\n          <div style="text-align:center;padding:12px;background:#E8F0FE;border-radius:8px;margin-bottom:10px;">\n            <span style="font-size:13px;color:#1677ff;">申诉处理中，我们会在1-3个工作日内审核</span>\n          </div>\n          ${renderAppealLinkSection(token)}\n        </div>`;
    }
    if (status === "approved") {
        return `<div style="text-align:center;padding:12px;background:#E6F7EC;border-radius:8px;">\n          <span style="font-size:13px;color:#52c41a;">申诉通过，已解除相关限制</span>\n        </div>`;
    }
    if (status === "revoked") {
        return `<div style="text-align:center;padding:12px;background:#FFF1F0;border-radius:8px;">\n          <span style="font-size:13px;color:#ff2442;">申诉失败，维持原有处罚</span>\n        </div>`;
    }
    if (status) {
        return renderAppealLinkSection(token);
    }
    return `<div id="appealCachedStatusBox" style="text-align:center;padding:10px;color:#999;font-size:13px;">查询申诉状态中...</div>`;
}

function refreshCachedAppealStatus(info) {
    const token = info && info.appealToken || "";
    const box = document.getElementById("appealCachedStatusBox");
    if (!token || !box) return;
    fetch(API_BASE + "/appealStatus?token=" + encodeURIComponent(token), {
        headers: {
            "Content-Type": "application/json"
        }
    }).then(res => res.json()).then(data => {
        if (!box) return;
        if (data.code === 1 && data.data) {
            const v = data.data;
            let html = "";
            if (v.appeal_status === "processing") {
                html = `<div style="margin-bottom:12px;">\n                <div style="text-align:center;padding:12px;background:#E8F0FE;border-radius:8px;margin-bottom:10px;">\n                  <span style="font-size:13px;color:#1677ff;">申诉处理中，我们会在1-3个工作日内审核</span>\n                </div>\n                ${renderAppealLinkSection(v.appeal_token || token)}\n              </div>`;
            } else if (v.appeal_status === "approved") {
                html = `<div style="text-align:center;padding:12px;background:#E6F7EC;border-radius:8px;">\n                <span style="font-size:13px;color:#52c41a;">申诉通过，已解除相关限制</span>\n              </div>`;
            } else if (v.appeal_status === "revoked") {
                html = `<div style="text-align:center;padding:12px;background:#FFF1F0;border-radius:8px;">\n                <span style="font-size:13px;color:#ff2442;">申诉失败，维持原有处罚</span>\n              </div>`;
            } else {
                html = `<div style="margin-bottom:12px;">\n                <div style="font-size:14px;font-weight:500;color:#333;margin-bottom:8px;">申诉理由</div>\n                <textarea id="appealReasonByToken" placeholder="请输入申诉理由，说明您认为此处理有误的原因..." style="width:100%;height:80px;border:0.5px solid #ddd;border-radius:8px;padding:10px;font-size:13px;resize:none;box-sizing:border-box;"></textarea>\n                <button onclick="submitAppealByToken('${token}')" style="width:100%;background:var(--color-primary);color:#fff;border:none;border-radius:20px;padding:12px;font-size:15px;font-weight:600;margin-top:10px;">提交申诉</button>\n              </div>`;
            }
            box.outerHTML = html;
            return;
        }
        if (data.needCaptcha) {
            showAppealCaptcha(token);
            return;
        }
        box.innerHTML = data.msg || "查询失败";
    }).catch(() => {
        if (box) box.innerHTML = "网络异常，请稍后重试";
    });
}

async function submitAppealByToken(token) {
    const reasonEl = document.getElementById("appealReasonByToken");
    const reason = reasonEl ? reasonEl.value.trim() : "";
    if (!reason) {
        showToast("请输入申诉理由");
        return;
    }
    try {
        const res = await api("/appealSubmit", "POST", {
            token: token,
            reason: reason
        });
        if (res.code === 1) {
            try {
                localStorage.setItem("zanhua_appeal_status_" + token, "processing");
            } catch (_) {}
            showToast(res.msg || "申诉已提交");
            const appealContainer = document.getElementById("appealDetailContent");
            if (appealContainer) {
                const cached = getCachedAppealData(token) || {};
                renderAppealDetail(appealContainer, Object.assign({}, cached, {
                    appeal_status: "processing",
                    appeal_token: token
                }), token);
            }
            const container = document.getElementById("violationDetailContent");
            if (container) renderCachedBanDetail(container);
        } else {
            showToast(res.msg || "申诉失败");
        }
    } catch (e) {
        showToast("申诉失败");
    }
}

function getAppealPathToken() {
    const m = window.location.pathname.match(/\/appeal\/([0-9a-f]{32})/);
    return m ? m[1] : "";
}

let appealCaptchaIns = null;

let appealCaptchaResult = null;

function cacheAppealData(token, data) {
    try {
        localStorage.setItem("zanhua_appeal_" + token, JSON.stringify(data));
    } catch (_) {}
}

function getCachedAppealData(token) {
    try {
        return JSON.parse(localStorage.getItem("zanhua_appeal_" + token) || "null");
    } catch (_) {
        return null;
    }
}

function bootAppealPage(token) {
    setTabbarVisible(false);
    hideAppSkeleton();
    const app = document.getElementById("app");
    const navbarBack = window.history.length > 1 ? `onclick="history.back()"` : `onclick="window.location.href=(window.__BASE||'')+'/'"`;
    app.innerHTML = `<div class="page" style="background:#f5f5f7;min-height:100vh;">\n        <div class="navbar"><div ${navbarBack} style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div><h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">申诉查询</h1><div style="width:40px;"></div></div>\n        <div id="appealDetailContent"></div>\n      </div>`;
    loadAppealDetail(token);
}

function loadAppealDetail(token, captchaParam) {
    const container = document.getElementById("appealDetailContent");
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">加载中...</div>';
    const qs = "token=" + encodeURIComponent(token) + (captchaParam ? "&captchaVerifyParam=" + encodeURIComponent(captchaParam) : "");
    fetch(API_BASE + "/appealStatus?" + qs, {
        headers: {
            "Content-Type": "application/json"
        }
    }).then(res => res.json()).then(data => {
        if (!container) return;
        if (data.code === 1 && data.data) {
            cacheAppealData(token, data.data);
            renderAppealDetail(container, data.data, token);
            return;
        }
        if (data.code === 1 && data.needCaptcha) {
            showAppealCaptcha(token);
            return;
        }
        if (data.code === 1 && data.rateLimited) {
            container.innerHTML = `<div style="text-align:center;padding:40px;color:#999;">${data.msg || "您的查询次数过于频繁，请稍后再试！"}</div>`;
            return;
        }
        container.innerHTML = `<div style="text-align:center;padding:40px;color:#999;">${data.msg || "查询失败"}</div>`;
    }).catch(() => {
        if (container) container.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">网络异常，请稍后重试</div>';
    });
}

function showAppealCaptcha(token) {
    let mask = document.getElementById("appealCaptchaMask");
    if (mask) mask.remove();
    mask = document.createElement("div");
    mask.id = "appealCaptchaMask";
    mask.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:#fff;z-index:99998;display:flex;align-items:center;justify-content:center;";
    mask.innerHTML = `<div id="appealCaptchaBox"></div>`;
    document.body.appendChild(mask);
    appealCaptchaResult = null;
    appealCaptchaIns = null;
    Promise.all([ ensureCaptchaSdk(), getCaptchaSceneId() ]).then(results => {
        const sceneId = results[1];
        if (!sceneId) return;
        if (typeof window.initAliyunCaptcha !== "function") return;
        const box = document.getElementById("appealCaptchaBox");
        if (!box) return;
        window.initAliyunCaptcha({
            SceneId: sceneId,
            mode: "popup",
            element: "#appealCaptchaBox",
            language: "cn",
            timeout: 1e4,
            getInstance: function(ins) {
                appealCaptchaIns = ins;
                if (ins && ins.show) ins.show();
            },
            captchaVerifyCallback: function(param) {
                return appealCaptchaCallback(token, param);
            },
            onBizResultCallback: function(bizResult) {
                if (bizResult) {
                    const container = document.getElementById("appealDetailContent");
                    if (container && appealCaptchaResult) {
                        cacheAppealData(token, appealCaptchaResult);
                        renderAppealDetail(container, appealCaptchaResult, token);
                    } else if (appealCaptchaResult) {
                        let info = {};
                        try {
                            info = JSON.parse(localStorage.getItem("zanhua_ban_info") || "{}");
                        } catch (_) {}
                        try {
                            localStorage.setItem("zanhua_appeal_status_" + token, appealCaptchaResult.appeal_status || "processing");
                        } catch (_) {}
                        cacheAppealData(token, appealCaptchaResult);
                        const vc = document.getElementById("violationDetailContent");
                        if (vc) renderCachedBanDetail(info);
                    }
                    const m = document.getElementById("appealCaptchaMask");
                    if (m) m.remove();
                    appealCaptchaIns = null;
                }
            }
        });
    });
}

function appealCaptchaCallback(token, param) {
    return fetch(API_BASE + "/appealStatus?token=" + encodeURIComponent(token) + "&captchaVerifyParam=" + encodeURIComponent(param), {
        headers: {
            "Content-Type": "application/json"
        }
    }).then(res => res.json()).then(data => {
        if (data.code === 1 && data.data) {
            appealCaptchaResult = data.data;
            return {
                captchaResult: true,
                bizResult: true
            };
        }
        return {
            captchaResult: false,
            bizResult: false
        };
    }).catch(() => ({
        captchaResult: false,
        bizResult: false
    }));
}

function renderAppealDetail(container, v, token) {
    const tip = v.violation_reason || "账号已被限制使用";
    const reason = v.violation_reason || "账号已被限制使用";
    const blockedLabel = v.blockedLabel || (v.loginBlocked ? "禁止登录" : "") + (v.receiveBlocked ? (v.loginBlocked ? "、" : "") + "禁止接收新内容" : "");
    let appealArea = "";
    if (v.appeal_status === "processing" || v.appeal_status === "approved" || v.appeal_status === "revoked") {
        let statusHtml = "";
        if (v.appeal_status === "processing") {
            statusHtml = `<div style="text-align:center;padding:12px;background:#E8F0FE;border-radius:8px;margin-bottom:10px;">\n            <span style="font-size:13px;color:#1677ff;">申诉处理中，我们会在1-3个工作日内审核</span>\n          </div>`;
        } else if (v.appeal_status === "approved") {
            statusHtml = `<div style="text-align:center;padding:12px;background:#E6F7EC;border-radius:8px;">\n            <span style="font-size:13px;color:#52c41a;">申诉通过，已解除相关限制</span>\n          </div>`;
        } else {
            statusHtml = `<div style="text-align:center;padding:12px;background:#FFF1F0;border-radius:8px;">\n            <span style="font-size:13px;color:#ff2442;">申诉失败，维持原有处罚</span>\n          </div>`;
        }
        appealArea = `<div style="margin-bottom:12px;">${statusHtml}${v.appeal_status === "processing" ? renderAppealLinkSection(v.appeal_token || token) : ""}</div>`;
    } else {
        appealArea = `<div style="margin-bottom:12px;">\n          <div style="font-size:14px;font-weight:500;color:#333;margin-bottom:8px;">申诉理由</div>\n          <textarea id="appealReasonByToken" placeholder="请输入申诉理由，说明您认为此处理有误的原因..." style="width:100%;height:80px;border:0.5px solid #ddd;border-radius:8px;padding:10px;font-size:13px;resize:none;box-sizing:border-box;"></textarea>\n          <button onclick="submitAppealByToken('${token}')" style="width:100%;background:var(--color-primary);color:#fff;border:none;border-radius:20px;padding:12px;font-size:15px;font-weight:600;margin-top:10px;">提交申诉</button>\n        </div>`;
    }
    container.innerHTML = `<div style="padding:12px;">\n        <div style="background:#fff;border-radius:12px;padding:16px;margin-bottom:12px;">\n          <div style="text-align:center;margin-bottom:16px;">\n            <div style="width:60px;height:60px;border-radius:50%;background:#FFF1F0;display:inline-flex;align-items:center;justify-content:center;color:#ff2442;font-size:28px;"><i class="fa-solid fa-circle-exclamation"></i></div>\n            <div style="font-size:16px;font-weight:600;color:#333;margin-top:10px;">账号限制通知</div>\n          </div>\n          <div style="background:#FFF1F0;border-radius:8px;padding:12px;margin-bottom:12px;">\n            <div style="font-size:14px;color:#ff2442;margin-bottom:6px;">${blockedLabel}</div>\n            <div style="font-size:13px;color:#666;line-height:1.6;">${tip}</div>\n          </div>\n          <div style="margin-bottom:12px;">\n            <div style="font-size:14px;font-weight:500;color:#333;margin-bottom:8px;">处理详情</div>\n            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:0.5px solid #f0f0f0;">\n              <span style="font-size:13px;color:#999;">限制原因</span>\n              <span style="font-size:13px;color:#333;text-align:right;max-width:70%;">${reason}</span>\n            </div>\n            ${v.content ? `\n            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:0.5px solid #f0f0f0;">\n              <span style="font-size:13px;color:#999;">违规内容</span>\n              <span style="font-size:13px;color:#333;text-align:right;max-width:70%;">${v.content}</span>\n            </div>` : ""}\n            ${v.penalty_end_time ? `\n            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:0.5px solid #f0f0f0;">\n              <span style="font-size:13px;color:#999;">解除时间</span>\n              <span style="font-size:13px;color:#333;">${String(v.penalty_end_time).slice(0, 16)}</span>\n            </div>` : ""}\n            ${v.create_time ? `\n            <div style="display:flex;justify-content:space-between;padding:8px 0;">\n              <span style="font-size:13px;color:#999;">处理时间</span>\n              <span style="font-size:13px;color:#333;">${String(v.create_time).slice(0, 16)}</span>\n            </div>` : ""}\n          </div>\n          ${appealArea}\n        </div>\n      </div>`;
}

function renderAnnualUnbanArea(info) {
    if (!info || info.permanent || !info.unbanTicket) return "";
    return '<div id="annualUnbanArea" style="margin-bottom:12px;">' + '<div style="background:linear-gradient(135deg,#2b2140,#1f1830);border:1px solid rgba(139,92,246,0.4);border-radius:10px;padding:12px;">' + '<div style="font-size:14px;font-weight:600;color:#c4b5fd;margin-bottom:4px;"><i class="fa-solid fa-wand-magic-sparkles" style="margin-right:5px;"></i>高级认证年度解封机会</div>' + '<div style="font-size:12px;color:rgba(255,255,255,0.55);line-height:1.6;margin-bottom:10px;">持有高级认证满一年可立即解除本次非永久封禁（每个订阅年度周期仅1次）</div>' + '<button id="annualUnbanBtn" onclick="useAnnualUnban()" style="width:100%;background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:#fff;border:none;border-radius:20px;padding:11px;font-size:15px;font-weight:600;cursor:pointer;">检查并使用解封机会</button>' + "</div></div>";
}

window.useAnnualUnban = async function() {
    let info = {};
    try {
        info = JSON.parse(localStorage.getItem("zanhua_ban_info") || "{}");
    } catch (_) {}
    const btn = document.getElementById("annualUnbanBtn");
    if (btn) {
        btn.disabled = true;
        btn.textContent = "查询中...";
    }
    const headers = {
        "x-unban-ticket": info.unbanTicket || ""
    };
    try {
        let r = await fetch(API_BASE + "/annualUnbanStatus", {
            headers: headers
        }).then(x => x.json());
        if (r.code !== 1) {
            showToast(r.msg || "查询失败");
            if (btn) {
                btn.disabled = false;
                btn.textContent = "检查并使用解封机会";
            }
            return;
        }
        if (!r.data.available) {
            const map = {
                not_premium: "该机会为高级认证专属",
                under_one_year: "持有高级认证满一年后解锁",
                used_this_cycle: "本订阅年度周期内已使用过"
            };
            showToast(map[r.data.reason] || "当前无法使用该机会");
            if (btn) {
                btn.disabled = false;
                btn.textContent = "检查并使用解封机会";
            }
            return;
        }
        if (btn) btn.textContent = "解封中...";
        r = await fetch(API_BASE + "/useAnnualUnban", {
            method: "POST",
            headers: Object.assign({
                "Content-Type": "application/json"
            }, headers)
        }).then(x => x.json());
        if (r.code === 1) {
            showToast(r.msg || "封禁已解除");
            try {
                localStorage.removeItem("zanhua_ban_info");
            } catch (_) {}
            setTimeout(() => {
                try {
                    showLoginModal();
                } catch (_) {}
            }, 1200);
        } else {
            showToast(r.msg || "解封失败");
        }
    } catch (e) {
        showToast("网络异常");
    }
    if (btn) {
        btn.disabled = false;
        btn.textContent = "检查并使用解封机会";
    }
};

function renderCachedBanDetail(container) {
    if (!container) return;
    let info = {};
    try {
        info = JSON.parse(localStorage.getItem("zanhua_ban_info") || "{}");
    } catch (_) {}
    if (!info || !info.blocked) {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">没有可查看的封禁记录</div>';
        return;
    }
    const tip = info.userMsg || info.reason || "账号已被限制使用";
    const reason = info.reason || "账号已被限制使用";
    const remark = info.remark || "";
    const showEndTime = !!info.endTime;
    container.innerHTML = `<div style="padding:12px;">\n        <div style="background:#fff;border-radius:12px;padding:16px;margin-bottom:12px;">\n          <div style="text-align:center;margin-bottom:16px;">\n            <div style="width:60px;height:60px;border-radius:50%;background:#FFF1F0;display:inline-flex;align-items:center;justify-content:center;color:#ff2442;font-size:28px;"><i class="fa-solid fa-circle-exclamation"></i></div>\n            <div style="font-size:16px;font-weight:600;color:#333;margin-top:10px;">账号限制通知</div>\n          </div>\n          <div style="background:#FFF1F0;border-radius:8px;padding:12px;margin-bottom:12px;">\n            <div style="font-size:14px;color:#ff2442;margin-bottom:6px;">${info.blockedLabel || (info.loginBlocked ? "禁止登录" : "") + (info.receiveBlocked ? (info.loginBlocked ? "、" : "") + "禁止接收新内容" : "")}</div>\n            <div style="font-size:13px;color:#666;line-height:1.6;">${tip}</div>\n          </div>\n          <div style="margin-bottom:12px;">\n            <div style="font-size:14px;font-weight:500;color:#333;margin-bottom:8px;">处理详情</div>\n            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:0.5px solid #f0f0f0;">\n              <span style="font-size:13px;color:#999;">限制原因</span>\n              <span style="font-size:13px;color:#333;text-align:right;max-width:70%;">${reason}</span>\n            </div>\n            ${remark ? `\n            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:0.5px solid #f0f0f0;">\n              <span style="font-size:13px;color:#999;">备注</span>\n              <span style="font-size:13px;color:#333;text-align:right;max-width:70%;">${remark}</span>\n            </div>` : ""}\n            ${showEndTime ? `\n            <div style="display:flex;justify-content:space-between;padding:8px 0;">\n              <span style="font-size:13px;color:#999;">解除时间</span>\n              <span style="font-size:13px;color:#333;">${String(info.endTime).slice(0, 16)}</span>\n            </div>` : ""}\n          </div>\n          ${renderAnnualUnbanArea(info)}\n          ${renderCachedAppealSection(info)}\n        </div>\n        <div onclick="goPage('rulesCenter')" style="background:#fff;border-radius:12px;padding:14px 16px;margin-bottom:12px;cursor:pointer;">\n          <div style="display:flex;align-items:center;">\n            <i class="fa-solid fa-book-open" style="color:var(--color-primary);font-size:16px;"></i>\n            <span style="margin-left:8px;font-size:14px;color:#333;">查看赞话社区内容管理规范</span>\n            <i class="fa-solid fa-chevron-right" style="margin-left:auto;color:#ccc;"></i>\n          </div>\n        </div>\n      </div>`;
    refreshCachedAppealStatus(info);
}

async function loadViolationDetail() {
    const id = window._currentViolationId;
    const container = document.getElementById("violationDetailContent");
    if (!container) return;
    if (!id || !getToken()) {
        renderCachedBanDetail(container);
        return;
    }
    try {
        const res = await api("/violationDetail?id=" + id);
        if (!container || res.code !== 1) {
            renderCachedBanDetail(container);
            return;
        }
        const v = res.data;
        container.innerHTML = `<div style="padding:12px;">\n          <div style="background:#fff;border-radius:12px;padding:16px;margin-bottom:12px;">\n            <div style="text-align:center;margin-bottom:16px;">\n              <div style="width:60px;height:60px;border-radius:50%;background:#FFF1F0;display:inline-flex;align-items:center;justify-content:center;color:#ff2442;font-size:28px;"><i class="fa-solid fa-circle-exclamation"></i></div>\n              <div style="font-size:16px;font-weight:600;color:#333;margin-top:10px;">平台处理完成</div>\n            </div>\n            <div style="background:#f5f5f7;border-radius:8px;padding:12px;margin-bottom:12px;">\n              <div style="font-size:14px;color:#ff2442;margin-bottom:8px;">${v.violation_category}，已被处理</div>\n              <div style="font-size:13px;color:#666;line-height:1.6;">您发布的${v.content_type === "post" ? "帖子" : v.content_type === "comment" ? "评论" : v.content_type === "message" ? "私信" : "内容"}存在违规，已被系统删除，请遵守赞话社区规范。</div>\n            </div>\n            <div style="margin-bottom:12px;">\n              <div style="font-size:14px;font-weight:500;color:#333;margin-bottom:8px;">违规内容</div>\n              <div style="font-size:13px;color:#666;line-height:1.6;background:#f5f5f7;border-radius:8px;padding:12px;">${v.content || ""}</div>\n            </div>\n            <div style="margin-bottom:12px;">\n              <div style="font-size:14px;font-weight:500;color:#333;margin-bottom:8px;">处理详情</div>\n              <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:0.5px solid #f0f0f0;">\n                <span style="font-size:13px;color:#999;">违规原因</span>\n                <span style="font-size:13px;color:#333;">${v.violation_reason}</span>\n              </div>\n              <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:0.5px solid #f0f0f0;">\n                <span style="font-size:13px;color:#999;">处理结果</span>\n                <span style="font-size:13px;color:#ff2442;">${v.penalty_type === "警告" ? "警告" : v.penalty_days + "天封禁"}</span>\n              </div>\n              <div style="display:flex;justify-content:space-between;padding:8px 0;">\n                <span style="font-size:13px;color:#999;">处理时间</span>\n                <span style="font-size:13px;color:#333;">${v.penalty_start_time || ""}</span>\n              </div>\n            </div>\n            ${v.appeal_status === "pending" ? `\n              <div style="margin-bottom:12px;">\n                <div style="font-size:14px;font-weight:500;color:#333;margin-bottom:8px;">申诉理由</div>\n                <textarea id="appealReason" placeholder="请输入申诉理由，说明您认为此内容未违规的原因..." style="width:100%;height:80px;border:0.5px solid #ddd;border-radius:8px;padding:10px;font-size:13px;resize:none;"></textarea>\n              </div>\n              <button onclick="submitAppeal(${id})" style="width:100%;background:var(--color-primary);color:#fff;border:none;border-radius:20px;padding:12px;font-size:15px;font-weight:600;">提交申诉</button>\n            ` : v.appeal_status === "processing" ? `\n              <div style="margin-bottom:10px;text-align:center;padding:12px;background:#E8F0FE;border-radius:8px;">\n                <span style="font-size:13px;color:#1677ff;">申诉处理中，我们会在1-3个工作日内审核</span>\n              </div>\n              ${v.appeal_token ? renderAppealLinkSection(v.appeal_token) : ""}\n            ` : v.appeal_status === "approved" ? `\n              <div style="text-align:center;padding:12px;background:#E6F7EC;border-radius:8px;">\n                <span style="font-size:13px;color:#52c41a;">申诉通过，已解除相关限制</span>\n              </div>\n            ` : `\n              <div style="text-align:center;padding:12px;background:#FFF1F0;border-radius:8px;">\n                <span style="font-size:13px;color:#ff2442;">申诉失败，维持原有处罚</span>\n              </div>\n            `}\n          </div>\n          <div onclick="goPage('rulesCenter')" style="background:#fff;border-radius:12px;padding:14px 16px;margin-bottom:12px;cursor:pointer;">\n            <div style="display:flex;align-items:center;">\n              <i class="fa-solid fa-book-open" style="color:var(--color-primary);font-size:16px;"></i>\n              <span style="margin-left:8px;font-size:14px;color:#333;">查看赞话社区内容管理规范</span>\n              <i class="fa-solid fa-chevron-right" style="margin-left:auto;color:#ccc;"></i>\n            </div>\n          </div>\n          <div onclick="goPage('safetyCenter')" style="background:#fff;border-radius:12px;padding:14px 16px;cursor:pointer;">\n            <div style="display:flex;align-items:center;">\n              <i class="fa-solid fa-shield-halved" style="color:var(--color-primary);font-size:16px;"></i>\n              <span style="margin-left:8px;font-size:14px;color:#333;">返回账号安全中心</span>\n              <i class="fa-solid fa-chevron-right" style="margin-left:auto;color:#ccc;"></i>\n            </div>\n          </div>\n        </div>`;
    } catch (e) {
        document.getElementById("violationDetailContent").innerHTML = '<div style="text-align:center;padding:40px;color:#999;">获取失败</div>';
    }
}

async function submitAppeal(id) {
    const reason = document.getElementById("appealReason").value.trim();
    if (!reason) {
        showToast("请输入申诉理由");
        return;
    }
    try {
        const res = await api("/appealViolation", "POST", {
            id: id,
            reason: reason
        });
        if (res.code === 1) {
            showToast(res.msg);
            await loadViolationDetail();
        } else {
            showToast(res.msg || "申诉失败");
        }
    } catch (e) {
        showToast("申诉失败");
    }
}

let reportTargetType = "";

let reportTargetId = 0;

let reportReason = "";

let reportSubReason = "";

let reportImages = [];

const REPORT_REASONS = [ {
    key: "porn",
    label: "色情低俗",
    subs: [ "色情图片/视频", "色情文字描述", "性暗示/软色情", "招嫖/性交易" ]
}, {
    key: "politics",
    label: "涉政敏感",
    subs: [ "造谣污蔑国家领导人", "分裂国家言论", "境外反华宣传", "其他涉政敏感" ]
}, {
    key: "violence",
    label: "暴力恐怖",
    subs: [ "宣扬恐怖主义", "暴力血腥画面", "教唆自残自杀", "武器/管制刀具" ]
}, {
    key: "illegal",
    label: "违法违禁",
    subs: [ "毒品/违禁药品", "赌博/博彩", "诈骗/违法犯罪", "伪造证件/假币" ]
}, {
    key: "harass",
    label: "人身攻击/骚扰",
    subs: [ "辱骂/人身攻击", "地域/性别歧视", "恶意引战/挑事", "骚扰/威胁" ]
}, {
    key: "ad",
    label: "广告引流",
    subs: [ "站外引流/推广", "刷单/兼职广告", "带货/营销推广", "垃圾广告信息" ]
}, {
    key: "fake",
    label: "虚假信息",
    subs: [ "造谣/不实信息", "冒充他人", "虚假身份", "其他虚假内容" ]
}, {
    key: "other",
    label: "其他违规",
    subs: [ "侵犯隐私", "盗用原创", "未成年人不良内容", "其他" ]
} ];

function goReport(targetType, targetId) {
    if (!requireLogin()) return;
    reportTargetType = targetType;
    reportTargetId = targetId;
    reportReason = "";
    reportSubReason = "";
    reportImages = [];
    goPage("report");
}

function renderAgreementDoc(title, contentHtml) {
    return `<div class="page">\n        <div class="navbar" style="position:fixed;top:0;left:0;right:0;z-index:100;background:#fff;">\n          <div onclick="goBack()" style="font-size:22px;cursor:pointer;color:#333;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div>\n          <h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">${title}</h1>\n          <div style="width:28px;"></div>\n        </div>\n        <div style="padding-top:calc(50px + env(safe-area-inset-top));"></div>\n        <div style="padding:20px 16px;line-height:1.8;font-size:14px;color:#333;">${contentHtml}</div>\n      </div>`;
}

const _AGREE_TEXT_MINOR = `\n<h2 style="font-size:17px;font-weight:700;margin:0 0 12px;color:#333;text-align:center;">赞话未成年人（含儿童）隐私政策</h2>\n<p style="margin-bottom:14px;font-size:12px;color:#999;text-align:center;">版本更新日期：2026年8月28日</p>\n<p style="margin-bottom:14px;font-size:12px;color:#999;text-align:center;">生效日期：2026年8月28日</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">赞话（以下简称“我们”或“本平台”）深知未成年人，尤其是不满十四周岁儿童个人信息安全的重要性。未成年人的心智尚未完全成熟，个人信息一旦遭到不当收集、使用、披露或传播，可能对其人格尊严、人身财产安全及未来发展造成难以估量的损害。因此，我们依据《中华人民共和国民法典》《中华人民共和国网络安全法》《中华人民共和国数据安全法》《中华人民共和国个人信息保护法》《中华人民共和国未成年人保护法》《儿童个人信息网络保护规定》《未成年人网络保护条例》以及《信息安全技术 个人信息安全规范》（GB/T 35273—2020）等法律法规、部门规章及国家标准的有关规定，制定本《赞话未成年人（含儿童）隐私政策》（以下简称“本政策”）。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">本政策是《赞话用户隐私政策》不可分割的特别组成部分，专门就未成年人在使用赞话平台服务过程中涉及的个人信息处理规则作出更为严格、细化的规定。我们恳请阁下及阁下的监护人务必认真、完整地阅读并充分理解本政策全部内容，特别是以加粗、下划线或其他显著方式提示的条款。若阁下为未成年人，请在阁下的父母或其他监护人（以下统称“监护人”）陪同下阅读本政策，并在取得监护人明确同意后，方可使用本平台服务。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第一条 定义与适用范围</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 未成年人：指不满十八周岁的自然人。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 儿童：指不满十四周岁的未成年人。根据《中华人民共和国个人信息保护法》及《儿童个人信息网络保护规定》，儿童个人信息属于敏感个人信息，受到更高等级的法律保护。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">3. 监护人：指依法对未成年人承担监护职责的父母或者其他具有监护资格的个人或组织。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">4. 未成年人个人信息：指以电子或者其他方式记录的，能够单独或者与其他信息结合识别特定未成年人身份或者反映特定未成年人活动情况的各种信息，包括但不限于姓名、出生日期、身份证件号码、生物识别信息、住址、电话号码、电子邮箱、健康信息、行踪信息、网络身份标识、设备信息以及未成年人使用服务过程中产生的内容信息与行为信息等。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">5. 处理：包括个人信息的收集、存储、使用、加工、传输、提供、公开、删除等行为。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">本政策适用于赞话平台向未成年人提供的所有产品及服务。凡本政策与《赞话用户隐私政策》不一致之处，以本政策为准；本政策未作特别规定的，适用《赞话用户隐私政策》及《赞话用户服务协议》的相关约定。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第二条 处理未成年人个人信息的基本原则</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">我们处理未成年人个人信息，将严格遵循以下基本原则：</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 合法性原则：处理未成年人个人信息应当具有明确、合理的目的，并遵循合法、正当、必要的原则，不得过度处理。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 最小必要原则：仅收集与实现服务功能直接相关、且为实现该功能所必需的最少类型的个人信息，不得收集与其提供服务无关的信息。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">3. 监护人同意原则：处理不满十四周岁儿童个人信息前，应当通过显著、清晰、易于理解的方式，真实、准确、完整地向监护人告知处理事项，并取得监护人的单独同意。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">4. 目的限定原则：处理未成年人个人信息应当限于实现特定目的，不得扩大使用范围；确需变更处理目的的，应当重新取得监护人同意。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">5. 安全保障原则：采取与未成年人个人信息风险相适应的安全技术措施和管理制度，防止信息泄露、篡改、丢失。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">6. 公开透明原则：以明确、易懂的方式公开处理规则，并接受监护人及社会监督。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">7. 分级保护原则：对不满十四周岁儿童的个人信息给予特别保护；对已满十四周岁不满十八周岁未成年人的个人信息，依法予以适当保护。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第三条 监护人同意机制</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 若阁下为不满十四周岁的儿童，在使用本平台任何服务前，应当由阁下的监护人完整阅读并同意《赞话用户服务协议》《赞话用户隐私政策》及本政策。未经监护人依法同意，我们不会主动收集、使用儿童个人信息。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 我们采取以下方式之一取得监护人同意：</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">（1）通过注册页面弹窗、短信验证、邮件确认、勾选声明等方式，由监护人作出明确同意；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">（2）通过上传监护人身份证明、监护关系证明等材料进行核验后，取得同意；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">（3）根据法律、行政法规规定可以不经监护人同意的其他情形除外。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">3. 若阁下为已满十四周岁不满十八周岁的未成年人，应当在监护人的指导和监督下阅读本政策及《赞话用户服务协议》，并在监护人同意后使用本平台服务。我们有权在合理范围内核验监护关系及同意有效性。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">4. 监护人应当加强对未成年人使用网络行为的监督和引导，教育未成年人增强个人信息保护意识，不随意向他人泄露个人信息，不轻信网络信息，不参与网络欺凌等违法活动。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">5. 若我们发现平台在未事先获得可证实的监护人同意的情况下收集了儿童个人信息，将尽快删除相关信息。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第四条 未成年人个人信息的收集</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">我们仅在实现下列功能所必需的范围内收集未成年人个人信息：</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">（一）账号注册与身份识别信息</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">未成年人注册账号时，我们仅收集必要的网络身份标识信息，例如手机号码、昵称、头像等，用于创建账号、登录验证和身份识别。我们不会主动收集未成年人的真实姓名、身份证件号码、生物识别信息、住址等敏感个人信息；如特定功能依法确需收集的，将另行取得监护人单独同意。我们不会向未成年人开放需提交身份证件号码、企业资质等敏感信息的认证功能。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">（二）使用行为信息</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">未成年人使用本平台时，我们会收集其发布内容、点赞、评论、收藏、关注、分享、浏览记录、搜索记录等使用行为信息，用于提供、维护和优化服务，保障平台内容安全与用户体验。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">（三）设备与日志信息</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">为保障账号安全、防范网络攻击与欺诈行为，我们会收集设备型号、操作系统版本、设备唯一标识符（如 Android ID、IDFA、OAID 等）、IP 地址、网络接入方式、访问时间、操作日志等信息。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">（四）经授权调用的设备权限</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">未经监护人明确同意，我们不会开启未成年人设备的相机、麦克风、相册、位置等敏感权限。如特定服务确需调用，我们将以弹窗等方式单独提示，并取得监护人同意。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">（五）依法无需同意的情形</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">根据《中华人民共和国个人信息保护法》第十三条第二款等相关规定，以下情形处理个人信息不需要取得个人同意；涉及儿童个人信息的，我们仍会审慎评估，并在法律允许范围内处理：</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 为订立、履行个人作为一方当事人的合同所必需；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 为履行法定职责或者法定义务所必需；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">3. 为应对突发公共卫生事件，或者紧急情况下为保护自然人的生命健康和财产安全所必需；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">4. 为公共利益实施新闻报道、舆论监督等行为，在合理的范围内处理个人信息；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">5. 依照法律规定在合理的范围内处理个人自行公开或者其他已经合法公开的个人信息；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">6. 法律、行政法规规定的其他情形。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第五条 未成年人个人信息的使用</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">我们仅在下列目的范围内使用未成年人个人信息：</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 创建、维护未成年人账号，提供账号登录、身份验证、密码找回等服务；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 展示、发布、推送未成年人自主创作的内容及互动信息；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">3. 保障未成年人账号及平台安全，防范网络诈骗、恶意注册、账号盗用、内容滥用等风险；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">4. 依法对平台内容进行审核，过滤暴力、色情、赌博、恐怖、邪教、欺凌等不适宜未成年人接触的信息；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">5. 提供青少年模式、防沉迷等保护功能；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">6. 向监护人提供必要的通知、提示；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">7. 根据法律、行政法规规定或有权机关要求，配合调查取证、举报处理等。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">除另有约定外，我们不会利用未成年人个人信息进行自动化决策或用户画像，不会向未成年人推送定向广告，不会实施与未成年人年龄、认知能力明显不符的个性化推荐。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第六条 未成年人个人信息的共享、委托处理、转移与披露</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">我们高度重视未成年人个人信息的安全，原则上不会向第三方共享、转让或公开披露未成年人个人信息。仅在以下情形下，可能依法进行共享或披露：</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 取得监护人单独同意：在事先获得监护人的明确、单独同意后，向特定第三方提供；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 法律法规要求：根据法律、行政法规、司法裁判、行政机关的决定或命令，必须提供；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">3. 保护重大利益所必需：为保护未成年人或其他用户的生命、身体、财产等重大合法权益所必需，且难以取得监护人同意的；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">4. 委托处理：与经过严格筛选并签署数据处理协议的授权合作伙伴共享必要信息，仅用于提供技术支持、云存储、内容审核、短信发送等服务，且未经我们授权不得用于其他目的；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">5. 合并、分立、解散、被宣告破产等原因转移：需要转移个人信息的，我们将向接收方告知接收方的名称或者姓名和联系方式，并要求接收方继续履行本政策及法律法规规定的义务；接收方变更处理目的、处理方式的，应当依法重新取得监护人同意。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">除上述情形外，我们不会向任何第三方出售、出租、交换或非法提供未成年人个人信息。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第七条 未成年人个人信息的存储与跨境传输</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 未成年人个人信息原则上存储于中华人民共和国境内，不向境外传输。如确因业务需要向境外提供的，将依照《中华人民共和国个人信息保护法》第三十八条至第四十条的规定，通过国家网信部门组织的安全评估、专业机构认证或者签订标准合同等方式，保障境外接收方处理活动达到法定保护标准，并取得监护人单独同意。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 我们仅在实现处理目的所必需的期限内保存未成年人个人信息。保存期限届满的，将采取删除、匿名化处理等措施。法律法规另有规定的，从其规定。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">3. 未成年人注销账号后，我们将及时删除或匿名化其个人信息；但依据《中华人民共和国网络安全法》等规定需要留存日志不少于六个月的，依法留存。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第八条 安全保护措施</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 我们已任命专门的未成年人个人信息保护负责人，负责统筹未成年人个人信息安全工作，受理投诉举报，并定期开展个人信息保护影响评估。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 我们采取下列安全技术措施：</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">（1）对未成年人个人信息进行加密存储、加密传输；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">（2）建立分级访问控制机制，仅限经授权的必要人员访问；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">（3）部署防火墙、入侵检测系统、防病毒系统等网络安全防护措施；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">（4）建立日志留存与审计制度，对信息处理行为进行记录和追溯；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">（5）定期开展安全漏洞扫描与渗透测试。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">3. 我们建立未成年人个人信息安全事件应急预案。一旦发生或者可能发生信息泄露、篡改、丢失的，我们将立即启动应急预案，采取补救措施，并按照法律法规要求及时告知监护人和相关部门。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">4. 我们定期对从业人员进行未成年人个人信息保护培训，并与其签订保密协议，明确保密义务和违约责任。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第九条 未成年人及监护人的权利</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">为保障未成年人及其监护人的合法权益，依据《中华人民共和国个人信息保护法》等规定，监护人及未成年人享有以下权利：</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 知情权：有权要求我们告知未成年人个人信息的处理目的、方式、种类、保存期限、行使权利的方式等；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 查阅、复制权：有权查阅、复制未成年人个人信息；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">3. 更正、补充权：发现信息不准确或不完整的，有权要求更正、补充；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">4. 删除权：符合法定情形时，有权要求删除未成年人个人信息；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">5. 撤回同意权：有权撤回先前作出的同意，撤回后不影响撤回前基于同意已进行的处理的效力；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">6. 限制处理权：在特定情形下，有权要求我们限制对未成年人个人信息的处理；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">7. 可携带权：符合法定条件的，有权要求将个人信息转移至其他指定平台；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">8. 投诉举报权：有权向我们的未成年人个人信息保护负责人投诉，或向国家网信部门、市场监督管理部门等监管机构举报。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">监护人行使上述权利的，可以通过本政策第十二条载明的联系方式向我们提出。我们将在核实身份后15个工作日内予以处理，法律法规另有规定或情况复杂的，可依法延长。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第十条 内容安全与防沉迷保护</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 我们建立内容审核机制，通过机器审核与人工审核相结合的方式，对未成年人可接触的内容进行筛选，过滤不适宜未成年人身心健康的暴力、色情、低俗、恐怖、赌博、邪教、封建迷信、欺凌等内容。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 我们提供青少年模式。该模式下：</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">（1）限制单次使用时长及每日累计使用时长；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">（2）限制部分功能的使用权限；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">（3）过滤不适宜内容，提供适龄内容池；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">（4）不提供充值打赏、付费服务或大额消费功能。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">3. 我们鼓励监护人开启家长监督功能，参与未成年人网络使用管理，共同营造健康网络环境。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">4. 若发现未成年人发布或传播违法违规信息，我们将依法采取删除、限制功能、封禁账号等措施，并视情况通知监护人。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">5. 若监护人发现未成年人账号存在异常使用情况或接到未成年人关于网络欺凌、不良信息等投诉，可通过本政策载明的联系方式与我们联系，我们将在核实后依法及时处理。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第十一条 未成年人个人信息保护负责人</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">我们设立未成年人个人信息保护负责人，负责监督本政策的执行，处理监护人及未成年人提出的权利请求与投诉，定期向管理层报告未成年人个人信息保护情况。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">未成年人个人信息保护负责人联系方式：</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">邮箱：zanhuadev@163.com</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">平台内“反馈”功能：请注明“未成年人个人信息保护”。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第十二条 政策的更新</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">我们可能根据法律法规变化、产品功能调整、安全能力升级等原因适时更新本政策。发生下列重大变更时，我们将通过平台显著位置公告、弹窗提示、邮件通知等方式告知监护人和未成年人，并依法重新取得监护人同意（如涉及儿童个人信息处理目的、方式等重大变更）：</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 处理目的、处理方式发生重大变化；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 共享、转让、公开披露的对象发生重大变化；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">3. 用户权利及其行使方式发生重大变化；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">4. 安全措施发生重大变化；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">5. 其他可能对未成年人个人信息权益产生重大影响的变更。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">更新后的政策自公告载明的生效日期起生效。监护人及未成年人继续使用本平台服务的，视为已阅读并接受更新后的政策；但涉及需要重新取得同意的变更，我们将在取得同意后再生效。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第十三条 法律适用与争议解决</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">本政策的订立、执行、解释及争议解决均适用中华人民共和国法律。因本政策产生的争议，双方应友好协商解决；协商不成的，任何一方均可向本平台运营者住所地有管辖权的人民法院提起诉讼。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">----------</p>\n    `;

const _AGREE_TEXT_PRIVACY = `\n<h2 style="font-size:17px;font-weight:700;margin:0 0 12px;color:#333;text-align:center;">赞话用户隐私政策</h2>\n<p style="margin-bottom:14px;font-size:12px;color:#999;text-align:center;">版本更新日期：2026年8月28日</p>\n<p style="margin-bottom:14px;font-size:12px;color:#999;text-align:center;">生效日期：2026年8月28日</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">赞话（以下简称“我们”或“本平台”）深知个人信息对阁下人格尊严、人身财产安全及隐私权益的重要性。我们始终致力于依法保护阁下的个人信息，遵守《中华人民共和国民法典》《中华人民共和国网络安全法》《中华人民共和国数据安全法》《中华人民共和国个人信息保护法》《网络信息内容生态治理规定》《互联网用户账号信息管理规定》《移动互联网应用程序信息服务管理规定》以及《信息安全技术 个人信息安全规范》（GB/T 35273—2020）等法律法规、部门规章及国家标准，建立健全个人信息保护制度，采取相应的安全保护措施，尽力保障阁下的个人信息安全可控。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">本《赞话用户隐私政策》（以下简称“本政策”）旨在向阁下清晰说明：我们如何收集、使用、存储、共享、转移、公开披露阁下的个人信息，以及阁下享有的权利和行使方式。请阁下在使用本平台服务前，务必审慎阅读、充分理解本政策全部内容。阁下注册或使用本平台服务，即表示阁下已充分理解并同意本政策。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">特别提示：若阁下为未满十八周岁的未成年人，请阁下的监护人仔细阅读本政策及《赞话未成年人（含儿童）隐私政策》，并在监护人同意后使用本平台服务。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第一条 定义</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 个人信息：指以电子或者其他方式记录的与已识别或者可识别的自然人有关的各种信息，不包括匿名化处理后的信息。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 敏感个人信息：指一旦泄露或者非法使用，容易导致自然人的人格尊严受到侵害或者人身、财产安全受到危害的个人信息，包括生物识别、宗教信仰、特定身份、医疗健康、金融账户、行踪轨迹等信息，以及不满十四周岁未成年人的个人信息。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">3. 处理：包括个人信息的收集、存储、使用、加工、传输、提供、公开、删除等。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">4. 匿名化：指个人信息经过处理无法识别特定自然人且不能复原的过程。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">5. 去标识化：指个人信息经过处理，使其在不借助额外信息的情况下无法识别特定自然人的过程。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第二条 适用范围</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">本政策适用于赞话平台通过网站、移动应用程序、小程序等形式向阁下提供的全部产品及服务。第三方通过本平台向阁下提供的服务，适用其自身隐私政策，不适用本政策。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第三条 信息收集</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">（一）注册与账号信息</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">当阁下注册账号时，我们可能收集：</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 手机号码：用于账号注册、登录验证及安全保护；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 昵称、头像：用于展示阁下的网络身份；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">3. 性别、生日、国家或地区：用于内容推荐与功能适配；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">4. 账号密码：经不可逆加密后存储，我们无法获知明文密码。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">（二）使用信息</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">当阁下使用本平台服务时，我们可能收集：</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 发布与互动内容：阁下发布的文字、图片、视频、音频、评论，以及点赞、收藏、关注、分享等操作记录；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 日志信息：设备型号、操作系统版本、IP 地址、网络接入方式、访问时间、浏览记录、搜索记录、崩溃日志等；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">3. 设备信息：为保障账号安全与风险控制，我们可能收集设备唯一标识符（如 Android ID、IDFA、OAID）、设备序列号、设备 MAC 地址等；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">4. 位置信息：基于 IP 地址解析的大致地理位置，用于内容展示与风控；经阁下单独授权后，可获取精确定位信息。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">（三）图片/视频信息</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">当阁下上传图片、视频时，我们会存储相应内容用于平台展示。为保护版权、防止恶意盗用并实现截图溯源，部分受保护内容在展示时会嵌入不可见的数字水印信息。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">（四）认证信息</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">当阁下申请实名认证或企业认证时，我们可能收集并加密存储阁下的真实姓名、身份证件号码、企业名称、统一社会信用代码、营业执照等资质信息，仅用于身份核验与合规审查。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">特别说明：未成年人账号不开放需收集身份证件号码的实名认证或企业认证功能。如特定功能确需收集未满十四周岁儿童上述信息的，我们将另行取得其监护人的单独同意；已满十四周岁不满十八周岁的未成年人申请认证的，应取得监护人同意。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">（五）违规与风控信息</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">当阁下账号被举报或触发平台风控规则时，我们可能收集并记录阁下的手机号码、IP 地址、设备标识、违规记录、举报信息等，用于核实处理违规行为、维护平台秩序。对存在严重违规行为的账号，其关联的手机号码、IP 地址、设备标识等信息可能被纳入平台风控名单，以防止其继续使用本平台服务。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">风控名单信息仅用于平台内部风险控制与违规处理，保存期限为实现上述目的所必需的最短时间，一般不超过账号封禁后两年；法律法规另有规定的，从其规定。阁下如因他人违规导致自身受到风控措施影响，或对风控名单信息有异议，可通过本政策第十三条载明的联系方式提出申诉，我们将在核实后及时处理。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">（六）设备权限调用</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">我们可能申请调用阁下的下列设备权限：</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 相机：用于拍摄并上传图片、视频；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 相册：用于选择并上传图片、视频；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">3. 麦克风：用于录制音频、视频；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">4. 通知：用于向阁下发送通知消息；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">5. 位置：用于提供基于位置的服务。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">上述权限均需阁下单独授权，阁下可随时在设备设置中关闭。关闭权限可能导致部分功能无法正常使用，但不影响其他功能。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第四条 信息使用</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">我们收集的个人信息用于以下目的：</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 提供、维护、改进和优化平台服务；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 保障账号与网络安全，防范欺诈、恶意注册、内容盗用等违法活动；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">3. 内容审核与平台治理，保障平台内容合法合规；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">4. 向阁下发送与账号、服务相关的通知、验证码、安全提示；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">5. 统计分析、运营分析，优化产品体验；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">6. 风险控制与安全审计；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">7. 依据法律法规要求，配合有关机关查询、调查、取证；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">8. 其他经阁下明确同意的用途。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第五条 Cookie 及同类技术</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">我们可能使用 Cookie、Web Beacon、脚本及其他同类技术，以提升用户体验、保障安全、进行统计。阁下可以通过浏览器或设备设置管理或清除 Cookie。关闭 Cookie 可能影响部分功能的正常使用。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第六条 第三方 SDK 与授权合作伙伴</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">为实现特定功能，我们可能接入第三方提供的软件开发工具包（SDK）。第三方 SDK 将依据其自身规则处理部分个人信息。我们仅会与具备合法资质并签署数据处理协议的伙伴合作，并采取必要措施监督其合规性。我们目前使用的第三方 SDK 及服务包括：</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 高德地图 SDK</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">功能类型：定位、地图展示</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">收集个人信息类型：位置信息（精确或大致）、设备信息（设备标识符、操作系统版本等）、网络信息</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">使用目的：提供基于位置的内容推荐、距离展示、附近功能等</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">隐私政策链接：https://lbs.amap.com/pages/privacy/</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 腾讯云 SDK</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">功能类型：云存储、内容分发、安全防护</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">收集个人信息类型：设备信息、日志信息、用户上传的内容（加密存储）</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">使用目的：数据存储、内容加速、基础安全防护</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">隐私政策链接：https://cloud.tencent.com/document/product/301/11470</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">3. 阿里云 SDK</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">功能类型：云存储、安全防护、短信发送、内容安全</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">收集个人信息类型：手机号码、日志信息、设备信息、用户上传的内容</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">使用目的：短信验证码发送、数据存储、内容审核</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">隐私政策链接：https://www.aliyun.com/sswd/168614-1.html</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">4. Cloudflare SDK</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">功能类型：网络安全、内容分发、DDoS 防护</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">收集个人信息类型：IP 地址、访问日志、设备信息</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">使用目的：保障平台网络安全、防止恶意攻击</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">隐私政策链接：https://www.cloudflare.com/privacypolicy/</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">5. 亚马逊云中国区 SDK（由北京光环新网科技有限公司运营）</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">功能类型：云存储、计算资源</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">收集个人信息类型：用户上传的内容、日志信息</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">使用目的：数据存储、服务部署</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">隐私政策链接：https://www.amazonaws.cn/privacy/</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">6. 华为云 SDK</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">功能类型：云存储、推送服务</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">收集个人信息类型：设备标识符、日志信息、推送令牌</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">使用目的：消息推送、数据存储</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">隐私政策链接：https://www.huaweicloud.com/declaration/sa_prp.html</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">以上第三方服务仅用于实现特定功能，我们不会向其提供与服务无关的个人信息。阁下可查阅各第三方隐私政策了解详情。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第七条 信息共享、转让与公开披露</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 我们不会向第三方出售阁下的个人信息。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 仅在下列情形下，我们可能共享阁下信息：</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">（1）获得阁下单独同意；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">（2）根据法律法规要求或司法/行政机关的强制性要求；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">（3）为保护我们及用户的合法权益所必需，且难以取得阁下同意的；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">（4）与授权合作伙伴共享，仅用于实现本政策声明的目的。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">3. 我们不会公开披露阁下的个人信息，但依法公开或取得阁下单独同意的除外。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">4. 发生合并、分立、解散、被宣告破产等情形时，我们将依法处理个人信息转移，并告知接收方信息。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第八条 信息存储与跨境传输</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 阁下的个人信息存储于中华人民共和国境内。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 我们仅在实现处理目的所必需的期限内保存个人信息，超出期限后删除或匿名化；但法律、行政法规另有规定，或为履行法定义务、保障网络安全和风控所必需的除外。例如，依据《中华人民共和国网络安全法》规定，网络日志留存时间不少于六个月；依据平台安全风控需要，涉及严重违规的账号关联手机号码、IP地址、设备标识等信息可能在必要期限内保留。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">3. 确需向境外提供个人信息的，将依法通过安全评估、认证或签订标准合同等方式进行，并取得阁下的单独同意（如涉及敏感个人信息）。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第九条 安全保护</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">我们采取下列安全措施保护阁下的个人信息：</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 采用加密、脱敏、去标识化等技术手段；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 建立访问控制与权限管理制度；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">3. 部署防火墙、入侵检测、防病毒等安全设施；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">4. 定期开展安全审计与风险评估；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">5. 制定安全事件应急预案并开展演练；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">6. 对从业人员进行安全培训并签订保密协议。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">但请阁下知悉，互联网环境并非绝对安全，我们无法保证百分之百不受攻击或泄露。若发生安全事件，我们将依法及时通知阁下及监管部门。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第十条 阁下的权利</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">依据《中华人民共和国个人信息保护法》，阁下享有以下权利：</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 知情权、决定权：有权知悉并决定阁下的个人信息如何处理；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 限制或拒绝处理权：有权限制或拒绝我们处理阁下的个人信息；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">3. 查阅、复制权：有权查阅、复制阁下的个人信息；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">4. 更正、补充权：有权要求更正、补充不准确或不完整的个人信息；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">5. 删除权：符合法定情形时，有权要求删除个人信息；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">6. 注销权：有权注销账号；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">7. 撤回同意权：有权撤回对处理的同意；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">8. 可携带权：符合法定条件时，有权要求将个人信息转移至指定平台；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">9. 投诉举报权：有权向我们的个人信息保护负责人投诉或向监管机构举报。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第十一条 未成年人特别保护</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">我们非常重视未成年人个人信息保护。若阁下为未成年人，请在使用本平台服务前，务必取得监护人的同意。对于经监护人同意而收集的未成年人信息，我们仅在法律允许、监护人明确同意或保护未成年人所必要的情况下使用或披露。专门适用于未成年人的规则，请查阅《赞话未成年人（含儿童）隐私政策》。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第十二条 政策的更新</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">本政策可能根据法律法规变化、产品功能调整等原因更新。发生重大变更时，我们将在平台内通过显著方式通知阁下，并在必要时重新取得阁下的同意。阁下继续使用服务即视为接受更新后的政策，但涉及需要重新取得同意的变更，我们将在取得同意后再生效。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第十三条 联系方式</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">如阁下对本政策有任何疑问、意见或建议，或需要行使阁下的权利，请通过以下方式联系我们：</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 平台内“反馈”功能；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 官方邮箱：zanhuadev@163.com。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">我们将在收到阁下反馈后尽快处理，一般不超过15个工作日。</p>\n <h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第十四条 法律适用与争议解决</h3>\n <p style="margin-bottom:10px;text-indent:2em;color:#333;">本政策适用中华人民共和国法律。因本政策产生的争议，双方应协商解决；协商不成的，向本平台运营者住所地有管辖权的人民法院提起诉讼。</p>\n <p style="margin-bottom:10px;text-indent:2em;color:#333;">----------</p>\n    `;

const _AGREE_TEXT_SERVICE = `\n<h2 style="font-size:17px;font-weight:700;margin:0 0 12px;color:#333;text-align:center;">赞话用户服务协议</h2>\n<p style="margin-bottom:14px;font-size:12px;color:#999;text-align:center;">版本更新日期：2026年8月28日</p>\n<p style="margin-bottom:14px;font-size:12px;color:#999;text-align:center;">生效日期：2026年8月28日</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第一条 总则与协议的接受</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">欢迎阁下使用“赞话”社交平台（以下简称“本平台”）！</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">为使用赞话平台服务，阁下应当阅读并遵守《赞话用户服务协议》（以下简称“本协议”）以及《赞话用户隐私政策》《赞话未成年人（含儿童）隐私政策》。请阁下务必审慎阅读、充分理解各条款内容，特别是免除或限制责任的条款，以及开通或使用某项服务的单独约定，并选择接受或不接受。限制、免责条款可能以显著形式提示阁下注意。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">除非阁下已阅读并接受本协议所有条款，否则阁下无权注册、登录或使用本平台服务。阁下的注册、登录、使用等行为即视为阁下已阅读并同意上述协议的约束。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">如果阁下未满18周岁，请在法定监护人的陪同下阅读本协议及上述其他协议，并特别注意未成年人使用条款。特别地，如果阁下是未满14周岁的儿童，则在完成账号注册前，还应请阁下的监护人仔细阅读本平台专门制定的《赞话未成年人（含儿童）隐私政策》。只有在取得监护人对《赞话未成年人（含儿童）隐私政策》的同意后，未满14周岁的儿童方可使用本平台服务。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">本协议是阁下与本平台运营者之间就阁下使用本平台产品及服务所订立的具有法律约束力的合同。本平台运营者依据《中华人民共和国民法典》《中华人民共和国网络安全法》《中华人民共和国数据安全法》《中华人民共和国个人信息保护法》《网络信息内容生态治理规定》《互联网用户账号信息管理规定》等法律法规制定本协议。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">本平台有权根据法律法规、监管政策及产品运营需要，不时修订本协议。修订后的协议将在平台显著位置公布，自公布之日起生效。阁下继续使用本平台服务，即视为接受修订后的协议；但涉及重大变更的，我们将以适当方式通知阁下。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第二条 定义</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 用户：指注册、登录或使用本平台服务的自然人、法人或其他组织，本协议中敬称“阁下”。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 账号：指阁下为使用本平台服务而注册的账户。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">3. 内容：指阁下在本平台发布的文字、图片、视频、音频、链接、文件等信息。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">4. 风控名单：指本平台为防范恶意注册、内容盗用、严重违规等风险，对关联手机号、IP 地址、设备标识等信息采取限制措施的内部名单。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第三条 账号注册与管理</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 阁下在注册账号时，应当提供真实、准确、完整、合法的个人资料，并在资料发生变更时及时更新。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 阁下的账号名称、头像、简介等身份信息不得含有违法或不良内容，不得冒用他人身份，不得侵害他人合法权益。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">3. 阁下应妥善保管账号和密码。因阁下保管不善或主动向他人泄露导致的损失，由阁下自行承担。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">4. 阁下不得将账号转让、出借、出租或出售给他人使用。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">5. 本平台有权对阁下提交的资料进行审核。如发现虚假、不实或违法违规信息，有权拒绝注册、暂停或终止账号使用。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">6. 账号所有权：赞话账号的所有权归本平台所有，阁下完成注册后仅获得账号的使用权，且该使用权仅属于初始注册人。未经本平台书面同意，阁下不得以任何方式赠与、借用、租用、转让或售卖账号。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第四条 用户行为规范</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">阁下在使用本平台服务时，应当遵守国家法律法规及社会公序良俗，不得发布、传播含有下列内容的信息：</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 违反宪法确定的基本原则的；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 危害国家安全，泄露国家秘密，颠覆国家政权，破坏国家统一的；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">3. 损害国家荣誉和利益的；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">4. 歪曲、丑化、亵渎、否定英雄烈士事迹和精神，以侮辱、诽谤或者其他方式侵害英雄烈士的姓名、肖像、名誉、荣誉的；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">5. 宣扬恐怖主义、极端主义或者煽动实施恐怖活动、极端主义活动的；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">6. 煽动民族仇恨、民族歧视，破坏民族团结的；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">7. 破坏国家宗教政策，宣扬邪教和封建迷信的；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">8. 散布谣言，扰乱社会秩序，破坏社会稳定的；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">9. 散布淫秽、色情、赌博、暴力、凶杀、恐怖或者教唆犯罪的；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">10. 煽动非法集会、结社、游行、示威、聚众扰乱社会秩序的；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">11. 侮辱、诽谤他人，侵害他人名誉、隐私、肖像等合法权益的；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">12. 侵犯他人知识产权、商业秘密的；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">13. 侵害未成年人合法权益或者损害未成年人身心健康的；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">14. 其他违反法律法规、公序良俗或《网络信息内容生态治理规定》的内容。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">此外，阁下还不得实施下列行为：</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 恶意注册、批量注册账号；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 利用技术手段攻击、干扰、破坏平台正常运行；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">3. 爬取、抓取、复制平台数据用于非法用途；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">4. 发布虚假广告、垃圾信息、诈骗信息；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">5. 侵犯未成年人合法权益；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">6. 其他违反法律法规或本协议的行为。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第五条 内容发布与知识产权</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 阁下在本平台发布的内容，应当保证对其享有合法权利，或已取得权利人充分授权，且不侵犯任何第三方的知识产权、肖像权、名誉权、隐私权等合法权益。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 阁下在本平台发布的内容，授予本平台在全球范围内免费的、非独占的、可再许可的使用权，包括但不限于复制、展示、传播、修改、汇编、翻译、制作衍生品等，用于平台运营、推广、安全保护等目的。该授权不因账号注销而当然终止，但法律另有规定的除外。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">3. 本平台有权对阁下发布的内容进行审核、筛选、删除，对违反法律法规或本协议的内容采取必要措施。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第六条 内容保护与截图溯源特别约定</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 本平台对部分受保护内容采用暗码水印技术。该技术在内容展示时自动嵌入不可见的数字水印信息，用于版权保护与违规溯源。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 任何对该类受保护内容的截图均携带可溯源的数字标识。本平台可通过技术手段追踪截图来源用户。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">3. 未经授权，任何用户不得对受保护内容进行截图、下载、复制、传播、二次发布。一经溯源核实，本平台有权采取包括但不限于永久封禁账号、禁止登录、禁止接收新内容等措施；情节严重、涉嫌违法犯罪的，将移交司法机关依法处理。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第七条 风控名单特别约定</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 对存在恶意注册、内容盗用、严重违规、欺诈、攻击平台等行为的账号，本平台有权将该账号关联的手机号码、IP 地址及设备标识纳入平台风控名单。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 纳入风控名单的，本平台有权限制相关设备、手机号码或 IP 地址的注册、登录及发布行为。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">3. 风控名单信息仅用于平台内部风险控制与违规处理。除法律法规另有规定或有权机关依法要求外，本平台不会向任何第三方披露。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">4. 申诉机制：阁下如因他人违规导致自身受到风控措施影响，或对风控名单信息有异议，可通过本协议第十六条载明的联系方式提出申诉，本平台将在核实后及时处理。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第八条 账号处罚规则</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">如阁下违反本协议或相关法律法规，本平台有权视情节轻重，单方采取以下一项或多项措施：</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 警告；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 删除违规内容；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">3. 限制账号部分功能；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">4. 临时封禁账号；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">5. 永久封禁账号；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">6. 纳入风控名单；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">7. 涉嫌违法犯罪的，移交司法机关处理。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">本平台采取处罚措施后，将通过站内信、短信或其他合理方式通知阁下。阁下对处罚有异议的，可通过本协议载明的联系方式提出申诉。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第九条 隐私与个人信息保护</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">本平台重视阁下的个人信息保护。我们将依照《赞话用户隐私政策》《赞话未成年人（含儿童）隐私政策》的规定，收集、存储、使用、共享、转移和保护阁下的个人信息。同时，阁下应当尊重他人隐私，不得发布、传播他人隐私信息，不得非法获取、使用、买卖他人个人信息。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第十条 未成年人保护</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 未成年人使用本平台服务，应当在监护人的指导和监督下进行。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 不满十四周岁儿童使用本平台服务前，必须取得监护人的明确同意。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">3. 本平台提供青少年模式，限制未成年人的使用时长和可访问内容。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">4. 如发现未成年人发布或传播不当内容，本平台将依法及时处理，并视情况通知监护人。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">5. 未成年人个人信息的处理，适用《赞话未成年人（含儿童）隐私政策》。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第十一条 第三方服务</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">本平台可能链接、嵌入第三方服务。该等第三方服务由第三方独立运营，其服务内容和责任由第三方承担。本平台对第三方服务的合法性、安全性、准确性不作保证，阁下在使用第三方服务时应自行判断并承担相应风险。因第三方服务引发的任何争议、纠纷或损失，由阁下与第三方自行解决，本平台在法律允许的范围内不承担责任。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第十二条 免责声明与责任限制</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 因不可抗力或本平台不能控制的原因造成的服务中断、数据丢失等，本平台不承担责任。不可抗力包括但不限于自然灾害、战争、政府行为、网络攻击、基础电信运营故障等。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 用户发布的内容仅代表用户个人观点，不代表本平台立场。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">3. 因用户违反本协议或法律法规造成的损失，由用户自行承担；给本平台或第三方造成损害的，用户应依法赔偿。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">4. 本平台对用户的间接损失、预期利益损失、数据丢失导致的损失，在法律允许的最大范围内不承担责任。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">5. 阁下理解并同意，本平台无法保证服务绝对不中断、不延迟、不出错。任何网络服务均存在一定风险，阁下应自行备份重要数据。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第十三条 协议的变更与终止</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 本平台有权根据法律法规、政策变化、业务调整等原因修改本协议。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 阁下有权随时注销账号，本协议自账号注销之日起终止，但法律或本协议另有约定的条款继续有效。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">3. 本平台有权根据国家规定、监管要求、运营策略等终止本协议，并提前通知阁下。</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">4. 如阁下长期未登录账号，本平台有权在合理期限后回收账号，以免资源浪费，由此带来的损失由阁下自行承担。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第十四条 通知与送达</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">本平台向阁下发出的通知，可以通过站内信、弹窗、短信、邮件、公告等方式进行。通过公告方式通知的，自公告发布之日起视为送达。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第十五条 法律适用与争议解决</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">本协议的订立、执行、解释及争议解决适用中华人民共和国法律。因本协议产生的争议，双方应友好协商解决；协商不成的，任何一方均可向本平台运营者住所地有管辖权的人民法院提起诉讼。</p>\n<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">第十六条 联系方式</h3>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">如阁下对本协议有任何疑问、意见或建议，请通过以下方式联系我们：</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">1. 平台内“反馈”功能；</p>\n<p style="margin-bottom:10px;text-indent:2em;color:#333;">2. 官方邮箱：zanhuadev@163.com。</p>\n    `;

function renderAgreementPage() {
    return renderAgreementDoc("赞话用户服务协议", _AGREE_TEXT_SERVICE + intlDocLinksSection(0));
}

function renderVerifSubAgreementPage() {
    return `\n        <div class="page">\n          <div class="navbar" style="position:fixed;top:0;left:0;right:0;z-index:100;background:#fff;">\n            <div onclick="goBack()" style="font-size:22px;cursor:pointer;color:#333;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div>\n            <h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">赞话用户认证订阅协议</h1>\n            <div style="width:28px;"></div>\n          </div>\n          <div style="padding-top:calc(50px + env(safe-area-inset-top));"></div>\n          <div style="padding:20px 16px;line-height:1.8;font-size:14px;color:#333;">\n            <p style="margin-bottom:12px;text-indent:2em;">本《赞话用户认证订阅协议》（以下简称"本协议"）是您与"赞话"社交平台（以下简称"本平台"）之间就认证订阅服务所订立的协议。在订阅进阶认证、高级认证或企业/机构/团体认证（以下统称"认证订阅服务"）之前，请您务必仔细阅读并充分理解本协议的全部内容。</p>\n            <p style="margin-bottom:12px;text-indent:2em;">您通过勾选"我已阅读并同意"并完成支付，即视为您已阅读并同意本协议的全部内容，且自愿受本协议约束。如您不同意本协议，请勿完成订阅。</p>\n\n            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">一、服务内容</h3>\n            <p style="margin-bottom:12px;text-indent:2em;">1. 认证订阅服务是本平台为创作者提供的增值服务，按订阅类型不同，提供差异化的权益组合，具体权益内容以订阅页面展示为准。</p>\n            <p style="margin-bottom:12px;text-indent:2em;">2. 认证标识（包括进阶认证、高级认证、企业/机构/团体认证图标）是本平台授予订阅用户在订阅有效期内的展示权益，不代表本平台对用户发布内容的真实性、合法性作出任何担保或背书。</p>\n            <p style="margin-bottom:12px;text-indent:2em;">3. 权益将在订单支付完成并通过本平台后台审核（通常为3个工作日内）后立即生效，有效期自审核通过之日起计算。</p>\n\n            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">二、订阅费用与退款</h3>\n            <p style="margin-bottom:12px;text-indent:2em;">1. 订阅费用按月或按年收取，具体金额以订阅页面实时展示为准。首月优惠仅对从未订阅过进阶/高级认证的用户开放一次。</p>\n            <p style="margin-bottom:12px;text-indent:2em;">2. 已享受首月优惠的订单若未在3个工作日内审核通过，将自动取消订单并退还对应费用。</p>\n            <p style="margin-bottom:12px;text-indent:2em;">3. 除上述自动退款情形以及法律法规另有规定外，<strong>订阅费用一经支付且审核通过，原则上不予退款</strong>。如遇特殊情况，您可通过平台内"反馈"功能提交申请，由本平台根据具体情况单独处理。</p>\n            <p style="margin-bottom:12px;text-indent:2em;">4. 申请退款一经核准，本平台将收回对应认证标识及全部关联权益，已生效的权益不再保留。</p>\n\n            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">三、未成年人特别约定</h3>\n            <p style="margin-bottom:12px;text-indent:2em;">1. 本平台认证订阅服务<strong>不主动向未成年人推广</strong>。若您是未成年人，请在监护人的明确同意和指导下完成订阅，且应在监护人陪同下阅读本协议并完成支付。</p>\n            <p style="margin-bottom:12px;text-indent:2em;">2. 您在订阅页面勾选"我已阅读并同意"即表示您向本平台作出如下承诺之一：<strong>（1）您已年满18周岁，不属于未成年人；或（2）您虽为未成年人，但本次订阅已获得您的监护人（家长/法定监护人）的明确许可和同意。</strong></p>\n            <p style="margin-bottom:12px;text-indent:2em;">3. 若监护人发现未成年人在未经其同意的情况下完成了订阅，可凭相关证明通过平台内"反馈"功能申请退款，本平台核实后将按本协议第二条约定的退款流程处理并收回相应权益。</p>\n            <p style="margin-bottom:12px;text-indent:2em;">4. 本平台有权结合《赞话未成年人（含儿童）隐私政策》及国家关于未成年人网络保护的相关规定，对未成年人账号的订阅行为进行必要的限制。</p>\n\n            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">四、权益使用规范</h3>\n            <p style="margin-bottom:12px;text-indent:2em;">1. 认证订阅权益仅限订阅账号本人使用，<strong>不得转让、出租、出借或共享</strong>给任何第三方。</p>\n            <p style="margin-bottom:12px;text-indent:2em;">2. 您在使用"帖子保护"等权益时，应遵守国家法律法规及《赞话用户服务协议》，不得将受保护内容用于违法违规用途。</p>\n            <p style="margin-bottom:12px;text-indent:2em;">3. 曝光推送、置顶推广等权益仅提升平台内的推送优先级，<strong>不承诺固定的访问人数或效果</strong>。</p>\n            <p style="margin-bottom:12px;text-indent:2em;">4. 您发布违规内容或违反本协议、平台规则的，本平台有权视情节轻重采取警告、删除违规内容、限制账号功能、暂停或收回认证权益、封禁账号等措施，已支付的订阅费用不予退还。</p>\n\n            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">五、协议变更与终止</h3>\n            <p style="margin-bottom:12px;text-indent:2em;">1. 本平台有权根据法律法规、政策变化或业务调整，适时修订本协议内容，修订后的协议一经公布即有效替代原协议，并将通过平台内通知等方式告知您。</p>\n            <p style="margin-bottom:12px;text-indent:2em;">2. 您有权随时停止续费，已生效的订阅权益将持续至当前订阅周期到期为止。</p>\n            <p style="margin-bottom:12px;text-indent:2em;">3. 订阅到期未续费的，对应的认证标识及权益将自动失效。</p>\n\n            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">六、免责声明</h3>\n            <p style="margin-bottom:12px;text-indent:2em;">1. 因不可抗力或本平台不能控制的原因（包括但不限于网络故障、系统维护、政策调整等）造成的服务中断或权益延迟生效，本平台不承担责任。</p>\n            <p style="margin-bottom:12px;text-indent:2em;">2. 本平台不对订阅权益带来的具体流量、收益等效果作出任何明示或暗示的保证。</p>\n\n            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">七、联系方式</h3>\n            <p style="margin-bottom:12px;text-indent:2em;">如您对本协议有任何疑问、意见或建议，请通过平台内"反馈"功能与我们联系，或发送邮件至官方邮箱：<span style="color:#1D9BF0;">zanhuadev@163.com</span>。我们将在收到您的反馈后尽快处理。</p>\n            <p style="margin-top:30px;text-align:right;color:#999;font-size:12px;">最后更新日期：2026年8月3日</p>\n          </div>\n        </div>\n      `;
}

function renderEnterpriseAgreementPage() {
    return `\n        <div class="page">\n          <div class="navbar" style="position:fixed;top:0;left:0;right:0;z-index:100;background:#fff;">\n            <div onclick="goBack()" style="font-size:22px;cursor:pointer;color:#333;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div>\n            <h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">赞话认证服务协议</h1>\n            <div style="width:28px;"></div>\n          </div>\n          <div style="padding-top:calc(50px + env(safe-area-inset-top));"></div>\n          <div style="padding:20px 16px;line-height:1.8;font-size:14px;color:#333;">\n            <p style="margin-bottom:12px;text-indent:2em;">本《赞话认证服务协议》（以下简称"本协议"）是您与"赞话"社交平台（以下简称"本平台"）之间就企业/机构/团体认证服务（以下简称"认证服务"）所订立的协议。在提交企业/机构/团体认证申请之前，请您务必仔细阅读并充分理解本协议的全部内容。</p>\n            <p style="margin-bottom:12px;text-indent:2em;">您通过勾选"我已阅读并同意"并提交认证申请，即视为您或您代表的机构已阅读并同意本协议的全部内容，且自愿受本协议约束。如您不同意本协议，请勿提交认证申请。</p>\n\n            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">一、服务内容与用途</h3>\n            <p style="margin-bottom:12px;text-indent:2em;">1. 企业/机构/团体认证服务为申请主体提供实名认证能力，认证通过后账号将获得企业认证标识，用于展示申请主体的官方身份，提升公信力和用户认可度。</p>\n            <p style="margin-bottom:12px;text-indent:2em;">2. 企业认证标识仅代表申请主体身份通过审核，不代表本平台对其发布内容的真实性、合法性作出任何担保或背书。</p>\n            <p style="margin-bottom:12px;text-indent:2em;">3. 认证审核周期通常为 3~5 个工作日，审核结果通过站内信通知；未通过的申请可根据反馈补充材料后重新提交。</p>\n\n            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">二、认证申请主体与资质</h3>\n            <p style="margin-bottom:12px;text-indent:2em;">1. 申请企业/机构/团体认证的主体应当为合法注册的企业法人、事业单位、社会团体、个体工商户、民办非企业单位或其他具有合法主体资格的组织。</p>\n            <p style="margin-bottom:12px;text-indent:2em;">2. 申请主体须提交真实、合法、有效的资质证明材料，包括但不限于营业执照、授权委托书、经办人身份证明、对公账户信息等。伪造、变造或提供虚假材料的，本平台有权直接驳回申请或撤销已通过的认证，已支付的认证费用不予退还。</p>\n            <p style="margin-bottom:12px;text-indent:2em;">3. 申请主体授权经办人提交认证申请并签署本协议的，经办人应保证其具有充分合法的授权，因授权产生的一切责任由申请主体承担。</p>\n\n            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">三、认证费用与退款</h3>\n            <p style="margin-bottom:12px;text-indent:2em;">1. 企业/机构/团体认证按年收取认证服务费，具体金额以申请页实时展示为准。认证服务年费为一次性费用，用于审核成本及认证标识展示权益。</p>\n            <p style="margin-bottom:12px;text-indent:2em;">2. 申请提交后至审核完成前，申请主体可主动撤回申请；如材料缺失且在本平台通知后 7 个工作日内未补充，视为自动放弃，认证费用按原路退还。</p>\n            <p style="margin-bottom:12px;text-indent:2em;">3. 除上述情形以及法律法规另有规定外，<strong>认证服务费一经支付且审核通过，原则上不予退款</strong>。如遇特殊情况，可通过"反馈"功能提交申请，由本平台根据具体情况单独处理。</p>\n            <p style="margin-bottom:12px;text-indent:2em;">4. 认证有效期为 1 年，到期前 30 天内平台将提醒申请主体续费，逾期未续费认证标识自动失效。</p>\n\n            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">四、认证主体义务</h3>\n            <p style="margin-bottom:12px;text-indent:2em;">1. 申请主体应遵守国家法律法规及《赞话用户服务协议》《赞话社区规范》等平台规则，不得利用认证账号发布违法违规内容。</p>\n            <p style="margin-bottom:12px;text-indent:2em;">2. 认证主体的名称、证照、授权关系等关键信息发生变更时，应在 15 个工作日内通过本平台认证入口重新提交材料完成变更审核，否则本平台有权暂停或撤销认证标识。</p>\n            <p style="margin-bottom:12px;text-indent:2em;">3. 认证主体不得将认证账号转让、出租、出借给第三方使用，不得擅自以认证主体名义对外作出超出平台服务范围的承诺或宣传。</p>\n            <p style="margin-bottom:12px;text-indent:2em;">4. 认证主体发布违规内容或违反本协议、平台规则的，本平台有权视情节轻重采取警告、删除违规内容、限制账号功能、暂停或撤销认证标识、封禁账号等措施，已支付的认证服务费不予退还。</p>\n\n            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">五、个人信息与资质材料保护</h3>\n            <p style="margin-bottom:12px;text-indent:2em;">1. 本平台严格按照《赞话用户隐私政策》保护申请主体提交的个人信息及资质材料，除法律法规要求或经申请主体同意外，不向第三方披露或用于与认证无关的用途。</p>\n            <p style="margin-bottom:12px;text-indent:2em;">2. 资质材料及经办人信息仅用于认证审核及必要的法律审计，审核完成后将按平台规定的保存期限妥善存储。</p>\n\n            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">六、协议变更与终止</h3>\n            <p style="margin-bottom:12px;text-indent:2em;">1. 本平台有权根据法律法规、政策变化或业务调整，适时修订本协议内容，修订后的协议一经公布即有效替代原协议，并将通过平台内通知等方式告知。</p>\n            <p style="margin-bottom:12px;text-indent:2em;">2. 申请主体有权随时停止续费，已生效的认证权益将持续至当前认证周期到期为止。</p>\n            <p style="margin-bottom:12px;text-indent:2em;">3. 认证到期未续费或因违规被撤销认证的，对应的企业认证标识及全部关联权益自动失效。</p>\n\n            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">七、免责声明</h3>\n            <p style="margin-bottom:12px;text-indent:2em;">1. 因不可抗力或本平台不能控制的原因（包括但不限于网络故障、系统维护、政策调整、主管机关临时要求等）造成的认证延迟或服务中断，本平台不承担责任。</p>\n            <p style="margin-bottom:12px;text-indent:2em;">2. 本平台不对认证账号通过认证后所获得的展示效果、流量或经营收益作出任何明示或暗示的保证。</p>\n\n            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">八、联系方式</h3>\n            <p style="margin-bottom:12px;text-indent:2em;">如您对本协议或认证服务有任何疑问、意见或建议，请通过平台内"反馈"功能与我们联系，或发送邮件至官方邮箱：<span style="color:#1D9BF0;">zanhuadev@163.com</span>。我们将在收到您的反馈后尽快处理。</p>\n            <p style="margin-top:30px;text-align:right;color:#999;font-size:12px;">最后更新日期：2026年8月9日</p>\n          </div>\n        </div>\n      `;
}

function renderRedeemCode() {
    if (!getToken()) {
        showLoginModal();
        return "";
    }
    return '<div class="vs-page" style="overflow:hidden;">' + '<div class="vs-nav"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;width:40px;"><i class="fa-solid fa-angle-left" style="font-weight:600;color:#fff;"></i></div><h1>输入兑换序列号</h1><div style="width:40px;"></div></div>' + '<div class="vs-hero"><div class="vs-hero-title">输入兑换序列号</div></div>' + '<div style="padding:24px 20px;">' + '<input id="redeemCodeInput" type="text" inputmode="text" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" style="width:100%;padding:16px 18px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);border-radius:12px;color:#fff;font-size:16px;font-family:ZanhuaSans,-apple-system,sans-serif;letter-spacing:0.12em;text-align:left;outline:none;box-sizing:border-box;transition:border-color 0.2s;" onfocus="this.style.borderColor=\'rgba(255,255,255,0.35)\'" onblur="this.style.borderColor=\'rgba(255,255,255,0.15)\'">' + '<div id="redeemCodeMsg" style="margin-top:16px;font-size:13px;text-align:center;min-height:20px;color:rgba(255,255,255,0.5);"></div>' + '<button id="redeemCodeBtn" onclick="submitRedeemCode()" class="vs-btn vs-btn-premium" style="margin-top:20px;">确认兑换</button>' + "</div>" + '<div style="padding:0 20px;">' + '<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;">' + '<div style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.6);margin-bottom:10px;">兑换说明</div>' + '<div style="font-size:12px;color:rgba(255,255,255,0.4);line-height:1.8;">' + "<div>• 兑换序列号为25位大写字母和数字</div>" + "<div>• 每5位为一组，输入时自动添加横线</div>" + "<div>• 兑换成功后认证将自动发放到您的账户</div>" + "<div>• 如兑换序列号无法使用或有任何疑问，请联系管理员处理</div>" + "</div>" + "</div>" + "</div>" + "</div>";
}

function fitRedeemInputFontSize() {
    var inp = document.getElementById("redeemCodeInput");
    if (!inp) return;
    var availWidth = inp.clientWidth - 36;
    if (availWidth <= 0) return;
    var testText = "XXXXX-XXXXX-XXXXX-XXXXX-XXXXX";
    var fontFamily = "ZanhuaSans,-apple-system,sans-serif";
    var testEl = document.createElement("span");
    testEl.style.visibility = "hidden";
    testEl.style.position = "absolute";
    testEl.style.whiteSpace = "nowrap";
    testEl.style.fontFamily = fontFamily;
    testEl.style.letterSpacing = "0.12em";
    document.body.appendChild(testEl);
    var lo = 8, hi = 32, best = 16;
    while (lo <= hi) {
        var mid = Math.floor((lo + hi) / 2);
        testEl.style.fontSize = mid + "px";
        testEl.textContent = testText;
        var w = testEl.offsetWidth;
        if (w <= availWidth) {
            best = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    document.body.removeChild(testEl);
    inp.style.fontSize = best + "px";
    inp.style.letterSpacing = "0.12em";
}

function formatRedeemCode(raw) {
    var cleaned = raw.replace(/[^A-Za-z0-9\-]/g, "");
    cleaned = cleaned.toUpperCase();
    var chars = cleaned.replace(/-/g, "");
    if (chars.length > 25) chars = chars.substring(0, 25);
    var formatted = "";
    for (var i = 0; i < chars.length; i++) {
        if (i > 0 && i % 5 === 0) formatted += "-";
        formatted += chars[i];
    }
    return formatted;
}

function bindRedeemCodeEvents() {
    var inp = document.getElementById("redeemCodeInput");
    if (!inp) return;
    fitRedeemInputFontSize();
    var resizeHandler = null;
    window.addEventListener("resize", function() {
        if (resizeHandler) clearTimeout(resizeHandler);
        resizeHandler = setTimeout(fitRedeemInputFontSize, 150);
    });
    inp.addEventListener("input", function() {
        var formatted = formatRedeemCode(this.value);
        if (this.value !== formatted) {
            var pos = this.selectionStart;
            var oldLen = this.value.length;
            this.value = formatted;
            var newLen = formatted.length;
            var newPos = pos + (newLen - oldLen);
            if (newPos < 0) newPos = 0;
            if (newPos > newLen) newPos = newLen;
            try {
                this.setSelectionRange(newPos, newPos);
            } catch (e) {}
        }
    });
    inp.addEventListener("paste", function(e) {
        e.preventDefault();
        var pasted = "";
        if (e.clipboardData && e.clipboardData.getData) {
            pasted = e.clipboardData.getData("text");
        } else if (window.clipboardData && window.clipboardData.getData) {
            pasted = window.clipboardData.getData("Text");
        }
        var start = this.selectionStart || 0;
        var end = this.selectionEnd || 0;
        var newVal = this.value.substring(0, start) + pasted + this.value.substring(end);
        var formatted = formatRedeemCode(newVal);
        this.value = formatted;
        this.setSelectionRange(formatted.length, formatted.length);
    });
    inp.addEventListener("keydown", function(e) {
        if (e.key.length === 1 && !/[A-Za-z0-9\-]/.test(e.key)) {
            e.preventDefault();
        }
    });
    inp.addEventListener("focus", function() {
        fitRedeemInputFontSize();
        var self = this;
        setTimeout(function() {
            if (self.value === "") {
                self.setSelectionRange(0, 0);
            }
        }, 0);
    });
    setTimeout(function() {
        inp.focus();
    }, 200);
}

async function submitRedeemCode() {
    var inp = document.getElementById("redeemCodeInput");
    var btn = document.getElementById("redeemCodeBtn");
    var msg = document.getElementById("redeemCodeMsg");
    var code = inp ? inp.value.replace(/-/g, "").toUpperCase() : "";
    if (!code) {
        if (msg) msg.innerHTML = '<span style="color:#ef4444;">请输入兑换序列号</span>';
        return;
    }
    if (code.length !== 25) {
        if (msg) msg.innerHTML = '<span style="color:#ef4444;">兑换序列号必须为25位</span>';
        return;
    }
    if (btn) btn.disabled = true;
    if (msg) msg.innerHTML = '<span style="color:rgba(255,255,255,0.5);">正在验证...</span>';
    try {
        var r = await api("/redeemCode", "POST", {
            code: code
        });
        if (r.code === 1) {
            if (msg) msg.innerHTML = '<span style="color:#10b981;">🎉 ' + r.msg + "</span>";
            if (inp) inp.value = "";
            setTimeout(function() {
                if (msg) msg.innerHTML = "";
            }, 5e3);
        } else {
            if (msg) msg.innerHTML = '<span style="color:#ef4444;">' + r.msg + "</span>";
        }
    } catch (e) {
        if (msg) msg.innerHTML = '<span style="color:#ef4444;">网络错误，请重试</span>';
    }
    if (btn) btn.disabled = false;
}

function renderPrivacyPage() {
    return renderAgreementDoc("赞话用户隐私政策", _AGREE_TEXT_PRIVACY + intlDocLinksSection(1));
}

function renderMinorPrivacyPage() {
    return renderAgreementDoc("赞话未成年人（含儿童）隐私政策", _AGREE_TEXT_MINOR + intlDocLinksSection(2));
}

const INTL_LEGAL_REGIONS = [ {
    key: "tw",
    name: "台湾"
}, {
    key: "uk",
    name: "英国"
}, {
    key: "fr",
    name: "法国"
}, {
    key: "jp",
    name: "日本"
}, {
    key: "kr",
    name: "韩国"
}, {
    key: "mo",
    name: "澳门"
}, {
    key: "hk",
    name: "香港"
} ];

const INTL_LEGAL_CACHE = {};

function intlRegionName(key) {
    const r = INTL_LEGAL_REGIONS.find(function(x) {
        return x.key === key;
    });
    return r ? r.name : key;
}

function intlCleanTitle(t) {
    return String(t).replace(/^(?:[一二三四五六七八九十百]+|[0-9０-９]+)\s*[\.、．]?\s*/, "");
}

function openIntlLegal(key, docIdx) {
    const region = INTL_LEGAL_REGIONS.find(function(r) {
        return r.key === key;
    }) || INTL_LEGAL_REGIONS[0];
    const idx = typeof docIdx === "number" && docIdx >= 0 ? docIdx : 1;
    goPage("intlLegal", false, region.key + "_" + idx);
}

function escHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function loadIntlLegalDocs(cc) {
    if (INTL_LEGAL_CACHE[cc] !== undefined) {
        return Promise.resolve(INTL_LEGAL_CACHE[cc]);
    }
    const url = MEDIA_BASE + "/static/legal/" + cc + ".md";
    return fetch(url, {
        cache: "force-cache"
    }).then(function(res) {
        if (!res.ok) throw new Error("http " + res.status);
        return res.text();
    }).then(function(text) {
        const docs = parseLegalMarkdownDocs(text);
        INTL_LEGAL_CACHE[cc] = docs;
        return docs;
    });
}

function renderIntlLegalPage() {
    const raw = String(window._pageParam2 || "tw_1");
    const parts = raw.split("_");
    const cc = INTL_LEGAL_REGIONS.find(function(r) {
        return r.key === parts[0];
    }) ? parts[0] : "tw";
    const idx = parseInt(parts[1], 10) >= 0 ? parseInt(parts[1], 10) : 1;
    return loadIntlLegalDocs(cc).then(function(docs) {
        if (!docs || !docs.length) throw new Error("empty");
        const target = docs[Math.min(idx, docs.length - 1)] || docs[0];
        return renderIntlDocPage(cc, docs, target.idx);
    });
}

const INTL_COOKIE_NOTE = {
    kr: "쿠키 사용에 관한 자세한 내용은 %T%에서 확인하세요.",
    uk: "For details on our use of cookies, please see %T%.",
    fr: "Pour plus de détails sur notre utilisation des cookies, veuillez consulter %T%."
};

const INTL_REF_ALIASES = {
    uk_4: [ "Cookie Policy" ],
    fr_4: [ "Politique de Cookies" ],
    kr_4: [ "《쿠키 정책》" ]
};

function renderIntlDocPage(cc, docs, curIdx) {
    const cur = docs[curIdx] || docs[0];
    let content = cur.body;
    let noteHtml = "";
    if (!cur.isAuth) {
        const tokens = [];
        const others = docs.filter(function(d) {
            return d.idx !== cur.idx && !d.isAuth;
        }).slice().sort(function(a, b) {
            return b.title.length - a.title.length;
        });
        for (let k = 0; k < others.length; k++) {
            const o = others[k];
            const names = [ o.title ].concat(INTL_REF_ALIASES[cc + "_" + o.idx] || []);
            for (let n = 0; n < names.length; n++) {
                const tk = "" + o.idx + "_" + n + "";
                content = content.split(names[n]).join(tk);
                tokens.push({
                    tk: tk,
                    o: o
                });
            }
        }
        for (let k = 0; k < tokens.length; k++) {
            const t = tokens[k];
            const linkHtml = '<a href="javascript:void(0)" onclick="openIntlLegal(\'' + cc + "'," + t.o.idx + ')" style="color:#1D9BF0;text-decoration:underline;">' + escHtml(t.o.title) + "</a>";
            content = content.split(t.tk).join(linkHtml);
        }
        const cookieDoc = docs[4];
        if (cookieDoc && cookieDoc.idx !== cur.idx && INTL_COOKIE_NOTE[cc]) {
            const phrase = INTL_COOKIE_NOTE[cc];
            const linkHtml = '<a href="javascript:void(0)" onclick="openIntlLegal(\'' + cc + "'," + cookieDoc.idx + ')" style="color:#1D9BF0;text-decoration:underline;">' + escHtml(cookieDoc.title) + "</a>";
            noteHtml = '<p style="margin:22px 0 10px;padding-top:14px;border-top:0.5px solid #e5e5e5;text-indent:2em;color:#333;">' + phrase.split("%T%").join(linkHtml) + "</p>";
        }
    }
    return `<div class="page">\n        <div class="navbar" style="position:fixed;top:0;left:0;right:0;z-index:100;background:#fff;">\n          <div onclick="goBack()" style="font-size:22px;cursor:pointer;color:#333;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div>\n          <h1 style="flex:1;text-align:center;font-size:16px;font-weight:600;line-height:1.3;padding:0 4px;">${escHtml(cur.title)}</h1>\n          <div style="width:28px;"></div>\n        </div>\n        <div style="padding-top:calc(50px + env(safe-area-inset-top));"></div>\n        <div style="padding:14px 16px 24px;line-height:1.8;font-size:14px;color:#333;">${content}${noteHtml}</div>\n      </div>`;
}

function parseLegalMarkdownDocs(text) {
    const lines = String(text).split(/\r?\n/);
    const docs = [];
    let cur = null;
    function finalize() {
        if (!cur) return;
        if (cur._inList) {
            cur.body += "</div>";
            cur._inList = false;
        }
    }
    function closeList(d) {
        if (d._inList) {
            d.body += "</div>";
            d._inList = false;
        }
    }
    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const s = raw.replace(/\s+$/, "");
        const trimmed = s.trim();
        if (!trimmed) {
            if (cur) closeList(cur);
            continue;
        }
        const docTitle = trimmed.match(/^#\s+(.*)$/);
        if (docTitle) {
            finalize();
            cur = {
                idx: docs.length,
                title: intlCleanTitle(docTitle[1]),
                isAuth: false,
                body: "",
                _inList: false
            };
            if (cur.idx === 3) cur.isAuth = true;
            docs.push(cur);
            continue;
        }
        if (!cur) continue;
        const d = cur;
        if (trimmed === "---") {
            closeList(d);
            d.body += '<hr style="border:none;border-top:1px solid #e5e5e5;margin:18px 0;">';
            continue;
        }
        const secTitle = trimmed.match(/^##\s+(.*)$/);
        if (secTitle) {
            closeList(d);
            d.body += '<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">' + escHtml(secTitle[1]) + "</h3>";
            continue;
        }
        const listItem = trimmed.match(/^(\d+[\.、]|\-|·|\*)\s*(.*)$/);
        if (listItem) {
            if (!d._inList) {
                d.body += '<div style="margin-bottom:10px;">';
                d._inList = true;
            }
            d.body += '<p style="margin:0 0 6px;text-indent:0;color:#333;padding-left:1.5em;">' + escHtml(trimmed) + "</p>";
            continue;
        }
        closeList(d);
        d.body += '<p style="margin-bottom:10px;text-indent:2em;color:#333;">' + escHtml(trimmed) + "</p>";
    }
    finalize();
    return docs;
}

function intlDocLinksSection(typeIdx) {
    const typeNames = [ "服务协议", "隐私政策", "未成年人（含儿童）隐私政策" ];
    const typeName = typeNames[typeIdx] || "法律文档";
    const items = INTL_LEGAL_REGIONS.map(function(r) {
        return '<p style="margin-bottom:10px;text-indent:2em;color:#333;">· <a href="javascript:void(0)" onclick="openIntlLegal(\'' + r.key + "'," + typeIdx + ')" style="color:#1D9BF0;text-decoration:underline;">' + typeName + "（" + r.name + "）</a></p>";
    }).join("");
    return '<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;color:#333;">其他国家或地区的文档版本</h3>' + '<p style="margin-bottom:10px;text-indent:2em;color:#333;">如阁下所在国家或地区并非中国大陆，以下为赞话平台面向提供服务的其他国家或地区用户提供的隐私政策及其他法律文档版本，点击即可查看：</p>' + items;
}

function renderReportPage() {
    const reasonHtml = REPORT_REASONS.map(r => `\n        <div class="report-reason-item ${reportReason === r.key ? "active" : ""}" onclick="selectReportReason('${r.key}')">\n          <span>${r.label}</span>\n          <i class="fa-solid fa-chevron-right" style="color:#ccc;font-size:12px;"></i>\n        </div>\n      `).join("");
    const currentReason = REPORT_REASONS.find(r => r.key === reportReason);
    const subReasonsHtml = currentReason ? currentReason.subs.map(s => `\n        <div class="report-sub-reason ${reportSubReason === s ? "active" : ""}" onclick="selectReportSubReason('${s}')">${s}</div>\n      `).join("") : "";
    const imagesHtml = reportImages.map((img, i) => `\n        <div class="report-img-item">\n          <img src="${img}">\n          <div class="report-img-remove" onclick="removeReportImage(${i})">×</div>\n        </div>\n      `).join("");
    const canAddImg = reportImages.length < 4;
    return `<div class="page" style="background:#f5f5f7;min-height:100vh;">\n        <div class="navbar"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div><h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">举报</h1><div style="width:40px;"></div></div>\n        <div style="padding:12px;">\n          <div style="background:#fff;border-radius:12px;padding:4px 0;margin-bottom:12px;">\n            <div style="padding:12px 16px;font-size:14px;color:#333;font-weight:600;">选择举报原因</div>\n            ${reasonHtml}\n          </div>\n          ${reportReason ? `<div style="background:#fff;border-radius:12px;padding:4px 0 12px;margin-bottom:12px;">\n            <div style="padding:12px 16px;font-size:14px;color:#333;font-weight:600;">具体原因</div>\n            <div style="padding:0 16px;display:flex;flex-wrap:wrap;gap:8px;">\n              ${subReasonsHtml}\n            </div>\n          </div>` : ""}\n          <div style="background:#fff;border-radius:12px;padding:12px 16px;margin-bottom:12px;">\n            <div style="font-size:14px;color:#333;font-weight:600;margin-bottom:10px;">补充描述（选填）</div>\n            <textarea id="reportDescription" class="report-textarea" placeholder="请详细描述违规情况，帮助我们更快处理..."></textarea>\n          </div>\n          <div style="background:#fff;border-radius:12px;padding:12px 16px;margin-bottom:20px;">\n            <div style="font-size:14px;color:#333;font-weight:600;margin-bottom:10px;">上传图片凭证（最多4张）</div>\n            <div style="display:flex;flex-wrap:wrap;gap:8px;">\n              ${imagesHtml}\n              ${canAddImg ? `<div class="report-img-add" onclick="document.getElementById('reportImgInput').click()">\n                <i class="fa-solid fa-plus" style="font-size:20px;color:#ccc;"></i>\n              </div>` : ""}\n            </div>\n            <input type="file" id="reportImgInput" accept="image/*" multiple style="display:none;" onchange="onReportImgChange(event)">\n          </div>\n          <button class="report-submit-btn" onclick="submitReport()">提交举报</button>\n        </div>\n      </div>`;
}

function bindReportEvents() {
    const ta = document.getElementById("reportDescription");
    if (ta) {
        ta.addEventListener("input", function() {
            if (this.value.length > 500) {
                this.value = this.value.slice(0, 500);
                showToast("描述最多500字");
            }
        });
    }
}

function selectReportReason(key) {
    reportReason = key;
    reportSubReason = "";
    render();
}

function selectReportSubReason(sub) {
    reportSubReason = sub;
    render();
}

function onReportImgChange(e) {
    const files = Array.from(e.target.files || []);
    const remaining = 4 - reportImages.length;
    const toAdd = files.slice(0, remaining);
    toAdd.forEach(file => {
        const reader = new FileReader;
        reader.onload = ev => {
            reportImages.push(ev.target.result);
            render();
        };
        reader.readAsDataURL(file);
    });
    e.target.value = "";
}

function removeReportImage(index) {
    reportImages.splice(index, 1);
    render();
}

async function submitReport() {
    if (!reportReason) {
        showToast("请选择举报原因");
        return;
    }
    const description = document.getElementById("reportDescription")?.value.trim() || "";
    try {
        const uploadedUrls = [];
        for (let i = 0; i < reportImages.length; i++) {
            const base64 = reportImages[i];
            const res = await uploadBase64Image(base64, "report");
            if (res && res.url) uploadedUrls.push(res.url);
        }
        const res = await api("/report", "POST", {
            targetType: reportTargetType,
            targetId: reportTargetId,
            reason: reportReason,
            subReason: reportSubReason,
            description: description,
            images: uploadedUrls
        });
        if (res.code === 1) {
            showToast(res.msg || "举报成功");
            setTimeout(() => {
                goBack();
            }, 1e3);
        } else {
            showToast(res.msg || "举报失败");
        }
    } catch (e) {
        showToast("提交失败，请重试");
    }
}

function uploadBase64Image(base64, type) {
    return new Promise((resolve, reject) => {
        const byteString = atob(base64.split(",")[1]);
        const mimeString = base64.split(",")[0].split(":")[1].split(";")[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ ab ], {
            type: mimeString
        });
        const formData = new FormData;
        formData.append("images", blob, "report_" + Date.now() + ".jpg");
        const xhr = new XMLHttpRequest;
        xhr.open("POST", API_BASE + "/uploadImage", true);
        xhr.setRequestHeader("Authorization", getToken());
        xhr.setRequestHeader("X-Device-Id", getDeviceId());
        xhr.setRequestHeader("X-Client-Fp", getClientFp());
        xhr.onload = function() {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const data = JSON.parse(xhr.responseText);
                    if (data.code === 1 && data.data && data.data.length > 0) {
                        resolve({
                            url: data.data[0]
                        });
                    } else {
                        reject(new Error(data.msg || "上传失败"));
                    }
                } catch (e) {
                    reject(e);
                }
            } else {
                reject(new Error("上传失败"));
            }
        };
        xhr.onerror = () => reject(new Error("上传失败"));
        xhr.send(formData);
    });
}

function renderRulesCenter() {
    return `<div class="page" style="background:#fff;min-height:100vh;">\n        <div class="navbar"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div><h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">规则中心</h1><div style="width:40px;"></div></div>\n        <div style="padding:16px;">\n          <div style="font-size:18px;font-weight:600;color:#333;margin-bottom:12px;">赞话社区内容管理规范</div>\n          <div style="font-size:14px;color:#666;line-height:1.8;">\n            <p style="margin-bottom:12px;"><strong>总则</strong></p>\n            <p style="margin-bottom:12px;">1. 为维护清朗、健康、有序的社区交流环境，保障赞话社区全体用户合法权益，防范网络安全风险，本规范依据《中华人民共和国网络安全法》《网络信息内容生态治理规定》等现行国家法律法规制定。</p>\n            <p style="margin-bottom:12px;">2. 赞话社区搭建机器初审+人工复核双层审核体系，全线接入阿里云内容安全机器审核，实现7×24小时不间断全量自动化内容检测。</p>\n            <p style="margin-bottom:12px;">3. 用户在赞话社区执行任意内容类操作，即代表本人已完整阅读、充分理解并无条件同意本规范所有条款。</p>\n            <p style="margin-bottom:12px;"><strong>一、严禁发布色情低俗类内容</strong></p>\n            <p style="margin-bottom:8px;">1. 禁止直白、细致描述性器官、性行为，使用涉性侮辱用语；</p>\n            <p style="margin-bottom:8px;">2. 禁止分享特殊性癖好、变态性行为、性虐待相关细节；</p>\n            <p style="margin-bottom:8px;">3. 禁止发布、隐晦引流各类色情交易、招嫖信息；</p>\n            <p style="margin-bottom:8px;">4. 禁止发布性暗示文案、露骨撩骚对话、低俗网络玩梗等软色情内容；</p>\n            <p style="margin-bottom:8px;">5. 禁止使用涉黄、擦边类头像、昵称、个性签名。</p>\n            <p style="margin-bottom:12px;"><strong>二、严禁发布涉政敏感类内容</strong></p>\n            <p style="margin-bottom:8px;">1. 禁止调侃、造谣污蔑、恶意抹黑国家领导人；</p>\n            <p style="margin-bottom:8px;">2. 禁止歪曲、否定革命烈士、英雄模范人物的历史事迹；</p>\n            <p style="margin-bottom:8px;">3. 禁止发表分裂国家、破坏社会政治稳定的言论；</p>\n            <p style="margin-bottom:8px;">4. 禁止转发境外反华组织、分裂势力的宣传文案。</p>\n            <p style="margin-bottom:12px;"><strong>三、严禁发布暴力恐怖类内容</strong></p>\n            <p style="margin-bottom:8px;">1. 禁止宣扬、美化极端组织、恐怖主义思想；</p>\n            <p style="margin-bottom:8px;">2. 禁止描述、公开鼓吹暴力行凶、报复伤人等极端暴力行为；</p>\n            <p style="margin-bottom:8px;">3. 禁止介绍、交易各类制式武器弹药、爆炸物、管制刀具；</p>\n            <p style="margin-bottom:8px;">4. 禁止分享血腥暴力画面、教唆自残自杀的内容。</p>\n            <p style="margin-bottom:12px;"><strong>四、严禁发布违法违禁类内容</strong></p>\n            <p style="margin-bottom:8px;">1. 禁止讨论、售卖、求购毒品、麻醉品、精神管制类药品；</p>\n            <p style="margin-bottom:8px;">2. 禁止推广、介绍线上线下赌博玩法、博彩网址；</p>\n            <p style="margin-bottom:8px;">3. 禁止描述、传授盗窃、诈骗、敲诈等各类违法犯罪手法；</p>\n            <p style="margin-bottom:8px;">4. 禁止发布伪造、买卖身份证、学历证书、票据、假币等信息。</p>\n            <p style="margin-bottom:12px;"><strong>五、严禁发布不良冒犯类内容</strong></p>\n            <p style="margin-bottom:8px;">1. 禁止对其他用户进行人身攻击、恶毒诅咒、当众辱骂；</p>\n            <p style="margin-bottom:8px;">2. 禁止针对他人外貌、身材、性别、年龄进行刻意诋毁、羞辱；</p>\n            <p style="margin-bottom:8px;">3. 禁止刻意挑起争吵、故意引战、发布煽动网络对立的言论；</p>\n            <p style="margin-bottom:8px;">4. 禁止发表针对国别、地域、民族、宗教信仰的歧视性调侃、抹黑言论。</p>\n            <p style="margin-bottom:12px;"><strong>六、严禁发布广告引流类内容</strong></p>\n            <p style="margin-bottom:8px;">1. 禁止各类形式的站外引流：发布其他社交平台、游戏账号、短视频主页等；</p>\n            <p style="margin-bottom:8px;">2. 禁止发布刷单兼职、高薪网赚、灰色副业等广告；</p>\n            <p style="margin-bottom:8px;">3. 禁止任何形式的软广、硬广、种草带货、付费推广；</p>\n            <p style="margin-bottom:8px;">4. 禁止利用头像、昵称、个性签名植入外部联系方式、推广话术。</p>\n            <p style="margin-bottom:12px;"><strong>违规分级处罚标准</strong></p>\n            <p style="margin-bottom:8px;">处罚按一年内<strong>总违规次数</strong>（不分违规类别）递进升级，封禁对应违规功能：</p>\n            <p style="margin-bottom:8px;">· <strong>第1次</strong>：警告</p>\n            <p style="margin-bottom:8px;">· <strong>第2次</strong>：警告</p>\n            <p style="margin-bottom:8px;">· <strong>第3次</strong>：限制违规功能1天（如第3次是私信则封私信1天，是评论则封评论1天）</p>\n            <p style="margin-bottom:8px;">· <strong>第4次</strong>：限制违规功能3天</p>\n            <p style="margin-bottom:8px;">· <strong>第5次</strong>：限制违规功能7天</p>\n            <p style="margin-bottom:8px;">· <strong>第6次</strong>：限制违规功能30天</p>\n            <p style="margin-bottom:8px;">· <strong>第7次</strong>：限制违规功能60天</p>\n            <p style="margin-bottom:8px;">· <strong>第8次</strong>：限制违规功能180天</p>\n            <p style="margin-bottom:8px;">· <strong>第9次</strong>：限制违规功能365天</p>\n            <p style="margin-bottom:8px;">· <strong>第10次及以上</strong>：永久封禁</p>\n            <p style="margin-bottom:8px;">处罚期间，对应功能（发帖、评论、私信、表白墙）将被限制使用，发布时提示"您的xx功能因违反《赞话社区准则》被限制，详情请查看系统消息"。昵称/简介违规时，内容将被自动重置（昵称恢复默认、简介清空）并收到系统通知。</p>\n            <p style="margin-bottom:12px;"><strong>申诉说明</strong></p>\n            <p style="margin-bottom:8px;">1. 若你认为违规处理属于误判，可在处罚通知发出7天内，通过账号安全中心的「申诉」入口提交申诉；</p>\n            <p style="margin-bottom:8px;">2. 申诉审核时效为1~3个工作日，申诉成功将解除对应功能限制；</p>\n            <p style="margin-bottom:8px;">3. 经审核确认用户刻意规避审核（谐音、拆字、表情包替代敏感词），直接升级处罚等级，且不予申诉。</p>\n          </div>\n        </div>\n      </div>`;
}

function bindRulesCenterEvents() {}

window.addEventListener("popstate", function(e) {
    if (isPageAnimating) {
        history.pushState({
            page: currentPage
        }, "", "#" + currentPage);
        return;
    }
    if (goBackLock) return;
    if (e.state && e.state.handled) return;
    isPopState = true;
    if (pageHistory.length > 0) {
        const prev = pageHistory.pop();
        currentPage = prev;
        prevPage = currentPage;
        try {
            history.replaceState({
                page: currentPage,
                handled: true
            }, "", "#" + currentPage);
        } catch (e2) {}
        window.scrollTo(0, 0);
        render();
        updateTabbar();
    } else if (!TAB_PAGES.includes(currentPage)) {
        currentPage = "home";
        prevPage = "home";
        try {
            history.replaceState({
                page: "home",
                handled: true
            }, "", "#home");
        } catch (e2) {}
        window.scrollTo(0, 0);
        render();
        updateTabbar();
    }
    setTimeout(() => {
        isPopState = false;
    }, 300);
});

const _appealPathToken = getAppealPathToken();

if (_appealPathToken) {
    bootAppealPage(_appealPathToken);
} else {
    try {
        history.replaceState({
            page: "home"
        }, "", "#home");
    } catch (e) {}
    render();
    updateTabbar();
    checkAccountValid();
    if (getToken()) startBadgeRefresh();
    initNumberAuthCheck();
}

if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
        ensureChatInputVisible();
        ensureCommentInputVisible();
        ensureFabVisible();
        adjustModalsToKeyboard();
    });
    window.visualViewport.addEventListener("scroll", () => {
        ensureChatInputVisible();
        ensureCommentInputVisible();
        ensureFabVisible();
        adjustModalsToKeyboard();
    });
}

window.addEventListener("resize", () => adjustModalsToKeyboard());

if (!window.__modalObserverBound2) {
    window.__modalObserverBound2 = true;
    const mo2 = new MutationObserver(() => {
        if (document.querySelector(".dialog-modal.active, .modal-overlay.active")) adjustModalsToKeyboard();
    });
    mo2.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [ "class", "style", "id" ]
    });
}

setTimeout(() => {
    ensureChatInputVisible();
    ensureCommentInputVisible();
    ensureFabVisible();
    adjustModalsToKeyboard();
}, 50);
