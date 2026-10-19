"""Build the Set 10 dataset and mixing-rule config from Riot's own CDragon data.

Inputs (downloaded by tools/fetch_tft_data.ps1):
  tmp/tftdata/en_us.json, tmp/tftdata/zh_cn.json   (patch 13.24 TFT data)

Outputs:
  data/set10_units.json   unit -> traits, music style, art key, zh_CN name
  data/music_rules.json   styles, layer availability, trait -> style mapping,
                          Chinese trait and style labels

Evidence for the style table comes from the shipped game data of patch 13.24
(Map22.wad.client -> TFT10 music data chunk), which exposes the Wwise switch
surface:

  Set_Switch_set10_<style>_<layer>   with layer in {drums, chords, top}

and from the trait api names themselves (Set10_Funk = Disco, Set10_PopBand =
Heartsteel, Set10_Classical = Maestro, Set10_DJ = Mixmaster, ...).
"""

import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
TFT = os.path.join(ROOT, "tmp", "tftdata")

# trait api suffix (lowercased) -> music style id used by the audio switches
TRAIT_STYLE = {
    "8Bit": "8bit",
    "Classical": "classical",
    "Country": "country",
    "DJ": "dj",
    "EDM": "edm",
    "Emo": "emo",
    "Funk": "funk",
    "Hyperpop": "hyperpop",
    "IllBeats": "illbeats",
    "Jazz": "jazz",
    "KDA": "kda",
    "Pentakill": "pentakill",
    "PopBand": "popband",
    "PunkRock": "punkrock",
    "TrueDamage": "truedamage",
}

# CDragon lists traits on champions by display name, not by api name.
TRAIT_DISPLAY_STYLE = {
    "8-bit": "8bit",
    "Maestro": "classical",
    "Country": "country",
    "Mixmaster": "dj",
    "EDM": "edm",
    "Emo": "emo",
    "Disco": "funk",
    "Hyperpop": "hyperpop",
    "ILLBEATS": "illbeats",
    "Jazz": "jazz",
    "K/DA": "kda",
    "Pentakill": "pentakill",
    "Heartsteel": "popband",
    "Punk": "punkrock",
    "True Damage": "truedamage",
}

# Layers provided by each style, taken from the Set_Switch_set10_* names that
# ship inside the 13.24 Map22 music data.
STYLE_LAYERS = {
    "none": ["drums", "chords", "top"],
    "kda": ["drums", "chords", "top"],
    "pentakill": ["drums", "chords", "top"],
    "popband": ["drums", "chords", "top"],
    "truedamage": ["drums", "chords", "top"],
    "8bit": ["drums", "chords"],
    "country": ["drums", "chords"],
    "edm": ["drums", "chords"],
    "emo": ["drums", "chords"],
    "funk": ["drums", "chords"],
    "punkrock": ["drums", "chords"],
    "illbeats": ["drums", "top"],
    "dj": ["drums"],
    "classical": ["top"],
    "hyperpop": ["top"],
    "jazz": ["top"],
}

# Community stem files use display names; map style id -> audio file prefix.
STEM_PREFIX = {
    "8bit": "8bit",
    "country": "country",
    "funk": "disco",
    "edm": "edm",
    "emo": "emo",
    "popband": "heartsteel",
    "hyperpop": "hyperpop",
    "illbeats": "illbeats",
    "jazz": "jazz",
    "kda": "kda",
    "classical": "maestro",
    "dj": "mixmaster",
    "pentakill": "pentakill",
    "punkrock": "punk",
    "truedamage": "truedamage",
    "none": "piano",
}

LAYERS = ["drums", "chords", "top"]


def stem_index():
    """Map style -> layer -> {early, late} stem file base names.

    Layer names come from the shipped switch surface (drums / chords / top);
    the audio files use the render names drums / main / secondary.
    """
    audio = os.path.join(ROOT, "assets", "audio")
    available = set()
    if os.path.isdir(audio):
        available = {n[:-4] for n in os.listdir(audio) if n.endswith(".aac")}

    def pick(prefix, era, suffix):
        for candidate in (f"{prefix}_{era}_{suffix}", f"{prefix}_{era}_main", f"{prefix}_{era}"):
            if candidate in available:
                return candidate
        return None

    index = {}
    for style, layers in STYLE_LAYERS.items():
        prefix = STEM_PREFIX.get(style)
        if not prefix:
            continue
        entry = {}
        for layer in layers:
            suffix = {"drums": "drums", "chords": "main", "top": "secondary"}[layer]
            slot = {}
            for era in ("early", "late"):
                name = pick(prefix, era, suffix)
                if name:
                    slot[era] = name
            if slot:
                entry[layer] = slot
        if entry:
            index[style] = entry
    return index


def load_localized_names():
    """Map champion api names and trait display names to their zh_CN labels.

    The English set data and the Chinese set data share api names, so the
    Chinese file can be treated as a lookup table.  Falling back to the English
    label keeps the build usable when only en_us.json was downloaded.
    """
    names = {}
    trait_names = {}
    path = os.path.join(TFT, "zh_cn.json")
    if not os.path.exists(path):
        return names, trait_names
    with open(path, encoding="utf-8") as fh:
        zh = json.load(fh)
    set10 = zh["sets"]["10"]
    for champ in set10["champions"]:
        api = champ.get("apiName")
        if api and champ.get("name"):
            names[api] = champ["name"]
    for trait in set10["traits"]:
        api = trait.get("apiName")
        if api and trait.get("name"):
            trait_names[api] = trait["name"]
    return names, trait_names


def build_units():
    with open(os.path.join(TFT, "en_us.json"), encoding="utf-8") as fh:
        en = json.load(fh)
    zh_names, zh_traits = load_localized_names()
    set10 = en["sets"]["10"]
    traits_by_api = {t.get("apiName"): t for t in set10["traits"]}
    thresholds = {}
    for trait in set10["traits"]:
        name = trait.get("name")
        if name in TRAIT_DISPLAY_STYLE:
            steps = sorted({e.get("minUnits") for e in trait.get("effects", []) if e.get("minUnits")})
            thresholds[name] = steps
    units = []
    for champ in set10["champions"]:
        api = champ.get("apiName", "")
        traits = champ.get("traits") or []
        if not api.startswith("TFT10"):
            continue
        if not traits:
            continue
        # Summons, clones and props reuse a champion portrait but are not
        # buyable units, so they must never reach the shop or the board.
        if re.search(r"(Big|Minion|Voidspawn|Spawn|Clone|Prop|Ghoul|DiscoBall|Ball)", api):
            continue
        style = "none"
        music_traits = []
        for trait in traits:
            if trait in TRAIT_DISPLAY_STYLE:
                style = TRAIT_DISPLAY_STYLE[trait]
                music_traits.append(trait)
        art = api.replace("TFT10_", "").lower()
        units.append(
            {
                "apiName": api,
                "name": champ.get("name"),
                "nameZh": zh_names.get(api, champ.get("name")),
                "cost": champ.get("cost"),
                "traits": traits,
                "musicTraits": music_traits,
                "style": style,
                "art": art,
            }
        )
    units.sort(key=lambda u: (u["cost"], u["name"] or ""))

    trait_names_zh = {}
    for api, trait in traits_by_api.items():
        display = trait.get("name")
        if display and api in zh_traits:
            trait_names_zh[display] = zh_traits[api]
    trait_names_zh.setdefault("Base", "\u57fa\u7840")

    style_names_zh = {"none": "\u57fa\u7840"}
    for style, display in {value: key for key, value in TRAIT_DISPLAY_STYLE.items()}.items():
        if display in trait_names_zh:
            style_names_zh[style] = trait_names_zh[display]

    return units, thresholds, trait_names_zh, style_names_zh


def build_costs(units):
    """Total unit pool size per cost, used by the UI for sanity checks."""
    pool = {1: 29, 2: 22, 3: 18, 4: 12, 5: 10}
    counts = {}
    for unit in units:
        counts[unit["cost"]] = counts.get(unit["cost"], 0) + 1
    return {"poolPerCopy": pool, "unitsPerCost": counts}


def main():
    os.makedirs(DATA, exist_ok=True)
    units, thresholds, trait_names_zh, style_names_zh = build_units()
    with open(os.path.join(DATA, "set10_units.json"), "w", encoding="utf-8") as fh:
        json.dump({"set": 10, "patch": "13.24", "units": units}, fh, indent=1, sort_keys=True)

    rules = {
        "set": 10,
        "patch": "13.24",
        "layers": LAYERS,
        "styles": {
            style: {
                "layers": layers,
                "traitApiSuffix": next((k for k, v in TRAIT_STYLE.items() if v == style), None),
            }
            for style, layers in STYLE_LAYERS.items()
        },
        "traitToStyle": {f"Set10_{k}": v for k, v in TRAIT_STYLE.items()},
        # Champion traits are keyed by display name in Riot's set data
        # ("K/DA", "8-bit", ...), while traitToStyle uses the api suffix.
        # The rules engine needs the display-name view to award tier bonuses.
        "traitDisplayStyle": dict(TRAIT_DISPLAY_STYLE),
        "traitNamesZh": trait_names_zh,
        "styleNamesZh": style_names_zh,
        "traitThresholds": thresholds,
        "stems": stem_index(),
        "weights": {
            "perUnit": 1,
            "tierBonus": [0, 1, 2, 3, 4],
            "comment": (
                "Reconstructed from the official design interview plus shipped data: "
                "each unit adds its style's weight, trait breakpoints add a bonus "
                "(K/DA and other complex traits grow with tier), then every layer "
                "picks the heaviest style that can provide it."
            ),
        },
        "priority": [
            "kda", "pentakill", "truedamage", "popband", "illbeats", "8bit",
            "country", "edm", "emo", "funk", "punkrock", "hyperpop", "jazz",
            "classical", "dj", "none",
        ],
        "specialRules": {
            "classicalAlwaysOccupiesALayer": True,
            "soloStylesAlwaysOccupy": True,
            "comment": (
                "The design interview states that a solo act such as Maestro "
                "(Jhin) always occupies one of the three layers; set 10 also "
                "has the single-unit Mixmaster and ILLBEATS acts."
            ),
        },
        "sources": [
            "Riot design interview on the Set 10 music system (3 layers, unit count driven)",
            "TFTSet10 / Map22 music data, patch 13.24: Set_Switch_set10_<style>_<layer>",
            "CommunityDragon TFT 13.24 set data: trait api names",
        ],
    }
    with open(os.path.join(DATA, "music_rules.json"), "w", encoding="utf-8") as fh:
        json.dump(rules, fh, indent=1, sort_keys=True)

    print(f"units: {len(units)}")
    styles = {}
    for unit in units:
        styles[unit["style"]] = styles.get(unit["style"], 0) + 1
    print("units per style:", dict(sorted(styles.items())))
    print("stem styles:", sorted(rules["stems"].keys()))
    missing = [s for s in STYLE_LAYERS if s != "none" and s not in rules["stems"]]
    print("styles without stems:", missing)


if __name__ == "__main__":
    main()

