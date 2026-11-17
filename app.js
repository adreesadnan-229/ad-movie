/* AD Movie: plays official, free YouTube uploads (dramas, cartoons, full movies).
   data/feed.json   newest uploads, rebuilt every 2 hours (scripts/build-feed.mjs)
   data/shows.json  full episode lists of dramas and series (scripts/build-shows.mjs)
   data/movies.json full movies from official movie channels */
(function () {
  "use strict";

  const CATS = {
    pk: "Pakistani dramas", tr: "Turkish dramas in Urdu", web: "Web series", cn: "Chinese dramas", kr: "Korean dramas", anime: "Anime",
    kids: "Little kids", toons: "Cartoons", movies: "Free full movies",
    shows: "TV & game shows", cooking: "Cooking", vlogs: "Vlogs"
  };
  const SHOW_CATS = ["shows", "cooking", "vlogs"];
  const DRAMA_CATS = ["pk", "tr", "web", "cn", "kr", "anime"];
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

  let FEED = null;                 // newest uploads per channel
  const CH = new Map();            // channel id -> channel
  let ALL = [], SHORTS = [];       // newest videos and shorts, newest first
  let SHOWS = [];                  // [{ id, t, ch, cat, n, v, last }]
  const SHOW = new Map();          // show id -> show
  let MOVIES = null;               // full movie list (loaded on demand)
  const showFiles = new Map();     // channel id -> Promise<{ playlistId: [[id, title, date]] }>

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
  const SHARE = "M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13";
  const LIST = "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01";
  const NEXT = "M6 5.5v13l9-6.5zM18 5v14";
  const PREV = "M18 5.5v13l-9-6.5zM6 5v14";
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 1900);
  }
  function ago(iso) {
    if (!iso) return "";
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + " min ago";
    if (s < 86400) { const h = Math.round(s / 3600); return h + (h === 1 ? " hour ago" : " hours ago"); }
    const d = Math.round(s / 86400);
    if (d < 30) return d === 1 ? "Yesterday" : d + " days ago";
    if (d < 365) { const mo = Math.round(d / 30); return mo + (mo === 1 ? " month ago" : " months ago"); }
    const y = Math.round(d / 365); return y + (y === 1 ? " year ago" : " years ago");
  }
  const isNew = (iso) => iso && Date.now() - new Date(iso) < 36 * 3600 * 1000;
  function views(n) {
    if (!n) return "";
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M views";
    if (n >= 1e3) return Math.round(n / 1e3) + "K views";
    return n + " views";
  }
  function epNum(t) {
    const m = t.match(/\b(?:episode|ep\.?)\s*0*(\d{1,4})/i) || t.match(/第\s*(\d+)\s*集/) || t.match(/(\d+)\s*회/) || t.match(/قسط\s*(\d+)/);
    return m ? +m[1] : null;
  }
  function epTag(t) {
    if (/promo|teaser|trailer/i.test(t)) return "Promo";
    const n = epNum(t);
    if (n) return "EP " + n;
    if (/full movie|full film/i.test(t)) return "Full movie";
    return "";
  }
  const isPromo = (t) => /promo|teaser|trailer|coming soon|#shorts/i.test(t);
  const EXTRA = /promo|teaser|trailer|#shorts|highlight|recap|best scene|best moment|behind the scene|bts|ost/i;
  function thumbImg(id, chain, cls) {
    const img = el("img", { src: `https://i.ytimg.com/vi/${id}/${chain[0]}.jpg`, alt: "", loading: "lazy", decoding: "async", class: cls });
    let i = 0;
    const nextSrc = () => { if (++i < chain.length) img.src = `https://i.ytimg.com/vi/${id}/${chain[i]}.jpg`; };
    img.addEventListener("error", nextSrc);
    // YouTube returns a 120x90 grey placeholder instead of 404 for missing big thumbnails.
    img.addEventListener("load", () => { if (img.naturalWidth === 120) nextSrc(); });
    return img;
  }
  const keyOf = (it) => `${it.type}:${it.media || ""}:${it.id}`;
  const allowedCh = (c) => !!c && (!kids || KID_CATS.includes(c.cat));
  const allowedShow = (s) => !!s && allowedCh(CH.get(s.ch));
  const appUrl = (hash) => location.origin + location.pathname + "#" + hash;
  const norm = (s) => (s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

  /* ---------- watched progress ---------- */
  const watched = new Set(store.get("adm_watched", []));
  const progress = store.get("adm_progress", {});        // show id -> last episode video id
  function markWatched(v) {
    if (watched.has(v.id)) watched.delete(v.id);
    watched.add(v.id);
    store.set("adm_watched", [...watched].slice(-3000));
    if (v.s) { progress[v.s] = v.id; store.set("adm_progress", progress); }
  }

  /* ---------- data ---------- */
  async function getJSON(url) {
    const r = await fetch(url, { cache: "no-cache" });
    if (!r.ok) throw new Error(url + " " + r.status);
    return r.json();
  }
  async function loadData() {
    const [feed, shows] = await Promise.all([getJSON("data/feed.json"), getJSON("data/shows.json").catch(() => ({ shows: [] }))]);
    FEED = feed;
    SHOWS = shows.shows || [];
    SHOWS.forEach(s => SHOW.set(s.id, s));
    ALL = []; SHORTS = [];
    for (const c of FEED.channels) {
      CH.set(c.id, c);
      c.videos.forEach(v => ALL.push({ type: "yt", ...v, ch: c.id }));
      (c.shorts || []).forEach(v => SHORTS.push({ type: "yt", ...v, ch: c.id, short: true }));
    }
    const byDate = (a, b) => b.p.localeCompare(a.p);
    ALL.sort(byDate); SHORTS.sort(byDate);
    // Videos uploaded after the episode lists were built: match them to a show by name.
    const byCh = new Map();
    SHOWS.forEach(s => { if (!byCh.has(s.ch)) byCh.set(s.ch, []); byCh.get(s.ch).push(s); });
    for (const v of ALL) {
      if (v.s || isPromo(v.t) || !epNum(v.t)) continue;
      const nt = norm(v.t);
      const hit = (byCh.get(v.ch) || []).find(s => { const k = norm(s.t); return k.length >= 4 && nt.includes(k); });
      if (hit) v.s = hit.id;
    }
    // Keep each show's "last updated" in step with the newest upload.
    for (const v of ALL) { const s = v.s && SHOW.get(v.s); if (s && v.p > s.last) s.last = v.p; }
    SHOWS.sort((a, b) => b.last.localeCompare(a.last));
  }
  async function loadMovies() {
    if (MOVIES) return MOVIES;
    try { MOVIES = ((await getJSON("data/movies.json")).movies || []).map(m => ({ type: "yt", ...m, movie: true })); }
    catch (e) { MOVIES = ALL.filter(v => CH.get(v.ch)?.cat === "movies"); }
    return MOVIES;
  }
  async function episodesOf(showId) {
    const s = SHOW.get(showId);
    if (!s) return [];
    if (!showFiles.has(s.ch)) showFiles.set(s.ch, getJSON(`data/shows/${s.ch}.json`).catch(() => { showFiles.delete(s.ch); return {}; }));
    const file = await showFiles.get(s.ch);
    const eps = (file[showId] || []).filter(([, t]) => !EXTRA.test(t)).map(([id, t, p]) => ({ type: "yt", id, t, p, ch: s.ch, s: showId }));
    // Add brand-new episodes that are in the 2-hourly feed but not yet in the list.
    const have = new Set(eps.map(e => e.id));
    const fresh = ALL.filter(v => v.s === showId && !have.has(v.id) && !EXTRA.test(v.t));
    if (fresh.length) {
      eps.push(...fresh.map(v => ({ ...v })));
      const numbered = eps.filter(e => epNum(e.t) != null).length > eps.length * 0.6;
      eps.sort((a, b) => numbered ? (epNum(a.t) ?? 1e9) - (epNum(b.t) ?? 1e9) || a.p.localeCompare(b.p) : a.p.localeCompare(b.p));
    }
    eps.forEach((e, i) => { e.n = epNum(e.t) || i + 1; });
    return eps;
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
  const showsIn = (cats, n = 40) => SHOWS.filter(s => cats.includes(s.cat) && allowedShow(s)).slice(0, n);

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
    const show = v.s && SHOW.get(v.s);
    return el("button", { class: "vcard" + (big ? " big" : ""), onclick: () => openPlayer(v) },
      el("span", { class: "vthumb" },
        thumbImg(v.id, ["hq720", "mqdefault", "hqdefault"]),
        isNew(v.p) ? el("span", { class: "badge new", text: "New" }) : null,
        tag ? el("span", { class: "ep", text: tag }) : null,
        watched.has(v.id) ? el("span", { class: "seen", text: "✓ Watched" }) : null,
        el("span", { class: "play" }, icon(PLAY))
      ),
      el("span", { class: "vinfo" },
        c.img ? el("img", { src: c.img, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }) : null,
        el("span", {},
          el("span", { class: "t", text: v.t }),
          el("span", { class: "s", text: [show ? show.t : c.name, ago(v.p)].filter(Boolean).join(" · ") })
        )
      )
    );
  }
  function showCard(s) {
    const c = CH.get(s.ch) || {};
    const last = progress[s.id];
    return el("a", { class: "shcard", href: "#show/" + s.id },
      el("span", { class: "shthumb" },
        thumbImg(s.v, ["hq720", "mqdefault", "hqdefault"]),
        el("span", { class: "shcount", text: `${s.n} episodes` }),
        isNew(s.last) ? el("span", { class: "badge new", text: "New episode" }) : null,
        el("span", { class: "shtitle", text: s.t }),
        last ? el("span", { class: "shbar" }) : null
      ),
      el("span", { class: "shmeta" },
        c.img ? el("img", { src: c.img, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }) : null,
        el("span", { text: [c.name, s.last ? "Updated " + ago(s.last) : ""].filter(Boolean).join(" · ") }))
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
  function anyCard(it, big) {
    if (it.type === "show") { const s = SHOW.get(it.id); return s ? showCard(s) : null; }
    if (it.type === "tmdb") return posterCard(it);
    if (it.cat && it.videos) return chanBubble(it);
    if (it.t && it.n && it.cat && it.v) return showCard(it);
    return it.short ? shortCard(it) : videoCard(it, big);
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
      const cards = (list || []).map(it => anyCard(it, big)).filter(Boolean);
      if (!cards.length) { sec.remove(); return; }
      rail.append(...cards);
    };
    if (typeof items === "function") {
      for (let i = 0; i < 4; i++) rail.append(el("div", { class: "vcard skeleton" }, el("span", { class: "vthumb" })));
      const token = renderToken;
      Promise.resolve().then(items).then(l => { if (token === renderToken) fill(l); }).catch(() => { if (token === renderToken) sec.remove(); });
    } else fill(items);
    return sec;
  }
  const chanRow = (title, cats) => row(title, {}, FEED.channels.filter(c => cats.includes(c.cat) && allowedCh(c)));

  /* ---------- hero carousel ---------- */
  function hero(cats) {
    const seen = new Set(), picks = [];
    for (const v of ALL) {
      const c = CH.get(v.ch);
      if (!cats.includes(c.cat) || !allowedCh(c) || seen.has(v.s || v.ch) || isPromo(v.t)) continue;
      if (picks.filter(p => p.ch === v.ch).length >= 2) continue;
      seen.add(v.s || v.ch); picks.push(v);
      if (picks.length >= 6) break;
    }
    if (!picks.length) return null;
    const slides = picks.map((v, i) => {
      const c = CH.get(v.ch);
      const show = v.s && SHOW.get(v.s);
      return el("div", { class: "hero-slide" + (i === 0 ? " on" : "") },
        thumbImg(v.id, ["maxresdefault", "hq720", "hqdefault"]),
        el("div", { class: "hero-body" },
          el("div", { class: "hero-chan" },
            el("span", { class: "badge", text: isNew(v.p) ? (show ? "New episode" : "New") : "Latest" }),
            el("img", { src: c.img, alt: "", referrerpolicy: "no-referrer" }), c.name),
          el("h1", { text: show ? show.t : v.t }),
          el("p", { class: "meta", text: [show ? epTag(v.t) : "", ago(v.p), views(v.v), show ? `${show.n} episodes` : c.lang].filter(Boolean).join("  ·  ") }),
          el("div", { class: "hero-cta" },
            el("button", { class: "pill grad", onclick: () => openPlayer(v) }, icon(PLAY, true), "Watch now"),
            show ? el("a", { class: "pill ghost", href: "#show/" + show.id }, icon(LIST), "All episodes")
              : el("button", { class: "pill ghost", onclick: () => toggleList(v) }, "+ My List")
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
    const seen = new Set(), out = [];
    for (const it of store.get("adm_recent", [])) {
      if (!isAllowedItem(it)) continue;
      if (it.s && SHOW.has(it.s)) { if (!seen.has(it.s)) { seen.add(it.s); out.push(SHOW.get(it.s)); } }
      else out.push(it);
    }
    return out.length ? row("Continue watching", {}, out.slice(0, 16)) : null;
  }
  function isAllowedItem(it) {
    if (it.type === "show") return allowedShow(SHOW.get(it.id));
    if (!kids) return true;
    return it.type === "yt" && allowedCh(CH.get(it.ch));
  }
  const updatedNote = () => el("p", { class: "updated", text: "Updated " + ago(FEED.updated) + " · new episodes every 2 hours" });
  const pageHead = (title, sub) => [el("h1", { class: "page-title", text: title }), sub ? el("p", { class: "page-sub", text: sub }) : null];

  /* ---------- views ---------- */
  function viewHome() {
    if (kids) return viewKids(true);
    return [
      hero(["pk", "tr", "web", "cn", "kr", "anime"]),
      chips([["Pakistani", "#cat/pk"], ["Turkish", "#cat/tr"], ["Web series", "#cat/web"], ["Chinese", "#cat/cn"], ["Korean", "#cat/kr"], ["Anime", "#cat/anime"], ["Cartoons", "#cat/toons"], ["Kids", "#kids"], ["Movies", "#movies"], ["Shorts", "#shorts"]]),
      recentRow(),
      row("New episodes today", { live: true, big: true }, latest(DRAMA_CATS, 16, 2, { noPromo: true })),
      row("Pakistani dramas", { link: "#cat/pk" }, showsIn(["pk"], 20)),
      row("Trending this week", { sub: "Most watched" }, trending([...DRAMA_CATS, "movies", "toons"])),
      row("Turkish dramas in Urdu", { link: "#cat/tr" }, showsIn(["tr"], 20)),
      row("Free full movies", { link: "#movies" }, latest(["movies"], 20, 10)),
      row("TV & game shows", { link: "#shows" }, latest(["shows"], 20, 2, { noPromo: true })),
      row("Cooking", { link: "#cat/cooking" }, latest(["cooking"], 20, 3)),
      row("Vlogs", { link: "#cat/vlogs" }, latest(["vlogs"], 20, 3)),
      row("Chinese dramas", { link: "#cat/cn" }, showsIn(["cn"], 20)),
      row("Korean dramas", { link: "#cat/kr" }, showsIn(["kr"], 20)),
      row("Web series", { link: "#cat/web" }, showsIn(["web"], 20)),
      row("Shorts", { link: "#shorts" }, latest(["pk", "tr", "cn", "kr", "toons"], 16, 3, { shorts: true })),
      row("Anime", { link: "#cat/anime" }, showsIn(["anime"], 20)),
      row("Cartoons for everyone", { link: "#cat/toons" }, showsIn(["toons"], 20)),
      row("For little kids", { link: "#kids" }, showsIn(["kids"], 20)),
      chanRow("All channels", Object.keys(CATS)),
      tmdbKey ? row("Trending worldwide", { sub: "Trailers" }, () => tmdb("trending/all/week").then(d => tmdbItems(d.results))) : null,
      updatedNote()
    ];
  }
  function viewDramas() {
    return [
      ...pageHead("Dramas", "Every drama with its full episode list. New episodes are added every 2 hours."),
      chips(DRAMA_CATS.map(c => [CATS[c].replace(/ dramas?| in Urdu/g, ""), "#cat/" + c])),
      ...DRAMA_CATS.flatMap(cat => [
        row(CATS[cat], { link: "#cat/" + cat }, showsIn([cat], 20)),
        row("Latest " + CATS[cat].toLowerCase().replace(/^(\w+) (dramas)/, "$1 episodes"), { live: true }, latest([cat], 20, 6, { noPromo: true }))
      ]),
      row("Drama shorts", { link: "#shorts" }, latest(["pk", "tr", "cn", "kr"], 16, 3, { shorts: true })),
      updatedNote()
    ];
  }
  function viewCategory(cat) {
    if (!CATS[cat] || (kids && !KID_CATS.includes(cat))) return viewHome();
    if (cat === "movies") { location.replace("#movies"); return []; }
    const list = showsIn([cat], 500);
    return [
      ...pageHead(CATS[cat], `${list.length} series · newest first`),
      list.length ? el("div", { class: "shgrid" }, list.map(showCard)) : null,
      row("Latest episodes", { live: true }, latest([cat], 24, 8, { noPromo: true })),
      chanRow("Channels", [cat])
    ];
  }
  function viewKids(asHome) {
    return [
      asHome ? hero(KID_CATS) : null,
      ...pageHead("Kids corner", "Cartoons, rhymes and learning videos. Only official kids channels."),
      asHome ? recentRow() : null,
      chanRow("Kids channels", KID_CATS),
      row("New cartoons", { live: true, big: true }, latest(["toons"], 16, 3)),
      row("Cartoon series", { link: "#cat/toons" }, showsIn(["toons"], 24)),
      row("Little kids series", { link: "#cat/kids" }, showsIn(["kids"], 24)),
      row("For little kids", {}, latest(["kids"], 20, 3)),
      row("Kids shorts", {}, latest(KID_CATS, 16, 2, { shorts: true })),
      updatedNote()
    ];
  }
  function viewMovies() {
    const token = renderToken;
    const grid = el("div", { class: "grid" });
    const more = el("button", { class: "pill ghost more", text: "Load more movies" });
    const filterBox = el("div", { class: "seg movie-filter" });
    const wrap = el("section", { class: "row" }, el("div", { class: "row-head" }, el("h3", { text: "All movies" }), filterBox), grid, more);
    let shown = 0, list = [];
    const page = () => { grid.append(...list.slice(shown, shown + 24).map(v => videoCard(v))); shown += 24; more.hidden = shown >= list.length; };
    loadMovies().then(all => {
      if (token !== renderToken) return;
      const chans = [...new Set(all.map(m => m.ch))].map(id => CH.get(id)).filter(Boolean);
      const setFilter = (ch, btn) => {
        filterBox.querySelectorAll("button").forEach(b => b.classList.toggle("on", b === btn));
        list = ch ? all.filter(m => m.ch === ch) : all;
        grid.replaceChildren(); shown = 0; page();
      };
      const allBtn = el("button", { text: "All", onclick: (e) => setFilter(null, e.currentTarget) });
      filterBox.append(allBtn, ...chans.map(c => el("button", { text: c.name.replace(/ Movies$/, ""), onclick: (e) => setFilter(c.id, e.currentTarget) })));
      setFilter(null, allBtn);
      sub.textContent = `${all.length} free full movies from official studios and distributors.`;
    });
    more.addEventListener("click", page);
    const sub = el("p", { class: "page-sub", text: "Free full movies from official studios and distributors." });
    return [
      el("h1", { class: "page-title", text: "Movies" }), sub,
      row("New movies", { live: true, big: true }, latest(["movies"], 16, 8)),
      wrap,
      tmdbKey ? row("Coming soon to cinemas", { sub: "Trailers" }, () => tmdb("movie/upcoming").then(d => tmdbItems(d.results, "movie"))) : null
    ];
  }
  function viewShowsTab() {
    return [
      ...pageHead("Shows", "Talk shows, game shows, cooking and vlogs from Pakistan, India and around the world."),
      chips([["TV & game shows", "#cat/shows"], ["Cooking", "#cat/cooking"], ["Vlogs", "#cat/vlogs"]]),
      row("New in TV & game shows", { live: true, big: true }, latest(["shows"], 20, 2, { noPromo: true })),
      row("Show series", { link: "#cat/shows" }, showsIn(["shows"], 24)),
      chanRow("Show channels", ["shows"]),
      row("Cooking", { live: true, link: "#cat/cooking" }, latest(["cooking"], 20, 3)),
      row("Cooking series", {}, showsIn(["cooking"], 20)),
      chanRow("Cooking channels", ["cooking"]),
      row("Vlogs", { live: true, link: "#cat/vlogs" }, latest(["vlogs"], 20, 3)),
      chanRow("Vloggers", ["vlogs"]),
      row("Show shorts", {}, latest(SHOW_CATS, 16, 2, { shorts: true })),
      updatedNote()
    ];
  }
  function viewShorts() {
    const list = SHORTS.filter(v => allowedCh(CH.get(v.ch)));
    return [...pageHead("Shorts", "Quick clips from every channel, newest first."), el("div", { class: "sgrid" }, list.slice(0, 120).map(shortCard))];
  }
  function viewWorld() {
    const head = pageHead("World cinema", "New movies and series from around the world, with official trailers and where to watch.");
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
      row("K-dramas", {}, () => tmdb("discover/tv", { with_original_language: "ko", sort_by: "popularity.desc", with_genres: "18" }).then(d => tmdbItems(d.results, "tv")))
    ];
  }
  function viewList() {
    const list = store.get("adm_list", []).filter(isAllowedItem);
    if (!list.length) return [...pageHead("My List"),
      el("div", { class: "empty" }, el("b", { text: "Your list is empty" }), "Tap “+ My List” on any drama, cartoon or movie to save it here.")];
    const shows = list.filter(x => x.type === "show"), rest = list.filter(x => x.type !== "show");
    return [...pageHead("My List"),
      shows.length ? el("div", { class: "shgrid" }, shows.map(anyCard).filter(Boolean)) : null,
      rest.length ? el("div", { class: "grid" }, rest.map(x => anyCard(x)).filter(Boolean)) : null];
  }
  function viewChannel(id) {
    const c = CH.get(id);
    if (!allowedCh(c)) return viewHome();
    const vids = c.videos.map(v => ({ type: "yt", ...v, ch: c.id }));
    const shows = SHOWS.filter(s => s.ch === id);
    return [
      el("div", { class: "chan-head" },
        el("img", { src: c.img, alt: "", referrerpolicy: "no-referrer" }),
        el("div", {},
          el("h1", { text: c.name }),
          el("p", { text: `${CATS[c.cat]} · ${c.lang}` }),
          el("div", { class: "cta" },
            vids[0] ? el("button", { class: "pill sm grad", onclick: () => openPlayer(vids[0]) }, icon(PLAY, true), "Play latest") : null,
            el("a", { class: "pill sm ghost", href: `https://www.youtube.com/channel/${c.id}/videos`, target: "_blank", rel: "noopener", text: "Open on YouTube" })))),
      shows.length ? el("section", { class: "row" }, el("div", { class: "row-head" }, el("h3", { text: c.cat === "movies" ? "Collections" : "Dramas and series" })), el("div", { class: "shgrid" }, shows.map(showCard))) : null,
      (c.shorts || []).length ? row("Shorts", {}, c.shorts.map(v => ({ type: "yt", ...v, ch: c.id, short: true }))) : null,
      el("section", { class: "row" }, el("div", { class: "row-head" }, el("h3", { text: "Latest videos" })), el("div", { class: "grid" }, vids.map(v => videoCard(v))))
    ];
  }

  /* ---------- show page (full episode list) ---------- */
  function viewShow(id) {
    const s = SHOW.get(id);
    if (!allowedShow(s)) return [...pageHead("Not found"), el("div", { class: "empty" }, el("b", { text: "This series is not available" }), el("a", { class: "pill sm", href: "#home", text: "Go home" }))];
    const c = CH.get(s.ch) || {};
    document.title = `${s.t} · AD Movie`;
    const token = renderToken;
    const listBox = el("div", { class: "ep-list" }, Array.from({ length: 6 }, () => el("div", { class: "ep-item skeleton" }, el("span", { class: "vthumb" }))));
    const ctas = el("div", { class: "hero-cta" });
    const sortBtn = el("button", { class: "pill sm ghost", text: "Newest first" });
    const countEl = el("span", { text: `${s.n} episodes` });
    const head = el("section", { class: "show-hero" },
      thumbImg(s.v, ["maxresdefault", "hq720", "hqdefault"]),
      el("div", { class: "show-body" },
        el("a", { class: "hero-chan", href: "#ch/" + c.id }, el("img", { src: c.img, alt: "", referrerpolicy: "no-referrer" }), c.name),
        el("h1", { text: s.t }),
        el("p", { class: "meta" }, countEl, ` · ${CATS[s.cat]}`, s.last ? ` · Updated ${ago(s.last)}` : ""),
        ctas));
    let eps = [], newestFirst = false;
    function renderList() {
      const list = newestFirst ? [...eps].reverse() : eps;
      const cur = progress[id];
      listBox.replaceChildren(...list.map(e => el("button", { class: "ep-item" + (e.id === cur ? " current" : ""), onclick: () => openPlayer(e, eps) },
        el("span", { class: "vthumb" }, thumbImg(e.id, ["mqdefault", "hqdefault"]),
          watched.has(e.id) ? el("span", { class: "seen", text: "✓" }) : null,
          el("span", { class: "play" }, icon(PLAY))),
        el("span", { class: "ep-info" },
          el("span", { class: "ep-n", text: e.id === cur ? `Episode ${e.n} · Continue` : `Episode ${e.n}` }),
          el("span", { class: "t", text: e.t }),
          el("span", { class: "s", text: ago(e.p) })))));
      sortBtn.textContent = newestFirst ? "Oldest first" : "Newest first";
    }
    sortBtn.addEventListener("click", () => { newestFirst = !newestFirst; renderList(); });
    episodesOf(id).then(list => {
      if (token !== renderToken) return;
      eps = list;
      countEl.textContent = `${eps.length} episodes`;
      if (!eps.length) { listBox.replaceChildren(el("div", { class: "empty" }, el("b", { text: "Episodes could not be loaded" }), "Check your internet and try again.")); return; }
      const curIdx = eps.findIndex(e => e.id === progress[id]);
      const resume = curIdx >= 0 ? eps[Math.min(curIdx + (watched.has(eps[curIdx].id) && curIdx < eps.length - 1 ? 1 : 0), eps.length - 1)] : null;
      const first = eps[0], last = eps[eps.length - 1];
      ctas.replaceChildren(
        resume ? el("button", { class: "pill grad", onclick: () => openPlayer(resume, eps) }, icon(PLAY, true), `Continue · Ep ${resume.n}`)
          : el("button", { class: "pill grad", onclick: () => openPlayer(first, eps) }, icon(PLAY, true), `Play Episode ${first.n}`),
        el("button", { class: "pill ghost", onclick: () => openPlayer(last, eps) }, `Latest · Ep ${last.n}`),
        listButton({ type: "show", id }),
        el("button", { class: "pill ghost icon-only", "aria-label": "Share", onclick: () => share(s.t, "show/" + id) }, icon(SHARE)));
      renderList();
    });
    const more = SHOWS.filter(x => x.ch === s.ch && x.id !== id);
    return [
      head,
      el("section", { class: "row" }, el("div", { class: "row-head" }, el("h3", { text: "Episodes" }), sortBtn), listBox),
      more.length ? row("More from " + c.name, {}, more.slice(0, 20)) : null
    ];
  }
  function listButton(item) {
    const b = el("button", { class: "pill ghost" });
    const paint = () => { b.textContent = inList(item) ? "✓ My List" : "+ My List"; };
    b.addEventListener("click", () => { toggleList(item); paint(); });
    paint();
    return b;
  }
  async function share(title, hash) {
    const url = appUrl(hash);
    try {
      if (navigator.share) { await navigator.share({ title: `${title} · AD Movie`, url }); return; }
      await navigator.clipboard.writeText(url); toast("Link copied");
    } catch (e) { if (e && e.name !== "AbortError") prompt("Copy this link:", url); }
  }

  /* ---------- search ---------- */
  const ALIAS = {
    kdrama: "korean", "k-drama": "korean", cdrama: "chinese", "c-drama": "chinese", pakistani: "pk urdu",
    cartoon: "cartoon", toon: "cartoon", kids: "kids", bachon: "kids", turkish: "turkish", ertugrul: "turkish",
    movie: "movie", film: "movie", webseries: "web series", drama: "drama", anime: "anime"
  };
  function chanText(c) { return c ? norm(`${c.name} ${c.lang} ${CATS[c.cat]} ${c.cat}`) : ""; }
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
  async function viewSearch(term) {
    const token = ++renderToken;
    clearInterval(heroTimer);
    const words = norm(term).split(" ").filter(Boolean);
    if (!words.length) return route();
    const rank = (list, title, ch) => list.map(x => [allowedCh(CH.get(ch(x))) ? matchScore(words, norm(title(x)), chanText(CH.get(ch(x)))) : 0, x])
      .filter(x => x[0] > 0).sort((a, b) => b[0] - a[0] || (b[1].p || b[1].last || "").localeCompare(a[1].p || a[1].last || "")).map(x => x[1]);
    const chans = FEED.channels.filter(c => allowedCh(c) && matchScore(words, norm(c.name), chanText(c)) > 0);
    const shows = rank(SHOWS, s => s.t, s => s.ch).slice(0, 30);
    const vids = rank(ALL, v => v.t, v => v.ch).slice(0, 40);
    const shorts = rank(SHORTS, v => v.t, v => v.ch).slice(0, 20);
    const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(term)}`;
    const movieBox = el("div");
    const total = () => shows.length + vids.length + chans.length;
    const subEl = el("p", { class: "page-sub", text: total() ? `${shows.length} series · ${vids.length} new videos` : "Searching..." });
    view.replaceChildren(...[
      el("h1", { class: "page-title", text: `Results for “${term}”` }), subEl,
      chans.length ? row("Channels", {}, chans) : null,
      shows.length ? el("section", { class: "row" }, el("div", { class: "row-head" }, el("h3", { text: "Dramas and series" })), el("div", { class: "shgrid" }, shows.map(showCard))) : null,
      movieBox,
      vids.length ? el("section", { class: "row" }, el("div", { class: "row-head" }, el("h3", { text: "Latest videos" })), el("div", { class: "grid" }, vids.map(v => videoCard(v)))) : null,
      shorts.length ? row("Shorts", {}, shorts) : null,
      kids ? null : el("div", { class: "unlock" },
        el("h3", { text: "Can't find it?" }),
        el("p", { text: "Search all of YouTube for older episodes and other videos." }),
        el("a", { class: "pill sm grad", href: ytUrl, target: "_blank", rel: "noopener", text: `Search “${term}” on YouTube` }))
    ].filter(Boolean));
    if (!kids) {
      const movies = rank(await loadMovies(), m => m.t, m => m.ch).slice(0, 24);
      if (token !== renderToken) return;
      if (movies.length) movieBox.replaceWith(el("section", { class: "row" }, el("div", { class: "row-head" }, el("h3", { text: "Movies" })), el("div", { class: "grid" }, movies.map(v => videoCard(v)))));
      const parts = [[shows.length, "series"], [movies.length, "movies"], [vids.length, "new videos"]].filter(x => x[0]).map(x => x.join(" "));
      subEl.textContent = parts.length || chans.length ? parts.join(" · ") : "Nothing found in the app.";
    } else {
      subEl.textContent = total() ? `${shows.length} series · ${vids.length} new videos` : "Nothing found. Try “Peppa”, “Bluey” or “Tom and Jerry”.";
    }
    if (tmdbKey && !kids) {
      tmdb("search/multi", { query: term }).then(d => {
        if (token !== renderToken) return;
        const l = tmdbItems(d.results);
        if (l.length) view.append(row("Trailers", {}, l));
      }).catch(() => {});
    }
  }

  /* ---------- router ---------- */
  const ROUTES = { home: viewHome, dramas: viewDramas, shows: viewShowsTab, kids: () => viewKids(false), movies: viewMovies, shorts: viewShorts, world: viewWorld, mylist: viewList };
  const KID_ROUTES = ["home", "kids", "shorts", "mylist", "ch", "show", "cat", "v"];
  const TAB_OF = { cat: "dramas", show: "dramas", ch: "home", v: "home" };
  let currentTab = "home";
  function route() {
    if (!FEED) return;
    let [tab, arg] = (location.hash || "#home").slice(1).split("/");
    arg = arg && decodeURIComponent(arg);
    if (tab === "search" && arg) { input.value = arg; bar.hidden = false; viewSearch(arg); onScroll(); return; }
    if (tab === "v" && arg) { openShared(arg); tab = "home"; }
    if (!ROUTES[tab] && !["ch", "show", "cat"].includes(tab)) tab = "home";
    if (kids && !KID_ROUTES.includes(tab)) tab = "kids";
    currentTab = tab;
    renderToken++; clearInterval(heroTimer);
    document.title = "AD Movie";
    const nodes = tab === "ch" ? viewChannel(arg) : tab === "show" ? viewShow(arg) : tab === "cat" ? viewCategory(arg) : ROUTES[tab]();
    view.replaceChildren(...nodes.filter(Boolean));
    const active = tab === "cat" && SHOW_CATS.includes(arg) ? "shows" : tab === "show" && SHOW_CATS.includes(SHOW.get(arg)?.cat) ? "shows" : (TAB_OF[tab] || tab);
    document.querySelectorAll("[data-tab]").forEach(a => {
      a.classList.toggle("active", a.dataset.tab === active);
      a.hidden = kids && !KID_ROUTES.includes(a.dataset.tab);
    });
    window.scrollTo(0, 0); onScroll();
  }
  function onScroll() {
    const first = view.firstElementChild;
    topbar.classList.toggle("solid", window.scrollY > 30 || !(first && (first.classList.contains("hero") || first.classList.contains("show-hero"))));
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  function openShared(id) {
    const v = ALL.find(x => x.id === id) || (MOVIES || []).find(x => x.id === id) || { type: "yt", id, t: "Shared video", p: "", ch: null };
    setTimeout(() => openPlayer(v), 50);
  }

  /* ---------- player ---------- */
  const P = {
    root: $("#player"), frame: $("#playerFrame"), title: $("#playerTitle"), sub: $("#playerSub"), list: $("#listBtn"),
    chan: $("#chanBtn"), ext: $("#openExternal"), note: $("#playerNote"), desc: $("#playerDesc"), up: $("#upNext"),
    upTitle: $("#upNext h4"), upList: $("#upList"), prev: $("#prevBtn"), next: $("#nextBtn"), show: $("#showBtn"),
    share: $("#shareBtn"), overlay: $("#nextOverlay"), overlayText: $("#nextOverlayText")
  };
  let current = null, queue = [], autoTimer = null;

  async function openPlayer(it, eps) {
    current = it;
    cancelAutoNext();
    P.desc.textContent = ""; P.note.textContent = ""; P.up.hidden = true;
    P.prev.hidden = P.next.hidden = P.show.hidden = true;
    P.root.classList.toggle("vertical", !!it.short);
    if (it.type === "yt") {
      const c = CH.get(it.ch) || {};
      const show = it.s && SHOW.get(it.s);
      P.title.textContent = it.t;
      P.sub.textContent = [show ? show.t : c.name, ago(it.p), views(it.v)].filter(Boolean).join(" · ");
      P.frame.src = `https://www.youtube-nocookie.com/embed/${it.id}?autoplay=1&rel=0&playsinline=1&modestbranding=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
      P.ext.href = `https://www.youtube.com/watch?v=${it.id}`;
      P.ext.hidden = false; P.chan.hidden = !c.id; P.share.hidden = false;
      P.desc.textContent = it.d || "";
      P.note.textContent = "If the video says “Watch on YouTube”, the channel allows it only on YouTube. Tap “YouTube”.";
      markWatched(it); addRecent(it); maybeAskSupport();
      if (show) {
        P.show.hidden = false;
        queue = eps || await episodesOf(it.s);
        if (current !== it) return;
        const i = queue.findIndex(e => e.id === it.id);
        if (i >= 0) {
          P.sub.textContent = [show.t, `Episode ${queue[i].n} of ${queue.length}`, ago(it.p)].filter(Boolean).join(" · ");
          P.prev.hidden = i <= 0; P.next.hidden = i >= queue.length - 1;
          fillUpNext(queue.slice(i + 1, i + 13), "Next episodes");
          if (i >= queue.length - 1) fillUpNext(queue.slice(Math.max(0, i - 8), i).reverse(), "Earlier episodes");
          return;
        }
      }
      // Not part of a series: "up next" is the next newest from the same channel (or movies).
      const pool = it.short ? (c.shorts || []).map(v => ({ ...v, short: true })) : it.movie ? (MOVIES || []).filter(m => m.ch === it.ch) : c.videos || [];
      queue = pool.map(v => ({ type: "yt", ...v, ch: it.ch }));
      const i = queue.findIndex(v => v.id === it.id);
      P.next.hidden = !(i >= 0 && i < queue.length - 1);
      fillUpNext(queue.filter(v => v.id !== it.id).slice(Math.max(0, i), Math.max(0, i) + 12), it.movie ? "More movies" : "Up next");
    } else if (it.type === "tmdb") {
      queue = [];
      P.title.textContent = it.title;
      P.sub.textContent = [it.year, it.media === "tv" ? "Series" : "Movie", "Official trailer"].filter(Boolean).join(" · ");
      P.frame.src = "about:blank";
      P.desc.textContent = it.desc || "";
      P.ext.href = `https://www.themoviedb.org/${it.media}/${it.id}`; P.ext.hidden = false; P.chan.hidden = true; P.share.hidden = true;
      loadTrailer(it);
    }
    updateListBtn();
    showPlayer();
  }
  function showPlayer() {
    updateListBtn();
    if (P.root.hidden) { P.root.hidden = false; document.body.style.overflow = "hidden"; history.pushState({ player: true }, ""); }
  }
  function fillUpNext(list, title) {
    showPlayer();
    if (!list.length) return;
    P.upTitle.textContent = title;
    P.upList.replaceChildren(...list.map(v => el("button", { class: "upitem" + (watched.has(v.id) ? " seen-item" : ""), onclick: () => { openPlayer(v, v.s ? queue : null); P.root.scrollTo(0, 0); } },
      el("span", { class: "vthumb" }, thumbImg(v.id, ["mqdefault", "hqdefault"]), watched.has(v.id) ? el("span", { class: "seen", text: "✓" }) : null),
      el("span", {}, el("span", { class: "t", text: v.n && v.s ? `Episode ${v.n}` : v.t }), el("span", { class: "s", text: v.n && v.s ? v.t : ago(v.p) })))));
    P.up.hidden = false;
  }
  function step(dir) {
    const i = queue.findIndex(e => e.id === current?.id);
    const target = queue[i + dir];
    if (target) { openPlayer(target, target.s ? queue : null); P.root.scrollTo(0, 0); }
  }
  // Auto-play the next episode when a video ends (YouTube embed messages).
  function cancelAutoNext() { clearInterval(autoTimer); autoTimer = null; P.overlay.hidden = true; }
  function onEnded() {
    const i = queue.findIndex(e => e.id === current?.id);
    const target = queue[i + 1];
    if (!target || !current?.s) return;
    let n = 6;
    P.overlay.hidden = false;
    const tick = () => { P.overlayText.textContent = `Episode ${target.n || ""} starts in ${n}s`; if (n-- <= 0) { cancelAutoNext(); openPlayer(target, queue); } };
    tick(); autoTimer = setInterval(tick, 1000);
  }
  P.frame.addEventListener("load", () => {
    try { P.frame.contentWindow.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "*"); } catch (e) {}
  });
  window.addEventListener("message", (e) => {
    if (!/youtube(-nocookie)?\.com$/.test(new URL(e.origin || "http://x").hostname)) return;
    let d; try { d = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch (err) { return; }
    const state = d && (d.event === "onStateChange" ? d.info : d.info && d.info.playerState);
    if (state === 0 && !autoTimer && P.overlay.hidden) onEnded();
  });
  $("#nextNow").addEventListener("click", () => { cancelAutoNext(); step(1); });
  $("#nextCancel").addEventListener("click", cancelAutoNext);

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
    cancelAutoNext();
    P.root.hidden = true; P.frame.src = "about:blank"; document.body.style.overflow = ""; current = null;
    if (!fromPop && history.state && history.state.player) history.back();
    // Refresh ✓ marks and "Continue" on the page underneath.
    if (["show", "home", "mylist"].includes(currentTab)) { const y = window.scrollY; route(); window.scrollTo(0, y); }
  }
  function slim(it) {
    if (it.type === "yt") { const { type, id, t, p, v, ch, short, s, movie } = it; return { type, id, t, p, v, ch, short, s, movie }; }
    if (it.type === "show") return { type: "show", id: it.id };
    const { type, id, media, title, year, img, desc } = it; return { type, id, media, title, year, img, desc: (desc || "").slice(0, 300) };
  }
  function addRecent(it) {
    const r = store.get("adm_recent", []).filter(x => keyOf(x) !== keyOf(it) && !(it.s && x.s === it.s));
    r.unshift(slim(it)); store.set("adm_recent", r.slice(0, 20));
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
  // In a series, "My List" saves the whole drama, not one episode.
  const listTarget = () => current && current.s && SHOW.has(current.s) ? { type: "show", id: current.s } : current;
  function updateListBtn() { const t = listTarget(); P.list.textContent = t && inList(t) ? "✓ My List" : "+ My List"; }

  P.list.addEventListener("click", () => { const t = listTarget(); if (t) { toggleList(t); updateListBtn(); } });
  P.chan.addEventListener("click", () => { const id = current && current.ch; closePlayer(); if (id) setTimeout(() => { location.hash = "ch/" + id; }, 60); });
  P.show.addEventListener("click", () => { const id = current && current.s; closePlayer(); if (id) setTimeout(() => { location.hash = "show/" + id; }, 60); });
  P.share.addEventListener("click", () => { if (!current) return; current.s && SHOW.has(current.s) ? share(SHOW.get(current.s).t, "show/" + current.s) : share(current.t, "v/" + current.id); });
  P.prev.addEventListener("click", () => step(-1));
  P.next.addEventListener("click", () => step(1));
  $("#playerClose").addEventListener("click", () => closePlayer());
  window.addEventListener("popstate", () => { if (!P.root.hidden) closePlayer(true); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { if (!SUP.hidden) { closeSupport(); return; } closePlayer(); closeSettings(); } });

  /* ---------- search bar ---------- */
  const bar = $("#searchBar"), input = $("#searchInput");
  let searchTimer;
  $("#searchBtn").addEventListener("click", () => { bar.hidden = false; topbar.classList.add("solid"); input.focus(); });
  $("#searchClose").addEventListener("click", () => { bar.hidden = true; input.value = ""; route(); });
  input.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const v = input.value.trim();
    searchTimer = setTimeout(() => { if (!FEED) return; v.length >= 2 ? viewSearch(v) : route(); }, 300);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault(); clearTimeout(searchTimer);
    const v = input.value.trim();
    if (FEED && v) viewSearch(v);
    input.blur();
  });

  /* ---------- settings (with parent PIN for kids mode) ---------- */
  const S = $("#settings"), pinRow = $("#pinRow"), pinInput = $("#pinInput"), pinHint = $("#pinHint");
  function openSettings() {
    $("#kidsMode").checked = kids; $("#tmdbKey").value = tmdbKey; pinInput.value = "";
    const pin = store.get("adm_pin", "");
    pinHint.textContent = kids && pin ? "Enter the parent PIN to turn kids mode off." : "Optional: set a 4-digit PIN so children can't turn kids mode off.";
    S.hidden = false;
  }
  function closeSettings() { S.hidden = true; }
  $("#settingsBtn").addEventListener("click", openSettings);
  $("#settingsCancel").addEventListener("click", closeSettings);
  S.addEventListener("click", (e) => { if (e.target === S) closeSettings(); });
  $("#settingsSave").addEventListener("click", () => {
    const want = $("#kidsMode").checked, pin = store.get("adm_pin", ""), typed = pinInput.value.trim();
    if (kids && !want && pin && typed !== pin) { toast("Wrong PIN"); pinInput.focus(); return; }
    if (!kids && want && /^\d{4}$/.test(typed)) store.set("adm_pin", typed);
    if (!want) store.set("adm_pin", "");
    kids = want; tmdbKey = $("#tmdbKey").value.trim();
    store.set("adm_kids", kids); store.set("adm_tmdb", tmdbKey);
    closeSettings(); toast(kids ? "Kids mode on" : "Settings saved");
    location.hash = "home"; route();
  });
  pinRow.hidden = false;

  /* ---------- voluntary support popup (EasyPaisa) ----------
     First 7 days: nothing. After that, every 3rd video shows a friendly reminder
     (at most once every 30 minutes). It can always be closed; the app never blocks.
     "Maine support kar diya" hides it for 30 days, then it asks again next month.
     Family phones (opened once with ?family=<code>) never see it. */
  const SUP = $("#support");
  const TRIAL_DAYS = 7, EVERY_N_PLAYS = 3, GAP_MS = 30 * 60 * 1000, MONTH_MS = 30 * 864e5;
  const FAMILY_HASH = "77ac2bcf29d774c79f7234cbc2be920ec216b6074a35d285dae570193229a290";
  if (!store.get("adm_first", 0)) store.set("adm_first", Date.now());
  if (store.get("adm_supported", false) === true) { store.set("adm_supportedAt", Date.now()); store.set("adm_supported", null); }
  (async function checkFamily() {
    const m = location.search.match(/[?&]family=([^&#]+)/);
    if (!m || !crypto.subtle) return;
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(decodeURIComponent(m[1])));
    const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
    history.replaceState(history.state, "", location.pathname + location.hash);
    if (hex === FAMILY_HASH) { store.set("adm_family", true); toast("Family phone ✓ Support popup band"); }
    else toast("Family code ghalat hai");
  })();
  function openSupport() {
    const again = store.get("adm_supportedAt", 0);
    $("#supportTitle").textContent = again ? "Is mahine bhi support karein ❤️" : "AD Movie ko support karein";
    SUP.hidden = false;
  }
  function closeSupport() { SUP.hidden = true; store.set("adm_lastAsk", Date.now()); }
  function maybeAskSupport() {
    if (kids || store.get("adm_family", false)) return;
    const force = /[?&]support=1/.test(location.search);
    const plays = store.get("adm_plays", 0) + 1;
    store.set("adm_plays", plays);
    const now = Date.now();
    const trialOver = now - store.get("adm_first", now) > TRIAL_DAYS * 864e5;
    const paidRecently = now - store.get("adm_supportedAt", 0) < MONTH_MS;
    const rested = now - store.get("adm_lastAsk", 0) > GAP_MS;
    if (force || (trialOver && !paidRecently && rested && plays % EVERY_N_PLAYS === 0)) setTimeout(openSupport, 2500);
  }
  $("#supportClose").addEventListener("click", closeSupport);
  $("#supportLater").addEventListener("click", closeSupport);
  SUP.addEventListener("click", (e) => { if (e.target === SUP) closeSupport(); });
  $("#supportDone").addEventListener("click", () => { store.set("adm_supportedAt", Date.now()); SUP.hidden = true; toast("Bohat shukriya! ❤️ Agle mahine phir yaad dilayenge"); });
  $("#supportCopy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText("03425085229"); toast("Number copy ho gaya"); }
    catch (e) { prompt("EasyPaisa number:", "03425085229"); }
  });
  $("#supportOpen").addEventListener("click", () => { closeSettings(); openSupport(); });

  window.addEventListener("hashchange", () => { if (!location.hash.startsWith("#search/")) bar.hidden = true; route(); });
  window.addEventListener("online", () => { if (!FEED) start(); });

  function start() {
    view.replaceChildren(el("div", { class: "rail", style: "padding-top:90px" }, [0, 1, 2].map(() => el("div", { class: "vcard skeleton" }, el("span", { class: "vthumb" })))));
    loadData().then(route).catch(() => {
      view.replaceChildren(el("div", { class: "empty", style: "margin-top:90px" }, el("b", { text: "No internet connection" }), "Connect to the internet and AD Movie will load automatically.",
        el("div", {}, el("button", { class: "pill sm", style: "margin-top:14px", onclick: start, text: "Try again" }))));
    });
  }
  start();

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
