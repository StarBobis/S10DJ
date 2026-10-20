# What the League client can and cannot tell you live

Answers "can I read client content in real time?" with the three doors the
client exposes, what each one carries, and the policy wall that decides what
may be built on top. Verified on the Tencent/WeGame build (ACE anti-cheat,
Chinese install path), 2026-10.

Tools: `tools/lcu_probe.py` (discovery + probe), `tools/lcu_fetch.py` (raw GET),
`tools/scan_wad_text.py` (route inventory out of plugin wads).

## 1. Find the install

`C:\ProgramData\Riot Games\RiotClientInstalls.json` carries `rc_default`, a path
to `Riot Client\RiotClientServices.exe`; the League install is the grandparent.
On this box that resolves to `D:\WeGameApps\英雄联盟（含经典模式）`.

The Tencent folder name is Chinese and breaks `py -3.14 tool.py <path>` (argv
arrives as GBK mojibake, `FileNotFoundError`). Fix once per session:

```powershell
New-Item -ItemType Junction -Path tmp\lolcn -Target 'D:\WeGameApps\英雄联盟（含经典模式）'
```

then pass ASCII paths (`tmp\lolcn\LeagueClient\Plugins\...`). `tmp/` is gitignored.

## 2. Door one: LCU remoting (client UI, pre-game)

`LeagueClient.exe` opens several localhost listeners; only one speaks HTTPS and
answers `401` to an unauthenticated GET. That is the LCU. Identify it by pid
(`Get-NetTCPConnection -State Listen -OwningProcess <pid>`), not by a fixed port
- the port is random per launch (57669 on this run; 40017/30691/54350 are
internal sockets that hang or refuse TLS).

Auth is HTTP basic `riot:<token>`:

| source | Tencent build | Riot build |
| --- | --- | --- |
| `<install>\LeagueClient\lockfile` (`pid:port:token:https`) | 0 bytes, useless | works |
| `<install>\LeagueClient\<ts>_<pid>_LeagueClientUx.log` (`--app-port`, `--remoting-auth-token`) | works, **but only after the log flushes** | fallback |

The Ux log is created at 0 bytes and fills in later (a few minutes into the
session on this build); read too early and the credentials are simply not there
yet. `WMI`/`Get-Process` are no help: ACE protects the client processes, so
`Win32_Process.CommandLine` and `ExecutablePath` come back empty for
`LeagueClientUx.exe` while `explorer.exe` returns normally. Do not "fix" that
with a memory read - see section 6.

What the LCU actually holds: summoner, loot, store, parties, gameflow phase,
champ select (LoL only), TFT hub/pass/troves/skill-tree, match history. It is a
pre-game and post-game API; it has no in-game board state.

TFT routes reachable through it (inventory recovered from
`rcp-fe-lol-tft\assets.wad`; the bundle only calls these):

```
/lol-tft/v1/tft/homeHub, newsHub, battlePassHub, events, backgrounds, promoButtons
/lol-tft-pass/v1/{enabled,battle-pass,daily-login-pass,event-pass,reward-notification}
/lol-tft-troves/v1/{banners,milestones,roll,roll-rewards,purchase,status-notifications}
/lol-tft-skill-tree/v1/{skill-tree,skill-tree-rank/<id>,skill/<id>}
/lol-match-history/v1/products/tft/<puuid>/matches        # post-game summaries
```

Everything else under `/lol-tft/v1/...` guessed from the plugin name returns
404 - the backend does not register it.

## 3. Door two: Live Client Data API (in-game, port 2999)

Served by the running `League of Legends.exe` on `https://127.0.0.1:2999`, no
auth, nothing listens unless a match is loaded. TFT runs the same executable
(the exe carries `evtTFTPlaceUnit`, `TFT_CombatRecap_*`, tactician proxies), but
the API surface is LoL-shaped. All 13 routes, straight out of the exe strings:

```
/liveclientdata/{allgamedata,activeplayer,activeplayername,activeplayerabilities,
                 activeplayerrunes,playerlist,playeritems,playerscores,
                 playersummonerspells,playermainrunes,gamestats,eventdata}
```

Serialized fields are `summonerName`, `riotId`, `championName`, `rawChampionName`,
`isDead`, `respawnTimer`, `scores`, `items`, `teamRelativeColors` - no shop, no
bench, no board, no trait, no gold, no pool. There is no `/liveclientdata/tft/*`
route and no TFT-specific DTO in the binary.

## 4. Door three: the client UI itself (CEF)

The frontend is Chromium and its content is extractable from the plugin
`assets.wad` files (see `lol-client-ui-effects`), but that is static. There is
no `--remote-debugging-port` listener on any Riot process, so no CDP session and
no "read the rendered DOM live" path.

## 5. Verdict matrix

| want | LCU | Live Client Data | screen capture | memory/packets |
| --- | --- | --- | --- | --- |
| lobby / queue / phase | yes | - | - | - |
| own shop, bench, board | no | no | yes, what is drawn | - |
| opponents' boards | no | no | only while scouting/combat | - |
| remaining pool counts | no (no pool model exists client-side) | no | derivable from units seen | - |
| post-game 8 boards | yes (match history) | - | - | - |
| real-time during a match | no | partial, LoL fields only | yes | blocked by ACE |

A "pool counter" therefore cannot be exact from client data: the client is never
sent the remaining-copies table, and unbought shop cards go back into the pool,
so sightings do not subtract. Only purchased units on boards/benches do.

## 6. The policy wall (read before designing anything)

Riot's TFT game policy (developer.riotgames.com/docs/tft, updated 2026-08-21)
lists as **unapproved**:

- "Scouting - tracking the champions opponents have on their boards."
- "Apps that provide dynamic, real-time information."
- "Products that bypass a skill test for the player. Skill tests can include the
  tracking of diverse information over a short period of time."
- "Products may not provide information that was not available prior to the
  game."
- Overlays "may not include any real-time data that would improve a player's
  performance immediately by altering player behavior".

Server-side computation does not change this: the rule is about what the player
is handed, not who computed it. In-game pool/board trackers fall under all four
bullets at once.

Allowed shapes: pre-game static data and static recommendations (Data Dragon /
CommunityDragon), post-game analysis over `tft-match-v1` or LCU match history,
aggregate stats. Any product serving players must also be registered on the
Developer Portal regardless of which API it uses.

## 7. Anti-cheat facts on this build

`ACE-BASE.sys` and `ACE-ADVT.sys` are loaded from `System32\drivers` when the
client starts (Tencent ACE, not Vanguard). Evidence of process protection:
`Get-Process -Id <Ux>.Path` is empty and the WMI `CommandLine` is zero-length
while the same query works for other processes. Never open a handle.
`PROCESS_VM_READ` into `LeagueClient.exe`/`League of Legends.exe` to verify - a
read-only probe is enough to be flagged, and the information it would return is
already banned by the policy above.

## 8. Housekeeping

- `py -3.14` only; the repo's `tools/bin` is gitignored.
- Keep every probe dump under `tmp/` (`lcu/tft_matches.json`, ...).
- The client log folder is `Game\Logs\LeagueClient Logs`; Ux logs live in
  `LeagueClient\` next to the exe, under a different name pattern.
