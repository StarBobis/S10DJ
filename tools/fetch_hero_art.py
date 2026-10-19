"""Download the Set 10 champion splash art and build the UI portraits.

CommunityDragon keeps the patch 13.24 TFT set 10 splash renders at

  game/assets/ux/tft/championsplashes/tft10_<art>_mobile.tft_set10.png

The `_mobile` render is a 512x512 square version of the set skin, which makes it
usable both as a small board portrait and as a blurred hero backdrop. The game
ships no such square for a handful of units, so the script falls back to the
non-mobile render and finally to the base champion square from Data Dragon.

Outputs:
  src/assets/heroes/<art>.webp   384x384 WebP, imported by the Vite frontend
  src/assets/heroes/credits.json source URL and patch for every portrait

Usage:
  python tools/fetch_hero_art.py [--force]
"""

import argparse
import concurrent.futures
import json
import os
import sys
import urllib.error
import urllib.request

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UNITS = os.path.join(ROOT, "data", "set10_units.json")
CACHE = os.path.join(ROOT, "tmp", "hero_art")
OUT = os.path.join(ROOT, "src", "assets", "heroes")
PATCH = "13.24"
CDRAGON = f"https://raw.communitydragon.org/{PATCH}/game/assets/ux/tft/championsplashes"
DDragon = "https://ddragon.leagueoflegends.com/cdn/13.24.1/img/champion"
SIZE = 384
UA = {"User-Agent": "set10-mixing-desk/1.0 (+asset rebuild script)"}


def hero_units():
    with open(UNITS, encoding="utf-8") as fh:
        units = json.load(fh)["units"]
    by_art = {}
    for unit in units:
        art = unit.get("art") or unit["apiName"].replace("TFT10_", "").lower()
        by_art[art] = unit
    return by_art


def candidates(art):
    return [
        f"{CDRAGON}/tft10_{art}_mobile.tft_set10.png",
        f"{CDRAGON}/tft10_{art}.tft_set10.png",
    ]


def ddragon_candidate(api_name):
    key = api_name.replace("TFT10_", "").split("_")[0]
    return f"{DDragon}/{key}.png"


def download(url, target):
    request = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read()
    if not data:
        raise ValueError("empty response")
    with open(target, "wb") as fh:
        fh.write(data)


def fetch(art, api_name, force):
    os.makedirs(CACHE, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    destination = os.path.join(OUT, f"{art}.webp")
    if os.path.exists(destination) and not force:
        return art, destination, None

    cached = os.path.join(CACHE, f"{art}.png")
    source = None
    if not os.path.exists(cached) or force:
        for url in candidates(art):
            try:
                download(url, cached)
                source = url
                break
            except (urllib.error.URLError, urllib.error.HTTPError, ValueError, TimeoutError):
                continue
        if source is None:
            fallback = ddragon_candidate(api_name)
            download(fallback, cached)
            source = fallback

    image = Image.open(cached).convert("RGB")
    side = min(image.size)
    left = (image.width - side) // 2
    top = max(0, (image.height - side) // 2)
    image = image.crop((left, top, left + side, top + side)).resize((SIZE, SIZE), Image.LANCZOS)
    image.save(destination, "WEBP", quality=84, method=6)

    # The ultimate fallback is a wide base splash: crop it around the face by
    # keeping the centre instead of the very top of the artwork.
    return art, destination, source


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="re-download every portrait")
    args = parser.parse_args()

    units = hero_units()
    credits = {}
    failures = []

    def work(item):
        art, unit = item
        try:
            return fetch(art, unit["apiName"], args.force)
        except Exception as error:  # noqa: BLE001 - report every failed portrait
            return art, None, str(error)

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for art, destination, source in pool.map(work, sorted(units.items())):
            if destination is None:
                failures.append(f"{art}: {source}")
                continue
            credits[art] = {
                "unit": units[art]["name"],
                "art": art,
                "patch": PATCH,
                "source": source or candidates(art)[0],
            }
            print(f"ok   {art}: {os.path.basename(destination)}")

    with open(os.path.join(OUT, "credits.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump(credits, fh, indent=1, sort_keys=True)
        fh.write("\n")

    print(f"\nportraits: {len(credits)}/{len(units)}")
    if failures:
        print("failed:", *failures, sep="\n  ")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
