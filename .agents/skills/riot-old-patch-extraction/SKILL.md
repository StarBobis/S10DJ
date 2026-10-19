---
name: riot-old-patch-extraction
description: Download files from an old League of Legends / TFT patch (any version) using Riot's public patchsieve and the archived manifest index, then pull single files such as Map22.wad.client out of the CDN. Use when a current client no longer ships an asset (old TFT set music, old map data, removed champions).
---

# Extracting assets from an old Riot patch

Riot keeps old manifests and bundles online, but the manifest id is a 16 hex
digit hash and there is no version to id mapping on Riot's side. The community
archive `Morilli/riot-manifests` fills that gap.

## 1. Find the manifest for the wanted version

```powershell
git clone --filter=blob:none --no-checkout https://github.com/Morilli/riot-manifests.git
cd riot-manifests
git ls-tree -r --name-only HEAD | Select-String 'LoL/NA1/windows/lol-game-client/13\.24'
git show 'HEAD:LoL/NA1/windows/lol-game-client/13.24.5479214.txt'
# -> https://lol.secure.dyn.riotcdn.net/channels/public/releases/A0E3BD0DBEAF78B0.manifest
```

Layout: `LoL/<version set>/<platform>/<artifact type>/<version>.txt`, where the
file content is the manifest URL. TFT mobile lives under `TFT/`.

Current patch only (for reference):

```powershell
curl.exe -k "https://sieve.services.riotcdn.net/api/v1/products/lol/version-sets/NA1?q[artifact_type_id]=lol-game-client&q[platform]=windows&q[published]=true"
```

The sieve API only returns the latest published release, so the archive above is
required for anything older.

## 2. Download the files you need

`tools/bin/ManifestDownloader.exe` (extracted from the same archive) parses the
binary RMAN manifest and rebuilds files from CDN bundles:

```powershell
# list what a manifest contains
ManifestDownloader.exe <manifest-url> --print-manifest out.json

# download one file by path regex
ManifestDownloader.exe <manifest-url> -f 'DATA/FINAL/Maps/Shipping/Map22\.wad\.client$' -o out -t 8
```

Only the wanted files are fetched; a 2.3 GB WAD arrives in a couple of minutes.

## Pitfalls

* Per-file availability is not guaranteed: the manifest may still exist while a
  given file's chunks were purged. `Error: Got a 404 response.` means that file
  is gone, not that the manifest is wrong - try another build of the same patch
  (`13.24.5461574`, `13.24.5476828`, ...) or a neighbouring patch.
* `--print-manifest` output is a JSON list of `{path, file_size, languages}`;
  it does not include chunk ids, so use the tool itself for downloading.
* The legacy `game_patch` URL in Riot's patchline config (`A7C273F1209CB831`)
  is a 2020 artefact; it does not list modern WADs such as `TFTSet*.wad.client`.
