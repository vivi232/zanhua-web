(function() {
    var LATIN_FONT = "https://154.201.81.86/zanhua/res/fonts/ZanhuaSans-Latin-Regular.woff2";
    var FA_BASE = "https://154.201.81.86/zanhua/static/fontawesome/webfonts/";
    var FONT_URLS = [ "https://emoji-fonts-1342939114.cos.ap-nanjing.myqcloud.com/ZanhuaSans-SC-Regular-Decrease.woff2", "https://emoji-fonts-1342939114.cos.ap-nanjing.myqcloud.com/emoji.ttf", LATIN_FONT, FA_BASE + "fa-solid-900.woff2", FA_BASE + "fa-regular-400.woff2", FA_BASE + "fa-brands-400.woff2", FA_BASE + "fa-v4compatibility.woff2" ];
    var CACHE_NAME = "zanhua-fonts-v11";
    var ASSET_CACHE = "zanhua-assets-v2";
    var ASSET_PATTERNS = [ "/zanhua/uploads/default_avatar.webp", "/zanhua/res/icons/icon-i5xq4thdo.svg", "/zanhua/res/icons/icon-jztvozsrv.svg", "/zanhua/static/fontawesome/" ];
    var KEY_ASSETS = [ "https://154.201.81.86/zanhua/uploads/default_avatar.webp", "https://154.201.81.86/zanhua/res/icons/icon-i5xq4thdo.svg", "https://154.201.81.86/zanhua/res/icons/icon-jztvozsrv.svg" ];
    function isSharedAsset(url) {
        try {
            var u = new URL(url);
            if (u.origin !== self.location.origin && u.hostname !== "154.201.81.86") return false;
            return ASSET_PATTERNS.some(function(p) {
                return u.pathname.indexOf(p) !== -1;
            });
        } catch (e) {
            return false;
        }
    }
    var USER_MEDIA_CACHE = "zanhua-usermedia-v2";
    var USER_MEDIA_PATTERNS = [ "/zanhua/uploads/posts/", "/zanhua/uploads/thumbs/", "/zanhua/uploads/homework/", "/zanhua/uploads/avatars/", "/zanhua/uploads/messages/", "/zanhua/uploads/enterprise/", "/zanhua/uploads/feedbacks/" ];
    function isUserMedia(url) {
        try {
            var u = new URL(url);
            if (u.origin !== self.location.origin && u.hostname !== "154.201.81.86") return false;
            if (u.pathname === "/zanhua/uploads/default_avatar.webp") return false;
            return USER_MEDIA_PATTERNS.some(function(p) {
                return u.pathname.indexOf(p) !== -1;
            });
        } catch (e) {
            return false;
        }
    }
    self.addEventListener("message", function(event) {
        if (event.data && event.data.type === "clearUserMedia") {
            event.waitUntil(caches.delete(USER_MEDIA_CACHE));
        }
    });
    function fetchWithCacheMode(url) {
        try {
            var isRemote = (url.indexOf("http://") === 0 || url.indexOf("https://") === 0) && url.indexOf(self.location.origin) !== 0;
            if (isRemote) {
                return fetch(url, {
                    mode: "cors",
                    credentials: "omit",
                    cache: "force-cache"
                });
            }
            return fetch(url, {
                credentials: "same-origin",
                cache: "force-cache"
            });
        } catch (e) {
            return fetch(url);
        }
    }
    self.addEventListener("install", function(event) {
        event.waitUntil(Promise.all([ caches.open(CACHE_NAME).then(function(cache) {
            return Promise.all(FONT_URLS.map(function(url) {
                return fetchWithCacheMode(url).then(function(r) {
                    if (r && (r.ok || r.status === 0 && r.type === "opaque")) {
                        try {
                            cache.put(url, r.clone());
                        } catch (e) {}
                    }
                    return r;
                }).catch(function() {});
            }));
        }), caches.open(ASSET_CACHE).then(function(cache) {
            return Promise.all(KEY_ASSETS.map(function(url) {
                return fetchWithCacheMode(url).then(function(r) {
                    if (r && (r.ok || r.status === 0 && r.type === "opaque")) {
                        try {
                            cache.put(url, r.clone());
                        } catch (e) {}
                    }
                    return r;
                }).catch(function() {});
            }));
        }) ]).catch(function() {}));
        self.skipWaiting();
    });
    self.addEventListener("activate", function(event) {
        event.waitUntil(caches.keys().then(function(keys) {
            return Promise.all(keys.filter(function(k) {
                return k !== CACHE_NAME && k !== ASSET_CACHE && k !== USER_MEDIA_CACHE;
            }).map(function(k) {
                return caches.delete(k);
            }));
        }));
        self.clients.claim();
    });
    self.addEventListener("fetch", function(event) {
        var url = event.request.url;
        var isAsset = isSharedAsset(url);
        var isMedia = !isAsset && isUserMedia(url);
        var isFont = FONT_URLS.some(function(fu) {
            return url === fu || url.indexOf(fu) !== -1;
        });
        if (!isFont && !isAsset && !isMedia) return;
        var reqRange = null;
        try {
            reqRange = event.request.headers.get("range");
        } catch (e) {}
        var cn = isMedia ? USER_MEDIA_CACHE : isAsset ? ASSET_CACHE : CACHE_NAME;
        var keyReq = event.request;
        if (isMedia) {
            try {
                var uu = new URL(url);
                if (/\.(webp|png|jpe?g|gif|ico)$/i.test(uu.pathname)) uu.search = "";
                keyReq = new Request(uu.href, {
                    method: "GET",
                    headers: new Headers({
                        referer: uu.origin + "/"
                    })
                });
            } catch (e) {
                keyReq = event.request;
            }
        }
        event.respondWith(caches.open(cn).then(function(cache) {
            return cache.match(keyReq).then(function(cached) {
                if (cached) {
                    if (isMedia && reqRange && cached.status === 200) {
                        return cached.blob().then(function(b) {
                            try {
                                var m = /bytes=(\d+)-(\d*)/.exec(reqRange);
                                if (!m) return cached;
                                var st = parseInt(m[1], 10);
                                var en = m[2] ? parseInt(m[2], 10) : b.size - 1;
                                if (!(st >= 0 && en >= st && en < b.size)) return cached;
                                return new Response(b.slice(st, en + 1), {
                                    status: 206,
                                    headers: {
                                        "Content-Type": cached.headers.get("content-type") || "video/mp4",
                                        "Content-Range": "bytes " + st + "-" + en + "/" + b.size,
                                        "Accept-Ranges": "bytes",
                                        "Content-Length": String(en - st + 1)
                                    }
                                });
                            } catch (e) {
                                return cached;
                            }
                        });
                    }
                    return cached;
                }
                return fetch(event.request).then(function(response) {
                    if (response && response.ok) {
                        var path = new URL(url).pathname;
                        var canStore = true;
                        if (isMedia) {
                            var isImg = /\.(webp|png|jpe?g|gif|ico)$/i.test(path);
                            var isVid = /\.(mp4|webm|m4v|mov|avi|mkv)$/i.test(path);
                            var fullResp = isVid && response.status === 200 && response.headers.get("content-range") === null;
                            canStore = isImg || fullResp;
                        }
                        if (canStore) {
                            var pr = cache.put(keyReq, response.clone());
                            if (pr && pr.catch) pr.catch(function() {});
                        }
                    }
                    return response;
                }).catch(function(err) {
                    return cache.match(keyReq).then(function(c) {
                        return c || new Response("", {
                            status: 404
                        });
                    });
                });
            });
        }));
    });
})();
