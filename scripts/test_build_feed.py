#!/usr/bin/env python3
"""Offline tests for build_feed.py (stdlib unittest, no network).

Run:  python3 scripts/test_build_feed.py
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import build_feed  # noqa: E402

FIX = HERE / "fixtures"
REAL_CID = "UCkytgKNbJ0L1UuN1K27GAKA"  # PortSwigger, from channels.json
EDGE_CID = "UCxxxxxxxxxxxxxxxxxxxxxx"


class ParseFeed(unittest.TestCase):
    def test_real_sample(self):
        vids = build_feed.parse_feed((FIX / f"{REAL_CID}.xml").read_bytes(), REAL_CID)
        self.assertEqual(len(vids), 3)
        for v in vids:
            self.assertRegex(v["id"], r"^[A-Za-z0-9_-]{11}$")
            self.assertEqual(v["channelId"], REAL_CID)
            self.assertRegex(v["published"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$")
            self.assertTrue(v["title"])
        self.assertEqual([v["published"] for v in vids], sorted((v["published"] for v in vids), reverse=True))

    def test_edge_cases(self):
        vids = build_feed.parse_feed((FIX / "edge_cases.xml").read_bytes(), EDGE_CID)
        by_id = {v["id"]: v for v in vids}
        self.assertEqual(set(by_id), {"AAAAAAAAAAA", "BBBBBBBBBBB", "DDDDDDDDDDD"})
        self.assertEqual(by_id["AAAAAAAAAAA"]["title"], "Older video with odd whitespace")
        self.assertTrue(by_id["BBBBBBBBBBB"]["short"])
        self.assertFalse(by_id["AAAAAAAAAAA"]["short"])
        self.assertEqual(by_id["BBBBBBBBBBB"]["published"], "2024-06-01T10:00:00Z")  # +02:00 -> UTC
        self.assertEqual(by_id["BBBBBBBBBBB"]["title"], "A short & sweet clip")
        self.assertEqual(by_id["DDDDDDDDDDD"]["title"], "Untitled video")
        self.assertEqual(vids[0]["id"], "BBBBBBBBBBB")  # newest first

    def test_refuses_dtd(self):
        evil = b'<?xml version="1.0"?><!DOCTYPE f [<!ENTITY a "x">]><feed xmlns="http://www.w3.org/2005/Atom"/>'
        with self.assertRaises(ValueError):
            build_feed.parse_feed(evil, REAL_CID)


class Main(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.channels = self.tmp / "channels.json"
        self.out = self.tmp / "videos.json"
        self.fixdir = self.tmp / "fx"
        self.fixdir.mkdir()

    def write_channels(self, ids):
        self.channels.write_text(json.dumps({"categories": {}, "channels": [{"id": i} for i in ids]}))

    def run_main(self):
        return build_feed.main(["--channels", str(self.channels), "--out", str(self.out), "--fixtures", str(self.fixdir)])

    def test_all_fail_keeps_existing_file(self):
        self.write_channels([REAL_CID])  # no fixture file -> every "fetch" fails
        self.out.write_text('{"videos": [{"id": "keepme"}]}')
        self.assertEqual(self.run_main(), 1)
        self.assertEqual(self.out.read_text(), '{"videos": [{"id": "keepme"}]}')

    def test_partial_failure_keeps_previous_videos_for_failed_channel(self):
        other = "UC" + "y" * 22
        self.write_channels([REAL_CID, other])
        (self.fixdir / f"{REAL_CID}.xml").write_bytes((FIX / f"{REAL_CID}.xml").read_bytes())
        old = {"id": "ZZZZZZZZZZZ", "title": "old", "published": "2020-01-01T00:00:00Z", "channelId": other, "short": False}
        gone = {"id": "YYYYYYYYYYY", "title": "removed channel", "published": "2020-01-01T00:00:00Z", "channelId": "UC" + "q" * 22, "short": False}
        self.out.write_text(json.dumps({"videos": [old, gone]}))
        self.assertEqual(self.run_main(), 0)
        data = json.loads(self.out.read_text())
        ids = [v["id"] for v in data["videos"]]
        self.assertIn("ZZZZZZZZZZZ", ids)       # failed channel keeps its old videos
        self.assertNotIn("YYYYYYYYYYY", ids)    # channel no longer listed is dropped
        self.assertEqual(len(ids), 4)
        self.assertEqual(ids[-1], "ZZZZZZZZZZZ")  # sorted newest first

    def test_no_change_does_not_rewrite(self):
        self.write_channels([REAL_CID])
        (self.fixdir / f"{REAL_CID}.xml").write_bytes((FIX / f"{REAL_CID}.xml").read_bytes())
        self.assertEqual(self.run_main(), 0)
        first = self.out.read_text()
        self.assertEqual(self.run_main(), 0)
        self.assertEqual(self.out.read_text(), first)  # updated_at unchanged -> no commit

    def test_dedupes_across_channels(self):
        other = "UC" + "y" * 22
        self.write_channels([REAL_CID, other])
        sample = (FIX / f"{REAL_CID}.xml").read_bytes()
        (self.fixdir / f"{REAL_CID}.xml").write_bytes(sample)
        (self.fixdir / f"{other}.xml").write_bytes(sample)
        self.assertEqual(self.run_main(), 0)
        ids = [v["id"] for v in json.loads(self.out.read_text())["videos"]]
        self.assertEqual(len(ids), len(set(ids)))

    def test_bad_channel_list(self):
        self.channels.write_text('{"channels": [{"id": "@handle"}]}')
        self.assertEqual(self.run_main(), 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
