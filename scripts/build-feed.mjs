// Builds data/feed.json from the public YouTube RSS feeds of official channels.
// Runs in GitHub Actions every few hours, so the app always shows the newest uploads.
import { writeFile, readFile, readdir } from "node:fs/promises";
import { CHANNELS } from "./channels.mjs";


const UA = { "User-Agent": "Mozilla/5.0 (feed builder)", "Accept-Language": "en" };
const dec = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const BLOCK = /\b(sex|sexy|nude|naked|18\+|hot scene|bold scene|romance scene|kiss scene|bed scene)\b/i;

async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url, { headers: UA }); if (r.ok) return await r.text(); } catch {}
    await new Promise(r => setTimeout(r, 1500 * (i + 1)));
  }
  return "";
}
function parse(xml, max) {
  return xml.split("<entry>").slice(1).map(e => {
    const g = (re) => (e.match(re) || [])[1] || "";
    return {
      id: g(/<yt:videoId>([^<]+)/),
      t: dec(g(/<title>([^<]*)/)),
      p: g(/<published>([^<]+)/),
      v: +g(/views="(\d+)"/) || 0,
      d: dec(g(/<media:description>([\s\S]*?)<\/media:description>/)).replace(/\s+/g, " ").trim().slice(0, 220)
    };
  }).filter(x => x.id && !BLOCK.test(x.t)).slice(0, max);
}

let old = {};
try { old = JSON.parse(await readFile("data/feed.json", "utf8")); } catch {}
const oldById = Object.fromEntries((old.channels || []).map(c => [c.id, c]));

const out = [];
for (const [id, name, cat, lang] of CHANNELS) {
  const tail = id.slice(2);
  const [longX, shortX, page] = await Promise.all([
    get(`https://www.youtube.com/feeds/videos.xml?playlist_id=UULF${tail}`),
    get(`https://www.youtube.com/feeds/videos.xml?playlist_id=UUSH${tail}`),
    oldById[id]?.img ? Promise.resolve("") : get(`https://www.youtube.com/channel/${id}`)
  ]);
  let img = oldById[id]?.img || "";
  const og = page.match(/<meta property="og:image" content="([^"]+)"/);
  if (og) img = og[1].replace(/=s\d+[^"]*$/, "=s176-c-k-c0x00ffffff-no-rj");
  let videos = parse(longX, 15);
  if (cat === "movies") videos = videos.filter(v => /full movie|full film|फुल मूवी|डब्ड मूवी/i.test(v.t));  // skip clips and scenes
  let shorts = parse(shortX, 10).map(({ d, ...x }) => x);
  if (!videos.length && oldById[id]) videos = oldById[id].videos;   // keep last good data
  if (!shorts.length && oldById[id]) shorts = oldById[id].shorts || [];
  out.push({ id, name, cat, lang, img, videos, shorts });
  console.log(`${name}: ${videos.length} videos, ${shorts.length} shorts`);
}
// Tag each video with the drama/series (playlist) it belongs to, so the app can open the full episode list.
try {
  const { shows } = JSON.parse(await readFile("data/shows.json", "utf8"));
  const live = new Set(shows.map(s => s.id));
  const owner = new Map();
  for (const f of await readdir("data/shows")) {
    const lists = JSON.parse(await readFile(`data/shows/${f}`, "utf8"));
    for (const [pid, items] of Object.entries(lists)) if (live.has(pid)) for (const [vid] of items) if (!owner.has(vid)) owner.set(vid, pid);
  }
  for (const c of out) for (const v of c.videos) { const s = owner.get(v.id); if (s) v.s = s; else delete v.s; }
} catch { /* shows not built yet */ }

await writeFile("data/feed.json", JSON.stringify({ updated: new Date().toISOString(), channels: out }));
