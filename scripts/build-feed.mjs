// Builds data/feed.json from the public YouTube RSS feeds of official channels.
// Runs in GitHub Actions every few hours, so the app always shows the newest uploads.
import { writeFile, readFile } from "node:fs/promises";

const CHANNELS = [
  ["UC4JCksJF76g_MdzPVBJoC3Q", "ARY Digital", "pk", "Urdu"],
  ["UCEeEQxm6qc_qaTE7qTV5aLQ", "HUM TV", "pk", "Urdu"],
  ["UCe9JSDmyqNgA_l2BzGHq1Ug", "Har Pal Geo", "pk", "Urdu"],
  ["UCF2ltLX1dnPa6-L1paPaMzw", "Green TV", "pk", "Urdu"],
  ["UCUhpu5MJQ_bjPkXO00jyxsw", "iQIYI", "cn", "Chinese"],
  ["UCI70JGG0hJS306Q-hGWfB7Q", "YOUKU English", "cn", "Chinese · EN subs"],
  ["UCiu3bj4rR8KOYcUA4KNkOAA", "WeTV English", "cn", "Chinese · EN subs"],
  ["UCQatgKoA7lylp_UzvsLCgcw", "Tencent Video", "cn", "Chinese"],
  ["UC5BMQOsAB8hKUyHu9KI6yig", "KBS World TV", "kr", "Korean · EN subs"],
  ["UCBAEVMr0li9YYF8IwZHfusw", "MBC Drama", "kr", "Korean"],
  ["UCkbJc8jMcTXwhtmN5VMwfXg", "JTBC Drama", "kr", "Korean"],
  ["UCNIiH_4ArJNd_cDZApZ7AFg", "TVING", "kr", "Korean"],
  ["UCkY3P2CPygbStNCFXE_vpxw", "TRT Drama Urdu", "tr", "Turkish · Urdu dubbed"],
  ["UCNJcSUSzUeFm8W9P7UUlSeQ", "TVF", "web", "Hindi web series"],
  ["UCTlnaHHQ75zlDg_fLr7tGEg", "The Timeliners", "web", "Hindi web series"],
  ["UCdxbhKxr8pyWTx1ExCSmJRw", "Girliyapa", "web", "Hindi web series"],
  ["UCC89oVFqenaffhBoyqxd6qw", "Dice Media", "web", "Hindi web series"],
  ["UCGbshtvS9t-8CW11W7TooQg", "Muse Asia", "anime", "Anime · official"],
  ["UC0wNSTMWIL3qaorLx0jie6A", "Ani-One Asia", "anime", "Anime · official"],
  ["UCAOtE1V7Ots4DjM8JLlrYgg", "Peppa Pig", "kids", "Little kids"],
  ["UCVzLLZkDuFGAE2BGdBuBNBg", "Bluey", "kids", "Little kids"],
  ["UCbCmjCuTUZos6Inko4u57UQ", "Cocomelon", "kids", "Rhymes"],
  ["UCcdwLMPsaU2ezNSJU1nFoBQ", "Pinkfong", "kids", "Rhymes"],
  ["UCSVSJ1OCSv5ClFgKFTHIDew", "PAW Patrol", "kids", "Little kids"],
  ["UCY2jUnU118sVkdj2xafiJ0g", "PJ Masks", "kids", "Little kids"],
  ["UCpYye8D5fFMUPf9nSfgd4bA", "BabyBus", "kids", "Learning"],
  ["UCu59yAFE8fM0sVNTipR4edw", "Masha and the Bear", "kids", "Cartoon"],
  ["UChULBXQf9VDYAi3vRLu_U-w", "Gecko's Garage", "kids", "Learning"],
  ["UCKAqou7V9FAWXpZd9xtOg3Q", "Little Baby Bum", "kids", "Rhymes"],
  ["UCgbfG5HoczHIkpzxLYH-8Ww", "Pokémon Kids TV", "toons", "Cartoon"],
  ["UC9trsD1jCTXXtN3xIOIU8gg", "WB Kids", "toons", "Tom & Jerry, Looney Tunes"],
  ["UCNEKMkg_DG8eAyR1BNWsSvw", "Oggy", "toons", "Cartoon"],
  ["UCcKJJuOe2tOqgrKw0Gks-sw", "Zig & Sharko", "toons", "Cartoon"],
  ["UCph-WGR0oCbJDpaWmNHb5zg", "Larva TUBA", "toons", "Cartoon"],
  ["UCkAGrHCLFmlK3H2kd6isipg", "Mr Bean", "toons", "Comedy for all"],
  ["UC8IHAQMuiJdY6ALuhG7iU8Q", "FilmRise Movies", "movies", "Free full movies · English"],
  ["UCyoXW-Dse7fURq30EWl_CUA", "Goldmines", "movies", "Free full movies · Hindi"],
  ["UCVFYikepF-avelvuIaQ_lHA", "Popcornflix", "movies", "Free full movies · English"]
];

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
await writeFile("data/feed.json", JSON.stringify({ updated: new Date().toISOString(), channels: out }));
