/* AD Movie: shows the latest uploads of official YouTube channels (free and legal).
   data/feed.json is rebuilt every 2 hours by a GitHub Action (scripts/build-feed.mjs). */
(function () {
  "use strict";

  const CATS = {
    pk: "Pakistani dramas", tr: "Turkish dramas in Urdu", web: "Web series", cn: "Chinese dramas", kr: "Korean dramas", anime: "Anime",
    kids: "Little kids", toons: "Cartoons", movies: "Free full movies"
  };
  const KID_CATS = ["kids", "toons"];

  const $ = (s, el = document) => el.querySelector(s);
  const view = $("#view");
  const topbar = $(".topbar");
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  let kids = store.get("adm_kids", false);
  let tmdbKey = store.get("adm_tmdb", "");
  let renderToken = 0;
  let heroTimer = null;

  let FEED = null;          // { updated, channels: [...] }
  const CH = new Map();     // channel id -> channel
  let ALL = [], SHORTS = []; // flat lists of video items

  /* ---------- helpers ---------- */
  function el(tag, attrs, ...kids_) {
    const n = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids_.flat()) if (c != null && c !== false) n.append(c);
    return n;
  }
  function icon(d, fill) {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", d); if (fill) s.setAttribute("class", "fill");
    s.append(p); return s;
  }
  const PLAY = "M8 5.5v13l11-6.5z";
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 1800);
  }
  function ago(iso) {
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + " min ago";
    if (s < 86400) { const h = Math.round(s / 3600); return h + (h === 1 ? " hour ago" : " hours ago"); }
    const d = Math.round(s / 86400);
    if (d < 30) return d === 1 ? "Yesterday" : d + " days ago";
    const mo = Math.round(d / 30); return mo + (mo === 1 ? " month ago" : " months ago");
  }
  const isNew = (iso) => Date.now() - new Date(iso) < 36 * 3600 * 1000;
  function views(n) {
    if (!n) return "";
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M views";
    if (n >= 1e3) return Math.round(n / 1e3) + "K views";
    return n + " views";
  }
  function epTag(t) {
    const m = t.match(/\b(?:episode|ep\.?)\s*0*(\d{1,4})/i);
    if (/promo|teaser|trailer/i.test(t)) return "Promo";
    if (m) return "EP " + m[1];
    if (/full movie|full film/i.test(t)) return "Full movie";
    return "";
  }
  const isPromo = (t) => /promo|teaser|trailer|coming soon|#shorts/i.test(t);
  function thumbImg(id, chain, cls) {
    const img = el("img", { src: `https://i.ytimg.com/vi/${id}/${chain[0]}.jpg`, alt: "", loading: "lazy", class: cls });
    let i = 0;
    img.addEventListener("error", () => { if (++i < chain.length) img.src = `https://i.ytimg.com/vi/${id}/${chain[i]}.jpg`; });
    // YouTube serves a 120x90 grey placeholder instead of 404 for missing maxres images.
    img.addEventListener("load", () => { if (img.naturalWidth === 120 && ++i < chain.length) img.src = `https://i.ytimg.com/vi/${id}/${chain[i]}.jpg`; });
    return img;
  }
  const keyOf = (it) => `${it.type}:${it.media || ""}:${it.id}`;
  const allowedCh = (c) => !kids || KID_CATS.includes(c.cat);

  /* ---------- data ---------- */
  async function loadFeed() {
    const r = await fetch("data/feed.json", { cache: "no-cache" });
    FEED = await r.json();
    ALL = []; SHORTS = [];
    for (const c of FEED.channels) {
      CH.set(c.id, c);
      c.videos.forEach(v => ALL.push({ type: "yt", ...v, ch: c.id }));
      (c.shorts || []).forEach(v => SHORTS.push({ type: "yt", ...v, ch: c.id, short: true }));
    }
    const byDate = (a, b) => b.p.localeCompare(a.p);
    ALL.sort(byDate); SHORTS.sort(byDate);
  }
  function latest(cats, n = 20, perCh = 3, opts = {}) {
    const count = {}, out = [];
    for (const v of (opts.shorts ? SHORTS : ALL)) {
      const c = CH.get(v.ch);
      if (!c || !cats.includes(c.cat) || !allowedCh(c)) continue;
      if (opts.noPromo && isPromo(v.t)) continue;
      if ((count[v.ch] = (count[v.ch] || 0) + 1) > perCh) continue;
      out.push(v);
      if (out.length >= n) break;
    }
    return out;
  }
  function trending(cats, n = 16) {
    const week = Date.now() - 7 * 864e5, count = {};
    return ALL.filter(v => { const c = CH.get(v.ch); return cats.includes(c.cat) && allowedCh(c) && new Date(v.p) > week && !isPromo(v.t); })
      .sort((a, b) => b.v - a.v)
      .filter(v => (count[v.ch] = (count[v.ch] || 0) + 1) <= 2)
      .slice(0, n);
  }

  async function tmdb(path, params = {}) {
    const url = `https://api.themoviedb.org/3/${path}?` + new URLSearchParams({ api_key: tmdbKey, language: "en-US", include_adult: "false", ...params });
    const r = await fetch(url);
    if (!r.ok) throw new Error("tmdb " + r.status);
    return r.json();
  }
  function tmdbItems(results, media) {
    return (results || []).filter(x => x.poster_path && !x.adult).map(x => ({
      type: "tmdb", media: x.media_type || media, id: x.id, title: x.title || x.name,
      year: (x.release_date || x.first_air_date || "").slice(0, 4),
      desc: x.overview || "", img: `https://image.tmdb.org/t/p/w342${x.poster_path}`
    })).filter(x => x.media === "movie" || x.media === "tv");
  }

  /* ---------- cards ---------- */
  function videoCard(v, big) {
    const c = CH.get(v.ch) || {};
    const tag = epTag(v.t);
    return el("button", { class: "vcard" + (big ? " big" : ""), onclick: () => openPlayer(v) },
      el("span", { class: "vthumb" },
        thumbImg(v.id, ["hq720", "mqdefault"]),
        isNew(v.p) ? el("span", { class: "badge new", text: "New" }) : null,
        tag ? el("span", { class: "ep", text: tag }) : null,
        el("span", { class: "play" }, icon(PLAY))
      ),
      el("span", { class: "vinfo" },
        c.img ? el("img", { src: c.img, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }) : null,
        el("span", {},
          el("span", { class: "t", text: v.t }),
          el("span", { class: "s", text: [c.name, ago(v.p)].filter(Boolean).join(" · ") })
        )
      )
    );
  }
  function shortCard(v) {
    return el("button", { class: "scard", onclick: () => openPlayer(v) },
      el("span", { class: "sthumb" },
        thumbImg(v.id, ["oar2", "hqdefault"]),
        v.v ? el("span", { class: "sv", text: views(v.v) }) : null,
        el("span", { class: "st", text: v.t })
      )
    );
  }
  function chanBubble(c) {
    return el("a", { class: "chan", href: "#ch/" + c.id },
      el("span", { class: "ring" }, el("img", { src: c.img, alt: "", loading: "lazy", referrerpolicy: "no-referrer" })),
      el("span", { class: "t", text: c.name })
    );
  }
  function posterCard(it) {
    return el("button", { class: "card", onclick: () => openPlayer(it) },
      el("span", { class: "thumb" },
        el("img", { src: it.img, alt: "", loading: "lazy" }),
        el("span", { class: "tag", text: it.media === "tv" ? "Series" : "Trailer" })
      ),
      el("span", { class: "t", text: it.title }),
      it.year ? el("span", { class: "y", text: it.year }) : null
    );
  }
  function anyCard(it) {
    if (it.type === "tmdb") return posterCard(it);
    return it.short ? shortCard(it) : videoCard(it);
  }

  function row(title, opts, items) {
    const { sub, link, live, big } = opts || {};
    const rail = el("div", { class: "rail" });
    const sec = el("section", { class: "row" },
      el("div", { class: "row-head" },
        el("h3", {}, live ? el("span", { class: "live" }) : null, title),
        link ? el("a", { href: link, text: "See all ›" }) : sub ? el("small", { text: sub }) : null),
      rail);
    const fill = (list) => {
      rail.replaceChildren();
      if (!list || !list.length) { sec.remove(); return; }
      list.forEach(it => rail.append(it.cat && it.videos ? chanBubble(it) : (it.type === "yt" && !it.short ? videoCard(it, big) : anyCard(it))));
    };
    if (typeof items === "function") {
      for (let i = 0; i < 4; i++) rail.append(el("div", { class: "vcard skeleton" }, el("span", { class: "vthumb" })));
      const token = renderToken;
      Promise.resolve().then(items).then(l => { if (token === renderToken) fill(l); }).catch(() => { if (token === renderToken) sec.remove(); });
    } else fill(items);
    return sec;
  }
  const chanRow = (title, cats) => row(title, {}, FEED.channels.filter(c => cats.includes(c.cat) && allowedCh(c)));

  /* ---------- hero ---------- */
  function hero(cats) {
    const seen = new Set(), picks = [];
    for (const v of ALL) {
      const c = CH.get(v.ch);
      if (!cats.includes(c.cat) || !allowedCh(c) || seen.has(v.ch) || isPromo(v.t)) continue;
      seen.add(v.ch); picks.push(v);
      if (picks.length >= 6) break;
    }
    if (!picks.length) return null;
    const slides = picks.map((v, i) => {
      const c = CH.get(v.ch);
      return el("div", { class: "hero-slide" + (i === 0 ? " on" : "") },
        thumbImg(v.id, ["maxresdefault", "hq720", "hqdefault"]),
        el("div", { class: "hero-body" },
          el("div", { class: "hero-chan" },
            el("span", { class: "badge", text: isNew(v.p) ? "New episode" : "Latest" }),
            el("img", { src: c.img, alt: "", referrerpolicy: "no-referrer" }), c.name),
          el("h1", { text: v.t }),
          el("p", { class: "meta", text: [ago(v.p), views(v.v), c.lang].filter(Boolean).join("  ·  ") }),
          el("div", { class: "hero-cta" },
            el("button", { class: "pill grad", onclick: () => openPlayer(v) }, icon(PLAY, true), "Watch now"),
            el("button", { class: "pill ghost", onclick: () => toggleList(v) }, "+ My List"),
            el("a", { class: "pill ghost", href: "#ch/" + c.id, text: "Channel" })
          )
        )
      );
    });
    const dots = el("div", { class: "hero-dots" }, picks.map((_, i) => el("button", { "aria-label": "Slide " + (i + 1), class: i === 0 ? "on" : "", onclick: () => go(i) })));
    let cur = 0;
    function go(i) {
      slides[cur].classList.remove("on"); dots.children[cur].classList.remove("on");
      cur = (i + slides.length) % slides.length;
      slides[cur].classList.add("on"); dots.children[cur].classList.add("on");
      restart();
    }
    function restart() { clearInterval(heroTimer); heroTimer = setInterval(() => go(cur + 1), 6500); }
    restart();
    const sec = el("section", { class: "hero" }, slides, dots);
    let x0 = null;
    sec.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; }, { passive: true });
    sec.addEventListener("touchend", e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) go(cur + (dx < 0 ? 1 : -1)); x0 = null; });
    return sec;
  }

  function chips(list) {
    return el("div", { class: "chips" }, list.map(([t, h]) => el("a", { class: "chip", href: h, text: t })));
  }
  function recentRow() {
    const r = store.get("adm_recent", []).filter(isAllowedItem);
    return r.length ? row("Continue watching", {}, r) : null;
  }
  function isAllowedItem(it) {
    if (!kids) return true;
    const c = CH.get(it.ch);
    return it.type === "yt" && c && KID_CATS.includes(c.cat);
  }
  const updatedNote = () => el("p", { class: "updated", text: "Updated " + ago(FEED.updated) + " · new videos every 2 hours" });

  /* ---------- views ---------- */
  function viewHome() {
    if (kids) return viewKids(true);
    return [
      hero(["pk", "tr", "web", "cn", "kr", "anime", "movies"]),
      chips([["Pakistani", "#dramas"], ["Turkish", "#dramas"], ["Web series", "#dramas"], ["Chinese", "#dramas"], ["Korean", "#dramas"], ["Anime", "#dramas"], ["Kids", "#kids"], ["Cartoons", "#kids"], ["Movies", "#movies"], ["Shorts", "#shorts"]]),
      recentRow(),
      row("New today", { live: true, big: true }, latest(["pk", "tr", "web", "cn", "kr", "anime", "movies"], 16, 2)),
      row("Trending this week", { sub: "Most watched" }, trending(["pk", "tr", "web", "cn", "kr", "anime", "movies", "toons"])),
      row("Pakistani dramas", { link: "#dramas" }, latest(["pk"], 20, 6)),
      row("Shorts", { link: "#shorts" }, latest(["pk", "cn", "kr", "toons"], 16, 3, { shorts: true })),
      row("Turkish dramas in Urdu", { link: "#dramas" }, latest(["tr"], 20, 15, { noPromo: true })),
      row("Web series", { sub: "TVF, Girliyapa, Dice Media" }, latest(["web"], 20, 5)),
      row("Chinese dramas", { link: "#dramas" }, latest(["cn"], 20, 6)),
      row("Korean dramas", { link: "#dramas" }, latest(["kr"], 20, 6)),
      row("Anime", { sub: "Official · Muse Asia, Ani-One" }, latest(["anime"], 20, 10)),
      row("Free full movies", { link: "#movies" }, latest(["movies"], 20, 10)),
      row("Cartoons for everyone", { link: "#kids" }, latest(["toons"], 20, 4)),
      row("For little kids", { link: "#kids" }, latest(["kids"], 20, 3)),
      chanRow("All channels", Object.keys(CATS)),
      tmdbKey ? row("Trending worldwide", { sub: "Trailers" }, () => tmdb("trending/all/week").then(d => tmdbItems(d.results))) : null,
      updatedNote()
    ];
  }
  function viewDramas() {
    return [
      el("h1", { class: "page-title", text: "Dramas" }),
      el("p", { class: "page-sub", text: "The newest episodes from official channels, updated every 2 hours." }),
      ...["pk", "tr", "web", "cn", "kr", "anime"].flatMap(cat => [
        row(CATS[cat], { live: true }, latest([cat], 24, 8, { noPromo: true })),
        chanRow("Channels", [cat])
      ]),
      row("Drama shorts", { link: "#shorts" }, latest(["pk", "cn", "kr"], 16, 3, { shorts: true })),
      tmdbKey ? row("Popular K-dramas", { sub: "Trailers" }, () => tmdb("discover/tv", { with_original_language: "ko", sort_by: "popularity.desc", with_genres: "18" }).then(d => tmdbItems(d.results, "tv"))) : null,
      updatedNote()
    ];
  }
  function viewKids(asHome) {
    const kidChans = FEED.channels.filter(c => KID_CATS.includes(c.cat));
    return [
      asHome ? hero(KID_CATS) : null,
      el("h1", { class: "page-title", text: "Kids corner" }),
      el("p", { class: "page-sub", text: "Cartoons, rhymes and learning videos. Only official kids channels." }),
      asHome ? recentRow() : null,
      chanRow("Kids channels", KID_CATS),
      row("New cartoons", { live: true, big: true }, latest(["toons"], 16, 3)),
      row("For little kids", {}, latest(["kids"], 20, 3)),
      row("Kids shorts", {}, latest(KID_CATS, 16, 2, { shorts: true })),
      ...kidChans.map(c => row(c.name, { link: "#ch/" + c.id }, c.videos.map(v => ({ type: "yt", ...v, ch: c.id })))),
      updatedNote()
    ];
  }
  function viewMovies() {
    const mv = FEED.channels.filter(c => c.cat === "movies");
    return [
      el("h1", { class: "page-title", text: "Movies" }),
      el("p", { class: "page-sub", text: "Free full movies uploaded by official studios and distributors." }),
      ...mv.map(c => row(c.name, { link: "#ch/" + c.id, big: true }, c.videos.map(v => ({ type: "yt", ...v, ch: c.id })))),
      tmdbKey ? row("Coming soon", { sub: "Trailers" }, () => tmdb("movie/upcoming").then(d => tmdbItems(d.results, "movie"))) : null,
      tmdbKey ? row("Now in cinemas", { sub: "Trailers" }, () => tmdb("movie/now_playing").then(d => tmdbItems(d.results, "movie"))) : null,
      tmdbKey ? null : el("div", { class: "unlock" },
        el("h3", { text: "New Hollywood and Bollywood trailers" }),
        el("p", { text: "Add a free TMDB key in Settings to see new releases and official trailers." }),
        el("button", { class: "pill sm", onclick: openSettings, text: "Add key" })),
      updatedNote()
    ];
  }
  function viewShorts() {
    const list = SHORTS.filter(v => allowedCh(CH.get(v.ch)));
    return [el("h1", { class: "page-title", text: "Shorts" }), el("p", { class: "page-sub", text: "Quick clips from every channel, newest first." }),
      el("div", { class: "sgrid" }, list.slice(0, 120).map(shortCard))];
  }
  function viewWorld() {
    const head = [el("h1", { class: "page-title", text: "World cinema" }), el("p", { class: "page-sub", text: "New movies and series from around the world, with official trailers and where to watch." })];
    if (!tmdbKey) {
      return [...head, el("div", { class: "unlock" },
        el("h3", { text: "Unlock World cinema" }),
        el("p", { text: "Add a free TMDB key once to see new releases, Bollywood, anime and more with official trailers." }),
        el("ol", {}, el("li", { text: "Create a free account at themoviedb.org" }), el("li", { text: "Open Settings → API and request a free key" }), el("li", { text: "Paste it in AD Movie settings" })),
        el("button", { class: "pill sm", onclick: openSettings, text: "Add key" })
      )];
    }
    return [...head,
      row("Trending this week", {}, () => tmdb("trending/movie/week").then(d => tmdbItems(d.results, "movie"))),
      row("Coming soon", {}, () => tmdb("movie/upcoming").then(d => tmdbItems(d.results, "movie"))),
      row("Bollywood", {}, () => tmdb("discover/movie", { with_original_language: "hi", sort_by: "popularity.desc" }).then(d => tmdbItems(d.results, "movie"))),
      row("Popular web series worldwide", { sub: "Netflix, Prime and more · trailers" }, () => tmdb("trending/tv/week").then(d => tmdbItems(d.results, "tv"))),
      row("K-dramas", {}, () => tmdb("discover/tv", { with_original_language: "ko", sort_by: "popularity.desc", with_genres: "18" }).then(d => tmdbItems(d.results, "tv"))),
      row("Anime", {}, () => tmdb("discover/tv", { with_original_language: "ja", with_genres: "16", sort_by: "popularity.desc" }).then(d => tmdbItems(d.results, "tv")))
    ];
  }
  function viewList() {
    const list = store.get("adm_list", []).filter(isAllowedItem);
    if (!list.length) return [el("h1", { class: "page-title", text: "My List" }),
      el("div", { class: "empty" }, el("b", { text: "Your list is empty" }), "Tap “+ My List” on any episode, cartoon or movie to save it here.")];
    return [el("h1", { class: "page-title", text: "My List" }), el("div", { class: "grid" }, list.map(anyCard))];
  }
  function viewChannel(id) {
    const c = CH.get(id);
    if (!c || !allowedCh(c)) return viewHome();
    const vids = c.videos.map(v => ({ type: "yt", ...v, ch: c.id }));
    return [
      el("div", { class: "chan-head" },
        el("img", { src: c.img, alt: "", referrerpolicy: "no-referrer" }),
        el("div", {},
          el("h1", { text: c.name }),
          el("p", { text: `${CATS[c.cat]} · ${c.lang}` }),
          el("div", { class: "cta" },
            vids[0] ? el("button", { class: "pill sm grad", onclick: () => openPlayer(vids[0]) }, icon(PLAY, true), "Play latest") : null,
            el("a", { class: "pill sm ghost", href: `https://www.youtube.com/channel/${c.id}/videos`, target: "_blank", rel: "noopener", text: "All episodes" })))),
      (c.shorts || []).length ? row("Shorts", {}, c.shorts.map(v => ({ type: "yt", ...v, ch: c.id, short: true }))) : null,
      el("section", { class: "row" }, el("div", { class: "row-head" }, el("h3", { text: "Latest videos" })), el("div", { class: "grid" }, vids.map(v => videoCard(v))))
    ];
  }

  // Search: every word must match somewhere (title, channel, language or category), in any order.
  const ALIAS = {
    kdrama: "korean", "k-drama": "korean", cdrama: "chinese", "c-drama": "chinese", pakistani: "pk urdu",
    cartoon: "cartoon", toon: "cartoon", kids: "kids", bachon: "kids", turkish: "turkish", ertugrul: "turkish",
    movie: "movie", film: "movie", webseries: "web series", drama: "drama", anime: "anime"
  };
  const norm = (s) => (s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  function chanText(c) { return norm(`${c.name} ${c.lang} ${CATS[c.cat]} ${c.cat}`); }
  function matchScore(words, title, extra) {
    let score = 0;
    for (const w of words) {
      const alts = [w, ...(ALIAS[w] ? ALIAS[w].split(" ") : [])];
      if (alts.some(a => title.includes(a))) score += 3;
      else if (alts.some(a => extra.includes(a))) score += 1;
      else return 0;
    }
    return score;
  }
  function viewSearch(term) {
    const token = ++renderToken;
    const words = norm(term).split(" ").filter(Boolean);
    if (!words.length) return route();
    const chans = FEED.channels.filter(c => allowedCh(c) && matchScore(words, norm(c.name), chanText(c)) > 0);
    const hit = (v) => { const c = CH.get(v.ch); return allowedCh(c) ? matchScore(words, norm(v.t), chanText(c)) : 0; };
    const rank = (list) => list.map(v => [hit(v), v]).filter(x => x[0] > 0).sort((a, b) => b[0] - a[0] || b[1].p.localeCompare(a[1].p)).map(x => x[1]);
    const vids = rank(ALL).slice(0, 60);
    const shorts = rank(SHORTS).slice(0, 20);
    const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(term)}`;
    view.replaceChildren(...[
      el("h1", { class: "page-title", text: `Results for “${term}”` }),
      el("p", { class: "page-sub", text: vids.length || chans.length ? `${vids.length} videos found in the latest uploads.` : "Not in the latest uploads." }),
      chans.length ? row("Channels", {}, chans) : null,
      vids.length ? el("div", { class: "grid" }, vids.map(v => videoCard(v))) : null,
      shorts.length ? row("Shorts", {}, shorts) : null,
      kids ? null : el("div", { class: "unlock" },
        el("h3", { text: "Can't find it?" }),
        el("p", { text: "This app shows the newest episodes from each channel. To search older episodes, search on YouTube." }),
        el("a", { class: "pill sm grad", href: ytUrl, target: "_blank", rel: "noopener", text: `Search “${term}” on YouTube` }))
    ].filter(Boolean));
    if (kids && !vids.length && !chans.length) view.append(el("div", { class: "empty" }, el("b", { text: "Nothing found" }), "Try “Peppa”, “Bluey” or “Tom and Jerry”."));
    if (tmdbKey && !kids) {
      tmdb("search/multi", { query: term }).then(d => {
        if (token !== renderToken) return;
        const l = tmdbItems(d.results);
        if (l.length) view.append(row("Movies and series (trailers)", {}, l));
      }).catch(() => {});
    }
  }

  const ROUTES = { home: viewHome, dramas: viewDramas, kids: () => viewKids(false), movies: viewMovies, shorts: viewShorts, world: viewWorld, mylist: viewList };
  const KID_ROUTES = ["home", "kids", "shorts", "mylist", "ch"];
  let currentTab = "home";
  function route() {
    if (!FEED) return;
    let [tab, arg] = (location.hash || "#home").slice(1).split("/");
    if (tab === "search" && arg) { const q = decodeURIComponent(arg); input.value = q; bar.hidden = false; viewSearch(q); onScroll(); return; }
    if (!ROUTES[tab] && tab !== "ch") tab = "home";
    if (kids && !KID_ROUTES.includes(tab)) tab = "kids";
    currentTab = tab;
    renderToken++; clearInterval(heroTimer);
    const nodes = tab === "ch" ? viewChannel(arg) : ROUTES[tab]();
    view.replaceChildren(...nodes.filter(Boolean));
    document.querySelectorAll("[data-tab]").forEach(a => {
      a.classList.toggle("active", a.dataset.tab === tab);
      a.hidden = kids && !KID_ROUTES.includes(a.dataset.tab);
    });
    window.scrollTo(0, 0); onScroll();
  }
  function onScroll() { topbar.classList.toggle("solid", window.scrollY > 30 || !view.firstElementChild?.classList.contains("hero")); }
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------- player ---------- */
  const P = { root: $("#player"), frame: $("#playerFrame"), title: $("#playerTitle"), sub: $("#playerSub"), list: $("#listBtn"), chan: $("#chanBtn"), ext: $("#openExternal"), note: $("#playerNote"), desc: $("#playerDesc"), up: $("#upNext"), upList: $("#upList") };
  let current = null;

  function openPlayer(it) {
    current = it;
    P.desc.textContent = ""; P.note.textContent = ""; P.up.hidden = true;
    P.root.classList.toggle("vertical", !!it.short);
    if (it.type === "yt") {
      const c = CH.get(it.ch) || {};
      P.title.textContent = it.t;
      P.sub.textContent = [c.name, ago(it.p), views(it.v)].filter(Boolean).join(" · ");
      P.frame.src = `https://www.youtube-nocookie.com/embed/${it.id}?autoplay=1&rel=0&playsinline=1&modestbranding=1`;
      P.ext.href = `https://www.youtube.com/watch?v=${it.id}`;
      P.ext.hidden = false; P.chan.hidden = !c.id;
      P.desc.textContent = it.d || "";
      P.note.textContent = "If the video says “Watch on YouTube”, the channel only allows it on YouTube. Tap “Open in YouTube”.";
      const pool = it.short ? (c.shorts || []).map(v => ({ ...v, short: true })) : c.videos || [];
      const next = pool.filter(v => v.id !== it.id).slice(0, 10).map(v => ({ type: "yt", ...v, ch: c.id }));
      if (next.length) {
        P.upList.replaceChildren(...next.map(v => el("button", { class: "upitem", onclick: () => { openPlayer(v); P.root.scrollTo(0, 0); } },
          el("span", { class: "vthumb" }, thumbImg(v.id, ["mqdefault", "hqdefault"])),
          el("span", {}, el("span", { class: "t", text: v.t }), el("span", { class: "s", text: ago(v.p) })))));
        P.up.hidden = false;
      }
      addRecent(it);
    } else if (it.type === "tmdb") {
      P.title.textContent = it.title;
      P.sub.textContent = [it.year, it.media === "tv" ? "Series" : "Movie", "Official trailer"].filter(Boolean).join(" · ");
      P.frame.src = "about:blank";
      P.desc.textContent = it.desc || "";
      P.ext.href = `https://www.themoviedb.org/${it.media}/${it.id}`; P.ext.hidden = false; P.chan.hidden = true;
      loadTrailer(it);
    }
    updateListBtn();
    if (P.root.hidden) { P.root.hidden = false; document.body.style.overflow = "hidden"; history.pushState({ player: true }, ""); }
  }
  async function loadTrailer(it) {
    try {
      const [v, w] = await Promise.all([tmdb(`${it.media}/${it.id}/videos`), tmdb(`${it.media}/${it.id}/watch/providers`).catch(() => ({}))]);
      if (current !== it) return;
      const vids = (v.results || []).filter(x => x.site === "YouTube");
      const pick = vids.find(x => x.type === "Trailer" && x.official) || vids.find(x => x.type === "Trailer") || vids[0];
      if (pick) P.frame.src = `https://www.youtube-nocookie.com/embed/${pick.key}?rel=0&autoplay=1&playsinline=1`;
      const reg = w.results?.PK || w.results?.US;
      const prov = [...(reg?.flatrate || []), ...(reg?.free || []), ...(reg?.ads || [])].map(p => p.provider_name);
      P.note.textContent = (pick ? "" : "No trailer yet. ") + (prov.length ? `Watch the full ${it.media === "tv" ? "series" : "movie"} on: ${[...new Set(prov)].join(", ")}.` : "The full movie is in cinemas or on official streaming services.");
    } catch (e) { P.note.textContent = "Could not load the trailer. Check your TMDB key in Settings."; }
  }
  function closePlayer(fromPop) {
    if (P.root.hidden) return;
    P.root.hidden = true; P.frame.src = "about:blank"; document.body.style.overflow = ""; current = null;
    if (!fromPop && history.state && history.state.player) history.back();
  }
  function slim(it) {
    if (it.type === "yt") { const { type, id, t, p, v, ch, short } = it; return { type, id, t, p, v, ch, short }; }
    const { type, id, media, title, year, img, desc } = it; return { type, id, media, title, year, img, desc: (desc || "").slice(0, 300) };
  }
  function addRecent(it) {
    const r = store.get("adm_recent", []).filter(x => keyOf(x) !== keyOf(it));
    r.unshift(slim(it)); store.set("adm_recent", r.slice(0, 16));
  }
  const inList = (it) => store.get("adm_list", []).some(x => keyOf(x) === keyOf(it));
  function toggleList(it) {
    let l = store.get("adm_list", []);
    if (inList(it)) { l = l.filter(x => keyOf(x) !== keyOf(it)); toast("Removed from My List"); }
    else { l.unshift(slim(it)); toast("Added to My List"); }
    store.set("adm_list", l);
    if (current) updateListBtn();
    if (currentTab === "mylist" && P.root.hidden) route();
  }
  function updateListBtn() { P.list.textContent = current && inList(current) ? "✓ In My List" : "+ My List"; }

  P.list.addEventListener("click", () => { if (current) toggleList(current); });
  P.chan.addEventListener("click", () => { const id = current && current.ch; closePlayer(); if (id) setTimeout(() => { location.hash = "ch/" + id; }, 60); });
  $("#playerClose").addEventListener("click", () => closePlayer());
  window.addEventListener("popstate", () => { if (!P.root.hidden) closePlayer(true); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closePlayer(); closeSettings(); } });

  /* ---------- search ---------- */
  const bar = $("#searchBar"), input = $("#searchInput");
  let searchTimer;
  $("#searchBtn").addEventListener("click", () => { bar.hidden = false; topbar.classList.add("solid"); input.focus(); });
  $("#searchClose").addEventListener("click", () => { bar.hidden = true; input.value = ""; route(); });
  input.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const v = input.value.trim();
    searchTimer = setTimeout(() => { if (!FEED) return; v.length >= 2 ? viewSearch(v) : route(); }, 250);
  });
  // Mobile keyboards: "Go"/Enter runs the search right away and hides the keyboard.
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault(); clearTimeout(searchTimer);
    const v = input.value.trim();
    if (FEED && v) viewSearch(v);
    input.blur();
  });

  /* ---------- settings ---------- */
  const S = $("#settings");
  function openSettings() { $("#kidsMode").checked = kids; $("#tmdbKey").value = tmdbKey; S.hidden = false; }
  function closeSettings() { S.hidden = true; }
  $("#settingsBtn").addEventListener("click", openSettings);
  $("#settingsCancel").addEventListener("click", closeSettings);
  S.addEventListener("click", (e) => { if (e.target === S) closeSettings(); });
  $("#settingsSave").addEventListener("click", () => {
    kids = $("#kidsMode").checked; tmdbKey = $("#tmdbKey").value.trim();
    store.set("adm_kids", kids); store.set("adm_tmdb", tmdbKey);
    closeSettings(); toast("Settings saved"); route();
  });

  window.addEventListener("hashchange", () => { if (!location.hash.startsWith("#search/")) bar.hidden = true; route(); });

  view.replaceChildren(el("div", { class: "rail", style: "padding-top:90px" }, [0, 1, 2].map(() => el("div", { class: "vcard skeleton" }, el("span", { class: "vthumb" })))));
  loadFeed().then(route).catch(() => {
    view.replaceChildren(el("div", { class: "empty", style: "margin-top:90px" }, el("b", { text: "No internet connection" }), "Connect to the internet and open AD Movie again."));
  });

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
