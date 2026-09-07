import zlib
import struct
import math


def png(width, height, rgba):
    def chunk(tag, data):
        chunk_data = tag + data
        return (
            struct.pack(">I", len(data))
            + chunk_data
            + struct.pack(">I", zlib.crc32(chunk_data) & 0xFFFFFFFF)
        )

    raw = b"".join(
        b"\x00" + rgba[y * width * 4 : (y + 1) * width * 4] for y in range(height)
    )
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


def make(path, size):
    px = bytearray(size * size * 4)
    for y in range(size):
        for x in range(size):
            # rounded-square blue background
            cx, cy = x + 0.5, y + 0.5
            half = size / 2.0
            corner = size * 0.18
            # distance to nearest corner center for rounding
            dx = min(cx, size - cx)
            dy = min(cy, size - cy)
            d = math.sqrt(max(0, dx - half + corner) ** 2 + max(0, dy - half + corner) ** 2)
            inside = dx < half - corner or dy < half - corner or d < corner
            off = (y * size + x) * 4
            if inside:
                px[off] = 26
                px[off + 1] = 115
                px[off + 2] = 232
                px[off + 3] = 255

    # draw a white checkmark
    # coordinates relative to size
    def edge(x1, y1, x2, y2, px, py, thickness):
        # distance from point to segment
        vx, vy = x2 - x1, y2 - y1
        wx, wy = px - x1, py - y1
        seg_len = vx * vx + vy * vy
        t = max(0, min(1, (wx * vx + wy * vy) / seg_len))
        proj_x, proj_y = vx * t + x1, vy * t + y1
        dist = math.hypot(px - proj_x, py - proj_y)
        return dist <= thickness / 2

    def in_check(x, y):
        s = size
        # three segments making a check: short down, long down-right, up-right
        if edge(0.28 * s, 0.5 * s, 0.42 * s, 0.66 * s, x, y, 0.11 * s):
            return True
        if edge(0.42 * s, 0.66 * s, 0.72 * s, 0.34 * s, x, y, 0.11 * s):
            return True
        return False

    for y in range(size):
        for x in range(size):
            off = (y * size + x) * 4
            if px[off + 3] == 255 and in_check(x + 0.5, y + 0.5):
                px[off] = 255
                px[off + 1] = 255
                px[off + 2] = 255
                px[off + 3] = 255

    with open(path, "wb") as f:
        f.write(png(size, size, bytes(px)))


make("icon16.png", 16)
make("icon48.png", 48)
make("icon128.png", 128)
print("icons regenerated")
