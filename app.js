    const _pathFirst = (window.location.pathname.split('/').filter(Boolean)[0]) || '';
    const BASE_PATH = _pathFirst ? '/' + _pathFirst : '';
    const API_HOST = 'https://154.201.81.86';
    const API_BASE = API_HOST + '/api';
    const MEDIA_BASE = API_HOST + '/zanhua';
    const DEFAULT_AVATAR = MEDIA_BASE + '/uploads/default_avatar.webp';
    const PAY_QR_URL = MEDIA_BASE + '/res/pay/wechat_pay_qr.webp';

    
    function resolveMediaUrl(url) {
      if (!url) return '';
      if (/^https?:\/\//i.test(url)) return url; 
      const s = String(url);
      
      if (s.indexOf('/zanhua/') === 0) {
        return API_HOST + s;
      }
      
      if (s.indexOf('/uploads/') === 0 || s.indexOf('/res/') === 0) {
        return MEDIA_BASE + s;
      }
      
      if (s.indexOf('uploads/') === 0 || s.indexOf('res/') === 0) {
        return MEDIA_BASE + '/' + s;
      }
      
      return MEDIA_BASE + '/' + s.replace(/^\/+/, '');
    }
    
    
    const _videoSignCache = new Map(); 
    async function resolveVideoUrl(url) {
      const fixed = resolveMediaUrl(url);
      if (!fixed) return '';
      
      if (/^(blob:|data:|https?:)/i.test(fixed)) return fixed;
      
      const cached = _videoSignCache.get(fixed);
      if (cached && Math.floor(Date.now() / 1000) < cached.exp - 30) {
        return cached.url;
      }
      try {
        const res = await api('/signVideo', 'POST', { path: fixed });
        if (res.code === 1 && res.url) {
          let exp = 0;
          try {
            const u = new URL(res.url, location.origin);
            exp = parseInt(u.searchParams.get('exp')) || 0;
          } catch(e) {}
          _videoSignCache.set(fixed, { url: res.url, exp });
          return res.url;
        }
      } catch(e) {}
      return '';
    }
    let currentPage = 'home';
    let prevPage = 'home';
    let pageHistory = [];
    const TAB_PAGES = ['home', 'discover', 'message', 'profile'];

    const envSafeAreaBottom = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-bottom')) || 0;

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
      return { width, height, top, bottom };
    }

    function getKeyboardOffset() {
      if (!window.visualViewport) return 0;
      const vv = window.visualViewport;

      if (vv.height >= window.innerHeight) return 0;
      return window.innerHeight - vv.height;
    }

    function ensureTabbarVisible() {
      const tabbar = document.querySelector('.tab-bar');
      if (!tabbar) return;
      const offset = getKeyboardOffset();
      if (offset > 0) {
        tabbar.style.transform = `translateY(${offset}px)`;
      } else {
        tabbar.style.transform = '';
      }
    }

    function ensureChatInputVisible() {
      const bar = document.querySelector('.chat-input-bar');
      if (!bar) return;
      const rect = getViewportRect();
      const safeBottom = envSafeAreaBottom || 0;
      let bottom = Math.max(0, window.innerHeight - rect.bottom);
      if (bottom === 0) bottom = safeBottom;
      else bottom = bottom + Math.max(0, safeBottom - rect.top);
      bar.style.bottom = `${bottom}px`;
      bar.style.paddingBottom = bottom <= safeBottom ? (safeBottom > 0 ? safeBottom + 'px' : '') : '0px';
    }

    function ensureCommentInputVisible() {
      const bar = document.querySelector('.comment-input-bar');
      if (!bar) return;
      const rect = getViewportRect();
      const safeBottom = envSafeAreaBottom || 0;
      let bottom = Math.max(0, window.innerHeight - rect.bottom);
      if (bottom === 0) bottom = safeBottom;
      bar.style.bottom = `${bottom}px`;
      bar.style.paddingBottom = bottom <= safeBottom ? (safeBottom > 0 ? safeBottom + 'px' : '') : '0px';
    }

    
    function adjustModalsToKeyboard() {
      const rect = getViewportRect();
      const safeBottom = envSafeAreaBottom || 0;
      const availableTop = rect.top;
      const availableHeight = rect.height;

      document.querySelectorAll('.dialog-modal').forEach(overlay => {
        overlay.style.top = availableTop + 'px';
        overlay.style.bottom = '0px';
        overlay.style.height = availableHeight + 'px';
        overlay.style.alignItems = 'center';
      });

      document.querySelectorAll('.modal-overlay').forEach(overlay => {
        let bottomPad = Math.max(0, window.innerHeight - rect.bottom);
        if (bottomPad === 0) bottomPad = safeBottom;
        else bottomPad = bottomPad + Math.max(0, safeBottom - rect.top);
        overlay.style.top = availableTop + 'px';
        overlay.style.bottom = '0px';
        overlay.style.height = availableHeight + 'px';
        overlay.style.paddingBottom = bottomPad + 'px';
      });
    }
    window.adjustModalsToKeyboard = adjustModalsToKeyboard;

    function ensureFabVisible() {
      const fab = document.getElementById('fabCreateBtn');
      if (!fab) return;
      const offset = getKeyboardOffset();
      if (offset > 0) {
        fab.style.bottom = `${offset + 80}px`;
      } else {
        fab.style.bottom = 'calc(80px + env(safe-area-inset-bottom))';
      }
    }

    function navigateTo(page) {
      pageHistory.push(currentPage);
      currentPage = page;
      try { history.pushState({ page: page }, '', '#' + page); } catch(e) {}
      window.scrollTo(0, 0);
      render();
      updateTabbar();
    }
    let posts = [];
    let postPage = 1;
    let loading = false;
    let noMorePosts = false;
    let currentPostDetail = null;
    let myAvatar = '';
    let myVerificationTypes = [];
    let myVerifications = [];
    let visibleWatermarkEnabled = false;
    let currentConfessionDetail = null;
    let confessionReplyTargetSeq = 0;
    let currentViewUser = null;
    let chatUser = null;
    let chatMessages = [];
    let chatTimer = null;
    let currentSearchResult = { posts: [], users: [] };
    let selectedCreateImages = [];
    let codeTimer = 0;
    let captchaIns = null;
    let loginCaptchaIns = null;
    let captchaRequestLock = false;
    let loginCaptchaRequestLock = false;
    let isPublishing = false;
    let isFileUploading = false;
    let scrollToCommentFlag = false;
    let createTitle = '';
    let createContent = '';
    let createLocation = '';
    let createVisibility = 'public';
    let createDeclaration = '';
    let createAllowDownload = 0;

    function removeVisibleUidWatermark() {
      const visibleWm = document.getElementById('visible-wm-overlay');
      if (visibleWm) visibleWm.remove();
    }
    
    function _isCurrentPostProtected() {
      const p = currentPostDetail || currentConfessionDetail || currentHomeworkDetail;
      return p && p.watermark_protected == 1;
    }
    
    function injectVisibleUidWatermark() {
      
      const old = document.getElementById('visible-wm-overlay');
      if (old) old.remove();
      
      const needShow = visibleWatermarkEnabled || _isCurrentPostProtected();
      if (!needShow) return;
      const uid = getUid();
      if (!uid) return;
      const overlay = document.createElement('div');
      overlay.id = 'visible-wm-overlay';
      
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;overflow:hidden;will-change:transform;-webkit-transform:translateZ(0);transform:translateZ(0);';
      
      const inner = document.createElement('div');
      inner.style.cssText = 'position:absolute;top:-50%;left:-50%;width:220%;height:220%;transform:rotate(-30deg);transform-origin:center center;display:flex;flex-wrap:wrap;gap:0;align-content:center;justify-content:center;';
      
      const cssW = window.innerWidth || 375;
      const cssH = window.innerHeight || 812;
      
      const cellW = Math.max(140, Math.round(Math.min(cssW, cssH) * 0.45));
      const cellH = Math.round(cellW * 0.75);
      const fontSize = Math.max(11, Math.round(cellW / 16));
      
      const color = 'rgba(0,0,0,0.18)';
      
      const perRow = Math.ceil((cssW * 2.2) / cellW) + 2;
      const rows = Math.ceil((cssH * 2.2) / cellH) + 2;
      const total = perRow * rows;
      let html = '';
      for (let i = 0; i < total; i++) {
        html += '<span style="display:inline-block;width:' + cellW + 'px;text-align:center;font-size:' + fontSize + 'px;color:' + color + ';padding:' + Math.round(cellH / 4) + 'px 0;white-space:nowrap;font-weight:600;letter-spacing:1px;line-height:1;">UID' + uid + '</span>';
      }
      inner.innerHTML = html;
      overlay.appendChild(inner);
      document.body.appendChild(overlay);
    }
    
    function _ensureVisibleWmOnScroll() {
      const overlay = document.getElementById('visible-wm-overlay');
      if (!overlay) {
        const needShow = visibleWatermarkEnabled || _isCurrentPostProtected();
        if (needShow && (currentPage === 'postDetail' || currentPage === 'confessionDetail' || currentPage === 'homeworkDetail')) {
          injectVisibleUidWatermark();
        }
      }
    }
    function updateScreenWatermark() {
      if (currentPage === 'postDetail' || currentPage === 'confessionDetail' || currentPage === 'homeworkDetail') {
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
    const DCT_WM_PAGES = ['postDetail', 'confessionDetail', 'homeworkDetail', 'userProfile', 'discover', 'chat'];
    const DCT_WM_OPACITY = 1.0;
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
      dctWmTileLoading = fetch(API_BASE + '/screenWmTile', {
        headers: { 'Authorization': getToken() },
        cache: 'no-store'
      }).then(r => {
        if (!r.ok) throw new Error('tile HTTP ' + r.status);
        return r.blob();
      }).then(blob => {
        return new Promise((resolve, reject) => {
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => { dctWmTileImg = img; dctWmTileUrl = url; dctWmTileLoading = null; resolve(img); };
          img.onerror = () => { try { URL.revokeObjectURL(url); } catch(e){} dctWmTileLoading = null; reject(new Error('tile decode fail')); };
          img.src = url;
        });
      }).catch(e => { dctWmTileLoading = null; throw e; });
      return dctWmTileLoading;
    }
    function dctWmClearTile() {
      if (dctWmTileUrl) { try { URL.revokeObjectURL(dctWmTileUrl); } catch(e){} }
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
      const ctx = canvas.getContext('2d');
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
        canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9997;mix-blend-mode:multiply;';
        document.body.appendChild(canvas);
        dctWmCanvas = canvas;
      }
      dctWmLoadTile().then(() => {
        if (!dctWmShouldShow()) { dctWmRemoveCanvas(); return; }
        dctWmPaint(canvas);
      }).catch(() => {});
    }
    let createScheduleTime = '';
    let createPollData = { options: [], votes: {} };
    let createVisibleUsers = [];
    let createBlockedUsers = [];
    let tempUserSelectType = 'visible';
    let replyTargetSeq = 0;
    let inputCallback = null;
    let badgeRefreshTimer = null;
    let unreadTotalCount = 0;
    let atSearchCache = {};
    let atSearchTimer = null;
    let currentUploadXhr = null;
    let uploadProgressCache = {};

    function getToken() { return localStorage.getItem('zanhua_token') || ''; }
    let currentUsername = '';
    let currentNickname = '';
    function setToken(t) { localStorage.setItem('zanhua_token', t); if (typeof dctWmClearTile === 'function') dctWmClearTile(); dctWmRemoveCanvas(); }
    function getUid() { try { return atob(getToken().replace(/^admin_/, '')).split(':')[0]; } catch(e) { return ''; } }
    function isAdminAccount() { return getToken().indexOf('admin_') === 0 || currentNickname === '管理员'; }

    async function api(url, method = 'GET', data = null) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const opts = {
        method,
        headers: { 'Authorization': getToken() },
        signal: controller.signal
      };
      if (data && method === 'POST') {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(data);
      }
      try {
        const res = await fetch(API_BASE + url, opts);
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error('网络响应异常 (HTTP ' + res.status + ')');
        const json = await res.json();
        
        
        if (json && json.code === 403 && json.forceLogout) {
          localStorage.removeItem('zanhua_token');
          const info = (json.banInfo && typeof json.banInfo === 'object') ? json.banInfo : {};
          const tip = info.permanent
            ? '账号已被永久封禁，无法继续使用。'
            : (info.endTime ? `账号已被封禁，至 ${String(info.endTime).slice(0,16)} 解除。` : '账号已被封禁。');
          const msg = json.msg || (tip + ' 请联系管理员申诉。');
          try { showToast(msg); } catch(_) {}
          setTimeout(() => { try { showLoginModal && showLoginModal(msg); } catch(_) { location.reload(); } }, 300);
          throw new Error('账号已封禁');
        }
        return json;
      } catch (e) {
        clearTimeout(timeoutId);
        if (e.name === 'AbortError') throw new Error('请求超时，请检查网络');
        throw e;
      }
    }

    function apiForm(url, formData, onProgress, timeoutMs, xhrRef) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        if (xhrRef) xhrRef.xhr = xhr;
        xhr.open('POST', API_BASE + url, true);
        xhr.setRequestHeader('Authorization', getToken());
        if (onProgress && typeof onProgress === 'function') {
          xhr.upload.onprogress = (e) => {
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
              reject(new Error('服务器返回数据格式错误'));
            }
          } else if (xhr.status === 413) {
            reject(new Error('文件过大，请压缩后重试'));
          } else {
            reject(new Error('上传失败，状态码: ' + xhr.status));
          }
        };
        xhr.onerror = function() {
          reject(new Error('网络请求失败，请检查网络连接'));
        };
        xhr.ontimeout = function() {
          reject(new Error('上传请求超时，请检查网络'));
        };
        xhr.onabort = function() {
          reject(new Error('上传已取消'));
        };
        xhr.timeout = timeoutMs || 0;
        xhr.send(formData);
      });
    }

    function generateVideoThumbnail(file) {
      return new Promise((resolve) => {
        try {
          const video = document.createElement('video');
          video.muted = true;
          video.playsInline = true;
          video.setAttribute('playsinline', '');
          video.setAttribute('webkit-playsinline', '');
          video.setAttribute('muted', '');
          video.preload = 'auto';
          video.crossOrigin = 'anonymous';
          const url = URL.createObjectURL(file);
          video.src = url;
          let resolved = false;
          const SIZE = 320;
          function done(thumbUrl) {
            if (resolved) return;
            resolved = true;
            try { URL.revokeObjectURL(url); } catch(e) {}
            resolve(thumbUrl);
          }
          function tryCapture() {
            if (resolved) return;
            if (video.readyState >= 2 && video.videoWidth > 0) {
              captureThumb();
            }
          }
          video.addEventListener('loadedmetadata', function() {
            try {
              const seekTime = Math.min(1, (video.duration || 0) * 0.1 || 0.5);
              video.currentTime = seekTime;
            } catch(e) {
              tryCapture();
            }
          });
          video.addEventListener('loadeddata', tryCapture);
          video.addEventListener('seeked', captureThumb);
          video.addEventListener('canplay', captureThumb);
          video.addEventListener('canplaythrough', captureThumb);
          video.addEventListener('error', function() {
            done(null);
          });
          try {
            video.load();
          } catch(e) {}
          try {
            video.play().catch(() => {});
          } catch(e) {}
          setTimeout(function() {
            if (!resolved && video.readyState >= 2 && video.videoWidth > 0) {
              captureThumb();
            } else if (!resolved) {
              done(null);
            }
          }, 8000);
          function captureThumb() {
            if (resolved) return;
            try {
              const canvas = document.createElement('canvas');
              const vw = video.videoWidth || 320;
              const vh = video.videoHeight || 320;
              if (vw === 0 || vh === 0) {
                setTimeout(tryCapture, 200);
                return;
              }
              canvas.width = SIZE;
              canvas.height = SIZE;
              const ctx = canvas.getContext('2d');
              ctx.fillStyle = '#000';
              ctx.fillRect(0, 0, SIZE, SIZE);
              const scale = Math.max(SIZE / vw, SIZE / vh);
              const dw = vw * scale;
              const dh = vh * scale;
              const dx = (SIZE - dw) / 2;
              const dy = (SIZE - dh) / 2;
              ctx.drawImage(video, dx, dy, dw, dh);
              const thumb = canvas.toDataURL('image/jpeg', 0.7);
              if (thumb && thumb.length > 1000) {
                done(thumb);
              } else {
                done(null);
              }
            } catch(e) {
              done(null);
            }
          }
        } catch(e) {
          resolve(null);
        }
      });
    }

    function compressImage(file) {
      return new Promise((resolve) => {
        if (!file.type.startsWith('image/')) {
          resolve(file);
          return;
        }
        try {
          const reader = new FileReader();
          reader.onerror = () => { resolve(file); };
          reader.onload = (e) => {
            const img = new Image();
            img.onerror = () => { resolve(file); };
            img.onload = () => {
              try {
                const canvas = document.createElement('canvas');
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
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                  if (!blob) { resolve(file); return; }
                  resolve(new File([blob], `compressed_${Date.now()}.webp`, { type: 'image/webp' }));
                }, 'image/webp', 0.85);
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
      if (s.includes('+08:00') || s.includes('Z') || s.includes('GMT')) {
        return new Date(s).getTime();
      }
      const iso = s.replace(' ', 'T') + '+08:00';
      return new Date(iso).getTime();
    }
    function timeAgo(t) {
      if (!t) return '刚刚';
      const diff = Date.now() - parseBeijingTime(t);
      if (isNaN(diff)) return '刚刚';
      if (diff < 30000) return '刚刚';
      if (diff < 60000) return Math.floor(diff / 1000) + '秒前';
      if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
      if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
      if (diff < 2592000000) return Math.floor(diff / 86400000) + '天前';
      return String(t).slice(0, 10);
    }

    function formatNumber(n) {
      n = parseInt(n) || 0;
      if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
      if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
      return n.toString();
    }

    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    function formatContentWithTopics(content) {
      if (!content) return '';
      let html = escapeHtml(content).replace(/\n/g, '<br>');
      html = html.replace(/＃/g, '#');
      html = html.replace(/＠/g, '@');
      html = html.replace(/#([^#\s\n]{1,20})#/g, function(m, name) {
        const enc = encodeURIComponent(name);
        return '<span class="post-topic-tag" onclick="event.stopPropagation();goTopicDetail(decodeURIComponent(\'' + enc + '\'))">#' + name + '#</span>';
      });
      html = html.replace(/@\[(\d+)\]([^\s\[\]<]{1,30})/g, function(m, uid, name) {
        return '<span class="post-at-tag" onclick="event.stopPropagation();goUserProfile(\'' + uid + '\')"> @' + name + '</span>';
      });
      return html;
    }

    function formatCommentContent(content) {
      if (!content) return '';
      let html = escapeHtml(content).replace(/\n/g, '<br>');
      html = html.replace(/@\[(\d+)\]([^\s\[\]<]{1,30})/g, function(m, uid, name) {
        return '<span class="post-at-tag" onclick="event.stopPropagation();goUserProfile(\'' + uid + '\')"> @' + name + '</span>';
      });
      return html;
    }

    function getVerifSvg(type, size = 14, inline = false) {
      const align = inline ? 'vertical-align:-2px;' : '';
      const s = `width:${size}px;height:${size}px;flex-shrink:0;${align}`;
      if (type === 'enterprise') {
        return `<img src="${MEDIA_BASE}/res/icons/icon-i5xq4thdo.svg" style="${s};filter:invert(35%) sepia(94%) saturate(1587%) hue-rotate(185deg) brightness(97%) contrast(95%);" class="verif-icon verif-enterprise" alt="认证">`;
      }
      if (type === 'basic') {
        return `<img src="${MEDIA_BASE}/res/icons/icon-i5xq4thdo.svg" style="${s};filter:invert(52%) sepia(28%) saturate(614%) hue-rotate(86deg) brightness(94%) contrast(90%);" class="verif-icon verif-basic" alt="普通认证">`;
      }
      if (type === 'personal') {

        return `<img src="${MEDIA_BASE}/res/icons/icon-i5xq4thdo.svg" style="${s};filter:invert(68%) sepia(98%) saturate(2000%) hue-rotate(10deg) brightness(95%) contrast(105%);" class="verif-icon verif-personal" alt="认证">`;
      }
      if (type === 'advanced') {
        return `<img src="${MEDIA_BASE}/res/icons/icon-jztvozsrv.svg" style="${s};filter:grayscale(100%) brightness(0.82) contrast(1.15);" class="verif-icon verif-advanced" alt="进阶认证">`;
      }
      if (type === 'premium') {
        return `<img src="${MEDIA_BASE}/res/icons/icon-jztvozsrv.svg" style="${s}" class="verif-icon verif-premium" alt="高级认证">`;
      }
      return '';
    }
    function getVerificationTypes(data) {
      if (!data) return [];
      let arr = [];
      if (Array.isArray(data.user_verifications)) arr = data.user_verifications;
      else if (typeof data.user_verifications === 'string') arr = data.user_verifications.split(',').filter(x => x);
      else if (Array.isArray(data.verifications)) arr = data.verifications;
      else if (typeof data.verifications === 'string') arr = data.verifications.split(',').filter(x => x);
      return arr.map(v => typeof v === 'string' ? v : v.type).filter(Boolean);
    }
    function getVerifOrgName(data, type) {
      let arr = [];
      if (Array.isArray(data.verifications)) arr = data.verifications;
      if (Array.isArray(data.user_verifications)) arr = data.user_verifications;
      const found = arr.find(v => (typeof v === 'string' ? v : v.type) === type);
      if (found && typeof found === 'object' && found.org_name) return found.org_name;
      return '';
    }
    function renderListVerification(data) {
      const types = getVerificationTypes(data);
      if (!types.length) return '';
      const priority = ['enterprise', 'premium', 'advanced', 'personal', 'basic'];
      let displayType = null;
      const settings = (data.verif_settings && typeof data.verif_settings === 'string') ? JSON.parse(data.verif_settings) : (data.verif_settings || {});
      if (settings.name_display && settings.name_display !== 'earliest' && types.includes(settings.name_display)) {
        displayType = settings.name_display;
      } else {
        const reversePriority = [...priority].reverse();
        for (const t of reversePriority) { if (types.includes(t)) { displayType = t; break; } }
      }
      if (!displayType) return '';
      return `<span class="verif-badge">${getVerifSvg(displayType, 15, true)}</span>`;
    }
    function renderProfileVerificationRows(data) {
      const types = getVerificationTypes(data);
      if (!types.length) return '';
      const settings = (data.verif_settings && typeof data.verif_settings === 'string') ? JSON.parse(data.verif_settings) : (data.verif_settings || {});
      const hidden = (settings.profile_hidden && Array.isArray(settings.profile_hidden)) ? settings.profile_hidden : [];
      const configs = [
        { type: 'enterprise', label: '企业/机构/团体认证' },
        { type: 'premium', label: '高级认证用户' },
        { type: 'advanced', label: '进阶认证用户' },
        { type: 'personal', label: 'Beta版内测用户纪念认证' },
        { type: 'basic', label: '普通认证用户' }
      ];
      const rows = [];
      for (const cfg of configs) {
        if (types.includes(cfg.type) && !hidden.includes(cfg.type)) {
          let label = cfg.label;
          if (cfg.type === 'enterprise') {
            const orgName = getVerifOrgName(data, 'enterprise');
            if (orgName) label = orgName;
          }

          rows.push(`<div style="display:flex;align-items:center;gap:6px;padding:3px 0;">${getVerifSvg(cfg.type, 16)}<span style="font-size:13px;color:#666;">${label}</span></div>`);
        }
      }

      return rows.join('');
    }

    function goUserByNickname(nickname) {
      api('/searchUser?keyword=' + encodeURIComponent(nickname)).then(r => {
        if (r.code === 1 && r.data && r.data.length > 0) {
          const user = r.data.find(u => u.nickname === nickname) || r.data[0];
          goUserProfile(user.uid);
        } else {
          showToast('未找到该用户');
        }
      }).catch(() => {
        showToast('查找用户失败');
      });
    }

    function showToast(msg) {
      let container = document.getElementById('toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;pointer-events:none;display:flex;flex-direction:column;gap:8px;';
        document.body.appendChild(container);
      }
      const toast = document.createElement('div');
      toast.style.cssText = 'background:rgba(0,0,0,0.8);color:#fff;padding:12px 24px;border-radius:8px;font-size:14px;white-space:pre-line;max-width:85vw;min-width:200px;text-align:center;line-height:1.6;word-break:break-word;animation:toastFadeIn 0.3s ease;';
      toast.textContent = msg;
      container.appendChild(toast);
      setTimeout(() => {
        toast.style.transition = 'opacity 0.25s cubic-bezier(0.23, 1, 0.32, 1), transform 0.25s cubic-bezier(0.23, 1, 0.32, 1)';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        setTimeout(() => toast.remove(), 300);
      }, 2500);
    }

    let currentVideoSrc = '';
    let currentVideoAllowDownload = true;
    let playerVideoBlobUrl = null;
    let playerLongPressTimer = null;
    let playerSpeedIndicator = null;
    let playerFirstTipShown = false;

    async function openVideoPlayer(src, poster, allowDownload = true) {
      if (!getToken()) { showLoginModal(); return; }
      currentVideoSrc = src;
      currentVideoAllowDownload = allowDownload;
      let player = document.getElementById('custom-video-player');
      if (!player) {
        player = document.createElement('div');
        player.id = 'custom-video-player';
        player.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:10000;display:flex;align-items:center;justify-content:center;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;touch-action:manipulation;';
        player.innerHTML = `
          <video id="player-video" playsinline webkit-playsinline controlslist="nodownload nofullscreen noremoteplayback" style="max-width:100%;max-height:100%;object-fit:contain;pointer-events:none;-webkit-touch-callout:none;" oncontextmenu="return false;"></video>
          <div id="player-loading" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10001;display:none;">
            <div style="width:40px;height:40px;border:3px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:player-spin 0.8s linear infinite;"></div>
          </div>
          <style>@keyframes player-spin { to { transform: rotate(360deg); } }</style>
          <div id="player-close" style="position:absolute;top:20px;right:20px;width:40px;height:40px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.2);z-index:10001;" onclick="closeVideoPlayer()">
            <i class="fa-solid fa-xmark" style="color:#000;font-size:20px;"></i>
          </div>
          <div id="player-more" style="position:absolute;top:20px;right:70px;width:40px;height:40px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.2);z-index:10001;" onclick="togglePlayerMore()">
            <i class="fa-solid fa-ellipsis" style="color:#000;font-size:18px;"></i>
          </div>
          <div id="player-more-menu" style="position:absolute;top:70px;right:20px;background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.3);padding:8px 0;min-width:140px;display:none;z-index:10003;">
            <div class="player-menu-item" onclick="togglePlayerMute();togglePlayerMore()"><span id="player-menu-mute-text">开启静音</span></div>
            <div class="player-menu-item" onclick="togglePlayerSpeedMenu()">倍速 <span id="player-current-speed" style="color:#999;font-size:12px;float:right;">1.0x</span></div>
            <div class="player-menu-item" onclick="downloadVideo();togglePlayerMore()">下载视频</div>
          </div>
          <div id="player-speed-menu" style="position:absolute;top:70px;right:20px;background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.3);padding:8px 0;min-width:140px;display:none;z-index:10003;">
            <div class="player-menu-item" style="font-weight:600;color:#666;border-bottom:1px solid #eee;" onclick="togglePlayerSpeedMenu()">← 返回</div>
            <div class="player-menu-item" onclick="setPlayerSpeed(0.5)">0.5倍速</div>
            <div class="player-menu-item" onclick="setPlayerSpeed(1)">1.0倍速</div>
            <div class="player-menu-item" onclick="setPlayerSpeed(1.25)">1.25倍速</div>
            <div class="player-menu-item" onclick="setPlayerSpeed(1.5)">1.5倍速</div>
            <div class="player-menu-item" onclick="setPlayerSpeed(2)">2.0倍速</div>
            <div class="player-menu-item" onclick="setPlayerSpeed(3)">3.0倍速</div>
          </div>
          <div id="player-controls" style="position:absolute;bottom:20px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:16px;color:#fff;">
            <div id="player-play-btn" style="width:44px;height:44px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.2);" onclick="togglePlayerPlay()">
              <i class="fa-solid fa-play" style="color:#000;font-size:18px;margin-left:2px;"></i>
            </div>
            <div style="display:flex;align-items:center;gap:8px;font-size:13px;text-shadow:0 1px 2px rgba(0,0,0,0.5);">
              <span id="player-current" style="min-width:35px;text-align:right;">0:00</span>
              <div id="player-progress" style="width:150px;height:4px;background:rgba(255,255,255,0.3);border-radius:2px;cursor:pointer;position:relative;box-shadow:0 1px 2px rgba(0,0,0,0.3);border:0.5px solid rgba(0,0,0,0.2);">
                <div id="player-progress-bar" style="height:100%;background:#fff;border-radius:2px;width:0;"></div>
                <div id="player-progress-thumb" style="position:absolute;top:50%;left:0;transform:translate(-50%,-50%);width:12px;height:12px;background:#fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.3);display:none;"></div>
              </div>
              <span id="player-duration" style="min-width:35px;">0:00</span>
            </div>
            <div style="width:36px;height:36px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.2);" onclick="togglePlayerFullscreen()">
              <i class="fa-solid fa-expand" style="color:#000;font-size:16px;"></i>
            </div>
          </div>
        `;
        document.body.appendChild(player);
        const video = document.getElementById('player-video');
        video.addEventListener('timeupdate', updatePlayerProgress);
        video.addEventListener('loadedmetadata', updatePlayerDuration);
        video.addEventListener('waiting', () => {
          const loading = document.getElementById('player-loading');
          if (loading) loading.style.display = 'block';
        });
        video.addEventListener('playing', () => {
          const loading = document.getElementById('player-loading');
          if (loading) loading.style.display = 'none';
        });
        video.addEventListener('canplay', () => {
          const loading = document.getElementById('player-loading');
          if (loading) loading.style.display = 'none';
        });
        video.addEventListener('play', () => {
          document.getElementById('player-play-btn').innerHTML = '<i class="fa-solid fa-pause" style="color:#000;font-size:18px;"></i>';
        });
        video.addEventListener('pause', () => {
          document.getElementById('player-play-btn').innerHTML = '<i class="fa-solid fa-play" style="color:#000;font-size:18px;margin-left:2px;"></i>';
        });
        video.addEventListener('ended', () => {
          document.getElementById('player-play-btn').innerHTML = '<i class="fa-solid fa-play" style="color:#000;font-size:18px;margin-left:2px;"></i>';
          const loading = document.getElementById('player-loading');
          if (loading) loading.style.display = 'none';
          video.currentTime = 0;
          video.playbackRate = 1;
          hidePlayerSpeedIndicator();
          const bar = document.getElementById('player-progress-bar');
          const thumb = document.getElementById('player-progress-thumb');
          const current = document.getElementById('player-current');
          if (bar) bar.style.width = '0%';
          if (thumb) thumb.style.left = '0%';
          if (current) current.textContent = '0:00';
        });
        document.getElementById('player-progress').addEventListener('click', (e) => {
          if (playerDragging) return;
          const rect = e.target.closest('#player-progress').getBoundingClientRect();
          const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          const video = document.getElementById('player-video');
          if (video && video.duration) {
            video.currentTime = percent * video.duration;
          }
        });
        let playerDragging = false;
        const progressEl = document.getElementById('player-progress');
        const thumbEl = document.getElementById('player-progress-thumb');
        function handleProgressDrag(e) {
          const rect = progressEl.getBoundingClientRect();
          const clientX = e.touches ? e.touches[0].clientX : e.clientX;
          const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
          const video = document.getElementById('player-video');
          const bar = document.getElementById('player-progress-bar');
          if (bar) bar.style.width = (percent * 100) + '%';
          if (thumbEl) thumbEl.style.left = (percent * 100) + '%';
          if (video && video.duration) {
            video.currentTime = percent * video.duration;
          }
        }
        progressEl.addEventListener('mousedown', (e) => {
          playerDragging = true;
          handleProgressDrag(e);
          e.preventDefault();
        });
        progressEl.addEventListener('touchstart', (e) => {
          playerDragging = true;
          handleProgressDrag(e);
        }, { passive: true });
        document.addEventListener('mousemove', (e) => {
          if (playerDragging) handleProgressDrag(e);
        });
        document.addEventListener('touchmove', (e) => {
          if (playerDragging) handleProgressDrag(e);
        }, { passive: true });
        document.addEventListener('mouseup', () => { playerDragging = false; });
        document.addEventListener('touchend', () => { playerDragging = false; });
        player.addEventListener('click', (e) => {
          if (e.target === player) {
            togglePlayerControls();
            const menu = document.getElementById('player-more-menu');
            if (menu) menu.style.display = 'none';
          }
        });
        player.addEventListener('mousedown', handlePlayerLongPressStart);
        player.addEventListener('touchstart', handlePlayerLongPressStart, { passive: false });
        player.addEventListener('mouseup', handlePlayerLongPressEnd);
        player.addEventListener('mouseleave', handlePlayerLongPressEnd);
        player.addEventListener('touchend', handlePlayerLongPressEnd);
        player.addEventListener('touchcancel', handlePlayerLongPressEnd);
        player.addEventListener('contextmenu', (e) => e.preventDefault());
      }
      const video = document.getElementById('player-video');
      
      player.style.display = 'flex';
      const loadingEl = document.getElementById('player-loading');
      if (loadingEl) loadingEl.style.display = 'block';
      const resolvedSrc = await resolveVideoUrl(src);
      if (!resolvedSrc) {
        if (loadingEl) loadingEl.style.display = 'none';
        player.style.display = 'none';
        showToast('视频加载失败，请重试');
        return;
      }
      const resolvedPoster = resolveMediaUrl(poster);
      currentVideoSrc = resolvedSrc; 
      video.src = resolvedSrc;
      video.poster = resolvedPoster || '';
      video.playbackRate = 1;
      video.muted = false;
      const muteText = document.getElementById('player-menu-mute-text');
      if (muteText) muteText.textContent = '开启静音';
      const speedLabel = document.getElementById('player-current-speed');
      if (speedLabel) speedLabel.textContent = '1.0x';
      const speedMenu = document.getElementById('player-speed-menu');
      if (speedMenu) speedMenu.style.display = 'none';
      video.play().catch(() => {});
      if (!localStorage.getItem('video_player_tip_shown')) {
        setTimeout(() => {
          showPlayerFirstTip();
        }, 800);
      }
    }

    function showPlayerFirstTip() {
      const player = document.getElementById('custom-video-player');
      if (!player) return;
      const tip = document.createElement('div');
      tip.id = 'player-first-tip';
      tip.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.75);color:#fff;padding:20px 24px;border-radius:16px;font-size:15px;text-align:center;z-index:10005;max-width:280px;line-height:1.6;pointer-events:none;';
      tip.innerHTML = `
        <div style="font-size:17px;font-weight:600;margin-bottom:10px;">💡 小提示</div>
        <div style="margin-bottom:8px;">长按屏幕左右两侧</div>
        <div style="color:#90EE90;font-weight:500;">可 2 倍速播放</div>
        <div style="margin-top:14px;font-size:12px;color:#aaa;">松开手指恢复正常速度</div>
        <div style="margin-top:16px;font-size:11px;color:#888;">点击任意位置关闭</div>
      `;
      player.appendChild(tip);
      playerFirstTipShown = true;
      localStorage.setItem('video_player_tip_shown', '1');
      const closeTip = () => {
        if (tip && tip.parentNode) {
          tip.style.transition = 'opacity 0.3s';
          tip.style.opacity = '0';
          setTimeout(() => tip.remove(), 300);
        }
        player.removeEventListener('click', closeTip);
        player.removeEventListener('touchstart', closeTip);
      };
      setTimeout(() => {
        player.addEventListener('click', closeTip);
        player.addEventListener('touchstart', closeTip);
      }, 100);
      setTimeout(() => {
        closeTip();
      }, 6000);
    }

    function closeVideoPlayer() {
      const player = document.getElementById('custom-video-player');
      if (player) {
        const video = document.getElementById('player-video');
        video.pause();
        video.src = '';
        player.style.display = 'none';
      }
      if (playerVideoBlobUrl) {
        try { URL.revokeObjectURL(playerVideoBlobUrl); } catch(e) {}
        playerVideoBlobUrl = null;
      }
    }

    function togglePlayerPlay() {
      const video = document.getElementById('player-video');
      if (video.paused) {
        video.play();
      } else {
        video.pause();
      }
    }

    function updatePlayerProgress() {
      const video = document.getElementById('player-video');
      const bar = document.getElementById('player-progress-bar');
      const current = document.getElementById('player-current');
      const thumb = document.getElementById('player-progress-thumb');
      if (video && bar && current && video.duration) {
        const percent = (video.currentTime / video.duration) * 100;
        bar.style.width = percent + '%';
        if (thumb) thumb.style.left = percent + '%';
        const mins = Math.floor(video.currentTime / 60);
        const secs = Math.floor(video.currentTime % 60);
        current.textContent = mins + ':' + (secs < 10 ? '0' + secs : secs);
      }
    }

    function updatePlayerDuration() {
      const video = document.getElementById('player-video');
      const duration = document.getElementById('player-duration');
      const thumb = document.getElementById('player-progress-thumb');
      if (video && duration && video.duration) {
        const mins = Math.floor(video.duration / 60);
        const secs = Math.floor(video.duration % 60);
        duration.textContent = mins + ':' + (secs < 10 ? '0' + secs : secs);
        if (thumb) thumb.style.display = 'block';
      }
    }

    function togglePlayerControls() {
      const controls = document.getElementById('player-controls');
      if (controls) {
        controls.style.opacity = controls.style.opacity === '0' ? '1' : '0';
        controls.style.transition = 'opacity 0.3s';
      }
    }

    function togglePlayerFullscreen() {
      const player = document.getElementById('custom-video-player');
      if (player) {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          player.requestFullscreen().catch(() => {});
        }
      }
    }

    function togglePlayerMore() {
      const menu = document.getElementById('player-more-menu');
      const speedMenu = document.getElementById('player-speed-menu');
      if (!menu) return;
      const isHidden = menu.style.display === 'none';
      menu.style.display = isHidden ? 'block' : 'none';
      if (speedMenu && !isHidden) speedMenu.style.display = 'none';
    }

    function togglePlayerSpeedMenu() {
      const menu = document.getElementById('player-more-menu');
      const speedMenu = document.getElementById('player-speed-menu');
      if (!menu || !speedMenu) return;
      if (speedMenu.style.display === 'block') {
        speedMenu.style.display = 'none';
        menu.style.display = 'block';
      } else {
        menu.style.display = 'none';
        speedMenu.style.display = 'block';
      }
    }

    function setPlayerSpeed(speed) {
      const video = document.getElementById('player-video');
      if (video) {
        video.playbackRate = speed;
      }
      const speedMenu = document.getElementById('player-speed-menu');
      const menu = document.getElementById('player-more-menu');
      if (speedMenu) speedMenu.style.display = 'none';
      if (menu) menu.style.display = 'none';
      const speedLabel = document.getElementById('player-current-speed');
      if (speedLabel) speedLabel.textContent = speed + 'x';
      showPlayerToast('正在以 ' + speed + ' 倍速播放');
    }

    let playerToastTimer = null;
    function showPlayerToast(text) {
      const player = document.getElementById('custom-video-player');
      if (!player) return;
      let toast = document.getElementById('player-toast');
      if (toast) toast.remove();
      toast = document.createElement('div');
      toast.id = 'player-toast';
      toast.style.cssText = 'position:absolute;top:80px;left:50%;transform:translateX(-50%);background:#fff;color:#000;padding:8px 16px;border-radius:8px;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.2);z-index:10004;white-space:nowrap;';
      toast.textContent = text;
      player.appendChild(toast);
      if (playerToastTimer) clearTimeout(playerToastTimer);
      playerToastTimer = setTimeout(() => {
        if (toast && toast.parentNode) toast.remove();
      }, 2000);
    }

    function togglePlayerMute() {
      const video = document.getElementById('player-video');
      const text = document.getElementById('player-menu-mute-text');
      if (video) {
        video.muted = !video.muted;
        if (text) {
          text.textContent = video.muted ? '关闭静音' : '开启静音';
        }
      }
    }

    function downloadVideo() {
      if (!currentVideoAllowDownload && currentNickname !== '管理员') {
        showToast('作者设置了不允许下载');
        return;
      }
      if (!currentVideoSrc) return;
      const link = document.createElement('a');
      link.href = currentVideoSrc;
      link.download = 'video.mp4';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    function handlePlayerLongPressStart(e) {
      const player = document.getElementById('custom-video-player');
      if (!player) return;
      const target = e.target;
      if (target.closest('#player-close') || target.closest('#player-more') ||
          target.closest('#player-more-menu') || target.closest('#player-controls') ||
          target.closest('#player-progress')) {
        return;
      }
      const rect = player.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const xPercent = (clientX - rect.left) / rect.width;
      if (xPercent < 0.25 || xPercent > 0.75) {
        if (e.cancelable && e.type === 'touchstart') e.preventDefault();
        playerLongPressTimer = setTimeout(() => {
          const video = document.getElementById('player-video');
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
      const video = document.getElementById('player-video');
      if (video) {
        video.playbackRate = 1;
      }
      hidePlayerSpeedIndicator();
    }

    function showPlayerSpeedIndicator() {
      if (playerSpeedIndicator) return;
      playerSpeedIndicator = document.createElement('div');
      playerSpeedIndicator.style.cssText = 'position:absolute;top:80px;left:50%;transform:translateX(-50%);background:#fff;color:#000;padding:8px 16px;border-radius:8px;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.2);z-index:10002;white-space:nowrap;';
      playerSpeedIndicator.textContent = '2倍速播放中...';
      const player = document.getElementById('custom-video-player');
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
      if (p === 'discover' && !getToken()) {
        showLoginModal();
        return;
      }
      if (chatTimer && currentPage === 'chat') {
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
          history.pushState({ page: p }, '', '#' + p);
        } catch(e) {}
      }
      if (isPageAnimating) return;
      isPageAnimating = true;
      prevPage = currentPage;
      currentPage = p;
      window._pageParam2 = param2 || null;
      const app = document.getElementById('app');
      const isTabPage = TAB_PAGES.includes(p) && TAB_PAGES.includes(prevPage);
      const direction = TAB_PAGES.includes(p) && !TAB_PAGES.includes(prevPage) ? 'forward' :
                        (!TAB_PAGES.includes(p) && TAB_PAGES.includes(prevPage) ? 'back' :
                        (isTabPage ? 'fade' : 'forward'));
      if (direction === 'back') {
        const oldContent = app.innerHTML;
        const exitLayer = document.createElement('div');
        exitLayer.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9998;background:#fff;overflow:hidden;';
        exitLayer.innerHTML = oldContent;
        document.body.appendChild(exitLayer);
        render();
        updateTabbar();
        window.scrollTo(0, 0);
        requestAnimationFrame(() => {
          exitLayer.style.transition = 'transform 0.28s cubic-bezier(0.23, 1, 0.32, 1), opacity 0.28s cubic-bezier(0.23, 1, 0.32, 1)';
          exitLayer.style.transform = 'translateX(100%)';
          exitLayer.style.opacity = '0';
          app.style.transition = 'opacity 0.2s ease';
          app.style.opacity = '0';
          requestAnimationFrame(() => {
            app.style.opacity = '1';
          });
          setTimeout(() => {
            exitLayer.remove();
            isPageAnimating = false;
            app.style.transition = '';
            app.style.opacity = '';
            ensureTabbarVisible();
            ensureCommentInputVisible();
            ensureFabVisible();
          }, 300);
        });
      } else {
        app.style.transition = 'none';
        app.style.opacity = direction === 'fade' ? '0.5' : '0';
        app.style.transform = direction === 'forward' ? 'translateX(30px)' : 'none';
        render();
        updateTabbar();
        window.scrollTo(0, 0);
        requestAnimationFrame(() => {
          app.style.transition = 'opacity 0.25s cubic-bezier(0.23, 1, 0.32, 1), transform 0.25s cubic-bezier(0.23, 1, 0.32, 1)';
          app.style.opacity = '1';
          app.style.transform = 'translateX(0)';
          setTimeout(() => {
            isPageAnimating = false;
            app.style.transition = '';
            app.style.opacity = '';
            app.style.removeProperty('transform');
            ensureTabbarVisible();
            ensureCommentInputVisible();
            ensureFabVisible();
          }, 280);
        });
      }
    }

    function render() {
      const app = document.getElementById('app');
      const fl0 = document.getElementById('fixed-layer');
      if (fl0) fl0.innerHTML = '';
      switch (currentPage) {
        case 'home': app.innerHTML = renderHome(); bindHomeEvents(); break;
        case 'discover': app.innerHTML = renderDiscover(); bindDiscoverEvents(); break;
        case 'message': app.innerHTML = renderMessage(); bindMessageEvents(); break;
        case 'profile': app.innerHTML = renderProfile(); bindProfileEvents(); break;
        case 'auth': app.innerHTML = renderAuth(); bindAuthEvents(); initCaptchaIfNeeded(); break;
        case 'postDetail': app.innerHTML = renderPostDetail(); bindPostDetailEvents(); break;
        case 'topicDetail': app.innerHTML = renderTopicDetail(); bindTopicDetailEvents(); break;
        case 'search': app.innerHTML = renderSearch(); bindSearchEvents(); break;
        case 'userProfile': app.innerHTML = renderUserProfile(); bindUserProfileEvents(); break;
        case 'chat': app.innerHTML = renderChat(); bindChatEvents(); break;
        case 'strangerList': app.innerHTML = renderStrangerList(); bindStrangerListEvents(); break;
        case 'editProfile': if (editProfileTab !== 'profile') editProfileTab = 'profile'; app.innerHTML = renderEditProfile(); bindEditProfileEvents(); break;
        case 'securitySettings': if (editProfileTab !== 'security') editProfileTab = 'security'; app.innerHTML = renderEditProfile(); bindEditProfileEvents(); break;
        case 'feedback': app.innerHTML = renderFeedback(); bindFeedbackEvents(); break;
        case 'createPost': app.innerHTML = renderCreatePost(); bindCreatePostEvents(); break;
        case 'confessionDetail': app.innerHTML = renderConfessionDetail(); bindConfessionDetailEvents(); break;
        case 'notificationLikes': app.innerHTML = renderNotificationLikes(); bindNotificationLikesEvents(); break;
        case 'notificationFollows': app.innerHTML = renderNotificationFollows(); bindNotificationFollowsEvents(); break;
        case 'notificationComments': app.innerHTML = renderNotificationComments(); bindNotificationCommentsEvents(); break;
        case 'realnameVerify': app.innerHTML = renderRealnameVerify(); bindRealnameVerifyEvents(); break;
        case 'parentConsent': app.innerHTML = renderParentConsent(); bindParentConsentEvents(); break;
        case 'enterpriseApply': app.innerHTML = renderEnterpriseApply(); bindEnterpriseApplyEvents(); break;
        case 'buyExposure': app.innerHTML = renderBuyExposure(); bindBuyExposureEvents(); break;
        case 'buyPin': app.innerHTML = renderBuyPin(); bindBuyPinEvents(); break;
        case 'paySubscribe': app.innerHTML = '<div style="min-height:100vh;background:#0d0d0f;display:flex;align-items:center;justify-content:center;"><div style="color:rgba(255,255,255,0.4);font-size:14px;">加载中...</div></div>'; renderPaySubscribe().then(html => { app.innerHTML = html; bindPaySubscribeEvents(); }); break;
        case 'mySubOrders': app.innerHTML = '<div style="min-height:100vh;background:#0d0d0f;display:flex;align-items:center;justify-content:center;"><div style="color:rgba(255,255,255,0.4);font-size:14px;">加载中...</div></div>'; renderMySubOrders().then(html => { app.innerHTML = html; bindMySubOrdersEvents(); }); break;
        case 'myServiceOrders': app.innerHTML = '<div style="min-height:100vh;background:#0d0d0f;display:flex;align-items:center;justify-content:center;"><div style="color:rgba(255,255,255,0.4);font-size:14px;">加载中...</div></div>'; renderMyServiceOrders().then(html => { app.innerHTML = html; bindMyServiceOrdersEvents(); }); break;
        case 'youthMode': app.innerHTML = renderYouthModePage(); bindYouthModeEvents(); break;
        case 'verifSubscribe': app.innerHTML = '<div style="min-height:100vh;background:#0d0d0f;display:flex;align-items:center;justify-content:center;"><div style="color:rgba(255,255,255,0.4);font-size:14px;">加载中...</div></div>'; renderVerifSubscribe().then(html => { app.innerHTML = html; bindVerifSubscribeEvents(); }); break;
        case 'safetyCenter': app.innerHTML = renderSafetyCenter(); bindSafetyCenterEvents(); break;
        case 'followListPage': app.innerHTML = renderFollowListPage(); bindFollowListPageEvents(); break;
        case 'fansListPage': app.innerHTML = renderFansListPage(); bindFansListPageEvents(); break;
        case 'violationDetail': app.innerHTML = renderViolationDetail(); bindViolationDetailEvents(); break;
        case 'rulesCenter': app.innerHTML = renderRulesCenter(); bindRulesCenterEvents(); break;
        case 'homeworkDetail': app.innerHTML = renderHomeworkDetail(); bindHomeworkDetailEvents(); break;
        case 'report': app.innerHTML = renderReportPage(); bindReportEvents(); break;
        case 'agreement': app.innerHTML = renderAgreementPage(); break;
        case 'privacy': app.innerHTML = renderPrivacyPage(); break;
        case 'minorPrivacy': app.innerHTML = renderMinorPrivacyPage(); break;
        case 'verifSubAgreement': app.innerHTML = renderVerifSubAgreementPage(); break;
        case 'enterpriseAgreement': app.innerHTML = renderEnterpriseAgreementPage(); break;
        case 'redeemCode': app.innerHTML = renderRedeemCode(); bindRedeemCodeEvents(); break;
      }

      const fl = document.getElementById('fixed-layer');
      if (fl) {
        const fab = document.getElementById('fabCreateBtn');
        if (fab) { fab.style.pointerEvents = 'auto'; fl.appendChild(fab); }
        document.querySelectorAll('.comment-input-bar, .chat-input-bar').forEach(el => {
          el.style.pointerEvents = 'auto';
          fl.appendChild(el);
        });
      }

      updateScreenWatermark();

      if (_lastRenderedPage !== currentPage) {
        triggerPageEnterAnim();
        _lastRenderedPage = currentPage;
      }
      if (currentPage === 'home') {
        showAppSkeleton();
      } else {
        hideAppSkeleton();
      }
    }

    function hideAppSkeleton() {
      const sk = document.getElementById('app-skeleton');
      if (sk) sk.style.display = 'none';
    }
    function showAppSkeleton() {
      const sk = document.getElementById('app-skeleton');
      if (sk) sk.style.display = '';
    }
    function waitImagesLoaded(container, timeout) {
      return new Promise(function(resolve) {
        var done = false;
        var finish = function() { if (!done) { done = true; resolve(); } };
        var realSrc = function(img) {
          return !!(img.getAttribute('src') && img.getAttribute('src').indexOf('data:') !== 0);
        };
        var checkAll = function() {
          if (!container) { finish(); return; }
          var all = container.querySelectorAll('img');
          for (var i = 0; i < all.length; i++) {
            if (realSrc(all[i]) && !all[i].complete) { wait(); return; }
          }
          finish();
        };
        var wait = function() {
          clearTimeout(pollT);
          pollT = setTimeout(checkAll, 150);
        };
        var pollT = null;
        var bind = function() {
          var all = container ? container.querySelectorAll('img') : [];
          for (var i = 0; i < all.length; i++) {
            if (!realSrc(all[i]) || all[i].__skBound) continue;
            all[i].__skBound = true;
            all[i].addEventListener('load', checkAll);
            all[i].addEventListener('error', checkAll);
          }
        };
        bind();
        checkAll();
        setTimeout(finish, timeout || 8000);
      });
    }

    let _lastRenderedPage = null;
    const PAGE_ANIM_SLIDE = new Set([
      'postDetail','topicDetail','userProfile','chat','confessionDetail','homeworkDetail',
      'violationDetail','report','feedback','editProfile','securitySettings','search',
      'strangerList','followListPage','fansListPage','notificationLikes','notificationFollows',
      'notificationComments','safetyCenter','rulesCenter','createPost','agreement','privacy','minorPrivacy'
    ]);
    function triggerPageEnterAnim() {
      const app = document.getElementById('app');
      if (!app) return;
      app.classList.remove('page-enter','page-enter-soft');

      void app.offsetWidth;
      if (PAGE_ANIM_SLIDE.has(currentPage)) {
        app.classList.add('page-enter');
      } else {
        app.classList.add('page-enter-soft');
      }
    }

    let homeFeedTab = 'recommend';

    function goSearchGuard() {
      if (!getToken()) { showLoginModal(); return; }
      goPage('search');
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
      const totalBadge = unreadTotalCount > 0 ? `<span class="tabbar-badge" style="position:absolute;top:-2px;right:-6px;min-width:18px;height:18px;line-height:18px;border-radius:9px;padding:0 5px;background:#ff2442;color:#fff;font-size:10px;font-weight:600;display:flex;align-items:center;justify-content:center;box-sizing:border-box;">${unreadTotalCount > 99 ? '99+' : unreadTotalCount}</span>` : '';
      if (window.matchMedia && window.matchMedia('(min-width: 1024px)').matches) {
        return `<div class="tabbar sidebar-nav">
          <div class="sidebar-brand"><span class="sidebar-brand-dot"></span>赞话</div>
          <div class="tab-item ${currentPage==='home'?'active':''}" onclick="goPage('home')"><div class="tab-icon">${icons.home}</div><div>首页</div></div>
          <div class="tab-item ${currentPage==='discover'?'active':''}" onclick="goPage('discover')"><div class="tab-icon">${icons.discover}</div><div>发现</div></div>
          <div class="tab-item ${currentPage==='message'?'active':''}" onclick="goPage('message')" style="position:relative;"><div class="tab-icon" style="position:relative;">${icons.message}${totalBadge}</div><div>消息</div></div>
          <div class="tab-item ${currentPage==='profile'?'active':''}" onclick="goPage('profile')"><div class="tab-icon">${icons.profile}</div><div>我的</div></div>
          <div class="sidebar-create" onclick="goCreatePostGuard()"><i class="fa-solid fa-plus"></i> 发布</div>
        </div>`;
      }
      return `<div class="tabbar">
        <div class="tab-item ${currentPage==='home'?'active':''}" onclick="goPage('home')"><div class="tab-icon">${icons.home}</div><div>首页</div></div>
        <div class="tab-item ${currentPage==='discover'?'active':''}" onclick="goPage('discover')"><div class="tab-icon">${icons.discover}</div><div>发现</div></div>
        <div class="tab-item ${currentPage==='message'?'active':''}" onclick="goPage('message')" style="position:relative;"><div class="tab-icon" style="position:relative;">${icons.message}${totalBadge}</div><div>消息</div></div>
        <div class="tab-item ${currentPage==='profile'?'active':''}" onclick="goPage('profile')"><div class="tab-icon">${icons.profile}</div><div>我的</div></div>
      </div>`;
    }

    const TABBAR_PAGES = ['home', 'discover', 'message', 'profile'];
    function setTabbarVisible(visible, withAnim) {
      const container = document.getElementById('tabbar-container');
      if (!container) return;
      if (visible) {
        container.style.display = 'block';

        void container.offsetHeight;
        container.classList.remove('tabbar-hidden');
      } else {
        container.classList.add('tabbar-hidden');

        clearTimeout(container._hideTimer);
        container._hideTimer = setTimeout(() => {
          if (container.classList.contains('tabbar-hidden')) {
            container.style.display = 'none';
          }
        }, 260);
      }
    }
    function updateTabbar() {
      const container = document.getElementById('tabbar-container');
      if (!container) return;
      const isDesktopNav = window.matchMedia && window.matchMedia('(min-width: 1024px)').matches;
      if (TABBAR_PAGES.includes(currentPage) || isDesktopNav) {
        container.innerHTML = renderTabbar();
        setTabbarVisible(true);
      } else {
        container.innerHTML = '';
        setTabbarVisible(false);
      }
    }
    if (window.matchMedia) {
      const _bp = window.matchMedia('(min-width: 1024px)');
      const _bpChange = () => updateTabbar();
      if (_bp.addEventListener) _bp.addEventListener('change', _bpChange);
      else if (_bp.addListener) _bp.addListener(_bpChange);
    }

    function renderPostCard(p) {
      const imgs = p.images ? p.images.split(',').filter(x => x) : [];
      const hasVideo = p.video && p.video.length > 0;
      const hasMedia = imgs.length > 0 || hasVideo;
      const imgClass = imgs.length === 1 ? 'single' : '';
      const liked = p.liked || false;
      const collected = p.collected || false;
      const contentHtml = formatContentWithTopics(p.content || '');
      const isMine = p.user_id && getUid() && p.user_id === getUid();
      const isProtected = p.watermark_protected == 1 && !isMine;
      const cardClass = hasMedia ? 'card card-media' : 'card card-text-only';
      const cardId = 'pc-' + p.id;
      let contentBlock = '';
      if (isProtected) {
        contentBlock = `<div class="post-content" style="display:flex;align-items:center;gap:8px;color:#999;font-size:14px;"><i class="fa-solid fa-lock" style="color:#f59e0b;"></i>该帖子受保护，请点击进入详情页查看</div>`;
      } else if (p.content) {
        contentBlock = `<div id="${cardId}-wrap" class="post-content-wrap">
          <div id="${cardId}-content" class="post-content post-content-collapsed">${contentHtml}</div>
          <div id="${cardId}-btn" class="post-expand-btn" onclick="event.stopPropagation();togglePostExpand('${cardId}')"><span><i class="fa-solid fa-angles-down" style="margin-right:3px;"></i>展开全文</span></div>
        </div>`;
      }
      return `<div class="${cardClass}" onclick="goPostDetail('${p.id}')">
        <div class="post-header">
          <img class="avatar" src="${resolveMediaUrl(p.avatar)||DEFAULT_AVATAR}" onclick="event.stopPropagation();goUserProfile('${p.user_id}')" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">
          <div class="post-user">
            <div class="post-nickname">${p.nickname || '用户'+p.user_id}${renderListVerification(p)}</div>
            <div class="post-time">${timeAgo(p.create_time)} · ${p.province || '未知'}</div>
          </div>
          ${isMine ? `<div onclick="event.stopPropagation();showPostActionSheet('${p.id}')" style="cursor:pointer;padding:4px 8px;margin-left:auto;"><i class="fa-solid fa-ellipsis" style="color:#999;font-size:16px;"></i></div>` : ''}
        </div>
        ${p.title ? `<div style="padding:0 16px 6px;font-size:16px;font-weight:600;">${escapeHtml(p.title)}</div>` : ''}
        ${contentBlock}
        ${isProtected ? '' : `${imgs.length ? `<div class="post-images ${imgClass}">${imgs.map(i=>`<img src="${resolveMediaUrl(i)}" onclick="event.stopPropagation();showFullImage('${i}')">`).join('')}</div>` : ''}`}
        ${isProtected ? '' : `${hasVideo ? `<div class="post-images single">
          <div onclick="event.stopPropagation();openVideoPlayer('${p.video}', '${p.video_cover || ''}', ${p.allow_download != 0 ? 'true' : 'false'})" style="position:relative;cursor:pointer;width:75%;aspect-ratio:1;border-radius:8px;overflow:hidden;">
            ${p.video_cover ? `<img src="${resolveMediaUrl(p.video_cover)}" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">` : ''}
            <div style="display:${p.video_cover ? 'none' : 'flex'};position:absolute;inset:0;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);align-items:center;justify-content:center;">
              <div style="text-align:center;">
                <i class="fa-solid fa-video" style="font-size:32px;color:rgba(255,255,255,0.9);"></i>
                <div style="color:rgba(255,255,255,0.8);font-size:11px;margin-top:4px;">点击播放</div>
              </div>
            </div>
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:40px;height:40px;background:rgba(0,0,0,0.5);border-radius:50%;display:flex;align-items:center;justify-content:center;pointer-events:none;">
              <i class="fa-solid fa-play" style="color:#fff;font-size:16px;margin-left:2px;"></i>
            </div>
          </div>
        </div>` : ''}`}
        <div class="post-actions" onclick="event.stopPropagation()">
          <div class="action-item" onclick="likePost('${p.id}',this)"><i class="${liked ? 'fa-solid fa-heart' : 'fa-regular fa-heart'}" style="color:${liked ? 'var(--color-red)' : ''}"></i><span>${p.likes||0}</span></div>
          <div class="action-item" onclick="goPostDetailAndScroll('${p.id}')"><i class="fa-regular fa-comment"></i><span>${p.comments||0}</span></div>
          <div class="action-item" onclick="collectPost('${p.id}',this)"><i class="${collected ? 'fa-solid fa-star' : 'fa-regular fa-star'}" style="color:${collected ? 'var(--color-yellow)' : ''}"></i><span>${p.collects||0}</span></div>
        </div>
      </div>`;
    }
    function togglePostExpand(cardId) {
      const contentEl = document.getElementById(cardId + '-content');
      const btnEl = document.getElementById(cardId + '-btn');
      if (!contentEl || !btnEl) return;
      const collapsed = contentEl.classList.contains('post-content-collapsed');
      if (collapsed) {
        
        if (contentEl.dataset.fullHtml) {
          contentEl.innerHTML = contentEl.dataset.fullHtml;
        }
        contentEl.classList.remove('post-content-collapsed');
        btnEl.innerHTML = `<span><i class="fa-solid fa-angles-up" style="margin-right:3px;"></i>收起</span>`;
      } else {
        contentEl.classList.add('post-content-collapsed');
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
      testEl.classList.remove('post-content-collapsed');
      testEl.style.visibility = 'hidden';
      testEl.style.position = 'absolute';
      testEl.style.left = '-99999px';
      testEl.style.width = contentEl.offsetWidth + 'px';
      testEl.style.padding = getComputedStyle(contentEl).padding;
      testEl.style.fontSize = '15px';
      testEl.style.lineHeight = '1.6';
      document.body.appendChild(testEl);
      const lineH = getContentLineHeight(contentEl);
      const needsTruncation = testEl.scrollHeight > lineH * 3 + 2;
      document.body.removeChild(testEl);
      if (!needsTruncation) return;

      
      
      const fullHtml = contentEl.dataset.fullHtml;
      
      contentEl.classList.remove('post-content-collapsed');
      const rawText = contentEl.textContent || '';
      contentEl.classList.add('post-content-collapsed');
      if (rawText.length < 20) return;

      
      const probe = contentEl.cloneNode(true);
      probe.classList.remove('post-content-collapsed');
      probe.style.position = 'absolute';
      probe.style.visibility = 'hidden';
      probe.style.left = '-99999px';
      probe.style.width = (contentEl.offsetWidth) + 'px';
      probe.style.paddingLeft = getComputedStyle(contentEl).paddingLeft;
      probe.style.paddingRight = getComputedStyle(contentEl).paddingRight;
      probe.style.paddingTop = '0';
      probe.style.paddingBottom = '0';
      probe.style.fontSize = '15px';
      probe.style.lineHeight = '1.6';
      probe.style.wordBreak = 'break-word';
      document.body.appendChild(probe);

      const MAX_H = lineH * 3 + 2;
      let lo = 0, hi = rawText.length, best = 0;
      for (let iter = 0; iter < 22 && lo <= hi; iter++) {
        const mid = (lo + hi) >> 1;
        probe.textContent = rawText.slice(0, mid) + '…';
        if (probe.scrollHeight <= MAX_H) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      document.body.removeChild(probe);

      if (best > 5) {
        
        contentEl.classList.remove('post-content-collapsed');
        contentEl.textContent = rawText.slice(0, best) + '…';
        contentEl.classList.add('post-content-collapsed');
      } else {
        
        contentEl.innerHTML = fullHtml;
      }
    }

    function refreshCardExpandButtons() {
      const buttons = document.querySelectorAll('.post-expand-btn');
      buttons.forEach(btn => {
        const wrap = btn.closest('.post-content-wrap');
        if (!wrap) return;
        const content = wrap.querySelector('.post-content');
        if (!content) return;
        const collapsed = content.classList.contains('post-content-collapsed');
        if (!collapsed) { btn.classList.add('visible'); return; }
        
        if (!content.dataset.fullHtml) {
          content.dataset.fullHtml = content.innerHTML;
        }
        
        content.classList.remove('post-content-collapsed');
        const naturalH = content.scrollHeight;
        const padBottom = parseFloat(getComputedStyle(content).paddingBottom) || 0;
        content.classList.add('post-content-collapsed');
        const lineH = getContentLineHeight(content);
        const overflow = (naturalH - padBottom) > (lineH * 3 + 2);
        
        if (overflow || btn.classList.contains('visible')) {
          btn.classList.add('visible');
          ensureCollapsedContentTruncated(content);
        } else {
          btn.classList.remove('visible');
        }
      });
    }

    function renderConfessionCard(c) {
      const imgs = c.images ? c.images.split(',').filter(x => x) : [];
      const imgClass = imgs.length === 1 ? 'single' : '';
      const showUser = !c.is_anonymous && c.user_id;
      const avatar = showUser ? (resolveMediaUrl(c.avatar) || DEFAULT_AVATAR) : DEFAULT_AVATAR;
      const nickname = showUser ? (c.nickname || '用户'+c.user_id) : '匿名用户';
      return `<div class="card" onclick="goConfessionDetail(${c.id})" style="margin:0 8px 8px;">
        <div class="post-header">
          <img class="avatar" src="${avatar}" onclick="event.stopPropagation();${showUser ? `goUserProfile('${c.user_id}')` : ''}" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">
          <div class="post-user">
            <div class="post-nickname">${nickname}${showUser ? renderListVerification(c) : ''}</div>
            <div class="post-time">${timeAgo(c.create_time)}</div>
          </div>
        </div>
        <div class="post-content">${formatContentWithTopics(c.content||'')}</div>
        ${imgs.length ? `<div class="post-images ${imgClass}" style="padding:0 16px 8px;">${imgs.map(i=>`<img src="${resolveMediaUrl(i)}" onclick="event.stopPropagation();showFullImage('${i}')">`).join('')}</div>` : ''}
        <div class="post-actions" onclick="event.stopPropagation()">
          <div class="action-item" onclick="likeConfession(${c.id},this)"><i class="${c.liked ? 'fa-solid fa-heart' : 'fa-regular fa-heart'}" style="color:${c.liked ? 'var(--color-red)' : ''}"></i><span>${c.likes||0}</span></div>
          <div class="action-item" onclick="goConfessionDetail(${c.id})"><i class="fa-regular fa-comment"></i><span>${c.comment_count||0}</span></div>
        </div>
      </div>`;
    }

    function goConfessionDetail(id) {
      pageHistory.push(currentPage);
      prevPage = currentPage;
      currentPage = 'confessionDetail';
      setTabbarVisible(false);
      try { history.pushState({ page: 'confessionDetail' }, '', '#confessionDetail'); } catch(e) {}
      api('/confessionDetail?id=' + id).then(r => {
        if (r.code === 1) {
          currentConfessionDetail = r.data;
          try {
            window.scrollTo(0, 0);
            render();
            updateTabbar();
          } catch (renderErr) {
            console.error('render confessionDetail error:', renderErr);
            pageHistory.pop();
            currentPage = prevPage;
            showToast('加载失败，请稍后重试');
          }
        } else {
          showToast(r.msg || '加载失败');
        }
      });
    }

    function renderNotificationLikes() {
      if (!getToken()) {
        showLoginModal();
        return `<div class="page">
          <div class="navbar" style="position:fixed;top:0;left:0;right:0;z-index:100;background:#fff;">
            <div onclick="goBack()" style="font-size:22px;cursor:pointer;color:#333;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div>
            <h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">收到的赞和收藏</h1>
            <div style="width:28px;"></div>
          </div>
          <div style="padding-top:calc(50px + env(safe-area-inset-top));"></div>
          <div class="empty" style="text-align:center;padding:40px;">请先登录</div>
        </div>`;
      }
      return `<div class="page">
        <div class="navbar" style="position:fixed;top:0;left:0;right:0;z-index:100;background:#fff;">
          <div onclick="goBack()" style="font-size:22px;cursor:pointer;color:#333;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div>
          <h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">收到的赞和收藏</h1>
          <div style="width:28px;"></div>
        </div>
        <div style="padding-top:calc(50px + env(safe-area-inset-top));"></div>
        <div id="notificationLikesList" style="background:#fff;"></div>
        <div style="height:20px;"></div>
      </div>`;
    }

    async function bindNotificationLikesEvents() {
      try {
        const res = await api('/notifications?type=like');
        const list = document.getElementById('notificationLikesList');
        if (!res.data || res.data.length === 0) {
          list.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#999;">暂无赞和收藏</div>';
          return;
        }
        list.innerHTML = res.data.map(n => {
          const typeText = n.type === 'like' ? '赞了你的帖子' : '收藏了你的帖子';
          const icon = n.type === 'like' ? 'fa-heart' : 'fa-star';
          return `<div class="notify-item" style="display:flex;padding:12px 16px;border-bottom:0.5px solid #f0f0f0;">
            <img src="${resolveMediaUrl(n.avatar) || DEFAULT_AVATAR}" onclick="goUserProfile('${n.from_user}')" style="width:44px;height:44px;border-radius:50%;flex-shrink:0;cursor:pointer;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">
            <div style="flex:1;margin-left:12px;overflow:hidden;">
              <div style="display:flex;align-items:center;gap:4px;">
                <span style="font-weight:600;font-size:15px;">${n.nickname || '用户'+n.from_user}</span>
                <span style="font-size:13px;color:#999;">${typeText}</span>
              </div>
              <div style="font-size:12px;color:#999;margin-top:2px;">${timeAgo(n.create_time)}</div>
            </div>
            ${n.post_id ? `<div onclick="goPostDetail('${n.post_id}')" style="width:64px;height:64px;border-radius:8px;overflow:hidden;flex-shrink:0;cursor:pointer;background:#f5f5f5;">
              <img src="${resolveMediaUrl(n.post_cover || DEFAULT_AVATAR)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='';this.style.backgroundColor='#f5f5f5';this.onerror=null">
            </div>` : ''}
          </div>`;
        }).join('');
        api('/readNotify', 'POST');
      } catch (e) {
        document.getElementById('notificationLikesList').innerHTML = '<div style="text-align:center;padding:40px;color:#999;">加载失败</div>';
      }
    }

    function renderNotificationFollows() {
      if (!getToken()) {
        showLoginModal();
        return `<div class="page">
          <div class="navbar" style="position:fixed;top:0;left:0;right:0;z-index:100;background:#fff;">
            <div onclick="goBack()" style="font-size:22px;cursor:pointer;color:#333;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div>
            <h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">新增关注</h1>
            <div style="width:28px;"></div>
          </div>
          <div style="padding-top:calc(50px + env(safe-area-inset-top));"></div>
          <div class="empty" style="text-align:center;padding:40px;">请先登录</div>
        </div>`;
      }
      return `<div class="page">
        <div class="navbar" style="position:fixed;top:0;left:0;right:0;z-index:100;background:#fff;">
          <div onclick="goBack()" style="font-size:22px;cursor:pointer;color:#333;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div>
          <h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">新增关注</h1>
          <div style="width:28px;"></div>
        </div>
        <div style="padding-top:calc(50px + env(safe-area-inset-top));"></div>
        <div id="notificationFollowsList" style="background:#fff;"></div>
        <div style="height:20px;"></div>
      </div>`;
    }

    async function bindNotificationFollowsEvents() {
      try {
        const res = await api('/notifications?type=follow');
        const list = document.getElementById('notificationFollowsList');
        if (!res.data || res.data.length === 0) {
          list.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#999;">暂无新增关注</div>';
          return;
        }
        list.innerHTML = res.data.map(n => {
          const isFollowed = n.followed || false;
          const followStatus = n.follow_status || 'approved';
          let btnHtml = '';
          if (followStatus === 'pending') {
            btnHtml = `<button onclick="approveFollowRequest('${n.from_user}', this)" data-uid="${n.from_user}" style="padding:6px 16px;border:none;background:var(--color-primary);color:#fff;border-radius:20px;font-size:13px;font-weight:500;cursor:pointer;">通过</button>`;
          } else if (isFollowed) {
            btnHtml = `<button data-uid="${n.from_user}" style="padding:6px 16px;border:1px solid #ddd;color:#999;border-radius:20px;font-size:13px;font-weight:500;cursor:pointer;background:#f5f5f5;">已关注</button>`;
          } else {
            btnHtml = `<button onclick="followUser('${n.from_user}', this)" data-uid="${n.from_user}" style="padding:6px 16px;border:1px solid var(--color-primary);color:var(--color-primary);border-radius:20px;font-size:13px;font-weight:500;cursor:pointer;background:#fff;">回关</button>`;
          }
          return `<div class="notify-item" style="display:flex;align-items:center;padding:12px 16px;border-bottom:0.5px solid #f0f0f0;">
            <img src="${resolveMediaUrl(n.avatar) || DEFAULT_AVATAR}" onclick="goUserProfile('${n.from_user}')" style="width:44px;height:44px;border-radius:50%;flex-shrink:0;cursor:pointer;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">
            <div style="flex:1;margin-left:12px;overflow:hidden;">
              <div style="font-weight:600;font-size:15px;">${n.nickname || '用户'+n.from_user}</div>
              <div style="font-size:13px;color:#999;margin-top:2px;">开始关注你了 · ${timeAgo(n.create_time)}</div>
            </div>
            ${btnHtml}
          </div>`;
        }).join('');
        api('/readNotify', 'POST');
      } catch (e) {
        document.getElementById('notificationFollowsList').innerHTML = '<div style="text-align:center;padding:40px;color:#999;">加载失败</div>';
      }
    }

    async function approveFollowRequest(applicantId, btn) {
      if (!getToken()) { showLoginModal(); return; }
      try {
        const r = await api('/approveFollow', 'POST', { applicantId });
        if (r.code === 1) {
          btn.textContent = '回关';
          btn.style.background = '#fff';
          btn.style.color = 'var(--color-primary)';
          btn.style.border = '1px solid var(--color-primary)';
          btn.setAttribute('onclick', `followUser('${applicantId}', this)`);
          showToast('已通过');
        } else {
          showToast(r.msg || '操作失败');
        }
      } catch (e) {
        showToast('操作失败');
      }
    }

    function renderNotificationComments() {
      if (!getToken()) {
        showLoginModal();
        return `<div class="page">
          <div class="navbar" style="position:fixed;top:0;left:0;right:0;z-index:100;background:#fff;">
            <div onclick="goBack()" style="font-size:22px;cursor:pointer;color:#333;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div>
            <h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">收到的评论和@</h1>
            <div style="width:28px;"></div>
          </div>
          <div style="padding-top:calc(50px + env(safe-area-inset-top));"></div>
          <div class="empty" style="text-align:center;padding:40px;">请先登录</div>
        </div>`;
      }
      return `<div class="page">
        <div class="navbar" style="position:fixed;top:0;left:0;right:0;z-index:100;background:#fff;">
          <div onclick="goBack()" style="font-size:22px;cursor:pointer;color:#333;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div>
          <h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">收到的评论和@</h1>
          <div style="width:28px;"></div>
        </div>
        <div style="padding-top:calc(50px + env(safe-area-inset-top));"></div>
        <div id="notificationCommentsList" style="background:#fff;"></div>
        <div style="height:20px;"></div>
      </div>`;
    }

    async function bindNotificationCommentsEvents() {
      try {
        const res = await api('/notifications?type=comment');
        const list = document.getElementById('notificationCommentsList');
        if (!res.data || res.data.length === 0) {
          list.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#999;">暂无评论和@</div>';
          return;
        }
        list.innerHTML = res.data.map(n => {
          const actionText = n.type === 'mention' ? '在评论中@了你' : '评论了你的帖子';
          return `<div class="notify-item" style="display:flex;padding:12px 16px;border-bottom:0.5px solid #f0f0f0;">
            <img src="${resolveMediaUrl(n.avatar) || DEFAULT_AVATAR}" onclick="goUserProfile('${n.from_user}')" style="width:44px;height:44px;border-radius:50%;flex-shrink:0;cursor:pointer;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">
            <div style="flex:1;margin-left:12px;overflow:hidden;">
              <div style="display:flex;align-items:center;gap:4px;">
                <span style="font-weight:600;font-size:15px;">${n.nickname || '用户'+n.from_user}</span>
                <span style="font-size:13px;color:#999;">${actionText}</span>
              </div>
              <div style="font-size:12px;color:#999;margin-top:2px;">${timeAgo(n.create_time)}</div>
              ${n.content ? `<div style="font-size:14px;color:#333;margin-top:4px;">${formatPostContent(n.content)}</div>` : ''}
              <div style="display:flex;gap:16px;margin-top:8px;">
                <span class="notify-action" onclick="goPostDetail('${n.post_id}');goCommentScroll()">回复</span>
              </div>
            </div>
            ${n.post_id ? `<div onclick="goPostDetail('${n.post_id}')" style="width:64px;height:64px;border-radius:8px;overflow:hidden;flex-shrink:0;cursor:pointer;background:#f5f5f5;">
              <img src="${resolveMediaUrl(n.post_cover || DEFAULT_AVATAR)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='';this.style.backgroundColor='#f5f5f5';this.onerror=null">
            </div>` : ''}
          </div>`;
        }).join('');
        api('/readNotify', 'POST');
      } catch (e) {
        document.getElementById('notificationCommentsList').innerHTML = '<div style="text-align:center;padding:40px;color:#999;">加载失败</div>';
      }
    }

    function goCommentScroll() {
      scrollToCommentFlag = true;
    }

    function followUser(followId, btn) {
      if (!getToken()) { showLoginModal(); return; }
      api('/follow', 'POST', { followId }).then(r => {
        if (r.code === 1) {
          const followed = r.data.followed;
          const pending = r.data.pending;
          if (followed && pending) {
            btn.textContent = '申请中';
            btn.style.backgroundColor = '#f5f5f5';
            btn.style.color = '#999';
            btn.style.borderColor = '#ddd';
          } else if (followed) {
            btn.textContent = '已关注';
            btn.style.backgroundColor = '#f5f5f5';
            btn.style.color = '#999';
            btn.style.borderColor = '#ddd';
          } else {
            btn.textContent = '回关';
            btn.style.backgroundColor = '#fff';
            btn.style.color = 'var(--color-primary)';
            btn.style.borderColor = 'var(--color-primary)';
          }
        } else {
          showToast(r.msg || '操作失败');
        }
      }).catch(() => {
        showToast('操作失败');
      });
    }

    function renderConfessionDetail() {
      if (!currentConfessionDetail) return '<div style="padding:40px;text-align:center;">表白不存在或已删除</div>';
      const c = currentConfessionDetail;
      const imgs = c.images ? c.images.split(',').filter(x => x) : [];
      const imgClass = imgs.length === 1 ? 'single' : '';
      const liked = c.liked || false;
      const showUser = !c.is_anonymous && c.user_id;
      const avatar = showUser ? (resolveMediaUrl(c.avatar) || DEFAULT_AVATAR) : DEFAULT_AVATAR;
      const nickname = showUser ? (c.nickname || '用户'+c.user_id) : '匿名用户';
      const isMine = c.user_id && c.user_id === getUid();
      const isAdmin = currentNickname === '管理员';
      const canChat = c.user_id && c.user_id !== getUid();
      return `<div class="post-detail" style="background:#fff;min-height:100vh;">
        <div class="navbar" style="position:fixed;top:0;z-index:100;background:#fff;border-bottom:0.5px solid #eee;"><div onclick="goBack()" style="font-size:22px;cursor:pointer;color:#333;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div><h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">详情</h1>${isMine || isAdmin ? '<div onclick="showConfessionManageMenu(' + c.id + ')" style="font-size:20px;cursor:pointer;color:#333;padding:0 4px;"><i class="fa-solid fa-ellipsis"></i></div>' : '<div onclick="goReport(\'confession\',' + c.id + ')" style="font-size:18px;cursor:pointer;padding:0 4px;"><i class="fa-solid fa-triangle-exclamation"></i></div>'}</div>
        <div style="padding-top:50px;">
          <div class="post-header" style="padding:12px 16px;">
            <img class="avatar" src="${avatar}" onclick="${showUser ? `goUserProfile('${c.user_id}')` : ''}" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">
            <div class="post-user">
              <div class="post-nickname">${nickname}${c.is_anonymous ? '<span style="margin-left:6px;padding:2px 6px;background:#f0f0f0;color:#999;border-radius:10px;font-size:11px;">匿名</span>' : ''}${showUser ? renderListVerification(c) : ''}</div>
              <div class="post-time">${timeAgo(c.create_time)}</div>
            </div>
            ${canChat ? `<button onclick="goChat('${c.user_id}', ${c.is_anonymous ? 'true' : 'false'}, ${c.id})" style="padding:6px 16px;background:var(--color-primary);color:#fff;border:none;border-radius:20px;font-size:13px;font-weight:500;">${c.is_anonymous ? '匿名私信' : '发私信'}</button>` : ''}
          </div>
          <div class="post-content">${formatContentWithTopics(c.content||'')}</div>
          ${imgs.length ? `<div class="post-images ${imgClass}">${imgs.map(i=>`<img src="${resolveMediaUrl(i)}" onclick="showFullImage('${i}')">`).join('')}</div>` : ''}
          <div class="post-actions" style="border-bottom:1px solid #eee;border-top:1px solid #eee;margin:0 16px;">
            <div class="action-item" onclick="likeConfession(${c.id},this)"><i class="${liked ? 'fa-solid fa-heart' : 'fa-regular fa-heart'}" style="color:${liked ? 'var(--color-red)' : ''}"></i><span>${c.likes||0}</span></div>
            <div class="action-item" id="confessionCommentScrollTarget"><i class="fa-regular fa-comment"></i><span>${c.comment_count||0}</span></div>
          </div>
          <div id="confessionCommentList" style="padding:16px;"></div>
          <div style="height:60px;"></div>
        </div>
        <div class="comment-input-bar">
          <img class="comment-input-avatar" src="${resolveMediaUrl(myAvatar) || DEFAULT_AVATAR}" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">
          <input class="comment-input" id="confessionCommentInput" placeholder="说点什么...">
          <span id="confessionCommentCharCount" class="comment-char-count"></span>
          <div class="comment-send" id="confessionCommentSendBtn" onclick="sendConfessionComment()">发送</div>
        </div>
      </div>`;
    }

    async function bindConfessionDetailEvents() {
      if (!currentConfessionDetail) return;
      const ci = document.getElementById('confessionCommentInput');
      if (ci) {
        ci.addEventListener('input', updateConfessionCharCount);
        ci.addEventListener('focus', ensureCommentInputVisible);
        ci.addEventListener('blur', () => { setTimeout(ensureCommentInputVisible, 100); });
      }
      await loadConfessionComments(currentConfessionDetail.id);
    }

    function updateConfessionCharCount() {
      const input = document.getElementById('confessionCommentInput');
      if (!input) return;
      const count = input.value.length;
      const remaining = 150 - count;
      const el = document.getElementById('confessionCommentCharCount');
      if (!el) return;
      if (remaining <= 20) {
        el.textContent = remaining;
        el.style.color = remaining < 0 ? 'var(--color-red)' : '#999';
      } else {
        el.textContent = '';
        el.style.color = '#999';
      }
    }

    function setConfessionReply(seq) {
      confessionReplyTargetSeq = seq;
      const ci = document.getElementById('confessionCommentInput');
      if (ci) {
        ci.focus();
        ci.placeholder = '回复中...';
      }
    }

    
    

    async function loadConfessionComments(confessionId) {
      const res = await api('/confessionCommentList?confessionId=' + confessionId);
      const list = document.getElementById('confessionCommentList');
      if (!list) return;
      if (!res.data || res.data.length === 0) {
        list.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#999;">还没有评论，快来抢沙发吧</div>';
        return;
      }
      const myUid = getUid();
      const seqMap = {};
      res.data.forEach(c => { seqMap[c.post_seq] = c; });
      const renderComment = (c, repliesHtml, parentName) => {
        const content = formatCommentContent(c.content);
        const nameHtml = parentName
          ? `<span class="c-name">${c.nickname}</span><span class="reply-arrow"></span><span class="reply-parent-name">${parentName}</span>`
          : `<span class="c-name">${c.nickname}</span>`;
        const isMine = c.user_id === myUid || currentNickname === '管理员';
        return `<div class="comment-item" data-ccomment-id="${c.id}" data-cis-mine="${isMine}">
            <img class="c-avatar" src="${resolveMediaUrl(c.avatar)||DEFAULT_AVATAR}" onclick="goUserProfile('${c.user_id}')" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">
            <div class="c-body">
              <div class="c-header">
                ${nameHtml}
                ${c.post_seq === 1 ? '<span class="comment-tag-first">首评</span>' : ''}
              </div>
              <div class="c-content collapsed" id="ccc-${c.id}">${content}</div>
              <div class="c-meta">
                <div class="c-meta-left">
                  <span class="c-time">${timeAgo(c.create_time)}</span>
                  ${c.province ? `<span>${c.province}</span>` : ''}
                  <span class="c-action" onclick="setConfessionReply(${c.post_seq})">回复</span>
                </div>
                <span class="c-like" onclick="likeConfessionComment(${c.id},this)">
                  <i class="${c.liked ? 'fa-solid fa-heart' : 'fa-regular fa-heart'}" style="color:${c.liked ? 'var(--color-red)' : ''}"></i>
                  <span>${c.likes||0}</span>
                </span>
              </div>
              ${repliesHtml || ''}
            </div>
          </div>`;
      };
      const collectAllDescendants = (parentSeq) => {
        const direct = res.data.filter(c => c.parent_seq == parentSeq);
        let all = [];
        for (const c of direct) {
          all.push(c);
          all = all.concat(collectAllDescendants(c.post_seq));
        }
        return all;
      };
      const buildTree = (parentSeq) => {
        return res.data.filter(c => c.parent_seq == parentSeq).map(c => {
          const allDescendants = collectAllDescendants(c.post_seq);
          const repliesHtml = allDescendants.length > 0
            ? `<div class="comment-replies">${allDescendants.map(d => {
                const parent = seqMap[d.parent_seq];
                const parentName = parent ? parent.nickname : '';
                return renderComment(d, '', parentName);
              }).join('')}</div>`
            : '';
          return renderComment(c, repliesHtml, '');
        });
      };
      let html = buildTree(0).join('');
      if (!html.trim()) {
        list.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#999;">还没有评论，快来抢沙发吧</div>';
      } else {
        list.innerHTML = html;
        list.querySelectorAll('.c-content.collapsed').forEach(el => {
          
          const overflow = checkCommentOverflow(el);
          if (overflow) {
            const id = el.id.replace('ccc-', '');
            const btn = document.createElement('span');
            btn.className = 'c-expand';
            btn.setAttribute('data-cexpand-id', id);
            btn.innerHTML = '展开<span class="c-expand-arrow"></span>';
            btn.onclick = () => toggleConfessionCommentExpand(id);
            el.insertAdjacentElement('afterend', btn);
            
            ensureCommentContentTruncated(el);
          } else {
            el.classList.remove('collapsed');
          }
        });
        bindConfessionCommentLongPress();
      }
    }

    function bindConfessionCommentLongPress() {
      const items = document.querySelectorAll('.comment-item[data-ccomment-id]');
      items.forEach(item => {
        let timer = null;
        const start = (e) => {
          timer = setTimeout(() => {
            showConfessionCommentMenu(item.dataset.ccommentId, item.dataset.cisMine === 'true');
          }, 500);
        };
        const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
        const move = () => { if (timer) { clearTimeout(timer); timer = null; } };
        item.addEventListener('touchstart', start, { passive: true });
        item.addEventListener('touchend', cancel);
        item.addEventListener('touchmove', move, { passive: true });
        item.addEventListener('mousedown', start);
        item.addEventListener('mouseup', cancel);
        item.addEventListener('mouseleave', cancel);
        item.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          showConfessionCommentMenu(item.dataset.ccommentId, item.dataset.cisMine === 'true');
        });
      });
    }

    function showConfessionCommentMenu(commentId, isMine) {
      const existing = document.getElementById('confessionCommentMenuOverlay');
      if (existing) existing.remove();
      const overlay = document.createElement('div');
      overlay.id = 'confessionCommentMenuOverlay';
      overlay.className = 'modal-overlay active';
      overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
      if (isMine) {
        overlay.innerHTML = `<div class="modal-content" style="max-height:40vh;">
          <div class="modal-handler"></div>
          <div class="modal-item" style="border-bottom:none;color:var(--color-red);text-align:center;" onclick="deleteConfessionComment(${commentId})">
            <span class="label" style="justify-content:center;width:100%;"><i class="fa-solid fa-trash-can"></i> 删除评论</span>
          </div>
        </div>`;
      } else {
        overlay.innerHTML = `<div class="modal-content" style="max-height:40vh;">
          <div class="modal-handler"></div>
          <div class="modal-item" style="border-bottom:none;color:var(--color-primary);text-align:center;" onclick="document.getElementById('confessionCommentMenuOverlay').remove();goReport('confession_comment',${commentId})">
            <span class="label" style="justify-content:center;width:100%;"><i class="fa-solid fa-triangle-exclamation"></i> 举报评论</span>
          </div>
        </div>`;
      }
      document.body.appendChild(overlay);
    }

    async function deleteConfessionComment(commentId) {
      try {
        const res = await api('/deleteConfessionComment', 'POST', { commentId });
        if (res.code === 1) {
          showToast('已删除');
          document.getElementById('confessionCommentMenuOverlay')?.remove();
          if (currentConfessionDetail) {
            currentConfessionDetail.comment_count = Math.max(0, (currentConfessionDetail.comment_count || 0) - 1);
            await loadConfessionComments(currentConfessionDetail.id);
          }
        } else {
          showToast(res.msg || '删除失败');
        }
      } catch (e) {
        showToast('删除失败');
      }
    }

    async function likeConfessionComment(id, el) {
      if (!getToken()) {
        showLoginModal();
        return;
      }
      const res = await api('/likeConfessionComment', 'POST', { commentId: id });
      if (res.code === 1) {
        const liked = res.data.liked;
        const icon = el.querySelector('i');
        const span = el.querySelector('span');
        icon.className = liked ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
        icon.style.color = liked ? 'var(--color-red)' : '';
        span.textContent = parseInt(span.textContent) + (liked ? 1 : -1);
      }
    }

    async function sendConfessionComment() {
      const content = document.getElementById('confessionCommentInput').value.trim();
      if (!content) return;
      if (content.length > 150) {
        showToast('评论不能超过150字');
        return;
      }
      if (!getToken()) {
        showLoginModal();
        return;
      }
      document.getElementById('confessionCommentInput').value = '';
      document.getElementById('confessionCommentInput').placeholder = '说点什么...';
      updateConfessionCharCount();
      confessionReplyTargetSeq = 0;
      const sendBtn = document.getElementById('confessionCommentSendBtn');
      if (sendBtn) {
        sendBtn.style.pointerEvents = 'none';
        sendBtn.style.opacity = '0.5';
        setTimeout(() => {
          sendBtn.style.pointerEvents = '';
          sendBtn.style.opacity = '';
        }, 1000);
      }
      const res = await api('/confessionComment', 'POST', { confessionId: currentConfessionDetail.id, content, parentSeq: confessionReplyTargetSeq });
      if (res.code === 1) {
        await loadConfessionComments(currentConfessionDetail.id);
        if (currentConfessionDetail) {
          currentConfessionDetail.comment_count = (currentConfessionDetail.comment_count || 0) + 1;
        }
      } else {
        if (res.msg && res.msg.indexOf('涉嫌') !== -1) {
          showViolationBubble('已违规');
        } else {
          showToast(res.msg || '评论失败');
        }
      }
    }

    function showConfessionManageMenu(id) {
      const existing = document.getElementById('confessionManageOverlay');
      if (existing) existing.remove();
      const overlay = document.createElement('div');
      overlay.id = 'confessionManageOverlay';
      overlay.className = 'modal-overlay active';
      overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
      overlay.innerHTML = `<div class="modal-content" style="max-height:40vh;">
        <div class="modal-handler"></div>
        <div class="modal-item" style="border-bottom:none;color:var(--color-red);text-align:center;" onclick="confirmDeleteConfession(${id})">
          <span class="label" style="justify-content:center;width:100%;"><i class="fa-solid fa-trash-can"></i> 删除表白</span>
        </div>
      </div>`;
      document.body.appendChild(overlay);
    }

    function confirmDeleteConfession(id) {
      const existing = document.getElementById('confirmDeleteConfessionOverlay');
      if (existing) existing.remove();
      const overlay = document.createElement('div');
      overlay.id = 'confirmDeleteConfessionOverlay';
      overlay.className = 'modal-overlay active';
      overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
      overlay.innerHTML = `<div class="modal-content" style="max-height:35vh;">
        <div class="modal-handler"></div>
        <div style="font-weight:600;font-size:16px;margin-bottom:16px;text-align:center;">确认删除这条表白？</div>
        <div style="display:flex;gap:10px;">
          <button onclick="document.getElementById('confirmDeleteConfessionOverlay').remove()" style="flex:1;height:44px;background:#f5f5f5;border-radius:12px;font-weight:500;">取消</button>
          <button onclick="doDeleteConfession(${id})" style="flex:1;height:44px;background:var(--color-red);color:#fff;border-radius:12px;font-weight:500;">删除</button>
        </div>
      </div>`;
      document.body.appendChild(overlay);
    }

    async function doDeleteConfession(id) {
      try {
        const res = await api('/deleteConfession', 'POST', { id });
        if (res.code === 1) {
          showToast('已删除');
          document.getElementById('confirmDeleteConfessionOverlay')?.remove();
          document.getElementById('confessionManageOverlay')?.remove();
          goBack();
        } else {
          showToast(res.msg || '删除失败');
        }
      } catch(e) {
        showToast('删除失败');
      }
    }

    function renderHome() {
      return `<div class="page">
        <div class="home-top-bar" style="position:sticky;top:0;z-index:100;background:#fff;">
          <div class="home-tabs" style="display:flex;position:relative;align-items:center;justify-content:center;padding:10px 20px 8px;gap:24px;">
            <div class="home-tab ${homeFeedTab==='recommend'?'active':''}" data-tab="recommend" style="position:relative;padding:8px 0;font-size:18px;font-weight:${homeFeedTab==='recommend'?'700':'400'};color:${homeFeedTab==='recommend'?'#333':'#999'};cursor:pointer;">
              推荐
              ${homeFeedTab==='recommend'?'<div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:20px;height:3px;background:var(--color-primary);border-radius:2px;"></div>':''}
            </div>
            <div class="home-tab ${homeFeedTab==='follow'?'active':''}" data-tab="follow" style="position:relative;padding:8px 0;font-size:18px;font-weight:${homeFeedTab==='follow'?'700':'400'};color:${homeFeedTab==='follow'?'#333':'#999'};cursor:pointer;">
              关注
              ${homeFeedTab==='follow'?'<div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:20px;height:3px;background:var(--color-primary);border-radius:2px;"></div>':''}
            </div>
          </div>
          <div style="height:0.5px;background:#e5e5e5;"></div>
          <div class="home-search-bar" onclick="goSearchGuard()" style="margin:10px 16px;height:36px;background:#f5f5f5;border-radius:18px;display:flex;align-items:center;padding:0 14px;gap:8px;color:#999;font-size:14px;cursor:pointer;">
            <i class="fa-solid fa-magnifying-glass" style="font-size:13px;"></i>
            <span>搜索感兴趣的内容</span>
          </div>
          <div style="height:0.5px;background:#e5e5e5;"></div>
        </div>
        <div id="postList"></div>
        <div id="loadMore" style="display:none;padding:16px 16px 24px;"><div class="sk-item" style="height:14px;margin-bottom:8px;"></div><div class="sk-item" style="height:14px;margin-bottom:8px;"></div><div class="sk-item" style="height:14px;width:60%;"></div></div>
        <div id="noMoreTip" style="display:none;text-align:center;padding:20px;color:#ccc;font-size:13px;">— 没有更多了 —</div>
        <div id="fabCreateBtn" class="fab" onclick="goCreatePostGuard()" style="position:fixed;bottom:calc(80px + env(safe-area-inset-bottom));right:16px;width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg, #099536, #0BB84D);color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;z-index:101;box-shadow:0 4px 10px rgba(0,0,0,0.2);pointer-events:auto;"><i class="fa-solid fa-plus"></i></div>
      </div>`;
    }

    function bindHomeEvents() {
      document.querySelectorAll('.home-tab').forEach(tab => {
        tab.onclick = () => {
          if (tab.dataset.tab === 'follow' && !getToken()) {
            showLoginModal();
            return;
          }
          homeFeedTab = tab.dataset.tab;
          render();
        };
      });
      loadPosts(true);
      window.onscroll = () => {
        if (currentPage !== 'home') return;
        if (noMorePosts || loading) return;
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 200) loadPosts();
      };
    }

    async function loadPosts(refresh = false) {
      if (loading) return;
      if (refresh) {
        postPage = 1;
        posts = [];
        noMorePosts = false;
        const noMoreEl = document.getElementById('noMoreTip');
        if (noMoreEl) noMoreEl.style.display = 'none';
      }
      if (noMorePosts) return;
      loading = true;
      const loadMoreEl = document.getElementById('loadMore');
      if (loadMoreEl) loadMoreEl.style.display = 'block';
      const feed = homeFeedTab || 'recommend';
      try {
        const res = await api(`/postList?page=${postPage}&size=10&feed=${feed}`);
        if (loadMoreEl) loadMoreEl.style.display = 'none';
        if (res.code === 0 && res.msg === '未登录') {
          showLoginModal();
          loading = false;
          hideAppSkeleton();
          return;
        }
        if (res.code === 1) {
          const list = res.data || [];
          posts = refresh ? list : [...posts, ...list];
          document.getElementById('postList').innerHTML = posts.length ? posts.map(renderPostCard).join('') : '<div class="empty"><i class="fa-solid fa-pen-to-square"></i><p>暂无动态</p></div>';
          setTimeout(refreshCardExpandButtons, 0);
          if (res.limited) {
            noMorePosts = true;
            const noMoreEl = document.getElementById('noMoreTip');
            if (noMoreEl && posts.length > 0) {
              if (getToken()) {
                noMoreEl.innerHTML = '— 没有更多了 —';
              } else {
                noMoreEl.innerHTML = '<i class="fa-solid fa-lock"></i> 登录查看更多内容';
              }
              noMoreEl.style.display = 'block';
            }
          } else if (list.length < 10) {
            noMorePosts = true;
            const noMoreEl = document.getElementById('noMoreTip');
            if (noMoreEl && posts.length > 0) {
              noMoreEl.innerHTML = '— 没有更多了 —';
              noMoreEl.style.display = 'block';
            }
          } else {
            postPage++;
          }
        }
      } catch (e) {
        if (loadMoreEl) loadMoreEl.style.display = 'none';
      }
      loading = false;
      waitImagesLoaded(document.getElementById('app'), 8000).then(function() {
        hideAppSkeleton();
      });
    }

    async function likePost(id, el) {
      if (!getToken()) {
        showLoginModal();
        return;
      }
      event.stopPropagation();
      try {
        const res = await api('/likePost', 'POST', { postId: id });
        if (res.code === 1) {
          const liked = res.data.liked;
          const icon = el.querySelector('i');
          const span = el.querySelector('span');
          icon.className = liked ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
          icon.style.color = liked ? 'var(--color-red)' : '';
          span.textContent = parseInt(span.textContent) + (liked ? 1 : -1);
          if (typeof posts !== 'undefined' && posts.length) {
            const p = posts.find(x => x.id === id);
            if (p) {
              p.liked = liked;
              p.likes = parseInt(span.textContent);
            }
          }
          if (typeof currentPost !== 'undefined' && currentPost && currentPost.id === id) {
            currentPost.liked = liked;
            currentPost.likes = parseInt(span.textContent);
          }
        }
      } catch (e) {
        showToast('操作失败');
      }
    }

    async function collectPost(id, el) {
      if (!getToken()) {
        showLoginModal();
        return;
      }
      event.stopPropagation();
      try {
        const res = await api('/collectPost', 'POST', { postId: id });
        if (res.code === 1) {
          const collected = res.data.collected;
          const icon = el.querySelector('i');
          const span = el.querySelector('span');
          icon.className = collected ? 'fa-solid fa-star' : 'fa-regular fa-star';
          icon.style.color = collected ? 'var(--color-yellow)' : '';
          span.textContent = parseInt(span.textContent) + (collected ? 1 : -1);
          if (typeof posts !== 'undefined' && posts.length) {
            const p = posts.find(x => x.id === id);
            if (p) {
              p.collected = collected;
              p.collects = parseInt(span.textContent);
            }
          }
          if (typeof currentPost !== 'undefined' && currentPost && currentPost.id === id) {
            currentPost.collected = collected;
            currentPost.collects = parseInt(span.textContent);
          }
        }
      } catch (e) {
        showToast('操作失败');
      }
    }

    function openConfessionModal() {
      if (!getToken()) {
        showLoginModal();
        return;
      }
      const modal = document.getElementById('confessionModal');
      if (modal) modal.classList.add('active');
    }

    function toggleConfessionWarning() {
      const checkbox = document.getElementById('confessionAnonymous');
      const warning = document.getElementById('confessionWarning');
      if (warning) {
        warning.style.display = checkbox?.checked ? 'block' : 'none';
      }
    }

    function closeConfessionModal() {
      const modal = document.getElementById('confessionModal');
      if (modal) modal.classList.remove('active');
      const content = document.getElementById('confessionContent');
      if (content) content.value = '';
      const anon = document.getElementById('confessionAnonymous');
      if (anon) anon.checked = false;
      toggleConfessionWarning();
    }

    async function submitConfession() {
      const content = document.getElementById('confessionContent')?.value.trim();
      if (!content) {
        showToast('请输入内容');
        return;
      }
      const is_anonymous = document.getElementById('confessionAnonymous')?.checked ? 1 : 0;
      try {
        const res = await api('/confession', 'POST', { content, is_anonymous });
        if (res.code === 1) {
          showToast('发布成功');
          closeConfessionModal();
          loadDiscoverContent('confession');
        } else {
          if (res.msg && res.msg.indexOf('涉嫌') !== -1) {
            showViolationBubble('已违规');
          } else {
            showToast(res.msg || '发布失败');
          }
        }
      } catch (e) {
        showToast('网络异常');
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
      const avatarImg = document.getElementById('hwModalAvatar');
      if (avatarImg) avatarImg.src = resolveMediaUrl(myAvatar) || DEFAULT_AVATAR;
      const modal = document.getElementById('homeworkModal');
      if (modal) modal.classList.add('active');
      homeworkImages = [];
      isHomeworkUploading = false;
      isHomeworkPublishing = false;
      renderHomeworkImgPreview();
      resetHwPublishBtn();
    }

    function closeHomeworkModal() {
      const modal = document.getElementById('homeworkModal');
      if (modal) modal.classList.remove('active');
      const content = document.getElementById('homeworkContent');
      if (content) content.value = '';
      homeworkImages = [];
      isHomeworkUploading = false;
      isHomeworkPublishing = false;
      renderHomeworkImgPreview();
      resetHwPublishBtn();
    }

    function resetHwPublishBtn() {
      isHomeworkPublishing = false;
      const btn = document.getElementById('hwPublishBtn');
      if (btn) {
        btn.textContent = '发布';
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
      }
    }

    async function handleHomeworkImgUpload(files) {
      const fileArr = Array.from(files || []);
      if (fileArr.length === 0) return;
      if (isHomeworkUploading) { showToast('正在上传，请稍候'); return; }
      if (homeworkImages.length + fileArr.length > 15) {
        showToast('最多上传15张图片');
        return;
      }
      const imgFiles = fileArr.filter(f => f.type.startsWith('image/'));
      if (imgFiles.length !== fileArr.length) showToast('只能上传图片');
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
        const fd = new FormData();
        processedFiles.forEach(f => fd.append('images', f));
        const xhrRef = {};
        const res = await apiForm('/uploadImage', fd, (loaded, total) => {
          const pct = Math.round((loaded / total) * 100);
          document.querySelectorAll('#homeworkImgPreview .create-media-item .progress-ring').forEach(el => {
            el.style.background = `conic-gradient(#fff 0% ${pct}%, rgba(255,255,255,0.2) ${pct}%)`;
          });
        }, 120000, xhrRef);
        if (res && res.code === 1 && res.data && res.data.urls) {
          const urls = res.data.urls;
          processedFiles.forEach((f, i) => {
            if (urls[i]) f._uploadedUrl = urls[i];
          });
        } else {
          processedFiles.forEach(f => { f._uploadFailed = true; });
          showToast(res?.msg || '上传失败');
        }
      } catch (e) {
        processedFiles.forEach(f => { f._uploadFailed = true; });
        showToast('图片上传失败，点击重试');
      } finally {
        isHomeworkUploading = false;
        renderHomeworkImgPreview();
      }
    }

    function renderHomeworkImgPreview() {
      const preview = document.getElementById('homeworkImgPreview');
      const addBtn = document.getElementById('homeworkImgAddBtn');
      if (!preview) return;
      let html = '';
      homeworkImages.forEach((f, idx) => {
        const thumbUrl = f._previewUrl || '';
        const isUploading = isHomeworkUploading && !f._uploadFailed && !f._uploadedUrl;
        if (f._uploadFailed) {
          html += `<div class="create-media-item" style="position:relative;">
            ${thumbUrl ? `<img src="${thumbUrl}" style="opacity:0.4;">` : `<div style="width:100%;height:100%;background:#f0f0f0;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-image" style="font-size:24px;color:#999;"></i></div>`}
            <div onclick="event.stopPropagation();retryHomeworkUpload(${idx})" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:4px;z-index:2;cursor:pointer;">
              <div style="width:36px;height:36px;background:rgba(0,0,0,0.6);border-radius:50%;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-rotate-right" style="color:#fff;font-size:16px;"></i></div>
              <span style="color:#fff;font-size:10px;text-shadow:0 1px 2px rgba(0,0,0,0.5);">重试</span>
            </div>
            <div class="del" onclick="event.stopPropagation();removeHomeworkImg(${idx})"><i class="fa-solid fa-xmark"></i></div>
          </div>`;
        } else {
          html += `<div class="create-media-item" style="position:relative;">
            ${thumbUrl ? `<img src="${thumbUrl}">` : `<div style="width:100%;height:100%;background:#f0f0f0;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-image" style="font-size:24px;color:#999;"></i></div>`}
            ${isUploading ? `<div class="upload-overlay"><div class="progress-ring"></div></div>` : ''}
            <div class="del" onclick="event.stopPropagation();removeHomeworkImg(${idx})"><i class="fa-solid fa-xmark"></i></div>
          </div>`;
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
        const fd = new FormData();
        fd.append('images', f);
        const res = await apiForm('/uploadImage', fd, (loaded, total) => {
          const pct = Math.round((loaded / total) * 100);
          const items = document.querySelectorAll('#homeworkImgPreview .create-media-item');
          if (items[idx]) {
            const ring = items[idx].querySelector('.progress-ring');
            if (ring) ring.style.background = `conic-gradient(#fff 0% ${pct}%, rgba(255,255,255,0.2) ${pct}%)`;
          }
        }, 120000);
        if (res && res.code === 1 && res.data && res.data.urls && res.data.urls[0]) {
          f._uploadedUrl = res.data.urls[0];
        } else {
          f._uploadFailed = true;
          showToast(res?.msg || '重试失败');
        }
      } catch (e) {
        f._uploadFailed = true;
        showToast('重试失败');
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
      if (!getToken()) { showLoginModal(); return; }
      if (isHomeworkUploading) { showToast('图片正在上传中，请稍候'); return; }
      const hasFailed = homeworkImages.some(f => f._uploadFailed);
      if (hasFailed) { showToast('有图片上传失败，请重试或删除'); return; }
      const content = document.getElementById('homeworkContent')?.value.trim();
      const subjectEl = document.querySelector('.hw-subject-select.active');
      const subject = subjectEl?.dataset.subject || '其它';
      if (!content && homeworkImages.length === 0) {
        showToast('请输入内容或上传图片');
        return;
      }
      const imageUrls = homeworkImages.map(f => f._uploadedUrl).filter(x => x);
      isHomeworkPublishing = true;
      const btn = document.getElementById('hwPublishBtn');
      if (btn) {
        btn.textContent = '发布中...';
        btn.style.opacity = '0.6';
        btn.style.pointerEvents = 'none';
      }
      try {
        const res = await api('/homeworkCreate', 'POST', { content: content || '', subject, images: imageUrls });
        if (res.code === 1) {
          showToast('发布成功');
          closeHomeworkModal();
          loadHomeworkList(subject);
        } else {
          if (res.msg && res.msg.indexOf('涉嫌') !== -1) {
            showViolationBubble('已违规');
          } else {
            showToast(res.msg || '发布失败');
          }
        }
      } catch (e) {
        showToast('网络异常');
      } finally {
        resetHwPublishBtn();
      }
    }

    async function loadHomeworkList(subject) {
      const listEl = document.getElementById('homeworkList');
      if (!listEl) return;
      listEl.innerHTML = '<div class="loading" style="text-align:center;padding:20px;">加载中...</div>';
      try {
        const apiSubject = subject === '全部' ? 'all' : subject;
        const res = await api(`/homeworkList?subject=${encodeURIComponent(apiSubject)}&page=1&size=20`);
        if (res.code === 0 && res.msg === '未登录') {
          listEl.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#999;"><i class="fa-solid fa-lock" style="font-size:32px;margin-bottom:12px;display:block;"></i>登录后查看作业</div>';
          return;
        }
        if (res.code === 1) {
          const list = res.data || [];
          if (list.length === 0) {
            listEl.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#999;">暂无作业，来上传第一个吧</div>';
          } else {
            listEl.innerHTML = list.map(item => {
              const imgs = item.images ? item.images.split(',').filter(x => x).map(img => img.includes('/') ? img : '/uploads/homework/' + img) : [];
              const imgClass = imgs.length === 1 ? 'single' : '';
              let imagesHtml = '';
              if (imgs.length > 0) {
                if (imgs.length <= 9) {
                  imagesHtml = `<div class="post-images ${imgClass}">${imgs.map(i=>`<img src="${resolveMediaUrl(i)}" onclick="event.stopPropagation();showFullImage('${i}')">`).join('')}</div>`;
                } else {
                  const first8 = imgs.slice(0, 8);
                  const rest = imgs.slice(8);
                  const restCount = imgs.length - 8;
                  imagesHtml = `<div class="post-images">
                    ${first8.map(i=>`<img src="${resolveMediaUrl(i)}" onclick="event.stopPropagation();showFullImage('${i}')">`).join('')}
                    <div onclick="event.stopPropagation();showFullImage('${rest[0]}')" style="position:relative;aspect-ratio:1;border-radius:8px;overflow:hidden;cursor:pointer;border:0.5px solid rgba(0,0,0,0.08);box-sizing:border-box;">
                      <div style="display:grid;grid-template-columns:repeat(3,1fr);width:100%;height:100%;">
                        ${rest.slice(0,9).map(i=>`<img src="${resolveMediaUrl(i)}" style="width:100%;height:100%;aspect-ratio:1;object-fit:cover;border:none;">`).join('')}
                      </div>
                      <div style="position:absolute;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;">
                        <span style="color:#fff;font-size:22px;font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,0.5);">+${restCount}</span>
                      </div>
                    </div>
                  </div>`;
                }
              }
              return `
                <div class="card" onclick="goHomeworkDetail(${item.id})">
                  <div class="post-header">
                    <img class="avatar" src="${resolveMediaUrl(item.avatar) || DEFAULT_AVATAR}" onclick="event.stopPropagation();goUserProfile('${item.user_id}')" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">
                    <div class="post-user" onclick="event.stopPropagation();goUserProfile('${item.user_id}')" style="cursor:pointer;">
                      <div class="post-nickname">${escapeHtml(item.nickname || '用户')}${renderListVerification(item)}</div>
                      <div class="post-time">${timeAgo(item.create_time)} · ${item.province || '未知'}</div>
                    </div>
                  </div>
                  <div style="padding:0 16px 6px;">
                    <span style="display:inline-block;padding:2px 10px;background:var(--color-primary-light);color:var(--color-primary);border-radius:10px;font-size:12px;font-weight:500;">${escapeHtml(item.subject || '其它')}</span>
                  </div>
                  ${item.content ? `<div class="post-content">${escapeHtml(item.content).replace(/@\[\d+\]([^\s\[\]<]{1,30})/g, '@$1')}</div>` : ''}
                  ${imagesHtml}
                  <div class="post-actions" onclick="event.stopPropagation()">
                    <div class="action-item"><i class="fa-regular fa-eye"></i><span>${item.views || 0}</span></div>
                    <div class="action-item"><i class="fa-regular fa-comment"></i><span>${item.comments || 0}</span></div>
                    <div class="action-item"><i class="fa-regular fa-heart"></i><span>${item.likes || 0}</span></div>
                  </div>
                </div>
              `;
            }).join('');
          }
        }
      } catch (e) {
        listEl.innerHTML = '<div class="network-error">网络异常</div>';
      }
    }

    function goHomeworkDetail(id) {
      if (!getToken()) { showLoginModal(); return; }
      pageHistory.push(currentPage);
      prevPage = currentPage;
      currentPage = 'homeworkDetail';
      homeworkDetailId = id;
      setTabbarVisible(false);
      try { history.pushState({ page: 'homeworkDetail' }, '', '#homeworkDetail'); } catch(e) {}
      render();
      updateTabbar();
    }

    let homeworkDetail = null;
    let homeworkComments = [];
    let homeworkReplyTargetSeq = 0;

    function renderHomeworkDetail() {
      return `<div class="post-detail" style="background:#fff;min-height:100vh;">
        <div class="detail-navbar">
          <div class="detail-navbar-back" onclick="goBack()"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div>
          <div class="detail-navbar-title">作业详情</div>
          <div style="display:flex;gap:12px;"><div id="hwDeleteBtn" style="display:none;width:32px;text-align:center;cursor:pointer;"><i class="fa-solid fa-trash"></i></div><div id="hwReportBtn" style="width:32px;text-align:center;cursor:pointer;"><i class="fa-solid fa-triangle-exclamation"></i></div></div>
        </div>
        <div id="homeworkDetailContent" style="padding-top:calc(50px + env(safe-area-inset-top));min-height:50vh;"><div class="loading" style="text-align:center;padding:60px;">加载中...</div></div>
        <div class="comment-input-bar">
          <img class="comment-input-avatar" src="${resolveMediaUrl(myAvatar) || DEFAULT_AVATAR}" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">
          <input class="comment-input" id="hwCommentInput" placeholder="说点什么...">
          <div class="comment-send" onclick="sendHomeworkComment()">发送</div>
        </div>
      </div>`;
    }

    async function bindHomeworkDetailEvents() {
      homeworkReplyTargetSeq = 0;
      const replyInput = document.getElementById('hwCommentInput');
      if (replyInput) {
        replyInput.placeholder = '说点什么...';
        replyInput.addEventListener('focus', ensureCommentInputVisible);
        replyInput.addEventListener('blur', () => { setTimeout(ensureCommentInputVisible, 100); });
      }
      const res = await api(`/homeworkDetail?id=${homeworkDetailId}`);
      const content = document.getElementById('homeworkDetailContent');
      if (res.code !== 1 || !res.data) {
        content.innerHTML = '<div class="network-error">加载失败</div>';
        return;
      }
      homeworkDetail = res.data;
      const isMine = homeworkDetail.user_id == getUid() || currentNickname === '管理员';
      const reportBtn = document.getElementById('hwReportBtn');
      if (reportBtn) {
        if (isMine) {
          reportBtn.style.display = 'none';
        } else {
          reportBtn.style.display = 'block';
          reportBtn.onclick = () => goReport('homework', homeworkDetailId);
        }
      }
      const deleteBtn = document.getElementById('hwDeleteBtn');
      if (deleteBtn) {
        if (isMine) {
          deleteBtn.style.display = 'block';
          deleteBtn.onclick = () => deleteHomework(homeworkDetailId);
        } else {
          deleteBtn.style.display = 'none';
        }
      }
      const imgs = homeworkDetail.images ? homeworkDetail.images.split(',').filter(x => x).map(img => img.includes('/') ? img : '/uploads/homework/' + img) : [];
      const imgClass = imgs.length === 1 ? 'single' : '';
      content.innerHTML = `
        <div style="padding-top:0;">
          <div class="post-header">
            <img class="avatar" src="${resolveMediaUrl(homeworkDetail.avatar) || DEFAULT_AVATAR}" onclick="goUserProfile('${homeworkDetail.user_id}')" style="cursor:pointer;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">
            <div class="post-user" onclick="goUserProfile('${homeworkDetail.user_id}')" style="cursor:pointer;">
              <div class="post-nickname">${escapeHtml(homeworkDetail.nickname || '用户')}${renderListVerification(homeworkDetail)}</div>
              <div class="post-time">${timeAgo(homeworkDetail.create_time)} · ${homeworkDetail.province || '未知'}</div>
            </div>
          </div>
          <div style="padding:0 16px 8px;">
            <span style="display:inline-block;padding:2px 10px;background:var(--color-primary-light);color:var(--color-primary);border-radius:10px;font-size:12px;font-weight:500;">${escapeHtml(homeworkDetail.subject || '其它')}</span>
          </div>
          ${homeworkDetail.content ? `<div class="post-content">${formatContentWithTopics(homeworkDetail.content)}</div>` : ''}
          ${imgs.length ? `<div class="post-images ${imgClass}">${imgs.map(img => `<img src="${resolveMediaUrl(img)}" onclick="showFullImage('${img}')">`).join('')}</div>` : ''}
          <div class="post-actions" style="border-bottom:1px solid #eee;border-top:1px solid #eee;margin:0 16px;">
            <div class="action-item" onclick="toggleHomeworkLike(this)"><i class="${homeworkDetail.liked ? 'fa-solid fa-heart' : 'fa-regular fa-heart'}" style="color:${homeworkDetail.liked ? 'var(--color-red)' : ''}"></i><span>${homeworkDetail.likes || 0}</span></div>
            <div class="action-item" id="hwCommentScrollTarget"><i class="fa-regular fa-comment"></i><span>${homeworkDetail.comments || 0}</span></div>
            <div class="action-item" onclick="toggleHomeworkCollect(this)"><i class="${homeworkDetail.collected ? 'fa-solid fa-star' : 'fa-regular fa-star'}" style="color:${homeworkDetail.collected ? 'var(--color-yellow)' : ''}"></i><span>${homeworkDetail.collects || 0}</span></div>
          </div>
          <div id="homeworkCommentsList" style="padding:16px;"></div>
          <div style="height:60px;"></div>
        </div>
      `;
      loadHomeworkComments();
    }

    async function toggleHomeworkLike(el) {
      if (!getToken()) { showLoginModal(); return; }
      const res = await api('/likeHomework', 'POST', { id: homeworkDetailId });
      if (res.code === 1) {
        homeworkDetail.liked = res.data.liked;
        homeworkDetail.likes = (homeworkDetail.likes || 0) + (res.data.liked ? 1 : -1);
        if (el) {
          const icon = el.querySelector('i');
          const span = el.querySelector('span');
          if (icon) {
            icon.className = res.data.liked ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
            icon.style.color = res.data.liked ? 'var(--color-red)' : '';
          }
          if (span) span.textContent = homeworkDetail.likes;
        }
      }
    }

    async function toggleHomeworkCollect(el) {
      if (!getToken()) { showLoginModal(); return; }
      const res = await api('/collectHomework', 'POST', { id: homeworkDetailId });
      if (res.code === 1) {
        homeworkDetail.collected = res.data.collected;
        homeworkDetail.collects = (homeworkDetail.collects || 0) + (res.data.collected ? 1 : -1);
        if (el) {
          const icon = el.querySelector('i');
          const span = el.querySelector('span');
          if (icon) {
            icon.className = res.data.collected ? 'fa-solid fa-star' : 'fa-regular fa-star';
            icon.style.color = res.data.collected ? 'var(--color-yellow)' : '';
          }
          if (span) span.textContent = homeworkDetail.collects;
        }
      }
    }

    async function loadHomeworkComments() {
      const listEl = document.getElementById('homeworkCommentsList');
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
      homeworkComments.forEach(c => { seqMap[c.post_seq] = c; });
      const renderHwComment = (c, repliesHtml, parentName) => {
        const text = formatCommentContent(c.content);
        const nameHtml = parentName
          ? `<span class="c-name">${escapeHtml(c.nickname||'用户')}</span><span class="reply-arrow"></span><span class="reply-parent-name">${escapeHtml(parentName)}</span>`
          : `<span class="c-name">${escapeHtml(c.nickname||'用户')}</span>`;
        const isMine = c.user_id === myUid || currentNickname === '管理员';
        const avatar = resolveMediaUrl(c.avatar) || DEFAULT_AVATAR;
        return `<div class="comment-item" data-comment-id="${c.id}" data-is-mine="${isMine}">
            <img class="c-avatar" src="${avatar}" onclick="goUserProfile('${c.user_id}')" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">
            <div class="c-body">
              <div class="c-header">${nameHtml}${c.post_seq === 1 ? '<span class="comment-tag-first">首评</span>' : ''}</div>
              <div class="c-content">${text}</div>
              <div class="c-meta">
                <div class="c-meta-left">
                  <span class="c-time">${timeAgo(c.create_time)}</span>
                  ${c.province ? `<span>${escapeHtml(c.province)}</span>` : ''}
                  <span class="c-action" onclick="setHwReply(${c.post_seq})">回复</span>
                  ${isMine ? `<span class="c-action" onclick="deleteHomeworkComment(${c.id})" style="color:#ff2442;">删除</span>` : ''}
                </div>
                <span class="c-like" onclick="toggleHomeworkCommentLike(${c.id},this)">
                  <i class="${c.liked ? 'fa-solid fa-heart' : 'fa-regular fa-heart'}" style="color:${c.liked ? 'var(--color-red)' : ''}"></i>
                  <span>${c.likes||0}</span>
                </span>
              </div>
              ${repliesHtml || ''}
            </div>
          </div>`;
      };
      const collectAllDescendants = (parentSeq) => {
        const direct = homeworkComments.filter(c => c.parent_seq == parentSeq);
        let all = [];
        for (const c of direct) { all.push(c); all = all.concat(collectAllDescendants(c.post_seq)); }
        return all;
      };
      const buildTree = (parentSeq) => {
        return homeworkComments.filter(c => c.parent_seq == parentSeq).map(c => {
          const allDescendants = collectAllDescendants(c.post_seq);
          const repliesHtml = allDescendants.length > 0
            ? `<div class="comment-replies">${allDescendants.map(d => {
                const parent = seqMap[d.parent_seq];
                const parentName = parent ? parent.nickname : '';
                return renderHwComment(d, '', parentName);
              }).join('')}</div>`
            : '';
          return renderHwComment(c, repliesHtml, '');
        });
      };
      let html = buildTree(0).join('');
      if (!html.trim()) {
        listEl.innerHTML = '<div style="text-align:center;padding:30px 20px;color:#999;font-size:13px;">暂无评论</div>';
      } else {
        listEl.innerHTML = html;
      }
    }

    function setHwReply(seq) {
      homeworkReplyTargetSeq = seq;
      const input = document.getElementById('hwCommentInput');
      if (input) { input.focus(); input.placeholder = '回复中...'; }
    }

    async function toggleHomeworkCommentLike(commentId, el) {
      if (!getToken()) { showLoginModal(); return; }
      const res = await api('/likeHomeworkComment', 'POST', { commentId });
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
      if (!confirm('确定删除这条评论吗？')) return;
      try {
        const res = await api('/deleteHomeworkComment', 'POST', { commentId });
        if (res.code === 1) {
          showToast('已删除');
          homeworkDetail.comments = Math.max(0, (homeworkDetail.comments || 0) - 1);
          loadHomeworkComments();
        } else {
          showToast(res.msg || '删除失败');
        }
      } catch(e) { showToast('删除失败'); }
    }

    async function deleteHomework(id) {
      if (!confirm('确定删除这条作业吗？')) return;
      try {
        const res = await api('/deleteHomework', 'POST', { id });
        if (res.code === 1) {
          showToast('已删除');
          goBack();
        } else {
          showToast(res.msg || '删除失败');
        }
      } catch(e) { showToast('删除失败'); }
    }

    async function sendHomeworkComment() {
      const input = document.getElementById('hwCommentInput');
      const content = input?.value.trim();
      if (!content) { showToast('请输入内容'); return; }
      if (content.length > 150) { showToast('评论不能超过150字'); return; }
      if (!getToken()) { showLoginModal(); return; }
      const parentSeq = homeworkReplyTargetSeq;
      input.value = '';
      input.placeholder = '说点什么...';
      homeworkReplyTargetSeq = 0;
      try {
        const res = await api('/homeworkComment', 'POST', { homeworkId: homeworkDetailId, content, parentSeq });
        if (res.code === 1) {
          showToast('评论成功');
          homeworkDetail.comments = (homeworkDetail.comments || 0) + 1;
          loadHomeworkComments();
        } else {
          if (res.msg && res.msg.indexOf('涉嫌') !== -1) {
            showViolationBubble('已违规');
          } else {
            showToast(res.msg || '评论失败');
          }
        }
      } catch(e) { showToast('网络异常'); }
    }

    async function likeConfession(id, el) {
      if (!getToken()) {
        showLoginModal();
        return;
      }
      event.stopPropagation();
      try {
        const res = await api('/likeConfession', 'POST', { id });
        if (res.code === 1) {
          const liked = res.data.liked;
          const icon = el.querySelector('i');
          const span = el.querySelector('span');
          icon.className = liked ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
          icon.style.color = liked ? 'var(--color-red)' : '';
          span.textContent = parseInt(span.textContent) + (liked ? 1 : -1);
        }
      } catch (e) {
        showToast('操作失败');
      }
    }

    function goCreatePostGuard() {
      if (!getToken()) {
        showLoginModal();
        return;
      }
      goPage('createPost');
    }

    function clearLocation() {
      createLocation = '';
      document.getElementById('locationDisp').textContent = '添加地点';
      document.getElementById('locationDisp').style.color = '#999';
      const spans = document.querySelectorAll('#createLocList span');
      spans.forEach(span => {
        span.classList.remove('active');
        span.style.color = '#333';
        span.style.background = '#f5f5f5';
      });
      if(spans.length > 0) {
        spans[0].classList.add('active');
        spans[0].style.color = 'var(--color-primary)';
        spans[0].style.background = 'var(--color-primary-light)';
      }
    }

    function buildPollPreviewHtml() {
      const opts = (createPollData.options || []).filter(o => o.trim());
      if (opts.length === 0) return '';
      return `<div style="background:#f9f9f9;padding:12px;border-radius:8px;margin-top:12px;">
        <div style="font-weight:600;font-size:14px;color:#333;margin-bottom:6px;">投票预览</div>
        ${opts.map(opt => `<div class="poll-preview-item"><div class="icon"><i class="fa-solid fa-circle-check"></i></div><div class="text">${opt}</div></div>`).join('')}
      </div>`;
    }

    function renderCreatePost() {
      const iconVis = createVisibility === 'public' ? 'fa-solid fa-lock-open' : 'fa-solid fa-lock';
      let mediaGridHtml = '';
      selectedCreateImages.forEach((f, i) => {
        const isVideo = f._isVideo || ['mp4','mov','avi','mkv'].includes(f.name?.split('.')?.pop()?.toLowerCase());
        const thumbUrl = isVideo ? (f._uploadedCover || f._thumbnailUrl || '') : (f._previewUrl || '');
        const isUploading = isFileUploading && !f._uploadFailed && !f._uploadedUrl;
        const hasProgressCache = !f._uploadedUrl && !f._uploadFailed && uploadProgressCache.lastPct > 0;
        mediaGridHtml += `<div class="create-media-item" style="position:relative;">
          ${thumbUrl ? `<img src="${thumbUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">` : `<div style="width:100%;height:100%;background:${isVideo ? 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)' : '#f0f0f0'};border-radius:8px;display:flex;align-items:center;justify-content:center;"><i class="fa-solid ${isVideo ? 'fa-video' : 'fa-image'}" style="font-size:28px;color:${isVideo ? 'rgba(255,255,255,0.8)' : '#999'};"></i></div>`}
          ${isVideo ? `<div onclick="event.stopPropagation();playCreateVideo(${i})" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:36px;height:36px;background:rgba(0,0,0,0.5);border-radius:50%;display:flex;align-items:center;justify-content:center;z-index:2;cursor:pointer;"><i class="fa-solid fa-play" style="color:#fff;font-size:14px;margin-left:2px;"></i></div>` : ''}
          ${(isUploading || hasProgressCache) ? `<div class="progress-ring" style="position:absolute;inset:0;border-radius:8px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.3);z-index:3;">
            <div style="width:40px;height:40px;border-radius:50%;border:3px solid rgba(255,255,255,0.3);border-top-color:#fff;animation:spin 1s linear infinite;"></div>
          </div>` : ''}
          ${f._uploadFailed ? `<div onclick="event.stopPropagation();retryUploadFile(${i})" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:4px;z-index:2;cursor:pointer;">
            <div style="width:36px;height:36px;background:rgba(0,0,0,0.6);border-radius:50%;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-rotate-right" style="color:#fff;font-size:16px;"></i></div>
            <span style="color:#fff;font-size:10px;text-shadow:0 1px 2px rgba(0,0,0,0.5);">重试</span>
          </div>` : ''}
          <div class="del" onclick="event.stopPropagation();delCreateImage(${i})"><i class="fa-solid fa-xmark"></i></div>
        </div>`;
      });
      if(selectedCreateImages.length < 9) {
        mediaGridHtml += `<div class="create-media-item" onclick="document.getElementById('createImgInput').click()"><i class="fa-solid fa-plus"></i></div>`;
      }
      return `<div class="create-page">
        <div class="create-nav">
          <div onclick="goPage('home')" style="font-size:24px;color:#333;cursor:pointer;"><i class="fa-solid fa-xmark"></i></div>
          <div style="font-weight:600;font-size:16px;position:absolute;left:50%;transform:translateX(-50%);">发布帖子</div>
          <div class="btn-publish" onclick="submitCreatePost()">发布</div>
        </div>
        <div class="create-content" id="createContentWrap">
          <input class="create-title-input" id="createTitle" placeholder="添加标题" maxlength="30">
          <div style="position:relative;">
            <textarea class="create-body-input" id="createBody" placeholder="添加正文或发语音..."></textarea>
          </div>
          <div class="create-media-grid" id="createImageGrid">${mediaGridHtml}</div>
          <input type="file" id="createImgInput" accept="image/*,video/*,.jpg,.jpeg,.png,.gif,.webp,.bmp,.mp4,.mov,.avi,.mkv" multiple style="display:none" onchange="handleCreateImages(this.files); this.value=''">
          <div class="create-toolbar">
            <span onclick="insertSymbol('#')"><i class="fa-solid fa-hashtag"></i> 话题</span>
            <span onclick="openAtUserModal()"><i class="fa-solid fa-at"></i> 用户</span>
            <span onclick="openPollModal()"><i class="fa-solid fa-chart-simple"></i> 投票</span>
            <span style="margin-left:auto;color:#999;font-size:12px;" id="createCharCount">0</span>
          </div>
          <div id="pollPreviewWrap">${buildPollPreviewHtml()}</div>
          <div class="create-tags" id="createHotTags">
            <span style="color:#999;">加载中...</span>
          </div>
          <div class="create-setting-item" onclick="showLocationModal()">
            <div class="left"><i class="fa-solid fa-location-dot" style="color:#333;"></i> 标记地点</div>
            <div class="right" id="createLocationText"><span id="locationDisp">添加地点</span> <i class="fa-solid fa-chevron-right"></i></div>
          </div>
          <div class="create-locations" id="createLocList" onclick="selectQuickLocation(event)">
            <span class="active" style="background:var(--color-primary-light);color:var(--color-primary);">不标记地点</span>
          </div>
          <div class="create-setting-item" onclick="openVisibilityModal()">
            <div class="left"><i class="${iconVis}" style="color:#333;"></i> <span id="createVisibilityText">${createVisibility === 'public' ? '公开可见' : createVisibility === 'friends' ? '仅互关好友可见' : '仅自己可见'}</span></div>
            <div class="right"><i class="fa-solid fa-chevron-right"></i></div>
          </div>
          <div class="create-setting-item" onclick="openAdvancedModal()" style="border-bottom:none;margin-top:8px;">
            <div class="left"><i class="fa-solid fa-gear" style="color:#333;"></i> 高级选项</div>
            <div class="right"><i class="fa-solid fa-chevron-right"></i></div>
          </div>
        </div>
        <div class="topic-suggest-bar" id="topicSuggestBar">
          <div class="topic-suggest-header">
            <span>推荐话题</span>
            <span class="topic-suggest-close" onclick="hideTopicSuggest()"><i class="fa-solid fa-xmark"></i></span>
          </div>
          <div id="topicSuggestList"></div>
        </div>
        <div class="modal-overlay" id="advancedModal" onclick="if(event.target===this)closeAdvancedModal()">
          <div class="modal-content">
            <div class="modal-handler"></div>
            <div class="modal-item">
              <span class="label">原创声明</span>
              <label class="switch"><input type="checkbox" id="declarationSwitch" onchange="toggleDeclarationOptions()"><span class="slider"></span></label>
            </div>
            <div id="declarationOptions" style="display:none;">
              <div class="radio-list">
                <div class="radio-item" onclick="selectDeclaration('自行拍摄')"><span>内容为自行拍摄</span><div class="radio-icon"><i class="fa-regular fa-circle"></i></div></div>
                <div class="radio-item" onclick="selectDeclaration('转载')"><span>内容为转载</span><div class="radio-icon"><i class="fa-regular fa-circle"></i></div></div>
                <div class="radio-item" onclick="selectDeclaration('虚构演绎')"><span>含虚构演绎内容</span><div class="radio-icon"><i class="fa-regular fa-circle"></i></div></div>
                <div class="radio-item" onclick="selectDeclaration('AI合成')"><span>含 AI 合成内容</span><div class="radio-icon"><i class="fa-regular fa-circle"></i></div></div>
                <div class="radio-item" onclick="selectDeclaration('营销信息')"><span>内容含营销信息</span><div class="radio-icon"><i class="fa-regular fa-circle"></i></div></div>
                <div class="radio-item" onclick="selectDeclaration('仅供参考')"><span>个人观点，仅供参考</span><div class="radio-icon"><i class="fa-regular fa-circle"></i></div></div>
              </div>
            </div>
            <div class="modal-item">
              <span class="label"><i class="fa-regular fa-circle-down"></i> 允许下载帖子</span>
              <label class="switch"><input type="checkbox" id="createAllowDownload"><span class="slider"></span></label>
            </div>
            <div class="modal-item" onclick="openSchedulePicker()">
              <span class="label"><i class="fa-regular fa-clock"></i> 定时发布</span>
              <div class="right" style="display:flex;align-items:center;gap:6px;color:#999;font-size:13px;">
                <span id="scheduleTimeDisplay">未设置定时发布</span>
                <i class="fa-solid fa-chevron-right" style="font-size:12px;color:#ccc;"></i>
              </div>
              <input type="hidden" id="scheduleTimePicker">
            </div>
          </div>
        </div>
        <div class="modal-overlay" id="visibilityModal" onclick="if(event.target===this)closeVisibilityModal()">
          <div class="modal-content">
            <div class="modal-handler"></div>
            <div class="radio-item ${createVisibility==='public'?'active':''}" data-vis="public" onclick="selectVisibility('public')">
              <span><i class="fa-solid fa-lock-open"></i> 公开可见</span>
              <div class="radio-icon">${createVisibility==='public' ? '<i class="fa-solid fa-circle-check"></i>' : '<i class="fa-regular fa-circle"></i>'}</div>
            </div>
            <div class="radio-item ${createVisibility==='friends'?'active':''}" data-vis="friends" onclick="selectVisibility('friends')">
              <span><i class="fa-solid fa-user-group"></i> 仅互关好友可见</span>
              <div class="radio-icon">${createVisibility==='friends' ? '<i class="fa-solid fa-circle-check"></i>' : '<i class="fa-regular fa-circle"></i>'}</div>
            </div>
            <div class="radio-item ${createVisibility==='private'?'active':''}" data-vis="private" onclick="selectVisibility('private')">
              <span><i class="fa-solid fa-lock"></i> 仅自己可见</span>
              <div class="radio-icon">${createVisibility==='private' ? '<i class="fa-solid fa-circle-check"></i>' : '<i class="fa-regular fa-circle"></i>'}</div>
            </div>
            <div style="height:1px;background:#f0f0f0;margin:12px 0;"></div>
            <div class="modal-item" onclick="openUserSelectModal('visible')">
              <span class="label"><i class="fa-regular fa-user"></i> 只给谁看</span>
              <div class="right"><span style="color:#333;font-size:13px;">${createVisibleUsers.length > 0 ? createVisibleUsers.length+'人' : '选择'}</span> <i class="fa-solid fa-chevron-right"></i></div>
            </div>
            <div class="modal-item" style="border-bottom:none;" onclick="openUserSelectModal('blocked')">
              <span class="label"><i class="fa-solid fa-eye-slash"></i> 不给谁看</span>
              <div class="right"><span style="color:#333;font-size:13px;">${createBlockedUsers.length > 0 ? createBlockedUsers.length+'人' : '选择'}</span> <i class="fa-solid fa-chevron-right"></i></div>
            </div>
          </div>
        </div>
        <div class="dialog-modal" id="inputModal" onclick="if(event.target===this)document.getElementById('inputModal').classList.remove('active')">
          <div class="dialog-modal-content" style="width:90%;max-width:360px;">
            <div style="font-weight:600;font-size:16px;margin-bottom:16px;" id="inputModalTitle">输入内容</div>
            <input id="inputModalValue" style="width:100%;background:#f5f5f5;border:none;border-radius:8px;padding:12px;font-size:15px;box-sizing:border-box;" placeholder="请输入...">
            <div style="display:flex;gap:10px;margin-top:16px;">
              <button onclick="document.getElementById('inputModal').classList.remove('active')" style="flex:1;height:44px;background:#f5f5f5;border-radius:12px;font-weight:500;border:none;">取消</button>
              <button onclick="confirmInputModal()" style="flex:1;height:44px;background:var(--color-primary);color:#fff;border-radius:12px;font-weight:500;border:none;">确认</button>
            </div>
          </div>
        </div>
        <div class="modal-overlay" id="pollModal" onclick="if(event.target===this)closePollModal()">
          <div class="modal-content">
            <div class="modal-handler"></div>
            <div style="font-weight:600;font-size:16px;margin-bottom:16px;">创建投票</div>
            <div id="pollOptionsList"></div>
            <div onclick="addPollOption()" style="color:var(--color-primary);font-weight:500;cursor:pointer;padding:8px 0;display:inline-block;"><i class="fa-solid fa-plus"></i> 添加选项</div>
            <button onclick="closePollModal()" style="width:100%;height:48px;background:var(--color-primary);color:#fff;border-radius:12px;font-weight:600;margin-top:12px;">完成</button>
          </div>
        </div>
        <div class="modal-overlay" id="userSelectModal" onclick="if(event.target===this)closeUserSelectModal()">
          <div class="modal-content">
            <div class="modal-handler"></div>
            <div style="font-weight:600;font-size:16px;margin-bottom:12px;" id="userSelectTitle">选择用户</div>
            <div style="position:relative;margin-bottom:12px;">
              <input id="userSelectSearch" style="width:100%;background:#f5f5f5;border:none;border-radius:8px;padding:12px;font-size:14px;" placeholder="搜索用户..." oninput="searchUserSelect()">
            </div>
            <div id="userSelectList"></div>
            <button onclick="closeUserSelectModal()" style="width:100%;height:48px;background:var(--color-primary);color:#fff;border-radius:12px;font-weight:600;margin-top:12px;">确认</button>
          </div>
        </div>
      </div>`;
    }

    function showInputModal(title, placeholder, cb) {
      document.getElementById('inputModalTitle').textContent = title;
      document.getElementById('inputModalValue').placeholder = placeholder;
      document.getElementById('inputModalValue').value = '';
      document.getElementById('inputModal').classList.add('active');
      inputCallback = cb;
      setTimeout(() => document.getElementById('inputModalValue').focus(), 100);
    }

    function confirmInputModal() {
      const val = document.getElementById('inputModalValue').value.trim();
      document.getElementById('inputModal').classList.remove('active');
      if (val && inputCallback) {
        inputCallback(val);
        inputCallback = null;
      }
    }

    function openSchedulePicker() {
      const picker = document.getElementById('scheduleTimePicker');
      const modal = document.getElementById('scheduleModal');
      if (modal) {
        modal.classList.add('active');
      } else {
        const m = document.createElement('div');
        m.id = 'scheduleModal';
        m.className = 'dialog-modal';
        m.onclick = (e) => { if (e.target === m) m.classList.remove('active'); };
        m.innerHTML = `
          <div class="dialog-modal-content" style="width:90%;max-width:360px;" onclick="event.stopPropagation()">
            <div style="font-weight:600;font-size:16px;margin-bottom:16px;">选择定时发布时间</div>
            <input type="datetime-local" id="scheduleModalInput" style="width:100%;background:#f5f5f5;border:none;border-radius:8px;padding:12px;font-size:15px;box-sizing:border-box;">
            <div style="display:flex;gap:10px;margin-top:16px;">
              <button onclick="clearScheduleTime()" style="flex:1;height:44px;background:#f5f5f5;border-radius:12px;font-weight:500;border:none;">清除</button>
              <button onclick="confirmScheduleTime()" style="flex:1;height:44px;background:var(--color-primary);color:#fff;border-radius:12px;font-weight:500;border:none;">确认</button>
            </div>
          </div>
        `;
        document.body.appendChild(m);
        setTimeout(() => m.classList.add('active'), 10);
      }
      setTimeout(() => {
        const input = document.getElementById('scheduleModalInput');
        if (input && picker) input.value = picker.value || '';
      }, 50);
    }

    function confirmScheduleTime() {
      const input = document.getElementById('scheduleModalInput');
      const picker = document.getElementById('scheduleTimePicker');
      const display = document.getElementById('scheduleTimeDisplay');
      const modal = document.getElementById('scheduleModal');
      if (input && picker && display) {
        picker.value = input.value;
        if (input.value) {
          const d = new Date(input.value);
          display.textContent = `${d.getMonth()+1}月${d.getDate()}日 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
          display.style.color = 'var(--color-primary)';
        } else {
          display.textContent = '未设置定时发布';
          display.style.color = '#999';
        }
      }
      if (modal) modal.classList.remove('active');
    }

    function clearScheduleTime() {
      const input = document.getElementById('scheduleModalInput');
      const picker = document.getElementById('scheduleTimePicker');
      const display = document.getElementById('scheduleTimeDisplay');
      if (input) input.value = '';
      if (picker) picker.value = '';
      if (display) {
        display.textContent = '未设置定时发布';
        display.style.color = '#999';
      }
    }

    function insertSymbol(sym) {
      const body = document.getElementById('createBody');
      const start = body.selectionStart;
      const end = body.selectionEnd;
      body.value = body.value.substring(0, start) + sym + body.value.substring(end);
      body.selectionStart = body.selectionEnd = start + 1;
      body.focus();
      if (sym === '#' || sym === '＃') {
        checkTopicTrigger(body);
      }
    }

    let currentTopicKeyword = '';
    let topicStartPos = -1;
    let topicStartChar = '';
    let hotTopicsCache = [];
    let topicSearchTimer = null;

    async function loadHotTopics() {
      try {
        const res = await api('/topicHot?limit=3');
        if (res.code === 1) hotTopicsCache = res.data;
        renderHotTags();
      } catch(e) {
        renderHotTags();
      }
    }

    function renderHotTags() {
      const el = document.getElementById('createHotTags');
      if (!el) return;
      if (!hotTopicsCache || hotTopicsCache.length === 0) {
        el.style.display = 'none';
        return;
      }
      el.style.display = '';
      el.innerHTML = hotTopicsCache.map(t =>
        `<span onclick="insertHotTopic('${t.name.replace(/'/g,"\\'")}')">#${escapeHtml(t.name)}#</span>`
      ).join('');
    }

    function insertHotTopic(name) {
      const ta = document.getElementById('createBody');
      if (!ta) return;
      const pos = ta.selectionStart;
      const val = ta.value;
      const before = val.substring(0, pos);
      const after = val.substring(pos);
      let prefix = '';
      if (before.length > 0 && before[before.length - 1] !== ' ' && before[before.length - 1] !== '\n') {
        prefix = ' ';
      }
      const newVal = before + prefix + '#' + name + '# ' + after;
      ta.value = newVal;
      const newPos = before.length + prefix.length + name.length + 3;
      ta.selectionStart = ta.selectionEnd = newPos;
      ta.focus();
      document.getElementById('createCharCount').textContent = ta.value.length;
    }

    function checkTopicTrigger(ta) {
      const val = ta.value;
      const pos = ta.selectionStart;
      let hashIdx = -1;
      let hashChar = '';
      for (let i = pos - 1; i >= 0; i--) {
        if (val[i] === '#' || val[i] === '＃') {
          hashIdx = i;
          hashChar = val[i];
          break;
        }
        if (val[i] === ' ' || val[i] === '\n') break;
      }
      if (hashIdx >= 0) {
        const afterHash = val.substring(hashIdx + 1, pos);
        if (afterHash.indexOf('#') === -1 && afterHash.indexOf('＃') === -1 && afterHash.length <= 20) {
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
      const bar = document.getElementById('topicSuggestBar');
      const list = document.getElementById('topicSuggestList');
      if (!bar || !list) return;
      if (window._adjustTopicBarsKeyboard) {
        window._adjustTopicBarsKeyboard();
      } else {
        const kb = Math.max(0, window.innerHeight - (window.visualViewport ? window.visualViewport.height : window.innerHeight));
        bar.style.bottom = kb + 'px';
      }
      bar.classList.add('show');
      if (topicSearchTimer) clearTimeout(topicSearchTimer);
      if (!keyword) {
        renderTopicSuggest(hotTopicsCache, '');
        return;
      }
      topicSearchTimer = setTimeout(async () => {
        try {
          const res = await api('/topicSearch?keyword=' + encodeURIComponent(keyword) + '&limit=6');
          if (res.code === 1) {
            renderTopicSuggest(res.data, keyword);
          }
        } catch(e) {}
      }, 200);
    }

    function renderTopicSuggest(topics, keyword) {
      const list = document.getElementById('topicSuggestList');
      if (!list) return;
      let html = '';
      const hasExact = topics.some(t => t.name === keyword);
      if (keyword && !hasExact) {
        html += `<div class="topic-suggest-item" onclick="selectTopic('${keyword.replace(/'/g,"\\'")}', true)">
          <div class="topic-suggest-name"><span class="topic-hash">#</span>${escapeHtml(keyword)}</div>
          <div class="topic-suggest-views" style="color:var(--color-primary);">创建新话题</div>
        </div>`;
      }
      topics.forEach(t => {
        html += `<div class="topic-suggest-item" onclick="selectTopic('${t.name.replace(/'/g,"\\'")}', false)">
          <div class="topic-suggest-name"><span class="topic-hash">#</span>${escapeHtml(t.name)}</div>
          <div class="topic-suggest-views">${formatNumber(t.views)} 浏览</div>
        </div>`;
      });
      if (!topics.length && !keyword) {
        html = '<div style="padding:30px;text-align:center;color:#999;font-size:14px;">暂无话题，输入#创建新话题</div>';
      }
      list.innerHTML = html;
    }

    async function selectTopic(name, isNew) {
      const ta = document.getElementById('createBody');
      if (!ta) return;
      if (isNew) {
        try {
          const res = await api('/topicCreate', 'POST', { name });
          if (res.code !== 1) {
            showToast('话题创建失败');
            return;
          }
        } catch(e) {
          showToast('话题创建失败');
          return;
        }
      }
      const val = ta.value;
      const pos = ta.selectionStart;
      const before = val.substring(0, topicStartPos);
      const after = val.substring(pos);
      const newVal = before + '#' + name + '# ' + after;
      ta.value = newVal;
      const newPos = before.length + name.length + 3;
      ta.selectionStart = ta.selectionEnd = newPos;
      ta.focus();
      hideTopicSuggest();
      document.getElementById('createCharCount').textContent = ta.value.length;
    }

    function hideTopicSuggest() {
      const bar = document.getElementById('topicSuggestBar');
      if (bar) bar.classList.remove('show');
      topicStartPos = -1;
      currentTopicKeyword = '';
    }

    let atTriggerPos = -1;

    function checkAtTrigger(ta) {
      const val = ta.value;
      const pos = ta.selectionStart;
      if (pos > 0 && (val[pos - 1] === '@' || val[pos - 1] === '＠')) {
        atTriggerPos = pos - 1;
        openAtUserModal();
      }
    }

    function insertAtUser(nickname, uid) {
      const textarea = document.getElementById('createBody');
      const val = textarea.value;
      let insertPos = atTriggerPos >= 0 ? atTriggerPos : textarea.selectionStart;
      const before = val.substring(0, insertPos);
      const triggerLen = (atTriggerPos >= 0 && (val[atTriggerPos] === '＠' || val[atTriggerPos] === '@')) ? 1 : 0;
      const after = val.substring(insertPos + triggerLen);
      const insertText = '@[' + uid + ']' + nickname + ' ';
      const newText = before + insertText + after;
      textarea.value = newText;
      const newPos = before.length + insertText.length;
      textarea.selectionStart = textarea.selectionEnd = newPos;
      textarea.focus();
      document.getElementById('createCharCount').textContent = newText.length;
      closeAtUserModal();
      atTriggerPos = -1;
    }

    function extractTopics(text) {
      const topics = [];
      const normalized = text.replace(/＃/g, '#');
      const regex = /#([^#\s\n]{1,20})#/g;
      let match;
      while ((match = regex.exec(normalized)) !== null) {
        if (topics.indexOf(match[1]) === -1) topics.push(match[1]);
      }
      return topics;
    }

    function showLocationModal() {
      showInputModal('标记地点', '输入地点或当前位置', (val) => {
        createLocation = val;
        document.getElementById('locationDisp').textContent = val;
        document.getElementById('locationDisp').style.color = 'var(--color-primary)';
        const spans = document.querySelectorAll('#createLocList span');
        spans.forEach(span => {
          span.classList.remove('active');
          span.style.color='#333';
          span.style.background='#f5f5f5';
        });
      });
    }

    function selectQuickLocation(el) {
      if (el.target && el.target.tagName === 'SPAN') {
        if(el.target.textContent === '不标记地点') {
          clearLocation();
          return;
        }
        const val = el.target.textContent;
        createLocation = val;
        document.getElementById('locationDisp').textContent = val;
        document.getElementById('locationDisp').style.color = 'var(--color-primary)';
        const spans = document.querySelectorAll('#createLocList span');
        spans.forEach(span => {
          span.classList.remove('active');
          span.style.color = '#333';
          span.style.background = '#f5f5f5';
        });
        el.target.classList.add('active');
        el.target.style.color = 'var(--color-primary)';
        el.target.style.background = 'var(--color-primary-light)';
      }
    }

    function bindCreatePostEvents() {
      const ta = document.getElementById('createBody');
      ta.addEventListener('input', (e) => {
        document.getElementById('createCharCount').textContent = e.target.value.length;
        checkTopicTrigger(e.target);
        checkAtTrigger(e.target);
      });
      ta.addEventListener('keyup', (e) => {
        if (e.key === 'Escape') {
          hideTopicSuggest();
        }
      });
      if (!window.__topicKeyboardBound && window.visualViewport) {
        window.__topicKeyboardBound = true;
        const adjustBarsToKeyboard = () => {
          const rect = getViewportRect();
          const safeBottom = envSafeAreaBottom || 0;
          let bottom = Math.max(0, window.innerHeight - rect.bottom);
          if (bottom === 0) bottom = safeBottom;
          else bottom = bottom + Math.max(0, safeBottom - rect.top);
          const bottomPx = bottom + 'px';
          ['topicSuggestBar', 'atUserModal'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
              el.style.bottom = bottomPx;
              el.style.paddingBottom = bottom <= safeBottom ? (safeBottom > 0 ? safeBottom + 'px' : '') : '0px';
            }
          });
          
          adjustModalsToKeyboard();
        };
        window.visualViewport.addEventListener('resize', adjustBarsToKeyboard);
        window.visualViewport.addEventListener('scroll', adjustBarsToKeyboard);
        window.addEventListener('resize', adjustBarsToKeyboard);
        window._adjustTopicBarsKeyboard = adjustBarsToKeyboard;
        
        if (!window.__modalObserverBound) {
          window.__modalObserverBound = true;
          const mo = new MutationObserver(() => {
            if (document.querySelector('.dialog-modal.active, .modal-overlay.active')) adjustModalsToKeyboard();
          });
          mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
        }
      }
      loadHotTopics();
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async pos => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          let pois = [];
          try {
            const res = await api('/nearbyPOI?lat=' + lat + '&lng=' + lng);
            if (res.code === 1) {
              pois = res.data.map(p => ({ name: p.name }));
            }
          } catch (e) {
            showToast('获取附近位置失败，请手动选择');
          }
          let listHtml = `<span class="active" style="background:var(--color-primary-light);color:var(--color-primary);">不标记地点</span>`;
          listHtml += pois.map(p => `<span>${p.name}</span>`).join('');
          document.getElementById('createLocList').innerHTML = listHtml;
          createLocation = '';
          document.getElementById('locationDisp').textContent = '添加地点';
          document.getElementById('locationDisp').style.color = '#999';
        }, () => {
          document.getElementById('createLocList').innerHTML = `<span class="active" style="background:var(--color-primary-light);color:var(--color-primary);">不标记地点</span>`;
        });
      } else {
        document.getElementById('createLocList').innerHTML = `<span class="active" style="background:var(--color-primary-light);color:var(--color-primary);">不标记地点</span>`;
      }
    }

    async function handleCreateImages(files) {
      if (isFileUploading) {
        showToast('正在上传，请稍候');
        return;
      }
      const MAX_TOTAL = 9;
      const MAX_VIDEO = 2;
      if (selectedCreateImages.length >= MAX_TOTAL) {
        showToast('最多只能上传' + MAX_TOTAL + '个媒体文件');
        return;
      }
      
      const existingHasImg = selectedCreateImages.some(x => !x._isVideo);
      const existingHasVideo = selectedCreateImages.some(x => x._isVideo);
      const existingType = existingHasImg ? 'image' : (existingHasVideo ? 'video' : '');

      
      let batchHasImg = false, batchHasVideo = false;
      const checkBatch = [];
      for (let f of files) {
        const name = (f.name || '').toLowerCase();
        const ext = name.split('.').pop();
        const isImg = ['jpg','jpeg','png','gif','webp','bmp'].includes(ext) || (f.type && f.type.startsWith('image/'));
        const isVideo = ['mp4','mov','avi','mkv'].includes(ext) || (f.type && f.type.startsWith('video/'));
        if (isImg) batchHasImg = true;
        if (isVideo) batchHasVideo = true;
        checkBatch.push({ isImg, isVideo, f });
      }
      
      if (batchHasImg && batchHasVideo) {
        showToast('不允许图片和视频混排，请只选择其中一种类型');
        return;
      }
      
      if (existingType === 'image' && batchHasVideo) {
        showToast('不允许图片和视频混排，当前已有图片，请继续选择图片');
        return;
      }
      if (existingType === 'video' && batchHasImg) {
        showToast('不允许图片和视频混排，当前已有视频，请继续选择视频');
        return;
      }

      const processedFiles = [];
      for (let item of checkBatch) {
        if (!item.isImg && !item.isVideo) { showToast('仅支持图片和视频'); continue; }
        if (selectedCreateImages.length + processedFiles.length >= MAX_TOTAL) {
          showToast('最多只能上传' + MAX_TOTAL + '个媒体文件');
          break;
        }
        const f = item.f;
        if (item.isVideo) {
          const existing = [...selectedCreateImages, ...processedFiles].filter(x => x._isVideo || ['mp4','mov','avi','mkv'].includes(((x.name||'').split('.').pop()||'').toLowerCase())).length;
          if (existing >= MAX_VIDEO) {
            showToast('最多只能上传' + MAX_VIDEO + '个视频');
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
      const fd = new FormData();
      processedFiles.forEach(f => fd.append('images', f));
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
        try { localStorage.setItem('uploadProgress', JSON.stringify({ pct, time: Date.now(), hasVideo })); } catch(e) {}
        const progressPct = hasVideo ? Math.min(Math.round(pct * 60), 59) : Math.round(pct * 100);
        const now = Date.now();
        if (now - lastProgressPaint < 120) return;
        lastProgressPaint = now;
        document.querySelectorAll('#createImageGrid .create-media-item .progress-ring').forEach(el => {
          el.style.background = `conic-gradient(#fff 0% ${progressPct}%, rgba(255,255,255,0.2) ${progressPct}%)`;
        });
        if (hasVideo && pct >= 0.99 && !uploadFinished) {
          uploadFinished = true;
          processingStarted = true;
          let processingPct = 60;
          document.querySelectorAll('#createImageGrid .create-media-item .progress-ring').forEach(el => {
            el.style.transition = 'none';
          });
          const statusEl = document.getElementById('upload-status-text');
          if (statusEl) statusEl.textContent = '处理中...';
          processingTimer = setInterval(() => {
            const decay = (99 - processingPct) * 0.04;
            processingPct = Math.min(99, processingPct + (decay < 0.1 ? 0.1 : decay));
            document.querySelectorAll('#createImageGrid .create-media-item .progress-ring').forEach(el => {
              el.style.background = `conic-gradient(#fff 0% ${processingPct}%, rgba(255,255,255,0.2) ${processingPct}%)`;
            });
          }, 500);
        }
      };

      const xhrRef = {};
      let retryCount = 0;
      const maxRetries = 3;
      const uploadTimeoutMs = hasVideo ? 600000 : 120000;

      async function doUpload() {
        try {
          const uploadFd = new FormData();
          processedFiles.forEach(f => uploadFd.append('images', f));
          const res = await apiForm('/uploadImage', uploadFd, updateProgress, uploadTimeoutMs, xhrRef);
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
            document.querySelectorAll('#createImageGrid .create-media-item .progress-ring').forEach(el => {
              el.style.background = `conic-gradient(#fff 0% 0%, rgba(255,255,255,0.2) 0%)`;
            });
            await new Promise(r => setTimeout(r, 1000 * retryCount));
            return doUpload();
          }
          throw e;
        }
      }

      try {
        const res = await doUpload();
        if (processingTimer) clearInterval(processingTimer);
        if (res.code !== 1 || !res.data || !res.data.urls) {
          showToast(res.msg || '上传失败，点击重试');
          processedFiles.forEach(f => { f._uploadFailed = true; });
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
            failedFiles.forEach(f => { f._uploadFailed = true; });
            showToast('部分文件上传失败，点击重试');
          }
          uploadSuccess = true;
          if (hasVideo) {
            document.querySelectorAll('#createImageGrid .create-media-item .progress-ring').forEach(el => {
              el.style.background = `conic-gradient(#fff 0% 100%, rgba(255,255,255,0.2) 100%)`;
            });
          }
        }
      } catch (e) {
        if (processingTimer) clearInterval(processingTimer);
        showToast(hasVideo ? ('视频上传失败，点击重试') : ('文件上传失败，点击重试'));
        processedFiles.forEach(f => { f._uploadFailed = true; });
      }
      try { localStorage.removeItem('uploadProgress'); } catch(e) {}
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
      updateCreateImageGridWithUploading([file]);
      const isVideo = file._isVideo || ['mp4','mov','avi','mkv'].includes(file.name?.split('.').pop()?.toLowerCase());
      const fd = new FormData();
      fd.append('images', file);
      let processingTimer = null;
      let uploadFinished = false;
      let lastPaint = 0;
      const uploadTimeoutMs = isVideo ? 600000 : 120000;
      try {
        const res = await apiForm('/uploadImage', fd, (loaded, total) => {
          const uploadPct = loaded / total;
          if (isVideo) {
            const pct = Math.min(Math.round(uploadPct * 60), 59);
            const now = Date.now();
            if (now - lastPaint < 120) return;
            lastPaint = now;
            document.querySelectorAll('#createImageGrid .create-media-item .progress-ring').forEach(el => {
              el.style.background = `conic-gradient(#fff 0% ${pct}%, rgba(255,255,255,0.2) ${pct}%)`;
            });
            if (uploadPct >= 0.99 && !uploadFinished) {
              uploadFinished = true;
              const statusEl = document.getElementById('upload-status-text');
              if (statusEl) statusEl.textContent = '处理中...';
              let processingPct = 60;
              processingTimer = setInterval(() => {
                const decay = (99 - processingPct) * 0.04;
                processingPct = Math.min(99, processingPct + (decay < 0.1 ? 0.1 : decay));
                document.querySelectorAll('#createImageGrid .create-media-item .progress-ring').forEach(el => {
                  el.style.background = `conic-gradient(#fff 0% ${processingPct}%, rgba(255,255,255,0.2) ${processingPct}%)`;
                });
              }, 500);
            }
          } else {
            const pct = Math.round(uploadPct * 100);
            const now = Date.now();
            if (now - lastPaint < 120) return;
            lastPaint = now;
            document.querySelectorAll('#createImageGrid .create-media-item .progress-ring').forEach(el => {
              el.style.background = `conic-gradient(#fff 0% ${pct}%, rgba(255,255,255,0.2) ${pct}%)`;
            });
          }
        }, uploadTimeoutMs);
        if (processingTimer) clearInterval(processingTimer);
        if (res.code !== 1 || !res.data || !res.data.urls || !res.data.urls[0]) {
          showToast(res.msg || '重试失败，点击重试');
          file._uploadFailed = true;
        } else {
          file._uploadedUrl = res.data.urls[0];
          if (isVideo) {
            document.querySelectorAll('#createImageGrid .create-media-item .progress-ring').forEach(el => {
              el.style.background = `conic-gradient(#fff 0% 100%, rgba(255,255,255,0.2) 100%)`;
            });
          }
          if (isVideo) await new Promise(r => setTimeout(r, 400));
        }
      } catch (e) {
        if (processingTimer) clearInterval(processingTimer);
        showToast('重试失败，点击重试');
        file._uploadFailed = true;
      }
      isFileUploading = false;
      updateCreateImageGrid();
    }

    function updateCreateImageGridWithUploading(files) {
      const grid = document.getElementById('createImageGrid');
      if (!grid) return;
      let html = '';
      selectedCreateImages.forEach((f, i) => {
        const isUploading = files && files.includes(f);
        const isVideo = f._isVideo || ['mp4','mov','avi','mkv'].includes(f.name?.split('.').pop()?.toLowerCase());
        const thumbUrl = isVideo ? (f._thumbnailUrl || '') : (f._previewUrl || '');
        html += `<div class="create-media-item" style="position:relative;">
          ${isVideo && thumbUrl ? `<img src="${thumbUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">` : (thumbUrl ? `<img src="${thumbUrl}">` : `<div style="width:100%;height:100%;background:#f0f0f0;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-film" style="font-size:24px;color:#999;"></i></div>`)}
          ${isVideo && !isUploading ? `<div id="createPlayBtn_${i}" onclick="event.stopPropagation();playCreateVideo(${i})" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:36px;height:36px;background:rgba(0,0,0,0.5);border-radius:50%;display:flex;align-items:center;justify-content:center;z-index:2;cursor:pointer;"><i class="fa-solid fa-play" style="color:#fff;font-size:14px;margin-left:2px;"></i></div>` : ''}
          <div class="del" onclick="event.stopPropagation();delCreateImage(${i})"><i class="fa-solid fa-xmark"></i></div>
          ${isUploading ? `<div class="upload-overlay"><div class="progress-ring"></div><div id="upload-status-text" style="position:absolute;bottom:-22px;left:50%;transform:translateX(-50%);font-size:11px;color:#fff;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,0.5);">上传中...</div></div>` : ''}
        </div>`;
      });
      if(selectedCreateImages.length < 9) {
        html += `<div class="create-media-item" onclick="document.getElementById('createImgInput').click()"><i class="fa-solid fa-plus"></i></div>`;
      }
      grid.innerHTML = html;
    }

    function playCreateVideo(idx) {
      const file = selectedCreateImages[idx];
      if (!file) return;
      const isVideo = file._isVideo || ['mp4','mov','avi','mkv'].includes(file.name?.split('.').pop()?.toLowerCase());
      if (!isVideo) return;
      if (playerVideoBlobUrl) {
        try { URL.revokeObjectURL(playerVideoBlobUrl); } catch(e) {}
        playerVideoBlobUrl = null;
      }
      const videoUrl = file._uploadedUrl || URL.createObjectURL(file);
      if (!file._uploadedUrl) playerVideoBlobUrl = videoUrl;
      const thumbUrl = file._thumbnailUrl || '';
      openVideoPlayer(videoUrl, thumbUrl);
    }

    function updateCreateImageGrid() {
      const grid = document.getElementById('createImageGrid');
      if (!grid) return;
      let html = '';
      selectedCreateImages.forEach((f, i) => {
        const isVideo = f._isVideo || ['mp4','mov','avi','mkv'].includes(f.name?.split('.').pop()?.toLowerCase());
        const thumbUrl = isVideo ? (f._thumbnailUrl || '') : (f._previewUrl || '');
        if (f._uploadFailed) {
          html += `<div class="create-media-item" style="position:relative;">
            ${isVideo && thumbUrl ? `<img src="${thumbUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;opacity:0.4;">` : (thumbUrl ? `<img src="${thumbUrl}" style="opacity:0.4;">` : `<div style="width:100%;height:100%;background:#f0f0f0;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-film" style="font-size:24px;color:#999;"></i></div>`)}
            <div onclick="event.stopPropagation();retryUploadFile(${i})" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:4px;z-index:2;cursor:pointer;">
              <div style="width:36px;height:36px;background:rgba(0,0,0,0.6);border-radius:50%;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-rotate-right" style="color:#fff;font-size:16px;"></i></div>
              <span style="color:#fff;font-size:10px;text-shadow:0 1px 2px rgba(0,0,0,0.5);">重试</span>
            </div>
            <div class="del" onclick="event.stopPropagation();delCreateImage(${i})"><i class="fa-solid fa-xmark"></i></div>
          </div>`;
        } else {
          html += `<div class="create-media-item" style="position:relative;">
            ${isVideo && thumbUrl ? `<img src="${thumbUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">` : (thumbUrl ? `<img src="${thumbUrl}">` : `<div style="width:100%;height:100%;background:#f0f0f0;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-film" style="font-size:24px;color:#999;"></i></div>`)}
            ${isVideo ? `<div id="createPlayBtn_${i}" onclick="event.stopPropagation();playCreateVideo(${i})" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:36px;height:36px;background:rgba(0,0,0,0.5);border-radius:50%;display:flex;align-items:center;justify-content:center;z-index:2;cursor:pointer;"><i class="fa-solid fa-play" style="color:#fff;font-size:14px;margin-left:2px;"></i></div>` : ''}
            <div class="del" onclick="event.stopPropagation();delCreateImage(${i})"><i class="fa-solid fa-xmark"></i></div>
          </div>`;
        }
      });
      if(selectedCreateImages.length < 9) {
        html += `<div class="create-media-item" onclick="document.getElementById('createImgInput').click()"><i class="fa-solid fa-plus"></i></div>`;
      }
      grid.innerHTML = html;
    }

    function delCreateImage(i) {
      const f = selectedCreateImages[i];
      if (f) {
        if (f._previewUrl) { try { URL.revokeObjectURL(f._previewUrl); } catch(e) {} f._previewUrl = null; }
        if (f._thumbnailUrl) { try { URL.revokeObjectURL(f._thumbnailUrl); } catch(e) {} f._thumbnailUrl = null; }
        if (f._playerBlobUrl) { try { URL.revokeObjectURL(f._playerBlobUrl); } catch(e) {} f._playerBlobUrl = null; }
      }
      selectedCreateImages.splice(i, 1);
      updateCreateImageGrid();
    }

    function openAdvancedModal() {
      document.getElementById('advancedModal').classList.add('active');
    }

    function closeAdvancedModal() {
      document.getElementById('advancedModal').classList.remove('active');
    }

    function toggleDeclarationOptions() {
      const checked = document.getElementById('declarationSwitch').checked;
      document.getElementById('declarationOptions').style.display = checked ? 'block' : 'none';
      if(!checked) createDeclaration = '';
    }

    function selectDeclaration(type) {
      createDeclaration = type;
      document.querySelectorAll('#declarationOptions .radio-item').forEach(el => {
        const icon = el.querySelector('.radio-icon');
        if(el.querySelector('span').textContent === type) icon.innerHTML = '<i class="fa-solid fa-circle-check" style="color:var(--color-primary);"></i>';
        else icon.innerHTML = '<i class="fa-regular fa-circle"></i>';
      });
      closeAdvancedModal();
      showToast('已选择：' + type);
    }

    function openVisibilityModal() {
      document.getElementById('visibilityModal').classList.add('active');
    }

    function closeVisibilityModal() {
      document.getElementById('visibilityModal').classList.remove('active');
    }

    function selectVisibility(type) {
      createVisibility = type;
      const textMap = {
        'public': '公开可见',
        'friends': '仅互关好友可见',
        'private': '仅自己可见'
      };
      const textEl = document.getElementById('createVisibilityText');
      if (textEl) textEl.textContent = textMap[type];
      const settingItem = textEl ? textEl.closest('.create-setting-item') : null;
      if (settingItem) {
        const icon = settingItem.querySelector('i');
        if (icon) icon.className = (type === 'public' ? 'fa-solid fa-lock-open' : 'fa-solid fa-lock');
      }
      document.querySelectorAll('#visibilityModal .radio-item').forEach(el => {
        const isActive = el.getAttribute('data-vis') === type;
        el.classList.toggle('active', isActive);
        const icon = el.querySelector('.radio-icon');
        if (icon) icon.innerHTML = isActive ? '<i class="fa-solid fa-circle-check"></i>' : '<i class="fa-regular fa-circle"></i>';
      });
      closeVisibilityModal();
    }

    function openPollModal() {
      if(createPollData.options.length === 0) {
        createPollData = { options: ['', ''], votes: {} };
      }
      renderPollOptions();
      document.getElementById('pollModal').classList.add('active');
    }

    function closePollModal() {
      document.getElementById('pollModal').classList.remove('active');
      const cleanOpts = createPollData.options.filter(o=>o.trim());
      if (cleanOpts.length === 0) {
        createPollData = { options: [], votes: {} };
      }
      const wrap = document.getElementById('pollPreviewWrap');
      if (wrap) {
        wrap.innerHTML = buildPollPreviewHtml();
      }
    }

    function renderPollOptions() {
      const container = document.getElementById('pollOptionsList');
      container.innerHTML = createPollData.options.map((opt, i) => `
        <div class="poll-option-row">
          <input value="${opt}" placeholder="选项 ${i+1}" oninput="updatePollOption(${i}, this.value)">
          <div class="del" onclick="removePollOption(${i})"><i class="fa-solid fa-trash-can"></i></div>
        </div>
      `).join('');
    }

    function addPollOption() {
      createPollData.options.push('');
      renderPollOptions();
    }

    function removePollOption(index) {
      createPollData.options.splice(index, 1);
      if(createPollData.options.length === 0) createPollData.options = ['', ''];
      renderPollOptions();
    }

    function updatePollOption(index, val) {
      createPollData.options[index] = val;
    }

    function openUserSelectModal(type) {
      tempUserSelectType = type;
      document.getElementById('userSelectTitle').textContent = type === 'visible' ? '只给谁看' : '不给谁看';
      document.getElementById('userSelectSearch').value = '';
      document.getElementById('userSelectModal').classList.add('active');
      searchUserSelect();
    }

    function closeUserSelectModal() {
      document.getElementById('userSelectModal').classList.remove('active');
    }

    async function searchUserSelect() {
      const keyword = document.getElementById('userSelectSearch').value.trim();
      const list = document.getElementById('userSelectList');
      list.innerHTML = '<div style="text-align:center;padding:20px;color:#999;">加载中...</div>';
      const res = await api('/searchUser?keyword=' + encodeURIComponent(keyword));
      if(res.code === 1) {
        const targetList = tempUserSelectType === 'visible' ? createVisibleUsers : createBlockedUsers;
        list.innerHTML = res.data.map(u => `
          <div class="user-select-item" onclick="toggleUserSelect('${u.uid}')">
            <img src="${resolveMediaUrl(u.avatar) || DEFAULT_AVATAR}" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">
            <div class="info">${u.nickname}</div>
            <div class="check ${targetList.includes(u.uid) ? 'checked' : ''}"><i class="${targetList.includes(u.uid) ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'}"></i></div>
          </div>
        `).join('');
      } else {
        list.innerHTML = '<div style="text-align:center;padding:20px;color:#999;">加载失败</div>';
      }
    }

    function toggleUserSelect(uid) {
      if(tempUserSelectType === 'visible') {
        const idx = createVisibleUsers.indexOf(uid);
        if(idx > -1) createVisibleUsers.splice(idx, 1);
        else createVisibleUsers.push(uid);
      } else {
        const idx = createBlockedUsers.indexOf(uid);
        if(idx > -1) createBlockedUsers.splice(idx, 1);
        else createBlockedUsers.push(uid);
      }
      searchUserSelect();
    }

    function openAtUserModal() {
      const atM = document.getElementById('atUserModal');
      if (window._adjustTopicBarsKeyboard) {
        window._adjustTopicBarsKeyboard();
      } else if (atM) {
        const kb = Math.max(0, window.innerHeight - (window.visualViewport ? window.visualViewport.height : window.innerHeight));
        atM.style.bottom = kb + 'px';
      }
      document.getElementById('atUserSearchInput').value = '';
      document.getElementById('atUserList').innerHTML = '<div style="text-align:center;padding:20px;color:#999;">输入昵称搜索用户...</div>';
      document.getElementById('atUserModal').classList.add('show');
      setTimeout(() => {
        const input = document.getElementById('atUserSearchInput');
        if (input) {
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }
      }, 100);
    }

    function closeAtUserModal() {
      document.getElementById('atUserModal').classList.remove('show');
    }

    function searchAtUsers() {
      const keyword = document.getElementById('atUserSearchInput').value.trim();
      const list = document.getElementById('atUserList');
      if(!keyword) {
        list.innerHTML = '<div style="text-align:center;padding:20px;color:#999;">输入昵称搜索用户...</div>';
        if (atSearchTimer) { clearTimeout(atSearchTimer); atSearchTimer = null; }
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
          const res = await api('/searchUser?keyword=' + encodeURIComponent(keyword));
          if(res.code === 1) {
            atSearchCache[keyword] = res.data;
            renderAtUserList(res.data);
          } else {
            list.innerHTML = '<div style="text-align:center;padding:20px;color:#999;">加载失败</div>';
          }
        } catch(e) {
          list.innerHTML = '<div style="text-align:center;padding:20px;color:#999;">加载失败</div>';
        }
        atSearchTimer = null;
      }, 300);
    }

    function renderAtUserList(users) {
      const list = document.getElementById('atUserList');
      if (!list) return;
      list.innerHTML = users.map(u => `
        <div class="user-select-item" onclick="insertAtUser('${u.nickname}', '${u.uid}')">
          <img src="${resolveMediaUrl(u.avatar) || DEFAULT_AVATAR}" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">
          <div class="info">${u.nickname}</div>
        </div>
      `).join('') || '<div style="text-align:center;padding:20px;color:#999;">未找到相关用户</div>';
    }

    async function submitCreatePost() {
      if (isPublishing) return;
      try {
        if (!getToken()) {
          showLoginModal();
          return;
        }
        if (isFileUploading) {
          showToast('文件正在上传中，请稍候再试');
          return;
        }
        const hasFailedUpload = selectedCreateImages.some(f => f._uploadFailed);
        if (hasFailedUpload) {
          showToast('有文件上传失败，请点击重试或删除');
          return;
        }
        const title = document.getElementById('createTitle').value.trim();
        const rawContent = document.getElementById('createBody').value.trim();
        const content = rawContent.replace(/＃/g, '#').replace(/＠/g, '@');
        if (!content && selectedCreateImages.length === 0 && createPollData.options.filter(o=>o.trim()).length === 0) {
          showToast('请输入内容或添加图片');
          return;
        }
        isPublishing = true;
        const btn = document.querySelector('.create-nav .btn-publish');
        if (btn) {
          btn.textContent = '发布中...';
          btn.classList.add('disabled');
        }
        let imageUrls = [];
        let videoUrls = [];
        let videoCoverUrl = '';
        if (selectedCreateImages.length > 0) {
          selectedCreateImages.forEach(f => {
            const isVideo = f._isVideo || ['mp4','mov','avi','mkv'].includes(f.name?.split('.').pop()?.toLowerCase());
            if (isVideo && f._uploadedUrl) {
              videoUrls.push(f._uploadedUrl);
              if (f._uploadedCover && !videoCoverUrl) videoCoverUrl = f._uploadedCover;
            }
            else if (f._uploadedUrl) imageUrls.push(f._uploadedUrl);
          });
        }
        let topic = '';
        const m = content.match(/#([^#]+)#/);
        if (m) topic = m[1];
        const topics = extractTopics(content);
        const pollDataStr = createPollData.options.filter(o=>o.trim()).length > 0 ? JSON.stringify(createPollData) : '';
        const scheduleTimePicker = document.getElementById('scheduleTimePicker');
        let scheduled_time = null;
        if(scheduleTimePicker && scheduleTimePicker.value) {
          scheduled_time = scheduleTimePicker.value;
        }
        const res = await api('/createPost', 'POST', {
          title,
          content,
          images: imageUrls.join(','),
          video: videoUrls.join(','),
          video_cover: videoCoverUrl,
          location: createLocation,
          poll_data: pollDataStr,
          category: 'all',
          visibility: createVisibility,
          original_declaration: createDeclaration,
          allow_download: document.getElementById('createAllowDownload').checked ? 1 : 0,
          scheduled_time,
          topic,
          topics
        });
        if (res && res.code === 1) {
          showToast(res.msg || '发布成功');
          createPollData = { options: [], votes: {} };
          createVisibleUsers = [];
          createBlockedUsers = [];
          selectedCreateImages.forEach(f => {
            if (f._previewUrl) { try { URL.revokeObjectURL(f._previewUrl); } catch(e) {} }
            if (f._thumbnailUrl) { try { URL.revokeObjectURL(f._thumbnailUrl); } catch(e) {} }
            if (f._playerBlobUrl) { try { URL.revokeObjectURL(f._playerBlobUrl); } catch(e) {} }
          });
          selectedCreateImages = [];
          try {
            document.getElementById('createBody').value = '';
            document.getElementById('createTitle').value = '';
          } catch (e) {}
          resetPublishBtn();
          const allTab = document.querySelector('.cat-item[data-cat="all"]');
          if(allTab) {
            document.querySelectorAll('.cat-item').forEach(i => i.classList.remove('active'));
            allTab.classList.add('active');
          }
          goPage('home');
          loadPosts(true);
        } else {
          if (res && res.msg && res.msg.indexOf('涉嫌') !== -1) {
            showViolationBubble('已违规');
          } else {
            showToast(res.msg || '发布失败');
          }
          resetPublishBtn();
        }
      } catch (e) {
        console.error('发布流程彻底崩溃：', e);
        showToast('系统错误: ' + (e.message || '未知异常，请检查控制台'));
        resetPublishBtn();
      }
    }

    function resetPublishBtn() {
      isPublishing = false;
      const btn = document.querySelector('.create-nav .btn-publish');
      if (btn) {
        btn.textContent = '发布';
        btn.classList.remove('disabled');
      }
    }

    function showPostActionSheet(postId) {
      const existing = document.getElementById('postActionOverlay');
      if (existing) existing.remove();
      const overlay = document.createElement('div');
      overlay.id = 'postActionOverlay';
      overlay.className = 'modal-overlay active';
      overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
      overlay.innerHTML = `<div class="modal-content" style="max-height:50vh;">
        <div class="modal-handler"></div>
        <div style="font-weight:600;font-size:16px;margin-bottom:12px;">帖子推广</div>
        <div class="modal-item" onclick="document.getElementById('postActionOverlay').remove();goPage('buyExposure',null,'${postId}')">
          <span class="label"><i class="fa-solid fa-bullhorn" style="color:var(--color-primary);"></i> 获取曝光</span>
          <div class="right"><span style="font-size:13px;color:#999;">提升推送优先级</span> <i class="fa-solid fa-chevron-right"></i></div>
        </div>
        <div class="modal-item" onclick="document.getElementById('postActionOverlay').remove();goPage('buyPin',null,'${postId}')">
          <span class="label"><i class="fa-solid fa-thumbtack" style="color:#f59e0b;"></i> 置顶推广</span>
          <div class="right"><span style="font-size:13px;color:#999;">¥5起</span> <i class="fa-solid fa-chevron-right"></i></div>
        </div>
      </div>`;
      document.body.appendChild(overlay);
    }

    function showPostManageMenu(postId) {
      const existing = document.getElementById('postManageOverlay');
      if (existing) existing.remove();
      const p = currentPostDetail;
      const visText = p.visibility === 'private' ? '仅自己可见' : p.visibility === 'friends' ? '仅互关好友可见' : '公开可见';
      const overlay = document.createElement('div');
      overlay.id = 'postManageOverlay';
      overlay.className = 'modal-overlay active';
      overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
      overlay.innerHTML = `<div class="modal-content" style="max-height:60vh;">
        <div class="modal-handler"></div>
        <div style="font-weight:600;font-size:16px;margin-bottom:12px;">管理帖子</div>
        <div class="modal-item" onclick="document.getElementById('postManageOverlay').remove();openEditPostModal('${postId}')">
          <span class="label"><i class="fa-solid fa-pen-to-square" style="color:#333;"></i> 编辑帖子</span>
          <div class="right"><i class="fa-solid fa-chevron-right"></i></div>
        </div>
        <div class="modal-item" onclick="setPostVisibility('${postId}','public')">
          <span class="label"><i class="fa-solid fa-lock-open" style="color:#333;"></i> 公开可见</span>
          <div class="right">${p.visibility==='public' ? '<i class="fa-solid fa-check" style="color:var(--color-primary);"></i>' : ''}</div>
        </div>
        <div class="modal-item" onclick="setPostVisibility('${postId}','friends')">
          <span class="label"><i class="fa-solid fa-user-group" style="color:#333;"></i> 仅互关好友可见</span>
          <div class="right">${p.visibility==='friends' ? '<i class="fa-solid fa-check" style="color:var(--color-primary);"></i>' : ''}</div>
        </div>
        <div class="modal-item" onclick="setPostVisibility('${postId}','private')">
          <span class="label"><i class="fa-solid fa-lock" style="color:#333;"></i> 仅自己可见（私密）</span>
          <div class="right">${p.visibility==='private' ? '<i class="fa-solid fa-check" style="color:var(--color-primary);"></i>' : ''}</div>
        </div>
        <div class="modal-item" onclick="document.getElementById('postManageOverlay').remove();openPostVisibleUsers('${postId}')">
          <span class="label"><i class="fa-regular fa-user"></i> 仅谁可见</span>
          <div class="right"><span style="font-size:13px;color:#999;">${p.visible_users ? p.visible_users.split(',').filter(x=>x).length+'人' : '未设置'}</span> <i class="fa-solid fa-chevron-right"></i></div>
        </div>
        <div class="modal-item" onclick="document.getElementById('postManageOverlay').remove();openPostBlockedUsers('${postId}')">
          <span class="label"><i class="fa-solid fa-eye-slash"></i> 不给谁看</span>
          <div class="right"><span style="font-size:13px;color:#999;">${p.blocked_users ? p.blocked_users.split(',').filter(x=>x).length+'人' : '未设置'}</span> <i class="fa-solid fa-chevron-right"></i></div>
        </div>
        <div style="height:8px;background:#f5f5f5;"></div>
        <div class="modal-item" onclick="document.getElementById('postManageOverlay').remove();goPage('buyExposure',null,'${postId}')">
          <span class="label"><i class="fa-solid fa-bullhorn" style="color:var(--color-primary);"></i> 获取曝光</span>
          <div class="right"><span style="font-size:13px;color:#999;">提升推送优先级</span> <i class="fa-solid fa-chevron-right"></i></div>
        </div>
        <div class="modal-item" onclick="document.getElementById('postManageOverlay').remove();goPage('buyPin',null,'${postId}')">
          <span class="label"><i class="fa-solid fa-thumbtack" style="color:#f59e0b;"></i> 置顶推广</span>
          <div class="right"><span style="font-size:13px;color:#999;">¥5起</span> <i class="fa-solid fa-chevron-right"></i></div>
        </div>
        <div class="modal-item" onclick="togglePostProtection('${postId}', ${p.watermark_protected == 1 ? 'false' : 'true'})">
          <span class="label"><i class="fa-solid fa-lock" style="color:#1D9BF0;"></i> 帖子保护</span>
          <div class="right">${p.watermark_protected == 1 ? '<i class="fa-solid fa-check" style="color:var(--color-primary);"></i>' : '<span style="font-size:13px;color:#999;">未开启</span>'} <i class="fa-solid fa-chevron-right"></i></div>
        </div>
        <div class="modal-item" style="border-bottom:none;color:var(--color-red);" onclick="confirmDeletePost('${postId}')">
          <span class="label"><i class="fa-solid fa-trash-can"></i> 删除帖子</span>
        </div>
      </div>`;
      document.body.appendChild(overlay);
    }

    async function setPostVisibility(postId, visibility) {
      try {
        const res = await api('/updatePost', 'POST', { postId, visibility });
        if (res.code === 1) {
          showToast('已设置为' + (visibility==='public'?'公开可见':visibility==='friends'?'仅互关好友可见':'仅自己可见'));
          document.getElementById('postManageOverlay')?.remove();
          if (currentPostDetail) {
            currentPostDetail.visibility = visibility;
            render();
          }
        } else {
          showToast(res.msg || '修改失败');
        }
      } catch (e) {
        showToast('修改失败');
      }
    }

    async function togglePostProtection(postId, enable) {
      
      if (enable) {
        const canUse = myVerificationTypes.includes('advanced') || myVerificationTypes.includes('premium') || myVerificationTypes.includes('enterprise');
        if (!canUse) {
          showToast('该功能为进阶/高级认证功能，请先订阅认证');
          setTimeout(function() {
            document.getElementById('postManageOverlay')?.remove();
            goPage('verifSubscribe');
          }, 800);
          return;
        }
      }
      try {
        const res = await api('/updatePost', 'POST', { postId, watermark_protected: enable ? 1 : 0 });
        if (res.code === 1) {
          showToast(enable ? '帖子保护已开启' : '帖子保护已关闭');
          document.getElementById('postManageOverlay')?.remove();
          if (currentPostDetail) {
            currentPostDetail.watermark_protected = enable ? 1 : 0;
            render();
          }
        } else {
          showToast(res.msg || '操作失败');
        }
      } catch (e) {
        showToast('操作失败');
      }
    }
    window.togglePostProtection = togglePostProtection;

    function openEditPostModal(postId) {
      const p = currentPostDetail;
      if (!p) return;
      const overlay = document.createElement('div');
      overlay.id = 'editPostOverlay';
      overlay.className = 'modal-overlay active';
      overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
      overlay.innerHTML = `<div class="modal-content" style="max-height:85vh;">
        <div class="modal-handler"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <div style="font-weight:600;font-size:16px;">编辑帖子</div>
          <div style="font-size:14px;color:var(--color-primary);cursor:pointer;font-weight:500;" onclick="saveEditPost('${postId}')">保存</div>
        </div>
        <div style="margin-bottom:12px;">
          <div style="font-size:14px;color:#666;margin-bottom:8px;">标题</div>
          <input id="editPostTitle" type="text" value="${escapeHtml(p.title || '')}" placeholder="标题（可选）" style="width:100%;padding:12px;border:1px solid #eee;border-radius:8px;font-size:15px;box-sizing:border-box;">
        </div>
        <div style="margin-bottom:12px;">
          <div style="font-size:14px;color:#666;margin-bottom:8px;">内容</div>
          <textarea id="editPostContent" placeholder="分享你的想法..." style="width:100%;min-height:150px;padding:12px;border:1px solid #eee;border-radius:8px;font-size:15px;box-sizing:border-box;resize:vertical;font-family:inherit;line-height:1.5;">${escapeHtml(p.content || '')}</textarea>
          <div style="text-align:right;font-size:12px;color:#999;margin-top:4px;"><span id="editPostCharCount">${(p.content || '').length}</span>/500</div>
        </div>
      </div>`;
      document.body.appendChild(overlay);
      const ta = document.getElementById('editPostContent');
      if (ta) {
        ta.addEventListener('input', () => {
          const len = ta.value.length;
          const cnt = document.getElementById('editPostCharCount');
          if (cnt) cnt.textContent = len;
        });
      }
    }

    async function saveEditPost(postId) {
      const title = document.getElementById('editPostTitle')?.value.trim() || '';
      const content = document.getElementById('editPostContent')?.value.trim() || '';
      if (!content) {
        showToast('内容不能为空');
        return;
      }
      if (content.length > 500) {
        showToast('内容不能超过500字');
        return;
      }
      try {
        const res = await api('/updatePost', 'POST', { postId, title, content });
        if (res.code === 1) {
          showToast('保存成功');
          document.getElementById('editPostOverlay')?.remove();
          if (currentPostDetail) {
            currentPostDetail.title = title;
            currentPostDetail.content = content;
            render();
          }
        } else {
          showToast(res.msg || '保存失败');
        }
      } catch (e) {
        showToast('保存失败');
      }
    }

    let tempPostUserType = 'visible';
    let tempPostVisibleUsers = [];
    let tempPostBlockedUsers = [];
    let tempPostId = '';

    function openPostVisibleUsers(postId) {
      tempPostUserType = 'visible';
      tempPostId = postId;
      tempPostVisibleUsers = currentPostDetail.visible_users ? currentPostDetail.visible_users.split(',').filter(x=>x) : [];
      showPostUserSelectModal();
    }

    function openPostBlockedUsers(postId) {
      tempPostUserType = 'blocked';
      tempPostId = postId;
      tempPostBlockedUsers = currentPostDetail.blocked_users ? currentPostDetail.blocked_users.split(',').filter(x=>x) : [];
      showPostUserSelectModal();
    }

    function showPostUserSelectModal() {
      const existing = document.getElementById('postUserSelectOverlay');
      if (existing) existing.remove();
      const title = tempPostUserType === 'visible' ? '仅谁可见' : '不给谁看';
      const overlay = document.createElement('div');
      overlay.id = 'postUserSelectOverlay';
      overlay.className = 'modal-overlay active';
      overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
      overlay.innerHTML = `<div class="modal-content" style="max-height:70vh;">
        <div class="modal-handler"></div>
        <div style="font-weight:600;font-size:16px;margin-bottom:12px;">${title}</div>
        <div style="position:relative;margin-bottom:12px;">
          <input id="postUserSearchInput" style="width:100%;background:#f5f5f5;border:none;border-radius:8px;padding:12px;font-size:14px;" placeholder="搜索用户..." oninput="searchPostUserSelect()">
        </div>
        <div id="postUserSelectList" style="max-height:300px;overflow-y:auto;"></div>
        <button onclick="savePostUserSelect()" style="width:100%;height:48px;background:var(--color-primary);color:#fff;border-radius:12px;font-weight:600;margin-top:12px;">确认</button>
      </div>`;
      document.body.appendChild(overlay);
      searchPostUserSelect();
    }

    async function searchPostUserSelect() {
      const keyword = document.getElementById('postUserSearchInput').value.trim();
      const list = document.getElementById('postUserSelectList');
      list.innerHTML = '<div style="text-align:center;padding:20px;color:#999;">加载中...</div>';
      const res = await api('/searchUser?keyword=' + encodeURIComponent(keyword));
      if (res.code === 1) {
        const targetList = tempPostUserType === 'visible' ? tempPostVisibleUsers : tempPostBlockedUsers;
        list.innerHTML = res.data.map(u => `
          <div class="user-select-item" onclick="togglePostUserSelect('${u.uid}')">
            <img src="${resolveMediaUrl(u.avatar) || DEFAULT_AVATAR}" style="width:36px;height:36px;border-radius:50%;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">
            <div class="info">${u.nickname}</div>
            <div class="check ${targetList.includes(u.uid) ? 'checked' : ''}"><i class="${targetList.includes(u.uid) ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'}"></i></div>
          </div>
        `).join('') || '<div style="text-align:center;padding:20px;color:#999;">未找到用户</div>';
      } else {
        list.innerHTML = '<div style="text-align:center;padding:20px;color:#999;">加载失败</div>';
      }
    }

    function togglePostUserSelect(uid) {
      if (tempPostUserType === 'visible') {
        const idx = tempPostVisibleUsers.indexOf(uid);
        if (idx > -1) tempPostVisibleUsers.splice(idx, 1);
        else tempPostVisibleUsers.push(uid);
      } else {
        const idx = tempPostBlockedUsers.indexOf(uid);
        if (idx > -1) tempPostBlockedUsers.splice(idx, 1);
        else tempPostBlockedUsers.push(uid);
      }
      searchPostUserSelect();
    }

    async function savePostUserSelect() {
      const users = tempPostUserType === 'visible' ? tempPostVisibleUsers : tempPostBlockedUsers;
      const field = tempPostUserType === 'visible' ? 'visible_users' : 'blocked_users';
      try {
        const res = await api('/updatePost', 'POST', { postId: tempPostId, [field]: users.join(',') });
        if (res.code === 1) {
          showToast('已保存');
          document.getElementById('postUserSelectOverlay')?.remove();
          if (currentPostDetail) {
            currentPostDetail[field] = users.join(',');
          }
        } else {
          showToast(res.msg || '保存失败');
        }
      } catch (e) {
        showToast('保存失败');
      }
    }

    function confirmDeletePost(postId) {
      const existing = document.getElementById('confirmDeleteOverlay');
      if (existing) existing.remove();
      const overlay = document.createElement('div');
      overlay.id = 'confirmDeleteOverlay';
      overlay.className = 'modal-overlay active';
      overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
      overlay.innerHTML = `<div class="modal-content" style="max-height:35vh;">
        <div class="modal-handler"></div>
        <div style="font-weight:600;font-size:16px;margin-bottom:16px;text-align:center;">确认删除这篇帖子？</div>
        <div style="display:flex;gap:10px;">
          <button onclick="document.getElementById('confirmDeleteOverlay').remove()" style="flex:1;height:44px;background:#f5f5f5;border-radius:12px;font-weight:500;">取消</button>
          <button onclick="doDeletePost('${postId}')" style="flex:1;height:44px;background:var(--color-red);color:#fff;border-radius:12px;font-weight:500;">删除</button>
        </div>
      </div>`;
      document.body.appendChild(overlay);
    }

    async function doDeletePost(postId) {
      try {
        const res = await api('/deletePost', 'POST', { postId });
        if (res.code === 1) {
          showToast('已删除');
          document.getElementById('confirmDeleteOverlay')?.remove();
          document.getElementById('postManageOverlay')?.remove();
          goPage('home');
          loadPosts(true);
        } else {
          showToast(res.msg || '删除失败');
        }
      } catch (e) {
        showToast('删除失败');
      }
    }

    function showFullImage(src) {
      const existing = document.getElementById('fullscreen-overlay');
      if (existing) existing.remove();
      const overlay = document.createElement('div');
      overlay.id = 'fullscreen-overlay';
      overlay.style.cssText = `position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.95);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer;`;
      overlay.onclick = function(e) {
        if (e.target === overlay || e.target === closeBtn || e.target.closest('.close-btn')) closeFullImage();
      };
      const closeBtn = document.createElement('div');
      closeBtn.className = 'close-btn';
      closeBtn.innerHTML = '<i class="fa-solid fa-xmark" style="color:#fff;font-size:28px;"></i>';
      closeBtn.style.cssText = `position:absolute;top:20px;left:20px;z-index:10000;cursor:pointer;padding:10px;background:rgba(0,0,0,0.6);border-radius:50%;width:44px;height:44px;display:flex;align-items:center;justify-content:center;`;
      const img = document.createElement('img');
      img.src = resolveMediaUrl(src);
      img.style.cssText = `max-width:100%;max-height:100%;object-fit:contain;border-radius:4px;`;
      overlay.appendChild(closeBtn);
      overlay.appendChild(img);
      document.body.appendChild(overlay);
    }

    function closeFullImage() {
      const overlay = document.getElementById('fullscreen-overlay');
      if (overlay) overlay.remove();
    }

    function goPostDetailAndScroll(id) {
      if (!getToken()) { showLoginModal(); return; }
      scrollToCommentFlag = true;
      goPostDetail(id);
    }

    function renderPostDetail() {
      if (!currentPostDetail) return '<div style="padding:40px;text-align:center;">帖子不存在或已删除</div>';
      const p = currentPostDetail;
      const imgs = p.images ? p.images.split(',').filter(x => x) : [];
      const imgClass = imgs.length === 1 ? 'single' : '';
      const liked = p.liked || false;
      const collected = p.collected || false;
      const contentHtml = formatContentWithTopics(p.content || '');
      let pollHtml = '';
      try {
        if (p.poll_data && typeof p.poll_data === 'string') {
          const parsed = JSON.parse(p.poll_data);
          if (parsed.options && parsed.options.filter(o=>o.trim()).length > 0) {
            const votes = parsed.votes || {};
            const totalVotes = Object.values(votes).reduce((a, b) => a + b, 0);
            const hasVoted = p.voted_index !== undefined && p.voted_index >= 0;
            pollHtml = `<div class="poll-area" style="background:#f9f9f9;padding:16px;border-radius:8px;margin:8px 16px;">
              <div style="font-weight:600;margin-bottom:12px;">投票 <span style="font-size:12px;color:#999;font-weight:normal;">共 ${totalVotes} 票</span></div>
              ${parsed.options.map((opt, idx) => {
                const v = (votes && votes[idx]) || 0;
                const pct = totalVotes > 0 ? Math.round((v / totalVotes) * 100) : 0;
                return `
                <div onclick="votePost('${p.id}', ${idx})" style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;cursor:${hasVoted ? 'default' : 'pointer'};border-bottom:0.5px solid #eee;">
                  <div style="display:flex;align-items:center;gap:10px;">
                    <i class="fa-solid fa-circle-check" style="color:${hasVoted && p.voted_index == idx ? 'var(--color-primary)' : '#ccc'};"></i>
                    <span style="color:${hasVoted && p.voted_index == idx ? 'var(--color-primary)' : '#333'}; font-weight:${hasVoted && p.voted_index == idx ? '600' : 'normal'};">
                      ${opt} ${hasVoted ? `<span style="font-size:12px;color:#999;font-weight:normal;margin-left:4px;">(${v}票, ${pct}%)</span>` : ''}
                    </span>
                  </div>
                  <div style="width:60px;height:6px;background:#eee;border-radius:4px;overflow:hidden;">
                    <div style="height:100%;width:${pct}%;background:var(--color-primary);border-radius:4px;"></div>
                  </div>
                </div>`;
              }).join('')}
            </div>`;
          }
        }
      } catch (e) {
        pollHtml = '';
      }
      let html = `<div class="post-detail" style="background:#fff;min-height:100vh;">
        <div class="detail-navbar">
          <div class="detail-navbar-back" onclick="goBack()"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div>
          <div class="detail-navbar-title">详情</div>
          <div style="display:flex;align-items:center;gap:4px;">
            ${p.is_owner === true || String(p.user_id) === getUid() || isAdminAccount() ? '<div class="detail-navbar-more" onclick="showPostManageMenu(\'' + p.id + '\')"><i class="fa-solid fa-ellipsis"></i></div>' : '<div class="detail-navbar-more" onclick="goReport(\'post\',' + p.id + ')"><i class="fa-solid fa-triangle-exclamation"></i></div>'}
          </div>
        </div>
        <div class="pd-layout" style="padding-top:calc(50px + env(safe-area-inset-top));">
          <div class="pd-main">
          <div class="post-header">
            <img class="avatar" src="${resolveMediaUrl(p.avatar)||DEFAULT_AVATAR}" onclick="goUserProfile('${p.user_id}')" style="cursor:pointer;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">
            <div class="post-user" onclick="goUserProfile('${p.user_id}')" style="cursor:pointer;">
            <div class="post-nickname">${p.nickname || '用户'+p.user_id}${renderListVerification(p)}</div>
            <div class="post-time">${timeAgo(p.create_time)} · ${p.province || '未知'}</div>
          </div>
        </div>
        ${p.title ? `<div style="padding:0 16px 8px;font-size:18px;font-weight:600;">${p.title}</div>` : ''}
          ${p.content ? `<div class="post-content">${contentHtml}</div>` : ''}
          ${p.location ? `<div style="padding:0 16px 8px;font-size:13px;color:#666;"><i class="fa-solid fa-location-dot" style="color:var(--color-primary);"></i> ${p.location}</div>` : ''}
          ${p.original_declaration ? `<div style="padding:0 16px 8px;font-size:13px;color:#999;">声明: ${p.original_declaration}</div>` : ''}
          ${pollHtml}
          ${imgs.length ? `<div class="post-images ${imgClass}">${imgs.map(i=>`<img src="${resolveMediaUrl(i)}" onclick="showFullImage('${i}')">`).join('')}</div>` : ''}
          ${p.video ? `<div style="padding:0 16px 8px;">
            <div onclick="openVideoPlayer('${p.video}', '${p.video_cover || ''}', ${p.allow_download != 0 ? 'true' : 'false'})" style="position:relative;cursor:pointer;width:100%;aspect-ratio:1;border-radius:8px;overflow:hidden;">
              ${p.video_cover ? `<img src="${resolveMediaUrl(p.video_cover)}" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">` : ''}
              <div style="display:${p.video_cover ? 'none' : 'flex'};position:absolute;inset:0;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);align-items:center;justify-content:center;">
                <div style="text-align:center;">
                  <i class="fa-solid fa-video" style="font-size:48px;color:rgba(255,255,255,0.9);"></i>
                  <div style="color:rgba(255,255,255,0.8);font-size:14px;margin-top:8px;">点击播放视频</div>
                </div>
              </div>
              <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:48px;height:48px;background:rgba(0,0,0,0.5);border-radius:50%;display:flex;align-items:center;justify-content:center;pointer-events:none;">
                <i class="fa-solid fa-play" style="color:#fff;font-size:20px;margin-left:2px;"></i>
              </div>
            </div>
          </div>` : ''}
          <div class="post-actions" style="border-bottom:1px solid #eee;border-top:1px solid #eee;margin:0 16px;">
            <div class="action-item" onclick="likePost('${p.id}',this)"><i class="${liked ? 'fa-solid fa-heart' : 'fa-regular fa-heart'}" style="color:${liked ? 'var(--color-red)' : ''}"></i><span>${p.likes||0}</span></div>
            <div class="action-item" id="commentScrollTarget"><i class="fa-regular fa-comment"></i><span>${p.comments||0}</span></div>
            <div class="action-item" onclick="collectPost('${p.id}',this)"><i class="${collected ? 'fa-solid fa-star' : 'fa-regular fa-star'}" style="color:${collected ? 'var(--color-yellow)' : ''}"></i><span>${p.collects||0}</span></div>
          </div>
          </div>
          <div class="pd-comments">
          <div class="pd-comments-title">评论</div>
          <div id="commentList" style="padding:16px;">
            ${new Array(3).fill(0).map(() => `
              <div style="display:flex;gap:10px;margin-bottom:16px;">
                <div class="sk-item" style="width:36px;height:36px;border-radius:50%;flex-shrink:0;"></div>
                <div style="flex:1;">
                  <div style="display:flex;gap:8px;margin-bottom:6px;align-items:center;">
                    <div class="sk-item" style="width:80px;height:13px;"></div>
                    <div class="sk-item" style="width:45px;height:10px;"></div>
                  </div>
                  <div class="sk-item" style="width:100%;height:12px;margin-bottom:4px;"></div>
                  <div class="sk-item" style="width:75%;height:12px;"></div>
                </div>
              </div>
            `).join('')}
          </div>
          </div>
          <div style="height:60px;"></div>
        </div>
        <div class="comment-input-bar">
          <img class="comment-input-avatar" src="${resolveMediaUrl(myAvatar) || DEFAULT_AVATAR}" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">
          <input class="comment-input" id="commentInput" placeholder="说点什么...">
          <span id="commentCharCount" class="comment-char-count"></span>
          <div class="comment-send" id="commentSendBtn" onclick="sendComment()">发送</div>
        </div>
      </div>`;
      if (false && visibleWatermarkEnabled) {
        
        const uid = getUid();
        html += '';
      }
      return html;
    }

    let goBackLock = false;

    function goBack() {
      if (chatTimer && currentPage === 'chat') {
        clearInterval(chatTimer);
        chatTimer = null;
      }
      if (goBackLock) return;
      goBackLock = true;
      setTimeout(() => { goBackLock = false; }, 300);

      if (pageHistory.length > 0) {
        const prev = pageHistory.pop();
        currentPage = prev;
        prevPage = currentPage;

        try {
          history.pushState({ page: currentPage, handled: true }, '', '#' + currentPage);
        } catch(e) {}
        window.scrollTo(0, 0);
        render();
        updateTabbar();
      } else {
        currentPage = 'home';
        prevPage = 'home';
        window.scrollTo(0, 0);
        render();
        updateTabbar();
      }
    }

    async function bindPostDetailEvents() {
      if (!currentPostDetail) return;
      const ci = document.getElementById('commentInput');
      if (ci) {
        ci.addEventListener('input', updateCharCount);
        ci.addEventListener('focus', ensureCommentInputVisible);
        ci.addEventListener('blur', () => { setTimeout(ensureCommentInputVisible, 100); });
      }
      await loadComments(currentPostDetail.id);
      if (scrollToCommentFlag) {
        setTimeout(() => {
          const target = document.getElementById('commentScrollTarget');
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          scrollToCommentFlag = false;
        }, 500);
      }
    }

    function setReply(seq) {
      replyTargetSeq = seq;
      document.getElementById('commentInput').focus();
      document.getElementById('commentInput').placeholder = '回复中...';
    }

    function updateCharCount() {
      const input = document.getElementById('commentInput');
      if (!input) return;
      const count = input.value.length;
      const remaining = 150 - count;
      const el = document.getElementById('commentCharCount');
      if (!el) return;
      if (remaining <= 20) {
        el.textContent = remaining;
        el.style.color = remaining < 0 ? 'var(--color-red)' : '#999';
      } else {
        el.textContent = '';
        el.style.color = '#999';
      }
    }

    
    function ensureCommentContentTruncated(el) {
      if (!el.dataset.fullHtml) el.dataset.fullHtml = el.innerHTML;
      const probe = el.cloneNode(true);
      probe.classList.remove('collapsed');
      probe.style.position = 'absolute';
      probe.style.visibility = 'hidden';
      probe.style.left = '-99999px';
      probe.style.width = (el.offsetWidth || el.parentElement?.offsetWidth || 280) + 'px';
      probe.style.fontSize = '14px';
      probe.style.lineHeight = '1.5';
      probe.style.margin = '2px 0';
      probe.style.wordBreak = 'break-word';
      document.body.appendChild(probe);
      const rawText = probe.textContent || '';
      const needsTruncation = probe.scrollHeight > 65; 
      if (needsTruncation && rawText.length >= 10) {
        const MAX_H = 63;
        let lo = 0, hi = rawText.length, best = 0;
        for (let iter = 0; iter < 20 && lo <= hi; iter++) {
          const mid = (lo + hi) >> 1;
          probe.textContent = rawText.slice(0, mid) + '…';
          if (probe.scrollHeight <= MAX_H) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
        }
        if (best > 4) {
          el.classList.remove('collapsed');
          el.textContent = rawText.slice(0, best) + '…';
          el.classList.add('collapsed');
        } else {
          el.innerHTML = el.dataset.fullHtml;
        }
      }
      document.body.removeChild(probe);
    }

    function checkCommentOverflow(el) {
      
      if (!el.dataset.fullHtml) el.dataset.fullHtml = el.innerHTML;
      const probe = el.cloneNode(true);
      probe.classList.remove('collapsed');
      probe.style.position = 'absolute';
      probe.style.visibility = 'hidden';
      probe.style.left = '-99999px';
      probe.style.width = (el.offsetWidth || el.parentElement?.offsetWidth || 280) + 'px';
      probe.style.fontSize = '14px';
      probe.style.lineHeight = '1.5';
      probe.style.margin = '2px 0';
      probe.style.wordBreak = 'break-word';
      document.body.appendChild(probe);
      const overflow = probe.scrollHeight > 65;
      document.body.removeChild(probe);
      return overflow;
    }

    function toggleCommentExpand(id) {
      const el = document.getElementById('cc-' + id);
      const btn = document.querySelector(`[data-expand-id="${id}"]`);
      if (!el) return;
      if (el.classList.contains('collapsed')) {
        if (el.dataset.fullHtml) el.innerHTML = el.dataset.fullHtml;
        el.classList.remove('collapsed');
        if (btn) btn.innerHTML = '收起<span class="c-expand-arrow up"></span>';
      } else {
        el.classList.add('collapsed');
        if (btn) btn.innerHTML = '展开<span class="c-expand-arrow"></span>';
        ensureCommentContentTruncated(el);
      }
    }

    function toggleConfessionCommentExpand(id) {
      const el = document.getElementById('ccc-' + id);
      const btn = document.querySelector(`[data-cexpand-id="${id}"]`);
      if (!el) return;
      if (el.classList.contains('collapsed')) {
        if (el.dataset.fullHtml) el.innerHTML = el.dataset.fullHtml;
        el.classList.remove('collapsed');
        if (btn) btn.innerHTML = '收起<span class="c-expand-arrow up"></span>';
      } else {
        el.classList.add('collapsed');
        if (btn) btn.innerHTML = '展开<span class="c-expand-arrow"></span>';
        ensureCommentContentTruncated(el);
      }
    }

    async function loadComments(postId) {
      const list = document.getElementById('commentList');
      if (!list) return;
      let res;
      try {
        res = await api('/commentList?postId=' + postId);
      } catch (e) {
        list.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#999;">评论加载失败，点击重试</div>';
        list.onclick = () => loadComments(postId);
        return;
      }
      if (!res || res.code !== 1) {
        list.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#999;">还没有评论，快来抢沙发吧</div>';
        return;
      }
      if (!res.data || res.data.length === 0) {
        list.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#999;">还没有评论，快来抢沙发吧</div>';
        return;
      }
      const myUid = getUid();
      const seqMap = {};
      res.data.forEach(c => { seqMap[c.post_seq] = c; });
      const renderComment = (c, repliesHtml, parentName) => {
        const content = formatCommentContent(c.content);
        const nameHtml = parentName
          ? `<span class="c-name">${c.nickname}</span><span class="reply-arrow"></span><span class="reply-parent-name">${parentName}</span>`
          : `<span class="c-name">${c.nickname}</span>`;
        const isMine = c.user_id === myUid || currentNickname === '管理员';
        return `<div class="comment-item" data-comment-id="${c.id}" data-is-mine="${isMine}">
            <img class="c-avatar" src="${resolveMediaUrl(c.avatar)||DEFAULT_AVATAR}" onclick="goUserProfile('${c.user_id}')" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">
            <div class="c-body">
              <div class="c-header">
                ${nameHtml}
                ${c.post_seq === 1 ? '<span class="comment-tag-first">首评</span>' : ''}
              </div>
              <div class="c-content collapsed" id="cc-${c.id}">${content}</div>
              <div class="c-meta">
                <div class="c-meta-left">
                  <span class="c-time">${timeAgo(c.create_time)}</span>
                  ${c.province ? `<span>${c.province}</span>` : ''}
                  <span class="c-action" onclick="setReply(${c.post_seq})">回复</span>
                </div>
                <span class="c-like" onclick="likeComment(${c.id},this)">
                  <i class="${c.liked ? 'fa-solid fa-heart' : 'fa-regular fa-heart'}" style="color:${c.liked ? 'var(--color-red)' : ''}"></i>
                  <span>${c.likes||0}</span>
                </span>
              </div>
              ${repliesHtml || ''}
            </div>
          </div>`;
      };
      const collectAllDescendants = (parentSeq) => {
        const direct = res.data.filter(c => c.parent_seq == parentSeq);
        let all = [];
        for (const c of direct) {
          all.push(c);
          all = all.concat(collectAllDescendants(c.post_seq));
        }
        return all;
      };
      const buildTree = (parentSeq) => {
        return res.data.filter(c => c.parent_seq == parentSeq).map(c => {
          const allDescendants = collectAllDescendants(c.post_seq);
          const repliesHtml = allDescendants.length > 0
            ? `<div class="comment-replies">${allDescendants.map(d => {
                const parent = seqMap[d.parent_seq];
                const parentName = parent ? parent.nickname : '';
                return renderComment(d, '', parentName);
              }).join('')}</div>`
            : '';
          return renderComment(c, repliesHtml, '');
        });
      };
      let html = buildTree(0).join('');
      if (!html.trim()) {
        list.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#999;">还没有评论，快来抢沙发吧</div>';
      } else {
        list.innerHTML = html;
        list.querySelectorAll('.c-content.collapsed').forEach(el => {
          const overflow = checkCommentOverflow(el);
          if (overflow) {
            const id = el.id.replace('cc-', '');
            const btn = document.createElement('span');
            btn.className = 'c-expand';
            btn.setAttribute('data-expand-id', id);
            btn.innerHTML = '展开<span class="c-expand-arrow"></span>';
            btn.onclick = () => toggleCommentExpand(id);
            el.insertAdjacentElement('afterend', btn);
            
            ensureCommentContentTruncated(el);
          } else {
            el.classList.remove('collapsed');
          }
        });
        bindCommentLongPress();
      }
    }

    function bindCommentLongPress() {
      const items = document.querySelectorAll('.comment-item[data-comment-id]');
      items.forEach(item => {
        let timer = null;
        let triggered = false;
        const start = (e) => {
          triggered = false;
          timer = setTimeout(() => {
            triggered = true;
            showCommentMenu(item.dataset.commentId, item.dataset.isMine === 'true');
          }, 500);
        };
        const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
        const move = () => { if (timer) { clearTimeout(timer); timer = null; } };
        item.addEventListener('touchstart', start, { passive: true });
        item.addEventListener('touchend', cancel);
        item.addEventListener('touchmove', move, { passive: true });
        item.addEventListener('mousedown', start);
        item.addEventListener('mouseup', cancel);
        item.addEventListener('mouseleave', cancel);
        item.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          showCommentMenu(item.dataset.commentId, item.dataset.isMine === 'true');
        });
      });
    }

    function showCommentMenu(commentId, isMine) {
      const existing = document.getElementById('commentMenuOverlay');
      if (existing) existing.remove();
      const overlay = document.createElement('div');
      overlay.id = 'commentMenuOverlay';
      overlay.className = 'modal-overlay active';
      overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
      if (isMine) {
        overlay.innerHTML = `<div class="modal-content" style="max-height:40vh;">
          <div class="modal-handler"></div>
          <div class="modal-item" style="border-bottom:none;color:var(--color-red);text-align:center;" onclick="deleteComment(${commentId})">
            <span class="label" style="justify-content:center;width:100%;"><i class="fa-solid fa-trash-can"></i> 删除评论</span>
          </div>
        </div>`;
      } else {
        overlay.innerHTML = `<div class="modal-content" style="max-height:40vh;">
          <div class="modal-handler"></div>
          <div class="modal-item" style="border-bottom:none;color:var(--color-primary);text-align:center;" onclick="document.getElementById('commentMenuOverlay').remove();goReport('comment',${commentId})">
            <span class="label" style="justify-content:center;width:100%;"><i class="fa-solid fa-triangle-exclamation"></i> 举报评论</span>
          </div>
        </div>`;
      }
      document.body.appendChild(overlay);
    }

    async function deleteComment(commentId) {
      try {
        const res = await api('/deleteComment', 'POST', { commentId });
        if (res.code === 1) {
          showToast('已删除');
          document.getElementById('commentMenuOverlay')?.remove();
          if (currentPostDetail) {
            currentPostDetail.comments = Math.max(0, (currentPostDetail.comments || 0) - 1);
            await loadComments(currentPostDetail.id);
          }
        } else {
          showToast(res.msg || '删除失败');
        }
      } catch (e) {
        showToast('删除失败');
      }
    }

    async function votePost(postId, idx) {
      if (!getToken()) {
        showLoginModal();
        return;
      }
      const res = await api('/votePost', 'POST', { postId, optionIndex: idx });
      if (res.code === 1) {
        showToast('投票成功');
        currentPostDetail.poll_data = JSON.stringify(res.data.poll_data);
        currentPostDetail.voted_index = idx;
        render();
        bindPostDetailEvents();
      } else {
        showToast(res.msg || '投票失败');
      }
    }

    async function sendComment() {
      const content = document.getElementById('commentInput').value.trim();
      if (!content) return;
      if (content.length > 150) {
        showToast('评论不能超过150字');
        return;
      }
      if (!getToken()) {
        showLoginModal();
        return;
      }
      document.getElementById('commentInput').value = '';
      document.getElementById('commentInput').placeholder = '说点什么...';
      updateCharCount();
      replyTargetSeq = 0;
      const sendBtn = document.getElementById('commentSendBtn');
      if (sendBtn) {
        sendBtn.style.pointerEvents = 'none';
        sendBtn.style.opacity = '0.5';
        setTimeout(() => {
          sendBtn.style.pointerEvents = '';
          sendBtn.style.opacity = '';
        }, 1000);
      }
      const res = await api('/commentPost', 'POST', { postId: currentPostDetail.id, content, parentSeq: replyTargetSeq });
      if (res.code === 1) {
        await loadComments(currentPostDetail.id);
        if (currentPostDetail) {
          currentPostDetail.comments = (currentPostDetail.comments || 0) + 1;
        }
      } else {
        if (res.msg && res.msg.indexOf('涉嫌') !== -1) {
          showViolationBubble('已违规');
        } else {
          showToast(res.msg || '评论失败');
        }
      }
    }

    async function likeComment(id, el) {
      if (!getToken()) {
        showLoginModal();
        return;
      }
      const res = await api('/likeComment', 'POST', { commentId: id });
      if (res.code === 1) {
        const liked = res.data.liked;
        const icon = el.querySelector('i');
        const span = el.querySelector('span');
        icon.className = liked ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
        icon.style.color = liked ? 'var(--color-red)' : '';
        span.textContent = parseInt(span.textContent) + (liked ? 1 : -1);
      }
    }

    function renderDiscover() {
      const skeletonCards = new Array(3).fill(0).map(() => `
        <div class="sk-post" style="margin:12px 16px 0;">
          <div class="sk-post-header" style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <div class="sk-item sk-avatar"></div>
            <div class="sk-item sk-name" style="width:100px;height:14px;"></div>
            <div class="sk-item sk-time" style="margin-left:auto;"></div>
          </div>
          <div class="sk-item sk-title"></div>
          <div style="height:10px;"></div>
          <div class="sk-item sk-line"></div>
          <div class="sk-item sk-line"></div>
          <div class="sk-item sk-line short" style="width:60%;"></div>
          <div class="sk-actions" style="display:flex;justify-content:space-around;padding-top:12px;">
            <div class="sk-item sk-action"></div>
            <div class="sk-item sk-action"></div>
            <div class="sk-item sk-action"></div>
          </div>
        </div>
      `).join('');
      return `<div class="page">${renderNavbar('发现', false)}
        <div class="tabs" id="discoverTabs" style="display:flex;background:#fff;padding:10px 0;border-bottom:0.5px solid #eee;">
          <div class="tab active" data-tab="hot" style="flex:1;text-align:center;font-weight:600;color:#333;">热门</div>
          <div class="tab" data-tab="confession" style="flex:1;text-align:center;font-weight:600;color:#999;">表白墙</div>
          <div class="tab" data-tab="homework" style="flex:1;text-align:center;font-weight:600;color:#999;">作业</div>
          <div class="tab" data-tab="topic" style="flex:1;text-align:center;font-weight:600;color:#999;">话题</div>
        </div>
        <div style="margin:12px 16px 0;background:linear-gradient(135deg,#1C1C1E,#2C2C2E);border-radius:14px;padding:16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;" onclick="goPage('verifSubscribe')">
          <div style="display:flex;align-items:center;gap:10px;">
            <img src="${MEDIA_BASE}/res/icons/icon-jztvozsrv.svg" style="width:40px;height:40px;" alt="认证">
            <div>
              <div style="font-size:15px;font-weight:700;color:#fff;">认证中心</div>
              <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:2px;">解锁创作者专属特权</div>
            </div>
          </div>
          <i class="fa-solid fa-chevron-right" style="color:rgba(255,255,255,0.3);font-size:14px;"></i>
        </div>
        <div id="discoverContent">${skeletonCards}</div>
      </div>`;
    }

    function bindDiscoverEvents() {
      document.querySelectorAll('#discoverTabs .tab').forEach(tab => {
        tab.onclick = () => {
          if ((tab.dataset.tab === 'hot' || tab.dataset.tab === 'topic' || tab.dataset.tab === 'homework') && !getToken()) {
            showLoginModal();
            return;
          }
          document.querySelectorAll('#discoverTabs .tab').forEach(t => t.style.color='#999');
          tab.style.color='#333';
          loadDiscoverContent(tab.dataset.tab);
        };
      });
      loadDiscoverContent('hot');
    }

    async function loadDiscoverContent(tab) {
      const content = document.getElementById('discoverContent');
      content.innerHTML = '<div style="padding:16px;"><div class="sk-item" style="height:120px;margin-bottom:10px;"></div><div class="sk-item" style="height:14px;margin-bottom:8px;"></div><div class="sk-item" style="height:14px;margin-bottom:8px;"></div><div class="sk-item" style="height:14px;width:60%;"></div></div>';
      try {
        if (tab === 'hot') {
          const res = await api('/hotPosts');
          if (res.code === 0 && res.msg === '未登录') {
            content.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#999;"><i class="fa-solid fa-lock" style="font-size:32px;margin-bottom:12px;display:block;"></i>登录后查看热门</div>';
          } else {
            content.innerHTML = (res.data && res.data.length) ? res.data.map(renderPostCard).join('') : '<div class="empty">暂无热门</div>';
            setTimeout(refreshCardExpandButtons, 0);
          }
        } else if (tab === 'confession') {
          const res = await api('/confessionList?page=1&size=20');
          let listHtml = '';
          if (res.data && res.data.length > 0) {
            listHtml = res.data.map(renderConfessionCard).join('');
          } else {
            listHtml = '<div style="text-align:center;padding:60px 20px;color:#999;">暂无表白，来发布第一条吧</div>';
          }
          if (res.limited && !getToken()) {
            listHtml += '<div style="text-align:center;padding:20px;color:#999;font-size:13px;"><i class="fa-solid fa-lock"></i> 登录查看更多内容</div>';
          } else if (res.limited) {
            listHtml += '<div style="text-align:center;padding:20px;color:#ccc;font-size:13px;">— 没有更多了 —</div>';
          }
          content.innerHTML = `
            <div style="padding:12px 16px;">
              <button onclick="openConfessionModal()" style="width:100%;height:44px;background:var(--color-primary);color:#fff;border:none;border-radius:22px;font-size:15px;font-weight:600;cursor:pointer;">
                <i class="fa-solid fa-pen-to-square"></i> 发布表白
              </button>
            </div>
            ${listHtml}
          `;
          content.innerHTML += `<div class="modal-overlay" id="confessionModal" onclick="if(event.target===this)closeConfessionModal()">
            <div class="modal-content" style="max-height:85vh;overflow-y:auto;">
              <div class="modal-handler"></div>
              <div style="font-weight:600;font-size:16px;margin-bottom:12px;">发布表白</div>
              <textarea id="confessionContent" style="width:100%;min-height:120px;border:1px solid #eee;border-radius:8px;padding:12px;font-size:15px;resize:none;" placeholder="写下你的表白..."></textarea>
              <div style="display:flex;align-items:center;gap:8px;margin-top:12px;font-size:14px;">
                <input type="checkbox" id="confessionAnonymous" style="width:18px;height:18px;accent-color:var(--color-primary);" onchange="toggleConfessionWarning()">
                <span>匿名发布</span>
              </div>
              <div id="confessionWarning" style="display:none;margin-top:12px;padding:12px;background:var(--color-red-light);border-radius:8px;font-size:13px;color:var(--color-red);line-height:1.6;">
                <div style="font-weight:600;margin-bottom:4px;">⚠️ 匿名发布须知</div>
                <div>• 请遵守平台社区准则及相关法律法规</div>
                <div>• 不得发布违法、违规、色情、暴力、侮辱性内容</div>
                <div>• 不得侵犯他人隐私或恶意诽谤</div>
                <div>• 违规发布将被封禁账号，情节严重者将追究法律责任</div>
              </div>
              <button onclick="submitConfession()" style="width:100%;height:48px;background:var(--color-primary);color:#fff;border-radius:12px;font-weight:600;margin-top:16px;">发布</button>
            </div>
          </div>`;
        } else if (tab === 'topic') {
          const res = await api('/topics');
          if (res.code === 0 && res.msg === '未登录') {
            content.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#999;"><i class="fa-solid fa-lock" style="font-size:32px;margin-bottom:12px;display:block;"></i>登录后查看话题</div>';
          } else {
            const topicList = res.data || [];
            if (topicList.length === 0) {
              content.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#999;">暂无话题</div>';
            } else {
              content.innerHTML = '<div style="background:#fff;">' + topicList.map(t => `
                <div class="topic-list-item" onclick="goTopicDetail('${escapeHtml(t.topic)}')" style="display:flex;align-items:center;padding:14px 16px;border-bottom:0.5px solid #f0f0f0;cursor:pointer;">
                  <span style="flex:1;font-size:15px;color:#333;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">#${escapeHtml(t.topic)}</span>
                  <div style="display:flex;align-items:center;color:#999;font-size:13px;margin-left:12px;">
                    <i class="fa-regular fa-eye" style="margin-right:4px;font-size:14px;"></i>
                    <span>${formatNumber(t.views || 0)}</span>
                  </div>
                </div>
              `).join('') + '</div>';
            }
          }
        } else if (tab === 'homework') {
          const subjects = ['全部', '语文', '数学', '英语', '物理', '化学', '其它'];
          content.innerHTML = `
            <div class="homework-subject-bar" style="display:flex;gap:8px;padding:10px 16px;background:#fff;overflow-x:auto;border-bottom:0.5px solid #eee;">
              ${subjects.map((s, i) => `<div class="hw-subject-item ${i===0?'active':''}" data-subject="${s}" style="padding:6px 16px;background:${i===0?'var(--color-primary)':'#f5f5f5'};color:${i===0?'#fff':'#666'};border-radius:16px;font-size:13px;white-space:nowrap;cursor:pointer;">${s}</div>`).join('')}
            </div>
            <div style="padding:12px 16px;">
              <button onclick="openHomeworkModal()" style="width:100%;height:44px;background:var(--color-primary);color:#fff;border:none;border-radius:22px;font-size:15px;font-weight:600;cursor:pointer;">
                <i class="fa-solid fa-cloud-arrow-up"></i> 上传作业
              </button>
            </div>
            <div id="homeworkList"></div>
            <div class="modal-overlay" id="homeworkModal" onclick="if(event.target===this)closeHomeworkModal()">
              <div class="modal-content" style="max-height:90vh;overflow-y:auto;box-sizing:border-box;">
                <div class="modal-handler"></div>
                <div style="font-weight:600;font-size:16px;margin-bottom:12px;">上传作业</div>
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:12px;border-bottom:0.5px solid #f0f0f0;">
                  <img id="hwModalAvatar" src="${resolveMediaUrl(myAvatar) || DEFAULT_AVATAR}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">
                  <div style="font-size:15px;font-weight:600;color:#333;">${currentNickname || '用户'}</div>
                </div>
                <div style="margin-bottom:12px;font-size:14px;color:#666;">选择科目</div>
                <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
                  ${subjects.filter(s=>s!=='全部').map((s, i) => `<div class="hw-subject-select ${i===0?'active':''}" data-subject="${s}" style="padding:6px 14px;background:${i===0?'var(--color-primary)':'#f5f5f5'};color:${i===0?'#fff':'#666'};border-radius:14px;font-size:13px;cursor:pointer;">${s}</div>`).join('')}
                </div>
                <div style="margin-bottom:12px;font-size:14px;color:#666;">作业描述</div>
                <textarea id="homeworkContent" style="width:100%;min-height:80px;border:1px solid #eee;border-radius:8px;padding:12px;font-size:15px;resize:none;" placeholder="简单描述一下作业内容..."></textarea>
                <div style="margin-top:12px;margin-bottom:8px;font-size:14px;color:#666;">上传图片（最多15张）</div>
                <div id="homeworkImgPreview" class="create-media-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;"></div>
                <input type="file" id="homeworkImgInput" accept="image/*" multiple style="display:none;" onchange="handleHomeworkImgUpload(this.files); this.value=''">
                <button id="hwPublishBtn" onclick="submitHomework()" style="width:100%;height:48px;background:var(--color-primary);color:#fff;border:none;border-radius:12px;font-weight:600;margin-top:20px;">发布</button>
              </div>
            </div>
          `;
          document.querySelectorAll('.hw-subject-item').forEach(item => {
            item.onclick = () => {
              document.querySelectorAll('.hw-subject-item').forEach(i => {
                i.style.background = '#f5f5f5';
                i.style.color = '#666';
                i.classList.remove('active');
              });
              item.style.background = 'var(--color-primary)';
              item.style.color = '#fff';
              item.classList.add('active');
              loadHomeworkList(item.dataset.subject);
            };
          });
          document.querySelectorAll('.hw-subject-select').forEach(item => {
            item.onclick = () => {
              document.querySelectorAll('.hw-subject-select').forEach(i => {
                i.style.background = '#f5f5f5';
                i.style.color = '#666';
                i.classList.remove('active');
              });
              item.style.background = 'var(--color-primary)';
              item.style.color = '#fff';
              item.classList.add('active');
            };
          });
          loadHomeworkList('全部');
        }
      } catch (e) {
        content.innerHTML = '<div class="network-error">网络异常</div>';
      }
    }

    function renderAuth() {
      return `<div class="auth-container">
        <div class="auth-title">欢迎登录</div>
        <div class="auth-subtitle">若您没有赞话账号，我们将会为您自动创建赞话账号</div>
        <div class="auth-input-group"><input id="authPhone" type="tel" maxlength="11" placeholder="请输入手机号"></div>
        <div class="tip-text" id="tipPhone"></div>
        <div class="auth-input-group" style="padding-right:0;">
          <input id="authCode" type="text" maxlength="6" placeholder="验证码">
          <button class="btn-code" id="sendCodeBtn">获取验证码</button>
        </div>
        <div class="tip-text" id="tipCode"></div>
        <div class="auth-agreement" style="display:flex;align-items:flex-start;gap:8px;line-height:1.6;"><input type="checkbox" id="agreeTerms" style="margin-top:2px;flex-shrink:0;"> <span style="flex:1;">我已阅读并同意<span class="agreement-link" onclick="navigateTo('agreement')" style="color:var(--color-primary);cursor:pointer;">《赞话用户服务协议》</span>、<span class="agreement-link" onclick="navigateTo('privacy')" style="color:var(--color-primary);cursor:pointer;">《赞话用户隐私政策》</span>及<span class="agreement-link" onclick="navigateTo('minorPrivacy')" style="color:var(--color-primary);cursor:pointer;">《赞话未成年人（含儿童）隐私政策》</span></span></div>
        <div class="tip-text" id="tipAgreement"></div>
        <button class="auth-btn" id="btnLogin">登录 / 注册</button>
        <div id="captchaBox"></div>
      </div>`;
    }

    let captchaSdkPromise = null;
    function ensureCaptchaSdk() {
      if (typeof window.initAliyunCaptcha === 'function') return Promise.resolve();
      if (captchaSdkPromise) return captchaSdkPromise;
      captchaSdkPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js';
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => { captchaSdkPromise = null; reject(new Error('captcha sdk load failed')); };
        document.head.appendChild(s);
      });
      return captchaSdkPromise;
    }

    function initCaptchaIfNeeded() {
      if (captchaIns) return;
      ensureCaptchaSdk().then(function() {
        if (captchaIns) return;
        if (typeof window.initAliyunCaptcha !== 'function') return;
        window.initAliyunCaptcha({
        SceneId: "eh5it1ar",
        mode: "popup",
        element: "#captchaBox",
        language: "cn",
        timeout: 10000,
        getInstance: function(ins) {
          captchaIns = ins;
        },
        captchaVerifyCallback: captchaVerifyCallback,
        onBizResultCallback: onBizResultCallback
      });
      });
    }

    function bindAuthEvents() {
      document.getElementById('sendCodeBtn')?.addEventListener('click', handleSendCode);
      document.getElementById('btnLogin')?.addEventListener('click', handleAuth);
    }

    function captchaVerifyCallback(param) {
      if (captchaRequestLock) return Promise.resolve({ captchaResult: false, bizResult: false });
      captchaRequestLock = true;
      const phone = document.getElementById('authPhone').value.trim();
      return fetch(API_BASE + '/sendSms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, captchaVerifyParam: param })
      }).then(function(res) {
        return res.json();
      }).then(function(data) {
        captchaRequestLock = false;
        if (data.code === 1) return { captchaResult: true, bizResult: true };
        else {
          document.getElementById('tipCode').textContent = data.msg || '发送失败';
          return { captchaResult: false, bizResult: false };
        }
      }).catch(function() {
        captchaRequestLock = false;
        document.getElementById('tipCode').textContent = '网络异常';
        return { captchaResult: false, bizResult: false };
      });
    }

    function onBizResultCallback(bizResult) {
      if (bizResult) startCountDown();
    }

    function startCountDown() {
      codeTimer = 60;
      const btn = document.getElementById('sendCodeBtn');
      btn.disabled = true;
      btn.textContent = codeTimer + 's后重发';
      const timer = setInterval(() => {
        codeTimer--;
        btn.textContent = codeTimer + 's后重发';
        if (codeTimer <= 0) {
          clearInterval(timer);
          btn.disabled = false;
          btn.textContent = '获取验证码';
        }
      }, 1000);
    }

    function handleSendCode() {
      const phone = document.getElementById('authPhone').value.trim();
      document.getElementById('tipPhone').textContent = '';
      document.getElementById('tipCode').textContent = '';
      if (!/^1\d{10}$/.test(phone)) {
        document.getElementById('tipPhone').textContent = '请输入正确的手机号';
        return;
      }
      if (captchaIns) captchaIns.show();
      else showToast('验证组件加载中，请稍后');
    }

    async function handleAuth() {
      const phone = document.getElementById('authPhone').value.trim();
      const code = document.getElementById('authCode').value.trim();
      const agree = document.getElementById('agreeTerms').checked;
      document.getElementById('tipPhone').textContent = '';
      document.getElementById('tipCode').textContent = '';
      document.getElementById('tipAgreement').textContent = '';
      if (!/^1\d{10}$/.test(phone)) {
        document.getElementById('tipPhone').textContent = '请输入正确的手机号';
        return;
      }
      if (!code) {
        document.getElementById('tipCode').textContent = '请输入验证码';
        return;
      }
      if (!agree) {
        document.getElementById('tipAgreement').textContent = '请阅读并勾选同意《用户服务协议》《隐私政策》《未成年人隐私政策》';
        return;
      }
      try {
        const res = await api('/auth', 'POST', { phone, code });
        if (res.code === 1) {
          setToken(res.data.token);
          showToast('登录成功');
          goPage('home');
        } else {
          showToast(res.msg || '登录失败');
        }
      } catch (e) {
        showToast('网络异常，请重试');
      }
    }

    function showLoginModal() {
      document.getElementById('loginModal').classList.add('active');
      document.getElementById('loginTipPhone').textContent = '';
      document.getElementById('loginTipCode').textContent = '';
      document.getElementById('loginTipAgreement').textContent = '';
      document.getElementById('loginAuthPhone').value = '';
      document.getElementById('loginAuthCode').value = '';
      initLoginCaptchaIfNeeded();
    }

    function hideLoginModal() {
      document.getElementById('loginModal').classList.remove('active');
    }
    function openAgreementFromLogin(page) {
      hideLoginModal();
      pageHistory.push(currentPage);
      prevPage = currentPage;
      currentPage = page;
      setTabbarVisible(false);
      try {
        history.pushState({ page: page }, '', '#' + page);
      } catch(e) {}
      window.scrollTo(0, 0);
      render();
      updateTabbar();
    }

    function initLoginCaptchaIfNeeded() {
      if (loginCaptchaIns) return;
      ensureCaptchaSdk().then(function() {
        if (loginCaptchaIns) return;
        if (typeof window.initAliyunCaptcha !== 'function') return;
        window.initAliyunCaptcha({
        SceneId: "eh5it1ar",
        mode: "popup",
        element: "#loginCaptchaBox",
        language: "cn",
        timeout: 10000,
        getInstance: function(ins) {
          loginCaptchaIns = ins;
        },
        captchaVerifyCallback: loginCaptchaVerifyCallback,
        onBizResultCallback: loginOnBizResultCallback
      });
      });
    }

    function loginCaptchaVerifyCallback(param) {
      if (loginCaptchaRequestLock) return Promise.resolve({ captchaResult: false, bizResult: false });
      loginCaptchaRequestLock = true;
      const phone = document.getElementById('loginAuthPhone').value.trim();
      return fetch(API_BASE + '/sendSms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, captchaVerifyParam: param })
      }).then(function(res) {
        return res.json();
      }).then(function(data) {
        loginCaptchaRequestLock = false;
        if (data.code === 1) return { captchaResult: true, bizResult: true };
        else {
          document.getElementById('loginTipCode').textContent = data.msg || '发送失败';
          return { captchaResult: false, bizResult: false };
        }
      }).catch(function() {
        loginCaptchaRequestLock = false;
        document.getElementById('loginTipCode').textContent = '网络异常';
        return { captchaResult: false, bizResult: false };
      });
    }

    function loginOnBizResultCallback(bizResult) {
      if (bizResult) loginStartCountDown();
    }

    function loginStartCountDown() {
      codeTimer = 60;
      const btn = document.getElementById('loginSendCodeBtn');
      btn.disabled = true;
      btn.textContent = codeTimer + 's后重发';
      const timer = setInterval(() => {
        codeTimer--;
        btn.textContent = codeTimer + 's后重发';
        if (codeTimer <= 0) {
          clearInterval(timer);
          btn.disabled = false;
          btn.textContent = '获取验证码';
        }
      }, 1000);
    }

    function handleLoginSendCode() {
      const phone = document.getElementById('loginAuthPhone').value.trim();
      document.getElementById('loginTipPhone').textContent = '';
      document.getElementById('loginTipCode').textContent = '';
      if (!/^1\d{10}$/.test(phone)) {
        document.getElementById('loginTipPhone').textContent = '请输入正确的手机号';
        return;
      }
      if (loginCaptchaIns) loginCaptchaIns.show();
      else showToast('验证组件加载中，请稍后');
    }

    async function handleLoginAuth() {
      const phone = document.getElementById('loginAuthPhone').value.trim();
      const code = document.getElementById('loginAuthCode').value.trim();
      const agree = document.getElementById('loginAgreeTerms').checked;
      document.getElementById('loginTipPhone').textContent = '';
      document.getElementById('loginTipCode').textContent = '';
      document.getElementById('loginTipAgreement').textContent = '';
      if (!phone) {
        document.getElementById('loginTipPhone').textContent = '请输入手机号';
        return;
      }
      if (!code) {
        document.getElementById('loginTipCode').textContent = '请输入验证码';
        return;
      }
      if (!agree) {
        document.getElementById('loginTipAgreement').textContent = '请阅读并勾选同意《用户服务协议》《隐私政策》《未成年人隐私政策》';
        return;
      }
      try {
        const res = await api('/auth', 'POST', { phone, code });
        if (res.code === 1) {
          setToken(res.data.token);
          currentUsername = res.data.phone || '';
          currentNickname = res.data.nickname || '';
          showToast('登录成功');
          hideLoginModal();
          if(currentPage === 'createPost') {
            goPage('home');
          } else {
            goPage('home');
            loadPosts(true);
          }
        } else {
          showToast(res.msg || '登录失败');
        }
      } catch (e) {
        showToast('网络异常，请重试');
      }
    }

    function bindLoginEvents() {
      document.getElementById('loginSendCodeBtn')?.addEventListener('click', handleLoginSendCode);
      document.getElementById('loginBtn')?.addEventListener('click', handleLoginAuth);
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindLoginEvents);
    } else {
      bindLoginEvents();
    }

    let _wmResizeTimer = null;
    window.addEventListener('resize', function() {
      if (_wmResizeTimer) clearTimeout(_wmResizeTimer);
      _wmResizeTimer = setTimeout(function() {
        updateScreenWatermark();
      }, 300);
    });

    function goPostDetail(id) {
      if (!getToken()) { showLoginModal(); return; }
      if (!id || id === 'undefined') {
        showToast('帖子ID异常');
        return;
      }
      const dismissed = localStorage.getItem('zanhua_protected_post_dismissed') === '1';
      if (!dismissed) {
        api('/postDetail?id=' + encodeURIComponent(id)).then(r => {
          if (r.needLogin) { showLoginModal(); return; }
          if (r.code === 1 && r.data && r.data.watermark_protected == 1 && r.data.user_id !== getUid()) {
            showProtectedPostWarning(id);
          } else if (r.code === 1) {
            _goPostDetailDirect(id);
          } else {
            showToast(r.msg || '加载失败');
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
      currentPage = 'postDetail';
      setTabbarVisible(false);
      try { history.pushState({ page: 'postDetail' }, '', '#postDetail'); } catch(e) {}
      api('/postDetail?id=' + encodeURIComponent(id)).then(r => {
        if (r.code === 1) {
          currentPostDetail = r.data;
          try {
            window.scrollTo(0, 0);
            render();
            updateTabbar();
          } catch (renderErr) {
            console.error('render postDetail error:', renderErr);
            pageHistory.pop();
            currentPage = prevPage;
            showToast('加载失败，请稍后重试');
          }
        } else {
          showToast(r.msg || '加载失败');
        }
      }).catch(e => {
        console.error('goPostDetail error:', e);
        showToast(e.message || '网络异常，请稍后重试');
      });
    }

    function showProtectedPostWarning(postId) {
      const existing = document.getElementById('protectedPostWarnOverlay');
      if (existing) existing.remove();
      const overlay = document.createElement('div');
      overlay.id = 'protectedPostWarnOverlay';
      overlay.className = 'modal-overlay active';
      overlay.style.alignItems = 'center';
      overlay.style.zIndex = '500';
      overlay.innerHTML = `<div class="modal-content" style="border-radius:20px;max-width:340px;width:90%;padding:28px 24px;text-align:center;">
        <div style="width:56px;height:56px;margin:0 auto 16px;background:rgba(245,158,11,0.12);border-radius:50%;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-shield-halved" style="font-size:24px;color:#f59e0b;"></i></div>
        <div style="font-size:17px;font-weight:700;margin-bottom:12px;">该帖子受内容保护</div>
        <div style="font-size:14px;color:#666;line-height:1.7;margin-bottom:20px;text-align:left;">
          本帖子已开启内容保护，页面内嵌有暗码水印技术。任何截图均携带可溯源的数字水印信息，平台可通过水印追踪到截图来源用户。<br><br>
          <strong style="color:#e53e3e;">违规处罚：</strong>未经授权截图传播受保护内容的用户，一经溯源核实，账号将被<strong style="color:#e53e3e;">永久封禁</strong>，同时禁止登录及接收新帖子。
        </div>
        <div style="display:flex;gap:12px;">
          <button id="protectedWarnDontShow" style="flex:1;padding:12px;border:1.5px solid #ddd;border-radius:10px;background:#fff;color:#666;font-size:14px;font-weight:600;cursor:not-allowed;opacity:0.5;" disabled>不再提示(10s)</button>
          <button id="protectedWarnConfirm" style="flex:1;padding:12px;border:none;border-radius:10px;background:#ccc;color:#fff;font-size:14px;font-weight:600;cursor:not-allowed;" disabled>确定(10s)</button>
        </div>
      </div>`;
      document.body.appendChild(overlay);
      document.body.style.overflow = 'hidden';
      let countdown = 10;
      const confirmBtn = overlay.querySelector('#protectedWarnConfirm');
      const dontShowBtn = overlay.querySelector('#protectedWarnDontShow');
      const timer = setInterval(() => {
        countdown--;
        if (countdown > 0) {
          confirmBtn.textContent = '确定(' + countdown + 's)';
          dontShowBtn.textContent = '不再提示(' + countdown + 's)';
        } else {
          clearInterval(timer);
          confirmBtn.textContent = '确定';
          confirmBtn.style.background = 'var(--color-primary)';
          confirmBtn.style.cursor = 'pointer';
          confirmBtn.disabled = false;
          dontShowBtn.textContent = '不再提示';
          dontShowBtn.style.borderColor = 'var(--color-primary)';
          dontShowBtn.style.color = 'var(--color-primary)';
          dontShowBtn.style.cursor = 'pointer';
          dontShowBtn.disabled = false;
        }
      }, 1000);
      confirmBtn.onclick = () => {
        if (confirmBtn.disabled) return;
        clearInterval(timer);
        overlay.remove();
        document.body.style.overflow = '';
        _goPostDetailDirect(postId);
      };
      dontShowBtn.onclick = () => {
        if (dontShowBtn.disabled) return;
        clearInterval(timer);
        localStorage.setItem('zanhua_protected_post_dismissed', '1');
        overlay.remove();
        document.body.style.overflow = '';
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
      if (!getToken()) { showLoginModal(); return; }
      pageHistory.push(currentPage);
      prevPage = currentPage;
      currentPage = 'topicDetail';
      setTabbarVisible(false);
      try { history.pushState({ page: 'topicDetail' }, '', '#topicDetail'); } catch(e) {}
      api('/topicDetail?name=' + encodeURIComponent(name) + '&page=1&size=10').then(r => {
        if (r.code === 1) {
          currentTopicDetail = r.data.topic;
          topicPosts = r.data.posts || [];
          topicPage = 2;
          topicNoMore = topicPosts.length < 10;
          try {
            window.scrollTo(0, 0);
            render();
            updateTabbar();
          } catch (renderErr) {
            console.error('render topicDetail error:', renderErr);
            pageHistory.pop();
            currentPage = prevPage;
            showToast('加载失败，请稍后重试');
          }
        } else {
          showToast(r.msg || '话题不存在');
        }
      }).catch(() => {
        showToast('加载失败');
      });
    }

    function renderTopicDetail() {
      if (!currentTopicDetail) return '<div style="padding:40px;text-align:center;">话题不存在</div>';
      const t = currentTopicDetail;
      return `<div class="page" style="padding-bottom:0;">
        <div class="navbar" style="position:sticky;top:0;z-index:100;background:#fff;">
          <div onclick="goBack()" style="font-size:22px;cursor:pointer;color:#333;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div>
          <h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">话题详情</h1>
          <div style="width:28px;"></div>
        </div>
        <div style="background:#fff;padding:20px 16px;border-bottom:0.5px solid #eee;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div style="width:48px;height:48px;border-radius:12px;background:var(--color-primary-light);display:flex;align-items:center;justify-content:center;">
              <i class="fa-solid fa-hashtag" style="font-size:24px;color:var(--color-primary);"></i>
            </div>
            <div style="flex:1;">
              <div style="font-size:18px;font-weight:700;color:#333;">#${escapeHtml(t.name)}#</div>
              <div style="font-size:12px;color:#999;margin-top:2px;">${formatNumber(t.views)} 浏览 · ${formatNumber(t.post_count)} 条帖子</div>
            </div>
          </div>
          <div style="display:flex;gap:10px;">
            <button onclick="goCreatePostWithTopic('${escapeHtml(t.name)}')" style="flex:1;height:36px;background:var(--color-primary);color:#fff;border:none;border-radius:18px;font-size:14px;font-weight:500;cursor:pointer;">
              <i class="fa-solid fa-pen-to-square"></i> 参与话题
            </button>
          </div>
        </div>
        <div id="topicPostList"></div>
        <div class="loading" id="topicLoadMore" style="display:none;text-align:center;padding:20px;color:#999;">加载中...</div>
        <div id="topicNoMoreTip" style="display:none;text-align:center;padding:20px;color:#ccc;font-size:13px;">— 没有更多了 —</div>
        <div style="height:20px;"></div>
      </div>`;
    }

    async function bindTopicDetailEvents() {
      if (!currentTopicDetail) return;
      const list = document.getElementById('topicPostList');
      if (list) {
        list.innerHTML = topicPosts.length ? topicPosts.map(renderPostCard).join('') : '<div style="text-align:center;padding:60px 20px;color:#999;">该话题暂无帖子，快来发布第一条吧</div>';
      }
      window.onscroll = () => {
        if (currentPage !== 'topicDetail') return;
        if (topicNoMore || topicLoading) return;
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 200) loadTopicPosts();
      };
      const noMoreEl = document.getElementById('topicNoMoreTip');
      if (noMoreEl) noMoreEl.style.display = topicNoMore && topicPosts.length > 0 ? 'block' : 'none';
    }

    async function loadTopicPosts() {
      if (topicLoading || topicNoMore || !currentTopicDetail) return;
      topicLoading = true;
      const el = document.getElementById('topicLoadMore');
      if (el) el.style.display = 'block';
      try {
        const res = await api('/topicDetail?name=' + encodeURIComponent(currentTopicDetail.name) + '&page=' + topicPage + '&size=10');
        if (el) el.style.display = 'none';
        const list = (res.data && res.data.posts) ? res.data.posts : [];
        if (list.length > 0) {
          topicPosts = [...topicPosts, ...list];
          const postList = document.getElementById('topicPostList');
          if (postList) {
            const newHtml = list.map(renderPostCard).join('');
            postList.insertAdjacentHTML('beforeend', newHtml);
          }
        }
        if (list.length < 10) {
          topicNoMore = true;
          const noMoreEl = document.getElementById('topicNoMoreTip');
          if (noMoreEl && topicPosts.length > 0) noMoreEl.style.display = 'block';
        } else {
          topicPage++;
        }
      } catch (e) {
        if (el) el.style.display = 'none';
      }
      topicLoading = false;
    }

    function goCreatePostWithTopic(topicName) {
      if (!getToken()) { showLoginModal(); return; }
      createContent = '#' + topicName + '# ';
      goPage('createPost');
      setTimeout(() => {
        const ta = document.getElementById('createBody');
        if (ta) {
          ta.value = createContent;
          document.getElementById('createCharCount').textContent = ta.value.length;
        }
      }, 100);
    }

    function renderMessage() {
      if (!getToken()) {
        showLoginModal();
        return `<div class="page">${renderNavbar('消息',false)}<div class="empty" style="text-align:center;padding:40px;">请先登录</div></div>`;
      }
      const chatSkel = new Array(4).fill(0).map(() => `
        <div style="display:flex;align-items:center;padding:12px 16px;border-bottom:0.5px solid #f0f0f0;background:#ffffff !important;background-color:#ffffff !important;box-sizing:border-box;width:100%;">
          <div class="sk-item" style="width:44px;height:44px;border-radius:50%;flex-shrink:0;"></div>
          <div style="flex:1;margin-left:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <div class="sk-item" style="width:90px;height:15px;"></div>
              <div class="sk-item" style="width:40px;height:11px;"></div>
            </div>
            <div class="sk-item" style="width:75%;height:12px;"></div>
          </div>
        </div>
      `).join('');
      return `<div class="page">${renderNavbar('消息',false)}
        <div class="msg-func-row">
          <div class="msg-func-item" onclick="goPage('notificationLikes')">
            <div class="msg-func-icon-wrap">
              <div class="msg-func-icon" style="background:#FFEAEA;color:#ff2442;"><i class="fa-solid fa-heart"></i></div>
              <span id="likeBadge" class="msg-badge" style="display:none;"></span>
            </div>
            <div class="msg-func-label">赞和收藏</div>
          </div>
          <div class="msg-func-item" onclick="goPage('notificationFollows')">
            <div class="msg-func-icon-wrap">
              <div class="msg-func-icon" style="background:#E8F0FE;color:#1677ff;"><i class="fa-solid fa-user-plus"></i></div>
              <span id="followBadge" class="msg-badge" style="display:none;"></span>
            </div>
            <div class="msg-func-label">新增关注</div>
          </div>
          <div class="msg-func-item" onclick="goPage('notificationComments')">
            <div class="msg-func-icon-wrap">
              <div class="msg-func-icon" style="background:#E6F7EC;color:var(--color-primary);"><i class="fa-solid fa-comment-dots"></i></div>
              <span id="commentBadge" class="msg-badge" style="display:none;"></span>
            </div>
            <div class="msg-func-label">评论和@</div>
          </div>
        </div>
        <div id="chatList" style="margin-top:8px;">${chatSkel}</div>
      </div>`;
    }

    async function bindMessageEvents() {
      try {
        const [chatRes, countRes] = await Promise.all([api('/chatList'), api('/unreadCount')]);
        const list = document.getElementById('chatList');
        if (!list) return;
        if (!chatRes.data || chatRes.data.length === 0) {
          list.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">暂无消息</div>';
        } else {
          list.innerHTML = chatRes.data.map(c => {
            if (c.is_system) {
              return `
            <div class="chat-list-item" onclick="goChat('system')" style="display:flex;align-items:center;padding:12px 16px;border-bottom:0.5px solid #f0f0f0;cursor:pointer;background:#ffffff !important;background-color:#ffffff !important;box-sizing:border-box;width:100%;">
              <div style="width:44px;height:44px;border-radius:50%;flex-shrink:0;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;"><i class="fa-solid fa-bell"></i></div>
              <div style="flex:1;margin-left:12px;overflow:hidden;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span style="font-weight:600;font-size:15px;">系统消息</span>
                  <span style="font-size:12px;color:#999;">${c.lastTime ? timeAgo(c.lastTime) : ''}</span>
                </div>
                <div style="font-size:13px;color:#999;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;">${(c.lastMessage||'').replace(/\n/g,' ')}</div>
              </div>
              ${c.unread ? `<span style="background:#ff2442;color:#fff;font-size:11px;border-radius:10px;padding:2px 6px;margin-left:4px;">${c.unread}</span>` : ''}
            </div>`;
            }
            if (c.is_stranger_list) {
              return `
            <div class="chat-list-item" onclick="goStrangerList()" style="display:flex;align-items:center;padding:12px 16px;border-bottom:0.5px solid #f0f0f0;cursor:pointer;background:#ffffff !important;background-color:#ffffff !important;box-sizing:border-box;width:100%;">
              <div style="width:44px;height:44px;border-radius:50%;flex-shrink:0;background:linear-gradient(135deg,#f093fb,#f5576c);display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;"><i class="fa-solid fa-user-secret"></i></div>
              <div style="flex:1;margin-left:12px;overflow:hidden;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span style="font-weight:600;font-size:15px;">陌生人消息</span>
                  <span style="font-size:12px;color:#999;">${c.lastTime ? timeAgo(c.lastTime) : ''}</span>
                </div>
                <div style="font-size:13px;color:#999;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;">${c.type==='image'?'[图片]':c.type==='video'?'[视频]':(c.lastMessage||'')}</div>
              </div>
              ${c.unread ? `<span style="background:#ff2442;color:#fff;font-size:11px;border-radius:10px;padding:2px 6px;margin-left:4px;">${c.unread}</span>` : ''}
            </div>`;
            }
            return `
            <div class="chat-list-item" onclick="goChat('${c.otherUser}', ${c.is_anonymous ? 'true' : 'false'})" style="display:flex;align-items:center;padding:12px 16px;border-bottom:0.5px solid #f0f0f0;cursor:pointer;background:#ffffff !important;background-color:#ffffff !important;box-sizing:border-box;width:100%;">
              <img src="${c.is_anonymous ? DEFAULT_AVATAR : (resolveMediaUrl(c.avatar)||DEFAULT_AVATAR)}" style="width:44px;height:44px;border-radius:50%;flex-shrink:0;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">
              <div style="flex:1;margin-left:12px;overflow:hidden;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span style="font-weight:600;font-size:15px;">${c.nickname||'用户'+c.otherUser}${c.is_anonymous ? '<span style="margin-left:6px;padding:2px 6px;background:#f0f0f0;color:#999;border-radius:10px;font-size:11px;">匿名</span>' : ''}</span>
                  <span style="font-size:12px;color:#999;">${timeAgo(c.lastTime)}</span>
                </div>
                <div style="font-size:13px;color:#999;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;">${c.type==='image'?'[图片]':c.type==='video'?'[视频]':(c.lastMessage||'')}</div>
              </div>
            </div>`;
          }).join('');
        }
        if (countRes.code === 1 && countRes.data) {
          const { likeCount, followCount, commentCount } = countRes.data;
          updateAllBadges(likeCount, followCount, commentCount);
        }
      } catch(e) {
        const _cl = document.getElementById('chatList');
        if (_cl) _cl.innerHTML = '<div style="text-align:center;padding:20px;color:#999;">加载失败</div>';
      }
    }

    function updateBadge(id, count) {
      const el = document.getElementById(id);
      if (!el) return;
      if (count > 0) {
        el.style.display = 'flex';
        el.textContent = count > 99 ? '99+' : count;
      } else {
        el.style.display = 'none';
      }
    }

    function updateAllBadges(likeCount, followCount, commentCount) {
      updateBadge('likeBadge', likeCount);
      updateBadge('followBadge', followCount);
      updateBadge('commentBadge', commentCount);
      const total = (likeCount || 0) + (followCount || 0) + (commentCount || 0);
      unreadTotalCount = total;
      const tabbarBadge = document.querySelector('.tabbar-badge');
      if (tabbarBadge) {
        if (total > 0) {
          tabbarBadge.style.display = 'flex';
          tabbarBadge.textContent = total > 99 ? '99+' : total;
        } else {
          tabbarBadge.style.display = 'none';
        }
      }
    }

    function startBadgeRefresh() {
      if (badgeRefreshTimer) return;
      refreshBadges();
      badgeRefreshTimer = setInterval(refreshBadges, 15000);
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
        const res = await api('/unreadCount');
        if (res.code === 1 && res.data) {
          const { likeCount, followCount, commentCount } = res.data;
          updateAllBadges(likeCount, followCount, commentCount);
        }
      } catch(e) {}
    }

    let profileCurrentTab = 'posts';

    function renderProfile() {
      if (!getToken()) {
        showLoginModal();
        return `<div class="page">${renderNavbar('我的',false)}<div class="empty" style="text-align:center;padding:40px;">请先登录</div></div>`;
      }
      const gridSkel = new Array(6).fill(0).map(() => `
        <div class="profile-grid-item" style="background:#fff;">
          <div class="sk-item" style="width:100%;aspect-ratio:3/4;"></div>
          <div class="info" style="padding:6px 8px;">
            <div class="sk-item" style="width:85%;height:12px;margin-bottom:4px;"></div>
            <div class="sk-item" style="width:40%;height:10px;"></div>
          </div>
        </div>
      `).join('');
      return `<div class="page">
        <div class="profile-header">
          <div class="profile-top">
            <img id="myAvatar" class="sk-item profile-avatar" src="" style="width:60px;height:60px;border-radius:50%;cursor:pointer;" onclick="goUserProfile(getUid())">
            <div class="profile-info">
              <div id="myNickname" class="sk-item profile-name" style="width:120px;height:22px;margin-bottom:6px;"></div>
              <div id="myUid" class="sk-item profile-id" style="width:90px;height:12px;"></div>
            </div>
          </div>
          <div id="myBio" class="sk-item profile-bio" style="height:14px;width:70%;margin-bottom:10px;"></div>
          <div class="profile-stats">
            <div class="profile-stat" onclick="goFollowList(getUid())" style="cursor:pointer;"><span id="followsCount" class="sk-item num" style="width:30px;height:18px;display:inline-block;margin-bottom:4px;"></span><span class="label">关注</span></div>
            <div class="profile-stat" onclick="goPage('notificationFollows')" style="cursor:pointer;"><span id="fansCount" class="sk-item num" style="width:30px;height:18px;display:inline-block;margin-bottom:4px;"></span><span class="label">粉丝</span></div>
            <div class="profile-stat" onclick="goPage('notificationLikes')" style="cursor:pointer;"><span id="likesCount" class="sk-item num" style="width:40px;height:18px;display:inline-block;margin-bottom:4px;"></span><span class="label">获赞与收藏</span></div>
          </div>
        </div>
        <div style="display:flex;gap:8px;padding:0 16px 12px;background:#fff;">
          <button onclick="goPage('editProfile')" style="flex:1;padding:8px;background:#f5f5f5;border:none;border-radius:8px;font-size:14px;cursor:pointer;"><i class="fa-regular fa-pen-to-square"></i> 编辑资料</button>
          <button onclick="goPage('safetyCenter')" style="flex:1;padding:8px;background:#f5f5f5;border:none;border-radius:8px;font-size:14px;cursor:pointer;"><i class="fa-solid fa-shield-halved"></i> 账号安全</button>
          <button onclick="confirmLogout()" style="flex:1;padding:8px;background:#f5f5f5;border:none;border-radius:8px;font-size:14px;cursor:pointer;"><i class="fa-solid fa-arrow-right-from-bracket"></i> 退出登录</button>
        </div>
        <div class="profile-tabs">
          <div class="profile-tab ${profileCurrentTab==='posts'?'active':''}" onclick="switchProfileTab('posts')">帖子</div>
          <div class="profile-tab ${profileCurrentTab==='confession'?'active':''}" onclick="switchProfileTab('confession')">表白墙</div>
        </div>
        <div id="myProfileContent" class="profile-grid">${gridSkel}</div>
        ${renderLogoutConfirmModal()}
      </div>`;
    }

    function switchProfileTab(tab) {
      profileCurrentTab = tab;
      document.querySelectorAll('.profile-tabs .profile-tab').forEach(el => {
        el.classList.remove('active');
      });
      const activeTab = document.querySelector(`.profile-tabs .profile-tab:nth-child(${tab==='posts'?1:2})`);
      if (activeTab) activeTab.classList.add('active');
      loadMyProfileContent();
    }

    async function loadMyProfileContent() {
      const container = document.getElementById('myProfileContent');
      if (!container) return;
      const myUid = getUid();
      if (profileCurrentTab === 'posts') {
        try {
          const postRes = await api('/myPosts?page=1&size=20');
          if (postRes.code === 1 && postRes.data.length > 0) {
            container.className = 'profile-grid';
            container.innerHTML = postRes.data.map(p => {
              const imgs = p.images ? p.images.split(',').filter(x => x) : [];
              const hasVideo = p.video && p.video.length > 0;
              const cover = hasVideo ? resolveMediaUrl(p.video_cover || '') : resolveMediaUrl(imgs[0] || '');
              const isVideo = hasVideo && !imgs.length;
              const isTextOnly = !cover && !isVideo;
              const textPreview = escapeHtml(p.content || '').replace(/@\[\d+\]([^\s\[\]<]{1,30})/g, '@$1').slice(0, 80);
              let mediaHtml = '';
              if (isTextOnly) {
                mediaHtml = `<div class="pg-text-only" style="width:100%;aspect-ratio:3/4;background:#FAFAFA;position:relative;padding:10px 8px;box-sizing:border-box;border-radius:0 0 10px 10px;overflow:hidden;display:flex;flex-direction:column;">
                  <div style="font-size:10px;color:#999;font-weight:500;margin-bottom:6px;letter-spacing:0.2px;display:flex;align-items:center;gap:3px;"><i class="fa-regular fa-file-lines" style="font-size:9px;"></i>纯文本</div>
                  ${p.title ? `<div style="font-size:11px;color:#333;font-weight:600;line-height:1.4;margin-bottom:5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(p.title)}</div>` : ''}
                  <div style="flex:1;font-size:10px;color:#666;line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;">${textPreview}</div>
                </div>`;
              } else {
                mediaHtml = cover ? `<img src="${cover}" loading="lazy">` : `<div style="width:100%;aspect-ratio:3/4;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);display:flex;align-items:center;justify-content:center;font-size:24px;color:rgba(255,255,255,0.8);"><i class="fa-solid fa-video"></i></div>`;
              }
              return `<div class="profile-grid-item ${isTextOnly?'pg-item-text':''}" onclick="goPostDetail('${p.id}')">
                ${mediaHtml}
                <div class="info"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.title || (p.content||'').replace(/@\[\d+\]([^\s\[\]<]{1,30})/g, '@$1').slice(0,20)}</div><div style="color:#999;font-size:11px;margin-top:2px;"><i class="fa-regular fa-heart"></i> ${p.likes||0}</div></div>
              </div>`;
            }).join('');
          } else {
            container.className = '';
            container.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">还没有发过帖子</div>';
          }
        } catch(e) {
          container.className = '';
          container.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">加载失败</div>';
        }
      } else {
        try {
          const res = await api('/userConfessions?uid=' + myUid + '&page=1&size=20');
          if (res.code === 1 && res.data.length > 0) {
            container.className = '';
            container.style.padding = '8px 0';
            container.innerHTML = res.data.map(c => {
              const imgs = c.images ? c.images.split(',').filter(x => x) : [];
              const cover = imgs[0] || '';
              const hasImages = imgs.length > 0;
              return `<div class="card" onclick="goConfessionDetail(${c.id})" style="margin:0 8px 8px;">
                <div class="post-header" style="padding:10px 12px;">
                  <img class="avatar" src="${c.is_anonymous ? DEFAULT_AVATAR : (resolveMediaUrl(c.avatar)||DEFAULT_AVATAR)}" style="width:32px;height:32px;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">
                  <div class="post-user">
                    <div class="post-nickname" style="font-size:13px;">${c.is_anonymous ? '匿名用户' : (c.nickname || '用户'+c.user_id)}${c.is_anonymous ? '<span style="margin-left:4px;padding:1px 5px;background:#f0f0f0;color:#999;border-radius:8px;font-size:10px;">匿名</span>' : ''}${!c.is_anonymous ? renderListVerification(c) : ''}</div>
                    <div class="post-time" style="font-size:11px;">${timeAgo(c.create_time)}</div>
                  </div>
                </div>
                <div class="post-content" style="padding:0 12px 8px;font-size:13px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;height:78px;max-height:78px;box-sizing:content-box;">${escapeHtml(c.content||'').replace(/@\[\d+\]([^\s\[\]<]{1,30})/g, '@$1').replace(/\n/g,' ')}</div>
                ${hasImages ? `<div style="padding:0 12px 8px;"><img src="${resolveMediaUrl(cover)}" style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:6px;"></div>` : ''}
                <div class="post-actions" style="padding:6px 0 10px;font-size:12px;">
                  <div class="action-item"><i class="${c.liked ? 'fa-solid fa-heart' : 'fa-regular fa-heart'}" style="color:${c.liked ? 'var(--color-red)' : ''}"></i><span>${c.likes||0}</span></div>
                  <div class="action-item"><i class="fa-regular fa-comment"></i><span>${c.comment_count||0}</span></div>
                </div>
              </div>`;
            }).join('');
          } else {
            container.className = '';
            container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#999;">还没有发布过表白</div>';
          }
        } catch(e) {
          container.className = '';
          container.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">加载失败</div>';
        }
      }
    }

    async function bindProfileEvents() {
      try {
        const res = await api('/userInfo', 'POST');
        if (res.code === 1) {
          myAvatar = res.data.avatar || '';
          currentUsername = res.data.phone || '';
          currentNickname = res.data.nickname || '';
          myVerificationTypes = getVerificationTypes(res.data);
          myVerifications = Array.isArray(res.data.verifications) ? res.data.verifications : [];
          visibleWatermarkEnabled = localStorage.getItem('zanhua_visible_wm') === '1';
          const wmToggle = document.getElementById('visibleWmSwitch');
          if (wmToggle) {
            const canUseWm = myVerificationTypes.includes('advanced') || myVerificationTypes.includes('premium') || myVerificationTypes.includes('enterprise');
            const wmItem = document.getElementById('visibleWmItem');
            if (wmItem) wmItem.style.display = canUseWm ? 'flex' : 'none';
            wmToggle.checked = visibleWatermarkEnabled;
          }
          const myAvatarEl = document.getElementById('myAvatar');
          myAvatarEl.src = resolveMediaUrl(res.data.avatar) || DEFAULT_AVATAR;
          myAvatarEl.classList.remove('sk-item');
          const nickEl = document.getElementById('myNickname');
          if (nickEl) {
            nickEl.classList.remove('sk-item');
            nickEl.style.cssText = '';
            const verifBadge = renderListVerification(res.data);
            nickEl.innerHTML = (res.data.nickname || '用户'+res.data.uid) + (verifBadge || '');
          }
          const uidEl = document.getElementById('myUid');
          uidEl.classList.remove('sk-item');
          uidEl.style.cssText = '';
          uidEl.textContent = '赞话号: ' + res.data.uid;
          const bioEl = document.getElementById('myBio');
          bioEl.classList.remove('sk-item');
          bioEl.style.cssText = '';
          bioEl.textContent = res.data.bio || '这个人很懒，什么都没写';
          const profileVerifRows = renderProfileVerificationRows(res.data);
          if (profileVerifRows && bioEl) {
            const existing = document.getElementById('myProfileVerifRows');
            if (existing) existing.remove();
            const div = document.createElement('div');
            div.id = 'myProfileVerifRows';
            div.className = 'profile-verifications';
            div.style.cssText = 'padding:0 0 8px;background:#fff;';
            div.innerHTML = profileVerifRows;
            bioEl.parentNode.insertBefore(div, bioEl.nextSibling);
          }
          const profileRes = await api('/userProfile?uid=' + res.data.uid);
          if (profileRes.code === 1) {
            const fEl = document.getElementById('followsCount');
            fEl.classList.remove('sk-item'); fEl.style.cssText = '';
            fEl.textContent = profileRes.data.follows || 0;
            const faEl = document.getElementById('fansCount');
            faEl.classList.remove('sk-item'); faEl.style.cssText = '';
            faEl.textContent = profileRes.data.fans || 0;
            const lEl = document.getElementById('likesCount');
            lEl.classList.remove('sk-item'); lEl.style.cssText = '';
            lEl.textContent = profileRes.data.total_likes_collects || 0;
          }
        }
      } catch(e) {}
      loadMyProfileContent();
    }

    function logout() {
      localStorage.removeItem('zanhua_token');
      myAvatar = '';
      currentUsername = '';
      currentNickname = '';
      myVerificationTypes = [];
      myVerifications = [];
      visibleWatermarkEnabled = false;
      chatUserProfile = null;
      goPage('home');
    }

    window.toggleVisibleWatermark = function(enabled) {
      visibleWatermarkEnabled = !!enabled;
      localStorage.setItem('zanhua_visible_wm', visibleWatermarkEnabled ? '1' : '0');
      if (!visibleWatermarkEnabled) {
        const overlay = document.getElementById('visible-wm-overlay');
        if (overlay) overlay.remove();
      }
      
      const prevScroll = window.scrollY || 0;
      render();
      requestAnimationFrame(function() { window.scrollTo(0, prevScroll); });
      
      updateScreenWatermark();
      showToast(visibleWatermarkEnabled ? '满屏水印已开启' : '满屏水印已关闭');
    };

    let chatUserProfile = null;
    let isAnonymousChat = false;
    let currentConfessionChatId = null;

    let searchCurrentTab = 'all';

    function renderSearch() {
      return `<div class="search-page" style="background:#fff;min-height:100vh;">
        <div class="navbar" style="position:sticky;top:0;z-index:10;">
          <div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;width:40px;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div>
          <h1 style="flex:1;text-align:center;font-size:18px;font-weight:600;">搜索</h1>
          <div style="width:40px;"></div>
        </div>
        <div style="padding:12px 16px;">
          <div class="search-bar" style="display:flex;gap:10px;">
            <input class="search-input" id="searchInput" placeholder="搜索帖子或用户..." style="flex:1;background:#f2f2f2;border-radius:20px;padding:10px 16px;border:none;">
            <button class="btn" onclick="doSearch()" style="background:var(--color-primary);color:#fff;padding:8px 20px;border-radius:20px;border:none;font-weight:500;">搜索</button>
          </div>
        </div>
        <div class="search-tabs" style="display:flex;background:#fff;border-bottom:0.5px solid #eee;overflow-x:auto;">
          <div class="search-tab ${searchCurrentTab==='all'?'active':''}" data-tab="all" onclick="switchSearchTab('all')" style="flex:1;text-align:center;padding:10px;font-size:14px;color:#999;font-weight:500;white-space:nowrap;">全部</div>
          <div class="search-tab ${searchCurrentTab==='posts'?'active':''}" data-tab="posts" onclick="switchSearchTab('posts')" style="flex:1;text-align:center;padding:10px;font-size:14px;color:#999;font-weight:500;white-space:nowrap;">帖子</div>
          <div class="search-tab ${searchCurrentTab==='users'?'active':''}" data-tab="users" onclick="switchSearchTab('users')" style="flex:1;text-align:center;padding:10px;font-size:14px;color:#999;font-weight:500;white-space:nowrap;">用户</div>
          <div class="search-tab ${searchCurrentTab==='confession'?'active':''}" data-tab="confession" onclick="switchSearchTab('confession')" style="flex:1;text-align:center;padding:10px;font-size:14px;color:#999;font-weight:500;white-space:nowrap;">表白墙</div>
          <div class="search-tab ${searchCurrentTab==='topics'?'active':''}" data-tab="topics" onclick="switchSearchTab('topics')" style="flex:1;text-align:center;padding:10px;font-size:14px;color:#999;font-weight:500;white-space:nowrap;">话题</div>
          <div class="search-tab ${searchCurrentTab==='homework'?'active':''}" data-tab="homework" onclick="switchSearchTab('homework')" style="flex:1;text-align:center;padding:10px;font-size:14px;color:#999;font-weight:500;white-space:nowrap;">作业</div>
        </div>
        <div id="searchResult"></div>
      </div>`;
    }

    function switchSearchTab(tab) {
      searchCurrentTab = tab;
      document.querySelectorAll('.search-tab').forEach(t => {
        t.classList.remove('active');
        t.style.color = '#999';
      });
      const active = document.querySelector(`.search-tab[data-tab="${tab}"]`);
      if (active) {
        active.classList.add('active');
        active.style.color = '#333';
      }
      const keyword = document.getElementById('searchInput')?.value.trim();
      if (keyword) doSearch();
    }

    function bindSearchEvents() {
      const input = document.getElementById('searchInput');
      if (input) {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') doSearch();
        });
        input.focus();
      }
      document.querySelectorAll('.search-tab').forEach(tab => {
        tab.style.color = tab.classList.contains('active') ? '#333' : '#999';
      });
    }

    function renderSearchHomeworkCard(item) {
      const imgs = item.images ? item.images.split(',').filter(x => x).map(img => img.includes('/') ? img : '/uploads/homework/' + img) : [];
      const imgClass = imgs.length === 1 ? 'single' : '';
      let imagesHtml = '';
      if (imgs.length > 0 && imgs.length <= 9) {
        imagesHtml = `<div class="post-images ${imgClass}">${imgs.map(i=>`<img src="${resolveMediaUrl(i)}" onclick="event.stopPropagation();showFullImage('${i}')">`).join('')}</div>`;
      } else if (imgs.length > 9) {
        const first8 = imgs.slice(0, 8);
        const rest = imgs.slice(8);
        const restCount = imgs.length - 8;
        imagesHtml = `<div class="post-images">
          ${first8.map(i=>`<img src="${resolveMediaUrl(i)}" onclick="event.stopPropagation();showFullImage('${i}')">`).join('')}
          <div onclick="event.stopPropagation();showFullImage('${rest[0]}')" style="position:relative;aspect-ratio:1;border-radius:8px;overflow:hidden;cursor:pointer;border:0.5px solid rgba(0,0,0,0.08);box-sizing:border-box;">
            <div style="display:grid;grid-template-columns:repeat(3,1fr);width:100%;height:100%;">
              ${rest.slice(0,9).map(i=>`<img src="${resolveMediaUrl(i)}" style="width:100%;height:100%;aspect-ratio:1;object-fit:cover;border:none;">`).join('')}
            </div>
            <div style="position:absolute;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;">
              <span style="color:#fff;font-size:22px;font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,0.5);">+${restCount}</span>
            </div>
          </div>
        </div>`;
      }
      return `<div class="card" onclick="goHomeworkDetail(${item.id})">
        <div class="post-header">
          <img class="avatar" src="${resolveMediaUrl(item.avatar) || DEFAULT_AVATAR}" onclick="event.stopPropagation();goUserProfile('${item.user_id}')" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">
          <div class="post-user" onclick="event.stopPropagation();goUserProfile('${item.user_id}')" style="cursor:pointer;">
            <div class="post-nickname">${escapeHtml(item.nickname || '用户')}${renderListVerification(item)}</div>
            <div class="post-time">${timeAgo(item.create_time)} · ${item.province || '未知'}</div>
          </div>
        </div>
        <div style="padding:0 16px 6px;">
          <span style="display:inline-block;padding:2px 10px;background:var(--color-primary-light);color:var(--color-primary);border-radius:10px;font-size:12px;font-weight:500;">${escapeHtml(item.subject || '其它')}</span>
        </div>
        ${item.content ? `<div class="post-content">${escapeHtml(item.content).replace(/@\[\d+\]([^\s\[\]<]{1,30})/g, '@$1')}</div>` : ''}
        ${imagesHtml}
        <div class="post-actions" onclick="event.stopPropagation()">
          <div class="action-item"><i class="fa-regular fa-eye"></i><span>${item.views || 0}</span></div>
          <div class="action-item"><i class="fa-regular fa-comment"></i><span>${item.comments || 0}</span></div>
          <div class="action-item"><i class="fa-regular fa-heart"></i><span>${item.likes || 0}</span></div>
        </div>
      </div>`;
    }

    function renderSearchTopicCard(t) {
      return `<div class="topic-list-item" onclick="goTopicDetail('${escapeHtml(t.topic)}')" style="display:flex;align-items:center;padding:14px 16px;border-bottom:0.5px solid #f0f0f0;cursor:pointer;">
        <span style="flex:1;font-size:15px;color:#333;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">#${escapeHtml(t.topic)}</span>
        <div style="display:flex;align-items:center;color:#999;font-size:13px;margin-left:12px;">
          <i class="fa-regular fa-eye" style="margin-right:4px;font-size:14px;"></i>
          <span>${formatNumber(t.views || 0)}</span>
        </div>
      </div>`;
    }

    function renderSearchUserCard(u) {
      return `<div class="user-select-item" onclick="goUserProfile('${u.uid}')" style="cursor:pointer;padding:12px 16px;border-bottom:0.5px solid #f0f0f0;">
        <img src="${resolveMediaUrl(u.avatar) || DEFAULT_AVATAR}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">
        <div class="info">${u.nickname}<div style="font-size:12px;color:#999;">赞话号: ${u.uid}</div></div>
      </div>`;
    }

    function renderSearchSection(title, html) {
      return `<div style="margin-bottom:8px;">
        <div style="padding:10px 16px 6px;font-size:13px;font-weight:600;color:#999;">${title}</div>
        ${html}
      </div>`;
    }

    async function doSearch() {
      const keyword = document.getElementById('searchInput').value.trim();
      const result = document.getElementById('searchResult');
      if (!keyword) {
        result.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">请输入关键词</div>';
        return;
      }
      result.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">搜索中...</div>';
      try {
        const res = await api('/search?keyword=' + encodeURIComponent(keyword) + '&tab=' + searchCurrentTab);
        if (res.code !== 1) {
          if (res.msg === '未登录') {
            result.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#999;"><i class="fa-solid fa-lock" style="font-size:32px;margin-bottom:12px;display:block;"></i>登录后使用搜索功能</div>';
          } else {
            result.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">' + (res.msg || '搜索失败') + '</div>';
          }
          return;
        }
        const data = res.data || {};
        const posts = data.posts || [];
        const confession = data.confession || [];
        const users = data.users || [];
        const topics = data.topics || [];
        const homework = data.homework || [];

        if (searchCurrentTab === 'all') {
          let allEmpty = posts.length === 0 && confession.length === 0 && users.length === 0 && topics.length === 0 && homework.length === 0;
          if (allEmpty) {
            result.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">未找到相关内容</div>';
            return;
          }
          let html = '';
          if (posts.length > 0) {
            html += renderSearchSection('帖子', posts.map(renderPostCard).join(''));
          }
          if (homework.length > 0) {
            html += renderSearchSection('作业', homework.map(renderSearchHomeworkCard).join(''));
          }
          if (confession.length > 0) {
            html += renderSearchSection('表白墙', confession.map(renderConfessionCard).join(''));
          }
          if (topics.length > 0) {
            html += renderSearchSection('话题', '<div style="background:#fff;">' + topics.map(renderSearchTopicCard).join('') + '</div>');
          }
          if (users.length > 0) {
            html += renderSearchSection('用户', '<div style="background:#fff;">' + users.map(renderSearchUserCard).join('') + '</div>');
          }
          result.innerHTML = html;
          if (posts.length > 0) setTimeout(refreshCardExpandButtons, 0);
        } else if (searchCurrentTab === 'posts') {
          if (posts.length > 0) {
            result.innerHTML = posts.map(renderPostCard).join('');
            setTimeout(refreshCardExpandButtons, 0);
          } else {
            result.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">未找到帖子</div>';
          }
        } else if (searchCurrentTab === 'users') {
          if (users.length > 0) {
            result.innerHTML = '<div style="background:#fff;">' + users.map(renderSearchUserCard).join('') + '</div>';
          } else {
            result.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">未找到用户</div>';
          }
        } else if (searchCurrentTab === 'confession') {
          if (confession.length > 0) {
            result.innerHTML = confession.map(renderConfessionCard).join('');
          } else {
            result.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">未找到表白</div>';
          }
        } else if (searchCurrentTab === 'topics') {
          if (topics.length > 0) {
            result.innerHTML = '<div style="background:#fff;">' + topics.map(renderSearchTopicCard).join('') + '</div>';
          } else {
            result.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">未找到话题</div>';
          }
        } else if (searchCurrentTab === 'homework') {
          if (homework.length > 0) {
            result.innerHTML = homework.map(renderSearchHomeworkCard).join('');
            setTimeout(refreshCardExpandButtons, 0);
          } else {
            result.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">未找到作业</div>';
          }
        }
      } catch (e) {
        result.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">网络异常</div>';
      }
    }

        let userProfileCurrentTab = 'posts';

    function goUserProfile(uid) {
      if (!getToken()) { showLoginModal(); return; }
      userProfileCurrentTab = 'posts';
      pageHistory.push(currentPage);
      prevPage = currentPage;
      currentPage = 'userProfile';
      try { history.pushState({ page: 'userProfile' }, '', '#userProfile'); } catch(e) {}
      setTabbarVisible(false);
      api('/userProfile?uid=' + uid).then(r => {
        if (r.code === 1) {
          currentViewUser = r.data;
          try {
            window.scrollTo(0, 0);
            render();
            updateTabbar();
          } catch (renderErr) {
            console.error('render userProfile error:', renderErr);
            pageHistory.pop();
            currentPage = prevPage;
            showToast('加载失败，请稍后重试');
          }
        }
      });
    }

    function renderUserProfile() {
      if (!currentViewUser) return '<div style="padding:40px;text-align:center;">用户不存在</div>';
      const u = currentViewUser;
      const isMine = u.uid == getUid();
      const isPrivate = u.is_private === 1;
      const followStatus = u.follow_status || 'none';
      const isApproved = followStatus === 'approved';
      const isPending = followStatus === 'pending';
      const blockedByPrivate = !isMine && isPrivate && !isApproved;
      let followBtnHtml = '';
      if (isMine) {
        followBtnHtml = `<button id="followBtn" style="flex:1;padding:10px;border:none;border-radius:20px;font-size:15px;font-weight:600;cursor:pointer;background:#f5f5f5;color:#333;">编辑资料</button>`;
      } else if (isPending) {
        followBtnHtml = `<button id="followBtn" onclick="toggleFollow()" style="flex:1;padding:10px;border:none;border-radius:20px;font-size:15px;font-weight:600;cursor:pointer;background:#f5f5f5;color:#999;">申请中</button>`;
      } else if (u.followed) {
        followBtnHtml = `<button id="followBtn" onclick="toggleFollow()" style="flex:1;padding:10px;border:none;border-radius:20px;font-size:15px;font-weight:600;cursor:pointer;background:#f5f5f5;color:#333;">已关注</button>`;
      } else {
        followBtnHtml = `<button id="followBtn" onclick="toggleFollow()" style="flex:1;padding:10px;border:none;border-radius:20px;font-size:15px;font-weight:600;cursor:pointer;background:var(--color-primary);color:#fff;">关注</button>`;
      }
      let privateBadge = isPrivate ? '<span style="margin-left:6px;padding:2px 6px;background:#fff3e0;color:#ff9800;border-radius:10px;font-size:11px;">私密</span>' : '';
      return `<div class="page">
        <div class="navbar"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div><h1 style="flex:1;text-align:center;">主页</h1>${isMine ? '<div style="width:40px;"></div>' : '<div onclick="goReport(\'user\',\'' + u.uid + '\')" style="width:40px;text-align:center;cursor:pointer;"><i class="fa-solid fa-triangle-exclamation"></i></div>'}</div>
        <div class="profile-header">
          <div class="profile-top">
            <img class="profile-avatar" src="${resolveMediaUrl(u.avatar)||DEFAULT_AVATAR}" style="width:60px;height:60px;border-radius:50%;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">
            <div class="profile-info">
              <div class="profile-name">${u.nickname||'用户'+u.uid}${privateBadge}</div>
              <div class="profile-id">赞话号: ${u.uid} · IP: ${u.province||'未知'}</div>
            </div>
          </div>
          ${(() => {
            const vRows = renderProfileVerificationRows(u);
            if (!vRows) return '';

            return '<div class="profile-verifications">' + vRows + '</div>' +

              (!isMine ? '<div style="padding:6px 0 0;"><span style="font-size:13px;color:var(--color-primary);cursor:pointer;" onclick="goPage(\'verifSubscribe\')">我也要申请认证 <i class="fa-solid fa-chevron-right" style="font-size:11px;"></i></span></div>' : '');
          })()}
          <div class="profile-bio">${u.bio || '这个人很懒，什么都没写'}</div>
          <div class="profile-stats">
            <div class="profile-stat" onclick="goFollowList('${u.uid}')" style="cursor:pointer;"><span class="num">${u.follows||0}</span><span class="label">关注</span></div>
            <div class="profile-stat" onclick="goFansList('${u.uid}')" style="cursor:pointer;"><span class="num">${u.fans||0}</span><span class="label">粉丝</span></div>
            <div class="profile-stat" onclick="goPage('notificationLikes')" style="cursor:pointer;"><span class="num">${u.total_likes_collects||0}</span><span class="label">获赞与收藏</span></div>
          </div>
          <div style="display:flex;gap:8px;margin-top:12px;">
            ${followBtnHtml}
            ${isMine ? '' : `<button onclick="goChat('${u.uid}')" style="flex:1;padding:10px;background:#f5f5f5;border:none;border-radius:20px;font-size:15px;font-weight:600;cursor:pointer;">发私信</button>`}
          </div>
        </div>
        ${blockedByPrivate ? '<div id="userProfileContent" style="text-align:center;padding:60px 20px;color:#999;"><i class="fa-solid fa-lock" style="font-size:32px;margin-bottom:12px;display:block;"></i>该用户已设为私密账号，关注通过后可查看内容</div>' : `<div class="profile-tabs">
          <div class="profile-tab ${userProfileCurrentTab==='posts'?'active':''}" onclick="switchUserProfileTab('posts')">帖子</div>
          <div class="profile-tab ${userProfileCurrentTab==='confession'?'active':''}" onclick="switchUserProfileTab('confession')">表白墙</div>
        </div>
        <div id="userProfileContent" class="profile-grid">${new Array(6).fill(0).map(() => `
          <div class="profile-grid-item" style="background:#fff;">
            <div class="sk-item" style="width:100%;aspect-ratio:3/4;"></div>
            <div class="info" style="padding:6px 8px;">
              <div class="sk-item" style="width:85%;height:12px;margin-bottom:4px;"></div>
              <div class="sk-item" style="width:40%;height:10px;"></div>
            </div>
          </div>
        `).join('')}</div>`}
      </div>`;
    }

    function switchUserProfileTab(tab) {
      userProfileCurrentTab = tab;
      document.querySelectorAll('.profile-tabs .profile-tab').forEach(el => {
        el.classList.remove('active');
      });
      const activeTab = document.querySelector(`.profile-tabs .profile-tab:nth-child(${tab==='posts'?1:2})`);
      if (activeTab) activeTab.classList.add('active');
      loadUserProfileContent();
    }

    async function loadUserProfileContent() {
      const container = document.getElementById('userProfileContent');
      if (!container || !currentViewUser) return;
      const uid = currentViewUser.uid;
      if (userProfileCurrentTab === 'posts') {
        try {
          const res = await api('/myPosts?page=1&size=20&uid=' + uid);
          if (res.code === 1 && res.data.length > 0) {
            container.className = 'profile-grid';
            container.innerHTML = res.data.map(p => {
              const imgs = p.images ? p.images.split(',').filter(x => x) : [];
              const hasVideo = p.video && p.video.length > 0;
              const cover = hasVideo ? resolveMediaUrl(p.video_cover || '') : resolveMediaUrl(imgs[0] || '');
              const isVideo = hasVideo && !imgs.length;
              const isTextOnly = !cover && !isVideo;
              const textPreview = escapeHtml(p.content || '').replace(/@\[\d+\]([^\s\[\]<]{1,30})/g, '@$1').slice(0, 80);
              let mediaHtml = '';
              if (isTextOnly) {
                mediaHtml = `<div class="pg-text-only" style="width:100%;aspect-ratio:3/4;background:#FAFAFA;position:relative;padding:10px 8px;box-sizing:border-box;border-radius:0 0 10px 10px;overflow:hidden;display:flex;flex-direction:column;">
                  <div style="font-size:10px;color:#999;font-weight:500;margin-bottom:6px;letter-spacing:0.2px;display:flex;align-items:center;gap:3px;"><i class="fa-regular fa-file-lines" style="font-size:9px;"></i>纯文本</div>
                  ${p.title ? `<div style="font-size:11px;color:#333;font-weight:600;line-height:1.4;margin-bottom:5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(p.title)}</div>` : ''}
                  <div style="flex:1;font-size:10px;color:#666;line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;">${textPreview}</div>
                </div>`;
              } else {
                mediaHtml = cover ? `<img src="${cover}" loading="lazy">` : `<div style="width:100%;aspect-ratio:3/4;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);display:flex;align-items:center;justify-content:center;font-size:24px;color:rgba(255,255,255,0.8);"><i class="fa-solid fa-video"></i></div>`;
              }
              return `<div class="profile-grid-item ${isTextOnly?'pg-item-text':''}" onclick="goPostDetail('${p.id}')">
                ${mediaHtml}
                <div class="info"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.title || (p.content||'').replace(/@\[\d+\]([^\s\[\]<]{1,30})/g, '@$1').slice(0,20)}</div><div style="color:#999;font-size:11px;margin-top:2px;"><i class="fa-regular fa-heart"></i> ${p.likes||0}</div></div>
              </div>`;
            }).join('');
          } else {
            container.className = '';
            container.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">TA还没有发过帖子</div>';
          }
        } catch(e) {
          container.className = '';
          container.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">加载失败</div>';
        }
      } else {
        try {
          const res = await api('/userConfessions?uid=' + uid + '&page=1&size=20');
          if (res.code === 1 && res.data.length > 0) {
            container.className = '';
            container.style.padding = '8px 0';
            container.innerHTML = res.data.map(c => {
              const imgs = c.images ? c.images.split(',').filter(x => x) : [];
              const cover = imgs[0] || '';
              const hasImages = imgs.length > 0;
              return `<div class="card" onclick="goConfessionDetail(${c.id})" style="margin:0 8px 8px;">
                <div class="post-header" style="padding:10px 12px;">
                  <img class="avatar" src="${c.is_anonymous ? DEFAULT_AVATAR : (resolveMediaUrl(c.avatar)||DEFAULT_AVATAR)}" style="width:32px;height:32px;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">
                  <div class="post-user">
                    <div class="post-nickname" style="font-size:13px;">${c.is_anonymous ? '匿名用户' : (c.nickname || '用户'+c.user_id)}${c.is_anonymous ? '<span style="margin-left:4px;padding:1px 5px;background:#f0f0f0;color:#999;border-radius:8px;font-size:10px;">匿名</span>' : ''}${!c.is_anonymous ? renderListVerification(c) : ''}</div>
                    <div class="post-time" style="font-size:11px;">${timeAgo(c.create_time)}</div>
                  </div>
                </div>
                <div class="post-content" style="padding:0 12px 8px;font-size:13px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;height:78px;max-height:78px;box-sizing:content-box;">${escapeHtml(c.content||'').replace(/@\[\d+\]([^\s\[\]<]{1,30})/g, '@$1').replace(/\n/g,' ')}</div>
                ${hasImages ? `<div style="padding:0 12px 8px;"><img src="${resolveMediaUrl(cover)}" style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:6px;"></div>` : ''}
                <div class="post-actions" style="padding:6px 0 10px;font-size:12px;">
                  <div class="action-item"><i class="${c.liked ? 'fa-solid fa-heart' : 'fa-regular fa-heart'}" style="color:${c.liked ? 'var(--color-red)' : ''}"></i><span>${c.likes||0}</span></div>
                  <div class="action-item"><i class="fa-regular fa-comment"></i><span>${c.comment_count||0}</span></div>
                </div>
              </div>`;
            }).join('');
          } else {
            container.className = '';
            container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#999;">TA还没有发布过表白</div>';
          }
        } catch(e) {
          container.className = '';
          container.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">加载失败</div>';
        }
      }
    }

    async function bindUserProfileEvents() {
      if (!currentViewUser) return;
      const isMine = currentViewUser.uid == getUid();
      const isPrivate = currentViewUser.is_private === 1;
      const followStatus = currentViewUser.follow_status || 'none';
      const isApproved = followStatus === 'approved';
      if (!isMine && isPrivate && !isApproved) return;
      loadUserProfileContent();
    }

    async function toggleFollow() {
      if (!getToken()) {
        showLoginModal();
        return;
      }
      const res = await api('/follow', 'POST', { followId: currentViewUser.uid });
      if (res.code === 1) {
        currentViewUser.followed = res.data.followed;
        currentViewUser.follow_status = res.data.followed ? (res.data.pending ? 'pending' : 'approved') : 'none';
        const btn = document.getElementById('followBtn');
        if (res.data.followed && res.data.pending) {
          btn.style.background = '#f5f5f5';
          btn.style.color = '#999';
          btn.textContent = '申请中';
        } else if (res.data.followed) {
          btn.style.background = '#f5f5f5';
          btn.style.color = '#333';
          btn.textContent = '已关注';
        } else {
          btn.style.background = 'var(--color-primary)';
          btn.style.color = '#fff';
          btn.textContent = '关注';
        }
      }
    }

    function goStrangerList() {
      pageHistory.push(currentPage);
      prevPage = currentPage;
      currentPage = 'strangerList';
      try { history.pushState({ page: 'strangerList' }, '', '#strangerList'); } catch(e) {}
      window.scrollTo(0, 0);
      render();
      updateTabbar();
    }

    function renderStrangerList() {
      if (!getToken()) {
        showLoginModal();
        return `<div class="page" style="background:#fff;min-height:100vh;">
          <div class="navbar"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div><h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">陌生人消息</h1><div style="width:40px;"></div></div>
          <div class="empty" style="text-align:center;padding:40px;">请先登录</div>
        </div>`;
      }
      return `<div class="page" style="background:#fff;min-height:100vh;">
        <div class="navbar"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div><h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">陌生人消息</h1><div style="width:40px;"></div></div>
        <div id="strangerChatList" style="background:#fff;"></div>
      </div>`;
    }

    async function bindStrangerListEvents() {
      try {
        const res = await api('/strangerChatList');
        const list = document.getElementById('strangerChatList');
        if (!res.data || res.data.length === 0) {
          list.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">暂无陌生人消息</div>';
        } else {
          list.innerHTML = res.data.map(c => `
            <div class="chat-list-item" onclick="goChat('${c.otherUser}', ${c.is_anonymous ? 'true' : 'false'})" style="display:flex;align-items:center;padding:12px 16px;border-bottom:0.5px solid #f0f0f0;cursor:pointer;">
              <img src="${c.is_anonymous ? DEFAULT_AVATAR : (resolveMediaUrl(c.avatar)||DEFAULT_AVATAR)}" style="width:44px;height:44px;border-radius:50%;flex-shrink:0;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">
              <div style="flex:1;margin-left:12px;overflow:hidden;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span style="font-weight:600;font-size:15px;">${c.nickname||'用户'+c.otherUser}${c.is_anonymous ? '<span style="margin-left:6px;padding:2px 6px;background:#f0f0f0;color:#999;border-radius:10px;font-size:11px;">匿名</span>' : ''}</span>
                  <span style="font-size:12px;color:#999;">${timeAgo(c.lastTime)}</span>
                </div>
                <div style="font-size:13px;color:#999;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;">${c.type==='image'?'[图片]':c.type==='video'?'[视频]':(c.lastMessage||'')}</div>
              </div>
            </div>
          `).join('');
        }
      } catch(e) {
        document.getElementById('strangerChatList').innerHTML = '<div style="text-align:center;padding:20px;color:#999;">加载失败</div>';
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
      currentPage = 'chat';
      try { history.pushState({ page: 'chat' }, '', '#chat'); } catch(e) {}
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
        goPage('message');
        return '';
      }
      const isSystemChat = chatUser === 'system';
      const isStrangerChat = chatUser === '__stranger__';
      if (isSystemChat) {
        return `<div class="chat-page" style="background:#ededed;min-height:100vh;display:flex;flex-direction:column;">
          <div class="navbar" style="background:#f7f7f7;"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div><h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">系统消息</h1><div style="width:40px;"></div></div>
          <div id="chatMessages" class="chat-messages" style="flex:1;overflow-y:auto;padding:12px;"></div>
        </div>`;
      }
      return `<div class="chat-page" style="background:#ededed;min-height:100vh;display:flex;flex-direction:column;">
        <div class="navbar" style="background:#f7f7f7;"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div><h1 id="chatTitle" style="flex:1;text-align:center;font-size:17px;font-weight:600;">${isAnonymousChat ? '匿名用户' : '加载中...'}</h1><div style="width:40px;"></div></div>
        <div id="chatAnonymousTip" style="display:${isAnonymousChat ? 'block' : 'none'};background:#f5f5f7;color:#666;font-size:12px;padding:8px 16px;text-align:center;border-bottom:0.5px solid #eee;">
          <i class="fa-solid fa-eye-slash"></i> 匿名聊天中，双方均无法查看对方真实身份
        </div>
        <div id="chatStrangerTip" style="display:none;background:#f5f5f7;color:#666;font-size:12px;padding:8px 16px;text-align:center;border-bottom:0.5px solid #eee;">
          <i class="fa-solid fa-circle-info"></i> 你们不是好友，对方未回复前你只能发送一条消息
        </div>
        <div id="chatMessages" class="chat-messages" style="flex:1;overflow-y:auto;padding:12px;"></div>
        <div id="violationBubble" style="display:none;position:fixed;bottom:0;left:0;right:0;background:rgba(255,36,66,0.95);color:#fff;text-align:center;padding:10px 16px;font-size:14px;font-weight:500;z-index:10;transform:translateY(100%);transition:transform 0.3s cubic-bezier(0.23, 1, 0.32, 1);">
          <i class="fa-solid fa-circle-exclamation"></i> <span id="violationText">已违规</span>
        </div>
        <div class="chat-input-bar" style="display:flex;gap:8px;padding:10px;background:#f7f7f7;border-top:0.5px solid #ddd;position:fixed;left:0;right:0;z-index:20;">
          <input id="chatInput" placeholder="${isAnonymousChat ? '匿名发送消息...' : '发送消息...'}" style="flex:1;background:#fff;border:none;border-radius:20px;padding:10px 16px;">
          <button onclick="sendMsg()" style="background:var(--color-primary);color:#fff;border:none;border-radius:20px;padding:10px 20px;font-weight:600;">发送</button>
        </div>
      </div>`;
    }

    async function bindChatEvents() {
      await loadChatMessages();
      chatTimer = setInterval(loadChatMessages, 5000);
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
      const tipEl = document.getElementById('chatStrangerTip');
      if (!tipEl || !chatUserProfile) return;
      const isFriend = !!chatUserProfile.isFriend;
      if (isFriend) {
        tipEl.style.display = 'none';
      } else if (chatUserProfile.allow_stranger_msg) {
        tipEl.style.display = 'block';
        tipEl.innerHTML = '<i class="fa-solid fa-circle-info"></i> 你们不是好友，对方已开启陌生人私信，可自由发送消息';
      } else {
        tipEl.style.display = 'block';
        tipEl.innerHTML = '<i class="fa-solid fa-circle-info"></i> 你们不是好友，对方未回复前你只能发送一条消息。等待对方回复或关注你后即可继续发送';
      }
    }

    async function loadChatMessages() {
      try {
        const res = await api('/messageList?otherUser=' + chatUser + '&page=1&size=50');
        const container = document.getElementById('chatMessages');
        if (!container) {
          clearInterval(chatTimer);
          return;
        }
        if (res.code === 1) {
          if (chatUser === 'system') {
            container.innerHTML = res.data.length === 0
              ? '<div style="text-align:center;padding:40px;color:#999;">暂无系统消息</div>'
              : res.data.map(m => {
                  const isViolation = m.content && m.content.includes('用户违规通知');
                  const isAppeal = m.content && m.content.includes('用户申诉处理结果通知');
                  const isFeedback = m.content && m.content.includes('帮助与反馈回复通知');
                  if (isFeedback) {
                    const lines = m.content.split('\n');
                    let fbContent = '', fbReply = '', fbTime = '';
                    lines.forEach(line => {
                      if (line.includes('反馈内容：')) fbContent = line.replace('反馈内容：', '');
                      if (line.includes('回复内容：')) fbReply = line.replace('回复内容：', '');
                      if (line.includes('处理时间：')) fbTime = line.replace('处理时间：', '');
                    });
                    return `
                      <div style="margin-bottom:16px;padding:0 12px;">
                        <div style="font-size:11px;color:#999;margin-bottom:6px;text-align:center;">${m.create_time || fbTime}</div>
                        <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                          <div style="padding:14px 16px;border-bottom:0.5px solid #f5f5f5;">
                            <div style="font-size:15px;font-weight:700;color:#1D9BF0;">💬 帮助与反馈回复</div>
                          </div>
                          <div style="padding:12px 16px;">
                            <div style="font-size:12px;color:#999;margin-bottom:4px;">您的反馈</div>
                            <div style="font-size:13px;color:#666;background:#f9f9f9;border-radius:8px;padding:10px 12px;margin-bottom:10px;">${fbContent || '-'}</div>
                            <div style="font-size:12px;color:#999;margin-bottom:4px;">官方回复</div>
                            <div style="font-size:13px;color:#333;background:#f0f9ff;border-radius:8px;padding:10px 12px;">${fbReply || '-'}</div>
                          </div>
                          <div style="padding:12px 16px;border-top:0.5px solid #f5f5f5;">
                            <div style="font-size:12px;color:#999;line-height:1.5;">感谢您的反馈与支持，赞话团队将持续努力为您提供更好的体验。</div>
                          </div>
                          <div onclick="goPage('feedback')" style="padding:12px 16px;background:#f5f5f7;display:flex;justify-content:space-between;align-items:center;cursor:pointer;">
                            <span style="font-size:13px;color:#666;">再次反馈</span>
                            <i class="fa-solid fa-chevron-right" style="color:#ccc;"></i>
                          </div>
                        </div>
                      </div>
                    `;
                  }
                  if (isViolation || isAppeal) {
                    const lines = m.content.split('\n');
                    let reason = '', category = '', result = '', time = '', contentPreview = '', appealType = '', oldCategory = '', oldReason = '', appealRemark = '';
                    lines.forEach(line => {
                      if (isViolation) {
                        if (line.includes('违规原因')) reason = line.replace('违规原因：', '');
                        if (line.includes('违规类型')) category = line.replace('违规类型：', '');
                        if (line.includes('处理结果')) result = line.replace('处理结果：', '');
                        if (line.includes('处理时间')) time = line.replace('处理时间：', '');
                        if (line.includes('您发布的')) {
                          const match = line.match(/您发布的(.+)"(.+)"因包含违规内容已被系统删除/);
                          if (match) contentPreview = match[2];
                        }
                      } else {
                        if (line.includes('申诉类型：')) appealType = line.replace('申诉类型：', '');
                        if (line.includes('原违规类型：')) oldCategory = line.replace('原违规类型：', '');
                        if (line.includes('原违规原因：')) oldReason = line.replace('原违规原因：', '');
                        if (line.includes('申诉处理结果：')) result = line.replace('申诉处理结果：', '');
                        if (line.includes('处理时间：')) time = line.replace('处理时间：', '');
                        if (line.includes('处理意见：')) appealRemark = line.replace('处理意见：', '');
                        if (line.includes('您提交的内容：')) {
                          const match = line.match(/您提交的内容："(.+)"/);
                          if (match) contentPreview = match[1];
                        }
                      }
                    });
                    const titleColor = isAppeal ? (result.includes('通过') ? '#099536' : '#f59e0b') : '#ff2442';
                    const headerTitle = isAppeal
                      ? (result.includes('通过') ? '✅ 申诉处理结果：已通过' : '⚠️ 申诉处理结果：未通过')
                      : '用户违规通知';
                    const footerText = isAppeal
                      ? (result.includes('通过')
                          ? '您的申诉已复核通过，原处罚已解除，相关内容已恢复可见。感谢您对赞话社区规范的理解与支持。'
                          : '您的申诉经人工复核后仍判定为违规，原处罚继续有效。如您仍有异议，可再次提交相关证明材料重新申诉。')
                      : '您发布的内容因包含违规信息已被处理，请遵守赞话社区规范，维护良好的社区氛围。';
                    const fields = isAppeal
                      ? [
                          ['申诉类型', appealType],
                          ['原违规类型', oldCategory],
                          ['原违规原因', oldReason],
                          ['申诉结果', result]
                        ].filter(x => x[1])
                      : [
                          ['违规类型', category],
                          ['违规原因', reason],
                          ['处理结果', result]
                        ].filter(x => x[1]);
                    const previewLabel = isAppeal ? '您提交的内容' : '违规内容';
                    return `
                      <div style="margin-bottom:16px;padding:0 12px;">
                        <div style="font-size:11px;color:#999;margin-bottom:6px;text-align:center;">${m.create_time || time}</div>
                        <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                          <div style="padding:14px 16px;border-bottom:0.5px solid #f5f5f5;">
                            <div style="font-size:15px;font-weight:700;color:${titleColor};">${headerTitle}</div>
                          </div>
                          <div style="padding:12px 16px;border-bottom:0.5px solid #f5f5f5;">
                            ${fields.map(f => `
                              <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                                <span style="font-size:12px;color:#999;">${f[0]}</span>
                                <span style="font-size:12px;color:#333;max-width:60%;text-align:right;">${f[1]}</span>
                              </div>
                            `).join('')}
                          </div>
                          ${appealRemark ? `<div style="padding:10px 16px;background:#fff7ed;font-size:12px;color:#92400e;border-bottom:0.5px solid #f5f5f5;">💬 处理意见：${appealRemark}</div>` : ''}
                          ${contentPreview ? `<div style="padding:12px 16px;background:#f9f9f9;font-size:13px;color:#666;">${previewLabel}：${contentPreview}</div>` : ''}
                          <div style="padding:12px 16px;border-top:0.5px solid #f5f5f5;">
                            <div style="font-size:12px;color:#999;line-height:1.5;">${footerText}</div>
                          </div>
                          <div onclick="goPage('safetyCenter')" style="padding:12px 16px;background:#f5f5f7;display:flex;justify-content:space-between;align-items:center;cursor:pointer;">
                            <span style="font-size:13px;color:#666;">查看详情</span>
                            <i class="fa-solid fa-chevron-right" style="color:#ccc;"></i>
                          </div>
                        </div>
                      </div>
                    `;
                  }
                  return `
                    <div style="text-align:center;margin-bottom:16px;">
                      <div style="font-size:11px;color:#999;margin-bottom:6px;">${m.create_time || ''}</div>
                      <div style="display:inline-block;max-width:80%;background:#fff;color:#333;padding:12px 16px;border-radius:12px;font-size:14px;line-height:1.6;text-align:left;box-shadow:0 1px 2px rgba(0,0,0,0.05);white-space:pre-wrap;">${m.content||''}</div>
                    </div>
                  `;
                }).join('');
            container.scrollTop = container.scrollHeight;
            return;
          }
          const myUid = getUid();
          const isAnon = checkAnonymousChat(res.data);
          const titleEl = document.getElementById('chatTitle');
          const anonTipEl = document.getElementById('chatAnonymousTip');
          const strangerTipEl = document.getElementById('chatStrangerTip');

          if (isAnon) {
            if (titleEl) titleEl.textContent = '匿名用户';
            if (anonTipEl) anonTipEl.style.display = 'block';
            if (strangerTipEl) strangerTipEl.style.display = 'none';
          } else {
            if (titleEl && chatUserProfile) {
              titleEl.textContent = chatUserProfile.nickname || '用户'+chatUser;
            } else if (titleEl) {
              titleEl.textContent = '用户'+chatUser;
            }
            if (anonTipEl) anonTipEl.style.display = 'none';
          }

          if (!isAnon && !chatUserProfile) {
            try {
              const profileRes = await api('/userProfile?uid=' + chatUser);
              if (profileRes.code === 1) {
                chatUserProfile = profileRes.data;
                if (titleEl) titleEl.textContent = profileRes.data.nickname || '用户'+chatUser;
                updateChatStrangerTip();
              }
            } catch(e) {}
          }

          const wasNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
          const otherAvatar = chatUserProfile ? (resolveMediaUrl(chatUserProfile.avatar) || DEFAULT_AVATAR) : DEFAULT_AVATAR;
          const myAvatarUrl = resolveMediaUrl(myAvatar) || DEFAULT_AVATAR;
          container.innerHTML = res.data.map(m => {
            const isMe = m.from_user === myUid;
            const failed = isMe && (m.status === 0);
            const failReason = m.fail_reason || '';
            const contentHtml = m.type==='image' ? `<img src="${resolveMediaUrl(m.content)}" style="max-width:200px;border-radius:8px;" onclick="showFullImage('${m.content}')">` : (m.content||'');
            const avatarUrl = isMe ? myAvatarUrl : otherAvatar;
            const avatarHtml = !isAnon && !isMe ? `<img src="${avatarUrl}" onclick="event.stopPropagation();goUserProfile('${m.from_user}')" style="width:36px;height:36px;border-radius:50%;flex-shrink:0;cursor:pointer;margin-right:8px;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">` : (isMe ? '' : `<div style="width:36px;margin-right:8px;flex-shrink:0;"></div>`);
            const avatarRightHtml = !isAnon && isMe ? `<img src="${avatarUrl}" onclick="event.stopPropagation();goUserProfile('${myUid}')" style="width:36px;height:36px;border-radius:50%;flex-shrink:0;cursor:pointer;margin-left:8px;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">` : (isMe ? '' : `<div style="width:36px;margin-left:8px;flex-shrink:0;"></div>`);
            if (failed) {
              const safeReason = failReason.replace(/'/g, '\\\'').replace(/"/g, '&quot;');
              return `<div style="display:flex;flex-direction:column;align-items:flex-end;margin-bottom:10px;">
                <div style="display:flex;justify-content:flex-end;align-items:center;gap:6px;">
                  <i class="fa-solid fa-circle-exclamation" title="${safeReason}" style="color:#ff2442;font-size:18px;cursor:pointer;" onclick="alert('发送失败：${safeReason}')"></i>
                  <div class="chat-bubble" style="max-width:70%;padding:10px 14px;border-radius:16px;font-size:15px;line-height:1.4;background:#fafafa;color:#888;border:0.5px dashed #ff9bab;border-bottom-right-radius:4px;">${contentHtml}</div>
                  ${avatarRightHtml}
                </div>
                ${failReason ? `<div style="color:#ff2442;font-size:11px;margin-top:4px;margin-right:54px;line-height:1.5;max-width:75%;text-align:right;">发送失败：${failReason}</div>` : ''}
              </div>`;
            }
            return `<div style="display:flex;${isMe?'justify-content:flex-end':''};align-items:flex-end;margin-bottom:10px;">
              ${!isMe ? avatarHtml : ''}
              <div class="chat-bubble" style="max-width:70%;padding:10px 14px;border-radius:16px;font-size:15px;line-height:1.4;${isMe ? 'background:var(--color-primary);color:#fff;border-bottom-right-radius:4px;' : 'background:#fff;color:#333;border-bottom-left-radius:4px;'}">
                ${contentHtml}
              </div>
              ${isMe ? avatarRightHtml : ''}
            </div>`;
          }).join('');
          if (wasNearBottom) container.scrollTop = container.scrollHeight;
        }
      } catch(e) {}
    }

    function showViolationBubble(msg) {
      const bubble = document.getElementById('violationBubble');
      if (bubble) {
        const textEl = document.getElementById('violationText');
        if (textEl) textEl.textContent = msg || '已违规';
        bubble.style.display = 'block';
        bubble.style.transform = 'translateY(0)';
        clearTimeout(window._violationTimer);
        window._violationTimer = setTimeout(() => {
          bubble.style.transform = 'translateY(100%)';
          setTimeout(() => { bubble.style.display = 'none'; }, 300);
        }, 3000);
        return;
      }
      let popup = document.getElementById('global-violation-popup');
      if (!popup) {
        popup = document.createElement('div');
        popup.id = 'global-violation-popup';
        popup.style.cssText = 'position:fixed;top:0;left:0;right:0;background:rgba(255,36,66,0.95);color:#fff;text-align:center;padding:14px 16px;font-size:15px;font-weight:500;z-index:99999;transform:translateY(-100%);transition:transform 0.3s cubic-bezier(0.23, 1, 0.32, 1);';
        document.body.appendChild(popup);
      }
      popup.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> ' + (msg || '已违规');
      popup.style.display = 'block';
      requestAnimationFrame(() => { popup.style.transform = 'translateY(0)'; });
      clearTimeout(window._violationTimer);
      window._violationTimer = setTimeout(() => {
        popup.style.transform = 'translateY(-100%)';
        setTimeout(() => { popup.style.display = 'none'; }, 300);
      }, 3000);
    }

    async function sendMsg() {
      const input = document.getElementById('chatInput');
      const content = input.value.trim();
      if (!content) return;
      input.value = '';
      try {
        const res = await api('/sendMessage', 'POST', {
          toUser: chatUser,
          content,
          isAnonymous: isAnonymousChat ? 1 : 0,
          confessionId: currentConfessionChatId || null
        });
        if (res.code === 1) {
          await loadChatMessages();
        } else {
          if (res.msg && res.msg.indexOf('涉嫌') !== -1) {
            showViolationBubble('已违规：' + res.msg);
          } else if (res.data && res.data.messageId) {
            showToast(res.msg || '发送失败');
            await loadChatMessages();
          } else {
            showToast(res.msg || '发送失败');
          }
        }
      } catch(e) {
        showToast('发送失败');
      }
    }

    async function retrySendMessage(messageId) {
      if (!messageId) return;
      try {
        const res = await api('/retryMessage', 'POST', { messageId });
        if (res.code === 1) {
          showToast('发送成功');
          await loadChatMessages();
        } else {
          showToast(res.msg || '重试失败');
        }
      } catch(e) {
        showToast('重试失败');
      }
    }

    const ALL_COUNTRIES = [{"name":"中国大陆","code":"CN"},{"name":"中国台湾","code":"TW"},{"name":"中国香港","code":"HK"},{"name":"中国澳门","code":"MO"},{"name":"美国","code":"US"},{"name":"日本","code":"JP"},{"name":"韩国","code":"KR"},{"name":"英国","code":"GB"},{"name":"法国","code":"FR"},{"name":"德国","code":"DE"},{"name":"加拿大","code":"CA"},{"name":"澳大利亚","code":"AU"},{"name":"新加坡","code":"SG"},{"name":"马来西亚","code":"MY"},{"name":"泰国","code":"TH"},{"name":"越南","code":"VN"},{"name":"印度","code":"IN"},{"name":"巴西","code":"BR"},{"name":"俄罗斯","code":"RU"},{"name":"南非","code":"ZA"},{"name":"埃及","code":"EG"},{"name":"尼日利亚","code":"NG"},{"name":"肯尼亚","code":"KE"},{"name":"阿联酋","code":"AE"},{"name":"沙特阿拉伯","code":"SA"},{"name":"以色列","code":"IL"},{"name":"乌克兰","code":"UA"},{"name":"捷克","code":"CZ"},{"name":"希腊","code":"GR"},{"name":"葡萄牙","code":"PT"},{"name":"爱尔兰","code":"IE"},{"name":"比利时","code":"BE"},{"name":"奥地利","code":"AT"},{"name":"匈牙利","code":"HU"},{"name":"罗马尼亚","code":"RO"},{"name":"保加利亚","code":"BG"},{"name":"克罗地亚","code":"HR"},{"name":"斯洛伐克","code":"SK"},{"name":"斯洛文尼亚","code":"SI"},{"name":"立陶宛","code":"LT"},{"name":"拉脱维亚","code":"LV"},{"name":"爱沙尼亚","code":"EE"},{"name":"冰岛","code":"IS"},{"name":"卢森堡","code":"LU"},{"name":"摩纳哥","code":"MC"},{"name":"列支敦士登","code":"LI"},{"name":"马耳他","code":"MT"},{"name":"塞浦路斯","code":"CY"},{"name":"新西兰","code":"NZ"},{"name":"菲律宾","code":"PH"},{"name":"印度尼西亚","code":"ID"},{"name":"巴基斯坦","code":"PK"},{"name":"孟加拉国","code":"BD"},{"name":"斯里兰卡","code":"LK"},{"name":"尼泊尔","code":"NP"},{"name":"柬埔寨","code":"KH"},{"name":"老挝","code":"LA"},{"name":"缅甸","code":"MM"},{"name":"蒙古","code":"MN"},{"name":"哈萨克斯坦","code":"KZ"},{"name":"乌兹别克斯坦","code":"UZ"},{"name":"土库曼斯坦","code":"TM"},{"name":"吉尔吉斯斯坦","code":"KG"},{"name":"塔吉克斯坦","code":"TJ"},{"name":"阿塞拜疆","code":"AZ"},{"name":"格鲁吉亚","code":"GE"},{"name":"亚美尼亚","code":"AM"},{"name":"白俄罗斯","code":"BY"},{"name":"摩尔多瓦","code":"MD"},{"name":"塞尔维亚","code":"RS"},{"name":"波黑","code":"BA"},{"name":"北马其顿","code":"MK"},{"name":"阿尔巴尼亚","code":"AL"},{"name":"黑山","code":"ME"},{"name":"摩洛哥","code":"MA"},{"name":"阿尔及利亚","code":"DZ"},{"name":"突尼斯","code":"TN"},{"name":"利比亚","code":"LY"},{"name":"苏丹","code":"SD"},{"name":"埃塞俄比亚","code":"ET"},{"name":"坦桑尼亚","code":"TZ"},{"name":"乌干达","code":"UG"},{"name":"卢旺达","code":"RW"},{"name":"布隆迪","code":"BI"},{"name":"刚果（金）","code":"CD"},{"name":"刚果（布）","code":"CG"},{"name":"加纳","code":"GH"},{"name":"科特迪瓦","code":"CI"},{"name":"塞内加尔","code":"SN"},{"name":"喀麦隆","code":"CM"},{"name":"安哥拉","code":"AO"},{"name":"莫桑比克","code":"MZ"},{"name":"赞比亚","code":"ZM"},{"name":"津巴布韦","code":"ZW"},{"name":"博茨瓦纳","code":"BW"},{"name":"纳米比亚","code":"NA"},{"name":"毛里求斯","code":"MU"},{"name":"塞舌尔","code":"SC"},{"name":"古巴","code":"CU"},{"name":"牙买加","code":"JM"},{"name":"巴哈马","code":"BS"},{"name":"多米尼加","code":"DO"},{"name":"海地","code":"HT"},{"name":"危地马拉","code":"GT"},{"name":"洪都拉斯","code":"HN"},{"name":"萨尔瓦多","code":"SV"},{"name":"尼加拉瓜","code":"NI"},{"name":"哥斯达黎加","code":"CR"},{"name":"巴拿马","code":"PA"},{"name":"哥伦比亚","code":"CO"},{"name":"委内瑞拉","code":"VE"},{"name":"秘鲁","code":"PE"},{"name":"智利","code":"CL"},{"name":"乌拉圭","code":"UY"},{"name":"巴拉圭","code":"PY"},{"name":"玻利维亚","code":"BO"},{"name":"厄瓜多尔","code":"EC"},{"name":"圭亚那","code":"GY"},{"name":"苏里南","code":"SR"},{"name":"马尔代夫","code":"MV"},{"name":"不丹","code":"BT"},{"name":"文莱","code":"BN"},{"name":"东帝汶","code":"TL"},{"name":"斐济","code":"FJ"},{"name":"巴布亚新几内亚","code":"PG"},{"name":"所罗门群岛","code":"SB"},{"name":"瓦努阿图","code":"VU"},{"name":"萨摩亚","code":"WS"},{"name":"汤加","code":"TO"},{"name":"基里巴斯","code":"KI"},{"name":"密克罗尼西亚","code":"FM"},{"name":"帕劳","code":"PW"},{"name":"马绍尔群岛","code":"MH"},{"name":"瑙鲁","code":"NR"},{"name":"图瓦卢","code":"TV"},{"name":"库克群岛","code":"CK"},{"name":"纽埃","code":"NU"}];

    let editCountryCode = 'CN';
    let editCountryName = '中国大陆';
    let editProfileTab = 'profile';

    function renderEditProfile() {
      return `<div class="page">
        <div class="navbar"><div onclick="goPage('profile')" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div><h1 style="flex:1;text-align:center;">${editProfileTab === 'profile' ? '编辑资料' : '安全设置'}</h1><div style="width:60px;"></div></div>
        <div class="ep-tab-bar">
          <div class="ep-tab ${editProfileTab === 'profile' ? 'ep-tab-active' : ''}" onclick="switchEditProfileTab('profile')">编辑资料</div>
          <div class="ep-tab ${editProfileTab === 'security' ? 'ep-tab-active' : ''}" onclick="switchEditProfileTab('security')">安全设置</div>
          <div class="ep-tab-indicator" style="transform:translateX(${editProfileTab === 'security' ? '100%' : '0'});"></div>
        </div>
        ${editProfileTab === 'profile' ? renderEditProfileContent() : renderEditSecurityContent()}
      </div>`;
    }

    function switchEditProfileTab(tab) {
      editProfileTab = tab;
      if (tab === 'profile') {
        currentPage = 'editProfile';
      } else {
        currentPage = 'securitySettings';
      }
      render();
      updateTabbar();
    }

    function renderEditProfileContent() {
      return `<div class="edit-profile-page">
        <div class="ep-section ep-section-animate" style="animation-delay:0.02s;">
          <div class="ep-avatar-card">
            <div class="ep-avatar-wrap" onclick="document.getElementById('avatarInput').click()">
              <img id="editAvatar" src="${DEFAULT_AVATAR}" class="ep-avatar-img">
              <div class="ep-avatar-badge"><i class="fa-solid fa-camera"></i></div>
            </div>
            <input type="file" id="avatarInput" accept="image/*" style="display:none" onchange="uploadNewAvatar(this.files[0])">
            <div class="ep-avatar-info">
              <div class="ep-avatar-title">头像</div>
              <div class="ep-avatar-hint">点击更换，支持 JPG、PNG</div>
            </div>
            <div class="ep-arrow"><i class="fa-solid fa-chevron-right"></i></div>
          </div>
        </div>
        <div class="ep-section ep-section-animate" style="animation-delay:0.06s;">
          <div class="ep-section-title">基本信息</div>
          <div class="ep-item">
            <div class="ep-item-label">昵称</div>
            <div class="ep-item-value"><input id="editNickname" class="ep-input" placeholder="请输入昵称"></div>
          </div>
          <div class="ep-item">
            <div class="ep-item-label">简介</div>
            <div class="ep-item-value"><textarea id="editBio" class="ep-textarea" placeholder="介绍一下自己吧"></textarea></div>
          </div>
          <div class="ep-item">
            <div class="ep-item-label">性别</div>
            <div class="ep-item-value ep-select-wrap">
              <select id="editGender" class="ep-select">
                <option value="0">不公开</option>
                <option value="1">男</option>
                <option value="2">女</option>
              </select>
              <i class="fa-solid fa-chevron-down ep-select-arrow"></i>
            </div>
          </div>
          <div class="ep-item">
            <div class="ep-item-label">生日</div>
            <div class="ep-item-value">
              <div class="ep-birth-row">
                <select id="editBirthYear" class="ep-birth-select"><option value="">年</option></select>
                <span class="ep-birth-sep">/</span>
                <select id="editBirthMonth" class="ep-birth-select"><option value="">月</option></select>
                <span class="ep-birth-sep">/</span>
                <select id="editBirthDay" class="ep-birth-select"><option value="">日</option></select>
              </div>
            </div>
          </div>
          <div class="ep-item ep-item-tappable" onclick="openCountryPicker()">
            <div class="ep-item-label">国家/地区</div>
            <div class="ep-item-value ep-item-value-arrow">
              <span id="editCountryDisplay">中国大陆</span>
              <i class="fa-solid fa-chevron-right ep-chevron"></i>
            </div>
          </div>
        </div>
        <div id="verifSettingsArea"></div>
        <div class="ep-section ep-section-animate" style="animation-delay:0.08s;">
          <div class="ep-item" onclick="goPage('verifSubscribe')" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;">
            <div>
              <div class="ep-item-label">订阅认证</div>
              <div class="ep-item-desc">解锁进阶/高级认证专属特权</div>
            </div>
            <i class="fa-solid fa-chevron-right" style="color:#ccc;font-size:14px;"></i>
          </div>
        </div>
        <div class="ep-section ep-section-animate" style="animation-delay:0.095s;">
          <div class="ep-item ep-item-row" onclick="goPage('youthMode')" style="cursor:pointer;">
            <div style="display:flex;align-items:center;gap:8px;"><i class="fa-solid fa-child" style="color:#3E993C;font-size:16px;"></i><span class="ep-item-label">青少年模式</span></div>
            <div style="display:flex;align-items:center;gap:6px;"><span id="youthModeStatus" style="font-size:13px;color:#999;">未开启</span><i class="fa-solid fa-chevron-right" style="color:#ccc;font-size:14px;"></i></div>
          </div>
        </div>
        <div class="ep-section ep-section-animate" style="animation-delay:0.10s;">
          <div class="ep-section-title">隐私与沟通</div>
          <div class="ep-item ep-item-row">
            <div class="ep-item-left-col">
              <div class="ep-item-label" style="color:#333;">允许陌生人私信</div>
              <div class="ep-item-desc">开启后，陌生人可在你未关注时给你发消息</div>
            </div>
            <label class="switch"><input type="checkbox" id="editStrangerMsg"><span class="slider"></span></label>
          </div>
        </div>
        <div class="ep-section ep-section-animate" style="animation-delay:0.14s;">
          <button class="ep-save-btn" onclick="saveProfile()">保存修改</button>
        </div>
        <div class="country-picker-overlay" id="countryPickerOverlay" onclick="closeCountryPicker()">
          <div class="country-picker-panel" onclick="event.stopPropagation()">
            <div class="cp-header">
              <div class="cp-title">选择国家/地区</div>
              <div class="cp-close" onclick="closeCountryPicker()"><i class="fa-solid fa-xmark"></i></div>
            </div>
            <div class="cp-search-wrap">
              <i class="fa-solid fa-magnifying-glass cp-search-icon"></i>
              <input type="text" id="countrySearchInput" class="cp-search-input" placeholder="搜索国家或地区" oninput="filterCountries(this.value)">
            </div>
            <div id="countryList" class="cp-list"></div>
          </div>
        </div>
      </div>`;
    }

    function applyFansListSwitchStyle(on) {
      const sw = document.getElementById('showFansListSwitch');
      if (sw) sw.checked = on;
    }

    function applyPrivateSwitchStyle(on) {
      const sw = document.getElementById('isPrivateSwitch');
      if (sw) sw.checked = on;
    }

    async function updatePrivateAccount(checked) {
      applyPrivateSwitchStyle(checked);
      try {
        const r = await api('/updatePrivate', 'POST', { is_private: checked ? 1 : 0 });
        if (r.code === 1) {
          showToast(checked ? '已开启私密账号' : '已关闭私密账号');
        } else {
          showToast(r.msg || '修改失败');
          const sw = document.getElementById('isPrivateSwitch');
          if (sw) { sw.checked = !checked; applyPrivateSwitchStyle(!checked); }
        }
      } catch (e) {
        showToast('修改失败');
        const sw = document.getElementById('isPrivateSwitch');
        if (sw) { sw.checked = !checked; applyPrivateSwitchStyle(!checked); }
      }
    }

    async function updateFansListVisible(checked) {
      applyFansListSwitchStyle(checked);
      try {
        const r = await api('/updateFansListVisible', 'POST', { show_fans_list: checked ? 1 : 0 });
        if (r.code === 1) {
          showToast(checked ? '已开启粉丝列表展示' : '已关闭粉丝列表展示');
        } else {
          showToast(r.msg || '修改失败');
          const sw = document.getElementById('showFansListSwitch');
          if (sw) { sw.checked = !checked; applyFansListSwitchStyle(!checked); }
        }
      } catch (e) {
        showToast('修改失败');
        const sw = document.getElementById('showFansListSwitch');
        if (sw) { sw.checked = !checked; applyFansListSwitchStyle(!checked); }
      }
    }

    function renderEditSecurityContent() {
      return `<div class="security-page">
        <div class="sec-card sec-card-animate" style="animation-delay:0.02s;">
          <div class="sec-card-title">账号安全</div>
          <div class="sec-item" onclick="showChangePhoneModal()">
            <div class="sec-item-icon sec-icon-phone"><i class="fa-solid fa-mobile-screen-button"></i></div>
            <div class="sec-item-body">
              <div class="sec-item-label">手机号</div>
              <div class="sec-item-sub" id="secPhone">加载中...</div>
            </div>
            <div class="sec-item-action"><span class="sec-action-btn">修改</span><i class="fa-solid fa-chevron-right sec-chevron"></i></div>
          </div>
        </div>
        <div class="sec-card sec-card-animate" style="animation-delay:0.06s;">
          <div class="sec-card-title">隐私设置</div>
          <div class="sec-item">
            <div class="sec-item-icon sec-icon-lock"><i class="fa-solid fa-lock"></i></div>
            <div class="sec-item-body">
              <div class="sec-item-label">私密账号</div>
              <div class="sec-item-desc">开启后，他人需通过你的关注申请才能查看你的帖子和表白墙</div>
            </div>
            <label class="switch switch-sm"><input type="checkbox" id="isPrivateSwitch" onchange="updatePrivateAccount(this.checked)"><span class="slider"></span></label>
          </div>
          <div class="sec-item" id="visibleWmItem" style="display:none;">
            <div class="sec-item-icon"><i class="fa-solid fa-fingerprint"></i></div>
            <div class="sec-item-body">
              <div class="sec-item-label">满屏水印保护</div>
              <div class="sec-item-desc">开启后，帖子详情页将显示满屏斜排水印，防止内容被盗用截图</div>
            </div>
            <label class="switch switch-sm"><input type="checkbox" id="visibleWmSwitch" onchange="toggleVisibleWatermark(this.checked)"><span class="slider"></span></label>
          </div>
          <div class="sec-item">
            <div class="sec-item-icon sec-icon-fans"><i class="fa-solid fa-users"></i></div>
            <div class="sec-item-body">
              <div class="sec-item-label">展示粉丝列表</div>
              <div class="sec-item-desc">关闭后，他人查看你的主页时将无法看到你的粉丝列表</div>
            </div>
            <label class="switch switch-sm"><input type="checkbox" id="showFansListSwitch" onchange="updateFansListVisible(this.checked)"><span class="slider"></span></label>
          </div>
        </div>
        <div class="sec-card sec-card-animate" style="animation-delay:0.10s;">
          <div class="sec-card-title">意见反馈</div>
          <div class="sec-feedback-card">
            <div class="sec-feedback-icon"><i class="fa-solid fa-comment-dots"></i></div>
            <div class="sec-feedback-body">
              <div class="sec-feedback-title">我们重视你的声音</div>
              <div class="sec-feedback-desc">无论是功能建议还是问题反馈，都欢迎随时告诉我们</div>
            </div>
            <button class="sec-feedback-btn" onclick="openFeedbackModal()">立即反馈</button>
          </div>
        </div>
        <div class="sec-card sec-card-danger sec-card-animate" style="animation-delay:0.14s;">
          <div class="sec-item" onclick="confirmLogout()">
            <div class="sec-item-icon sec-icon-logout"><i class="fa-solid fa-arrow-right-from-bracket"></i></div>
            <div class="sec-item-body">
              <div class="sec-item-label sec-label-danger">退出登录</div>
              <div class="sec-item-desc">返回登录页面</div>
            </div>
            <i class="fa-solid fa-chevron-right sec-chevron"></i>
          </div>
          <div class="sec-item" onclick="showDeleteAccountModal()">
            <div class="sec-item-icon sec-icon-delete"><i class="fa-solid fa-trash-can"></i></div>
            <div class="sec-item-body">
              <div class="sec-item-label sec-label-danger">注销账号</div>
              <div class="sec-item-desc">删除所有数据，不可恢复</div>
            </div>
            <i class="fa-solid fa-chevron-right sec-chevron"></i>
          </div>
        </div>
        ${renderChangePhoneModal()}
        ${renderConfirmDeleteFirstModal()}
        ${renderDeleteAccountModal()}
        ${renderLogoutConfirmModal()}
        ${renderFeedbackModal()}
      </div>`;
    }

    function renderChangePhoneModal() {
      return `<div class="dialog-modal" id="changePhoneModal" onclick="event.target.id==='changePhoneModal' && event.target.classList.remove('active')">
        <div class="dialog-modal-content" onclick="event.stopPropagation()">
          <h3>修改手机号</h3>
          <div class="form-group"><label>当前手机号</label><input type="text" id="curPhoneDisplay" readonly disabled style="background:#f5f5f5;"></div>
          <div class="form-group"><label>验证码</label><div style="display:flex; gap:8px;"><input type="text" id="changePhoneCode" maxlength="6" placeholder="请输入验证码" style="flex:1;"><button class="btn btn-outline" id="getChangePhoneCodeBtn" onclick="sendChangePhoneCode()">获取验证码</button></div></div>
          <div class="form-group"><label>新手机号</label><input type="tel" id="newPhone" maxlength="11" placeholder="请输入新手机号"></div>
          <div class="btn-group"><button class="btn btn-outline" onclick="document.getElementById('changePhoneModal').classList.remove('active')">取消</button><button class="btn btn-primary" onclick="submitChangePhone()">保存</button></div>
        </div>
      </div>`;
    }

    function renderConfirmDeleteFirstModal() {
      return `<div class="dialog-modal" id="confirmDeleteFirstModal" onclick="event.target.id==='confirmDeleteFirstModal' && event.target.classList.remove('active')">
        <div class="dialog-modal-content" onclick="event.stopPropagation()">
          <h3 style="color:#e53935;">确认注销账号</h3>
          <p>您确定要注销账号吗？此操作将会清除您所有的账号数据，且不可逆。请务必谨慎操作。</p>
          <div class="btn-group">
            <button class="btn btn-outline" onclick="document.getElementById('confirmDeleteFirstModal').classList.remove('active')">取消</button>
            <button class="btn btn-danger" onclick="proceedToDeleteAccountModal()">确定注销</button>
          </div>
        </div>
      </div>`;
    }

    function renderDeleteAccountModal() {
      const CONFIRM_TEXT = currentNickname === '管理员' ? '开发者测试' : '我已知晓我现在的行为，此操作将会删除我的所有账户数据，我愿意承担所有的责任';
      return `<div class="dialog-modal" id="deleteAccountModal" onclick="event.target.id==='deleteAccountModal' && event.target.classList.remove('active')">
        <div class="dialog-modal-content" onclick="event.stopPropagation()">
          <h3 style="color:#e53935;">注销账号</h3>
          <div class="form-group">
            <label>请逐字输入下方确认短语（禁止粘贴）</label>
            <div class="confirm-phrase-box" oncontextmenu="return false;" onselectstart="return false;">${CONFIRM_TEXT}</div>
            <input type="text" id="deleteAccountConfirm" placeholder="请在此输入上方短语" onpaste="return false;" ondrop="return false;" oncontextmenu="return false;" autocomplete="off">
          </div>
          <div class="form-group">
            <label>手机验证码</label>
            <div style="display:flex; gap:8px;">
              <input type="text" id="deleteAccountCode" maxlength="6" placeholder="请输入验证码" style="flex:1;">
              <button class="btn btn-outline" id="getDeleteCodeBtn" onclick="sendDeleteAccountCode()">获取验证码</button>
            </div>
          </div>
          <div class="btn-group">
            <button class="btn btn-outline" onclick="document.getElementById('deleteAccountModal').classList.remove('active')">取消</button>
            <button class="btn btn-danger" onclick="submitDeleteAccount()">确认注销</button>
          </div>
        </div>
      </div>`;
    }

    function renderLogoutConfirmModal() {
      return `<div class="dialog-modal" id="logoutConfirmModal" onclick="event.target.id==='logoutConfirmModal' && event.target.classList.remove('active')">
        <div class="dialog-modal-content" onclick="event.stopPropagation()">
          <h3>确认退出登录</h3>
          <p>确定要退出登录吗？</p>
          <div class="btn-group">
            <button class="btn btn-outline" onclick="document.getElementById('logoutConfirmModal').classList.remove('active')">取消</button>
            <button class="btn btn-primary" onclick="document.getElementById('logoutConfirmModal').classList.remove('active'); logout();">确定</button>
          </div>
        </div>
      </div>`;
    }

    let feedbackFiles = [];
    function renderFeedbackModal() {
      return `<div class="dialog-modal" id="feedbackModal" onclick="event.target.id==='feedbackModal' && event.target.classList.remove('active')">
        <div class="dialog-modal-content" onclick="event.stopPropagation()">
          <h3>提交反馈</h3>
          <div class="form-group">
            <textarea id="feedbackContent" rows="5" placeholder="请详细描述您的建议或遇到的问题..."></textarea>
          </div>
          <div class="feedback-upload-area" id="feedbackUploadArea">
            <div class="feedback-upload-btn" onclick="document.getElementById('feedbackFileInput').click()">+</div>
            <input type="file" id="feedbackFileInput" accept="image/*,video/*" multiple style="display:none;" onchange="handleFeedbackFileSelect(event)">
          </div>
          <div class="btn-group">
            <button class="btn btn-outline" onclick="closeFeedbackModal()">取消</button>
            <button class="btn btn-primary" onclick="submitFeedbackModal()">提交</button>
          </div>
        </div>
      </div>`;
    }

    function openFeedbackModal() {
      feedbackFiles = [];
      const m = document.getElementById('feedbackModal');
      const ta = document.getElementById('feedbackContent');
      const area = document.getElementById('feedbackUploadArea');
      if (ta) ta.value = '';
      if (area) renderFeedbackUploadItems();
      if (m) m.classList.add('active');
    }

    function closeFeedbackModal() {
      document.getElementById('feedbackModal').classList.remove('active');
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
          showToast('最多上传9个文件');
          break;
        }
        feedbackFiles.push(f);
      }
      event.target.value = '';
      renderFeedbackUploadItems();
    }

    function renderFeedbackUploadItems() {
      const area = document.getElementById('feedbackUploadArea');
      if (!area) return;
      let html = '';
      for (let i = 0; i < feedbackFiles.length; i++) {
        const f = feedbackFiles[i];
        const isImage = f.type.startsWith('image/');
        const url = URL.createObjectURL(f);
        html += `<div class="feedback-upload-item">
          ${isImage ? `<img src="${url}" alt="">` : `<video src="${url}"></video><div class="play-icon"><i class="fa-solid fa-play"></i></div>`}
          <div class="feedback-upload-remove" onclick="removeFeedbackFile(${i})">&times;</div>
        </div>`;
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
      const content = document.getElementById('feedbackContent').value.trim();
      if (!content) return showToast('请输入反馈内容');
      if (!currentUsername) {
        try {
          const r = await api('/userInfo', 'POST');
          if (r.code === 1 && r.data && r.data.phone) currentUsername = r.data.phone;
        } catch(e) {}
      }
      if (!currentUsername) return showToast('请先登录');

      const submitBtn = event.target;
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = '提交中...';

      try {
        const formData = new FormData();
        formData.append('username', currentUsername);
        formData.append('content', content);
        for (let i = 0; i < feedbackFiles.length; i++) {
          formData.append('file' + i, feedbackFiles[i]);
        }
        formData.append('fileCount', feedbackFiles.length);

        const res = await fetch(API_BASE + '/submitFeedback', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + getToken() },
          body: formData
        }).then(r => r.json());

        if (res.code === 1) {
          showToast('感谢您的反馈！');
          closeFeedbackModal();
        } else {
          showToast(res.msg || '提交失败');
        }
      } catch(e) {
        showToast('提交失败');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }

    async function bindEditProfileEvents() {

      let tokenPhone = '';
      try {
        const t = getToken();
        if (t) {
          const decoded = atob(t);
          const parts = decoded.split(':');
          if (parts.length >= 2) tokenPhone = parts[1];
        }
      } catch(e) {}

      try {
        const res = await api('/userInfo', 'POST');
        if (res.code === 1) {
          const u = res.data;

          const avatarEl = document.getElementById('editAvatar');
          const nicknameEl = document.getElementById('editNickname');
          const bioEl = document.getElementById('editBio');
          const genderEl = document.getElementById('editGender');
          if (avatarEl) avatarEl.src = resolveMediaUrl(u.avatar) || DEFAULT_AVATAR;
          if (nicknameEl) nicknameEl.value = u.nickname || '';
          if (bioEl) bioEl.value = u.bio || '';
          if (genderEl) genderEl.value = u.gender || '0';
          initBirthSelects(u.birthday || '');
          editCountryCode = u.country_code || 'CN';
          editCountryName = u.country_name || '中国大陆';
          const countryDisplay = document.getElementById('editCountryDisplay');
          if (countryDisplay) countryDisplay.textContent = editCountryName;
          const strangerSwitch = document.getElementById('editStrangerMsg');
          if (strangerSwitch) {
            strangerSwitch.checked = !!(u.allow_stranger_msg);
            strangerSwitch.onchange = async function() {
              try {
                const r = await api('/updateStrangerSetting', 'POST', { allow_stranger_msg: this.checked ? 1 : 0 });
                if (r.code === 1) {
                  showToast(this.checked ? '已开启陌生人私信' : '已关闭陌生人私信');
                } else {
                  showToast(r.msg || '修改失败');
                  this.checked = !this.checked;
                }
              } catch(e) {
                showToast('修改失败');
                this.checked = !this.checked;
              }
            };
          }

          const phone = u.phone || tokenPhone || '';
          currentUsername = phone;
          const masked = phone ? phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '未绑定';
          const secPhoneEl = document.getElementById('secPhone');
          const curPhoneDisplayEl = document.getElementById('curPhoneDisplay');
          if (secPhoneEl) secPhoneEl.textContent = masked;
          if (curPhoneDisplayEl) curPhoneDisplayEl.value = masked;

          const fansSwitch = document.getElementById('showFansListSwitch');
          if (fansSwitch) {
            const showFans = u.show_fans_list === undefined ? 1 : u.show_fans_list;
            fansSwitch.checked = !!showFans;
            applyFansListSwitchStyle(!!showFans);
          }

          const privateSwitch = document.getElementById('isPrivateSwitch');
          if (privateSwitch) {
            const isPrivate = u.is_private === 1;
            privateSwitch.checked = isPrivate;
            applyPrivateSwitchStyle(isPrivate);
          }

            const youthMode = u.youth_mode;
            const ymEl = document.getElementById('youthModeStatus');
            if (ymEl) ymEl.textContent = youthMode ? '已开启' : '未开启';

          const verifTypesRaw = u.verifications || [];
          const verifTypes = verifTypesRaw.map(v => typeof v === 'string' ? v : v.type);
          if (verifTypes.length > 0) {
            const verifArea = document.getElementById('verifSettingsArea');
            if (verifArea) {
              let settings = {};
              try { settings = u.verif_settings ? (typeof u.verif_settings === 'string' ? JSON.parse(u.verif_settings) : u.verif_settings) : {}; } catch(e) {}
              const nameDisplay = settings.name_display || 'earliest';
              const profileHidden = (settings.profile_hidden && Array.isArray(settings.profile_hidden)) ? settings.profile_hidden : [];
              const verifConfigs = [
                { type: 'personal', label: 'Beta版内测用户纪念认证' },
                { type: 'advanced', label: '进阶认证用户' },
                { type: 'premium', label: '高级认证用户' },
                { type: 'enterprise', label: '企业/机构/团体认证' },
                { type: 'basic', label: '普通认证用户' }
              ];
              const userVerifs = verifConfigs.filter(c => verifTypes.includes(c.type));

              const sortedVerifs = [];
              verifTypes.forEach(t => { const found = userVerifs.find(c => c.type === t); if (found) sortedVerifs.push(found); });
              const defaultMain = sortedVerifs.length ? sortedVerifs[0].type : '';
              let html = '<div class="ep-section ep-section-animate" style="animation-delay:0.09s;"><div class="ep-section-title">认证设置</div>';

              html += '<div class="ep-item"><div class="ep-item-label">主要认证</div><div class="ep-item-desc" style="margin-bottom:10px;">选中的认证将在名字旁边展示</div>';
              html += '<div id="verifMainList" style="display:flex;flex-direction:column;gap:0;">';
              sortedVerifs.forEach(c => {
                const isSelected = nameDisplay === c.type;
                const isDefault = nameDisplay === 'earliest' && c.type === defaultMain;
                const active = isSelected || isDefault;
                html += '<div class="verif-radio-item' + (active ? ' active' : '') + '" data-verif-type="' + c.type + '" onclick="selectVerifMain(this)">' + getVerifSvg(c.type, 16) + '<span style="flex:1;margin-left:8px;font-size:14px;">' + c.label + '</span>' + (active ? '<i class="fa-solid fa-circle-check" style="color:var(--color-primary);font-size:18px;"></i>' : '<i class="fa-regular fa-circle" style="color:#ccc;font-size:18px;"></i>') + '</div>';
              });
              html += '</div></div>';

              html += '<div class="ep-item" style="margin-top:4px;"><div class="ep-item-label">主页展示认证</div><div class="ep-item-desc" style="margin-bottom:10px;">选中的认证将在个人主页中展示，可多选</div>';
              html += '<div id="verifProfileList" style="display:flex;flex-direction:column;gap:0;">';
              sortedVerifs.forEach(c => {
                const checked = !profileHidden.includes(c.type);
                html += '<div class="verif-check-item' + (checked ? ' active' : '') + '" data-verif-type="' + c.type + '" onclick="toggleVerifProfile(this)">' + getVerifSvg(c.type, 16) + '<span style="flex:1;margin-left:8px;font-size:14px;">' + c.label + '</span>' + (checked ? '<i class="fa-solid fa-square-check" style="color:var(--color-primary);font-size:18px;"></i>' : '<i class="fa-regular fa-square" style="color:#ccc;font-size:18px;"></i>') + '</div>';
              });
              html += '</div></div>';
              html += '</div>';
              verifArea.innerHTML = html;

              window._verifMainSelected = nameDisplay === 'earliest' ? defaultMain : nameDisplay;
            }
          }
        } else {

          const phone = tokenPhone;
          currentUsername = phone;
          const masked = phone ? phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '未登录';
          const secPhoneEl = document.getElementById('secPhone');
          const curPhoneDisplayEl = document.getElementById('curPhoneDisplay');
          if (secPhoneEl) secPhoneEl.textContent = masked;
          if (curPhoneDisplayEl) curPhoneDisplayEl.value = masked;
        }
      } catch(e) {

        const phone = tokenPhone;
        currentUsername = phone;
        const masked = phone ? phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '加载失败';
        const secPhoneEl = document.getElementById('secPhone');
        const curPhoneDisplayEl = document.getElementById('curPhoneDisplay');
        if (secPhoneEl) secPhoneEl.textContent = masked;
        if (curPhoneDisplayEl) curPhoneDisplayEl.value = masked;
      }

      const confirmInput = document.getElementById('deleteAccountConfirm');
      if (confirmInput) {
        window.deleteAccountLastValid = '';
        confirmInput.addEventListener('input', function(e) {
          if (this.dataset.composing === 'true') return;
          const val = this.value;
          if (val.length - window.deleteAccountLastValid.length > 1) {
            this.value = window.deleteAccountLastValid;
            showToast('禁止粘贴，请逐字输入');
          } else {
            window.deleteAccountLastValid = val;
          }
        });
        confirmInput.addEventListener('compositionstart', function() { this.dataset.composing = 'true'; });
        confirmInput.addEventListener('compositionend', function() {
          this.dataset.composing = 'false';
          const event = new Event('input', { bubbles: true });
          this.dispatchEvent(event);
        });
      }
    }

    function initBirthSelects(birthday) {
      const yearSel = document.getElementById('editBirthYear');
      const monthSel = document.getElementById('editBirthMonth');
      const daySel = document.getElementById('editBirthDay');
      const currentYear = new Date().getFullYear();
      for (let y = currentYear; y >= 1900; y--) {
        const opt = document.createElement('option');
        opt.value = y; opt.textContent = y;
        yearSel.appendChild(opt);
      }
      for (let m = 1; m <= 12; m++) {
        const opt = document.createElement('option');
        opt.value = m; opt.textContent = m + '月';
        monthSel.appendChild(opt);
      }
      function fillDays() {
        daySel.innerHTML = '<option value="">日</option>';
        const y = parseInt(yearSel.value);
        const m = parseInt(monthSel.value);
        if (!y || !m) return;
        const maxDay = new Date(y, m, 0).getDate();
        for (let d = 1; d <= maxDay; d++) {
          const opt = document.createElement('option');
          opt.value = d; opt.textContent = d + '日';
          daySel.appendChild(opt);
        }
      }
      yearSel.addEventListener('change', fillDays);
      monthSel.addEventListener('change', fillDays);
      if (birthday) {
        const clean = birthday.replace(/-/g, '/');
        if (/^\d{4}\/\d{2}\/\d{2}$/.test(clean)) {
          const parts = clean.split('/');
          yearSel.value = parts[0];
          monthSel.value = parseInt(parts[1]);
          fillDays();
          daySel.value = parseInt(parts[2]);
        }
      }
    }

    function openCountryPicker() {
      const overlay = document.getElementById('countryPickerOverlay');
      if (overlay) overlay.classList.add('active');
      renderCountryList('');
    }

    function closeCountryPicker() {
      const overlay = document.getElementById('countryPickerOverlay');
      if (overlay) overlay.classList.remove('active');
    }

    function filterCountries(keyword) {
      renderCountryList(keyword || '');
    }

    function renderCountryList(filter) {
      const listEl = document.getElementById('countryList');
      if (!listEl) return;
      const keyword = filter || '';
      listEl.innerHTML = ALL_COUNTRIES.filter(c => c.name.indexOf(keyword) !== -1).map(c => `
        <div style="padding:12px 16px;cursor:pointer;font-size:15px;border-radius:8px;${c.code === editCountryCode ? 'background:var(--color-primary-light);color:var(--color-primary);font-weight:600;' : ''}" onclick="selectCountry('${c.code}', '${c.name}')">${c.name}</div>
      `).join('');
    }

    function selectCountry(code, name) {
      editCountryCode = code;
      editCountryName = name;
      document.getElementById('editCountryDisplay').textContent = name;
      closeCountryPicker();
    }

    async function uploadNewAvatar(file) {
      if (!file) return;
      const fd = new FormData();
      fd.append('avatar', file);
      try {
        const res = await apiForm('/uploadAvatar', fd);
        if (res.code === 1) {
          document.getElementById('editAvatar').src = resolveMediaUrl(res.data.avatar);
          showToast('头像上传成功');
        } else {
          if (res.msg && res.msg.indexOf('涉嫌') !== -1) {
            showViolationBubble('已违规');
          } else {
            showToast(res.msg || '上传失败');
          }
        }
      } catch(e) {
        showToast('上传失败');
      }
    }

    function selectVerifMain(el) {
      document.querySelectorAll('.verif-radio-item').forEach(item => {
        item.classList.remove('active');
        const icon = item.querySelector('i');
        if (icon) { icon.className = 'fa-regular fa-circle'; icon.style.color = '#ccc'; }
      });
      el.classList.add('active');
      const icon = el.querySelector('i');
      if (icon) { icon.className = 'fa-solid fa-circle-check'; icon.style.color = 'var(--color-primary)'; }
      window._verifMainSelected = el.dataset.verifType;
    }
    function toggleVerifProfile(el) {
      el.classList.toggle('active');
      const icon = el.querySelector('i');
      if (el.classList.contains('active')) {
        if (icon) { icon.className = 'fa-solid fa-square-check'; icon.style.color = 'var(--color-primary)'; }
      } else {
        if (icon) { icon.className = 'fa-regular fa-square'; icon.style.color = '#ccc'; }
      }
    }
    async function saveProfile() {
      const nickname = document.getElementById('editNickname').value.trim();
      const bio = document.getElementById('editBio').value.trim();
      const gender = document.getElementById('editGender').value;
      const y = document.getElementById('editBirthYear').value;
      const m = document.getElementById('editBirthMonth').value;
      const d = document.getElementById('editBirthDay').value;
      const birthday = (y && m && d) ? y + '/' + String(m).padStart(2,'0') + '/' + String(d).padStart(2,'0') : '';

      const mainType = window._verifMainSelected || '';
      const profileItems = document.querySelectorAll('.verif-check-item');
      let verif_settings = '';
      if (mainType || profileItems.length) {
        const profileHidden = [];
        profileItems.forEach(el => { if (!el.classList.contains('active')) profileHidden.push(el.dataset.verifType); });
        verif_settings = JSON.stringify({ name_display: mainType || 'earliest', profile_hidden: profileHidden });
      }
      try {
        const payload = { nickname, bio, gender, birthday, country_code: editCountryCode, country_name: editCountryName };
        if (verif_settings) payload.verif_settings = verif_settings;
        const res = await api('/updateProfile', 'POST', payload);
        if (res.code === 1) {
          showToast('保存成功');
          goPage('profile');
        } else {
          showToast(res.msg || '保存失败');
        }
      } catch(e) {
        showToast('保存失败');
      }
    }

    function maskPhone(phone) {
      if (!phone || phone.length < 7) return '****';
      return phone = phone.replace(/^\+?(\d{3})\d{4}(\d{4})$/, '+86 $1****$2');
    }

    function renderSecuritySettings() {
      return `<div class="page">
        <div class="navbar"><div onclick="goPage('profile')" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div><h1 style="flex:1;text-align:center;">账号与安全</h1><div style="width:60px;"></div></div>
        <div class="security-page">
          <div class="sec-card sec-card-animate" style="animation-delay:0.02s;">
            <div class="sec-card-title">账号安全</div>
            <div class="sec-item" onclick="showChangePhoneModal()">
              <div class="sec-item-icon sec-icon-phone"><i class="fa-solid fa-mobile-screen-button"></i></div>
              <div class="sec-item-body">
                <div class="sec-item-label">手机号</div>
                <div class="sec-item-sub" id="secPhone">加载中...</div>
              </div>
              <div class="sec-item-action"><span class="sec-action-btn">修改</span><i class="fa-solid fa-chevron-right sec-chevron"></i></div>
            </div>
          </div>
          <div class="sec-card sec-card-animate" style="animation-delay:0.06s;">
            <div class="sec-card-title">意见反馈</div>
            <div class="sec-item" onclick="goPage('feedback')">
              <div class="sec-item-icon sec-icon-feedback"><i class="fa-regular fa-comment-dots"></i></div>
              <div class="sec-item-body">
                <div class="sec-item-label">意见反馈</div>
                <div class="sec-item-desc">帮助我们改进产品</div>
              </div>
              <i class="fa-solid fa-chevron-right sec-chevron"></i>
            </div>
          </div>
          <div class="sec-card sec-card-danger sec-card-animate" style="animation-delay:0.10s;">
            <div class="sec-item" onclick="confirmLogout()">
              <div class="sec-item-icon sec-icon-logout"><i class="fa-solid fa-arrow-right-from-bracket"></i></div>
              <div class="sec-item-body">
                <div class="sec-item-label sec-label-danger">退出登录</div>
              </div>
              <i class="fa-solid fa-chevron-right sec-chevron"></i>
            </div>
          </div>
          <div class="sec-card sec-card-animate" style="animation-delay:0.14s;padding:16px;">
            <button class="sec-danger-full-btn" onclick="showDeleteAccountModal()"><i class="fa-solid fa-triangle-exclamation"></i> 注销账号</button>
          </div>
        </div>
        ${renderChangePhoneModal()}
        ${renderConfirmDeleteFirstModal()}
        ${renderDeleteAccountModal()}
        ${renderLogoutConfirmModal()}
        ${renderFeedbackModal()}
      </div>`;
    }

    async function bindSecuritySettingsEvents() {
      try {
        const res = await api('/userInfo', 'POST');
        if (res.code === 1) {
          const phone = res.data.phone || '';
          const masked = maskPhone(phone);
          const p1 = document.getElementById('secPhone');
          const p2 = document.getElementById('curPhoneDisplay');
          if (p1) p1.textContent = masked;
          if (p2) p2.textContent = masked;
        }
      } catch(e) {}
    }

    let changePhoneCodeTimer = null;
    let changePhoneCountdown = 0;

    async function sendChangePhoneCode() {
      if (changePhoneCountdown > 0) return;
      if (!currentUsername) {
        try {
          const r = await api('/userInfo', 'POST');
          if (r.code === 1 && r.data && r.data.phone) currentUsername = r.data.phone;
        } catch(e) {}
      }
      if (!currentUsername) return showToast('请先登录');
      const res = await openCaptchaForAction('changePhone', '/sendChangePhoneCode', { username: currentUsername });
      if (res && (res.code === 1 || res.Code === 'Success')) {
        showToast('验证码已发送');
        changePhoneCountdown = 60;
        const btn = document.getElementById('getChangePhoneCodeBtn');
        if (btn) {
          btn.disabled = true;
          btn.style.opacity = '0.6';
          btn.textContent = changePhoneCountdown + 's后重新发送';
        }
        changePhoneCodeTimer = setInterval(() => {
          changePhoneCountdown--;
          if (changePhoneCountdown <= 0) {
            clearInterval(changePhoneCodeTimer);
            if (btn) {
              btn.disabled = false;
              btn.style.opacity = '1';
              btn.textContent = '获取验证码';
            }
          } else {
            if (btn) btn.textContent = changePhoneCountdown + 's后重新发送';
          }
        }, 1000);
      } else {
        showToast((res && (res.msg || res.Message)) || '发送失败');
      }
    }

    function showChangePhoneModal() {
      const m = document.getElementById('changePhoneModal');
      if (m) m.classList.add('active');
    }
    function showDeleteAccountModal() {
      const m = document.getElementById('confirmDeleteFirstModal');
      if (m) m.classList.add('active');
    }
    function proceedToDeleteAccountModal() {
      document.getElementById('confirmDeleteFirstModal').classList.remove('active');
      document.getElementById('deleteAccountConfirm').value = '';
      window.deleteAccountLastValid = '';
      document.getElementById('deleteAccountCode').value = '';
      document.getElementById('deleteAccountModal').classList.add('active');
    }
    function closeChangePhoneModal() {
      const m = document.getElementById('changePhoneModal');
      if (m) m.classList.remove('active');
    }

    async function submitChangePhone() {
      const code = document.getElementById('changePhoneCode').value.trim();
      const newPhone = document.getElementById('newPhone').value.trim();
      if (!code) return showToast('请输入验证码');
      if (!/^1\d{10}$/.test(newPhone)) return showToast('请输入正确的手机号');
      try {
        const res = await api('/changePhone', 'POST', { username: currentUsername, code, newPhone });
        if (res.code === 1) {
          showToast('手机号已修改');
          if (res.data && res.data.token) setToken(res.data.token);
          currentUsername = newPhone;
          document.getElementById('changePhoneModal').classList.remove('active');
          setTimeout(() => {
            const secPhoneEl = document.getElementById('secPhone');
            const curPhoneDisplayEl = document.getElementById('curPhoneDisplay');
            const masked = newPhone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
            if (secPhoneEl) secPhoneEl.textContent = masked;
            if (curPhoneDisplayEl) curPhoneDisplayEl.value = masked;
          }, 300);
        } else {
          showToast(res.msg || '修改失败');
        }
      } catch(e) {
        showToast('修改失败');
      }
    }

    let deleteAccountCodeTimer = null;
    let deleteAccountCountdown = 0;

    async function sendDeleteAccountCode() {
      if (deleteAccountCountdown > 0) return;
      const confirmText = document.getElementById('deleteAccountConfirm').value.trim();
      const requiredText = currentNickname === '管理员' ? '开发者测试' : '我已知晓我现在的行为，此操作将会删除我的所有账户数据，我愿意承担所有的责任';
      if (confirmText !== requiredText) {
        showToast('请先正确输入确认短语');
        return;
      }
      if (!currentUsername) {
        try {
          const r = await api('/userInfo', 'POST');
          if (r.code === 1 && r.data && r.data.phone) currentUsername = r.data.phone;
        } catch(e) {}
      }
      if (!currentUsername) return showToast('请先登录');
      const res = await openCaptchaForAction('deleteAccount', '/sendDeleteAccountCode', { username: currentUsername });
      if (res && (res.code === 1 || res.Code === 'Success')) {
        showToast('验证码已发送');
        deleteAccountCountdown = 60;
        const btn = document.getElementById('getDeleteCodeBtn');
        if (btn) {
          btn.disabled = true;
          btn.style.opacity = '0.6';
          btn.textContent = deleteAccountCountdown + 's后重新发送';
        }
        deleteAccountCodeTimer = setInterval(() => {
          deleteAccountCountdown--;
          if (deleteAccountCountdown <= 0) {
            clearInterval(deleteAccountCodeTimer);
            if (btn) {
              btn.disabled = false;
              btn.style.opacity = '1';
              btn.textContent = '获取验证码';
            }
          } else {
            if (btn) btn.textContent = deleteAccountCountdown + 's后重新发送';
          }
        }, 1000);
      } else {
        showToast((res && (res.msg || res.Message)) || '发送失败');
      }
    }

    function closeDeleteAccountModal() {
      const m = document.getElementById('deleteAccountModal');
      if (m) m.classList.remove('active');
    }

    async function submitDeleteAccount() {
      const confirmText = document.getElementById('deleteAccountConfirm').value.trim();
      const requiredText = currentNickname === '管理员' ? '开发者测试' : '我已知晓我现在的行为，此操作将会删除我的所有账户数据，我愿意承担所有的责任';
      if (confirmText !== requiredText) return showToast('请逐字输入确认短语');
      const code = document.getElementById('deleteAccountCode').value.trim();
      if (!code) return showToast('请输入验证码');
      if (!currentUsername) {
        try {
          const r = await api('/userInfo', 'POST');
          if (r.code === 1 && r.data && r.data.phone) currentUsername = r.data.phone;
        } catch(e) {}
      }
      try {
        const res = await api('/deleteAccount', 'POST', { username: currentUsername, code });
        if (res.code === 1) {
          showToast('账号已注销');
          document.getElementById('deleteAccountModal').classList.remove('active');
          setTimeout(() => {
            localStorage.removeItem('zanhua_token');
            location.reload();
          }, 1500);
        } else {
          showToast(res.msg || '注销失败');
        }
      } catch(e) {
        showToast('注销失败');
      }
    }

    function confirmLogout() {
      const m = document.getElementById('logoutConfirmModal');
      if (m) m.classList.add('active');
    }
    function closeLogoutModal() {
      const m = document.getElementById('logoutConfirmModal');
      if (m) m.classList.remove('active');
    }

    function renderFeedback() {
      return `<div class="page">
        <div class="navbar"><div onclick="goPage('securitySettings')" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div><h1 style="flex:1;text-align:center;">意见反馈</h1><div style="width:60px;"></div></div>
        <div style="padding:16px;">
          <div style="background:#fff;border-radius:12px;padding:16px;margin-bottom:16px;">
            <div style="font-size:15px;font-weight:600;margin-bottom:10px;">我们重视你的声音</div>
            <div style="font-size:13px;color:#999;line-height:1.6;">无论是功能建议还是问题反馈，都欢迎随时告诉我们</div>
          </div>
          <textarea id="feedbackContent" class="feedback-textarea" placeholder="请详细描述您的建议或遇到的问题..."></textarea>
          <button class="feedback-submit-btn" onclick="submitFeedback()">提交反馈</button>
        </div>
      </div>`;
    }

    function bindFeedbackEvents() {
      const ta = document.getElementById('feedbackContent');
      if (ta) {
        ta.addEventListener('input', function() {
          if (this.value.length > 2000) {
            this.value = this.value.slice(0, 2000);
            showToast('反馈内容最多2000字');
          }
        });
      }
    }

    async function submitFeedback() {
      const content = document.getElementById('feedbackContent').value.trim();
      if (!content) return showToast('请输入反馈内容');
      if (!currentUsername) {
        try {
          const r = await api('/userInfo', 'POST');
          if (r.code === 1 && r.data && r.data.phone) currentUsername = r.data.phone;
        } catch(e) {}
      }
      if (!currentUsername) return showToast('请先登录');
      try {
        const res = await api('/submitFeedback', 'POST', { username: currentUsername, content });
        if (res.code === 1) {
          showToast('感谢您的反馈！');
          setTimeout(() => { goPage('securitySettings'); }, 1000);
        } else {
          showToast(res.msg || '提交失败');
        }
      } catch(e) {
        showToast('提交失败');
      }
    }

    function openCaptchaForAction(action, apiPath, extraData) {
      return new Promise((resolve) => {
        let tempCaptchaIns = null;
        let resolved = false;
        const boxId = 'tempCaptchaBox_' + Date.now();
        const captchaEl = document.createElement('div');
        captchaEl.id = boxId;
        captchaEl.style.display = 'none';
        document.body.appendChild(captchaEl);

        const postData = Object.assign({}, extraData || {});

        function cleanup() {
          if (document.body.contains(captchaEl)) {
            try { captchaEl.remove(); } catch(e) {}
          }
        }

        function tryInit() {
          if (typeof window.initAliyunCaptcha !== 'function') {
            setTimeout(tryInit, 200);
            return;
          }
          window.initAliyunCaptcha({
            SceneId: "eh5it1ar",
            mode: "popup",
            element: '#' + boxId,
            language: "cn",
            timeout: 10000,
            getInstance: function(ins) {
              tempCaptchaIns = ins;
              if (ins && ins.show) ins.show();
            },
            captchaVerifyCallback: function(param) {
              postData.captchaVerifyParam = param;
              return fetch(API_BASE + apiPath, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
                body: JSON.stringify(postData)
              }).then(res => res.json()).then(data => {
                const ok = data.code === 1 || data.Code === 'Success';
                if (ok) {
                  if (!resolved) { resolve(data); resolved = true; }
                  setTimeout(cleanup, 300);
                  return { captchaResult: true, bizResult: true };
                } else {
                  showToast(data.msg || data.Message || '验证失败');
                  return { captchaResult: false, bizResult: false };
                }
              }).catch(() => {
                showToast('网络异常');
                return { captchaResult: false, bizResult: false };
              });
            },
            onBizResultCallback: function(bizResult) {
            },
            closeCallback: function() {
              if (!resolved) { resolve(null); resolved = true; }
              setTimeout(cleanup, 100);
            }
          });
        }
        tryInit();
      });
    }

    async function checkAccountValid() {
      const token = getToken();
      if (!token) return;
      try {
        const res = await api('/userInfo', 'POST');
        if (res.code !== 1) {
          localStorage.clear();
          goPage('home');
          showToast('登录状态已失效，请重新登录');
        } else {
          if (res.data) {
            myAvatar = res.data.avatar || '';
            currentNickname = res.data.nickname || '';
            myVerificationTypes = getVerificationTypes(res.data);
            myVerifications = Array.isArray(res.data.verifications) ? res.data.verifications : [];
          }
        }
      } catch(e) {
        localStorage.clear();
        goPage('home');
        showToast('登录状态已失效，请重新登录');
      }
    }

    let followListUid = '';
    let followListSelected = new Set();
    let fansListUid = '';

    function goFollowList(uid) {
      if (!getToken()) { showLoginModal(); return; }
      followListUid = uid;
      followListSelected = new Set();
      goPage('followListPage');
    }

    function goFansList(uid) {
      if (!getToken()) { showLoginModal(); return; }
      fansListUid = uid;
      goPage('fansListPage');
    }

    function renderFollowListPage() {
      return `<div class="page" style="background:#fff;min-height:100vh;">
        <div class="navbar" style="position:sticky;top:0;z-index:100;background:#fff;">
          <div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div>
          <h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">关注列表</h1>
          <div id="followBatchEntry" style="width:60px;text-align:center;font-size:14px;color:var(--color-primary);cursor:pointer;display:none;" onclick="toggleFollowBatchMode()">管理</div>
        </div>
        <div id="followListContent" style="padding-top:calc(50px + env(safe-area-inset-top));"><div class="loading" style="text-align:center;padding:40px;">加载中...</div></div>
        <div id="followBatchBar" style="display:none;position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:0.5px solid #eee;padding:12px 16px calc(12px + env(safe-area-inset-bottom));align-items:center;gap:12px;z-index:200;">
          <label style="display:flex;align-items:center;gap:6px;font-size:14px;cursor:pointer;">
            <input type="checkbox" id="followSelectAll" onchange="toggleFollowSelectAll(this.checked)" style="width:18px;height:18px;">
            <span>全选</span>
          </label>
          <button id="batchUnfollowBtn" onclick="confirmBatchUnfollow()" style="margin-left:auto;padding:8px 24px;background:#ff2442;color:#fff;border:none;border-radius:20px;font-size:14px;font-weight:500;cursor:pointer;opacity:0.5;pointer-events:none;">取消关注</button>
        </div>
      </div>`;
    }

    async function bindFollowListPageEvents() {
      try {
        const res = await api('/followList?uid=' + followListUid);
        const content = document.getElementById('followListContent');
        if (res.code !== 1) {
          content.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#999;">加载失败：' + (res.msg || '未知错误') + '</div>';
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
        const entry = document.getElementById('followBatchEntry');
        if (isMine && entry) entry.style.display = 'block';
      } catch (e) {
        console.error('followList error:', e);
        console.error('error stack:', e.stack);
        const content = document.getElementById('followListContent');
        if (content) {
          content.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#999;">加载失败：' + (e.message || '网络异常') + '</div>';
        }
      }
    }

    function renderFollowListItems(list, isMine) {
      const isBatch = document.getElementById('followBatchBar').style.display === 'flex';
      const content = document.getElementById('followListContent');
      content.innerHTML = list.map(u => {
        const checked = followListSelected.has(u.uid);
        return `<div style="display:flex;align-items:center;padding:12px 16px;border-bottom:0.5px solid #f0f0f0;${isBatch ? 'cursor:pointer;' : ''}" ${isBatch ? `onclick="toggleFollowSelect('${u.uid}')"` : ''}>
          ${isBatch ? `<div style="width:24px;height:24px;border:2px solid ${checked ? 'var(--color-primary)' : '#ccc'};border-radius:50%;margin-right:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${checked ? '<i class="fa-solid fa-check" style="color:var(--color-primary);font-size:12px;"></i>' : ''}</div>` : ''}
          <img src="${resolveMediaUrl(u.avatar)||DEFAULT_AVATAR}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">
          <div style="flex:1;margin-left:12px;overflow:hidden;">
            <div style="font-size:15px;font-weight:500;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(u.nickname||'用户'+u.uid)}</div>
          </div>
          ${isMine && !isBatch ? `<button onclick="event.stopPropagation();goUserProfile('${u.uid}')" style="padding:6px 14px;background:#f5f5f5;color:#333;border:none;border-radius:14px;font-size:13px;cursor:pointer;">主页</button>` : ''}
        </div>`;
      }).join('');
      updateBatchBtn();
    }

    function toggleFollowBatchMode() {
      const bar = document.getElementById('followBatchBar');
      const entry = document.getElementById('followBatchEntry');
      const isOn = bar.style.display === 'flex';
      if (isOn) {
        bar.style.display = 'none';
        entry.textContent = '管理';
        followListSelected = new Set();
      } else {
        bar.style.display = 'flex';
        entry.textContent = '完成';
      }
      renderFollowListItems(window._followListData || [], true);
    }

    function toggleFollowSelect(uid) {
      if (followListSelected.has(uid)) followListSelected.delete(uid);
      else followListSelected.add(uid);
      renderFollowListItems(window._followListData || [], true);
      const allSelected = (window._followListData || []).length > 0 && (window._followListData || []).every(u => followListSelected.has(u.uid));
      const selectAll = document.getElementById('followSelectAll');
      if (selectAll) selectAll.checked = allSelected;
    }

    function toggleFollowSelectAll(checked) {
      const list = window._followListData || [];
      if (checked) list.forEach(u => followListSelected.add(u.uid));
      else followListSelected.clear();
      renderFollowListItems(list, true);
    }

    function updateBatchBtn() {
      const btn = document.getElementById('batchUnfollowBtn');
      if (!btn) return;
      const count = followListSelected.size;
      btn.textContent = count > 0 ? `取消关注(${count})` : '取消关注';
      btn.style.opacity = count > 0 ? '1' : '0.5';
      btn.style.pointerEvents = count > 0 ? 'auto' : 'none';
    }

    function confirmBatchUnfollow() {
      const count = followListSelected.size;
      if (count === 0) return;
      const existing = document.getElementById('batchUnfollowConfirm');
      if (existing) existing.remove();
      const overlay = document.createElement('div');
      overlay.id = 'batchUnfollowConfirm';
      overlay.className = 'dialog-modal active';
      overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
      overlay.innerHTML = `<div class="dialog-modal-content" onclick="event.stopPropagation()" style="max-width:320px;">
        <h3 style="text-align:center;font-size:16px;">取消关注</h3>
        <p style="text-align:center;font-size:14px;color:#666;margin:12px 0 20px;">确定取消关注选中的 ${count} 个用户？</p>
        <div style="display:flex;gap:10px;">
          <button onclick="document.getElementById('batchUnfollowConfirm').remove()" style="flex:1;height:44px;background:#f5f5f5;border:none;border-radius:12px;font-weight:500;cursor:pointer;">取消</button>
          <button id="batchUnfollowOkBtn" style="flex:1;height:44px;background:#ff2442;color:#fff;border:none;border-radius:12px;font-weight:500;cursor:pointer;">确定</button>
        </div>
      </div>`;
      document.body.appendChild(overlay);
      document.getElementById('batchUnfollowOkBtn').onclick = async () => {
        overlay.remove();
        try {
          const res = await api('/batchUnfollow', 'POST', { uids: Array.from(followListSelected) });
          if (res.code === 1) {
            showToast('已取消关注');
            window._followListData = (window._followListData || []).filter(u => !followListSelected.has(u.uid));
            followListSelected = new Set();
            const selectAll = document.getElementById('followSelectAll');
            if (selectAll) selectAll.checked = false;
            renderFollowListItems(window._followListData, true);
          } else {
            showToast(res.msg || '操作失败');
          }
        } catch (e) {
          showToast('网络异常');
        }
      };
    }

    function renderFansListPage() {
      return `<div class="page" style="background:#fff;min-height:100vh;">
        <div class="navbar" style="position:sticky;top:0;z-index:100;background:#fff;">
          <div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div>
          <h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">粉丝列表</h1>
          <div style="width:60px;"></div>
        </div>
        <div id="fansListContent" style="padding-top:calc(50px + env(safe-area-inset-top));"><div class="loading" style="text-align:center;padding:40px;">加载中...</div></div>
      </div>`;
    }

    async function bindFansListPageEvents() {
      try {
        const res = await api('/fansList?uid=' + fansListUid);
        const content = document.getElementById('fansListContent');
        if (res.code !== 1) {
          if (res.hidden) {
            content.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#999;"><i class="fa-solid fa-lock" style="font-size:36px;margin-bottom:12px;display:block;"></i>' + (res.msg || '对方暂未开放展示粉丝列表') + '</div>';
          } else {
            content.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#999;">' + (res.msg || '加载失败') + '</div>';
          }
          return;
        }
        const list = res.data || [];
        if (list.length === 0) {
          content.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#999;">还没有粉丝</div>';
          return;
        }
        content.innerHTML = list.map(u => {
          return `<div style="display:flex;align-items:center;padding:12px 16px;border-bottom:0.5px solid #f0f0f0;cursor:pointer;" onclick="goUserProfile('${u.uid}')">
            <img src="${resolveMediaUrl(u.avatar)||DEFAULT_AVATAR}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="this.src='${DEFAULT_AVATAR}';this.onerror=null">
            <div style="flex:1;margin-left:12px;overflow:hidden;">
              <div style="font-size:15px;font-weight:500;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(u.nickname||'用户'+u.uid)}</div>
            </div>
            <button onclick="event.stopPropagation();goUserProfile('${u.uid}')" style="padding:6px 14px;background:#f5f5f5;color:#333;border:none;border-radius:14px;font-size:13px;cursor:pointer;">主页</button>
          </div>`;
        }).join('');
      } catch (e) {
        console.error('fansList error:', e);
        document.getElementById('fansListContent').innerHTML = '<div style="text-align:center;padding:60px 20px;color:#999;">加载失败：' + (e.message || '网络异常') + '</div>';
      }
    }

    function renderRealnameVerify() {
      return `<div class="page" style="background:#000;min-height:100vh;">
        <div class="navbar" style="background:#000;border-bottom:0.5px solid rgba(255,255,255,0.08);"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;color:#fff;"></i></div><h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;color:#fff;">实名认证</h1><div style="width:40px;"></div></div>
        <div style="padding:24px 20px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">${getVerifSvg('basic',28)}<div><div style="font-size:20px;font-weight:700;color:#fff;">普通认证</div><div style="font-size:13px;color:#8E8E93;margin-top:2px;">通过实名认证即可获得认证标识</div></div></div>
          <div style="background:#1C1C1E;border-radius:12px;padding:4px 16px;">
            <div style="padding:14px 0;border-bottom:0.5px solid rgba(255,255,255,0.06);">
              <div style="font-size:13px;color:#8E8E93;margin-bottom:8px;">真实姓名</div>
              <input id="rvName" type="text" placeholder="请输入真实姓名" style="width:100%;background:transparent;border:none;outline:none;font-size:16px;color:#fff;" maxlength="20">
            </div>
            <div style="padding:14px 0;">
              <div style="font-size:13px;color:#8E8E93;margin-bottom:8px;">身份证号码</div>
              <input id="rvIdcard" type="text" placeholder="请输入18位身份证号码" maxlength="18" style="width:100%;background:transparent;border:none;outline:none;font-size:16px;color:#fff;letter-spacing:1px;">
            </div>
          </div>
          <div style="margin-top:16px;padding:14px 16px;background:#1C1C1E;border-radius:12px;">
            <div style="font-size:12px;color:#8E8E93;line-height:1.8;">
              <i class="fa-solid fa-shield-halved" style="color:#3E993C;margin-right:4px;"></i>您的个人信息将被严格加密存储，仅用于身份核验。我们严格遵循《中华人民共和国个人信息保护法》及相关法律法规，不会将您的信息用于任何其他用途或向第三方泄露。
            </div>
          </div>
          <button id="rvSubmitBtn" style="width:100%;margin-top:24px;padding:14px;border:none;border-radius:12px;background:#3E993C;color:#fff;font-size:16px;font-weight:700;cursor:pointer;">提交认证</button>
        </div>
      </div>`;
    }
    function bindRealnameVerifyEvents() {
      document.getElementById('rvSubmitBtn').onclick = async () => {
        const name = document.getElementById('rvName').value.trim();
        const idcard = document.getElementById('rvIdcard').value.trim();
        if (!name) { showToast('请输入真实姓名'); return; }
        if (!idcard || idcard.length !== 18) { showToast('请输入18位身份证号码'); return; }
        const btn = document.getElementById('rvSubmitBtn');
        btn.textContent = '提交中...'; btn.style.opacity = '0.6'; btn.disabled = true;
        try {
          const r = await api('/realnameVerify', 'POST', { name, idcard });
          if (r.code === 1) {
            window._rvName = name;
            window._rvIdcard = idcard;
            if (r.data.is_minor) {
              pageHistory.push(currentPage);
              prevPage = currentPage;
              currentPage = 'parentConsent';
              setTabbarVisible(false);
              render();
            } else {
              showToast('认证成功');
              setTimeout(() => goBack(), 800);
            }
          } else { showToast(r.msg || '认证失败'); }
        } catch(e) { showToast('网络异常'); }
        btn.textContent = '提交认证'; btn.style.opacity = '1'; btn.disabled = false;
      };
    }

    function renderParentConsent() {
      return `<div class="page" style="background:#000;min-height:100vh;">
        <div class="navbar" style="background:#000;border-bottom:0.5px solid rgba(255,255,255,0.08);"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;color:#fff;"></i></div><h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;color:#fff;">家长同意书</h1><div style="width:40px;"></div></div>
        <div style="padding:24px 20px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;"><div style="width:48px;height:48px;border-radius:12px;background:rgba(62,153,60,0.15);display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-child" style="font-size:24px;color:#3E993C;"></i></div><div><div style="font-size:18px;font-weight:700;color:#fff;">未成年人保护</div><div style="font-size:13px;color:#8E8E93;margin-top:2px;">检测到您是未成年人，需家长确认</div></div></div>
          <div style="background:#1C1C1E;border-radius:12px;padding:20px;margin-bottom:16px;">
            <div style="font-size:15px;font-weight:600;color:#fff;margin-bottom:12px;">家长/监护人同意书</div>
            <div style="font-size:13px;color:rgba(255,255,255,0.65);line-height:1.9;">
              <p style="margin-bottom:10px;">根据《中华人民共和国未成年人保护法》及相关法规，未成年人使用网络服务需取得家长或监护人的同意。</p>
              <p style="margin-bottom:10px;">本平台将自动开启<strong style="color:#fff;">青少年模式</strong>，在该模式下：</p>
              <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:12px;margin:10px 0;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><i class="fa-solid fa-check" style="color:#3E993C;font-size:12px;"></i><span style="color:rgba(255,255,255,0.75);">内容安全过滤，屏蔽不适宜内容</span></div>
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><i class="fa-solid fa-check" style="color:#3E993C;font-size:12px;"></i><span style="color:rgba(255,255,255,0.75);">限制使用时长，保护视力健康</span></div>
                <div style="display:flex;align-items:center;gap:8px;"><i class="fa-solid fa-check" style="color:#3E993C;font-size:12px;"></i><span style="color:rgba(255,255,255,0.75);">禁止充值打赏等消费行为</span></div>
              </div>
              <p>请家长/监护人仔细阅读后，点击下方按钮表示同意。</p>
            </div>
          </div>
          <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:20px;padding:0 4px;">
            <input type="checkbox" id="parentAgree" style="margin-top:3px;flex-shrink:0;width:18px;height:18px;accent-color:#3E993C;">
            <span style="flex:1;font-size:12px;color:#8E8E93;line-height:1.7;">我已阅读并同意<span onclick="navigateTo('minorPrivacy')" style="color:var(--color-primary);cursor:pointer;">《赞话未成年人（含儿童）隐私政策》</span>，确认本人为该用户的家长/法定监护人，同意其使用赞话平台服务。</span>
          </div>
          <button id="pcSubmitBtn" style="width:100%;padding:14px;border:none;border-radius:12px;background:#3E993C;color:#fff;font-size:16px;font-weight:700;cursor:pointer;">我已阅读并同意，确认提交</button>
          <div style="text-align:center;margin-top:12px;font-size:12px;color:rgba(255,255,255,0.25);">您也可以在设置中随时关闭青少年模式</div>
        </div>
      </div>`;
    }
    function bindParentConsentEvents() {
      document.getElementById('pcSubmitBtn').onclick = async () => {
        if (!document.getElementById('parentAgree').checked) { showToast('请先阅读并同意协议'); return; }
        const btn = document.getElementById('pcSubmitBtn');
        btn.textContent = '提交中...'; btn.style.opacity = '0.6'; btn.disabled = true;
        try {
          const r = await api('/parentConsent', 'POST', { name: window._rvName || '', idcard: window._rvIdcard || '' });
          if (r.code === 1) { showToast('认证成功，已开启青少年模式'); setTimeout(() => { goBack(); goBack(); }, 1000); }
          else { showToast(r.msg || '提交失败'); }
        } catch(e) { showToast('网络异常'); }
        btn.textContent = '我已阅读并同意，确认提交'; btn.style.opacity = '1'; btn.disabled = false;
      };
    }

    function renderEnterpriseApply() {
      const entVerif = myVerifications.find(v => (typeof v === 'string' ? v : v.type) === 'enterprise');
      if (entVerif) {
        const orgName = (typeof entVerif === 'object' && entVerif.org_name) ? entVerif.org_name : '已认证企业';
        return `<div class="page" style="background:#000;min-height:100vh;">
        <div class="navbar" style="background:#000;border-bottom:0.5px solid rgba(255,255,255,0.08);"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;color:#fff;"></i></div><h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;color:#fff;">企业/机构/团体认证</h1><div style="width:40px;"></div></div>
        <div style="padding:24px 20px;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;">
          <div style="width:72px;height:72px;border-radius:50%;background:rgba(29,155,240,0.12);display:flex;align-items:center;justify-content:center;margin-bottom:20px;">${getVerifSvg('enterprise',40)}</div>
          <div style="font-size:20px;font-weight:700;color:#fff;margin-bottom:8px;">已认证</div>
          <div style="font-size:15px;color:#8E8E93;margin-bottom:6px;">${orgName}</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.3);">企业/机构/团体认证已通过</div>
        </div>
      </div>`;
      }
      return `<div class="page" style="background:#000;min-height:100vh;">
        <div class="navbar" style="background:#000;border-bottom:0.5px solid rgba(255,255,255,0.08);"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;color:#fff;"></i></div><h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;color:#fff;">企业/机构/团体认证</h1><div style="width:40px;"></div></div>
        <div style="padding:24px 20px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">${getVerifSvg('enterprise',28)}<div><div style="font-size:20px;font-weight:700;color:#fff;">企业/机构/团体认证</div><div id="eaPriceHint" style="font-size:13px;color:#8E8E93;margin-top:2px;">¥249/年 · 审核3-5个工作日</div></div></div>
          <div style="font-size:15px;font-weight:600;color:#fff;margin-bottom:12px;">主体类型</div>
          <div style="background:#1C1C1E;border-radius:12px;padding:4px 16px;margin-bottom:20px;">
            <label class="ea-type-row" onclick="selectEntType('commercial')"><div style="display:flex;align-items:center;gap:10px;"><i class="fa-regular fa-circle" id="eaTypeCommercialIcon" style="font-size:18px;color:rgba(255,255,255,0.4);"></i><span style="color:#fff;font-size:15px;">营利性组织</span></div><span style="color:rgba(255,255,255,0.4);font-size:13px;">企业、公司等商业实体</span></label>
            <div style="height:0.5px;background:rgba(255,255,255,0.06);"></div>
            <label class="ea-type-row" onclick="selectEntType('government')"><div style="display:flex;align-items:center;gap:10px;"><i class="fa-regular fa-circle" id="eaTypeGovernmentIcon" style="font-size:18px;color:rgba(255,255,255,0.4);"></i><span style="color:#fff;font-size:15px;">党政机关/事业单位</span></div><span style="color:rgba(255,255,255,0.4);font-size:13px;">政府机关、事业单位、群体组织</span></label>
            <div style="height:0.5px;background:rgba(255,255,255,0.06);"></div>
            <label class="ea-type-row" onclick="selectEntType('ngo')"><div style="display:flex;align-items:center;gap:10px;"><i class="fa-regular fa-circle" id="eaTypeNgoIcon" style="font-size:18px;color:rgba(255,255,255,0.4);"></i><span style="color:#fff;font-size:15px;">民间非营利组织</span></div><span style="color:rgba(255,255,255,0.4);font-size:13px;">社会团体、基金会、民办非企业</span></label>
            <div style="height:0.5px;background:rgba(255,255,255,0.06);"></div>
            <label class="ea-type-row" onclick="selectEntType('education')"><div style="display:flex;align-items:center;gap:10px;"><i class="fa-regular fa-circle" id="eaTypeEducationIcon" style="font-size:18px;color:rgba(255,255,255,0.4);"></i><span style="color:#fff;font-size:15px;">教育机构</span></div><span style="color:rgba(255,255,255,0.4);font-size:13px;">学校、培训机构等教育单位</span></label>
          </div>
          <div id="eaFormFields">
            <div style="font-size:15px;font-weight:600;color:#fff;margin-bottom:12px;">主体信息</div>
            <div style="background:#1C1C1E;border-radius:12px;padding:4px 16px;margin-bottom:16px;">
              <div style="padding:14px 0;border-bottom:0.5px solid rgba(255,255,255,0.06);">
                <div style="font-size:13px;color:#8E8E93;margin-bottom:8px;">主体全称</div>
                <input id="eaFullName" type="text" placeholder="请输入主体全称" style="width:100%;background:transparent;border:none;outline:none;font-size:16px;color:#fff;">
              </div>
              <div style="padding:14px 0;border-bottom:0.5px solid rgba(255,255,255,0.06);">
                <div style="font-size:13px;color:#8E8E93;margin-bottom:8px;">统一社会信用代码</div>
                <input id="eaCreditCode" type="text" placeholder="请输入18位统一社会信用代码" maxlength="18" style="width:100%;background:transparent;border:none;outline:none;font-size:16px;color:#fff;letter-spacing:1px;">
              </div>
              <div id="eaDunsRow" style="padding:14px 0;border-bottom:0.5px solid rgba(255,255,255,0.06);display:none;">
                <div style="font-size:13px;color:#8E8E93;margin-bottom:8px;">D-U-N-S®编号（9位）</div>
                <input id="eaDuns" type="text" placeholder="请输入9位邓白氏编号" maxlength="9" style="width:100%;background:transparent;border:none;outline:none;font-size:16px;color:#fff;">
              </div>
              <div style="padding:14px 0;">
                <div style="font-size:13px;color:#8E8E93;margin-bottom:8px;">运营联系人姓名</div>
                <input id="eaContactName" type="text" placeholder="请输入联系人姓名" style="width:100%;background:transparent;border:none;outline:none;font-size:16px;color:#fff;">
              </div>
            </div>
            <div id="eaUploadSection" style="display:none;">
              <div style="font-size:15px;font-weight:600;color:#fff;margin-bottom:12px;">资质文件</div>
              <div style="background:#1C1C1E;border-radius:12px;padding:16px;margin-bottom:16px;">
                <div style="font-size:13px;color:rgba(255,255,255,0.4);line-height:1.6;" id="eaFileHint">请根据选择的主体类型上传对应材料</div>
                <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px;" id="eaFileList"></div>
                <label style="display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:8px 16px;border-radius:8px;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.7);font-size:13px;cursor:pointer;"><i class="fa-solid fa-plus"></i>上传文件<input type="file" multiple accept="image/*,.pdf" style="display:none;" onchange="uploadEntFiles(this)"></label>
              </div>
            </div>
          </div>
          <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:20px;padding:0 4px;">
            <input type="checkbox" id="eaAgree" style="margin-top:3px;flex-shrink:0;width:18px;height:18px;accent-color:#1D9BF0;">
            <span style="font-size:12px;color:#8E8E93;line-height:1.7;">我已阅读并同意<span onclick="goPage('enterpriseAgreement')" style="color:#10b981;cursor:pointer;text-decoration:underline;">《赞话认证服务协议》</span>，确认所填信息真实有效。</span>
          </div>
          <button id="eaSubmitBtn" onclick="submitEntApply()" style="width:100%;padding:14px;border:none;border-radius:12px;background:#1D9BF0;color:#fff;font-size:16px;font-weight:700;cursor:pointer;">提交申请</button>
          <div style="text-align:center;margin-top:12px;font-size:12px;color:rgba(255,255,255,0.25);">审核周期3-5个工作日，结果通过站内信通知</div>
        </div>
      </div>`;
    }
    function bindEnterpriseApplyEvents() {

      window._entType = 'commercial';
      window._entFiles = [];
    }
    window.uploadEntFiles = async function(input) {
      const files = input.files;
      if (!files.length) return;
      const fd = new FormData();
      for (const f of files) fd.append('files', f);
      try {
        const r = await fetch(API_BASE + '/uploadEnterpriseFile', { method: 'POST', body: fd, headers: { 'Authorization': getToken() } });
        const res = await r.json();
        if (res.code === 1) {
          window._entFiles = window._entFiles.concat(res.data.urls);
          const listEl = document.getElementById('eaFileList');
          if (listEl) {
            listEl.innerHTML = window._entFiles.map((u,i) => '<div style="display:flex;align-items:center;gap:6px;padding:6px 10px;background:rgba(255,255,255,0.06);border-radius:6px;font-size:12px;color:rgba(255,255,255,0.7);">' + '<i class="fa-solid fa-file" style="color:#1D9BF0;"></i>' + '<span style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + u.split('/').pop() + '</span>' + '<i class="fa-solid fa-xmark" style="cursor:pointer;color:rgba(255,255,255,0.3);" onclick="removeEntFile(' + i + ')"></i></div>').join('');
          }
          showToast('上传成功');
        } else { showToast(res.msg || '上传失败'); }
      } catch(e) { showToast('上传失败'); }
      input.value = '';
    };
    window.removeEntFile = function(idx) {
      window._entFiles.splice(idx, 1);
      const listEl = document.getElementById('eaFileList');
      if (listEl) {
        const items = listEl.querySelectorAll('div');
        if (items[idx]) items[idx].remove();
      }
    };
    window.submitEntApply = async function() {
      const fullName = document.getElementById('eaFullName').value.trim();
      const creditCode = document.getElementById('eaCreditCode').value.trim();
      const contactName = document.getElementById('eaContactName').value.trim();
      const duns = document.getElementById('eaDuns') ? document.getElementById('eaDuns').value.trim() : '';
      const agree = document.getElementById('eaAgree').checked;
      if (!fullName) { showToast('请输入主体全称'); return; }
      if (!creditCode) { showToast('请输入统一社会信用代码'); return; }
      if (!contactName) { showToast('请输入运营联系人姓名'); return; }
      if (!agree) { showToast('请先阅读并同意协议'); return; }
      if (!window._entFiles || window._entFiles.length === 0) { showToast('请上传资质材料文件'); return; }
      const btn = document.getElementById('eaSubmitBtn');
      btn.textContent = '提交中...'; btn.style.opacity = '0.6'; btn.disabled = true;
      try {
        const r = await api('/enterpriseApply', 'POST', { org_type: window._entType, full_name: fullName, credit_code: creditCode, duns_number: duns, contact_name: contactName, files: (window._entFiles || []).join(',') });
        if (r.code === 1) { showToast('申请已提交，请等待审核'); setTimeout(() => goBack(), 1000); }
        else { showToast(r.msg || '提交失败'); }
      } catch(e) { showToast('网络异常'); }
      btn.textContent = '提交申请'; btn.style.opacity = '1'; btn.disabled = false;
    };
    window.selectEntType = function(type) {
      window._entType = type;

      ['Public','Commercial','Government','Ngo','Education'].forEach(t => {
        const icon = document.getElementById('eaType' + t + 'Icon');
        if (icon) {
          icon.className = t.toLowerCase() === type ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle';
          icon.style.color = t.toLowerCase() === type ? 'var(--color-primary)' : 'rgba(255,255,255,0.4)';
        }
      });
      const uploadSec = document.getElementById('eaUploadSection');
      const dunsRow = document.getElementById('eaDunsRow');
      const priceHint = document.getElementById('eaPriceHint');
      const isFree = type === 'government' || type === 'ngo';

      if (type === 'commercial' || type === 'education') {
        if (uploadSec) uploadSec.style.display = 'block';
        if (dunsRow) dunsRow.style.display = 'block';
      } else if (type === 'government' || type === 'ngo') {
        if (uploadSec) uploadSec.style.display = 'block';
        if (dunsRow) dunsRow.style.display = 'none';
      } else {
        if (uploadSec) uploadSec.style.display = 'none';
        if (dunsRow) dunsRow.style.display = 'none';
      }

      if (priceHint) {
        priceHint.textContent = isFree ? '免费 · 审核3-5个工作日' : '¥249/年 · 审核3-5个工作日';
      }

      const hint = document.getElementById('eaFileHint');
      if (!hint) return;
      const hints = {
        commercial: '营利性组织必备材料：营业执照正本或副本彩色照片、法定代表人身份证正反面、经办人身份证正反面、组织认证授权公函（加盖公章）。分公司另需：总公司营业执照+总公司授权书。',
        government: '党政机关/事业单位必备材料：统一社会信用代码证书（政府机关）或事业单位法人证书（事业单位）、单位负责人（法定代表人）身份证正反面、加盖公章的官方认证申请公函、账号经办人身份证。',
        ngo: '民间非营利组织必备材料：社会团体法人登记证书/基金会法人登记证书/民办非企业单位登记证书（根据类型选择）、法定代表人身份证正反面、经办人身份证、加盖公章的认证授权公函。',
        education: '教育机构必备材料：办学许可证或事业单位法人证书、法定代表人身份证正反面、经办人身份证、加盖公章的认证授权公函。'
      };
      hint.textContent = hints[type] || '请上传相关资质材料';
    };

    function renderYouthModePage() {
      return `<div class="page" style="background:#000;min-height:100vh;">
        <div class="navbar" style="background:#000;border-bottom:0.5px solid rgba(255,255,255,0.08);"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;color:#fff;"></i></div><h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;color:#fff;">青少年模式</h1><div style="width:40px;"></div></div>
        <div style="padding:24px 20px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
            <div style="width:48px;height:48px;border-radius:12px;background:rgba(62,153,60,0.15);display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-child" style="font-size:24px;color:#3E993C;"></i></div>
            <div><div style="font-size:18px;font-weight:700;color:#fff;">青少年模式</div><div style="font-size:13px;color:#8E8E93;margin-top:2px;">保护未成年人健康上网</div></div>
          </div>
          <div style="background:#1C1C1E;border-radius:12px;padding:20px;margin-bottom:16px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
              <span style="font-size:15px;color:#fff;font-weight:600;">开启青少年模式</span>
              <label class="switch"><input type="checkbox" id="youthModeSwitch" class="ym-switch"><span class="slider"></span></label>
            </div>
            <div style="font-size:13px;color:rgba(255,255,255,0.65);line-height:1.9;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><i class="fa-solid fa-check" style="color:#3E993C;font-size:12px;"></i><span>内容安全过滤，屏蔽不适宜内容</span></div>
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><i class="fa-solid fa-check" style="color:#3E993C;font-size:12px;"></i><span>限制使用时长，保护视力健康</span></div>
              <div style="display:flex;align-items:center;gap:8px;"><i class="fa-solid fa-check" style="color:#3E993C;font-size:12px;"></i><span>禁止充值打赏等消费行为</span></div>
            </div>
          </div>
          <div style="font-size:12px;color:rgba(255,255,255,0.25);line-height:1.7;padding:0 4px;">
            * 青少年模式仅限已实名认证的未成年用户使用。关闭后内容过滤将停止，请谨慎操作。
          </div>
        </div>
      </div>`;
    }
    function bindYouthModeEvents() {
      const sw = document.getElementById('youthModeSwitch');
      if (!sw) return;
      api('/userInfo').then(u => {
        if (u.code === 1 && u.data && u.data.youth_mode) {
          sw.checked = true;
          applyPrivateSwitchStyle(true);
        }
      });
      sw.onchange = async function() {
        const enabled = this.checked ? 1 : 0;
        try {
          const r = await api('/toggleYouthMode', 'POST', { enabled });
          if (r.code === 1) {
            showToast(enabled ? '已开启青少年模式' : '已关闭青少年模式');
            applyPrivateSwitchStyle(!!enabled);
          } else {
            showToast(r.msg || '操作失败');
            this.checked = !this.checked;
            applyPrivateSwitchStyle(!enabled);
          }
        } catch(e) {
          showToast('网络异常');
          this.checked = !this.checked;
        }
      };
    }

function renderBuyExposure() {
      const postId = window._pageParam2 || '';
      return `<div class="vs-page">
        <div class="vs-nav"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;width:40px;"><i class="fa-solid fa-angle-left" style="font-weight:600;color:#fff;"></i></div><h1>获取曝光</h1><div style="width:40px;"></div></div>
        <div style="padding:24px 20px;text-align:center;">
          <div style="display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,var(--color-primary),#2d7a2b);margin-bottom:12px;"><i class="fa-solid fa-bullhorn" style="font-size:28px;color:#fff;"></i></div>
          <div style="font-size:20px;font-weight:800;color:#fff;margin-bottom:6px;">获取曝光</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.5);">提升帖子推送优先级，让更多人看到你的作品</div>
        </div>
        <div style="padding:0 20px;">
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:20px;margin-bottom:16px;">
            <div style="font-size:14px;color:rgba(255,255,255,0.6);margin-bottom:12px;">选择曝光量</div>
            <div style="display:flex;gap:10px;margin-bottom:16px;">
              <div class="exposure-option" data-count="100" data-price="0.99" onclick="selectExposureOption(this)" style="flex:1;padding:16px 8px;background:rgba(255,255,255,0.06);border:2px solid transparent;border-radius:12px;text-align:center;cursor:pointer;">
                <div style="font-size:18px;font-weight:700;color:#fff;">100次</div>
                <div style="font-size:14px;color:var(--color-primary);font-weight:600;margin-top:4px;">¥0.99</div>
              </div>
              <div class="exposure-option active" data-count="500" data-price="3.99" onclick="selectExposureOption(this)" style="flex:1;padding:16px 8px;background:rgba(255,255,255,0.06);border:2px solid var(--color-primary);border-radius:12px;text-align:center;cursor:pointer;">
                <div style="font-size:18px;font-weight:700;color:#fff;">500次</div>
                <div style="font-size:14px;color:var(--color-primary);font-weight:600;margin-top:4px;">¥3.99</div>
              </div>
              <div class="exposure-option" data-count="1000" data-price="6.99" onclick="selectExposureOption(this)" style="flex:1;padding:16px 8px;background:rgba(255,255,255,0.06);border:2px solid transparent;border-radius:12px;text-align:center;cursor:pointer;">
                <div style="font-size:18px;font-weight:700;color:#fff;">1000次</div>
                <div style="font-size:14px;color:var(--color-primary);font-weight:600;margin-top:4px;">¥6.99</div>
              </div>
            </div>
            <div style="font-size:15px;font-weight:600;color:#fff;text-align:center;margin-bottom:12px;">应付金额：<span id="exposurePrice" style="color:var(--color-primary);font-size:24px;">¥3.99</span></div>
            <div style="width:180px;height:180px;background:#fff;border-radius:12px;margin:0 auto;display:flex;align-items:center;justify-content:center;">
              <div style="text-align:center;"><img src="${PAY_QR_URL}" style="width:160px;height:160px;border-radius:8px;" alt="微信支付二维码"><div style="font-size:11px;color:#999;margin-top:6px;">微信扫码支付</div></div>
            </div>
            <div style="font-size:12px;color:rgba(255,255,255,0.3);margin-top:12px;text-align:center;">请在30分钟内完成支付</div>
          </div>
          <div style="background:rgba(255,255,255,0.03);border-radius:12px;padding:16px;margin-bottom:20px;">
            <div style="font-size:13px;color:rgba(255,255,255,0.5);line-height:1.8;">
              <p style="margin-bottom:6px;">· 曝光将提升帖子在信息流中的推送优先级</p>
              <p style="margin-bottom:6px;">· 曝光次数为预估推送量，实际效果因内容质量等因素有所不同</p>
              <p style="margin-bottom:6px;">· 支付成功后将在3个工作日内完成审核并发放</p>
              <p>· 发布违规内容，平台有权收回推广并下架帖子</p>
            </div>
          </div>
          <button id="exposurePayBtn" style="width:100%;padding:14px;border:none;border-radius:12px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-size:15px;font-weight:600;cursor:pointer;" onclick="confirmExposurePay()">我已完成支付</button>
        </div>
      </div>`;
    }
    function bindBuyExposureEvents() {
      window.selectExposureOption = function(el) {
        document.querySelectorAll('.exposure-option').forEach(o => {
          o.classList.remove('active');
          o.style.borderColor = 'transparent';
        });
        el.classList.add('active');
        el.style.borderColor = 'var(--color-primary)';
        document.getElementById('exposurePrice').textContent = '¥' + el.dataset.price;
      };
      window.confirmExposurePay = async function() {
        const activeOpt = document.querySelector('.exposure-option.active');
        if (!activeOpt) { showToast('请选择曝光量'); return; }
        const postId = window._pageParam2 || '';
        if (!postId) { showToast('参数错误'); return; }
        const count = activeOpt.dataset.count;
        const btn = document.getElementById('exposurePayBtn');
        btn.textContent = '处理中...'; btn.disabled = true;
        try {
          const r = await api('/buyExposure', 'POST', { post_id: postId, count: parseInt(count) });
          if (r.code === 1) {
            showToast('订单已提交！订单号：' + (r.data?.order_no || ''));
            setTimeout(() => goPage('myServiceOrders'), 1500);
          } else { showToast(r.msg || '提交失败'); }
        } catch(e) { showToast('网络异常'); }
        btn.textContent = '我已完成支付'; btn.disabled = false;
      };
    }
    function renderBuyPin() {
      const param = window._pageParam2 || '';
      const isFromSubscribe = param === 'scroll' || param === 'fixed';
      const postId = isFromSubscribe ? '' : param;
      const initialPinType = isFromSubscribe ? param : 'scroll';
      const initialPrice = initialPinType === 'scroll' ? '5.00' : '0.45';
      return `<div class="vs-page">
        <div class="vs-nav"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;width:40px;"><i class="fa-solid fa-angle-left" style="font-weight:600;color:#fff;"></i></div><h1>置顶推广</h1><div style="width:40px;"></div></div>
        <div style="padding:24px 20px;text-align:center;">
          <div style="display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#d97706);margin-bottom:12px;"><i class="fa-solid fa-thumbtack" style="font-size:28px;color:#fff;"></i></div>
          <div style="font-size:20px;font-weight:800;color:#fff;margin-bottom:6px;">置顶推广</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.5);">将帖子展示在首页顶部，获得更多曝光</div>
        </div>
        ${isFromSubscribe ? `
        <div id="postSelectWrap" style="padding:0 20px;margin-bottom:20px;">
          <div style="font-size:14px;color:#fff;font-weight:600;margin-bottom:12px;">第一步：选择要置顶的帖子</div>
          <div id="postSelectList" style="display:flex;flex-direction:column;gap:8px;"><div style="text-align:center;padding:20px;color:rgba(255,255,255,0.4);font-size:13px;">加载中...</div></div>
        </div>
        ` : ''}
        <div style="padding:0 20px;${isFromSubscribe ? 'opacity:0.4;pointer-events:none;' : ''}" id="pinPaySection">
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:20px;margin-bottom:16px;">
            ${isFromSubscribe ? '<div style="font-size:14px;color:#fff;font-weight:600;margin-bottom:12px;">第二步：选择置顶方式并支付</div>' : '<div style="font-size:14px;color:rgba(255,255,255,0.6);margin-bottom:12px;">选择置顶方式</div>'}
            <div class="pin-option" data-type="scroll" data-price="5" onclick="selectPinOption(this)" style="background:rgba(255,255,255,0.06);border:2px solid ${initialPinType==='scroll'?'var(--color-primary)':'transparent'};border-radius:12px;padding:16px;margin-bottom:10px;cursor:pointer;">
              <div style="display:flex;align-items:center;justify-content:space-between;">
                <div>
                  <div style="font-size:16px;font-weight:700;color:#fff;">滚动置顶</div>
                  <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:4px;">展示于未浏览用户首页顶部，浏览后不再重复展示</div>
                </div>
                <div style="font-size:16px;color:#fff;font-weight:700;">¥5<span style="font-size:12px;font-weight:400;opacity:0.7;">/次</span></div>
              </div>
            </div>
            <div class="pin-option" data-type="fixed" data-price="0.15" onclick="selectPinOption(this)" style="background:rgba(255,255,255,0.06);border:2px solid ${initialPinType==='fixed'?'var(--color-primary)':'transparent'};border-radius:12px;padding:16px;margin-bottom:16px;cursor:pointer;">
              <div style="display:flex;align-items:center;justify-content:space-between;">
                <div>
                  <div style="font-size:16px;font-weight:700;color:#fff;">长效固定置顶</div>
                  <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:4px;">持续置顶首页顶部，刷新页面持续显示</div>
                </div>
                <div style="font-size:16px;color:#fff;font-weight:700;">¥0.15<span style="font-size:12px;font-weight:400;opacity:0.7;">/10分钟</span></div>
              </div>
            </div>
            <div id="fixedDurationWrap" style="display:${initialPinType==='fixed'?'block':'none'};margin-bottom:16px;">
              <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:8px;">置顶时长</div>
              <div style="display:flex;gap:8px;">
                <div class="pin-duration" data-mins="30" onclick="selectPinDuration(this)" style="flex:1;padding:10px;background:rgba(255,255,255,0.06);border:2px solid ${initialPinType==='fixed'?'var(--color-primary)':'transparent'};border-radius:10px;text-align:center;cursor:pointer;color:#fff;font-size:14px;font-weight:600;">30分钟<br><span style="font-size:12px;color:#fff;font-weight:400;opacity:0.7;">¥0.45</span></div>
                <div class="pin-duration" data-mins="60" onclick="selectPinDuration(this)" style="flex:1;padding:10px;background:rgba(255,255,255,0.06);border:2px solid transparent;border-radius:10px;text-align:center;cursor:pointer;color:#fff;font-size:14px;font-weight:600;">1小时<br><span style="font-size:12px;color:#fff;font-weight:400;opacity:0.7;">¥0.90</span></div>
                <div class="pin-duration" data-mins="120" onclick="selectPinDuration(this)" style="flex:1;padding:10px;background:rgba(255,255,255,0.06);border:2px solid transparent;border-radius:10px;text-align:center;cursor:pointer;color:#fff;font-size:14px;font-weight:600;">2小时<br><span style="font-size:12px;color:#fff;font-weight:400;opacity:0.7;">¥1.80</span></div>
                <div class="pin-duration" data-mins="360" onclick="selectPinDuration(this)" style="flex:1;padding:10px;background:rgba(255,255,255,0.06);border:2px solid transparent;border-radius:10px;text-align:center;cursor:pointer;color:#fff;font-size:14px;font-weight:600;">6小时<br><span style="font-size:12px;color:#fff;font-weight:400;opacity:0.7;">¥5.40</span></div>
              </div>
              <div style="margin-top:10px;display:flex;align-items:center;gap:8px;">
                <input id="pinCustomMins" type="number" min="10" step="10" placeholder="自定义分钟数" style="flex:1;padding:10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);border-radius:10px;color:#fff;font-size:14px;text-align:center;outline:none;" oninput="applyCustomPinDuration()">
                <span style="font-size:12px;color:rgba(255,255,255,0.5);white-space:nowrap;">分钟（≥10，10的倍数）</span>
              </div>
            </div>
            <div style="font-size:15px;font-weight:600;color:#fff;text-align:center;margin-bottom:12px;">应付金额：<span id="pinPrice" style="color:#fff;font-size:24px;">¥${initialPrice}</span></div>
            <div style="width:180px;height:180px;background:#fff;border-radius:12px;margin:0 auto;display:flex;align-items:center;justify-content:center;">
              <div style="text-align:center;"><img src="${PAY_QR_URL}" style="width:160px;height:160px;border-radius:8px;" alt="微信支付二维码"><div style="font-size:11px;color:#999;margin-top:6px;">微信扫码支付</div></div>
            </div>
            <div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:12px;text-align:center;">请在30分钟内完成支付</div>
          </div>
          <div style="background:rgba(255,255,255,0.03);border-radius:12px;padding:16px;margin-bottom:20px;">
            <div style="font-size:13px;color:rgba(255,255,255,0.6);line-height:1.8;">
              <p style="margin-bottom:6px;">· 滚动置顶：展示于未浏览用户首页顶部，浏览后不再重复展示</p>
              <p style="margin-bottom:6px;">· 长效固定置顶：持续置顶首页顶部，刷新页面持续显示</p>
              <p style="margin-bottom:6px;">· 长效固定置顶需要高级认证用户方可购买</p>
              <p style="margin-bottom:6px;">· 支付成功后将在3个工作日内完成审核并发放</p>
              <p>· 发布违规内容，平台有权收回推广并下架帖子</p>
            </div>
          </div>
          <button id="pinPayBtn" style="width:100%;padding:14px;border:none;border-radius:12px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;font-size:15px;font-weight:600;cursor:pointer;" onclick="confirmPinPay()">我已完成支付</button>
        </div>
      </div>`;
    }
    function bindBuyPinEvents() {
      const param = window._pageParam2 || '';
      const isFromSubscribe = param === 'scroll' || param === 'fixed';
      let selectedPostId = isFromSubscribe ? '' : (param || '');
      let currentPinType = isFromSubscribe ? param : 'scroll';
      let currentPinPrice = currentPinType === 'scroll' ? 5 : 0.45;
      let currentPinDuration = currentPinType === 'fixed' ? 30 : 0;

      if (isFromSubscribe) {
        loadPinPostList();
      }

      async function loadPinPostList() {
        try {
          const res = await api('/myPosts?page=1&size=20');
          const list = document.getElementById('postSelectList');
          if (!list) return;
          if (res.code === 1 && res.data && res.data.length > 0) {
            list.innerHTML = res.data.map(p => {
              const title = p.title || '无标题帖子';
              const preview = (p.content || '').replace(/@\[\d+\]([^\s\[\]<]{1,30})/g, '@$1').replace(/<[^>]*>/g, '').substring(0, 60);
              const imgHtml = p.images ? `<img src="${resolveMediaUrl((JSON.parse(p.images)[0] || '').replace('thumb_',''))}" style="width:40px;height:40px;border-radius:6px;object-fit:cover;flex-shrink:0;">` : '';
              return `<div class="post-select-item" data-post-id="${p.id}" onclick="selectPinPost(this)" style="background:rgba(255,255,255,0.06);border:2px solid transparent;border-radius:12px;padding:12px;cursor:pointer;display:flex;align-items:center;gap:10px;">
                ${imgHtml}
                <div style="flex:1;min-width:0;">
                  <div style="font-size:14px;color:#fff;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${title}</div>
                  <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${preview}</div>
                </div>
                <i class="fa-solid fa-circle-check" style="font-size:18px;color:var(--color-primary);display:none;"></i>
              </div>`;
            }).join('');
          } else {
            list.innerHTML = '<div style="text-align:center;padding:30px;color:rgba(255,255,255,0.4);font-size:13px;">您还没有可以置顶的帖子<br>请先发布帖子后再来购买置顶</div>';
          }
        } catch(e) {
          const list = document.getElementById('postSelectList');
          if (list) list.innerHTML = '<div style="text-align:center;padding:20px;color:rgba(255,255,255,0.4);font-size:13px;">加载失败，请返回重试</div>';
        }
      }

      window.selectPinPost = function(el) {
        document.querySelectorAll('.post-select-item').forEach(item => {
          item.style.borderColor = 'transparent';
          const check = item.querySelector('.fa-circle-check');
          if (check) check.style.display = 'none';
        });
        el.style.borderColor = 'var(--color-primary)';
        const check = el.querySelector('.fa-circle-check');
        if (check) check.style.display = 'block';
        selectedPostId = el.dataset.postId;
        const section = document.getElementById('pinPaySection');
        if (section) {
          section.style.opacity = '1';
          section.style.pointerEvents = 'auto';
        }
      };

      window.selectPinOption = function(el) {
        document.querySelectorAll('.pin-option').forEach(o => {
          o.style.borderColor = 'transparent';
        });
        el.style.borderColor = 'var(--color-primary)';
        currentPinType = el.dataset.type;
        const fixedWrap = document.getElementById('fixedDurationWrap');
        if (currentPinType === 'fixed') {
          fixedWrap.style.display = 'block';

          const customInput = document.getElementById('pinCustomMins');
          if (customInput && parseInt(customInput.value) >= 10) {
            const customMins = Math.max(10, Math.ceil(parseInt(customInput.value) / 10) * 10);
            currentPinPrice = parseFloat((customMins * 0.015).toFixed(2));
            currentPinDuration = customMins;
          } else {
            const activeDur = document.querySelector('.pin-duration[style*="border-color: var(--color-primary)"]');
            if (activeDur) {
              const priceText = activeDur.querySelector('span').textContent.replace('¥','');
              currentPinPrice = parseFloat(priceText);
              currentPinDuration = parseInt(activeDur.dataset.mins);
            } else {
              currentPinPrice = 0.45;
              currentPinDuration = 30;
            }
          }
        } else {
          fixedWrap.style.display = 'none';
          currentPinPrice = 5;
          currentPinDuration = 0;
        }
        document.getElementById('pinPrice').textContent = '¥' + currentPinPrice.toFixed(2);
      };
      window.selectPinDuration = function(el) {
        document.querySelectorAll('.pin-duration').forEach(o => {
          o.style.borderColor = 'transparent';
        });
        el.style.borderColor = 'var(--color-primary)';
        const priceText = el.querySelector('span').textContent.replace('¥','');
        currentPinPrice = parseFloat(priceText);
        currentPinDuration = parseInt(el.dataset.mins);
        document.getElementById('pinPrice').textContent = '¥' + currentPinPrice.toFixed(2);
      };

      window.applyCustomPinDuration = function() {
        const input = document.getElementById('pinCustomMins');
        if (!input) return;
        let mins = parseInt(input.value);
        if (isNaN(mins) || mins < 10) {
          input.value = '';
          return;
        }
        mins = Math.max(10, Math.ceil(mins / 10) * 10);
        input.value = mins;

        document.querySelectorAll('.pin-duration').forEach(o => {
          o.style.borderColor = 'transparent';
        });
        currentPinDuration = mins;
        currentPinPrice = parseFloat((mins * 0.015).toFixed(2));
        document.getElementById('pinPrice').textContent = '¥' + currentPinPrice.toFixed(2);
      };
      window.confirmPinPay = async function() {
        if (!selectedPostId) { showToast('请先选择要置顶的帖子'); return; }
        const btn = document.getElementById('pinPayBtn');
        btn.textContent = '处理中...'; btn.disabled = true;
        try {
          const payload = { post_id: selectedPostId, pin_type: currentPinType };
          if (currentPinType === 'fixed') payload.duration_minutes = currentPinDuration;
          const r = await api('/buyPin', 'POST', payload);
          if (r.code === 1) {
            showToast('订单已提交！订单号：' + (r.data?.order_no || ''));
            setTimeout(() => goPage('myServiceOrders'), 1500);
          } else { showToast(r.msg || '提交失败'); }
        } catch(e) { showToast('网络异常'); }
        btn.textContent = '我已完成支付'; btn.disabled = false;
      };
    }
async function renderPaySubscribe() {
      const type = window._pageParam2 || 'advanced';
      const sub_period = window._verifSubTab || 'month';
      const isAdv = type === 'advanced';
      const name = isAdv ? '进阶认证' : '高级认证';
      const firstPrice = isAdv ? '¥0.99' : '¥3.99';
      const normalPrice = isAdv ? '¥3.99' : '¥11.99';
      const yearlyPrice = isAdv ? '¥29.9' : '¥79.9';
      let showFirstMonth = true;
      try {
        const r = await api('/userInfo', 'POST');
        if (r.code === 1 && r.data.verifications) {
          const hasAdv = r.data.verifications.some(v => (typeof v === 'string' ? v : v.type) === 'advanced');
          const hasPrem = r.data.verifications.some(v => (typeof v === 'string' ? v : v.type) === 'premium');
          if (hasAdv || hasPrem) showFirstMonth = false;
        }
      } catch(e) {}
      const displayPrice = sub_period === 'year' ? yearlyPrice : (showFirstMonth ? firstPrice : normalPrice);
      const priceLabel = sub_period === 'year' ? '年付' : (showFirstMonth ? '首月特惠' : '按月订阅');
      return `<div class="vs-page">
        <div class="vs-nav"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;width:40px;"><i class="fa-solid fa-angle-left" style="font-weight:600;color:#fff;"></i></div><h1>订阅${name}</h1><div style="width:40px;"></div></div>
        <div style="padding:24px 20px;text-align:center;">
          <div style="display:inline-flex;align-items:center;gap:8px;margin-bottom:8px;">${getVerifSvg(type,28)}<span style="font-size:22px;font-weight:800;color:#fff;">${name}</span></div>
          <div style="font-size:14px;color:rgba(255,255,255,0.5);">${priceLabel} · ${displayPrice}</div>
        </div>
        <div style="padding:0 20px;">
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:24px;text-align:center;margin-bottom:20px;">
            <div style="font-size:15px;font-weight:600;color:#fff;margin-bottom:4px;">微信支付</div>
            <div style="font-size:28px;font-weight:800;color:#fff;margin:16px 0;">${displayPrice}</div>
            <div style="width:180px;height:180px;background:#fff;border-radius:12px;margin:0 auto;display:flex;align-items:center;justify-content:center;">
              <div style="text-align:center;"><img src="${PAY_QR_URL}" style="width:160px;height:160px;border-radius:8px;" alt="微信支付二维码"><div style="font-size:11px;color:#999;margin-top:6px;">微信扫码支付</div></div>
            </div>
            <div style="font-size:12px;color:rgba(255,255,255,0.3);margin-top:12px;">请在30分钟内完成支付</div>
          </div>
          <div style="background:rgba(255,255,255,0.03);border-radius:12px;padding:16px;margin-bottom:16px;">
            <div style="font-size:13px;color:rgba(255,255,255,0.5);line-height:1.8;">
              <p style="margin-bottom:6px;">· 扫码支付完成后请点击下方的"我已完成支付"，否则不能到账。如果您已支付但忘记点击"我已完成支付"，我们将会在三个工作日内为您发起退款。</p>
              <p style="margin-bottom:6px;">· 将在3个工作日内完成后台审核，审核通过后发放相关权益</p>
              <p style="margin-bottom:6px;">· 若您不是首次购买，将无法享受首月优惠价格</p>
              <p style="margin-bottom:6px;">· 已享受首月优惠的订单若未在3个工作日内审核通过，将会自动取消订单并退还对应费用</p>
              <p>· 权益将在审核通过后立即生效</p>
            </div>
          </div>
          <div style="display:flex;align-items:flex-start;gap:8px;line-height:1.6;margin-bottom:10px;">
            <input type="checkbox" id="subPayAgreeChk" style="margin-top:3px;flex-shrink:0;accent-color:#10b981;">
            <span style="flex:1;font-size:12px;color:rgba(255,255,255,0.7);">我已阅读并同意<span onclick="goPage('verifSubAgreement')" style="color:#10b981;cursor:pointer;text-decoration:underline;">《赞话用户认证订阅协议》</span>，且我不是未成年人或我是未成年人但此订阅已受到监护人的许可。</span>
          </div>
          <div id="subPayAgreeTip" style="font-size:12px;color:#ef4444;margin-bottom:8px;display:none;">请先阅读并勾选同意《赞话用户认证订阅协议》</div>
          <button id="subPayBtn" style="width:100%;padding:14px;border:none;border-radius:12px;background:${isAdv?'linear-gradient(135deg,#10b981,#059669)':'linear-gradient(135deg,#8b5cf6,#7c3aed)'};color:#fff;font-size:15px;font-weight:600;cursor:pointer;" onclick="confirmSubPay('${type}','${sub_period}')">我已完成支付</button>
        </div>
      </div>`;
    }
    function bindPaySubscribeEvents() {
      let _subPaySubmitted = false;
      window.confirmSubPay = async function(type, sub_period) {
        if (_subPaySubmitted) {
          showToast('订单已提交，请勿重复提交');
          return;
        }
        const agree = document.getElementById('subPayAgreeChk').checked;
        const tip = document.getElementById('subPayAgreeTip');
        if (!agree) {
          if (tip) tip.style.display = 'block';
          showToast('请先勾选同意《赞话用户认证订阅协议》');
          return;
        }
        if (tip) tip.style.display = 'none';
        const btn = document.getElementById('subPayBtn');
        btn.textContent = '处理中...';
        btn.disabled = true;
        try {
          const r = await api('/subscribeVerif', 'POST', { type, sub_period: sub_period || 'month' });
          if (r.code === 1) {
            _subPaySubmitted = true;
            showToast('订单已提交！订单号：' + (r.data?.order_no || ''));
            setTimeout(() => goPage('mySubOrders'), 1500);
          } else {
            showToast(r.msg || '确认失败');
            btn.textContent = '我已完成支付';
            btn.disabled = false;
          }
        } catch(e) {
          showToast('网络异常');
          btn.textContent = '我已完成支付';
          btn.disabled = false;
        }
      };
    }
    async function renderVerifSubscribe() {
      const tab = window._verifSubTab || 'month';
      let basicVerified = false;
      let hasAdvanced = false;
      let hasPremium = false;
      let expiryData = {};
      try {
        const [r1, r2] = await Promise.all([api('/userInfo', 'POST'), api('/subscriptionExpiry')]);
        if (r1.code === 1) {
          if (r1.data.realname_status === 'verified') basicVerified = true;
          if (r1.data.verifications) {
            basicVerified = basicVerified || r1.data.verifications.some(v => (typeof v === 'string' ? v : v.type) === 'basic');
            hasAdvanced = r1.data.verifications.some(v => (typeof v === 'string' ? v : v.type) === 'advanced');
            hasPremium = r1.data.verifications.some(v => (typeof v === 'string' ? v : v.type) === 'premium');
          }
        }
        if (r2.code === 1) expiryData = r2.data || {};
      } catch(e) {}
      const showFirstMonth = !(hasAdvanced || hasPremium);

      function remainInfo(type) {
        if (!expiryData[type]) return null;
        const ms = parseBeijingTime(expiryData[type]) - Date.now();
        if (ms <= 0) return null;
        const totalDays = Math.ceil(ms / 86400000);
        if (totalDays > 30) {
          const months = Math.floor(totalDays / 30);
          const days = totalDays % 30;
          return { text: days > 0 ? `${months}个月${days}天` : `${months}个月`, totalDays };
        }
        return { text: `${totalDays}天`, totalDays };
      }
      const advRemain = remainInfo('advanced');
      const premRemain = remainInfo('premium');
      const basicCard = basicVerified
        ? `<div style="font-size:11px;color:#3E993C;background:rgba(62,153,60,0.12);padding:3px 8px;border-radius:6px;font-weight:600;">已认证</div>`
        : `<div style="font-size:11px;color:#3E993C;background:rgba(62,153,60,0.12);padding:3px 8px;border-radius:6px;font-weight:600;">免费</div>`;
      const basicBtn = basicVerified
        ? `<div style="margin-top:14px;padding:13px;border-radius:12px;background:rgba(62,153,60,0.15);color:#3E993C;font-size:15px;font-weight:700;text-align:center;">已认证</div>`
        : `<button class="vs-btn" style="background:linear-gradient(135deg,#3E993C,#2d7a2b);margin-top:14px;" onclick="goPage('realnameVerify')">立即认证</button>`;
      return `<div class="vs-page">
    <div class="vs-nav"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;width:40px;"><i class="fa-solid fa-angle-left" style="font-weight:600;color:#fff;"></i></div><h1>认证订阅</h1><div style="width:40px;"></div></div>
    <div class="vs-hero">
      <div class="vs-hero-title">解锁创作者专属特权</div>
      <div class="vs-hero-sub">提升你的影响力与创作体验</div>
      <div class="vs-tabs">
        <div class="vs-tab${tab==='month'?' active':''}" onclick="window._verifSubTab='month';render();">按月订阅</div>
        <div class="vs-tab${tab==='year'?' active':''}" onclick="window._verifSubTab='year';render();">按年订阅</div>
      </div>
    </div>
    <div style="margin:32px 16px 36px;background:linear-gradient(135deg,#1a2e1a,#1e3e1a);border:1px solid rgba(62,153,60,0.25);border-radius:16px;padding:18px 20px;position:relative;overflow:hidden;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:8px;">${getVerifSvg('basic',20)}<span style="font-size:17px;font-weight:700;color:#fff;">普通认证</span></div>
        ${basicCard}
      </div>
      <div style="font-size:13px;color:rgba(255,255,255,0.5);margin-top:8px;">实名认证即可获得，展示已认证标识</div>
      <div style="margin-top:10px;padding:10px 12px;background:rgba(255,255,255,0.04);border-radius:8px;font-size:11px;color:rgba(255,255,255,0.4);line-height:1.7;">根据《中华人民共和国网络安全法》第二十四条规定，网络运营者为用户提供信息发布、即时通讯等服务，应当要求用户提供真实身份信息。用户不提供真实身份信息的，网络运营者不得为其提供相关服务。赞话平台依法要求用户完成实名认证后方可使用相关功能。</div>
      ${basicBtn}
    </div>
    <div class="vs-cards">
      <div class="vs-card vs-card-advanced">
        <div class="vs-card-header">
          <div style="display:flex;align-items:center;gap:8px;">${getVerifSvg('advanced',20)}<span style="font-size:17px;font-weight:700;color:#fff;">进阶认证</span></div>
          ${tab==='year'?'<div class="vs-save-badge">年付省 ¥18</div>':''}
        </div>
        <div class="vs-card-price">
          <span class="vs-price">${tab==='year'?'¥29.9':'¥3.99'}</span>
          <span class="vs-period">/${tab==='year'?'年':'月'}</span>
          ${tab==='year'?'<span class="vs-monthly">¥2.49/月</span>':''}
        </div>
        ${tab==='month'&&showFirstMonth?'<div class="vs-first-month"><i class="fa-solid fa-tag" style="margin-right:4px;"></i>首月仅 ¥0.99</div>':''}
        ${advRemain?'<div style="text-align:center;font-size:13px;color:#10b981;font-weight:600;margin-bottom:10px;"><i class="fa-regular fa-clock" style="margin-right:4px;"></i>剩余 '+advRemain.text+'</div>':''}
        <button class="vs-btn vs-btn-advanced" onclick="goPage('paySubscribe',null,'advanced')">${advRemain?'续费':(tab==='month'&&showFirstMonth?'首月 ¥0.99 开通':'立即开通')}</button>
        <div class="vs-card-features">
          <div class="vs-val-row"><span>综合权益估值</span><span style="color:#fff;font-weight:600;">¥37</span></div>
          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>帖子保护：开启后访客端强制显示满屏UID水印（防截图追溯）</div>
          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>单条作品最高500次流量曝光推送</div>
          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>信息流广告减少30%</div>
          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>每月最多3次昵称修改</div>
          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>私信限速提升至40条/分钟</div>
          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>举报请求优先处理</div>
          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>每月附赠1次全站首页滚动置顶</div>
        </div>
      </div>
      <div class="vs-card vs-card-premium">
        <div class="vs-card-header">
          <div style="display:flex;align-items:center;gap:8px;">${getVerifSvg('premium',20)}<span style="font-size:17px;font-weight:700;color:#fff;">高级认证</span></div>
          ${tab==='year'?'<div class="vs-save-badge">年付省 ¥64</div>':'<div class="vs-hot-badge">最受欢迎</div>'}
        </div>
        <div class="vs-card-price">
          <span class="vs-price">${tab==='year'?'¥79.9':'¥11.99'}</span>
          <span class="vs-period">/${tab==='year'?'年':'月'}</span>
          ${tab==='year'?'<span class="vs-monthly">¥6.66/月</span>':''}
        </div>
        ${tab==='month'&&showFirstMonth?'<div class="vs-first-month"><i class="fa-solid fa-tag" style="margin-right:4px;"></i>首月仅 ¥3.99</div>':''}
        ${premRemain?'<div style="text-align:center;font-size:13px;color:#8b5cf6;font-weight:600;margin-bottom:10px;"><i class="fa-regular fa-clock" style="margin-right:4px;"></i>剩余 '+premRemain.text+'</div>':''}
        <button class="vs-btn vs-btn-premium" onclick="goPage('paySubscribe',null,'premium')">${premRemain?'续费':(tab==='month'&&showFirstMonth?'首月 ¥3.99 开通':'立即开通')}</button>
        <div class="vs-card-features">
          <div class="vs-val-row"><span>综合权益估值</span><span style="color:#fff;font-weight:600;">¥112</span></div>
          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>帖子保护：开启后访客端强制显示满屏UID水印（防截图追溯）</div>
          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>单条作品最高1000次流量曝光推送</div>
          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>完整移除全部信息流广告</div>
          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>每月最多8次昵称修改</div>
          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>私信限速提升至60条/分钟</div>
          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>最高优先级极速举报通道</div>
          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>昵称气泡、文字颜色自定义</div>
          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>每年享有1次账号封禁解除机会*</div>
          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>每月附赠5次全站首页滚动置顶</div>
          <div class="vs-feature-item"><i class="fa-solid fa-check" style="color:#10b981;"></i>解锁长效固定置顶购买权限</div>
        </div>
      </div>
    </div>
    <div style="margin:4px 16px 0;background:#1C1C1E;border:1px solid rgba(29,155,240,0.2);border-radius:16px;padding:18px 20px;cursor:pointer;" onclick="goPage('enterpriseApply')">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:8px;">${getVerifSvg('enterprise',20)}<span style="font-size:17px;font-weight:700;color:#fff;">企业/机构/团体认证</span></div>
        <div style="font-size:13px;color:#1D9BF0;font-weight:700;">¥249/年 <i class="fa-solid fa-chevron-right" style="font-size:12px;margin-left:4px;"></i></div>
      </div>
      <div style="font-size:13px;color:rgba(255,255,255,0.5);margin-top:8px;">公共机构/商业组织，审核3-5个工作日 · 含帖子保护特权</div>
    </div>
    <div class="vs-compare">
      <div class="vs-section-title">功能对比</div>
      <div class="vs-table-wrap"><table class="vs-table"><thead><tr><th></th><th>进阶认证</th><th>高级认证</th></tr></thead><tbody>
        <tr><td class="vs-td-cat" colspan="3">基础权益</td></tr>
        <tr><td>信息流广告</td><td>减少30%</td><td>完全无广告</td></tr>
        <tr><td>帖子保护</td><td><i class="fa-solid fa-check" style="color:#10b981;"></i></td><td><i class="fa-solid fa-check" style="color:#10b981;"></i></td></tr>
        <tr><td>作品曝光上限</td><td>500次/单条</td><td>1000次/单条</td></tr>
        <tr><td>私信发送速率</td><td>40条/分钟</td><td>60条/分钟</td></tr>
        <tr><td>每月昵称修改</td><td>3次</td><td>8次</td></tr>
        <tr><td>举报处理</td><td>优先响应</td><td>极速优先通道</td></tr>
        <tr><td class="vs-td-cat" colspan="3">专属特权</td></tr>
        <tr><td>昵称外观自定义</td><td>—</td><td><i class="fa-solid fa-check" style="color:#10b981;"></i></td></tr>
        <tr><td>年度解封机会*</td><td>—</td><td><i class="fa-solid fa-check" style="color:#10b981;"></i></td></tr>
        <tr><td>月度滚动置顶</td><td>1次</td><td>5次</td></tr>
        <tr><td>长效置顶购买</td><td>—</td><td><i class="fa-solid fa-check" style="color:#10b981;"></i></td></tr>
      </tbody></table></div>
    </div>
    <div class="vs-extras">
      <div class="vs-section-title">增值推广服务</div>
      <div class="vs-extra-card" style="cursor:pointer;" onclick="goPage('buyPin',null,'scroll')">
        <div class="vs-extra-header"><span style="font-size:15px;font-weight:600;color:#fff;">全站滚动置顶</span><span style="font-size:13px;color:#fff;font-weight:700;">¥5 / 次</span></div>
        <div style="font-size:13px;color:#fff;margin-top:4px;">展示于未浏览用户首页顶部，浏览后不再重复展示</div>
        <div style="font-size:12px;color:#fff;margin-top:8px;font-weight:600;">点击购买 <i class="fa-solid fa-chevron-right" style="font-size:11px;"></i></div>
      </div>
      <div class="vs-extra-card" style="cursor:pointer;" onclick="goPage('buyPin',null,'fixed')">
        <div class="vs-extra-header"><span style="font-size:15px;font-weight:600;color:#fff;">长效固定置顶</span><span style="font-size:13px;color:#fff;font-weight:700;">¥0.15 / 10分钟</span></div>
        <div style="font-size:13px;color:#fff;margin-top:4px;">持续置顶首页顶部，刷新页面持续显示</div>
        <div style="font-size:12px;color:#fff;margin-top:8px;font-weight:600;">点击购买 <i class="fa-solid fa-chevron-right" style="font-size:11px;"></i></div>
      </div>
    </div>
    <div style="margin:8px 16px 4px;text-align:center;display:flex;justify-content:center;align-items:center;gap:24px;"><span style="font-size:13px;color:rgba(255,255,255,0.5);cursor:pointer;text-decoration:underline;" onclick="goPage('mySubOrders')"><i class="fa-solid fa-receipt" style="margin-right:4px;"></i>订阅订单记录</span><span style="font-size:13px;color:rgba(255,255,255,0.5);cursor:pointer;text-decoration:underline;" onclick="goPage('redeemCode')"><i class="fa-solid fa-ticket" style="margin-right:4px;"></i>输入兑换序列号</span></div>
    <div class="vs-footer">*曝光仅提升平台推送优先级，不承诺固定访问人数；平台持续设置私信速率限制，保障站点稳定。发布违规内容，平台有权收回全部推广特权。*年度解封机会在订阅满一年后发放，每个订阅周期仅限一次。高级认证订阅用户每月附赠24小时（1440分钟）长效固定置顶推广额度。</div>
  </div>`;
}
async function renderMySubOrders() {
      let orders = [];
      try { const r = await api('/mySubscriptions'); if (r.code === 1) orders = r.data || []; } catch(e) {}
      const subTypeMap = { advanced: '进阶认证', premium: '高级认证' };
      const periodMap = { month: '月订阅', year: '年订阅' };
      const statusMap = { querying: { text: '正在查询支付结果', color: '#f59e0b' }, completed: { text: '已完成', color: '#10b981' }, refunding: { text: '退款申请中', color: '#f59e0b' }, refunded: { text: '已退款', color: '#ef4444' }, rejected: { text: '已拒绝', color: '#ef4444' } };
      function remainDays(expireAt) {
        if (!expireAt) return null;
        const ms = parseBeijingTime(expireAt) - Date.now();
        if (ms <= 0) return 0;
        return Math.ceil(ms / 86400000);
      }
      if (orders.length === 0) {
        return `<div class="vs-page">
          <div class="vs-nav"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;width:40px;"><i class="fa-solid fa-angle-left" style="font-weight:600;color:#fff;"></i></div><h1>订阅订单</h1><div style="width:40px;"></div></div>
          <div style="padding:60px 20px;text-align:center;color:rgba(255,255,255,0.4);font-size:14px;"><i class="fa-solid fa-receipt" style="font-size:40px;margin-bottom:16px;display:block;opacity:0.3;"></i>暂无订阅订单</div>
        </div>`;
      }
      return `<div class="vs-page">
        <div class="vs-nav"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;width:40px;"><i class="fa-solid fa-angle-left" style="font-weight:600;color:#fff;"></i></div><h1>订阅订单</h1><div style="width:40px;"></div></div>
        <div style="padding:12px 16px;">${orders.map(o => {
          const st = statusMap[o.status] || { text: o.status, color: '#999' };
          const rd = o.status === 'completed' ? remainDays(o.expire_at) : null;
          const orderDays = o.sub_period === 'year' ? 365 : 30;
          const canRefund = o.status === 'completed' && rd !== null && rd > orderDays;
          return `<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px;margin-bottom:10px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
              <div style="display:flex;align-items:center;gap:6px;"><span style="font-size:15px;font-weight:600;color:#fff;">${subTypeMap[o.sub_type]||o.sub_type}</span><span style="font-size:11px;color:rgba(255,255,255,0.4);">${periodMap[o.sub_period]||o.sub_period}</span></div>
              <span style="font-size:12px;font-weight:600;color:${st.color};">${st.text}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px;"><span>订单号</span><span style="color:rgba(255,255,255,0.7);font-family:monospace;">${o.order_no||'-'}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px;"><span>金额</span><span style="color:#fff;font-weight:600;">¥${o.amount||0}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px;"><span>创建时间</span><span>${o.created_at||'-'}</span></div>
            ${o.expire_at?`<div style="display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px;"><span>到期时间</span><span>${o.expire_at}</span></div>`:''}
            ${rd!==null?`<div style="display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px;"><span>剩余时间</span><span style="color:${rd>30?'#10b981':rd>0?'#f59e0b':'#ef4444'};font-weight:600;">${rd>0?(rd>30?(Math.floor(rd/30)+'个月'+(rd%30>0?rd%30+'天':'')):rd+'天'):'已过期'}</span></div>`:''}
            ${o.wechat_pay_no?`<div style="display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px;"><span>支付单号</span><span style="font-family:monospace;">${o.wechat_pay_no}</span></div>`:''}
            ${canRefund?`<div style="margin-top:10px;"><button style="width:100%;padding:10px;border:1px solid rgba(239,68,68,0.4);border-radius:10px;background:rgba(239,68,68,0.08);color:#ef4444;font-size:13px;font-weight:600;cursor:pointer;" onclick="requestRefund(${o.id})">申请退款</button></div>`:''}
          </div>`;
        }).join('')}</div>
      </div>`;
    }
    function bindMySubOrdersEvents() {
      window.requestRefund = async function(orderId) {
        if (!confirm('确定要申请退款吗？退款后认证将被收回。')) return;
        try {
          const r = await api('/requestRefund', 'POST', { order_id: orderId });
          if (r.code === 1) { showToast('退款申请已提交'); setTimeout(() => render(), 1000); }
          else showToast(r.msg || '申请失败');
        } catch(e) { showToast('网络异常'); }
      };
    }
    async function renderMyServiceOrders() {
      let orders = [];
      try { const r = await api('/myServiceOrders'); if (r.code === 1) orders = r.data || []; } catch(e) {}
      const serviceMap = { exposure: '曝光推广', pin: '置顶推广' };
      const statusMap = { querying: { text: '正在查询支付结果', color: '#f59e0b' }, completed: { text: '已完成', color: '#10b981' }, refunded: { text: '已退款', color: '#ef4444' } };
      if (orders.length === 0) {
        return `<div class="vs-page">
          <div class="vs-nav"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;width:40px;"><i class="fa-solid fa-angle-left" style="font-weight:600;color:#fff;"></i></div><h1>服务订单</h1><div style="width:40px;"></div></div>
          <div style="padding:60px 20px;text-align:center;color:rgba(255,255,255,0.4);font-size:14px;"><i class="fa-solid fa-receipt" style="font-size:40px;margin-bottom:16px;display:block;opacity:0.3;"></i>暂无服务订单</div>
        </div>`;
      }
      return `<div class="vs-page">
        <div class="vs-nav"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;width:40px;"><i class="fa-solid fa-angle-left" style="font-weight:600;color:#fff;"></i></div><h1>服务订单</h1><div style="width:40px;"></div></div>
        <div style="padding:12px 16px;">${orders.map(o => {
          const st = statusMap[o.status] || { text: o.status, color: '#999' };
          let detailHtml = '';
          try {
            const d = JSON.parse(o.details || '{}');
            if (o.service_type === 'exposure') detailHtml = `<div style="display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px;"><span>曝光量</span><span style="color:#fff;">${d.count || '-'}次</span></div>`;
            if (o.service_type === 'pin') detailHtml = `<div style="display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px;"><span>置顶类型</span><span style="color:#fff;">${d.pin_type==='scroll'?'滚动置顶':'长效固定置顶'}</span></div>`;
          } catch(e) {}
          return `<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px;margin-bottom:10px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
              <span style="font-size:15px;font-weight:600;color:#fff;">${serviceMap[o.service_type]||o.service_type}</span>
              <span style="font-size:12px;font-weight:600;color:${st.color};">${st.text}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px;"><span>订单号</span><span style="color:rgba(255,255,255,0.7);font-family:monospace;">${o.order_no||'-'}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px;"><span>金额</span><span style="color:#fff;font-weight:600;">¥${o.amount||0}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px;"><span>创建时间</span><span>${o.created_at||'-'}</span></div>
            ${detailHtml}
          </div>`;
        }).join('')}</div>
      </div>`;
    }
    function bindMyServiceOrdersEvents() {}
    function bindVerifSubscribeEvents() {}
    function renderSafetyCenter() {
      return `<div class="page" style="background:#f5f5f7;min-height:100vh;">
        <div class="navbar"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div><h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">账号安全中心</h1><div style="width:40px;"></div></div>
        <div style="padding:12px;">
          <div style="background:#fff;border-radius:12px;overflow:hidden;">
            <div onclick="goPage('rulesCenter')" style="display:flex;align-items:center;padding:14px 16px;border-bottom:0.5px solid #f0f0f0;cursor:pointer;">
              <div style="width:36px;height:36px;border-radius:50%;background:#E6F7EC;display:flex;align-items:center;justify-content:center;color:var(--color-primary);font-size:18px;"><i class="fa-solid fa-book-open"></i></div>
              <div style="flex:1;margin-left:12px;">
                <div style="font-size:15px;color:#333;">规则中心</div>
                <div style="font-size:12px;color:#999;margin-top:2px;">了解社区规范和违规处罚标准</div>
              </div>
              <i class="fa-solid fa-chevron-right" style="color:#ccc;"></i>
            </div>
            <div onclick="loadViolationsList()" style="display:flex;align-items:center;padding:14px 16px;border-bottom:0.5px solid #f0f0f0;cursor:pointer;">
              <div style="width:36px;height:36px;border-radius:50%;background:#FFF1F0;display:flex;align-items:center;justify-content:center;color:#ff2442;font-size:18px;"><i class="fa-solid fa-triangle-exclamation"></i></div>
              <div style="flex:1;margin-left:12px;">
                <div style="font-size:15px;color:#333;">违规记录</div>
                <div style="font-size:12px;color:#999;margin-top:2px;">查看账号违规历史和处理结果</div>
              </div>
              <i class="fa-solid fa-chevron-right" style="color:#ccc;"></i>
            </div>
          </div>
        </div>
        <div id="violationsContent"></div>
      </div>`;
    }
    async function bindSafetyCenterEvents() {
      loadViolationsList();
    }
    async function loadViolationsList() {
      try {
        const res = await api('/violations');
        const container = document.getElementById('violationsContent');
        if (!container) return;
        if (!res.data || res.data.length === 0) {
          container.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">暂无违规记录</div>';
        } else {
          container.innerHTML = `<div style="padding:0 12px 12px;">
            <div style="font-size:14px;color:#666;margin-bottom:12px;padding-left:4px;">违规记录（共${res.data.length}条）</div>
            ${res.data.map(v => `
              <div onclick="goViolationDetail(${v.id})" style="background:#fff;border-radius:12px;padding:14px 16px;margin-bottom:10px;cursor:pointer;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                  <span style="font-size:15px;font-weight:600;color:#333;">${v.content_type === 'post' ? '帖子' : v.content_type === 'comment' ? '评论' : v.content_type === 'message' ? '私信' : v.content_type === 'confession' ? '表白墙' : '内容'}违规</span>
                  <span style="font-size:12px;color:#999;">${v.create_time || ''}</span>
                </div>
                <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                  <span style="font-size:13px;color:#ff2442;">${v.violation_category}</span>
                  <span style="font-size:13px;color:#999;">${v.penalty_type === '警告' ? '警告' : v.penalty_days + '天封禁'}</span>
                </div>
                <div style="font-size:13px;color:#666;line-height:1.5;">${v.content || ''}</div>
                <div style="margin-top:8px;padding-top:8px;border-top:0.5px solid #f5f5f5;display:flex;justify-content:space-between;align-items:center;">
                  <span style="font-size:12px;color:#999;">违规原因：${v.violation_reason}</span>
                  ${v.appeal_status === 'pending' ? '<span style="font-size:12px;color:var(--color-primary);">可申诉</span>' : v.appeal_status === 'processing' ? '<span style="font-size:12px;color:#1677ff;">申诉处理中</span>' : v.appeal_status === 'approved' ? '<span style="font-size:12px;color:#52c41a;">申诉通过</span>' : '<span style="font-size:12px;color:#999;">申诉失败</span>'}
                </div>
              </div>
            `).join('')}
          </div>`;
        }
      } catch(e) {
        document.getElementById('violationsContent').innerHTML = '<div style="text-align:center;padding:20px;color:#999;">加载失败</div>';
      }
    }
    function goViolationDetail(id) {
      window._currentViolationId = id;
      goPage('violationDetail');
    }
    function renderViolationDetail() {
      return `<div class="page" style="background:#f5f5f7;min-height:100vh;">
        <div class="navbar"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div><h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">违规详情</h1><div style="width:40px;"></div></div>
        <div id="violationDetailContent"></div>
      </div>`;
    }
    async function bindViolationDetailEvents() {
      await loadViolationDetail();
    }
    async function loadViolationDetail() {
      const id = window._currentViolationId;
      if (!id) return;
      try {
        const res = await api('/violationDetail?id=' + id);
        const container = document.getElementById('violationDetailContent');
        if (!container || res.code !== 1) {
          container.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">获取失败</div>';
          return;
        }
        const v = res.data;
        container.innerHTML = `<div style="padding:12px;">
          <div style="background:#fff;border-radius:12px;padding:16px;margin-bottom:12px;">
            <div style="text-align:center;margin-bottom:16px;">
              <div style="width:60px;height:60px;border-radius:50%;background:#FFF1F0;display:inline-flex;align-items:center;justify-content:center;color:#ff2442;font-size:28px;"><i class="fa-solid fa-circle-exclamation"></i></div>
              <div style="font-size:16px;font-weight:600;color:#333;margin-top:10px;">平台处理完成</div>
            </div>
            <div style="background:#f5f5f7;border-radius:8px;padding:12px;margin-bottom:12px;">
              <div style="font-size:14px;color:#ff2442;margin-bottom:8px;">${v.violation_category}，已被处理</div>
              <div style="font-size:13px;color:#666;line-height:1.6;">您发布的${v.content_type === 'post' ? '帖子' : v.content_type === 'comment' ? '评论' : v.content_type === 'message' ? '私信' : '内容'}存在违规，已被系统删除，请遵守赞话社区规范。</div>
            </div>
            <div style="margin-bottom:12px;">
              <div style="font-size:14px;font-weight:500;color:#333;margin-bottom:8px;">违规内容</div>
              <div style="font-size:13px;color:#666;line-height:1.6;background:#f5f5f7;border-radius:8px;padding:12px;">${v.content || ''}</div>
            </div>
            <div style="margin-bottom:12px;">
              <div style="font-size:14px;font-weight:500;color:#333;margin-bottom:8px;">处理详情</div>
              <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:0.5px solid #f0f0f0;">
                <span style="font-size:13px;color:#999;">违规原因</span>
                <span style="font-size:13px;color:#333;">${v.violation_reason}</span>
              </div>
              <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:0.5px solid #f0f0f0;">
                <span style="font-size:13px;color:#999;">处理结果</span>
                <span style="font-size:13px;color:#ff2442;">${v.penalty_type === '警告' ? '警告' : v.penalty_days + '天封禁'}</span>
              </div>
              <div style="display:flex;justify-content:space-between;padding:8px 0;">
                <span style="font-size:13px;color:#999;">处理时间</span>
                <span style="font-size:13px;color:#333;">${v.penalty_start_time || ''}</span>
              </div>
            </div>
            ${v.appeal_status === 'pending' ? `
              <div style="margin-bottom:12px;">
                <div style="font-size:14px;font-weight:500;color:#333;margin-bottom:8px;">申诉理由</div>
                <textarea id="appealReason" placeholder="请输入申诉理由，说明您认为此内容未违规的原因..." style="width:100%;height:80px;border:0.5px solid #ddd;border-radius:8px;padding:10px;font-size:13px;resize:none;"></textarea>
              </div>
              <button onclick="submitAppeal(${id})" style="width:100%;background:var(--color-primary);color:#fff;border:none;border-radius:20px;padding:12px;font-size:15px;font-weight:600;">提交申诉</button>
            ` : v.appeal_status === 'processing' ? `
              <div style="text-align:center;padding:12px;background:#E8F0FE;border-radius:8px;">
                <span style="font-size:13px;color:#1677ff;">申诉处理中，我们会在1-3个工作日内审核</span>
              </div>
            ` : v.appeal_status === 'approved' ? `
              <div style="text-align:center;padding:12px;background:#E6F7EC;border-radius:8px;">
                <span style="font-size:13px;color:#52c41a;">申诉通过，已解除相关限制</span>
              </div>
            ` : `
              <div style="text-align:center;padding:12px;background:#FFF1F0;border-radius:8px;">
                <span style="font-size:13px;color:#ff2442;">申诉失败，维持原有处罚</span>
              </div>
            `}
          </div>
          <div onclick="goPage('rulesCenter')" style="background:#fff;border-radius:12px;padding:14px 16px;margin-bottom:12px;cursor:pointer;">
            <div style="display:flex;align-items:center;">
              <i class="fa-solid fa-book-open" style="color:var(--color-primary);font-size:16px;"></i>
              <span style="margin-left:8px;font-size:14px;color:#333;">查看赞话社区内容管理规范</span>
              <i class="fa-solid fa-chevron-right" style="margin-left:auto;color:#ccc;"></i>
            </div>
          </div>
          <div onclick="goPage('safetyCenter')" style="background:#fff;border-radius:12px;padding:14px 16px;cursor:pointer;">
            <div style="display:flex;align-items:center;">
              <i class="fa-solid fa-shield-halved" style="color:var(--color-primary);font-size:16px;"></i>
              <span style="margin-left:8px;font-size:14px;color:#333;">返回账号安全中心</span>
              <i class="fa-solid fa-chevron-right" style="margin-left:auto;color:#ccc;"></i>
            </div>
          </div>
        </div>`;
      } catch(e) {
        document.getElementById('violationDetailContent').innerHTML = '<div style="text-align:center;padding:40px;color:#999;">获取失败</div>';
      }
    }
    async function submitAppeal(id) {
      const reason = document.getElementById('appealReason').value.trim();
      if (!reason) {
        showToast('请输入申诉理由');
        return;
      }
      try {
        const res = await api('/appealViolation', 'POST', { id, reason });
        if (res.code === 1) {
          showToast(res.msg);
          await loadViolationDetail();
        } else {
          showToast(res.msg || '申诉失败');
        }
      } catch(e) {
        showToast('申诉失败');
      }
    }
    let reportTargetType = '';
    let reportTargetId = 0;
    let reportReason = '';
    let reportSubReason = '';
    let reportImages = [];
    const REPORT_REASONS = [
      { key: 'porn', label: '色情低俗', subs: ['色情图片/视频', '色情文字描述', '性暗示/软色情', '招嫖/性交易'] },
      { key: 'politics', label: '涉政敏感', subs: ['造谣污蔑国家领导人', '分裂国家言论', '境外反华宣传', '其他涉政敏感'] },
      { key: 'violence', label: '暴力恐怖', subs: ['宣扬恐怖主义', '暴力血腥画面', '教唆自残自杀', '武器/管制刀具'] },
      { key: 'illegal', label: '违法违禁', subs: ['毒品/违禁药品', '赌博/博彩', '诈骗/违法犯罪', '伪造证件/假币'] },
      { key: 'harass', label: '人身攻击/骚扰', subs: ['辱骂/人身攻击', '地域/性别歧视', '恶意引战/挑事', '骚扰/威胁'] },
      { key: 'ad', label: '广告引流', subs: ['站外引流/推广', '刷单/兼职广告', '带货/营销推广', '垃圾广告信息'] },
      { key: 'fake', label: '虚假信息', subs: ['造谣/不实信息', '冒充他人', '虚假身份', '其他虚假内容'] },
      { key: 'other', label: '其他违规', subs: ['侵犯隐私', '盗用原创', '未成年人不良内容', '其他'] }
    ];
    function goReport(targetType, targetId) {
      if (!getToken()) { showLoginModal(); return; }
      reportTargetType = targetType;
      reportTargetId = targetId;
      reportReason = '';
      reportSubReason = '';
      reportImages = [];
      goPage('report');
    }
    function renderAgreementPage() {
      return `
        <div class="page">
          <div class="navbar" style="position:fixed;top:0;left:0;right:0;z-index:100;background:#fff;">
            <div onclick="goBack()" style="font-size:22px;cursor:pointer;color:#333;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div>
            <h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">赞话用户服务协议</h1>
            <div style="width:28px;"></div>
          </div>
          <div style="padding-top:calc(50px + env(safe-area-inset-top));"></div>
          <div style="padding:20px 16px;line-height:1.8;font-size:14px;color:#333;">
            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">一、协议的接受与修改</h3>
            <p style="margin-bottom:12px;text-indent:2em;">欢迎使用"赞话"社交平台（以下简称"本平台"）。本协议是您与本平台之间关于使用本平台服务的协议。在使用本平台服务之前，请您务必仔细阅读并充分理解本协议的全部内容。</p>
            <p style="margin-bottom:12px;text-indent:2em;">您在使用本平台提供的各项服务之前，应仔细阅读并同意本协议。如您不同意本协议，请勿使用本平台服务。您通过注册或使用本平台服务，即视为您已阅读并同意本协议的全部内容。</p>
            <p style="margin-bottom:12px;text-indent:2em;">本平台有权根据需要不时修订本协议内容，修订后的协议一经公布即有效替代原协议。您继续使用本平台服务，即视为您接受修订后的协议。</p>
            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">二、账号注册与使用</h3>
            <p style="margin-bottom:12px;text-indent:2em;">1. 您在注册账号时需提供真实、准确、完整的个人资料，并在资料发生变更时及时更新。</p>
            <p style="margin-bottom:12px;text-indent:2em;">2. 您应妥善保管账号和密码，因您保管不善造成的损失由您自行承担。</p>
            <p style="margin-bottom:12px;text-indent:2em;">3. 您不得将账号转让、出借给他人使用。</p>
            <p style="margin-bottom:12px;text-indent:2em;">4. 本平台有权对您提交的资料进行审核，如发现虚假信息，有权拒绝注册或暂停账号使用。</p>
            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">三、用户行为规范</h3>
            <p style="margin-bottom:12px;text-indent:2em;">您在使用本平台服务时，应当遵守国家法律法规，不得发布、传播以下内容：</p>
            <p style="margin-bottom:8px;padding-left:2em;">（1）违反宪法确定的基本原则的；</p>
            <p style="margin-bottom:8px;padding-left:2em;">（2）危害国家安全，泄露国家秘密，颠覆国家政权，破坏国家统一的；</p>
            <p style="margin-bottom:8px;padding-left:2em;">（3）损害国家荣誉和利益的；</p>
            <p style="margin-bottom:8px;padding-left:2em;">（4）煽动民族仇恨、民族歧视，破坏民族团结的；</p>
            <p style="margin-bottom:8px;padding-left:2em;">（5）破坏国家宗教政策，宣扬邪教和封建迷信的；</p>
            <p style="margin-bottom:8px;padding-left:2em;">（6）散布谣言，扰乱社会秩序，破坏社会稳定的；</p>
            <p style="margin-bottom:8px;padding-left:2em;">（7）散布淫秽、色情、赌博、暴力、凶杀、恐怖或者教唆犯罪的；</p>
            <p style="margin-bottom:8px;padding-left:2em;">（8）侮辱或者诽谤他人，侵害他人合法权益的；</p>
            <p style="margin-bottom:12px;padding-left:2em;">（9）含有法律、行政法规禁止的其他内容的。</p>
            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">四、内容发布与知识产权</h3>
            <p style="margin-bottom:12px;text-indent:2em;">1. 您在本平台发布的内容，您保证对其享有合法的知识产权或已获得相关授权。</p>
            <p style="margin-bottom:12px;text-indent:2em;">2. 您在本平台发布的内容，授予本平台在全球范围内免费的、非独占的、可再许可的使用权，包括但不限于展示、传播、复制、改编等。</p>
            <p style="margin-bottom:12px;text-indent:2em;">3. 本平台有权对您发布的内容进行审核，对违反法律法规或本协议的内容进行删除。</p>
            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">五、隐私保护</h3>
            <p style="margin-bottom:12px;text-indent:2em;">本平台重视您的个人信息保护。我们将按照《隐私政策》的规定收集、存储、使用、披露和保护您的个人信息。同时，您也应当尊重他人的隐私，不得发布、传播他人的隐私信息。</p>
            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">六、账号处罚规则</h3>
            <p style="margin-bottom:12px;text-indent:2em;">如您违反本协议或相关法律法规，本平台有权视情节轻重采取以下措施：</p>
            <p style="margin-bottom:8px;padding-left:2em;">（1）警告；</p>
            <p style="margin-bottom:8px;padding-left:2em;">（2）删除违规内容；</p>
            <p style="margin-bottom:8px;padding-left:2em;">（3）限制账号功能；</p>
            <p style="margin-bottom:8px;padding-left:2em;">（4）封禁账号；</p>
            <p style="margin-bottom:12px;padding-left:2em;">（5）涉嫌违法犯罪的，移交司法机关处理。</p>
            <p style="margin-bottom:12px;text-indent:2em;"><strong>关于内容保护与截图溯源的特别约定：</strong>本平台对部分受保护帖子采用暗码水印技术，在页面展示时自动嵌入不可见的数字水印信息。任何对该类内容的截图均携带可溯源的数字标识，平台可通过技术手段追踪到截图的来源用户。未经授权截图、传播受保护内容的用户，一经溯源核实，账号将被<strong style="color:#e53e3e;">永久封禁</strong>，同时禁止登录及接收新帖子。情节严重涉嫌违法犯罪的，将移交司法机关处理。</p>
            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">七、未成年人保护</h3>
            <p style="margin-bottom:12px;text-indent:2em;">未成年人使用本平台服务应在监护人的指导和监督下进行。本平台重视未成年人的保护，如发现未成年人发布或传播不当内容，将及时处理。</p>
            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">八、免责声明</h3>
            <p style="margin-bottom:12px;text-indent:2em;">1. 因不可抗力或本平台不能控制的原因造成的服务中断，本平台不承担责任。</p>
            <p style="margin-bottom:12px;text-indent:2em;">2. 用户发布的内容仅代表用户个人观点，不代表本平台立场。</p>
            <p style="margin-bottom:12px;text-indent:2em;">3. 因用户违反本协议造成的损失，由用户自行承担。</p>
            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">九、协议的终止</h3>
            <p style="margin-bottom:12px;text-indent:2em;">您有权随时注销账号，本协议自账号注销之日起终止。本平台有权根据法律法规及政策变化、业务调整等原因终止本协议，并提前通知您。</p>
            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">十、联系方式</h3>
            <p style="margin-bottom:12px;text-indent:2em;">如您对本协议有任何疑问或建议，请通过平台内"反馈"功能与我们联系，或发送邮件至官方邮箱：<span style="color:#1D9BF0;">zanhuadev@163.com</span>。</p>
            <p style="margin-top:30px;text-align:right;color:#999;font-size:12px;">最后更新日期：2026年7月22日</p>
          </div>
        </div>
      `;
    }
    function renderVerifSubAgreementPage() {
      return `
        <div class="page">
          <div class="navbar" style="position:fixed;top:0;left:0;right:0;z-index:100;background:#fff;">
            <div onclick="goBack()" style="font-size:22px;cursor:pointer;color:#333;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div>
            <h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">赞话用户认证订阅协议</h1>
            <div style="width:28px;"></div>
          </div>
          <div style="padding-top:calc(50px + env(safe-area-inset-top));"></div>
          <div style="padding:20px 16px;line-height:1.8;font-size:14px;color:#333;">
            <p style="margin-bottom:12px;text-indent:2em;">本《赞话用户认证订阅协议》（以下简称"本协议"）是您与"赞话"社交平台（以下简称"本平台"）之间就认证订阅服务所订立的协议。在订阅进阶认证、高级认证或企业/机构/团体认证（以下统称"认证订阅服务"）之前，请您务必仔细阅读并充分理解本协议的全部内容。</p>
            <p style="margin-bottom:12px;text-indent:2em;">您通过勾选"我已阅读并同意"并完成支付，即视为您已阅读并同意本协议的全部内容，且自愿受本协议约束。如您不同意本协议，请勿完成订阅。</p>

            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">一、服务内容</h3>
            <p style="margin-bottom:12px;text-indent:2em;">1. 认证订阅服务是本平台为创作者提供的增值服务，按订阅类型不同，提供差异化的权益组合，具体权益内容以订阅页面展示为准。</p>
            <p style="margin-bottom:12px;text-indent:2em;">2. 认证标识（包括进阶认证、高级认证、企业/机构/团体认证图标）是本平台授予订阅用户在订阅有效期内的展示权益，不代表本平台对用户发布内容的真实性、合法性作出任何担保或背书。</p>
            <p style="margin-bottom:12px;text-indent:2em;">3. 权益将在订单支付完成并通过本平台后台审核（通常为3个工作日内）后立即生效，有效期自审核通过之日起计算。</p>

            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">二、订阅费用与退款</h3>
            <p style="margin-bottom:12px;text-indent:2em;">1. 订阅费用按月或按年收取，具体金额以订阅页面实时展示为准。首月优惠仅对从未订阅过进阶/高级认证的用户开放一次。</p>
            <p style="margin-bottom:12px;text-indent:2em;">2. 已享受首月优惠的订单若未在3个工作日内审核通过，将自动取消订单并退还对应费用。</p>
            <p style="margin-bottom:12px;text-indent:2em;">3. 除上述自动退款情形以及法律法规另有规定外，<strong>订阅费用一经支付且审核通过，原则上不予退款</strong>。如遇特殊情况，您可通过平台内"反馈"功能提交申请，由本平台根据具体情况单独处理。</p>
            <p style="margin-bottom:12px;text-indent:2em;">4. 申请退款一经核准，本平台将收回对应认证标识及全部关联权益，已生效的权益不再保留。</p>

            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">三、未成年人特别约定</h3>
            <p style="margin-bottom:12px;text-indent:2em;">1. 本平台认证订阅服务<strong>不主动向未成年人推广</strong>。若您是未成年人，请在监护人的明确同意和指导下完成订阅，且应在监护人陪同下阅读本协议并完成支付。</p>
            <p style="margin-bottom:12px;text-indent:2em;">2. 您在订阅页面勾选"我已阅读并同意"即表示您向本平台作出如下承诺之一：<strong>（1）您已年满18周岁，不属于未成年人；或（2）您虽为未成年人，但本次订阅已获得您的监护人（家长/法定监护人）的明确许可和同意。</strong></p>
            <p style="margin-bottom:12px;text-indent:2em;">3. 若监护人发现未成年人在未经其同意的情况下完成了订阅，可凭相关证明通过平台内"反馈"功能申请退款，本平台核实后将按本协议第二条约定的退款流程处理并收回相应权益。</p>
            <p style="margin-bottom:12px;text-indent:2em;">4. 本平台有权结合《赞话未成年人（含儿童）隐私政策》及国家关于未成年人网络保护的相关规定，对未成年人账号的订阅行为进行必要的限制。</p>

            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">四、权益使用规范</h3>
            <p style="margin-bottom:12px;text-indent:2em;">1. 认证订阅权益仅限订阅账号本人使用，<strong>不得转让、出租、出借或共享</strong>给任何第三方。</p>
            <p style="margin-bottom:12px;text-indent:2em;">2. 您在使用"帖子保护"等权益时，应遵守国家法律法规及《赞话用户服务协议》，不得将受保护内容用于违法违规用途。</p>
            <p style="margin-bottom:12px;text-indent:2em;">3. 曝光推送、置顶推广等权益仅提升平台内的推送优先级，<strong>不承诺固定的访问人数或效果</strong>。</p>
            <p style="margin-bottom:12px;text-indent:2em;">4. 您发布违规内容或违反本协议、平台规则的，本平台有权视情节轻重采取警告、删除违规内容、限制账号功能、暂停或收回认证权益、封禁账号等措施，已支付的订阅费用不予退还。</p>

            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">五、协议变更与终止</h3>
            <p style="margin-bottom:12px;text-indent:2em;">1. 本平台有权根据法律法规、政策变化或业务调整，适时修订本协议内容，修订后的协议一经公布即有效替代原协议，并将通过平台内通知等方式告知您。</p>
            <p style="margin-bottom:12px;text-indent:2em;">2. 您有权随时停止续费，已生效的订阅权益将持续至当前订阅周期到期为止。</p>
            <p style="margin-bottom:12px;text-indent:2em;">3. 订阅到期未续费的，对应的认证标识及权益将自动失效。</p>

            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">六、免责声明</h3>
            <p style="margin-bottom:12px;text-indent:2em;">1. 因不可抗力或本平台不能控制的原因（包括但不限于网络故障、系统维护、政策调整等）造成的服务中断或权益延迟生效，本平台不承担责任。</p>
            <p style="margin-bottom:12px;text-indent:2em;">2. 本平台不对订阅权益带来的具体流量、收益等效果作出任何明示或暗示的保证。</p>

            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">七、联系方式</h3>
            <p style="margin-bottom:12px;text-indent:2em;">如您对本协议有任何疑问、意见或建议，请通过平台内"反馈"功能与我们联系，或发送邮件至官方邮箱：<span style="color:#1D9BF0;">zanhuadev@163.com</span>。我们将在收到您的反馈后尽快处理。</p>
            <p style="margin-top:30px;text-align:right;color:#999;font-size:12px;">最后更新日期：2026年8月3日</p>
          </div>
        </div>
      `;
    }
    function renderEnterpriseAgreementPage() {
      return `
        <div class="page">
          <div class="navbar" style="position:fixed;top:0;left:0;right:0;z-index:100;background:#fff;">
            <div onclick="goBack()" style="font-size:22px;cursor:pointer;color:#333;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div>
            <h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">赞话认证服务协议</h1>
            <div style="width:28px;"></div>
          </div>
          <div style="padding-top:calc(50px + env(safe-area-inset-top));"></div>
          <div style="padding:20px 16px;line-height:1.8;font-size:14px;color:#333;">
            <p style="margin-bottom:12px;text-indent:2em;">本《赞话认证服务协议》（以下简称"本协议"）是您与"赞话"社交平台（以下简称"本平台"）之间就企业/机构/团体认证服务（以下简称"认证服务"）所订立的协议。在提交企业/机构/团体认证申请之前，请您务必仔细阅读并充分理解本协议的全部内容。</p>
            <p style="margin-bottom:12px;text-indent:2em;">您通过勾选"我已阅读并同意"并提交认证申请，即视为您或您代表的机构已阅读并同意本协议的全部内容，且自愿受本协议约束。如您不同意本协议，请勿提交认证申请。</p>

            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">一、服务内容与用途</h3>
            <p style="margin-bottom:12px;text-indent:2em;">1. 企业/机构/团体认证服务为申请主体提供实名认证能力，认证通过后账号将获得企业认证标识，用于展示申请主体的官方身份，提升公信力和用户认可度。</p>
            <p style="margin-bottom:12px;text-indent:2em;">2. 企业认证标识仅代表申请主体身份通过审核，不代表本平台对其发布内容的真实性、合法性作出任何担保或背书。</p>
            <p style="margin-bottom:12px;text-indent:2em;">3. 认证审核周期通常为 3~5 个工作日，审核结果通过站内信通知；未通过的申请可根据反馈补充材料后重新提交。</p>

            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">二、认证申请主体与资质</h3>
            <p style="margin-bottom:12px;text-indent:2em;">1. 申请企业/机构/团体认证的主体应当为合法注册的企业法人、事业单位、社会团体、个体工商户、民办非企业单位或其他具有合法主体资格的组织。</p>
            <p style="margin-bottom:12px;text-indent:2em;">2. 申请主体须提交真实、合法、有效的资质证明材料，包括但不限于营业执照、授权委托书、经办人身份证明、对公账户信息等。伪造、变造或提供虚假材料的，本平台有权直接驳回申请或撤销已通过的认证，已支付的认证费用不予退还。</p>
            <p style="margin-bottom:12px;text-indent:2em;">3. 申请主体授权经办人提交认证申请并签署本协议的，经办人应保证其具有充分合法的授权，因授权产生的一切责任由申请主体承担。</p>

            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">三、认证费用与退款</h3>
            <p style="margin-bottom:12px;text-indent:2em;">1. 企业/机构/团体认证按年收取认证服务费，具体金额以申请页实时展示为准。认证服务年费为一次性费用，用于审核成本及认证标识展示权益。</p>
            <p style="margin-bottom:12px;text-indent:2em;">2. 申请提交后至审核完成前，申请主体可主动撤回申请；如材料缺失且在本平台通知后 7 个工作日内未补充，视为自动放弃，认证费用按原路退还。</p>
            <p style="margin-bottom:12px;text-indent:2em;">3. 除上述情形以及法律法规另有规定外，<strong>认证服务费一经支付且审核通过，原则上不予退款</strong>。如遇特殊情况，可通过"反馈"功能提交申请，由本平台根据具体情况单独处理。</p>
            <p style="margin-bottom:12px;text-indent:2em;">4. 认证有效期为 1 年，到期前 30 天内平台将提醒申请主体续费，逾期未续费认证标识自动失效。</p>

            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">四、认证主体义务</h3>
            <p style="margin-bottom:12px;text-indent:2em;">1. 申请主体应遵守国家法律法规及《赞话用户服务协议》《赞话社区规范》等平台规则，不得利用认证账号发布违法违规内容。</p>
            <p style="margin-bottom:12px;text-indent:2em;">2. 认证主体的名称、证照、授权关系等关键信息发生变更时，应在 15 个工作日内通过本平台认证入口重新提交材料完成变更审核，否则本平台有权暂停或撤销认证标识。</p>
            <p style="margin-bottom:12px;text-indent:2em;">3. 认证主体不得将认证账号转让、出租、出借给第三方使用，不得擅自以认证主体名义对外作出超出平台服务范围的承诺或宣传。</p>
            <p style="margin-bottom:12px;text-indent:2em;">4. 认证主体发布违规内容或违反本协议、平台规则的，本平台有权视情节轻重采取警告、删除违规内容、限制账号功能、暂停或撤销认证标识、封禁账号等措施，已支付的认证服务费不予退还。</p>

            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">五、个人信息与资质材料保护</h3>
            <p style="margin-bottom:12px;text-indent:2em;">1. 本平台严格按照《赞话用户隐私政策》保护申请主体提交的个人信息及资质材料，除法律法规要求或经申请主体同意外，不向第三方披露或用于与认证无关的用途。</p>
            <p style="margin-bottom:12px;text-indent:2em;">2. 资质材料及经办人信息仅用于认证审核及必要的法律审计，审核完成后将按平台规定的保存期限妥善存储。</p>

            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">六、协议变更与终止</h3>
            <p style="margin-bottom:12px;text-indent:2em;">1. 本平台有权根据法律法规、政策变化或业务调整，适时修订本协议内容，修订后的协议一经公布即有效替代原协议，并将通过平台内通知等方式告知。</p>
            <p style="margin-bottom:12px;text-indent:2em;">2. 申请主体有权随时停止续费，已生效的认证权益将持续至当前认证周期到期为止。</p>
            <p style="margin-bottom:12px;text-indent:2em;">3. 认证到期未续费或因违规被撤销认证的，对应的企业认证标识及全部关联权益自动失效。</p>

            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">七、免责声明</h3>
            <p style="margin-bottom:12px;text-indent:2em;">1. 因不可抗力或本平台不能控制的原因（包括但不限于网络故障、系统维护、政策调整、主管机关临时要求等）造成的认证延迟或服务中断，本平台不承担责任。</p>
            <p style="margin-bottom:12px;text-indent:2em;">2. 本平台不对认证账号通过认证后所获得的展示效果、流量或经营收益作出任何明示或暗示的保证。</p>

            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">八、联系方式</h3>
            <p style="margin-bottom:12px;text-indent:2em;">如您对本协议或认证服务有任何疑问、意见或建议，请通过平台内"反馈"功能与我们联系，或发送邮件至官方邮箱：<span style="color:#1D9BF0;">zanhuadev@163.com</span>。我们将在收到您的反馈后尽快处理。</p>
            <p style="margin-top:30px;text-align:right;color:#999;font-size:12px;">最后更新日期：2026年8月9日</p>
          </div>
        </div>
      `;
    }
    function renderRedeemCode() {
      if (!getToken()) { showLoginModal(); return ''; }
      return '<div class="vs-page" style="overflow:hidden;">' +
        '<div class="vs-nav"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;width:40px;"><i class="fa-solid fa-angle-left" style="font-weight:600;color:#fff;"></i></div><h1>输入兑换序列号</h1><div style="width:40px;"></div></div>' +
        '<div class="vs-hero"><div class="vs-hero-title">输入兑换序列号</div></div>' +
        '<div style="padding:24px 20px;">' +
          '<input id="redeemCodeInput" type="text" inputmode="text" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" style="width:100%;padding:16px 18px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);border-radius:12px;color:#fff;font-size:16px;font-family:ZanhuaSans,-apple-system,sans-serif;letter-spacing:0.12em;text-align:left;outline:none;box-sizing:border-box;transition:border-color 0.2s;" onfocus="this.style.borderColor=\'rgba(255,255,255,0.35)\'" onblur="this.style.borderColor=\'rgba(255,255,255,0.15)\'">' +
          '<div id="redeemCodeMsg" style="margin-top:16px;font-size:13px;text-align:center;min-height:20px;color:rgba(255,255,255,0.5);"></div>' +
          '<button id="redeemCodeBtn" onclick="submitRedeemCode()" class="vs-btn vs-btn-premium" style="margin-top:20px;">确认兑换</button>' +
        '</div>' +
        '<div style="padding:0 20px;">' +
          '<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;">' +
            '<div style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.6);margin-bottom:10px;">兑换说明</div>' +
            '<div style="font-size:12px;color:rgba(255,255,255,0.4);line-height:1.8;">' +
              '<div>• 兑换序列号为25位大写字母和数字</div>' +
              '<div>• 每5位为一组，输入时自动添加横线</div>' +
              '<div>• 兑换成功后认证将自动发放到您的账户</div>' +
              '<div>• 如兑换序列号无法使用或有任何疑问，请联系管理员处理</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    }
    function fitRedeemInputFontSize() {
      var inp = document.getElementById('redeemCodeInput');
      if (!inp) return;
      var availWidth = inp.clientWidth - 36;
      if (availWidth <= 0) return;
      var testText = 'XXXXX-XXXXX-XXXXX-XXXXX-XXXXX';
      var fontFamily = 'ZanhuaSans,-apple-system,sans-serif';
      var testEl = document.createElement('span');
      testEl.style.visibility = 'hidden';
      testEl.style.position = 'absolute';
      testEl.style.whiteSpace = 'nowrap';
      testEl.style.fontFamily = fontFamily;
      testEl.style.letterSpacing = '0.12em';
      document.body.appendChild(testEl);
      var lo = 8, hi = 32, best = 16;
      while (lo <= hi) {
        var mid = Math.floor((lo + hi) / 2);
        testEl.style.fontSize = mid + 'px';
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
      inp.style.fontSize = best + 'px';
      inp.style.letterSpacing = '0.12em';
    }
    function formatRedeemCode(raw) {
      var cleaned = raw.replace(/[^A-Za-z0-9\-]/g, '');
      cleaned = cleaned.toUpperCase();
      var chars = cleaned.replace(/-/g, '');
      if (chars.length > 25) chars = chars.substring(0, 25);
      var formatted = '';
      for (var i = 0; i < chars.length; i++) {
        if (i > 0 && i % 5 === 0) formatted += '-';
        formatted += chars[i];
      }
      return formatted;
    }
    function bindRedeemCodeEvents() {
      var inp = document.getElementById('redeemCodeInput');
      if (!inp) return;
      fitRedeemInputFontSize();
      var resizeHandler = null;
      window.addEventListener('resize', function() {
        if (resizeHandler) clearTimeout(resizeHandler);
        resizeHandler = setTimeout(fitRedeemInputFontSize, 150);
      });
      inp.addEventListener('input', function() {
        var formatted = formatRedeemCode(this.value);
        if (this.value !== formatted) {
          var pos = this.selectionStart;
          var oldLen = this.value.length;
          this.value = formatted;
          var newLen = formatted.length;
          var newPos = pos + (newLen - oldLen);
          if (newPos < 0) newPos = 0;
          if (newPos > newLen) newPos = newLen;
          try { this.setSelectionRange(newPos, newPos); } catch(e) {}
        }
      });
      inp.addEventListener('paste', function(e) {
        e.preventDefault();
        var pasted = '';
        if (e.clipboardData && e.clipboardData.getData) {
          pasted = e.clipboardData.getData('text');
        } else if (window.clipboardData && window.clipboardData.getData) {
          pasted = window.clipboardData.getData('Text');
        }
        var start = this.selectionStart || 0;
        var end = this.selectionEnd || 0;
        var newVal = this.value.substring(0, start) + pasted + this.value.substring(end);
        var formatted = formatRedeemCode(newVal);
        this.value = formatted;
        this.setSelectionRange(formatted.length, formatted.length);
      });
      inp.addEventListener('keydown', function(e) {
        if (e.key.length === 1 && !/[A-Za-z0-9\-]/.test(e.key)) {
          e.preventDefault();
        }
      });
      inp.addEventListener('focus', function() {
        fitRedeemInputFontSize();
        var self = this;
        setTimeout(function() {
          if (self.value === '') {
            self.setSelectionRange(0, 0);
          }
        }, 0);
      });
      setTimeout(function() { inp.focus(); }, 200);
    }
    async function submitRedeemCode() {
      var inp = document.getElementById('redeemCodeInput');
      var btn = document.getElementById('redeemCodeBtn');
      var msg = document.getElementById('redeemCodeMsg');
      var code = (inp ? inp.value.replace(/-/g, '').toUpperCase() : '');
      if (!code) { if (msg) msg.innerHTML = '<span style="color:#ef4444;">请输入兑换序列号</span>'; return; }
      if (code.length !== 25) { if (msg) msg.innerHTML = '<span style="color:#ef4444;">兑换序列号必须为25位</span>'; return; }
      if (btn) btn.disabled = true;
      if (msg) msg.innerHTML = '<span style="color:rgba(255,255,255,0.5);">正在验证...</span>';
      try {
        var r = await api('/redeemCode', 'POST', { code: code });
        if (r.code === 1) {
          if (msg) msg.innerHTML = '<span style="color:#10b981;">🎉 ' + r.msg + '</span>';
          if (inp) inp.value = '';
          setTimeout(function() { if (msg) msg.innerHTML = ''; }, 5000);
        } else {
          if (msg) msg.innerHTML = '<span style="color:#ef4444;">' + r.msg + '</span>';
        }
      } catch(e) {
        if (msg) msg.innerHTML = '<span style="color:#ef4444;">网络错误，请重试</span>';
      }
      if (btn) btn.disabled = false;
    }
    function renderPrivacyPage() {
      return `
        <div class="page">
          <div class="navbar" style="position:fixed;top:0;left:0;right:0;z-index:100;background:#fff;">
            <div onclick="goBack()" style="font-size:22px;cursor:pointer;color:#333;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div>
            <h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">赞话用户隐私政策</h1>
            <div style="width:28px;"></div>
          </div>
          <div style="padding-top:calc(50px + env(safe-area-inset-top));"></div>
          <div style="padding:20px 16px;line-height:1.8;font-size:14px;color:#333;">
            <p style="margin-bottom:12px;text-indent:2em;">"赞话"（以下简称"我们"）深知个人信息对您的重要性，我们将按照法律法规要求，采取相应安全保护措施，尽力保护您的个人信息安全可控。</p>
            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">一、我们收集的信息</h3>
            <p style="margin-bottom:12px;font-weight:600;">（一）注册信息</p>
            <p style="margin-bottom:12px;text-indent:2em;">当您注册账号时，我们会收集您的手机号、昵称、头像等信息，用于创建账号和提供服务。</p>
            <p style="margin-bottom:12px;font-weight:600;">（二）使用信息</p>
            <p style="margin-bottom:12px;text-indent:2em;">当您使用本平台服务时，我们会收集以下信息：</p>
            <p style="margin-bottom:8px;padding-left:2em;">1. 发布的内容：您发布的帖子、评论、点赞、收藏等操作记录；</p>
            <p style="margin-bottom:8px;padding-left:2em;">2. 日志信息：设备型号、操作系统版本、IP地址、访问时间等；</p>
            <p style="margin-bottom:8px;padding-left:2em;">3. 位置信息：经您授权后获取的地理位置信息。</p>
            <p style="margin-bottom:12px;font-weight:600;">（三）图片/视频信息</p>
            <p style="margin-bottom:12px;text-indent:2em;">当您上传图片或视频时，我们会存储您上传的内容，用于在平台展示。</p>
            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">二、我们如何使用信息</h3>
            <p style="margin-bottom:12px;text-indent:2em;">我们收集您的信息用于以下目的：</p>
            <p style="margin-bottom:8px;padding-left:2em;">1. 提供、维护、改进我们的服务；</p>
            <p style="margin-bottom:8px;padding-left:2em;">2. 保障账号安全，防范欺诈等违法行为；</p>
            <p style="margin-bottom:8px;padding-left:2em;">3. 内容审核，保障平台内容合规；</p>
            <p style="margin-bottom:8px;padding-left:2em;">4. 向您发送通知、消息；</p>
            <p style="margin-bottom:12px;padding-left:2em;">5. 统计分析，优化产品体验。</p>
            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">三、信息共享与披露</h3>
            <p style="margin-bottom:12px;text-indent:2em;">我们不会向第三方出售您的个人信息。仅在以下情况下，我们可能会共享您的信息：</p>
            <p style="margin-bottom:8px;padding-left:2em;">1. 获得您的明确同意；</p>
            <p style="margin-bottom:8px;padding-left:2em;">2. 根据法律法规要求或司法/行政机关的强制性要求；</p>
            <p style="margin-bottom:8px;padding-left:2em;">3. 为保护我们及用户的合法权益所必需；</p>
            <p style="margin-bottom:8px;padding-left:2em;">4. 与授权合作伙伴共享：仅为实现本政策中声明的目的，我们的某些服务将由授权合作伙伴提供。我们可能会与合作伙伴共享您的某些个人信息，以提供更好的客户服务和用户体验。</p>
            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">四、信息存储与安全</h3>
            <p style="margin-bottom:12px;text-indent:2em;">我们采取符合行业标准的安全措施保护您的个人信息安全，包括但不限于数据加密、访问控制、防火墙、定期安全审计等。</p>
            <p style="margin-bottom:12px;text-indent:2em;">我们将在中华人民共和国境内存储和处理您的个人信息。如需跨境传输，我们将按照法律法规执行。</p>
            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">五、您的权利</h3>
            <p style="margin-bottom:12px;text-indent:2em;">您对您的个人信息享有以下权利：</p>
            <p style="margin-bottom:8px;padding-left:2em;">1. 访问权：您可以在个人中心查看您的个人信息；</p>
            <p style="margin-bottom:8px;padding-left:2em;">2. 更正权：您可以修改您的个人资料；</p>
            <p style="margin-bottom:8px;padding-left:2em;">3. 删除权：您可以要求删除您的个人信息；</p>
            <p style="margin-bottom:8px;padding-left:2em;">4. 注销权：您可以注销您的账号；</p>
            <p style="margin-bottom:12px;padding-left:2em;">5. 投诉举报权：如您认为我们侵犯了您的个人信息权益，可以进行投诉举报。</p>
            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">六、未成年人保护</h3>
            <p style="margin-bottom:12px;text-indent:2em;">我们非常重视对未成年人个人信息的保护。若您是未成年人，在使用我们的产品和/或服务前，应事先取得您监护人的同意。</p>
            <p style="margin-bottom:12px;text-indent:2em;">对于经监护人同意而收集的未成年人信息，我们只会在受到法律允许、监护人明确同意或者保护未成年人所必要的情况下使用或披露。</p>
            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">七、Cookie及类似技术</h3>
            <p style="margin-bottom:12px;text-indent:2em;">我们可能会使用Cookie等技术来提升用户体验。您可以通过浏览器设置管理Cookie。</p>
            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">八、政策的更新</h3>
            <p style="margin-bottom:12px;text-indent:2em;">我们可能会适时更新本隐私政策。当政策发生重大变更时，我们将在平台内通知您。请您及时查看最新版本的隐私政策。</p>
            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">九、联系我们</h3>
            <p style="margin-bottom:12px;text-indent:2em;">如您对本隐私政策有任何疑问、意见或建议，请通过平台内"反馈"功能与我们联系，或发送邮件至官方邮箱：<span style="color:#1D9BF0;">zanhuadev@163.com</span>。我们将在收到您的反馈后尽快处理。</p>
            <p style="margin-top:30px;text-align:right;color:#999;font-size:12px;">最后更新日期：2026年7月22日</p>
          </div>
        </div>
      `;
    }
    function renderMinorPrivacyPage() {
      return `
        <div class="page">
          <div class="navbar" style="position:fixed;top:0;left:0;right:0;z-index:100;background:#fff;">
            <div onclick="goBack()" style="font-size:22px;cursor:pointer;color:#333;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div>
            <h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">赞话未成年人（含儿童）隐私政策</h1>
            <div style="width:28px;"></div>
          </div>
          <div style="padding-top:calc(50px + env(safe-area-inset-top));"></div>
          <div style="padding:20px 16px;line-height:1.8;font-size:14px;color:#333;">
            <p style="margin-bottom:12px;text-indent:2em;">"赞话"（以下简称"我们"）深知未成年人个人信息对未成年人及其监护人的重要性。我们将按照《中华人民共和国未成年人保护法》《中华人民共和国个人信息保护法》等法律法规要求，严格保护未成年人的个人信息安全。本政策专门适用于不满十四周岁的未成年人（以下简称"儿童"），十四周岁以上的未成年人适用《隐私政策》及本政策中相关特别规定。</p>
            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">一、适用范围</h3>
            <p style="margin-bottom:12px;text-indent:2em;">本政策是《隐私政策》的特别组成部分，专门规定我们在收集、使用、存储、共享和保护未成年人个人信息时的做法。如本政策与《隐私政策》存在不一致，以本政策为准；本政策未规定的，适用《隐私政策》。</p>
            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">二、未成年人使用前提</h3>
            <p style="margin-bottom:12px;text-indent:2em;">1. 若您是不满十四周岁的儿童，在使用本平台任何服务前，应事先取得您的父母或其他监护人（以下统称"监护人"）的书面同意，并在监护人指导下使用。</p>
            <p style="margin-bottom:12px;text-indent:2em;">2. 若您是已满十四周岁不满十八周岁的未成年人，应在监护人的指导和监督下阅读本政策及《用户服务协议》，并在监护人同意后使用本平台服务。</p>
            <p style="margin-bottom:12px;text-indent:2em;">3. 监护人应指导未成年人树立良好的网络安全和个人信息保护意识，提醒未成年人不要随意向他人透露个人信息。</p>
            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">三、我们收集的未成年人信息</h3>
            <p style="margin-bottom:12px;font-weight:600;">（一）注册与账号信息</p>
            <p style="margin-bottom:12px;text-indent:2em;">未成年人注册账号时，我们仅收集必要的信息，如手机号、昵称、头像，用于创建账号和身份识别。我们不会主动收集未成年人的真实姓名、身份证号、住址等敏感个人信息。</p>
            <p style="margin-bottom:12px;font-weight:600;">（二）使用行为信息</p>
            <p style="margin-bottom:12px;text-indent:2em;">未成年人使用本平台时，我们会收集其发布内容、互动行为（点赞、评论、收藏）等信息，用于提供和优化服务。</p>
            <p style="margin-bottom:12px;font-weight:600;">（三）设备与日志信息</p>
            <p style="margin-bottom:12px;text-indent:2em;">我们会收集设备型号、操作系统版本、IP地址、访问时间等日志信息，用于账号安全保护和服务优化。</p>
            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">四、信息使用原则</h3>
            <p style="margin-bottom:12px;text-indent:2em;">我们收集未成年人个人信息，将严格遵循以下原则：</p>
            <p style="margin-bottom:8px;padding-left:2em;">1. 最小必要原则：仅收集实现服务所必需的最少信息；</p>
            <p style="margin-bottom:8px;padding-left:2em;">2. 监护人同意原则：收集儿童个人信息前，将通过显著方式告知监护人并取得同意；</p>
            <p style="margin-bottom:8px;padding-left:2em;">3. 合法正当原则：严格按照法律法规和本政策使用信息；</p>
            <p style="margin-bottom:12px;padding-left:2em;">4. 安全保护原则：采取加密、访问控制等措施保护信息安全。</p>
            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">五、信息共享与披露</h3>
            <p style="margin-bottom:12px;text-indent:2em;">我们不会向第三方出售未成年人的个人信息。仅在以下情况下，我们可能共享或披露未成年人信息：</p>
            <p style="margin-bottom:8px;padding-left:2em;">1. 事先获得监护人的明确同意；</p>
            <p style="margin-bottom:8px;padding-left:2em;">2. 根据法律法规要求或司法/行政机关的强制性要求；</p>
            <p style="margin-bottom:8px;padding-left:2em;">3. 为保护未成年人或其他用户的人身、财产安全所必需；</p>
            <p style="margin-bottom:12px;padding-left:2em;">4. 与经过严格筛选的授权合作伙伴共享，且仅限于实现服务目的所必需的信息。</p>
            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">六、信息存储与安全</h3>
            <p style="margin-bottom:12px;text-indent:2em;">1. 未成年人个人信息将在中华人民共和国境内存储和处理。</p>
            <p style="margin-bottom:12px;text-indent:2em;">2. 我们设立专门的未成年人个人信息保护负责人，对未成年人信息采取加密存储、访问权限控制、定期安全审计等保护措施。</p>
            <p style="margin-bottom:12px;text-indent:2em;">3. 未成年人账号注销后，我们将及时删除相关个人信息，法律法规另有规定的除外。</p>
            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">七、监护人的权利</h3>
            <p style="margin-bottom:12px;text-indent:2em;">监护人对未成年人的个人信息享有以下权利：</p>
            <p style="margin-bottom:8px;padding-left:2em;">1. 知情权：了解我们收集、使用未成年人信息的情况；</p>
            <p style="margin-bottom:8px;padding-left:2em;">2. 访问权：查阅未成年人的个人信息；</p>
            <p style="margin-bottom:8px;padding-left:2em;">3. 更正权：要求更正不准确的信息；</p>
            <p style="margin-bottom:8px;padding-left:2em;">4. 删除权：要求删除未成年人的个人信息；</p>
            <p style="margin-bottom:12px;padding-left:2em;">5. 撤回同意权：撤回之前给予的同意。</p>
            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">八、内容安全与防沉迷</h3>
            <p style="margin-bottom:12px;text-indent:2em;">1. 我们建立了内容审核机制，对未成年人接触的内容进行严格筛选，过滤不适宜未成年人的内容。</p>
            <p style="margin-bottom:12px;text-indent:2em;">2. 我们提供青少年模式，限制未成年人的使用时长和可访问内容，保护未成年人健康上网。</p>
            <p style="margin-bottom:12px;text-indent:2em;">3. 我们积极引导未成年人树立正确的网络使用观念，鼓励监护人参与和监督。</p>
            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">九、政策的更新</h3>
            <p style="margin-bottom:12px;text-indent:2em;">我们可能会适时更新本政策。当政策发生重大变更时，我们将通过平台显著位置通知监护人和未成年人。请您及时查看最新版本的政策内容。</p>
            <h3 style="font-size:16px;font-weight:600;margin:20px 0 10px;">十、联系我们</h3>
            <p style="margin-bottom:12px;text-indent:2em;">如对本政策有任何疑问、意见或建议，或需要行使您的权利，请通过平台内"反馈"功能与我们联系，或发送邮件至官方邮箱：<span style="color:#1D9BF0;">zanhuadev@163.com</span>。我们将在收到您的反馈后尽快处理。</p>
            <p style="margin-top:30px;text-align:right;color:#999;font-size:12px;">最后更新日期：2026年7月23日</p>
          </div>
        </div>
      `;
    }
    function renderReportPage() {
      const reasonHtml = REPORT_REASONS.map(r => `
        <div class="report-reason-item ${reportReason === r.key ? 'active' : ''}" onclick="selectReportReason('${r.key}')">
          <span>${r.label}</span>
          <i class="fa-solid fa-chevron-right" style="color:#ccc;font-size:12px;"></i>
        </div>
      `).join('');
      const currentReason = REPORT_REASONS.find(r => r.key === reportReason);
      const subReasonsHtml = currentReason ? currentReason.subs.map(s => `
        <div class="report-sub-reason ${reportSubReason === s ? 'active' : ''}" onclick="selectReportSubReason('${s}')">${s}</div>
      `).join('') : '';
      const imagesHtml = reportImages.map((img, i) => `
        <div class="report-img-item">
          <img src="${img}">
          <div class="report-img-remove" onclick="removeReportImage(${i})">×</div>
        </div>
      `).join('');
      const canAddImg = reportImages.length < 4;
      return `<div class="page" style="background:#f5f5f7;min-height:100vh;">
        <div class="navbar"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div><h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">举报</h1><div style="width:40px;"></div></div>
        <div style="padding:12px;">
          <div style="background:#fff;border-radius:12px;padding:4px 0;margin-bottom:12px;">
            <div style="padding:12px 16px;font-size:14px;color:#333;font-weight:600;">选择举报原因</div>
            ${reasonHtml}
          </div>
          ${reportReason ? `<div style="background:#fff;border-radius:12px;padding:4px 0 12px;margin-bottom:12px;">
            <div style="padding:12px 16px;font-size:14px;color:#333;font-weight:600;">具体原因</div>
            <div style="padding:0 16px;display:flex;flex-wrap:wrap;gap:8px;">
              ${subReasonsHtml}
            </div>
          </div>` : ''}
          <div style="background:#fff;border-radius:12px;padding:12px 16px;margin-bottom:12px;">
            <div style="font-size:14px;color:#333;font-weight:600;margin-bottom:10px;">补充描述（选填）</div>
            <textarea id="reportDescription" class="report-textarea" placeholder="请详细描述违规情况，帮助我们更快处理..."></textarea>
          </div>
          <div style="background:#fff;border-radius:12px;padding:12px 16px;margin-bottom:20px;">
            <div style="font-size:14px;color:#333;font-weight:600;margin-bottom:10px;">上传图片凭证（最多4张）</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;">
              ${imagesHtml}
              ${canAddImg ? `<div class="report-img-add" onclick="document.getElementById('reportImgInput').click()">
                <i class="fa-solid fa-plus" style="font-size:20px;color:#ccc;"></i>
              </div>` : ''}
            </div>
            <input type="file" id="reportImgInput" accept="image/*" multiple style="display:none;" onchange="onReportImgChange(event)">
          </div>
          <button class="report-submit-btn" onclick="submitReport()">提交举报</button>
        </div>
      </div>`;
    }
    function bindReportEvents() {
      const ta = document.getElementById('reportDescription');
      if (ta) {
        ta.addEventListener('input', function() {
          if (this.value.length > 500) {
            this.value = this.value.slice(0, 500);
            showToast('描述最多500字');
          }
        });
      }
    }
    function selectReportReason(key) {
      reportReason = key;
      reportSubReason = '';
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
        const reader = new FileReader();
        reader.onload = (ev) => {
          reportImages.push(ev.target.result);
          render();
        };
        reader.readAsDataURL(file);
      });
      e.target.value = '';
    }
    function removeReportImage(index) {
      reportImages.splice(index, 1);
      render();
    }
    async function submitReport() {
      if (!reportReason) { showToast('请选择举报原因'); return; }
      const description = document.getElementById('reportDescription')?.value.trim() || '';
      try {
        const uploadedUrls = [];
        for (let i = 0; i < reportImages.length; i++) {
          const base64 = reportImages[i];
          const res = await uploadBase64Image(base64, 'report');
          if (res && res.url) uploadedUrls.push(res.url);
        }
        const res = await api('/report', 'POST', {
          targetType: reportTargetType,
          targetId: reportTargetId,
          reason: reportReason,
          subReason: reportSubReason,
          description,
          images: uploadedUrls
        });
        if (res.code === 1) {
          showToast(res.msg || '举报成功');
          setTimeout(() => { goBack(); }, 1000);
        } else {
          showToast(res.msg || '举报失败');
        }
      } catch(e) {
        showToast('提交失败，请重试');
      }
    }
    function uploadBase64Image(base64, type) {
      return new Promise((resolve, reject) => {
        const byteString = atob(base64.split(',')[1]);
        const mimeString = base64.split(',')[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: mimeString });
        const formData = new FormData();
        formData.append('images', blob, 'report_' + Date.now() + '.jpg');
        const xhr = new XMLHttpRequest();
        xhr.open('POST', API_BASE + '/uploadImage', true);
        xhr.setRequestHeader('Authorization', getToken());
        xhr.onload = function() {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              if (data.code === 1 && data.data && data.data.length > 0) {
                resolve({ url: data.data[0] });
              } else {
                reject(new Error(data.msg || '上传失败'));
              }
            } catch(e) { reject(e); }
          } else {
            reject(new Error('上传失败'));
          }
        };
        xhr.onerror = () => reject(new Error('上传失败'));
        xhr.send(formData);
      });
    }
    function renderRulesCenter() {
      return `<div class="page" style="background:#fff;min-height:100vh;">
        <div class="navbar"><div onclick="goBack()" style="font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-angle-left" style="font-weight:600;"></i></div><h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;">规则中心</h1><div style="width:40px;"></div></div>
        <div style="padding:16px;">
          <div style="font-size:18px;font-weight:600;color:#333;margin-bottom:12px;">赞话社区内容管理规范</div>
          <div style="font-size:14px;color:#666;line-height:1.8;">
            <p style="margin-bottom:12px;"><strong>总则</strong></p>
            <p style="margin-bottom:12px;">1. 为维护清朗、健康、有序的社区交流环境，保障赞话社区全体用户合法权益，防范网络安全风险，本规范依据《中华人民共和国网络安全法》《网络信息内容生态治理规定》等现行国家法律法规制定。</p>
            <p style="margin-bottom:12px;">2. 赞话社区搭建机器初审+人工复核双层审核体系，全线接入阿里云内容安全机器审核，实现7×24小时不间断全量自动化内容检测。</p>
            <p style="margin-bottom:12px;">3. 用户在赞话社区执行任意内容类操作，即代表本人已完整阅读、充分理解并无条件同意本规范所有条款。</p>
            <p style="margin-bottom:12px;"><strong>一、严禁发布色情低俗类内容</strong></p>
            <p style="margin-bottom:8px;">1. 禁止直白、细致描述性器官、性行为，使用涉性侮辱用语；</p>
            <p style="margin-bottom:8px;">2. 禁止分享特殊性癖好、变态性行为、性虐待相关细节；</p>
            <p style="margin-bottom:8px;">3. 禁止发布、隐晦引流各类色情交易、招嫖信息；</p>
            <p style="margin-bottom:8px;">4. 禁止发布性暗示文案、露骨撩骚对话、低俗网络玩梗等软色情内容；</p>
            <p style="margin-bottom:8px;">5. 禁止使用涉黄、擦边类头像、昵称、个性签名。</p>
            <p style="margin-bottom:12px;"><strong>二、严禁发布涉政敏感类内容</strong></p>
            <p style="margin-bottom:8px;">1. 禁止调侃、造谣污蔑、恶意抹黑国家领导人；</p>
            <p style="margin-bottom:8px;">2. 禁止歪曲、否定革命烈士、英雄模范人物的历史事迹；</p>
            <p style="margin-bottom:8px;">3. 禁止发表分裂国家、破坏社会政治稳定的言论；</p>
            <p style="margin-bottom:8px;">4. 禁止转发境外反华组织、分裂势力的宣传文案。</p>
            <p style="margin-bottom:12px;"><strong>三、严禁发布暴力恐怖类内容</strong></p>
            <p style="margin-bottom:8px;">1. 禁止宣扬、美化极端组织、恐怖主义思想；</p>
            <p style="margin-bottom:8px;">2. 禁止描述、公开鼓吹暴力行凶、报复伤人等极端暴力行为；</p>
            <p style="margin-bottom:8px;">3. 禁止介绍、交易各类制式武器弹药、爆炸物、管制刀具；</p>
            <p style="margin-bottom:8px;">4. 禁止分享血腥暴力画面、教唆自残自杀的内容。</p>
            <p style="margin-bottom:12px;"><strong>四、严禁发布违法违禁类内容</strong></p>
            <p style="margin-bottom:8px;">1. 禁止讨论、售卖、求购毒品、麻醉品、精神管制类药品；</p>
            <p style="margin-bottom:8px;">2. 禁止推广、介绍线上线下赌博玩法、博彩网址；</p>
            <p style="margin-bottom:8px;">3. 禁止描述、传授盗窃、诈骗、敲诈等各类违法犯罪手法；</p>
            <p style="margin-bottom:8px;">4. 禁止发布伪造、买卖身份证、学历证书、票据、假币等信息。</p>
            <p style="margin-bottom:12px;"><strong>五、严禁发布不良冒犯类内容</strong></p>
            <p style="margin-bottom:8px;">1. 禁止对其他用户进行人身攻击、恶毒诅咒、当众辱骂；</p>
            <p style="margin-bottom:8px;">2. 禁止针对他人外貌、身材、性别、年龄进行刻意诋毁、羞辱；</p>
            <p style="margin-bottom:8px;">3. 禁止刻意挑起争吵、故意引战、发布煽动网络对立的言论；</p>
            <p style="margin-bottom:8px;">4. 禁止发表针对国别、地域、民族、宗教信仰的歧视性调侃、抹黑言论。</p>
            <p style="margin-bottom:12px;"><strong>六、严禁发布广告引流类内容</strong></p>
            <p style="margin-bottom:8px;">1. 禁止各类形式的站外引流：发布其他社交平台、游戏账号、短视频主页等；</p>
            <p style="margin-bottom:8px;">2. 禁止发布刷单兼职、高薪网赚、灰色副业等广告；</p>
            <p style="margin-bottom:8px;">3. 禁止任何形式的软广、硬广、种草带货、付费推广；</p>
            <p style="margin-bottom:8px;">4. 禁止利用头像、昵称、个性签名植入外部联系方式、推广话术。</p>
            <p style="margin-bottom:12px;"><strong>违规分级处罚标准</strong></p>
            <p style="margin-bottom:8px;">处罚按一年内<strong>总违规次数</strong>（不分违规类别）递进升级，封禁对应违规功能：</p>
            <p style="margin-bottom:8px;">· <strong>第1次</strong>：警告</p>
            <p style="margin-bottom:8px;">· <strong>第2次</strong>：警告</p>
            <p style="margin-bottom:8px;">· <strong>第3次</strong>：限制违规功能1天（如第3次是私信则封私信1天，是评论则封评论1天）</p>
            <p style="margin-bottom:8px;">· <strong>第4次</strong>：限制违规功能3天</p>
            <p style="margin-bottom:8px;">· <strong>第5次</strong>：限制违规功能7天</p>
            <p style="margin-bottom:8px;">· <strong>第6次</strong>：限制违规功能30天</p>
            <p style="margin-bottom:8px;">· <strong>第7次</strong>：限制违规功能60天</p>
            <p style="margin-bottom:8px;">· <strong>第8次</strong>：限制违规功能180天</p>
            <p style="margin-bottom:8px;">· <strong>第9次</strong>：限制违规功能365天</p>
            <p style="margin-bottom:8px;">· <strong>第10次及以上</strong>：永久封禁</p>
            <p style="margin-bottom:8px;">处罚期间，对应功能（发帖、评论、私信、表白墙）将被限制使用，发布时提示"您的xx功能因违反《赞话社区准则》被限制，详情请查看系统消息"。昵称/简介违规时，内容将被自动重置（昵称恢复默认、简介清空）并收到系统通知。</p>
            <p style="margin-bottom:12px;"><strong>申诉说明</strong></p>
            <p style="margin-bottom:8px;">1. 若你认为违规处理属于误判，可在处罚通知发出7天内，通过账号安全中心的「申诉」入口提交申诉；</p>
            <p style="margin-bottom:8px;">2. 申诉审核时效为1~3个工作日，申诉成功将解除对应功能限制；</p>
            <p style="margin-bottom:8px;">3. 经审核确认用户刻意规避审核（谐音、拆字、表情包替代敏感词），直接升级处罚等级，且不予申诉。</p>
          </div>
        </div>
      </div>`;
    }
    function bindRulesCenterEvents() {}
    window.addEventListener('popstate', function(e) {
      if (isPageAnimating) {
        history.pushState({ page: currentPage }, '', '#' + currentPage);
        return;
      }
      if (goBackLock) return;
      if (e.state && e.state.handled) return;
      isPopState = true;
      if (pageHistory.length > 0) {
        const prev = pageHistory.pop();
        currentPage = prev;
        prevPage = currentPage;
        try { history.replaceState({ page: currentPage, handled: true }, '', '#' + currentPage); } catch(e2) {}
        window.scrollTo(0, 0);
        render();
        updateTabbar();
      } else if (!TAB_PAGES.includes(currentPage)) {
        currentPage = 'home';
        prevPage = 'home';
        try { history.replaceState({ page: 'home', handled: true }, '', '#home'); } catch(e2) {}
        window.scrollTo(0, 0);
        render();
        updateTabbar();
      }
      setTimeout(() => { isPopState = false; }, 300);
    });
    try {
      history.replaceState({ page: 'home' }, '', '#home');
    } catch(e) {}
    render();
    updateTabbar();
    checkAccountValid();
    if (getToken()) startBadgeRefresh();
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => { ensureChatInputVisible(); ensureCommentInputVisible(); ensureFabVisible(); adjustModalsToKeyboard(); });
      window.visualViewport.addEventListener('scroll', () => { ensureChatInputVisible(); ensureCommentInputVisible(); ensureFabVisible(); adjustModalsToKeyboard(); });
    }
    window.addEventListener('resize', () => adjustModalsToKeyboard());
    
    if (!window.__modalObserverBound2) {
      window.__modalObserverBound2 = true;
      const mo2 = new MutationObserver(() => {
        if (document.querySelector('.dialog-modal.active, .modal-overlay.active')) adjustModalsToKeyboard();
      });
      mo2.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'id'] });
    }

    setTimeout(() => { ensureChatInputVisible(); ensureCommentInputVisible(); ensureFabVisible(); adjustModalsToKeyboard(); }, 50);
