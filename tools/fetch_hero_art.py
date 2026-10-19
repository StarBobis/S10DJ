"""Download the Set 10 champion art and build the UI assets.

CommunityDragon keeps the patch 13.24 TFT set 10 art at

  game/assets/ux/tft/championsplashes/

Two renders matter:

  tft10_<art>.tft_set10.png          256x128 champion banner used by the set UI
  tft10_<art>_mobile.tft_set10.png   512x512 set splash

The banner is the in-game champion portrait/banner, so it is used for the pool,
the hex board and the spotlight. The splash is only used as the blurred global
wallpaper behind the desk. Both are converted to WebP:

  src/assets/heroes/banner/<art>.webp      384x192
  src/assets/heroes/wallpaper/<art>.webp   384x384
  src/assets/heroes/credits.json           source URL for both renders

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
BANNER = os.path.join(OUT, "banner")
WALLPAPER = os.path.join(OUT, "wallpaper")
PATCH = "13.24"
CDRAGON = f"https://raw.communitydragon.org/{PATCH}/game/assets/ux/tft/championsplashes"
DDragon = "https://ddragon.leagueoflegends.com/cdn/13.24.1/img/champion"
WALLPAPER_SIZE = 384
BANNER_SIZE = (384, 192)
UA = {"User-Agent": "set10-mixing-desk/1.0 (+asset rebuild script)"}


def hero_units():
    with open(UNITS, encoding="utf-8") as fh:
        units = json.load(fh)["units"]
    by_art = {}
    for unit in units:
        art = unit.get("art") or unit["apiName"].replace("TFT10_", "").lower()
        by_art[art] = unit
    return by_art


def banner_url(art):
    return f"{CDRAGON}/tft10_{art}.tft_set10.png"


def wallpaper_url(art):
    return f"{CDRAGON}/tft10_{art}_mobile.tft_set10.png"


def ddragon_url(api_name):
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


def fetch_image(urls, target):
    """Try each url in order and leave the first good payload in target."""
    for url in urls:
        try:
            download(url, target)
            return url
        except (urllib.error.URLError, urllib.error.HTTPError, ValueError, TimeoutError):
            continue
    return None


def crop_ratio(image, ratio):
    """Centre-crop to the requested width/height ratio."""
    width, height = image.size
    if width / height > ratio:
        new_width = int(height * ratio)
        left = (width - new_width) // 2
        return image.crop((left, 0, left + new_width, height))
    new_height = int(width / ratio)
    top = (height - new_height) // 2
    return image.crop((0, top, width, top + new_height))


def save_banner(source, destination):
    image = Image.open(source).convert("RGB")
    image = crop_ratio(image, BANNER_SIZE[0] / BANNER_SIZE[1])
    image = image.resize(BANNER_SIZE, Image.LANCZOS)
    image.save(destination, "WEBP", quality=86, method=6)


def save_wallpaper(source, destination):
    image = Image.open(source).convert("RGB")
    side = min(image.size)
    left = (image.width - side) // 2
    top = max(0, (image.height - side) // 2)
    image = image.crop((left, top, left + side, top + side))
    image = image.resize((WALLPAPER_SIZE, WALLPAPER_SIZE), Image.LANCZOS)
    image.save(destination, "WEBP", quality=84, method=6)


def fetch(art, unit, force):
    os.makedirs(CACHE, exist_ok=True)
    os.makedirs(BANNER, exist_ok=True)
    os.makedirs(WALLPAPER, exist_ok=True)
    banner_out = os.path.join(BANNER, f"{art}.webp")
    wallpaper_out = os.path.join(WALLPAPER, f"{art}.webp")
    if os.path.exists(banner_out) and os.path.exists(wallpaper_out) and not force:
        return art, banner_out, wallpaper_out, banner_url(art), wallpaper_url(art)

    wallpaper_cache = os.path.join(CACHE, f"wallpaper_{art}.png")
    banner_cache = os.path.join(CACHE, f"banner_{art}.png")
    wallpaper_source = wallpaper_url(art)
    banner_source = banner_url(art)

    if force or not os.path.exists(wallpaper_cache):
        downloaded = fetch_image([wallpaper_url(art), ddragon_url(unit["apiName"])], wallpaper_cache)
        if downloaded is None:
            raise RuntimeError("wallpaper unavailable")
        wallpaper_source = downloaded
    else:
        wallpaper_source = wallpaper_url(art)

    if force or not os.path.exists(banner_cache):
        downloaded = fetch_image([banner_url(art)], banner_cache)
        if downloaded is None:
            # Older sets may miss the banner; derive a 2:1 crop from the splash.
            save_banner(wallpaper_cache, banner_cache)
            banner_source = wallpaper_source
        else:
            banner_source = downloaded
    else:
        banner_source = banner_url(art)

    save_banner(banner_cache, banner_out)
    save_wallpaper(wallpaper_cache, wallpaper_out)
    return art, banner_out, wallpaper_out, banner_source, wallpaper_source


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="re-download every asset")
    args = parser.parse_args()

    units = hero_units()
    credits = {}
    failures = []

    def work(item):
        art, unit = item
        try:
            return fetch(art, unit, args.force)
        except Exception as error:  # noqa: BLE001 - report every failed asset
            return art, None, None, str(error), None

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for art, banner, wallpaper, banner_source, wallpaper_source in pool.map(work, sorted(units.items())):
            if banner is None or wallpaper is None:
                failures.append(f"{art}: {banner_source}")
                continue
            credits[art] = {
                "unit": units[art]["name"],
                "art": art,
                "patch": PATCH,
                "banner": banner_source,
                "wallpaper": wallpaper_source,
            }
            print(f"ok   {art}: {os.path.basename(banner)} + {os.path.basename(wallpaper)}")

    with open(os.path.join(OUT, "credits.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump(credits, fh, indent=1, sort_keys=True)
        fh.write("\n")

    print(f"\nheroes: {len(credits)}/{len(units)}")
    if failures:
        print("failed:", *failures, sep="\n  ")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
