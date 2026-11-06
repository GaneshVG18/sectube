#!/usr/bin/env python3
"""Build videos.json for SecTube from each channel's public YouTube RSS feed.

Standard library only. Reads channel IDs from channels.json (the single source
of truth), fetches https://www.youtube.com/feeds/videos.xml?channel_id=<ID>
(the latest ~15 uploads), and writes videos.json sorted newest first.

Safety rules:
  * every request has a timeout; a failing channel is logged and skipped
  * a channel that fails keeps the videos it had in the previous videos.json
  * if *every* channel fails, videos.json is left untouched and we exit 1
  * the file is only rewritten when the video list actually changed, so the
    workflow's "commit if changed" step stays quiet on no-op runs

Usage:
  python3 scripts/build_feed.py                      # live fetch
  python3 scripts/build_feed.py --fixtures DIR       # read DIR/<channel_id>.xml instead
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FEED_URL = "https://www.youtube.com/feeds/videos.xml?channel_id={}"
USER_AGENT = "SecTube-feed-builder/1.0 (+https://github.com/; static site feed refresh)"

NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "yt": "http://www.youtube.com/xml/schemas/2015",
}
VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
CHANNEL_ID_RE = re.compile(r"^UC[A-Za-z0-9_-]{22}$")

MAX_BYTES = 5 * 1024 * 1024  # a channel feed is ~30-60 KB; refuse anything absurd
MAX_TITLE = 300
PER_CHANNEL = 15


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def warn(msg: str) -> None:
    # "::warning::" renders as an annotation in GitHub Actions, plain text elsewhere.
    prefix = "::warning::" if os.environ.get("GITHUB_ACTIONS") == "true" else "warning: "
    log(prefix + msg)


def to_utc_iso(value: str) -> str | None:
    """Normalise an Atom timestamp to 'YYYY-MM-DDTHH:MM:SSZ' (UTC), or None."""
    value = (value or "").strip()
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_feed(xml_bytes: bytes, expected_channel_id: str) -> list[dict]:
    """Parse one channel's Atom feed into video dicts.

    Every video is attributed to ``expected_channel_id`` (the ID from
    channels.json); a mismatching <yt:channelId> is logged, never trusted.
    Entries with a malformed video ID or date are dropped.
    """
    # Stdlib-only hardening (defusedxml would be a pip dependency): YouTube feeds
    # never carry a DTD, so refuse any document that declares one. That removes
    # entity-expansion / external-entity tricks before expat ever sees them.
    if b"<!DOCTYPE" in xml_bytes or b"<!ENTITY" in xml_bytes:
        raise ValueError("feed contains a DTD/entity declaration; refusing to parse")
    root = ET.fromstring(xml_bytes)
    videos: list[dict] = []
    for entry in root.findall("atom:entry", NS):
        vid = (entry.findtext("yt:videoId", default="", namespaces=NS) or "").strip()
        if not VIDEO_ID_RE.match(vid):
            continue
        published = to_utc_iso(entry.findtext("atom:published", default="", namespaces=NS))
        if not published:
            continue
        feed_cid = (entry.findtext("yt:channelId", default="", namespaces=NS) or "").strip()
        if feed_cid and CHANNEL_ID_RE.match(feed_cid) and feed_cid != expected_channel_id:
            warn(f"{expected_channel_id}: entry {vid} reports channel {feed_cid}; keeping {expected_channel_id}")
        title = " ".join((entry.findtext("atom:title", default="", namespaces=NS) or "").split())
        if not title:
            title = "Untitled video"
        href = ""
        for link in entry.findall("atom:link", NS):
            if link.get("rel", "alternate") == "alternate":
                href = link.get("href", "")
                break
        videos.append({
            "id": vid,
            "title": title[:MAX_TITLE],
            "published": published,
            "channelId": expected_channel_id,
            "short": "/shorts/" in href,
        })
    videos.sort(key=lambda v: v["published"], reverse=True)
    return videos[:PER_CHANNEL]


def fetch(url: str, timeout: float) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/atom+xml, application/xml;q=0.9"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 - fixed https URL
        if resp.status != 200:
            raise urllib.error.HTTPError(url, resp.status, "unexpected status", resp.headers, None)
        data = resp.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError("feed larger than %d bytes" % MAX_BYTES)
    return data


def load_channel_ids(path: Path) -> list[str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    channels = data["channels"] if isinstance(data, dict) else data
    ids: list[str] = []
    for ch in channels:
        cid = ch.get("id", "") if isinstance(ch, dict) else ""
        if not CHANNEL_ID_RE.match(cid):
            raise ValueError(f"invalid channel id in {path.name}: {cid!r}")
        if cid not in ids:
            ids.append(cid)
    if not ids:
        raise ValueError(f"no channels in {path.name}")
    return ids


def load_existing(path: Path) -> dict | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except (OSError, ValueError) as exc:
        warn(f"ignoring unreadable {path.name}: {exc}")
        return None
    if not isinstance(data, dict) or not isinstance(data.get("videos"), list):
        return None
    return data


def merge(channel_ids: list[str], fresh: dict[str, list[dict]], previous: dict | None) -> list[dict]:
    """Fresh results win; failed channels fall back to their previous videos."""
    old_by_channel: dict[str, list[dict]] = {}
    if previous:
        for v in previous.get("videos", []):
            if isinstance(v, dict) and v.get("channelId") in channel_ids and VIDEO_ID_RE.match(str(v.get("id", ""))):
                old_by_channel.setdefault(v["channelId"], []).append(v)
    seen: set[str] = set()
    out: list[dict] = []
    for cid in channel_ids:
        for v in fresh.get(cid, old_by_channel.get(cid, [])):
            if v["id"] in seen:
                continue
            seen.add(v["id"])
            out.append(v)
    out.sort(key=lambda v: (v["published"], v["id"]), reverse=True)
    return out


def write_atomic(path: Path, payload: dict) -> None:
    text = json.dumps(payload, ensure_ascii=False, indent=1) + "\n"
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=".videos.", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
        os.chmod(tmp, 0o644)  # mkstemp creates 0600; the site file should be world-readable
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--channels", type=Path, default=ROOT / "channels.json")
    ap.add_argument("--out", type=Path, default=ROOT / "videos.json")
    ap.add_argument("--fixtures", type=Path, help="read <dir>/<channel_id>.xml instead of fetching")
    ap.add_argument("--timeout", type=float, default=20.0, help="per-request timeout in seconds")
    ap.add_argument("--delay", type=float, default=0.5, help="pause between live requests in seconds")
    args = ap.parse_args(argv)

    try:
        channel_ids = load_channel_ids(args.channels)
    except (OSError, ValueError, KeyError, TypeError) as exc:
        log(f"error: cannot read channel list: {exc}")
        return 2

    fresh: dict[str, list[dict]] = {}
    failed: list[str] = []
    for i, cid in enumerate(channel_ids):
        try:
            if args.fixtures:
                data = (args.fixtures / f"{cid}.xml").read_bytes()
            else:
                if i:
                    time.sleep(args.delay)
                data = fetch(FEED_URL.format(cid), args.timeout)
            fresh[cid] = parse_feed(data, cid)
            log(f"ok    {cid}  {len(fresh[cid])} videos")
        except (OSError, ValueError, ET.ParseError, urllib.error.URLError) as exc:
            failed.append(cid)
            warn(f"skip  {cid}  {type(exc).__name__}: {exc}")

    if not fresh:
        log(f"error: all {len(channel_ids)} channel fetches failed; leaving {args.out.name} untouched")
        return 1

    previous = load_existing(args.out)
    videos = merge(channel_ids, fresh, previous)
    if previous is not None and previous.get("videos") == videos:
        log(f"no change: {len(videos)} videos ({len(failed)} channel(s) failed this run)")
        return 0

    payload = {
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "YouTube channel RSS feeds",
        "videos": videos,
    }
    write_atomic(args.out, payload)
    log(f"wrote {args.out.name}: {len(videos)} videos from {len(fresh)}/{len(channel_ids)} channels")
    return 0


if __name__ == "__main__":
    sys.exit(main())
