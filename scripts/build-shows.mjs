// Builds full episode lists for dramas/cartoons and a full movie list, using the
// YouTube Data API (official playlists of each channel). Needs env YT_API_KEY.
// Output:
//   data/shows.json            index of shows  [{ id, t, ch, cat, n, v, last }]
//   data/shows/<channelId>.json { <playlistId>: [[videoId, title, publishedAt], ...] }
//   data/movies.json           [{ id, t, p, ch }]
import { writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { CHANNELS } from "./channels.mjs";

const KEY = process.env.YT_API_KEY;
if (!KEY) { console.log("YT_API_KEY not set, skipping shows build."); process.exit(0); }

const API = "https://www.googleapis.com/youtube/v3/";
let units = 0;
async function api(path, params) {
  const url = API + path + "?" + new URLSearchParams({ ...params, key: KEY });
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url);
    units++;
    if (r.ok) return r.json();
    const body = await r.text();
    if (r.status === 403 && /quota/i.test(body)) throw new Error("Quota exceeded");
    if (r.status === 404) return { items: [] };
    await new Promise(res => setTimeout(res, 1000 * (i + 1)));
  }
  return { items: [] };
}

const DRAMA_CATS = ["pk", "tr", "web", "cn", "kr", "anime"];
const EP = /\b(episode|ep\.?|eps|قسط|第\s*\d+\s*集|\d+\s*회|full episode)\s*\d*/i;
const JUNK = /(short|promo|teaser|trailer|\bost\b|song|music|jukebox|highlight|best moment|best scene|\bbts\b|behind the scene|interview|clip|reaction|making|live|podcast|news|recap|status|what'?s new|new upload|coming up|coming soon|upcoming|latest|popular|trending|top \d|#|하이라이트|^\d{8}_)/i;
const FULL_MOVIE = /full movie|full film|फुल मूवी|डब्ड मूवी/i;
const SKIP_ITEM = /^(private video|deleted video)$/i;
const BLOCK = /\b(sex|sexy|nude|naked|18\+|hot scene|bold scene|bed scene|kiss scene)\b/i;

const LATIN = /[A-Za-z]{3,}/;
const NOISE = /^(full|multi ?sub|eng ?sub|on air now|watch on \w+|starring\b.*|official|hd|new)$/i;
function cleanTitle(t, chName) {
  const strip = (x) => x
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, " ")
    .replace(/\[[^\]]*\]|\([^)]*(sub|eng|dub|hd|official)[^)]*\)/gi, " ")
    .replace(/\b(all|full)\s+episodes?\b|\bepisodes?\b|\bfull\s+drama\b|\bofficial\b|\bplaylist\b|\beng\s*sub\b|\bmulti\s*sub\b|\bhd\b|\bwatch on \w+!?/gi, " ")
    .replace(new RegExp(chName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), " ")
    .replace(/\b(ary digital|hum tv|har pal geo|geo tv|green tv|trt drama urdu|youku|wetv|iqiyi|tencent video)\b/gi, " ")
    .replace(/\s+/g, " ").replace(/^[\s|•–—:：-]+|[\s|•–—:：-]+$/g, "").trim();
  // 1) An English name inside 【...】 is usually the show title.
  const br = [...t.matchAll(/【([^】]+)】/g)].map(m => m[1]).find(x => LATIN.test(x));
  const noCjkText = (x) => x.replace(/[　-鿿가-힯＀-￯]+/g, " ").replace(/\s+/g, " ").trim();
  if (br) return LATIN.test(noCjkText(br)) ? strip(noCjkText(br)) : strip(br);
  // 2) Otherwise the first segment that has real Latin words.
  const segs = t.split(/[|｜]/).map(x => strip(x.replace(/【[^】]*】/g, " "))).filter(x => x && !NOISE.test(x));
  const latinSeg = segs.find(x => LATIN.test(x));
  if (latinSeg) {
    const noCjk = latinSeg.replace(/[　-鿿가-힯＀-￯]+/g, " ").replace(/\s+/g, " ").trim();
    return LATIN.test(noCjk) ? noCjk : latinSeg;
  }
  return segs[0] || strip(t) || t.trim();
}
function epNum(t) {
  const m = t.match(/\b(?:episode|ep\.?)\s*0*(\d{1,4})/i) || t.match(/第\s*(\d+)\s*集/) || t.match(/(\d+)\s*회/) || t.match(/قسط\s*(\d+)/);
  return m ? +m[1] : null;
}

async function playlistItems(id, maxPages) {
  const out = [];
  let pageToken = "";
  for (let p = 0; p < maxPages; p++) {
    const d = await api("playlistItems", { part: "snippet,contentDetails", playlistId: id, maxResults: "50", ...(pageToken ? { pageToken } : {}) });
    for (const it of d.items || []) {
      const t = it.snippet?.title || "";
      const vid = it.contentDetails?.videoId;
      if (!vid || SKIP_ITEM.test(t) || BLOCK.test(t)) continue;
      out.push([vid, t, (it.contentDetails.videoPublishedAt || it.snippet.publishedAt || "").slice(0, 19)]);
    }
    pageToken = d.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

await mkdir("data/shows", { recursive: true });
const index = [], movies = [];
const dropped = new Set();   // shows replaced by a longer duplicate
const written = new Set();

for (const [ch, name, cat] of CHANNELS) {
  try {
    if (cat === "movies") {
      const items = await playlistItems("UU" + ch.slice(2), 6);
      for (const [id, t, p] of items) if (FULL_MOVIE.test(t)) movies.push({ id, t, p, ch });
      console.log(`${name}: ${items.filter(x => FULL_MOVIE.test(x[1])).length} full movies`);
      continue;
    }
    const pl = await api("playlists", { part: "snippet,contentDetails", channelId: ch, maxResults: "50" });
    const cands = (pl.items || [])
      .filter(p => (p.contentDetails?.itemCount || 0) >= 3 && !JUNK.test(p.snippet.title) && !BLOCK.test(p.snippet.title))
      .sort((a, b) => (b.snippet.publishedAt || "").localeCompare(a.snippet.publishedAt || ""))
      .slice(0, 14);
    const file = {};
    for (const p of cands) {
      let items = await playlistItems(p.id, 3);
      if (items.length < 3) continue;
      const epShare = items.filter(x => EP.test(x[1])).length / items.length;
      if (DRAMA_CATS.includes(cat) && epShare < 0.4) continue;       // keep real episode lists only
      items = items.filter(x => !/promo|teaser|trailer|#shorts|highlight|recap|best scene|best moment|behind the scene|bts|ost/i.test(x[1]));
      if (items.length < 3) continue;
      // Order: by episode number when titles have one, otherwise oldest first.
      const numbered = items.filter(x => epNum(x[1]) != null).length > items.length * 0.6;
      items.sort((a, b) => numbered ? (epNum(a[1]) ?? 1e9) - (epNum(b[1]) ?? 1e9) || a[2].localeCompare(b[2]) : a[2].localeCompare(b[2]));
      const last = items.reduce((m, x) => x[2] > m ? x[2] : m, "");
      let title = cleanTitle(p.snippet.title, name);
      if (/^starring/i.test(title) || title.length > 70) title = cleanTitle(items[0][1].split(/(?:episode|ep\.?)\s*\d/i)[0], name);
      if (["kids", "toons"].includes(cat) && !title.toLowerCase().includes(name.toLowerCase().split(" ")[0])) title = `${name}: ${title.replace(/^\(new\)\s*-?\s*/i, "")}`;
      if (title.length > 70) title = title.slice(0, 67).trim() + "...";
      const dup = index.find(x => x.cat === cat && x.t.toLowerCase() === title.toLowerCase());
      if (dup) { if (dup.n >= items.length) continue; index.splice(index.indexOf(dup), 1); dropped.add(dup.id); }
      file[p.id] = items;
      index.push({ id: p.id, t: title, ch, cat, n: items.length, v: ([...items].reverse().find(x => EP.test(x[1]) && !/highlight|recap|best/i.test(x[1])) || items[items.length - 1])[0], last });
    }
    if (Object.keys(file).length) {
      await writeFile(`data/shows/${ch}.json`, JSON.stringify(file));
      written.add(`${ch}.json`);
    }
    console.log(`${name}: ${Object.keys(file).length} shows`);
  } catch (e) {
    console.log(`${name}: error ${e.message}`);
    if (/quota/i.test(e.message)) break;
  }
}

// Remove files for channels that no longer have shows.
for (const f of await readdir("data/shows")) if (!written.has(f)) await unlink(`data/shows/${f}`);

index.sort((a, b) => b.last.localeCompare(a.last));
movies.sort((a, b) => b.p.localeCompare(a.p));
await writeFile("data/shows.json", JSON.stringify({ updated: new Date().toISOString(), shows: index }));
await writeFile("data/movies.json", JSON.stringify({ updated: new Date().toISOString(), movies }));
console.log(`Done: ${index.length} shows, ${movies.length} movies, ~${units} API units used.`);
