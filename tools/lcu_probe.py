"""Report which live data surfaces the running League client exposes on this box.

The client is reached through three different doors and each one has its own
credential story, so this tool prints what is actually reachable instead of
assuming the lockfile is usable:

  1. LCU remoting  - HTTPS on 127.0.0.1, basic auth user "riot" + token.
     Token lives in the lockfile, or on the Tencent/WeGame build (empty
     lockfile) in the LeagueClientUx command line, which is echoed by the
     Ux log only after the process flushes it.
  2. Live Client Data - HTTPS on 127.0.0.1:2999, served by the running GAME
     process only. No auth. Nothing is listening unless a match is loaded.
  3. TFT frontend plugin routes - static inventory from the plugin wad.

Usage:
  python lcu_probe.py            # discovery + probes
  python lcu_probe.py --json     # machine readable
"""

import base64
import json
import os
import re
import ssl
import subprocess
import sys
import urllib.error
import urllib.request

RIOT_INSTALLS = r"C:\ProgramData\Riot Games\RiotClientInstalls.json"
FALLBACK_ROOTS = [
    r"C:\Riot Games\League of Legends",
    r"D:\Riot Games\League of Legends",
    r"C:\WeGameApps",
    r"D:\WeGameApps",
]
LIVE_CLIENT_DATA = "https://127.0.0.1:2999/liveclientdata"
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE


def find_install():
    """Return the League install root (the folder holding LeagueClient/)."""
    override = os.environ.get("LOL_INSTALL")
    if override and os.path.exists(os.path.join(override, "LeagueClient", "LeagueClient.exe")):
        return override
    if os.path.exists(RIOT_INSTALLS):
        with open(RIOT_INSTALLS, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        # rc_default points at Riot Client\RiotClientServices.exe; the League
        # install is its parent folder.
        default = data.get("rc_default") or ""
        root = os.path.dirname(os.path.dirname(default))
        if os.path.exists(os.path.join(root, "LeagueClient", "LeagueClient.exe")):
            return root
        for target in (data.get("associated_client") or {}).values():
            root = os.path.dirname(os.path.dirname(target))
            if os.path.exists(os.path.join(root, "LeagueClient", "LeagueClient.exe")):
                return root
    for root in FALLBACK_ROOTS:
        direct = os.path.join(root, "LeagueClient", "LeagueClient.exe")
        if os.path.exists(direct):
            return root
        if os.path.isdir(root):
            for name in os.listdir(root):
                nested = os.path.join(root, name, "LeagueClient", "LeagueClient.exe")
                if os.path.exists(nested):
                    return os.path.join(root, name)
    return None


def listening_ports():
    """Map listening 127.0.0.1 ports to the owning pid (netstat rows are ASCII)."""
    try:
        raw = subprocess.run(["netstat", "-ano", "-p", "tcp"],
                             capture_output=True, timeout=15).stdout
    except (OSError, subprocess.SubprocessError):
        return {}
    ports = {}
    for line in raw.decode("ascii", "replace").splitlines():
        parts = line.split()
        if len(parts) >= 5 and parts[0].upper() == "TCP" and parts[3].upper() == "LISTENING":
            addr, _, port = parts[1].rpartition(":")
            if port.isdigit():
                ports.setdefault(int(port), set()).add(int(parts[4]))
    return ports


def riot_pids():
    """Pids of the processes that can host the remoting server."""
    try:
        raw = subprocess.run(["tasklist", "/fi", "imagename eq LeagueClient.exe", "/fo", "csv", "/nh"],
                             capture_output=True, timeout=15).stdout
    except (OSError, subprocess.SubprocessError):
        return set()
    pids = set()
    for line in raw.decode("ascii", "replace").splitlines():
        cells = [c.strip('"') for c in line.split('","')]
        if len(cells) >= 2 and cells[1].isdigit():
            pids.add(int(cells[1]))
    return pids


def read_lockfile(root):
    path = os.path.join(root, "LeagueClient", "lockfile")
    try:
        raw = open(path, "rb").read().decode("utf-8", "replace").strip()
    except OSError as exc:
        return None, f"unreadable ({exc.__class__.__name__})"
    if not raw:
        return None, "present but empty (Tencent/WeGame build)"
    parts = raw.split(":")
    if len(parts) < 4:
        return None, f"unexpected content {raw[:40]!r}"
    return {"port": int(parts[1]), "password": parts[2], "protocol": parts[3]}, "lockfile"


def read_ux_log(root):
    """Parse --app-port/--remoting-auth-token out of the newest non-empty Ux log."""
    folders = [
        os.path.join(root, "LeagueClient"),
        os.path.join(root, "Game", "Logs", "LeagueClient Logs"),
    ]
    logs = []
    for folder in folders:
        if not os.path.isdir(folder):
            continue
        for name in os.listdir(folder):
            if name.endswith("LeagueClientUx.log"):
                path = os.path.join(folder, name)
                logs.append((os.path.getmtime(path), os.path.getsize(path), path))
    if not logs:
        return None, "no Ux log found"
    logs.sort(reverse=True)
    _, size, path = logs[0]
    if size == 0:
        return None, f"newest Ux log is empty while the client runs: {os.path.basename(path)}"
    text = open(path, "rb").read(400000).decode("utf-8", "replace")
    port = re.search(r"--app-port=(\d+)", text)
    token = re.search(r"--remoting-auth-token=([\w-]+)", text)
    if not (port and token):
        return None, f"no credentials in {os.path.basename(path)}"
    return {"port": int(port.group(1)), "password": token.group(1), "protocol": "https"}, path


def get(url, creds=None, timeout=4):
    req = urllib.request.Request(url)
    if creds:
        token = base64.b64encode(f"riot:{creds['password']}".encode()).decode()
        req.add_header("Authorization", f"Basic {token}")
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=CTX) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return exc.code, ""
    except Exception as exc:  # noqa: BLE001 - transport failures all mean "not reachable"
        return None, exc.__class__.__name__


def main():
    as_json = "--json" in sys.argv
    report = {"install": None, "lcu": {}, "live_client_data": {}, "ports": {}}

    root = find_install()
    report["install"] = root
    if not root:
        print("no League install found (set LOL_INSTALL)")
        return 1

    creds, source = read_lockfile(root)
    if not creds:
        lock_note = source
        creds, source = read_ux_log(root)
        report["lcu"]["lockfile"] = lock_note

    ports = listening_ports()
    owners = riot_pids()
    if creds:
        report["lcu"].update({"auth": "ok", "source": source, "port": creds["port"]})
    else:
        report["lcu"].update({"auth": "unavailable", "reason": source})

    # The remoting server is hosted by LeagueClient.exe; find which of its
    # localhost ports answers 401/200 to separate it from the internal sockets.
    candidates = sorted(p for p, pids in ports.items() if pids & owners)
    for port in candidates:
        status, _ = get(f"https://127.0.0.1:{port}/", creds=None, timeout=1.5)
        if status in (200, 401, 403, 404):
            report["ports"][port] = status
            if "port" not in report["lcu"]:
                report["lcu"]["port"] = port
                report["lcu"]["port_source"] = "port scan"

    if creds:
        status, body = get(f"https://127.0.0.1:{creds['port']}/lol-gameflow/v1/gameflow-phase", creds)
        report["lcu"]["gameflow_phase"] = (body.strip('"') if status == 200 else f"HTTP {status}")
    elif "port" in report["lcu"]:
        status, _ = get(f"https://127.0.0.1:{report['lcu']['port']}/lol-gameflow/v1/gameflow-phase")
        report["lcu"]["gameflow_phase"] = f"unauthenticated (HTTP {status})"

    status, body = get(f"{LIVE_CLIENT_DATA}/allgamedata", timeout=2)
    if status == 200:
        try:
            data = json.loads(body)
            report["live_client_data"] = {
                "state": "live",
                "game_mode": data.get("gameData", {}).get("gameMode"),
                "players": len(data.get("allPlayers") or []),
                "events": len(data.get("events", {}).get("Events") or []),
            }
        except json.JSONDecodeError:
            report["live_client_data"] = {"state": "live but unparsable"}
    else:
        report["live_client_data"] = {
            "state": "not listening (no game loaded)" if status is None else f"HTTP {status}"
        }

    if as_json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0

    print(f"install          : {root}")
    print(f"lcu auth         : {report['lcu'].get('auth')} ({report['lcu'].get('source') or report['lcu'].get('reason')})")
    print(f"lcu port         : {report['lcu'].get('port', '?')} ({report['lcu'].get('port_source', 'lockfile/log')})")
    print(f"lcu phase        : {report['lcu'].get('gameflow_phase', '?')}")
    print(f"live client data : {report['live_client_data']['state']}")
    if report["live_client_data"].get("state") == "live":
        print(f"                   mode={report['live_client_data']['game_mode']} "
              f"players={report['live_client_data']['players']}")
    print(f"https responders : {report['ports'] or 'none'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
