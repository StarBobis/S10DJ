"""Fetch data from the running League Client (LCU) local HTTP API.

The lockfile holds '<pid>:<port>:<password>:<protocol>'.  The API listens on
127.0.0.1 and authenticates with HTTP basic auth as user 'riot'.

Usage:
  python lcu_fetch.py get  <path> [outfile]      # e.g. /lol-summoner/v1/current-summoner
  python lcu_fetch.py head <path> [n]            # first n bytes, for probing
  python lcu_fetch.py lockfile                   # print lockfile fields
"""
import base64
import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.request

# Install roots to probe; the region folder name is not assumed (the WeGame
# build nests the client under a localized directory).
ROOTS = [
    r"C:\Riot Games\League of Legends",
    r"D:\Riot Games\League of Legends",
    r"C:\WeGameApps",
    r"D:\WeGameApps",
    r"C:\Program Files\WeGame",
]


def find_client_dirs():
    """Return LeagueClient dirs found under the known roots (env LOL_INSTALL wins)."""
    override = os.environ.get("LOL_INSTALL")
    roots = [override] if override else ROOTS
    found = []
    for root in roots:
        if not root or not os.path.isdir(root):
            continue
        direct = os.path.join(root, "LeagueClient")
        if os.path.exists(os.path.join(direct, "LeagueClient.exe")):
            found.append(direct)
            continue
        for name in os.listdir(root):
            nested = os.path.join(root, name, "LeagueClient")
            if os.path.exists(os.path.join(nested, "LeagueClient.exe")):
                found.append(nested)
    return found


def parse_lockfile(path):
    """Read '<pid>:<port>:<password>:<protocol>'; empty on Tencent/WeGame builds."""
    try:
        # The client keeps the file open with a share mode that still allows read.
        with open(path, "rb") as fh:
            raw = fh.read().decode("utf-8", "replace").strip()
    except OSError:
        return None
    parts = raw.split(":")
    if len(parts) >= 4:
        return {"path": path, "pid": parts[0], "port": parts[1],
                "password": parts[2], "protocol": parts[3]}
    return None


def read_lockfile():
    clients = find_client_dirs()
    if not clients:
        raise SystemExit("no League install found (set LOL_INSTALL to the game folder)")
    for client in clients:
        creds = parse_lockfile(os.path.join(client, "lockfile"))
        if creds:
            return creds
    # Tencent/WeGame builds ship an empty lockfile and pass the credentials on
    # the command line instead, which the UX log echoes at startup.
    folders = [c for c in clients]
    folders += [os.path.join(os.path.dirname(c), "Game", "Logs", "LeagueClient Logs")
                for c in clients]
    return read_from_log(folders)


def read_from_log(folders):
    import glob
    logs = []
    for folder in folders:
        logs += glob.glob(os.path.join(folder, "*LeagueClientUx.log"))
    if not logs:
        raise SystemExit("no lockfile and no UX log found (client not running?)")
    newest = max(logs, key=os.path.getmtime)
    with open(newest, "rb") as fh:
        text = fh.read(400000).decode("utf-8", "replace")
    m_port = re.search(r"--app-port=(\d+)", text)
    m_tok = re.search(r"--remoting-auth-token=([\w-]+)", text)
    if not (m_port and m_tok):
        raise SystemExit(f"credentials not found in {newest}")
    return {"path": newest, "pid": "?", "port": m_port.group(1),
            "password": m_tok.group(1), "protocol": "https"}


def request(lf, path, raw=False):
    url = f"{lf['protocol']}://127.0.0.1:{lf['port']}{path}"
    req = urllib.request.Request(url)
    token = base64.b64encode(f"riot:{lf['password']}".encode()).decode()
    req.add_header("Authorization", f"Basic {token}")
    req.add_header("Accept", "*/*")
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    with urllib.request.urlopen(req, timeout=60, context=ctx) as resp:
        data = resp.read()
    return data if raw else data.decode("utf-8", "replace")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    lf = read_lockfile()
    cmd = sys.argv[1]
    if cmd == "lockfile":
        safe = dict(lf)
        safe["password"] = "***"
        print(json.dumps(safe, ensure_ascii=False, indent=2))
        return 0

    path = sys.argv[2]
    raw = cmd == "get-bytes"
    try:
        data = request(lf, path, raw=raw or cmd == "head")
    except urllib.error.HTTPError as exc:
        print(f"HTTP {exc.code} for {path}")
        return 1
    if cmd == "head":
        n = int(sys.argv[3]) if len(sys.argv) > 3 else 400
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        print(data[:n].decode("utf-8", "replace") if isinstance(data, bytes) else data[:n])
        return 0
    out = sys.argv[3] if len(sys.argv) > 3 else None
    if out:
        mode = "wb" if raw else "w"
        with open(out, mode, encoding=None if raw else "utf-8") as fh:
            fh.write(data)
        print(f"wrote {len(data):,} to {out}")
    else:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        print(data if isinstance(data, str) else f"{len(data)} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
