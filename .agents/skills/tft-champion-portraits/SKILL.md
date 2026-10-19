---
name: tft-champion-portraits
description: Fetch Teamfight Tactics champion set splash art from CommunityDragon, map Riot api names to the file names, and convert the 512x512 mobile renders into small WebP portraits for a desktop app. Use when a TFT set needs champion avatars, board portraits or hero card backdrops.
---

# TFT champion portraits

## Where the art lives

CommunityDragon keeps TFT set art under the game assets of a patch:

```
https://raw.communitydragon.org/<patch>/game/assets/ux/tft/championsplashes/
```

For set 10 / patch 13.24 the useful files are:

```
tft10_<art>.tft_set10.png        256x128 loading banner
tft10_<art>_mobile.tft_set10.png 512x512 square splash
```

Only the `_mobile` render is square, so use it for both the avatar and the
blurred backdrop. The smaller banner is a useful header strip, not a portrait.

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

The index is a static Apache listing; grep for `tft10_` and `_mobile`. A missing
champion returns 404, so a download script should fall back to the non-mobile
render and finally to the Data Dragon square:

```
https://ddragon.leagueoflegends.com/cdn/13.24.1/img/champion/<Key>.png
```

The Data Dragon key is the api name up to the first underscore (`Akali_TrueDamage`
-> `Akali`); it is a base-LoL icon, not set-specific, so only use it as a last
resort.

## Conversion recipe

Use Pillow. Crop the centre square first (the mobile files already are square),
resize to 384x384 with LANCZOS, then save WebP quality 84, method 6:

```python
image = Image.open(path).convert("RGB")
side = min(image.size)
left = (image.width - side) // 2
top = (image.height - side) // 2
image = image.crop((left, top, left + side, top + side))
image.resize((384, 384), Image.LANCZOS).save(out, "WEBP", quality=84, method=6)
```

Result for set 10: 60 portraits, about 1.1 MB total, 15-30 KB each. That is
small enough to commit, so the app does not need the network at runtime.

## Data and UI wiring

The unit dataset should carry an explicit `art` key rather than deriving it in
the frontend; the generator (`tools/build_dataset.py`) writes it and skips
summons such as `TFT10_DiscoBall` and `TFT10_YorickGhoulMelee` (they reuse a
champion portrait but are not buyable units).

For Vite, import the folder eagerly so the URLs are fingerprinted into the
bundle:

```ts
const modules = import.meta.glob('../assets/heroes/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
```

Keep a `credits.json` next to the images containing patch, unit name, art key
and the exact source URL. It documents provenance and makes a refresh auditable.

## Pitfalls

* `raw.communitydragon.org/latest/...` drops old sets. Pin the patch that
  actually shipped the set (`13.24` for set 10); the current client only has the
  newest set under `latest`.
* The non-mobile splash is 256x128. Cropping it to a square loses most of the
  art; only use it if the mobile file is absent.
* Akali has two skins in set 10. Keep `akali` and `akali_truedamage` as separate
  art keys and units.
* Do not hotlink the CDN from the app. The desk is offline-first and the CDN
  removes old patches; download and bundle instead.
* Regenerating portraits while Vite is running requires a page reload because
  `import.meta.glob` is evaluated once.
