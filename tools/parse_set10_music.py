"""Recover the exact Set 10 act/phase/switch source table from a wwiser dump.

Input:
  <events.bnk.txt>  text dump of MUS_Map22_Gameplay_Set10_events.bnk
  <map22.prop.bin>  the 17 MB Map22 PROP bin that carries the Wwise event names
  [out.json]        default tmp/set10_timeline.json

Why this works: the `Set_Switch_set10_<style>_<layer>` strings are Wwise event
names. FNV-1 of the name equals the bank Event id, the Event points at a
SetSwitch action, and that action carries the generated switch group/value ids
which also appear in the music tracks' association lists. Matching `trackID`
against the association index handles the silent clip slots (for example the
long top track starts at clip 1).

The output is the authoritative source placement for act1, act2-3 and draft:
source id, fPlayAt, fBeginTrimOffset, fEndTrimOffset and fSrcDuration per
style/layer, plus `silent` where the game plays nothing on that layer.

Usage:
  python tools/parse_set10_music.py <events.bnk.txt> <map22.prop.bin> [out.json]
"""

from __future__ import annotations

import json
import re
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SONGS = {
    "act1": {"segment": 549536093, "duration": 212516.34180993852, "tracks": [106360728, 826482659, 911005957]},
    "act23": {"segment": 407554583, "duration": 174584.58333333334, "tracks": [714280751, 943136507, 973451045]},
    "draft": {"segment": 196375359, "duration": 174584.58333333334, "tracks": [197553460, 675214745, 685952027]},
}
GROUP_LAYER = {2652961736: "top", 2652961738: "drums", 2652961739: "chords"}


def fnv1(name: str) -> int:
    """AK FNV-1 32-bit over the lowercased name."""
    value = 2166136261
    for byte in name.lower().encode("utf-8"):
        value = (value * 16777619) & 0xFFFFFFFF
        value ^= byte
    return value


def blocks(text: str, kind: str) -> list[str]:
    return re.findall(
        rf"eHircType = {kind} \[[^\]]+\](.*?)(?=eHircType = 0x[0-9A-F]+ \[|\Z)",
        text,
        re.S,
    )


def parse_actions(text: str) -> dict[int, dict]:
    actions = {}
    for body in blocks(text, "0x03"):
        ident = re.search(r"ulID = (\d+)", body)
        kind = re.search(r"ulActionType = 0x[0-9A-F]+ \[([^\]]+)\]", body)
        if not ident:
            continue
        entry = {"type": kind.group(1) if kind else "?"}
        group = re.search(r"ulSwitchGroupID = (\d+)", body)
        value = re.search(r"ulSwitchStateID = (\d+)", body)
        if group:
            entry["group"] = int(group.group(1))
        if value:
            entry["value"] = int(value.group(1))
        actions[int(ident.group(1))] = entry
    return actions


def parse_events(text: str) -> dict[int, list[int]]:
    events = {}
    for body in blocks(text, "0x04"):
        ident = re.search(r"ulID = (\d+)", body)
        if ident:
            events[int(ident.group(1))] = [int(x) for x in re.findall(r"ulActionID = (\d+)", body)]
    return events


def parse_tracks(text: str) -> dict[int, dict]:
    tracks = {}
    for body in blocks(text, "0x0B"):
        ident = re.search(r"ulID = (\d+)", body)
        if not ident:
            continue
        group = re.search(r"uGroupID = (\d+)", body)
        assocs = [int(x) for x in re.findall(r"ulSwitchAssoc = (\d+)", body)]
        at = body.find("numPlaylistItem")
        playlist = body[at:] if at >= 0 else ""
        items = []
        for chunk in re.split(r"obj  AkTrackSrcInfo\[\d+\]", playlist)[1:]:
            track_id = re.search(r"trackID = (\d+)", chunk)
            source = re.search(r"sourceID = (\d+)", chunk)
            if not track_id or not source:
                continue

            def number(name: str, cast=float):
                match = re.search(rf"{name} = ([-\d.eE+]+)", chunk)
                return cast(match.group(1)) if match else None

            items.append(
                {
                    "clip": int(track_id.group(1)),
                    "source": int(source.group(1)),
                    "playAt": number("fPlayAt"),
                    "begin": number("fBeginTrimOffset"),
                    "end": number("fEndTrimOffset"),
                    "dur": number("fSrcDuration"),
                }
            )
        tracks[int(ident.group(1))] = {
            "group": int(group.group(1)) if group else None,
            "assocs": assocs,
            "items": {item["clip"]: item for item in items},
        }
    return tracks


def switch_events(prop: bytes) -> list[str]:
    names = set()
    for raw in re.findall(rb"[\x20-\x7e]{6,200}", prop):
        match = re.match(rb"(Set_Switch_set10_[a-z0-9]+_(?:drums|chords|top))", raw)
        if match:
            names.add(match.group(1).decode("ascii"))
    return sorted(names)


def main() -> int:
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    dump = Path(sys.argv[1])
    prop = Path(sys.argv[2])
    out = Path(sys.argv[3]) if len(sys.argv) > 3 else ROOT / "tmp" / "set10_timeline.json"

    text = dump.read_text(encoding="utf-8", errors="replace")
    actions = parse_actions(text)
    events = parse_events(text)
    tracks = parse_tracks(text)

    switches: dict[str, tuple[int, int]] = {}
    for name in switch_events(prop.read_bytes()):
        for action_id in events.get(fnv1(name), []):
            action = actions.get(action_id, {})
            if action.get("type") == "SetSwitch":
                switches[name] = (action["group"], action["value"])
                break

    timeline: dict[str, dict] = {}
    for song, info in SONGS.items():
        table: dict[str, dict] = {}
        for track_id in info["tracks"]:
            track = tracks.get(track_id)
            if not track or track["group"] not in GROUP_LAYER:
                continue
            layer = GROUP_LAYER[track["group"]]
            for name, (group, value) in switches.items():
                if group != track["group"]:
                    continue
                style = name[len("Set_Switch_set10_"):].rsplit("_", 1)[0]
                row = table.setdefault(style, {})
                if value not in track["assocs"]:
                    row[layer] = {"silent": True, "reason": "value not in track"}
                    continue
                clip = track["assocs"].index(value)
                item = track["items"].get(clip)
                if item is None:
                    row[layer] = {"silent": True, "reason": f"no clip {clip}"}
                else:
                    row[layer] = {"silent": False, **item}
        timeline[song] = {"duration": info["duration"], "styles": table}

    print(f"switch names: {len(switches)}")
    for song, info in timeline.items():
        print(f"\n{song} (segment {SONGS[song]['segment']}, {info['duration']:.0f} ms)")
        for style in sorted(info["styles"]):
            parts = []
            for layer in ("drums", "chords", "top"):
                item = info["styles"][style].get(layer)
                if not item:
                    parts.append(f"{layer}: -")
                elif item.get("silent"):
                    parts.append(f"{layer}: silent")
                else:
                    parts.append(f"{layer}: src={item['source']} play={item['playAt']}")
            print(f"  {style:<11} " + " | ".join(parts))

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(timeline, indent=1, sort_keys=True), encoding="utf-8")
    print(f"\nwrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
