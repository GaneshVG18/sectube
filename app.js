(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Inline fallback channel list. channels.json is the source of truth; this
  // copy (taken verbatim from the original single-file SecTube) is used when
  // the fetch fails, e.g. when index.html is opened straight from disk.
  // ---------------------------------------------------------------------------
  const FALLBACK_CATS = {
    web:   "Web & bug bounty",
    low:   "Exploitation & low-level",
    red:   "Pentest & red team",
    talks: "Conference talks",
    mine:  "My channels"
  };

  // Channel IDs verified against each channel page.
  const FALLBACK_CHANNELS = [
    { id: "UCkytgKNbJ0L1UuN1K27GAKA", name: "PortSwigger",              handle: "@PortSwiggerTV",            cat: "web",   desc: "Web security research from the makers of Burp Suite, plus Web Security Academy walkthroughs." },
    { id: "UCCZDt7MuC3Hzs6IH4xODLBw", name: "NahamSec",                 handle: "@NahamSec",                 cat: "web",   desc: "Bug bounty methodology, recon, and interviews with full-time hunters." },
    { id: "UCW6MNdOsqv2E9AjQkv9we7A", name: "PwnFunction",              handle: "@PwnFunction",              cat: "web",   desc: "Short animated explainers of web vulnerability classes." },
    { id: "UCZDyl7G-Lq-EMVO8PfDFp9g", name: "Bug Bounty Reports Explained", handle: "@BugBountyReportsExplained", cat: "web", desc: "Breakdowns of real disclosed bug bounty reports — how the bug was found and why it paid." },
    { id: "UC6zbKG1pqq2do-_oa9QFliA", name: "Critical Thinking",        handle: "@criticalthinkingpodcast",  cat: "web",   desc: "Technical bug bounty podcast: techniques, write-ups, and hunter workflows." },
    { id: "UCPiN9NPjIer8Do9gUFxKv7A", name: "InsiderPhD",               handle: "@InsiderPhD",               cat: "web",   desc: "Beginner-friendly bug bounty and API hacking." },
    { id: "UCQN2DsjnYH60SFBIA6IkNwg", name: "STÖK",                     handle: "@STOKfredrik",              cat: "web",   desc: "Bug bounty, recon, and hacker mindset." },

    { id: "UClcE-kVhqyiHCcjYwcpfj9w", name: "LiveOverflow",             handle: "@LiveOverflow",             cat: "low",   desc: "Binary exploitation, CTFs, and how security research actually works." },
    { id: "UCBaWwFw7KmCN8YlfX4ERYKg", name: "pwn.college",              handle: "@pwncollege",               cat: "low",   desc: "Free university-grade lectures on exploitation and system security." },
    { id: "UCc8gr33-DyCZ6gAmqdcyzgA", name: "Off By One Security",      handle: "@OffByOneSecurity",         cat: "low",   desc: "Exploit development and vulnerability research streams." },
    { id: "UC3S8vxwRfqLBdIhgRlDRVzw", name: "stacksmashing",            handle: "@stacksmashing",            cat: "low",   desc: "Hardware hacking and reverse engineering." },
    { id: "UC6biysICWOJ-C3P4Tyeggzg", name: "Low Level",                handle: "@LowLevelTV",               cat: "low",   desc: "Low-level programming and the security bugs that live there." },

    { id: "UCa6eh7gCkpPo5XXUDfygQQA", name: "IppSec",                   handle: "@ippsec",                   cat: "red",   desc: "Hack The Box machine walkthroughs — the classic pentest-practice channel." },
    { id: "UC0ArlFuFYMpEewyRBzdLHiw", name: "The Cyber Mentor (TCM)",   handle: "@TCMSecurityAcademy",       cat: "red",   desc: "Practical pentesting courses, including Active Directory attacks." },
    { id: "UCVeW9qkBjo3zosnqUbG7CFw", name: "John Hammond",             handle: "@_JohnHammond",             cat: "red",   desc: "CTFs, malware analysis, and general offensive security." },

    { id: "UC6Om9kAkl32dWlDSNlDS9Iw", name: "DEF CON",                  handle: "@DEFCONConference",         cat: "talks", desc: "Talks from DEF CON." },
    { id: "UCJ6q9Ie29ajGqKApbLqfBOg", name: "Black Hat",                handle: "@BlackHatOfficialYT",       cat: "talks", desc: "Briefings from Black Hat USA, Europe, and Asia." },
    { id: "UCMNvAtT4ak2azKNk6UlB1QQ", name: "OffensiveCon",             handle: "@OffensiveCon",             cat: "talks", desc: "Deep offensive research and exploitation talks." },
    { id: "UC2TXq_t06Hjdr2g_KdKpHQg", name: "media.ccc.de",             handle: "@mediacccde",               cat: "talks", desc: "Chaos Communication Congress and other CCC event talks." },
    { id: "UCI85JnsJEiKnkGiGBkqvZXw", name: "nullcon",                  handle: "@nullcon",                  cat: "talks", desc: "Talks from nullcon, the security conference in Goa." },
    { id: "UCe8j61ABYDuPTdtjItD2veA", name: "OWASP Foundation",         handle: "@OWASPGLOBAL",              cat: "talks", desc: "Application security conference talks." }
  ];

  const ID_RE = /^UC[\w-]{22}$/;
  const VID_RE = /^[\w-]{11}$/;
  const SHORT_LABEL = { web: "Web", low: "Low-level", red: "Red team", talks: "Talks", mine: "Mine" };
  const CAT_ICON = { web: "globe", low: "cpu", red: "target", talks: "mic", mine: "user" };
  const RECENT_MAX = 24;

  let CATS = Object.assign({}, FALLBACK_CATS);
  let CHANNELS = FALLBACK_CHANNELS.slice();
  let VIDEOS = [];                       // from videos.json, newest first
  let FEED_UPDATED = null;
  let videoById = new Map();
  let videosByChannel = new Map();

  // ---------- storage (best effort) ----------
  const store = {
    get(key, fallback) {
      try { const raw = localStorage.getItem("sectube:" + key); return raw ? JSON.parse(raw) : fallback; }
      catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem("sectube:" + key, JSON.stringify(value)); } catch (e) { /* ignore */ }
    }
  };
  const session = {
    get(key) { try { return sessionStorage.getItem("sectube:" + key); } catch (e) { return null; } },
    set(key, value) { try { sessionStorage.setItem("sectube:" + key, value); } catch (e) { /* ignore */ } }
  };

  const arr = (v) => (Array.isArray(v) ? v : []);
  const isEntry = (e) => !!e && typeof e === "object" &&
    (e.kind === "channel" ? typeof e.id === "string" : !!(e.vid || e.list));

  const state = {
    cat: "all",
    q: "",
    pinned: arr(store.get("pinned", [])).filter((x) => typeof x === "string"),     // channel ids
    recent: arr(store.get("recent", [])).filter(isEntry),                          // entries
    custom: arr(store.get("customChannels", [])).filter((c) => c && typeof c.id === "string" && ID_RE.test(c.id) && typeof c.name === "string"),
    queue: arr(store.get("queue", [])).filter(isEntry),                            // saved videos / playlists
    watched: new Set(arr(store.get("watched", [])).filter((x) => typeof x === "string" && VID_RE.test(x))),  // video ids you opened
    hideShorts: store.get("hideShorts", false) === true,
    current: null,
    latestLimit: 0,
    overlay: null
  };
  const WATCHED_MAX = 1000;

  // "New since last visit": the baseline is fixed for the whole tab session,
  // so reloading doesn't wipe the badges; lastVisit itself moves forward.
  let baseline = 0;
  {
    const s = session.get("visitBaseline");
    if (s !== null && s !== "") baseline = Number(s) || 0;
    else {
      const last = store.get("lastVisit", 0);
      baseline = typeof last === "number" ? last : 0;
      session.set("visitBaseline", String(baseline));
    }
    store.set("lastVisit", Date.now());
  }
  const isNew = (v) => baseline > 0 && !state.watched.has(v.id) && Date.parse(v.published) > baseline;
  const showV = (v) => !(state.hideShorts && v.short);

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const mqMobile = window.matchMedia("(max-width: 759px)");
  const mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const scrollBehavior = () => (mqReduce.matches ? "auto" : "smooth");

  const allChannels = () => CHANNELS.concat(state.custom);
  const channelById = (id) => allChannels().find((c) => c.id === id);
  const entryKey = (e) => e.kind === "channel" ? "c:" + e.id : "v:" + (e.vid || "") + "|" + (e.list || "");
  const entryChannelId = (e) => {
    if (!e) return null;
    if (e.kind === "channel") return e.id;
    if (e.channelId && ID_RE.test(e.channelId)) return e.channelId;
    const v = e.vid && videoById.get(e.vid);
    return v ? v.channelId : null;
  };
  const isSavedVid = (vid) => state.queue.some((e) => e.vid === vid && !e.list);

  // ---------- icons (inline SVG, no external requests) ----------
  const P = {
    home: '<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9v11.5h13V9"/><path d="M10 20.5v-6h4v6"/>',
    star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"/>',
    starFill: '<path fill="currentColor" d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"/>',
    bookmark: '<path d="M6.5 3.5h11v17L12 16.6l-5.5 3.9z"/>',
    bookmarkFill: '<path fill="currentColor" d="M6.5 3.5h11v17L12 16.6l-5.5 3.9z"/>',
    history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4v4.5H8"/><path d="M12 7.5V12l3 2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
    moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
    keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M7.5 14h9"/>',
    chevL: '<path d="m14.5 6-6 6 6 6"/>',
    chevR: '<path d="m9.5 6 6 6-6 6"/>',
    arrowR: '<path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5"/>',
    play: '<path fill="currentColor" stroke="none" d="M8 5.2v13.6c0 .8.9 1.3 1.6.8l10.3-6.8a1 1 0 0 0 0-1.6L9.6 4.4A1 1 0 0 0 8 5.2z"/>',
    external: '<path d="M14 4.5h5.5V10"/><path d="M19.5 4.5 11 13"/><path d="M18 14v4.5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1H10"/>',
    close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5s1.2-6.1 3.5-8.5z"/>',
    cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9.5 9.5h5v5h-5zM9.5 2.5V6M14.5 2.5V6M9.5 18v3.5M14.5 18v3.5M2.5 9.5H6M2.5 14.5H6M18 9.5h3.5M18 14.5h3.5"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
    terminal: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="m7 9.5 3 2.5-3 2.5M12.5 15H17"/>',
    trash: '<path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l.8 12.5a1 1 0 0 0 1 1h7.4a1 1 0 0 0 1-1L17.5 7M9 7V4.5h6V7"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    bolt: '<path d="M13 2.5 5 13.5h6.5l-1 8 8-11H12z"/>',
    list: '<path d="M4 6.5h11M4 12h11M4 17.5h7"/><path fill="currentColor" stroke="none" d="M17 14.5v6l4.5-3z"/>',
    share: '<path d="M12 3.5v11.5"/><path d="M7.5 8 12 3.5 16.5 8"/><path d="M5 12.5v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6"/>',
    sliders: '<path d="M4 7h9.5M18.5 7H20M4 17h3.5M12.5 17H20"/><circle cx="16" cy="7" r="2.5"/><circle cx="10" cy="17" r="2.5"/>',
    download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
    upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14"/>',
    link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>'
  };
  const icon = (name, cls) => `<svg class="ico${cls ? " " + cls : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name] || P.terminal}</svg>`;
  const catIcon = (k) => icon(CAT_ICON[k] || "terminal");
  const shortLabel = (k) => SHORT_LABEL[k] || String(CATS[k] || k).split(/[\s&]+/)[0];

  // ---------- avatars: gradient monograms ----------
  function avatar(name, size, ring) {
    let h = 0; for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    const initials = String(name).replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
    return `<span class="avatar g${h % 6}${size ? " " + size : ""}${ring ? " ring" : ""}" aria-hidden="true">${esc(initials)}</span>`;
  }

  // ---------- time ----------
  const rtf = typeof Intl !== "undefined" && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat("en", { numeric: "always" }) : null;
  const UNITS = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
  function timeAgo(iso) {
    const t = Date.parse(iso); if (!t) return "";
    const secs = (Date.now() - t) / 1000;
    for (const [unit, size] of UNITS) {
      if (secs >= size) {
        const n = Math.floor(secs / size);
        return rtf ? rtf.format(-n, unit) : n + " " + unit + (n === 1 ? "" : "s") + " ago";
      }
    }
    return "just now";
  }

  // ---------- embed URLs ----------
  const NOCOOKIE = "https://www.youtube-nocookie.com/embed/";
  function embedUrl(e) {
    if (e.kind === "channel") return NOCOOKIE + "videoseries?list=UU" + e.id.slice(2) + "&rel=0";
    if (e.vid) return NOCOOKIE + e.vid + "?autoplay=1&rel=0" + (e.list ? "&list=" + encodeURIComponent(e.list) : "");
    return NOCOOKIE + "videoseries?list=" + encodeURIComponent(e.list) + "&rel=0";
  }
  function youtubeUrl(e) {
    if (e.kind === "channel") return "https://www.youtube.com/channel/" + e.id + "/videos";
    if (e.vid) return "https://www.youtube.com/watch?v=" + e.vid + (e.list ? "&list=" + encodeURIComponent(e.list) : "");
    return "https://www.youtube.com/playlist?list=" + encodeURIComponent(e.list);
  }
  const thumbUrl = (vid) => "https://i.ytimg.com/vi/" + vid + "/mqdefault.jpg";

  // ---------- link parsing ----------
  function parseYouTube(input) {
    const s = input.trim();
    if (!s) return null;
    if (/^[\w-]{11}$/.test(s)) return { kind: "video", vid: s };
    if (/^UC[\w-]{22}$/.test(s)) return { kind: "channel", id: s };
    let u;
    try { u = new URL(/^https?:\/\//i.test(s) ? s : "https://" + s); } catch (e) { return null; }
    const host = u.hostname.replace(/^(www|m|music)\./, "");
    let vid = null;
    const list = u.searchParams.get("list");
    if (host === "youtu.be") {
      vid = u.pathname.slice(1).split("/")[0];
    } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      const ch = u.pathname.match(/^\/channel\/(UC[\w-]{22})/);
      if (ch) return { kind: "channel", id: ch[1] };
      if (u.pathname.startsWith("/@")) return { kind: "handle" };
      if (u.pathname === "/watch") vid = u.searchParams.get("v");
      else {
        const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([\w-]{11})/);
        if (m) vid = m[2];
      }
    } else {
      return null;
    }
    if (vid && !/^[\w-]{11}$/.test(vid)) vid = null;
    if (!vid && !list) return null;
    return { kind: vid ? "video" : "playlist", vid, list: list || null };
  }

  // ---------- data loading ----------
  async function fetchJSON(url, ms) {
    if (location.protocol === "file:") return null;  // fetch can't read file:// — use the fallback quietly
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), ms) : 0;
    try {
      const res = await fetch(url, { cache: "no-cache", signal: ctl ? ctl.signal : undefined });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  function applyChannels(data) {
    if (!data || typeof data !== "object" || !Array.isArray(data.channels)) return false;
    const chans = data.channels.filter((c) => c && ID_RE.test(c.id) && typeof c.name === "string");
    if (!chans.length) return false;
    CHANNELS = chans.map((c) => ({ id: c.id, name: c.name, handle: String(c.handle || ""), cat: String(c.cat || ""), desc: String(c.desc || "") }));
    if (data.categories && typeof data.categories === "object" && !Array.isArray(data.categories)) CATS = Object.assign({}, data.categories);
    if (!CATS.mine) CATS.mine = "My channels";
    return true;
  }
  function applyVideos(data) {
    if (!data || !Array.isArray(data.videos)) return false;
    const known = new Set(CHANNELS.map((c) => c.id));
    const seen = new Set();
    const list = [];
    for (const v of data.videos) {
      if (!v || !VID_RE.test(v.id) || !known.has(v.channelId) || seen.has(v.id)) continue;
      const t = Date.parse(v.published);
      if (!t) continue;
      seen.add(v.id);
      list.push({ id: v.id, title: String(v.title || "Untitled video").slice(0, 300), published: v.published, t, channelId: v.channelId, short: !!v.short });
    }
    if (!list.length) return false;
    list.sort((a, b) => b.t - a.t);
    VIDEOS = list;
    videoById = new Map(list.map((v) => [v.id, v]));
    videosByChannel = new Map();
    for (const v of list) {
      if (!videosByChannel.has(v.channelId)) videosByChannel.set(v.channelId, []);
      videosByChannel.get(v.channelId).push(v);
    }
    FEED_UPDATED = typeof data.updated_at === "string" ? data.updated_at : null;
    return true;
  }
  const hasFeed = () => VIDEOS.length > 0;
  const feed = () => VIDEOS.filter(showV);
  const chanVideos = (id) => (videosByChannel.get(id) || []).filter(showV);
  const videosInCat = (k) => VIDEOS.filter((v) => { if (!showV(v)) return false; const c = channelById(v.channelId); return c && c.cat === k; });

  // ---------- toast ----------
  let toastTimer = 0;
  function toast(msg, ic) {
    const t = $("#toast");
    t.innerHTML = icon(ic || "check") + "<span>" + esc(msg) + "</span>";
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  // ---------- player ----------
  // Swap in a fresh iframe instead of changing src: re-pointing a loaded iframe
  // adds a joint-session-history entry, which would make the Android back
  // button step the YouTube frame back instead of closing the player.
  function setFrame(url) {
    const old = $("#frame");
    const f = document.createElement("iframe");
    for (const a of ["id", "title", "allow", "referrerpolicy"]) { const v = old.getAttribute(a); if (v !== null) f.setAttribute(a, v); }
    f.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    f.setAttribute("allowfullscreen", "");
    if (url) f.src = url;
    old.replaceWith(f);
  }
  function play(entry) {
    const wasOpen = !!state.current;
    state.current = entry;
    const cid = entryChannelId(entry);
    const ch = cid ? channelById(cid) : null;
    const feedV = entry.vid ? videoById.get(entry.vid) : null;
    const isChannel = entry.kind === "channel";

    setFrame(embedUrl(entry));
    $("#pTitle").textContent = isChannel ? (ch ? ch.name + " — latest uploads" : "Channel")
      : (entry.title || (feedV && feedV.title) || (entry.kind === "playlist" ? "Saved playlist" : "Saved video"));
    $("#pAvatar").innerHTML = ch ? avatar(ch.name, "", state.pinned.includes(ch.id))
      : `<span class="avatar g2" aria-hidden="true">${icon(entry.kind === "playlist" ? "list" : "play", "sm")}</span>`;
    $("#pChanName").textContent = ch ? ch.name : (entry.kind === "playlist" ? "Playlist" : "Video");
    $("#pSub").textContent = isChannel
      ? ((ch && CATS[ch.cat]) || "") + (ch && ch.handle ? " · " + ch.handle : "")
      : [ch && CATS[ch.cat], feedV && timeAgo(feedV.published), entry.list ? "in a playlist" : ""].filter(Boolean).join(" · ") || (entry.kind === "playlist" ? "Saved playlist" : "Saved video");
    $("#pHint").innerHTML = isChannel
      ? "Playing this channel's latest uploads. Use the <b>playlist icon</b> in the player to jump to any video."
      : "";
    $("#pPin").hidden = !ch;
    $("#pSave").hidden = isChannel;
    updatePlayerButtons();
    $("#pOpen").href = youtubeUrl(entry);
    $("#player").hidden = false;
    $("#page").classList.add("watching");

    const rec = isChannel ? { kind: "channel", id: entry.id }
      : { kind: entry.kind, vid: entry.vid || null, list: entry.list || null, title: entry.title || (feedV && feedV.title) || "" };
    if (!isChannel && cid) rec.channelId = cid;
    state.recent = [rec].concat(state.recent.filter((e) => entryKey(e) !== entryKey(rec))).slice(0, RECENT_MAX);
    store.set("recent", state.recent);
    if (entry.vid && VID_RE.test(entry.vid)) { state.watched.delete(entry.vid); state.watched.add(entry.vid); saveWatched(); }

    const hs = { sectube: 1, player: true, overlay: null };
    try { if (wasOpen) history.replaceState(hs, ""); else history.pushState(hs, ""); } catch (e) { /* ignore */ }

    render();
    renderUpNext();
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
  }
  function saveWatched() {
    while (state.watched.size > WATCHED_MAX) state.watched.delete(state.watched.values().next().value);  // oldest first
    store.set("watched", Array.from(state.watched));
  }
  async function copyLink(url) {
    try { await navigator.clipboard.writeText(url); toast("Link copied", "link"); }
    catch (e) { toast("Couldn't copy the link — use Open on YouTube", "close"); }
  }
  async function shareCurrent() {
    const e = state.current; if (!e) return;
    const url = youtubeUrl(e);
    const title = $("#pTitle").textContent || "SecTube";
    if (typeof navigator.share === "function") {
      try { await navigator.share({ title, url }); }
      catch (err) { if (!err || err.name !== "AbortError") copyLink(url); }
      return;
    }
    copyLink(url);
  }
  function closePlayer() {
    setFrame(null);
    $("#player").hidden = true;
    $("#page").classList.remove("watching");
    state.current = null;
  }
  function requestClosePlayer() {
    if (!state.current) return;
    const s = history.state;
    if (s && s.sectube && s.player && !s.overlay) history.back();   // popstate does the close
    else closePlayer();
  }
  function updatePlayerButtons() {
    const e = state.current; if (!e) return;
    const cid = entryChannelId(e);
    const pinned = !!cid && state.pinned.includes(cid);
    const b = $("#pPin");
    b.innerHTML = icon(pinned ? "starFill" : "star") + (pinned ? "Pinned" : "Pin channel");
    b.classList.toggle("on", pinned);
    b.setAttribute("aria-pressed", String(pinned));
    if (e.kind !== "channel") {
      const saved = state.queue.some((q) => entryKey(q) === entryKey(e));
      const s = $("#pSave");
      s.innerHTML = icon(saved ? "bookmarkFill" : "bookmark") + (saved ? "Saved" : "Save");
      s.classList.toggle("on", saved);
      s.setAttribute("aria-pressed", String(saved));
    }
    const ch = cid && channelById(cid);
    if (ch) $("#pAvatar").innerHTML = avatar(ch.name, "", pinned);
  }
  function togglePin(id) {
    const c = channelById(id);
    const was = state.pinned.includes(id);
    state.pinned = was ? state.pinned.filter((x) => x !== id) : [id].concat(state.pinned);
    store.set("pinned", state.pinned);
    updatePlayerButtons();
    render();
    toast((was ? "Unpinned " : "Pinned ") + (c ? c.name : "channel"), was ? "star" : "starFill");
  }
  function toggleSaveEntry(entry) {
    const k = entryKey(entry);
    const i = state.queue.findIndex((e) => entryKey(e) === k);
    if (i >= 0) { state.queue.splice(i, 1); toast("Removed from Saved", "trash"); }
    else { state.queue.unshift(entry); toast("Saved", "bookmarkFill"); }
    store.set("queue", state.queue);
    updatePlayerButtons();
    render();
  }

  // ---------- rendering: cards ----------
  function videoCard(v) {
    const ch = channelById(v.channelId);
    const saved = isSavedVid(v.id);
    const seen = state.watched.has(v.id);
    const badges = (seen ? '<span class="badge seen">Watched</span>' : isNew(v) ? '<span class="badge new">New</span>' : "") + (v.short ? '<span class="badge short">Short</span>' : "");
    return `<article class="vcard">
      <button type="button" class="thumb${seen ? " seen" : ""}" data-play-vid="${esc(v.id)}" aria-label="Play ${esc(v.title)}${seen ? " (watched)" : ""}">
        <img loading="lazy" decoding="async" src="${thumbUrl(v.id)}" alt="">
        ${badges ? `<span class="badges">${badges}</span>` : ""}
        <span class="play-ov"><span>${icon("play")}</span></span>
      </button>
      <div class="vmeta">
        ${ch ? avatar(ch.name, "sm", state.pinned.includes(ch.id)) : ""}
        <div class="vtext">
          <button type="button" class="vtitle" data-play-vid="${esc(v.id)}" title="${esc(v.title)}">${esc(v.title)}</button>
          <div class="vsub"><span class="ch">${esc(ch ? ch.name : "")}</span><time datetime="${esc(v.published)}">${esc(timeAgo(v.published))}</time></div>
        </div>
        <button type="button" class="icon-btn${saved ? " on" : ""}" data-save-vid="${esc(v.id)}" aria-pressed="${saved}" aria-label="${saved ? "Remove from Saved" : "Save video"}" title="${saved ? "Saved" : "Save"}">${icon(saved ? "bookmarkFill" : "bookmark")}</button>
      </div>
    </article>`;
  }
  // Saved / recently watched videos & playlists (index-based, like the original).
  function entryCard(e, idx, src) {
    const removable = src === "queue";
    const cid = entryChannelId(e);
    const ch = cid && channelById(cid);
    const fv = e.vid && videoById.get(e.vid);
    const title = e.title || (fv && fv.title) || (e.kind === "playlist" ? "Saved playlist" : "Saved video");
    const vidOk = e.vid && VID_RE.test(e.vid);
    const sub = [ch ? ch.name : (e.kind === "playlist" ? "Playlist" : (e.list ? "Video · playlist" : "Video")), fv ? timeAgo(fv.published) : ""].filter(Boolean);
    return `<article class="vcard">
      <button type="button" class="thumb${vidOk && state.watched.has(e.vid) ? " seen" : ""}" data-play-video="${idx}" data-src="${src}" aria-label="Play ${esc(title)}">
        ${vidOk ? `<img loading="lazy" decoding="async" src="${thumbUrl(e.vid)}" alt="">` : `<span class="thumb-ph">${icon("list", "lg")}<span>Playlist</span></span>`}
        <span class="play-ov"><span>${icon("play")}</span></span>
      </button>
      <div class="vmeta">
        ${ch ? avatar(ch.name, "sm", state.pinned.includes(ch.id)) : ""}
        <div class="vtext">
          <button type="button" class="vtitle" data-play-video="${idx}" data-src="${src}">${esc(title)}</button>
          <div class="vsub"><span class="ch">${esc(sub[0])}</span>${sub[1] ? `<span class="t">${esc(sub[1])}</span>` : ""}</div>
        </div>
        ${removable ? `<button type="button" class="icon-btn" data-remove-video="${idx}" aria-label="Remove ${esc(title)} from Saved" title="Remove">${icon("close")}</button>` : ""}
      </div>
    </article>`;
  }
  function channelCard(c) {
    const pinned = state.pinned.includes(c.id);
    const latest = chanVideos(c.id)[0];
    return `<article class="ccard">
      <button type="button" class="chead" data-play-channel="${esc(c.id)}" aria-label="Watch ${esc(c.name)}">
        ${avatar(c.name, "lg", pinned)}
        <span class="t"><span class="cname">${esc(c.name)}</span><span class="handle">${esc(c.handle || "/channel/" + c.id.slice(0, 8) + "…")}</span></span>
      </button>
      <span class="tag">${esc(CATS[c.cat] || "")}</span>
      <p class="desc">${esc(c.desc || "")}</p>
      ${latest ? `<p class="clatest"><span>latest · ${esc(timeAgo(latest.published))}</span></p>` : ""}
      <div class="crow">
        <button type="button" class="btn primary sm" data-play-channel="${esc(c.id)}">${icon("play")}Watch</button>
        <button type="button" class="btn sm${pinned ? " on" : ""}" data-pin="${esc(c.id)}" aria-pressed="${pinned}">${icon(pinned ? "starFill" : "star")}${pinned ? "Pinned" : "Pin"}</button>
        ${c.cat === "mine" ? `<button type="button" class="btn sm" data-remove-channel="${esc(c.id)}" aria-label="Remove ${esc(c.name)}" title="Remove">${icon("trash")}</button>` : ""}
      </div>
    </article>`;
  }
  function recentCard(e) {
    const idx = state.recent.indexOf(e);
    if (e.kind === "channel") { const c = channelById(e.id); return c ? channelCard(c) : ""; }
    return entryCard(e, idx, "recent");
  }

  // ---------- rendering: layout pieces ----------
  function head(title, kicker, extra, tools) {
    return `<header class="sec-head">
      <div><p class="kicker">~/<b>${esc(kicker)}</b></p><h2>${esc(title)}${extra || ""}</h2></div>
      ${tools ? `<div class="sec-tools">${tools}</div>` : ""}
    </header>`;
  }
  const countBadge = (n) => ` <span class="count">${String(n).padStart(2, "0")}</span>`;
  function shelf(title, kicker, items, opts) {
    opts = opts || {};
    if (!items.length) return "";
    const tools = (opts.viewAll ? `<button type="button" class="link-btn" data-cat="${esc(opts.viewAll)}">View all${icon("chevR", "sm")}</button>` : "")
      + `<button type="button" class="shelf-nav" data-shelf-dir="-1" aria-label="Scroll ${esc(title)} left">${icon("chevL")}</button>`
      + `<button type="button" class="shelf-nav" data-shelf-dir="1" aria-label="Scroll ${esc(title)} right">${icon("chevR")}</button>`;
    return `<section class="section">${head(title, kicker, opts.extra || countBadge(opts.count ?? items.length), tools)}
      <div class="shelf${opts.channels ? " channels" : ""}" role="region" aria-label="${esc(title)}"><div class="shelf-track">${items.join("")}</div></div></section>`;
  }
  function gridSection(title, kicker, items, opts) {
    opts = opts || {};
    return `<section class="section">${head(title, kicker, opts.extra || countBadge(opts.count ?? items.length), opts.tools)}
      <div class="grid${opts.channels ? " channels" : ""}">${items.join("")}</div>${opts.after || ""}</section>`;
  }
  function emptyState(ic, title, text, cta) {
    return `<div class="empty"><div class="em-ico">${icon(ic)}</div><h2>${esc(title)}</h2><p>${text}</p>${cta ? `<div class="em-cta">${cta}</div>` : ""}</div>`;
  }
  const kickerFor = (k) => ({ web: "web", low: "low-level", red: "red-team", talks: "talks", mine: "mine" }[k] || k);

  // ---------- rendering: navigation ----------
  const NAV_MAIN = [["all", "Home", "home", "Home"], ["pinned", "Pinned", "star", "Pinned"], ["queue", "Saved", "bookmark", "Saved"], ["recent", "Recently watched", "history", "History"]];
  function visibleCats() { return Object.keys(CATS).filter((k) => k !== "mine" || state.custom.length); }
  function renderNav() {
    const count = { pinned: state.pinned.filter((id) => channelById(id)).length, queue: state.queue.length, recent: state.recent.length };
    const item = (k, label, ic, short, n) => `<button type="button" class="side-item${state.cat === k ? " active" : ""}" data-cat="${esc(k)}"${state.cat === k ? ' aria-current="page"' : ""} title="${esc(label)}">
      ${ic}<span class="lbl">${esc(label)}</span><span class="short">${esc(short)}</span>${n ? `<span class="n">${n}</span>` : ""}</button>`;
    $("#side").innerHTML =
      `<div class="side-group">${NAV_MAIN.map(([k, l, ic, s]) => item(k, l, icon(ic), s, count[k])).join("")}
         <button type="button" class="side-item" data-action="settings" title="Settings">${icon("sliders")}<span class="lbl">Settings</span><span class="short">Settings</span></button></div>
       <div class="side-group"><p class="side-label">Categories</p>${visibleCats().map((k) => item(k, CATS[k], catIcon(k), shortLabel(k), allChannels().filter((c) => c.cat === k).length)).join("")}</div>
       <p class="side-foot">Press <kbd class="kbd">?</kbd> for shortcuts.<br>Pins, history and saves live in this browser only.</p>`;

    const chips = [["all", "All"], ["pinned", "★ Pinned"]].concat(visibleCats().map((k) => [k, CATS[k]]));
    if (state.queue.length) chips.push(["queue", "Saved videos"]);
    if (state.recent.length) chips.push(["recent", "History"]);
    const searching = !!state.q.trim();   // search covers everything, so no chip is "the" scope
    $("#chips").innerHTML = chips.map(([k, label]) => {
      const on = !searching && state.cat === k;
      return `<button type="button" class="chip${on ? " active" : ""}" data-cat="${esc(k)}" aria-pressed="${on}">${esc(label)}</button>`;
    }).join("");

    $$(".tab[data-cat]").forEach((t) => {
      const on = t.dataset.cat === state.cat;
      t.classList.toggle("active", on);
      if (on) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current");
    });
  }

  // ---------- rendering: views ----------
  function renderHome() {
    let html = "";
    if (hasFeed()) {
      const all = feed();
      const lim = state.latestLimit || (mqMobile.matches ? 6 : 12);
      const nNew = all.filter(isNew).length;
      const age = FEED_UPDATED ? Date.now() - Date.parse(FEED_UPDATED) : 0;
      if (age > 36 * 3600e3) {
        html += `<div class="notice" role="note">${icon("bolt")}<p><b>The video feed last changed ${esc(timeAgo(FEED_UPDATED))}.</b>
          YouTube's RSS feeds may be having trouble, so newer uploads can be missing here — tap any channel's <b>Watch</b> to play its live uploads list.</p></div>`;
      }
      const more = all.length > lim ? `<div class="more-row"><button type="button" class="btn" data-action="more-latest">Show more</button></div>` : "";
      html += gridSection("Latest", "latest", all.slice(0, lim).map(videoCard), {
        extra: nNew ? ` <span class="pill-new">${nNew} new</span>` : countBadge(all.length), after: more
      });
    }
    const pinned = state.pinned.map(channelById).filter(Boolean);
    html += shelf("Pinned", "pinned", pinned.map(channelCard), { channels: true, viewAll: "pinned" });
    html += shelf("Recently watched", "history", state.recent.slice(0, 12).map(recentCard).filter(Boolean), { viewAll: "recent", count: state.recent.length });
    if (state.queue.length) html += shelf("Saved videos", "saved", state.queue.map((e, i) => entryCard(e, i, "queue")), { viewAll: "queue" });
    for (const k of Object.keys(CATS)) {
      const chans = allChannels().filter((c) => c.cat === k);
      if (!chans.length) continue;
      const vids = k === "mine" ? [] : videosInCat(k).slice(0, 16);
      html += vids.length
        ? shelf(CATS[k], kickerFor(k), vids.map(videoCard), { viewAll: k, extra: ` <span class="count">${chans.length} channel${chans.length === 1 ? "" : "s"}</span>` })
        : shelf(CATS[k], kickerFor(k), chans.map(channelCard), { channels: true, viewAll: k });
    }
    return html;
  }
  function renderCategory(k) {
    const chans = allChannels().filter((c) => c.cat === k);
    if (!chans.length) return emptyState(CAT_ICON[k] || "terminal", "Nothing here yet", "No channels in this category.", `<button type="button" class="btn" data-cat="all">Back to Home</button>`);
    if (!hasFeed() || k === "mine") return gridSection(CATS[k], kickerFor(k), chans.map(channelCard), { channels: true });
    let html = `<section class="section">${head(CATS[k], kickerFor(k), countBadge(chans.length))}</section>`;
    for (const c of chans) {
      const vids = chanVideos(c.id);
      const pinned = state.pinned.includes(c.id);
      html += `<section class="chan-block">
        <div class="chan-row">${avatar(c.name, "lg", pinned)}
          <div class="info"><div class="name">${esc(c.name)}</div><div class="sub"><span class="mono">${esc(c.handle)}</span>${c.desc ? " · " + esc(c.desc) : ""}</div></div>
          <div class="acts">
            <button type="button" class="btn sm" data-play-channel="${esc(c.id)}" aria-label="Watch all uploads from ${esc(c.name)}">${icon("list")}<span class="lbl">All uploads</span></button>
            <button type="button" class="btn sm${pinned ? " on" : ""}" data-pin="${esc(c.id)}" aria-pressed="${pinned}" aria-label="${pinned ? "Unpin" : "Pin"} ${esc(c.name)}">${icon(pinned ? "starFill" : "star")}<span class="lbl">${pinned ? "Pinned" : "Pin"}</span></button>
            ${vids.length > 1 ? shelfArrows(c.name) : ""}
          </div>
        </div>
        ${vids.length ? shelfBare(c.name, vids.map(videoCard)) : `<p class="empty-inline">No recent uploads in the feed — use <b>All uploads</b> to browse the channel.</p>`}
      </section>`;
    }
    return html;
  }
  function shelfBare(label, items) {
    return `<div class="shelf" role="region" aria-label="${esc(label)} videos"><div class="shelf-track">${items.join("")}</div></div>`;
  }
  function shelfArrows(label) {
    return `<button type="button" class="shelf-nav" data-shelf-dir="-1" aria-label="Scroll ${esc(label)} left">${icon("chevL")}</button>`
      + `<button type="button" class="shelf-nav" data-shelf-dir="1" aria-label="Scroll ${esc(label)} right">${icon("chevR")}</button>`;
  }
  function renderPinned(q) {
    const pinned = state.pinned.map(channelById).filter(Boolean).filter((c) => matchChannel(c, q));
    if (!pinned.length) {
      return q ? noResults()
        : emptyState("star", "No pinned channels yet", "Pin the channels you watch most and they'll sit at the top of Home with a red ring.",
          `<button type="button" class="btn primary" data-cat="all">${icon("home")}Browse channels</button>`);
    }
    let html = gridSection("Pinned", "pinned", pinned.map(channelCard), { channels: true });
    if (hasFeed()) {
      const ids = new Set(pinned.map((c) => c.id));
      const vids = feed().filter((v) => ids.has(v.channelId) && matchVideo(v, q)).slice(0, 24);
      if (vids.length) html += gridSection("Latest from pinned", "pinned/latest", vids.map(videoCard));
    }
    return html;
  }
  function renderQueue(q) {
    const items = state.queue.map((e, i) => [e, i]).filter(([e]) => matchEntry(e, q));
    if (!state.queue.length) {
      return emptyState("bookmark", "Nothing saved yet", "Save talks and videos to watch later — paste a link, or tap the bookmark on any video.",
        `<button type="button" class="btn primary" data-action="add">${icon("plus")}Add a video</button>`);
    }
    if (!items.length) return noResults();
    return gridSection("Saved videos", "saved", items.map(([e, i]) => entryCard(e, i, "queue")));
  }
  function renderRecent(q) {
    if (!state.recent.length) {
      return emptyState("history", "No history yet", "Channels and videos you play show up here, newest first.",
        `<button type="button" class="btn primary" data-cat="all">${icon("home")}Browse channels</button>`);
    }
    const items = state.recent.filter((e) => matchEntry(e, q));
    if (!items.length) return noResults();
    return gridSection("Recently watched", "history", items.map(recentCard).filter(Boolean), {
      tools: `<button type="button" class="link-btn" data-action="clear-recent">${icon("trash", "sm")}Clear history</button>`
    });
  }
  const ytSearchUrl = () => "https://www.youtube.com/results?search_query=" + encodeURIComponent(state.q.trim());
  function searchElsewhere(primary) {
    return `<a class="btn${primary ? " primary" : ""}" href="${esc(ytSearchUrl())}" target="_blank" rel="noopener">${icon("search")}Search YouTube for “${esc(state.q.trim())}”${icon("external", "sm")}</a>
      <button type="button" class="btn" data-action="add">${icon("plus")}Add a channel</button>`;
  }
  function renderSearch(q) {
    const chans = allChannels().filter((c) => matchChannel(c, q));
    const vids = feed().filter((v) => matchVideo(v, q)).slice(0, 60);
    const feedIds = new Set(vids.map((v) => v.id));
    const saved = state.queue.map((e, i) => [e, i]).filter(([e]) => matchEntry(e, q) && !feedIds.has(e.vid));
    const recent = state.recent.filter((e) => e.kind !== "channel" && matchEntry(e, q) && !feedIds.has(e.vid) && !state.queue.some((x) => entryKey(x) === entryKey(e)));
    const total = chans.length + vids.length + saved.length + recent.length;
    if (!total) return noResults();
    let html = `<section class="section"><header class="sec-head"><div><p class="kicker">~/<b>search</b></p>
      <h2>Results for “${esc(state.q.trim())}”${countBadge(total)}</h2></div></header>
      <p class="search-scope">Searching all ${allChannels().length} SecTube channels${hasFeed() ? " and " + feed().length + " recent videos" : ""}, plus your saved videos and history.</p></section>`;
    if (chans.length) html += gridSection("Channels", "search/channels", chans.map(channelCard), { channels: true });
    if (vids.length) html += gridSection("Videos", "search/videos", vids.map(videoCard));
    if (saved.length) html += gridSection("Saved videos", "search/saved", saved.map(([e, i]) => entryCard(e, i, "queue")));
    if (recent.length) html += gridSection("Recently watched", "search/history", recent.map(recentCard).filter(Boolean));
    html += `<div class="search-more"><p>Not what you wanted? SecTube only searches its own channels — YouTube search opens in a new tab.</p><div class="em-cta">${searchElsewhere(false)}</div></div>`;
    return html;
  }
  function noResults() {
    return emptyState("search", "No matches in SecTube",
      `“${esc(state.q.trim())}” isn't one of your ${allChannels().length} channels or their recent videos. Search YouTube instead, or add the channel with its <b>/channel/UC…</b> link.`,
      searchElsewhere(true) + `<button type="button" class="btn ghost" data-action="clear-search">Clear search</button>`);
  }
  const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const squash = (s) => s.replace(/[\s@._\-–—]+/g, "");
  function textMatch(text, q) {
    const t = norm(text);
    if (t.includes(q)) return true;
    const sq = squash(q);
    return sq.length > 0 && squash(t).includes(sq);
  }
  function matchChannel(c, q) { return !q || textMatch([c.name, c.handle, c.desc, CATS[c.cat]].join(" "), q); }
  function matchVideo(v, q) { if (!q) return true; const c = channelById(v.channelId); return textMatch(v.title + " " + (c ? c.name + " " + c.handle : ""), q); }
  function matchEntry(e, q) {
    if (!q) return true;
    if (e.kind === "channel") { const c = channelById(e.id); return !!c && matchChannel(c, q); }
    const fv = e.vid && videoById.get(e.vid); const c = channelById(entryChannelId(e));
    return textMatch([e.title, fv && fv.title, c && c.name].join(" "), q);
  }

  function render() {
    renderNav();
    const q = norm(state.q.trim());
    let html;
    if (q) html = renderSearch(q);
    else if (state.cat === "queue") html = renderQueue(q);
    else if (state.cat === "recent") html = renderRecent(q);
    else if (state.cat === "pinned") html = renderPinned(q);
    else if (CATS[state.cat]) html = renderCategory(state.cat);
    else { state.cat = "all"; html = renderHome(); renderNav(); }
    $("#content").innerHTML = html;
    if (state.current) renderUpNext();
    $("#feedInfo").textContent = hasFeed() ? `feed · ${VIDEOS.length} videos${FEED_UPDATED ? " · updated " + timeAgo(FEED_UPDATED) : ""}` : "feed · channel uploads mode";
    requestAnimationFrame(updateAllShelfNavs);
  }

  // ---------- up next ----------
  function unVideo(v) {
    const c = channelById(v.channelId);
    return `<button type="button" class="un-item" data-play-vid="${esc(v.id)}">
      <span class="un-thumb${state.watched.has(v.id) ? " seen" : ""}"><img loading="lazy" decoding="async" src="${thumbUrl(v.id)}" alt="">${isNew(v) ? '<span class="badge new">New</span>' : ""}</span>
      <span class="un-text"><span class="un-title">${esc(v.title)}</span><span class="un-sub">${esc(c ? c.name : "")} · ${esc(timeAgo(v.published))}</span></span></button>`;
  }
  function unChannel(c) {
    return `<button type="button" class="un-item ch" data-play-channel="${esc(c.id)}">${avatar(c.name, "sm", state.pinned.includes(c.id))}
      <span class="un-text"><span class="un-title">${esc(c.name)}</span><span class="un-sub mono">${esc(c.handle || CATS[c.cat] || "")}</span></span></button>`;
  }
  function renderUpNext() {
    const e = state.current; if (!e) return;
    const cid = entryChannelId(e);
    const ch = cid && channelById(cid);
    let html = "";
    if (ch) {
      const vids = hasFeed() ? videosInCat(ch.cat).filter((v) => v.id !== e.vid) : [];
      const same = vids.filter((v) => v.channelId === ch.id).slice(0, 3);
      const rest = vids.filter((v) => v.channelId !== ch.id).slice(0, 10 - same.length);
      const list = same.concat(rest).sort((a, b) => b.t - a.t);
      if (list.length) html += `<div class="un-list">${list.map(unVideo).join("")}</div>`;
      const others = allChannels().filter((c) => c.cat === ch.cat && c.id !== ch.id);
      if (others.length) html += `<h3>More in ${esc(CATS[ch.cat] || "this category")}</h3><div class="un-list">${others.map(unChannel).join("")}</div>`;
    } else {
      const saved = state.queue.map((q, i) => [q, i]).filter(([q]) => entryKey(q) !== entryKey(e)).slice(0, 6);
      if (saved.length) html += `<h3>Saved</h3><div class="un-list">${saved.map(([q, i]) => {
        const t = q.title || (q.kind === "playlist" ? "Saved playlist" : "Saved video");
        return `<button type="button" class="un-item" data-play-video="${i}" data-src="queue"><span class="un-thumb">${q.vid && VID_RE.test(q.vid) ? `<img loading="lazy" src="${thumbUrl(q.vid)}" alt="">` : `<span class="thumb-ph">${icon("list")}</span>`}</span>
          <span class="un-text"><span class="un-title">${esc(t)}</span><span class="un-sub">${q.kind === "playlist" ? "Playlist" : "Video"}</span></span></button>`;
      }).join("")}</div>`;
      if (hasFeed()) html += `<h3>Latest</h3><div class="un-list">${feed().filter((v) => v.id !== e.vid).slice(0, 8).map(unVideo).join("")}</div>`;
      else html += `<h3>Channels</h3><div class="un-list">${allChannels().slice(0, 8).map(unChannel).join("")}</div>`;
    }
    $("#upnext").innerHTML = html || `<p class="empty-inline">Nothing queued.</p>`;
  }

  // ---------- shelves: arrow buttons ----------
  function updateShelfNav(sh) {
    const sec = sh.closest(".section, .chan-block"); if (!sec) return;
    const [prev, next] = $$(".shelf-nav", sec);
    if (!prev || !next) return;
    prev.disabled = sh.scrollLeft <= 2;
    next.disabled = sh.scrollLeft + sh.clientWidth >= sh.scrollWidth - 2;
  }
  function updateAllShelfNavs() { $$(".shelf").forEach(updateShelfNav); }
  let shelfRaf = 0;
  document.addEventListener("scroll", (ev) => {
    const t = ev.target;
    if (!(t instanceof Element) || !t.classList.contains("shelf")) return;
    cancelAnimationFrame(shelfRaf);
    shelfRaf = requestAnimationFrame(() => updateShelfNav(t));
  }, { capture: true, passive: true });
  window.addEventListener("resize", () => requestAnimationFrame(updateAllShelfNavs), { passive: true });

  // ---------- overlays (add dialog, help) with Android-back support ----------
  const OVERLAYS = { add: "#scrim", help: "#helpScrim", settings: "#settingsScrim" };
  let lastFocus = null;
  function showOverlay(name) {
    if (state.overlay && state.overlay !== name) hideOverlay(state.overlay);
    lastFocus = document.activeElement;
    state.overlay = name;
    $(OVERLAYS[name]).hidden = false;
    document.body.style.overflow = "hidden";
    const hs = { sectube: 1, player: !!state.current, overlay: name };
    try {
      const s = history.state;
      if (s && s.sectube && s.overlay) history.replaceState(hs, ""); else history.pushState(hs, "");
    } catch (e) { /* ignore */ }
  }
  function hideOverlay(name) {
    const el = $(OVERLAYS[name]);
    if (!el || el.hidden) return;
    el.hidden = true;
    if (state.overlay === name) state.overlay = null;
    document.body.style.overflow = "";
    if (lastFocus && document.contains(lastFocus) && typeof lastFocus.focus === "function") lastFocus.focus({ preventScroll: true });
  }
  function closeOverlay(name) {
    const s = history.state;
    if (s && s.sectube && s.overlay === name) history.back();   // popstate hides it
    else hideOverlay(name);
  }
  window.addEventListener("popstate", () => {
    const s = history.state || {};
    for (const n of Object.keys(OVERLAYS)) if (s.overlay !== n) hideOverlay(n);
    if (!s.player && state.current) closePlayer();
  });
  // Focus trap for open dialogs.
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Tab" || !state.overlay) return;
    const root = $(OVERLAYS[state.overlay]);
    const f = $$("button, input, select, a[href], [tabindex]:not([tabindex='-1'])", root).filter((el) => !el.disabled && el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  });

  // ---------- add dialog ----------
  function openAdd(prefill) {
    $("#addCat").innerHTML = Object.entries(CATS).map(([k, v]) => `<option value="${esc(k)}" ${k === "mine" ? "selected" : ""}>${esc(v)}</option>`).join("");
    $("#addUrl").value = prefill || ""; $("#addName").value = ""; $("#addErr").textContent = "";
    updateAddPreview();
    showOverlay("add");
    setTimeout(() => $("#addUrl").focus(), 0);
  }
  function closeAdd() { closeOverlay("add"); }

  function updateAddPreview() {
    const raw = $("#addUrl").value;
    const p = parseYouTube(raw);
    const det = $("#addDetect"), txt = $("#addDetectText");
    const pv = $("#addPreview");
    let tone = "", label = "", submit = "Add", nameLbl = "Name / title", namePh = "e.g. Orange Tsai – ProxyLogon talk";
    $("#addErr").textContent = "";
    if (!raw.trim()) { det.hidden = true; }
    else if (!p) { tone = "bad"; label = "Not a YouTube video, playlist or channel link"; }
    else if (p.kind === "handle") { tone = "warn"; label = "@handle — needs channel ID"; }
    else if (p.kind === "channel") {
      const existing = channelById(p.id);
      tone = existing ? "warn" : "ok";
      label = existing ? "Channel already in SecTube: " + existing.name : "Channel detected · " + p.id;
      submit = "Add channel"; nameLbl = "Channel name (required)"; namePh = "e.g. Orange Tsai";
    } else if (p.kind === "video") {
      tone = "ok"; label = p.list ? "Video detected · in a playlist" : "Video detected"; submit = "Save video"; nameLbl = "Title (optional)";
    } else { tone = "ok"; label = "Playlist detected"; submit = "Save playlist"; nameLbl = "Title (optional)"; }
    if (raw.trim()) { det.hidden = false; det.dataset.tone = tone; txt.textContent = label; }

    if (p && p.kind === "video" && p.vid) {
      const fv = videoById.get(p.vid);
      const img = $("#addThumb");
      const src = thumbUrl(p.vid);
      if (img.getAttribute("src") !== src) { img.hidden = false; img.src = src; }
      $("#addPrevTitle").textContent = fv ? fv.title : ($("#addName").value.trim() || "Video preview");
      $("#addPrevId").textContent = (fv ? (channelById(fv.channelId) || {}).name + " · " : "") + "v=" + p.vid + (p.list ? " · list=" + p.list : "");
      if (fv && !$("#addName").value) namePh = fv.title;
      pv.hidden = false;
    } else {
      pv.hidden = true;
    }
    $("#catWrap").hidden = !(p && p.kind === "channel");
    $("#addSubmit").textContent = submit;
    $("#addNameLbl").textContent = nameLbl;
    $("#addName").placeholder = namePh;
  }
  $("#addThumb").addEventListener("error", (ev) => { ev.target.hidden = true; });
  $("#addUrl").addEventListener("input", updateAddPreview);
  $("#addName").addEventListener("input", () => {
    const p = parseYouTube($("#addUrl").value);
    if (p && p.kind === "video" && !videoById.get(p.vid)) $("#addPrevTitle").textContent = $("#addName").value.trim() || "Video preview";
  });

  $("#addForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const parsed = parseYouTube($("#addUrl").value);
    let name = $("#addName").value.trim();
    const err = (m) => { $("#addErr").textContent = m; };
    if (!parsed) return err("That doesn't look like a YouTube video, playlist, or /channel/UC… link.");
    if (parsed.kind === "handle") return err("@handle links need the channel ID instead — see the note above.");
    if (parsed.kind === "channel") {
      if (!name) return err("Give the channel a name.");
      if (channelById(parsed.id)) return err("That channel is already in SecTube.");
      state.custom.push({ id: parsed.id, name, handle: "", cat: $("#addCat").value, desc: "Added by you." });
      store.set("customChannels", state.custom);
      toast("Channel added: " + name, "check");
    } else {
      const fv = parsed.vid && videoById.get(parsed.vid);
      if (!name && fv) name = fv.title;
      const entry = { kind: parsed.kind, vid: parsed.vid || null, list: parsed.list, title: name };
      if (fv) entry.channelId = fv.channelId;
      if (state.queue.some((e) => entryKey(e) === entryKey(entry))) return err("Already saved.");
      state.queue.unshift(entry);
      store.set("queue", state.queue);
      toast(parsed.kind === "playlist" ? "Playlist saved" : "Saved", "bookmarkFill");
    }
    closeAdd();
    render();
  });
  $("#addCancel").addEventListener("click", closeAdd);
  $("#addX").addEventListener("click", closeAdd);
  $("#scrim").addEventListener("click", (ev) => { if (ev.target === $("#scrim")) closeAdd(); });
  $("#addBtn").addEventListener("click", () => openAdd());

  // ---------- help ----------
  const openHelp = () => { showOverlay("help"); setTimeout(() => $("#helpX").focus(), 0); };
  $("#helpBtn").addEventListener("click", openHelp);
  $("#helpX").addEventListener("click", () => closeOverlay("help"));
  $("#helpScrim").addEventListener("click", (ev) => { if (ev.target === $("#helpScrim")) closeOverlay("help"); });

  // ---------- theme ----------
  function applyTheme(t) {
    const light = t === "light";
    document.documentElement.setAttribute("data-theme", light ? "light" : "dark");
    const meta = $('meta[name="theme-color"]'); if (meta) meta.setAttribute("content", light ? "#ffffff" : "#0b0b0c");
    const b = $("#themeBtn");
    b.innerHTML = icon(light ? "moon" : "sun");
    b.setAttribute("aria-label", light ? "Switch to dark theme" : "Switch to light theme");
    b.title = light ? "Dark theme (t)" : "Light theme (t)";
    $$("[data-theme-set]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.themeSet === (light ? "light" : "dark"))));
  }
  function toggleTheme(force) {
    const cur = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    const next = force === "light" || force === "dark" ? force : (cur === "light" ? "dark" : "light");
    if (next === cur) return;
    store.set("theme", next);
    applyTheme(next);
    toast(next === "light" ? "Light theme" : "Dark theme", next === "light" ? "sun" : "moon");
  }
  $("#themeBtn").addEventListener("click", () => toggleTheme());

  // ---------- settings ----------
  function fillSettings() {
    $("#setShorts").checked = state.hideShorts;
    const nNew = feed().filter(isNew).length;
    $("#setNewInfo").textContent = !hasFeed() ? "Needs the video feed." : nNew ? nNew + " new since your last visit." : "You're all caught up.";
    const shorts = VIDEOS.filter((v) => v.short).length;
    $("#setFeedInfo").textContent = hasFeed()
      ? `feed · ${VIDEOS.length} videos (${shorts} Shorts) · last changed ${FEED_UPDATED ? timeAgo(FEED_UPDATED) : "unknown"}`
      : "feed · videos.json not available — channels play their uploads list";
    $("#setHistInfo").textContent = `${state.watched.size} video${state.watched.size === 1 ? "" : "s"} marked watched · ${state.recent.length} in Recently watched.`;
  }
  function openSettings() { fillSettings(); showOverlay("settings"); setTimeout(() => $("#setX").focus(), 0); }
  $("#setX").addEventListener("click", () => closeOverlay("settings"));
  $("#settingsScrim").addEventListener("click", (ev) => { if (ev.target === $("#settingsScrim")) closeOverlay("settings"); });
  $("#setShorts").addEventListener("change", (ev) => {
    state.hideShorts = ev.target.checked;
    store.set("hideShorts", state.hideShorts);
    state.latestLimit = 0;
    render(); fillSettings();
    toast(state.hideShorts ? "Shorts hidden" : "Shorts shown", "check");
  });

  // Backup / restore. Import merges into what's here and never deletes anything.
  function exportBackup() {
    const data = {
      app: "sectube", version: 1, exported_at: new Date().toISOString(),
      pinned: state.pinned, recent: state.recent, customChannels: state.custom, queue: state.queue,
      watched: Array.from(state.watched), hideShorts: state.hideShorts
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = "sectube-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast("Backup exported", "download");
  }
  const clip = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");
  function cleanEntry(e) {
    if (!e || typeof e !== "object") return null;
    if (e.kind === "channel") return typeof e.id === "string" && ID_RE.test(e.id) ? { kind: "channel", id: e.id } : null;
    const vid = typeof e.vid === "string" && VID_RE.test(e.vid) ? e.vid : null;
    const list = typeof e.list === "string" && /^[\w-]{2,100}$/.test(e.list) ? e.list : null;
    if (!vid && !list) return null;
    const out = { kind: vid ? "video" : "playlist", vid, list, title: clip(e.title, 300) };
    if (typeof e.channelId === "string" && ID_RE.test(e.channelId)) out.channelId = e.channelId;
    return out;
  }
  function importBackup(d) {
    if (!d || typeof d !== "object" || d.app !== "sectube") return null;
    const n = { pins: 0, saved: 0, channels: 0 };
    for (const c of arr(d.customChannels)) {
      if (!c || typeof c.id !== "string" || !ID_RE.test(c.id) || typeof c.name !== "string" || !c.name.trim() || channelById(c.id)) continue;
      state.custom.push({ id: c.id, name: clip(c.name.trim(), 100), handle: clip(c.handle, 60), cat: CATS[c.cat] ? c.cat : "mine", desc: clip(c.desc, 300) || "Added by you." });
      n.channels++;
    }
    for (const id of arr(d.pinned)) if (typeof id === "string" && ID_RE.test(id) && !state.pinned.includes(id)) { state.pinned.push(id); n.pins++; }
    for (const raw of arr(d.queue)) {
      const e = cleanEntry(raw);
      if (e && e.kind !== "channel" && !state.queue.some((q) => entryKey(q) === entryKey(e))) { state.queue.push(e); n.saved++; }
    }
    for (const raw of arr(d.recent)) {
      const e = cleanEntry(raw);
      if (e && !state.recent.some((q) => entryKey(q) === entryKey(e))) state.recent.push(e);
    }
    state.recent = state.recent.slice(0, RECENT_MAX);
    for (const v of arr(d.watched)) if (typeof v === "string" && VID_RE.test(v)) state.watched.add(v);
    store.set("customChannels", state.custom); store.set("pinned", state.pinned); store.set("queue", state.queue); store.set("recent", state.recent);
    saveWatched();
    render(); fillSettings();
    return n;
  }
  $("#importFile").addEventListener("change", async (ev) => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { toast("That file is too large to be a SecTube backup", "close"); return; }
    let data;
    try { data = JSON.parse(await f.text()); } catch (e) { toast("That isn't a valid backup file", "close"); return; }
    const r = importBackup(data);
    if (!r) { toast("That isn't a SecTube backup", "close"); return; }
    toast(`Imported ${r.pins} pin${r.pins === 1 ? "" : "s"}, ${r.saved} saved, ${r.channels} channel${r.channels === 1 ? "" : "s"}`, "upload");
  });

  // ---------- navigation ----------
  function navigate(cat) {
    const changed = state.cat !== cat;
    state.cat = cat;
    state.latestLimit = 0;
    render();
    if (!changed) return;
    if (state.current && mqMobile.matches) $("#chips").scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    else if (!state.current) window.scrollTo({ top: 0, behavior: "auto" });
  }

  // ---------- events ----------
  document.addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-cat],[data-play-channel],[data-pin],[data-play-video],[data-play-vid],[data-save-vid],[data-remove-video],[data-remove-channel],[data-action],[data-shelf-dir],[data-theme-set]");
    if (!t) return;
    const d = t.dataset;
    if (d.themeSet) { toggleTheme(d.themeSet); return; }
    if (d.cat) { if (state.q.trim()) { state.q = ""; $("#q").value = ""; state.cat = ""; } navigate(d.cat); return; }
    if (d.playChannel) { play({ kind: "channel", id: d.playChannel }); return; }
    if (d.pin) { togglePin(d.pin); return; }
    if (d.playVid) {
      const v = videoById.get(d.playVid);
      if (v) play({ kind: "video", vid: v.id, list: null, title: v.title, channelId: v.channelId });
      return;
    }
    if (d.saveVid) {
      const v = videoById.get(d.saveVid);
      if (v) toggleSaveEntry({ kind: "video", vid: v.id, list: null, title: v.title, channelId: v.channelId });
      return;
    }
    if (d.playVideo !== undefined) {
      const list = d.src === "queue" ? state.queue : state.recent;
      const e = list[Number(d.playVideo)];
      if (e) play(e);
      return;
    }
    if (d.removeVideo !== undefined) {
      const [gone] = state.queue.splice(Number(d.removeVideo), 1);
      store.set("queue", state.queue);
      updatePlayerButtons();
      render();
      if (gone) toast("Removed from Saved", "trash");
      return;
    }
    if (d.removeChannel) {
      const id = d.removeChannel;
      const c = channelById(id);
      state.custom = state.custom.filter((x) => x.id !== id);
      state.pinned = state.pinned.filter((x) => x !== id);
      state.recent = state.recent.filter((e) => !(e.kind === "channel" && e.id === id));
      store.set("customChannels", state.custom); store.set("pinned", state.pinned); store.set("recent", state.recent);
      if (state.current && state.current.id === id) requestClosePlayer();
      render();
      toast("Removed " + (c ? c.name : "channel"), "trash");
      return;
    }
    if (d.shelfDir) {
      const sec = t.closest(".section, .chan-block");
      const sh = sec && sec.querySelector(".shelf");
      if (sh) sh.scrollBy({ left: Number(d.shelfDir) * sh.clientWidth * 0.85, behavior: scrollBehavior() });
      return;
    }
    switch (d.action) {
      case "add": openAdd(); break;
      case "more-latest": state.latestLimit = (state.latestLimit || (mqMobile.matches ? 6 : 12)) + (mqMobile.matches ? 6 : 12); render(); break;
      case "clear-search": state.q = ""; $("#q").value = ""; render(); break;
      case "clear-recent": state.recent = []; store.set("recent", state.recent); render(); toast("History cleared", "trash"); break;
      case "settings": openSettings(); break;
      case "mark-seen":
        baseline = Date.now(); session.set("visitBaseline", String(baseline));
        render(); fillSettings(); toast("All caught up", "check"); break;
      case "export": exportBackup(); break;
      case "import": $("#importFile").click(); break;
      case "clear-watched":
        state.watched.clear(); state.recent = []; saveWatched(); store.set("recent", state.recent);
        render(); fillSettings(); toast("Watch history cleared", "trash"); break;
    }
  });
  $("#pPin").addEventListener("click", () => { const cid = entryChannelId(state.current); if (cid) togglePin(cid); });
  $("#pSave").addEventListener("click", () => {
    const e = state.current; if (!e || e.kind === "channel") return;
    const entry = { kind: e.kind, vid: e.vid || null, list: e.list || null, title: e.title || "" };
    const cid = entryChannelId(e); if (cid) entry.channelId = cid;
    toggleSaveEntry(entry);
  });
  $("#pClose").addEventListener("click", requestClosePlayer);
  $("#pShare").addEventListener("click", shareCurrent);
  $("#home").addEventListener("click", () => {
    state.cat = "all"; state.q = ""; $("#q").value = ""; state.latestLimit = 0;
    requestClosePlayer(); render(); window.scrollTo({ top: 0, behavior: "auto" });
  });
  $("#searchForm").addEventListener("submit", (ev) => { ev.preventDefault(); $("#q").blur(); });
  $("#q").addEventListener("input", (ev) => { state.q = ev.target.value; render(); });
  document.addEventListener("keydown", (ev) => {
    const ae = document.activeElement;
    const typing = !!ae && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName);
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === "/" && !typing && !state.overlay) { ev.preventDefault(); $("#q").focus(); return; }
    if (ev.key === "?" && !typing) { ev.preventDefault(); if (state.overlay === "help") closeOverlay("help"); else if (!state.overlay) openHelp(); return; }
    if ((ev.key === "t" || ev.key === "T") && !typing && !state.overlay) { toggleTheme(); return; }
    if (ev.key === "," && !typing && !state.overlay) { ev.preventDefault(); openSettings(); return; }
    if (ev.key === "Escape") {
      if (state.overlay) { closeOverlay(state.overlay); return; }
      if (typing) { if (ae === $("#q")) ae.blur(); return; }
      requestClosePlayer();
    }
  });
  const setPlaceholder = () => { $("#q").placeholder = mqMobile.matches ? "Search" : "Search channels and videos"; };
  mqMobile.addEventListener?.("change", () => { state.latestLimit = 0; setPlaceholder(); render(); });
  setPlaceholder();

  // ---------- boot ----------
  $$("[data-icon]").forEach((el) => { el.outerHTML = icon(el.dataset.icon); });
  applyTheme(document.documentElement.getAttribute("data-theme"));
  try { const s = history.state; if (s && s.sectube) history.replaceState(null, ""); } catch (e) { /* ignore */ }

  (async () => {
    const [ch, vids] = await Promise.all([fetchJSON("channels.json", 6000), fetchJSON("videos.json", 8000)]);
    applyChannels(ch);
    applyVideos(vids);
    render();
  })();
})();
