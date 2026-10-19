---
name: tft-champion-portraits
description: Fetch Teamfight Tactics champion set art from CommunityDragon, map Riot api names to the banner and splash file names, and convert them into small WebP UI banners and wallpaper images. Use when a TFT set needs champion tiles, board portraits, radio/show cards or a hero wallpaper.
---

# TFT champion portraits

## Two different assets

CommunityDragon keeps TFT set art under the game assets of a patch:

```
https://raw.communitydragon.org/<patch>/game/assets/ux/tft/championsplashes/
```

For set 10 / patch 13.24 the files that matter are:

```
tft10_<art>.tft_set10.png          256x128 in-game champion banner
tft10_<art>_mobile.tft_set10.png   512x512 square set splash
```

The **banner** is the portrait Riot itself uses in the TFT UI (pool / board /
champion cards). Use that for hero tiles, not the square splash. The splash is
only a wallpaper: blur it behind the app and never treat it as the avatar.

`<art>` is the champion api name after the set prefix, lowercased:

| api name | art |
| --- | --- |
| `TFT10_Ahri` | `ahri` |
| `TFT10_KSante` | `ksante` |
| `TFT10_TahmKench` | `tahmkench` |
| `TFT10_MissFortune` | `missfortune` |
| `TFT10_TwistedFate` | `twistedfate` |
| `TFT10_Akali_TrueDamage` | `akali_truedamage` |

So the rule is `apiName.replace("TFT10_", "").lower()`; do not strip the
`_TrueDamage` suffix, it is a separate portrait. Plain `TFT10_Akali` is the K/DA
skin and has its own art.

## Validate before downloading

Do not guess file names at runtime. Fetch the directory index once and confirm
the list:

```
python -c "import urllib.request; print(urllib.request.urlopen('https://raw.communitydragon.org/13.24/game/assets/ux/tft/championsplashes/').read().decode()[:2000])"
```

The index is a static Apache listing; grep for `tft10_` and `_mobile`. Missing
champions return 404, so fall back to a 2:1 centre crop of the square splash and
finally to the Data Dragon square:

```
https://ddragon.leagueoflegends.com/cdn/13.24.1/img/champion/<Key>.png
```

The Data Dragon key is the api name up to the first underscore (`Akali_TrueDamage`
-> `Akali`); it is a base-LoL icon, not set-specific, so only use it as a last
resort.

## Conversion recipe

Use Pillow. Keep the two outputs separate:

```
src/assets/heroes/banner/<art>.webp      384x192  (2:1, from the 256x128 banner)
src/assets/heroes/wallpaper/<art>.webp   384x384  (centre-cropped square splash)
```

```python
# banner
image = Image.open(banner).convert("RGB")
image = centre_crop_to_ratio(image, 2 / 1)
image.resize((384, 192), Image.LANCZOS).save(out, "WEBP", quality=86, method=6)

# wallpaper
image = Image.open(splash).convert("RGB")
side = min(image.size)
image = image.crop(((image.width - side) // 2, (image.height - side) // 2,
                    (image.width + side) // 2, (image.height + side) // 2))
image.resize((384, 384), Image.LANCZOS).save(out, "WEBP", quality=84, method=6)
```

Result for set 10: 60 banners (~0.6 MB) plus 60 wallpapers (~1.1 MB). Small
enough to commit, so the app never needs the network at runtime.

## Data and UI wiring

The unit dataset should carry an explicit `art` key rather than deriving it in
the frontend; the generator (`tools/build_dataset.py`) writes it and skips
summons such as `TFT10_DiscoBall` and `TFT10_YorickGhoulMelee` (they reuse a
champion portrait but are not buyable units).

For Vite, import both folders eagerly so the URLs are fingerprinted into the
bundle:

```ts
const banners = import.meta.glob('../assets/heroes/banner/*.webp', {
  eager: true, query: '?url', import: 'default',
}) as Record<string, string>;
const wallpapers = import.meta.glob('../assets/heroes/wallpaper/*.webp', {
  eager: true, query: '?url', import: 'default',
}) as Record<string, string>;
```

Keep a `credits.json` next to the images containing patch, unit name, art key,
and both source URLs. It documents provenance and makes a refresh auditable.

## Pitfalls

* `raw.communitydragon.org/latest/...` drops old sets. Pin the patch that
  actually shipped the set (`13.24` for set 10); the current client only has the
  newest set under `latest`.
* The banner is only 256x128. Display it around 120-200 px wide (2x for HiDPI)
  and centre-crop it for square hexes; do not upscale it into a 4K wallpaper.
* Akali has two skins in set 10. Keep `akali` and `akali_truedamage` as separate
  art keys and units.
* Do not hotlink the CDN from the app. The desk is offline-first and the CDN
  removes old patches; download and bundle instead.
* Regenerating art while Vite is running requires a page reload because
  `import.meta.glob` is evaluated once.
