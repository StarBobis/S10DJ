"""Generate the application icons (PNG + ICO) without external libraries.

Draws the desk mark: a dark rounded square with an accent waveform.
Usage: python tools/make_icons.py
"""

import pathlib
import struct
import zlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "src-tauri" / "icons"
SIZES = (32, 128, 256, 512)

BG = (32, 32, 32, 255)
ACCENT = (76, 194, 255, 255)
TRANSPARENT = (0, 0, 0, 0)

# bars as (x, y, width, height) in a 512x512 box
BARS = [
    (96, 216, 34, 80),
    (156, 156, 34, 200),
    (216, 116, 34, 280),
    (276, 176, 34, 160),
    (336, 216, 34, 80),
    (396, 256, 24, 24),
]
CORNER = 96


def rounded_rect(x, y, w, h, radius):
    """Yield (x, y) inside a rounded rectangle."""
    for py in range(y, y + h):
        for px in range(x, x + w):
            dx = min(px - x, x + w - 1 - px)
            dy = min(py - y, y + h - 1 - py)
            if dx < radius and dy < radius:
                cx = radius - dx
                cy = radius - dy
                if cx * cx + cy * cy > radius * radius:
                    continue
            yield px, py


def render(size):
    scale = size / 512
    pixels = [[TRANSPARENT for _ in range(size)] for _ in range(size)]

    def paint(shape, color):
        for px, py in rounded_rect(*shape, radius=max(1, int(shape[2] / 2))):
            sx, sy = int(px * scale), int(py * scale)
            if 0 <= sx < size and 0 <= sy < size:
                pixels[sy][sx] = color

    for x, y in rounded_rect(0, 0, 512, 512, CORNER):
        sx, sy = int(x * scale), int(y * scale)
        if 0 <= sx < size and 0 <= sy < size:
            pixels[sy][sx] = BG

    for bar in BARS:
        paint(bar, ACCENT)
    return pixels


def write_png(path, size, pixels):
    raw = bytearray()
    for row in pixels:
        raw.append(0)
        for pixel in row:
            raw.extend(pixel)
    def chunk(tag, data):
        payload = tag + data
        return struct.pack(">I", len(data)) + payload + struct.pack(">I", zlib.crc32(payload) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


def write_ico(path, png_bytes):
    header = struct.pack("<HHH", 0, 1, 1)
    entry = struct.pack("<BBBBHHII", 0, 0, 0, 0, 1, 32, len(png_bytes), 22)
    path.write_bytes(header + entry + png_bytes)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rendered = {}
    for size in SIZES:
        pixels = render(size)
        rendered[size] = pixels
        write_png(OUT / f"icon_{size}.png", size, pixels)
    (OUT / "32x32.png").write_bytes((OUT / "icon_32.png").read_bytes())
    (OUT / "128x128.png").write_bytes((OUT / "icon_128.png").read_bytes())
    (OUT / "128x128@2x.png").write_bytes((OUT / "icon_256.png").read_bytes())
    (OUT / "icon.png").write_bytes((OUT / "icon_512.png").read_bytes())
    write_ico(OUT / "icon.ico", (OUT / "icon_256.png").read_bytes())
    for path in sorted(OUT.glob("*")):
        print(f"{path.name:16s} {path.stat().st_size:>8,} bytes")


if __name__ == "__main__":
    main()
