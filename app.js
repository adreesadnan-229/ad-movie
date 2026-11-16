/* AD Movie: plays only free, legal sources (official YouTube channel uploads and public domain films). */
(function () {
  "use strict";

  const AV = (h) => `https://yt3.googleusercontent.com/${h}=s240-c-k-c0x00ffffff-no-rj`;

  // Official channels. Full episodes play from each channel's own uploads.
  const CHANNELS = [
    { id: "UC4JCksJF76g_MdzPVBJoC3Q", name: "ARY Digital", lang: "Urdu", cat: "pk", img: AV("PAv0BKK9dpn11mR17lPYAbQ0bawSxYcj3rRHKDFVgUs7XehkhgrfDqCy2W9hS7PPsDZaSuJDEQ") },
    { id: "UCEeEQxm6qc_qaTE7qTV5aLQ", name: "HUM TV", lang: "Urdu", cat: "pk", img: AV("zA-EJBUBG8nI8atakCCYgxw6c42fzoxDgIK_3bao7CRZaOR3aBc02VciNymKFMJxYPmQKnnL") },
    { id: "UCe9JSDmyqNgA_l2BzGHq1Ug", name: "Har Pal Geo", lang: "Urdu", cat: "pk", img: AV("gmRmvRYUHVbi2YnWiM_RbJtwPMkKK_WJfsWYINioLLVutKiQ5_Yf1xbGY57qGJydAY7zNuRp6Q") },
    { id: "UCF2ltLX1dnPa6-L1paPaMzw", name: "Green TV Entertainment", lang: "Urdu", cat: "pk", img: AV("FuZXlL8A2GyM0dm4h9pJYY3rLkLVT4stwUGt3AvK1saq6aBC1LBy4ia9gGy1ObtXzda12fxO") },

    { id: "UCUhpu5MJQ_bjPkXO00jyxsw", name: "iQIYI", lang: "Chinese", cat: "cn", img: AV("LD_FcD0TbPuK3HtkiGHU6tNNQ7tw4gGyAadAIK5TmcBqEpiyO357yU_Lxy0cs-_9tmRSDKxyBBE") },
    { id: "UCI70JGG0hJS306Q-hGWfB7Q", name: "YOUKU English", lang: "Chinese · EN subs", cat: "cn", img: AV("0vjcUxYH4v1e84lb4tB8fNIR_ktCdDOOPCdkQMkGVGHzb6P_38Jml1FFtur938h2pJDDn_aVUw") },
    { id: "UCiu3bj4rR8KOYcUA4KNkOAA", name: "WeTV English", lang: "Chinese · EN subs", cat: "cn", img: AV("iI9wCyPjt51JS1jObvCKs7n9GCxjDVT7w7wVgTs6ehgDwswVysdYxIEbusqigsJADtlJ-72X75c") },
    { id: "UCQatgKoA7lylp_UzvsLCgcw", name: "Tencent Video", lang: "Chinese", cat: "cn", img: AV("BZ0BcoBm1IDjD4a3XbhnHyNZ3MkLnT9FnRxj_ioc6V3yT2nqcCxR0acvzokp7B019c036G5LHQ") },

    { id: "UC5BMQOsAB8hKUyHu9KI6yig", name: "KBS World TV", lang: "Korean · EN subs", cat: "kr", img: AV("ytc/AIdro_kWAyYX8IuruW0YuQuEK6Jn-cfqZZ8oFZCcpy7HnzB3C_FA") },
    { id: "UCBAEVMr0li9YYF8IwZHfusw", name: "MBC Drama", lang: "Korean", cat: "kr", img: AV("YToOaX2h1ouHnhGr99Z837_JtOajCohTl78bPl5aJKNMpoBOJDcCtBxtn3MZAbYS3nRJ2LCo_A") },
    { id: "UCkbJc8jMcTXwhtmN5VMwfXg", name: "JTBC Drama", lang: "Korean", cat: "kr", img: AV("owK7Mx_4O7DU2lc1yrE0XIeerGHtJK_7ekIj0uvPa84PeaDPehNLS1BqHwOs-SPs15aY9-mKoA") },
    { id: "UCNIiH_4ArJNd_cDZApZ7AFg", name: "TVING", lang: "Korean", cat: "kr", img: AV("sBxnItKjolnANWriklnCVUuUJyY9sjZMEv5UJ842-vLXiT2tQvWiU6Qvgi-ncl_eWuGjNtBm") },

    { id: "UCAOtE1V7Ots4DjM8JLlrYgg", name: "Peppa Pig", lang: "Kids · English", cat: "kids", img: AV("13Y1jOLVSE09l52UWslwmQdEGEK2MJYE6VxGb_cgGOsZKJbBGUvCFt8ivnCEv4sOG_tNJQl4_2c") },
    { id: "UCbCmjCuTUZos6Inko4u57UQ", name: "Cocomelon", lang: "Kids · Rhymes", cat: "kids", img: AV("yiljI_XQcX8X0p_E2S0APGrUs7tHBMukf5_3dhVzhbH-z5uhzpt88tUopQa7ngVwO1nGAAnr6A") },
    { id: "UCpYye8D5fFMUPf9nSfgd4bA", name: "BabyBus", lang: "Kids · Learning", cat: "kids", img: AV("h8scB8Et9ooSoeRG3goQ3spO1Hh2P8c_aJgH5MtbQ-KdrAXhrLv_RrhoiigOuuzaAMwDAQvfJw") },
    { id: "UCu59yAFE8fM0sVNTipR4edw", name: "Masha and the Bear", lang: "Kids · Cartoon", cat: "kids", img: AV("HOovWxotscnUXBAdVGlmMd1UMdnLOMpbqdQIOx_Xaq5_uw6NIPOnFgZCzNvLTpMvGQ3HWTGk1Q") },
    { id: "UCKAqou7V9FAWXpZd9xtOg3Q", name: "Little Baby Bum", lang: "Kids · Rhymes", cat: "kids", img: AV("m_TEySnkSgW4JSO1zH-Ln0Hu0v9mGUTMQXJawt3dpHVLB6VjC7jme0bJkziIvKbx2YW1IhfPxho") },

    { id: "UCz75RVbH8q2jdBJ4SnwuZZQ", name: "Blender Studio", lang: "Free animated films", cat: "anim", img: AV("YbwH7a-sj1obL4iayp8McKsoU7xSWmcI5T-V6UMAokamhlm0WOtWsSVnlaC6uv5l0BCWzZbodA") }
  ];

  // Public domain films from the Internet Archive.
  const IA = {
    popular: "collection:feature_films AND mediatype:movies",
    comedy: 'collection:feature_films AND mediatype:movies AND (subject:comedy OR title:(chaplin OR keaton OR laurel OR stooges))',
    adventure: 'collection:feature_films AND mediatype:movies AND subject:("science fiction" OR adventure OR western)',
    mystery: 'collection:feature_films AND mediatype:movies AND subject:(mystery OR "film noir" OR detective)',
    cartoons: "collection:classic_cartoons",
    animation: "collection:animationandcartoons AND mediatype:movies"
  };
  // Keep the library family friendly.
  const BLOCK = /\b(sex|sexual|nud|naked|strip|burlesque|lust|erotic|orgy|vice|reefer|marihuana|marijuana|cocaine|dope|narcotic|nazi|hitler|torture|gore)/i;

  const $ = (s, el = document) => el.querySelector(s);
  const view = $("#view");
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  let kids = store.get("adm_kids", false);
  let tmdbKey = store.get("adm_tmdb", "");
  let renderToken = 0;

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
    for (const c of kids_.flat()) if (c != null) n.append(c);
    return n;
  }
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 1800);
  }
  const uploads = (id, mode) => (mode === "shorts" ? "UUSH" : "UULF") + id.slice(2);
  const keyOf = (it) => `${it.type}:${it.media || ""}:${it.id}`;
  const clean = (s) => (s || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

  /* ---------- data ---------- */
  const iaCache = new Map();
  async function iaSearch(q, rows = 24) {
    const k = q + rows;
    if (iaCache.has(k)) return iaCache.get(k);
    const url = "https://archive.org/advancedsearch.php?" + new URLSearchParams({
      q, rows: String(rows + 12), page: "1", output: "json"
    }) + "&fl[]=identifier&fl[]=title&fl[]=year&fl[]=description&sort[]=downloads+desc";
    const p = fetch(url).then(r => r.json()).then(d => (d.response?.docs || [])
      .filter(x => x.title && !BLOCK.test(x.title + " " + clean(Array.isArray(x.description) ? x.description[0] : x.description)))
      .slice(0, rows)
      .map(x => ({
        type: "ia", id: x.identifier, title: clean(x.title), year: x.year || "",
        desc: clean(Array.isArray(x.description) ? x.description[0] : x.description).slice(0, 600),
        img: `https://archive.org/services/img/${x.identifier}`
      })));
    iaCache.set(k, p);
    p.catch(() => iaCache.delete(k));
    return p;
  }

  async function tmdb(path, params = {}) {
    const url = `https://api.themoviedb.org/3/${path}?` + new URLSearchParams({ api_key: tmdbKey, language: "en-US", include_adult: "false", ...params });
    const r = await fetch(url);
    if (!r.ok) throw new Error("tmdb " + r.status);
    return r.json();
  }
  function tmdbItems(results, media) {
    return (results || []).filter(x => x.poster_path && !x.adult).map(x => {
      const m = x.media_type || media;
      return {
        type: "tmdb", media: m, id: x.id, title: x.title || x.name,
        year: (x.release_date || x.first_air_date || "").slice(0, 4),
        desc: x.overview || "", img: `https://image.tmdb.org/t/p/w342${x.poster_path}`
      };
    }).filter(x => x.media === "movie" || x.media === "tv");
  }

  /* ---------- cards ---------- */
  function chanCard(c) {
    return el("button", { class: "chan", onclick: () => openPlayer({ ...c, type: "ch" }) },
      el("span", { class: "ring" }, el("img", { src: c.img, alt: "", loading: "lazy", referrerpolicy: "no-referrer" })),
      el("span", { class: "t", text: c.name }),
      el("span", { class: "y", text: c.lang })
    );
  }
  function posterCard(it, wide) {
    const tag = it.type === "ia" ? (/cartoon|animation/i.test(it.src || "") ? "Cartoon" : "Full movie") : (it.media === "tv" ? "Series" : "Trailer");
    return el("button", { class: "card" + (wide ? " wide" : ""), onclick: () => openPlayer(it) },
      el("span", { class: "thumb" },
        el("img", { src: it.img, alt: "", loading: "lazy", onerror: (e) => { e.target.remove(); } }),
        el("span", { class: "tag", text: it.tagText || tag })
      ),
      el("span", { class: "t", text: it.title }),
      it.year ? el("span", { class: "y", text: String(it.year) }) : null
    );
  }
  function anyCard(it) { return it.type === "ch" ? chanCard(it) : posterCard(it); }

  function row(title, sub, loader) {
    const rail = el("div", { class: "rail" });
    for (let i = 0; i < 7; i++) rail.append(el("div", { class: "card skeleton" }, el("span", { class: "thumb" })));
    const sec = el("section", { class: "row" },
      el("div", { class: "row-head" }, el("h3", { text: title }), sub ? el("small", { text: sub }) : null),
      rail);
    const token = renderToken;
    Promise.resolve(typeof loader === "function" ? loader() : loader).then(items => {
      if (token !== renderToken) return;
      rail.innerHTML = "";
      if (!items || !items.length) { sec.remove(); return; }
      items.forEach(it => rail.append(anyCard(it)));
    }).catch(() => { if (token === renderToken) sec.remove(); });
    return sec;
  }
  const chanRow = (title, sub, cat) => row(title, sub, CHANNELS.filter(c => c.cat === cat).map(c => ({ type: "ch", ...c })));
  const iaRow = (title, sub, key, src) => row(title, sub, () => iaSearch(IA[key]).then(list => list.map(x => ({ ...x, src: src || key, tagText: /cartoons|animation/.test(key) ? "Cartoon" : "Full movie" }))));

  /* ---------- views ---------- */
  function hero() {
    const picks = CHANNELS.filter(c => ["pk", "cn", "kr", "kids"].includes(c.cat)).slice(0, 9);
    const collage = el("div", { class: "collage", "aria-hidden": "true" }, picks.map((c, i) =>
      el("img", { src: c.img, alt: "", referrerpolicy: "no-referrer", style: `--i:${i}` })));
    return el("section", { class: "hero" },
      collage,
      el("div", { class: "hero-body" },
        el("span", { class: "badge", text: kids ? "Kids mode" : "Free · Legal · No ads from us" }),
        el("h1", { text: kids ? "Cartoons and rhymes for little ones" : "Dramas, cartoons and classic movies" }),
        el("p", { text: kids ? "Peppa Pig, Cocomelon, Masha and the Bear, classic cartoons and more, all in one safe place." : "Pakistani dramas, Chinese and Korean series, kids' favourites and full classic films, straight from official channels." }),
        el("div", { class: "hero-cta" },
          el("a", { class: "pill play", href: kids ? "#kids" : "#dramas" }, playIcon(), kids ? "Watch cartoons" : "Watch dramas"),
          kids ? null : el("a", { class: "pill ghost", href: "#kids", text: "Kids corner" })
        )
      )
    );
  }
  function playIcon() {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", "M8 5.5v13l11-6.5z"); s.append(p); return s;
  }
  function chips(list) {
    return el("div", { class: "chips" }, list.map(([t, h]) => el("a", { class: "chip", href: h, text: t })));
  }
  function recentRow() {
    const r = store.get("adm_recent", []);
    if (!r.length) return null;
    return row("Continue watching", null, kids ? r.filter(isKidSafe) : r);
  }
  function isKidSafe(it) {
    if (it.type === "ch") return it.cat === "kids" || it.cat === "anim";
    return it.type === "ia" && /cartoons|animation/.test(it.src || "");
  }

  function viewHome() {
    if (kids) return [hero(), recentRow(), ...kidsRows()];
    return [
      hero(),
      chips([["Pakistani", "#dramas"], ["Chinese", "#dramas"], ["Korean", "#dramas"], ["Kids", "#kids"], ["Classic movies", "#movies"], ["World cinema", "#world"]]),
      recentRow(),
      chanRow("Pakistani dramas", "Full episodes · Urdu", "pk"),
      chanRow("Chinese dramas", "C-drama · official channels", "cn"),
      chanRow("Korean dramas", "K-drama · official channels", "kr"),
      chanRow("Kids favourites", "Cartoons and rhymes", "kids"),
      iaRow("Classic movies", "Full films · public domain", "popular"),
      iaRow("Classic cartoons", "Popeye, Superman and more", "cartoons"),
      chanRow("Free animated films", "Open movies by Blender Studio", "anim"),
      tmdbKey ? row("Trending worldwide", "Info and trailers", () => tmdb("trending/all/week").then(d => tmdbItems(d.results))) : null
    ];
  }
  function viewDramas() {
    return [
      el("h1", { class: "page-title", text: "Dramas" }),
      el("p", { class: "page-sub", text: "Tap a channel to play its latest full episodes. Switch to Shorts for quick clips." }),
      chanRow("Pakistani dramas", "Urdu", "pk"),
      chanRow("Chinese dramas", "C-drama", "cn"),
      chanRow("Korean dramas", "K-drama", "kr"),
      tmdbKey ? row("Popular K-dramas", "Info and trailers", () => tmdb("discover/tv", { with_original_language: "ko", sort_by: "popularity.desc", with_genres: "18" }).then(d => tmdbItems(d.results, "tv"))) : null,
      tmdbKey ? row("Popular C-dramas", "Info and trailers", () => tmdb("discover/tv", { with_original_language: "zh", sort_by: "popularity.desc", with_genres: "18" }).then(d => tmdbItems(d.results, "tv"))) : null
    ];
  }
  function kidsRows() {
    return [
      chanRow("Kids channels", "Safe, official uploads", "kids"),
      iaRow("Classic cartoons", "Popeye, Superman and more", "cartoons"),
      iaRow("Animated shorts", "Vintage animation", "animation"),
      chanRow("Free animated films", "Blender Studio", "anim")
    ];
  }
  function viewKids() {
    return [el("h1", { class: "page-title", text: "Kids corner" }), el("p", { class: "page-sub", text: "Cartoons, rhymes and learning videos for children." }), ...kidsRows()];
  }
  function viewMovies() {
    return [
      el("h1", { class: "page-title", text: "Movies" }),
      el("p", { class: "page-sub", text: "Full-length classic films that are free and public domain." }),
      iaRow("Most watched classics", null, "popular"),
      iaRow("Comedy classics", "Chaplin, Keaton and more", "comedy"),
      iaRow("Adventure and sci-fi", null, "adventure"),
      iaRow("Mystery and noir", null, "mystery"),
      chanRow("Free animated films", "Blender Studio", "anim")
    ];
  }
  function viewWorld() {
    const head = [el("h1", { class: "page-title", text: "World cinema" }), el("p", { class: "page-sub", text: "New and popular movies and series from around the world, with official trailers and where to watch." })];
    if (!tmdbKey) {
      return [...head, el("div", { class: "unlock" },
        el("h3", { text: "Unlock World cinema" }),
        el("p", { text: "Add a free TMDB key once to see new releases, K-dramas, C-dramas and anime with official trailers." }),
        el("ol", {}, el("li", { text: "Create a free account at themoviedb.org" }), el("li", { text: "Open Settings → API and request a free key" }), el("li", { text: "Paste it in AD Movie settings" })),
        el("button", { class: "pill", onclick: openSettings, text: "Add key" })
      )];
    }
    return [...head,
      row("Trending this week", null, () => tmdb("trending/movie/week").then(d => tmdbItems(d.results, "movie"))),
      row("Coming soon", "New releases", () => tmdb("movie/upcoming").then(d => tmdbItems(d.results, "movie"))),
      row("Now in cinemas", null, () => tmdb("movie/now_playing").then(d => tmdbItems(d.results, "movie"))),
      row("Bollywood", null, () => tmdb("discover/movie", { with_original_language: "hi", sort_by: "popularity.desc" }).then(d => tmdbItems(d.results, "movie"))),
      row("Anime", null, () => tmdb("discover/tv", { with_original_language: "ja", with_genres: "16", sort_by: "popularity.desc" }).then(d => tmdbItems(d.results, "tv"))),
      row("Family and animation", null, () => tmdb("discover/movie", { with_genres: "10751,16", sort_by: "popularity.desc" }).then(d => tmdbItems(d.results, "movie")))
    ];
  }
  function viewList() {
    const list = store.get("adm_list", []);
    const shown = kids ? list.filter(isKidSafe) : list;
    if (!shown.length) return [el("h1", { class: "page-title", text: "My List" }),
      el("div", { class: "empty" }, el("b", { text: "Your list is empty" }), "Tap “Add to My List” on any drama, cartoon or movie to save it here.")];
    return [el("h1", { class: "page-title", text: "My List" }), el("div", { class: "grid" }, shown.map(anyCard))];
  }

  let searchTimer;
  async function viewSearch(term) {
    const token = ++renderToken;
    view.replaceChildren(el("h1", { class: "page-title", text: `Results for “${term}”` }));
    const t = term.toLowerCase();
    const chans = CHANNELS.filter(c => (!kids || c.cat === "kids" || c.cat === "anim") && (c.name + " " + c.lang).toLowerCase().includes(t));
    const grid = el("div", { class: "grid" }, chans.map(c => chanCard({ type: "ch", ...c })));
    view.append(grid);
    const safe = term.replace(/[^\p{L}\p{N}\s'-]/gu, " ").trim();
    if (!safe) return;
    const cols = kids ? "(collection:classic_cartoons OR collection:animationandcartoons)" : "(collection:feature_films OR collection:classic_cartoons OR collection:animationandcartoons)";
    const jobs = [iaSearch(`${cols} AND mediatype:movies AND title:(${safe})`, 30).then(l => l.map(x => ({ ...x, tagText: "Free" })))];
    if (tmdbKey && !kids) jobs.push(tmdb("search/multi", { query: term }).then(d => tmdbItems(d.results)).catch(() => []));
    const res = (await Promise.all(jobs.map(j => j.catch(() => [])))).flat();
    if (token !== renderToken) return;
    res.forEach(it => grid.append(posterCard(it)));
    if (!grid.children.length) view.append(el("div", { class: "empty" }, el("b", { text: "Nothing found" }), "Try another name, like a drama title, channel or cartoon."));
  }

  const ROUTES = { home: viewHome, dramas: viewDramas, kids: viewKids, movies: viewMovies, world: viewWorld, mylist: viewList };
  const KID_ROUTES = ["home", "kids", "mylist"];
  function route() {
    let tab = (location.hash || "#home").slice(1);
    if (!ROUTES[tab]) tab = "home";
    if (kids && !KID_ROUTES.includes(tab)) tab = "kids";
    renderToken++;
    view.replaceChildren(...ROUTES[tab]().filter(Boolean));
    document.querySelectorAll("[data-tab]").forEach(a => {
      a.classList.toggle("active", a.dataset.tab === tab);
      a.hidden = kids && !KID_ROUTES.includes(a.dataset.tab);
    });
    window.scrollTo(0, 0);
  }

  /* ---------- player ---------- */
  const P = { root: $("#player"), frame: $("#playerFrame"), title: $("#playerTitle"), sub: $("#playerSub"), seg: $("#playerSeg"), list: $("#listBtn"), ext: $("#openExternal"), note: $("#playerNote"), desc: $("#playerDesc") };
  let current = null;

  function openPlayer(it, mode = "full") {
    current = it;
    P.title.textContent = it.title || it.name;
    P.desc.textContent = "";
    P.note.textContent = "";
    P.seg.hidden = it.type !== "ch";
    P.seg.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.mode === mode));
    if (it.type === "ch") {
      P.sub.textContent = it.lang;
      P.frame.src = `https://www.youtube-nocookie.com/embed/videoseries?list=${uploads(it.id, mode)}&rel=0&autoplay=1&playsinline=1`;
      P.ext.href = `https://www.youtube.com/channel/${it.id}`;
      P.ext.textContent = "Open channel on YouTube";
      P.note.textContent = `Playing the official ${mode === "shorts" ? "Shorts" : "uploads"} of ${it.name}. Use the playlist button in the player to pick an episode. If a video says “Watch on YouTube”, the channel only allows it on YouTube.`;
    } else if (it.type === "ia") {
      P.sub.textContent = [it.year, "Public domain"].filter(Boolean).join(" · ");
      P.frame.src = `https://archive.org/embed/${encodeURIComponent(it.id)}?autoplay=1`;
      P.ext.href = `https://archive.org/details/${encodeURIComponent(it.id)}`;
      P.ext.textContent = "Open on Internet Archive";
      P.desc.textContent = it.desc || "";
    } else if (it.type === "tmdb") {
      P.sub.textContent = [it.year, it.media === "tv" ? "Series" : "Movie", "Official trailer"].filter(Boolean).join(" · ");
      P.frame.src = "about:blank";
      P.desc.textContent = it.desc || "";
      P.ext.href = `https://www.themoviedb.org/${it.media}/${it.id}`;
      P.ext.textContent = "More info";
      loadTrailer(it);
    }
    updateListBtn();
    if (P.root.hidden) { P.root.hidden = false; document.body.style.overflow = "hidden"; history.pushState({ player: true }, ""); }
    if (it.type !== "tmdb") addRecent(it);
  }
  async function loadTrailer(it) {
    try {
      const [v, w] = await Promise.all([
        tmdb(`${it.media}/${it.id}/videos`),
        tmdb(`${it.media}/${it.id}/watch/providers`).catch(() => ({}))
      ]);
      if (current !== it) return;
      const vids = (v.results || []).filter(x => x.site === "YouTube");
      const pick = vids.find(x => x.type === "Trailer" && x.official) || vids.find(x => x.type === "Trailer") || vids[0];
      if (pick) P.frame.src = `https://www.youtube-nocookie.com/embed/${pick.key}?rel=0&autoplay=1&playsinline=1`;
      const reg = w.results?.PK || w.results?.US;
      const prov = [...(reg?.flatrate || []), ...(reg?.free || []), ...(reg?.ads || [])].map(p => p.provider_name);
      P.note.textContent = (pick ? "" : "No trailer available yet. ") + (prov.length ? `Watch the full ${it.media === "tv" ? "series" : "movie"} on: ${[...new Set(prov)].join(", ")}.` : "Full movie is available in cinemas or on official streaming services.");
    } catch (e) {
      P.note.textContent = "Could not load the trailer. Check your World cinema key in Settings.";
    }
  }
  function closePlayer(fromPop) {
    if (P.root.hidden) return;
    P.root.hidden = true; P.frame.src = "about:blank"; document.body.style.overflow = ""; current = null;
    if (!fromPop && history.state && history.state.player) history.back();
  }
  function addRecent(it) {
    const r = store.get("adm_recent", []).filter(x => keyOf(x) !== keyOf(it));
    r.unshift(slim(it)); store.set("adm_recent", r.slice(0, 14));
  }
  function slim(it) { const { type, id, media, title, name, year, img, lang, cat, src, tagText, desc } = it; return { type, id, media, title: title || name, name, year, img, lang, cat, src, tagText, desc: (desc || "").slice(0, 300) }; }
  function inList(it) { return store.get("adm_list", []).some(x => keyOf(x) === keyOf(it)); }
  function updateListBtn() { P.list.textContent = current && inList(current) ? "✓ In My List" : "+ Add to My List"; }

  P.list.addEventListener("click", () => {
    if (!current) return;
    let l = store.get("adm_list", []);
    if (inList(current)) { l = l.filter(x => keyOf(x) !== keyOf(current)); toast("Removed from My List"); }
    else { l.unshift(slim(current)); toast("Added to My List"); }
    store.set("adm_list", l); updateListBtn();
    if ((location.hash || "").slice(1) === "mylist") route();
  });
  P.seg.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b && current) openPlayer(current, b.dataset.mode); });
  $("#playerClose").addEventListener("click", () => closePlayer());
  window.addEventListener("popstate", () => { if (!P.root.hidden) closePlayer(true); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closePlayer(); closeSettings(); } });

  /* ---------- search ---------- */
  const bar = $("#searchBar"), input = $("#searchInput");
  $("#searchBtn").addEventListener("click", () => { bar.hidden = false; input.focus(); });
  $("#searchClose").addEventListener("click", () => { bar.hidden = true; input.value = ""; route(); });
  input.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const v = input.value.trim();
    searchTimer = setTimeout(() => { v.length >= 2 ? viewSearch(v) : route(); }, 400);
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

  window.addEventListener("hashchange", () => { bar.hidden = true; route(); });
  route();

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
