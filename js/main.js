/* ============================================================
   W16 MISTRAL — main.js
   平滑滚动 / 风切画廊(斜向显现)/ 360° scrub / 四车谱系条 /
   导航 / 菜单 / 进度 / 圆环数据 / 规格页签
   性能:geometry 惰性缓存,滚动帧内零 reflow
   ============================================================ */
(function () {
  'use strict';

  var doc = document, root = doc.documentElement, body = doc.body;
  var IS_MOBILE = window.matchMedia('(max-width: 980px)').matches;
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 全局滚动回调 ---------- */
  var scrollFns = [];
  function onScroll() {
    for (var i = 0; i < scrollFns.length; i++) scrollFns[i]();
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- 工具 ---------- */
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function onReady(fn) {
    if (doc.readyState !== 'loading') fn(); else doc.addEventListener('DOMContentLoaded', fn);
  }

  /* ---------- geometry 缓存 ---------- */
  var geo = { totalH: 0, chapTops: [], scrubs: [], gals: [] };
  function measure() {
    geo.totalH = doc.documentElement.scrollHeight - window.innerHeight;
    geo.scrubs = Array.prototype.map.call(doc.querySelectorAll('.scrub__track'), function (t) {
      return { top: t.getBoundingClientRect().top + window.scrollY, h: t.offsetHeight };
    });
    geo.gals = Array.prototype.map.call(doc.querySelectorAll('.gallery'), function (g) {
      return { top: g.getBoundingClientRect().top + window.scrollY, h: g.offsetHeight };
    });
    var breaks = Array.prototype.slice.call(doc.querySelectorAll('[data-chapter]'));
    geo.chapTops = breaks.map(function (b) {
      return b.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.4;
    });
  }
  window.addEventListener('resize', function () { measure(); onScroll(); });
  window.addEventListener('load', measure);
  doc.addEventListener('load', function (e) {
    if (e.target && e.target.tagName === 'IMG') measure();
  }, true);

  /* ---------- Hero 视差 + 入场 ---------- */
  onReady(function () {
    var hero = doc.querySelector('.hero');
    if (!hero) return;
    setTimeout(function () { hero.classList.add('is-in'); }, 60);
    var px = hero.querySelector('.hero__parallax');
    var hs = doc.querySelector('.hero__scroll');
    scrollFns.push(function () {
      var y = window.scrollY;
      if (px && y < window.innerHeight * 1.4) {
        px.style.transform = 'scale(1.12) translateY(' + (y * 0.2) + 'px)';
      }
      if (hs) hs.style.opacity = y > window.innerHeight * 0.5 ? '0' : '';
    });
  });

  /* ---------- 滚动显现 ---------- */
  onReady(function () {
    var els = doc.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.1 });
    els.forEach(function (el) { io.observe(el); });
  });

  /* ---------- 360° scrub(弹簧惯性) ---------- */
  onReady(function () {
    var tracks = Array.prototype.slice.call(doc.querySelectorAll('.scrub__track'));
    if (!tracks.length) return;

    var instances = tracks.map(function (track) {
      var video = track.querySelector('.scrub__video');
      var texts = Array.prototype.slice.call(track.querySelectorAll('.scrub__text'));
      var degEl = track.querySelector('.scrub__deg b');
      var meterBar = track.querySelector('.scrub__meter i');
      var timeEl = track.querySelector('.scrub__prog b');
      var dur = parseFloat(track.getAttribute('data-dur')) || 20;
      var inst = {
        track: track, video: video, texts: texts,
        degEl: degEl, meterBar: meterBar, timeEl: timeEl,
        dur: dur, videoReady: false, lastSec: -1, loaded: false, idx: -1,
        curP: 0, vel: 0
      };
      if (video && !IS_MOBILE && 'IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
          if (entries.some(function (e) { return e.isIntersecting; }) && !inst.loaded) {
            inst.loaded = true;
            video.preload = 'auto';
            video.load();
          }
        }, { rootMargin: '800px 0px' });
        io.observe(track);
      }
      if (video && !IS_MOBILE && !inst.loaded) {
        var preTimer = setTimeout(function () {
          if (!inst.loaded) {
            inst.loaded = true;
            video.preload = 'auto';
            video.load();
          }
        }, 2500);
        inst.preTimer = preTimer;
      }
      if (video) {
        video.addEventListener('loadedmetadata', function () {
          video.pause();
          video.currentTime = 0;
        });
        video.addEventListener('canplay', function () {
          inst.videoReady = true;
        });
      }
      return inst;
    });

    var lastT = performance.now();
    function step() {
      var now = performance.now();
      var dt = Math.min((now - lastT) / 1000, 0.05);
      lastT = now;
      var vh = window.innerHeight;
      var sy = window.scrollY;
      instances.forEach(function (inst, n) {
        var g = geo.scrubs[n];
        if (!g) return;
        var targetP = clamp01((sy - g.top) / (g.h - vh));
        var diff = targetP - inst.curP;
        inst.vel += diff * 90 * dt;
        inst.vel *= Math.pow(0.85, dt * 60);
        if (inst.vel * diff < 0) inst.vel = 0;
        inst.curP += inst.vel * dt;
        if (inst.curP < 0) { inst.curP = 0; inst.vel = 0; }
        if (inst.curP > 1) { inst.curP = 1; inst.vel = 0; }
        var p = inst.curP;
        if (inst.video && inst.videoReady && !REDUCED) {
          var t = p * inst.dur;
          inst.track.__cssDebugP = p;
          inst.track.__cssDebugT = t;
          if (inst.video.readyState >= 2 && Math.abs(t - inst.video.currentTime) > 0.15) {
            if (inst.video.fastSeek) inst.video.fastSeek(t);
            else inst.video.currentTime = t;
          }
          var seg = t >= inst.dur * 2 / 3 ? 2 : (t >= inst.dur / 3 ? 1 : 0);
          if (seg !== inst.lastSec) {
            inst.lastSec = seg;
            inst.texts.forEach(function (el, i) { el.classList.toggle('is-on', i === seg); });
          }
          if (inst.degEl) inst.degEl.textContent = Math.round(p * 360);
          if (inst.meterBar) inst.meterBar.style.transform = 'scaleX(' + p.toFixed(3) + ')';
          if (inst.timeEl) {
            var m = Math.floor(t / 60), s = Math.floor(t % 60);
            inst.timeEl.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
          }
        } else if (!IS_MOBILE) {
          var seg2 = p >= 2 / 3 ? 2 : (p >= 1 / 3 ? 1 : 0);
          inst.texts.forEach(function (el, i) { el.classList.toggle('is-on', i === seg2); });
        }
      });
    }
    scrollFns.push(step);
    measure();
    step();
    var scrubRaf = null;
    function loop() {
      step();
      scrubRaf = requestAnimationFrame(loop);
    }
    function onVis() {
      if (doc.hidden && scrubRaf) { cancelAnimationFrame(scrubRaf); scrubRaf = null; }
      else if (!doc.hidden && !scrubRaf) scrubRaf = requestAnimationFrame(loop);
    }
    doc.addEventListener('visibilitychange', onVis);
    scrubRaf = requestAnimationFrame(loop);
  });

  /* ---------- 移动端 360°:静态海报 + 自动轮播 ---------- */
  onReady(function () {
    if (!IS_MOBILE) return;
    var tracks = Array.prototype.slice.call(doc.querySelectorAll('.scrub__track'));
    tracks.forEach(function (track) {
      var texts = Array.prototype.slice.call(track.querySelectorAll('.scrub__text'));
      var i = 0, timer = null;
      function show(n) {
        texts.forEach(function (el, k) { el.classList.toggle('is-on', k === n); });
      }
      show(0);
      timer = setInterval(function () { i = (i + 1) % texts.length; show(i); }, 4200);
      doc.addEventListener('visibilitychange', function () {
        if (doc.hidden && timer) clearInterval(timer);
        else if (!doc.hidden) timer = setInterval(function () { i = (i + 1) % texts.length; show(i); }, 4200);
      });
    });
  });

  /* ---------- 风切画廊(斜向显现,clip-path 平滑插值) ---------- */
  onReady(function () {
    var gals = Array.prototype.slice.call(doc.querySelectorAll('.gallery'));
    if (!gals.length) return;

    var instances = gals.map(function (g) {
      var images = Array.prototype.slice.call(g.querySelectorAll('.g-image'));
      return {
        el: g,
        texts: Array.prototype.slice.call(g.querySelectorAll('.g-text')),
        images: images,
        countEl: g.querySelector('.g-count b'),
        // 风切进度:第 0 张恒为完成,其余从 0 开始
        sweeps: images.map(function (_, k) { return k === 0 ? 80 : 0; }),
        lastWritten: images.map(function () { return -1; }),
        lastCount: -1
      };
    });

    function clipOf(s) {
      // 斜边风切:下缘领先 20 个百分点的平行四边形扫过
      var top = Math.max(0, s - 20);
      var bot = s;
      return 'polygon(0 100%, ' + bot + '% 100%, ' + top + '% 0%, 0 0%)';
    }

    function update() {
      var vh = window.innerHeight;
      var S = vh * 1.3;
      var sy = window.scrollY;
      instances.forEach(function (inst, n) {
        var g = geo.gals[n];
        if (!g) return;
        var top = g.top;
        var done = 0;
        inst.texts.forEach(function (t, i) {
          var tTop = top + i * S;
          var p = clamp01((sy - tTop) / S);
          if (i === inst.texts.length - 1) {
            p = clamp01((sy - (top + g.h - S)) / S);
          }
          if (p > 0.99) done++;
          t.classList.toggle('is-on', p > 0.22 && p < 0.62);
          var card = t.querySelector('.g-text__card');
          if (card) card.classList.toggle('is-out', p > 0.62);
          if (inst.images[i] && i > 0) {
            // 文字上移消失的窗口 [62%, 100%] 内,风线斜向扫过显现
            var pp = clamp01((p - 0.62) / 0.38);
            var target = pp * 80;
            inst.sweeps[i] += (target - inst.sweeps[i]) * 0.2;
            var sv = inst.sweeps[i];
            if (Math.abs(sv - inst.lastWritten[i]) > 0.3) {
              inst.lastWritten[i] = sv;
              inst.images[i].style.clipPath = clipOf(sv);
            }
          }
        });
        if (inst.countEl) {
          var cn = Math.min(done + 1, inst.images.length);
          if (cn !== inst.lastCount) {
            inst.lastCount = cn;
            inst.countEl.textContent = (cn < 10 ? '0' + cn : cn) + ' / ' +
              (inst.images.length < 10 ? '0' + inst.images.length : inst.images.length);
          }
        }
      });
    }
    scrollFns.push(update);
    measure();
    update();
  });

  /* ---------- 顶栏:章节标签 + 进度条 ---------- */
  onReady(function () {
    var nowEl = doc.getElementById('navNow');
    var barEl = doc.getElementById('navBar');
    var breaks = Array.prototype.slice.call(doc.querySelectorAll('[data-chapter]'));
    if (!breaks.length) return;

    function update() {
      var sy = window.scrollY;
      if (barEl) barEl.style.width = (clamp01(sy / Math.max(1, geo.totalH)) * 100).toFixed(2) + '%';
      if (nowEl) {
        var cur = 0;
        for (var i = 0; i < geo.chapTops.length; i++) {
          if (sy >= geo.chapTops[i]) cur = i;
        }
        var b = breaks[cur];
        if (b) {
          var t = b.querySelector('.chapter-break__no');
          var h = b.querySelector('h2');
          nowEl.textContent = (t ? t.textContent.trim() : '') + ' · ' +
            (h ? h.childNodes[0].textContent.trim() : '');
        }
      }
    }
    scrollFns.push(update);
    measure();
    update();
  });

  /* ---------- 导航栏:首屏隐藏,滚动后出现 ---------- */
  onReady(function () {
    var nav = doc.getElementById('nav');
    function update() {
      var y = window.scrollY;
      var hero = doc.querySelector('.hero');
      var heroH = hero ? hero.offsetHeight : window.innerHeight;
      if (nav) {
        nav.classList.toggle('is-hero', y < heroH - 40);
        nav.classList.toggle('is-solid', y > heroH - 40);
      }
    }
    scrollFns.push(update);
    update();
  });

  /* ---------- 锚点平滑滚动 ---------- */
  onReady(function () {
    doc.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute('href').slice(1);
      var el = id ? doc.getElementById(id) : null;
      if (!el) return;
      e.preventDefault();
      var y = el.getBoundingClientRect().top + window.scrollY;
      closeMenu();
      window.scrollTo({ top: y - 8, behavior: 'smooth' });
    });
  });

  /* ---------- 章节菜单 ---------- */
  function closeMenu() {
    var overlay = doc.getElementById('menuOverlay');
    var btn = doc.getElementById('menuBtn');
    if (overlay) overlay.classList.remove('is-open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    if (body) body.style.overflow = '';
  }

  onReady(function () {
    var overlay = doc.getElementById('menuOverlay');
    var btn = doc.getElementById('menuBtn');
    if (!overlay || !btn) return;
    btn.addEventListener('click', function () {
      var open = overlay.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      body.style.overflow = open ? 'hidden' : '';
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeMenu();
    });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });
  });

  /* ---------- 滚动进度表盘 ---------- */
  onReady(function () {
    var gauge = doc.getElementById('scrollGauge');
    if (!gauge) return;
    var bar = gauge.querySelector('.sg__bar');
    var num = gauge.querySelector('.sg__num');
    var CIRC = 119.4;
    function update() {
      var p = clamp01(window.scrollY / Math.max(1, geo.totalH));
      gauge.classList.toggle('is-on', p > 0.02);
      bar.style.strokeDashoffset = (CIRC * (1 - p)).toFixed(1);
      num.textContent = String(Math.round(p * 100)).padStart(2, '0');
    }
    scrollFns.push(update);
    measure();
    update();
  });

  /* ---------- 规格 tabs ---------- */
  onReady(function () {
    var tabs = doc.querySelectorAll('.specs-tabs');
    tabs.forEach(function (wrap) {
      var btns = Array.prototype.slice.call(wrap.querySelectorAll('.specs-tabs__btn'));
      var panels = Array.prototype.slice.call(wrap.querySelectorAll('.specs-tabs__panel'));
      btns.forEach(function (b) {
        b.addEventListener('click', function () {
          btns.forEach(function (x) { x.classList.remove('is-on'); });
          panels.forEach(function (p) { p.classList.remove('is-on'); });
          b.classList.add('is-on');
          var pn = wrap.querySelector('.specs-tabs__panel[data-panel="' + b.getAttribute('data-tab') + '"]');
          if (pn) pn.classList.add('is-on');
        });
      });
    });
  });

  /* ---------- 视频:进入视口播放/离开暂停 ---------- */
  onReady(function () {
    var vids = Array.prototype.slice.call(doc.querySelectorAll('video[data-autoview]'));
    if (!vids.length || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var v = en.target;
        if (en.isIntersecting) {
          var pr = v.play();
          if (pr && pr.catch) pr.catch(function () {});
        } else {
          v.pause();
        }
      });
    }, { threshold: 0.2 });
    vids.forEach(function (v) { io.observe(v); });
  });

  /* ---------- 圆环数据(gauges) ---------- */
  onReady(function () {
    var gauges = Array.prototype.slice.call(doc.querySelectorAll('.gauge'));
    if (!gauges.length) return;
    var CIRC = 527.8;
    gauges.forEach(function (g) {
      var val = parseFloat(g.getAttribute('data-gauge')) || 0;
      var max = parseFloat(g.getAttribute('data-max')) || 100;
      var ratio = Math.min(val / max, 1);
      g.style.setProperty('--gauge-off', (CIRC * (1 - ratio)).toFixed(1));
    });
    if (!('IntersectionObserver' in window)) {
      gauges.forEach(function (g) { g.classList.add('is-on'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var g = en.target;
        g.classList.add('is-on');
        var num = g.querySelector('b');
        if (num) {
          var target = parseFloat(g.getAttribute('data-gauge')) || 0;
          var dec = parseInt(g.getAttribute('data-decimals') || '0', 10);
          var unit = g.getAttribute('data-unit') || '';
          var t0 = performance.now();
          var D = 2200;
          function tick(t) {
            var k = Math.min((t - t0) / D, 1);
            var e = 1 - Math.pow(2, -10 * k);
            var v = target * e;
            num.innerHTML = v.toFixed(dec) + (unit ? '<em style="font-style:normal;color:var(--accent-soft);font-size:.55em;margin-left:4px;">' + unit + '</em>' : '');
            if (k < 1) requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
        }
        io.unobserve(g);
      });
    }, { threshold: 0.3 });
    gauges.forEach(function (g) { io.observe(g); });
  });

  /* ---------- 四车谱系条:进入视口逐项显现 + 速度数字滚动 ---------- */
  onReady(function () {
    var items = Array.prototype.slice.call(doc.querySelectorAll('.lineage__item'));
    if (!items.length) return;
    items.forEach(function (it) {
      var spd = it.querySelector('[data-speed]');
      if (spd) {
        var target = parseFloat(spd.getAttribute('data-speed'));
        var dec = parseInt(spd.getAttribute('data-decimals') || '0', 10);
        var suffix = spd.getAttribute('data-suffix') || '';
        var t0 = 0, raf = null;
        function tick(t) {
          if (!t0) t0 = t;
          var k = Math.min((t - t0) / 1800, 1);
          var e = 1 - Math.pow(2, -10 * k);
          spd.textContent = (target * e).toFixed(dec) + suffix;
          if (k < 1) raf = requestAnimationFrame(tick);
        }
        spd._start = function () { if (!raf) raf = requestAnimationFrame(tick); };
      }
    });
    if (!('IntersectionObserver' in window)) {
      items.forEach(function (it) { it.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var it = en.target;
        it.classList.add('is-in');
        var spd = it.querySelector('[data-speed]');
        if (spd && spd._start) spd._start();
        io.unobserve(it);
      });
    }, { threshold: 0.4 });
    items.forEach(function (it) { io.observe(it); });
  });

})();
