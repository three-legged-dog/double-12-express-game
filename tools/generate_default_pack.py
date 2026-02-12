import os, math

MAX_PIP = 12
STYLE_TAG = "DEFAULT"

OUT_DIR = os.path.join("packs", "default")
os.makedirs(OUT_DIR, exist_ok=True)

def canonical(a, b):
    return (a, b) if a <= b else (b, a)

def fn(a, b):
    lo, hi = canonical(a, b)
    return f"D12_{lo:02d}_{hi:02d}_{STYLE_TAG}.svg"

def pip_positions_3x4(n):
    """
    Returns a set of indices (0..11) to turn on in a 3x4 grid.
    Layout indices:
      0  1  2
      3  4  5
      6  7  8
      9 10 11
    Matches your UI logic:
      0..9 use 3x3 patterns, then add bottom row for 10..12.
    """
    positions3x3 = {
        0: [],
        1: [4],
        2: [0, 8],
        3: [0, 4, 8],
        4: [0, 2, 6, 8],
        5: [0, 2, 4, 6, 8],
        6: [0, 2, 3, 5, 6, 8],
        7: [0, 2, 3, 4, 5, 6, 8],
        8: [0, 1, 2, 3, 5, 6, 7, 8],
        9: [0, 1, 2, 3, 4, 5, 6, 7, 8]
    }
    c = max(0, min(12, int(n)))
    on = set(positions3x3[min(c, 9)])
    if c == 10: on.add(10)
    if c == 11: on.update([9, 11])
    if c == 12: on.update([9, 10, 11])
    return on

def grid_center(idx, x0, y0, w, h):
    # 3 cols, 4 rows
    col = idx % 3
    row = idx // 3
    cx = x0 + (col + 0.5) * (w / 3.0)
    cy = y0 + (row + 0.5) * (h / 4.0)
    return cx, cy

def tile_svg(a, b):
    # SVG canvas
    W, H = 420, 220
    PAD = 18
    R = 9.5  # pip radius

    # Outer tile rect
    rx = 18

    # Inner content box
    inner_x = PAD
    inner_y = PAD
    inner_w = W - PAD * 2
    inner_h = H - PAD * 2

    # Two halves
    gap = 10
    half_w = (inner_w - gap) / 2.0
    half_h = inner_h
    left_x = inner_x
    right_x = inner_x + half_w + gap

    # Pip grid inside each half (we inset a bit more)
    inset = 18
    gx = left_x + inset
    gy = inner_y + inset
    gw = half_w - inset * 2
    gh = half_h - inset * 2

    def half_pips(value, x_base):
        on = pip_positions_3x4(value)
        circles = []
        for idx in range(12):
            if idx not in on:
                continue
            cx, cy = grid_center(idx, x_base + inset, inner_y + inset, gw, gh)
            circles.append(f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{R}" fill="#0f172a" opacity="0.92"/>')
        return "\n      ".join(circles)

    left_p = half_pips(a, left_x)
    right_p = half_pips(b, right_x)

    # Small corner labels (subtle)
    label_style = 'font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="16" font-weight="700" fill="#0f172a" opacity="0.35"'
    a_txt = f'{a}'
    b_txt = f'{b}'

    # Build SVG
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
  <defs>
    <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#f8fafc"/>
      <stop offset="1" stop-color="#e7eef7"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000" flood-opacity="0.25"/>
    </filter>
  </defs>

  <!-- Tile body -->
  <rect x="8" y="8" width="{W-16}" height="{H-16}" rx="{rx}" fill="url(#g)" stroke="#cbd5e1" stroke-width="2" filter="url(#shadow)"/>

  <!-- Inner border -->
  <rect x="{inner_x}" y="{inner_y}" width="{inner_w}" height="{inner_h}" rx="{rx-6}" fill="rgba(255,255,255,0.65)" stroke="rgba(15,23,42,0.10)" stroke-width="1"/>

  <!-- Divider -->
  <rect x="{inner_x + half_w}" y="{inner_y + 10}" width="{gap}" height="{inner_h - 20}" rx="6" fill="rgba(15,23,42,0.08)"/>
  <rect x="{inner_x + half_w + gap/2 - 1}" y="{inner_y + 18}" width="2" height="{inner_h - 36}" rx="1" fill="rgba(15,23,42,0.10)"/>

  <!-- Labels -->
  <text x="{inner_x + 14}" y="{inner_y + 26}" {label_style}>{a_txt}</text>
  <text x="{inner_x + inner_w - 22}" y="{inner_y + inner_h - 10}" text-anchor="end" {label_style}>{b_txt}</text>

  <!-- Pips -->
  <g>
    {left_p}
  </g>
  <g>
    {right_p}
  </g>
</svg>
'''

# Write pack.json (if you didn't already)
pack_json = os.path.join(OUT_DIR, "pack.json")
if not os.path.exists(pack_json):
    with open(pack_json, "w", encoding="utf-8") as f:
        f.write('{\n'
                '  "id": "default",\n'
                '  "name": "Default",\n'
                '  "styleTag": "DEFAULT",\n'
                '  "author": "Double 12 Express",\n'
                '  "license": "All rights reserved",\n'
                '  "maxPip": 12,\n'
                '  "tileFormat": "D12_AA_BB_DEFAULT.svg",\n'
                '  "previewTile": "D12_06_12_DEFAULT.svg"\n'
                '}\n')

# Create all 91 SVGs
count = 0
for a in range(MAX_PIP + 1):
    for b in range(a, MAX_PIP + 1):
        path = os.path.join(OUT_DIR, fn(a, b))
        with open(path, "w", encoding="utf-8") as f:
            f.write(tile_svg(a, b))
        count += 1

# Optional preview.svg
preview_path = os.path.join(OUT_DIR, "preview.svg")
with open(preview_path, "w", encoding="utf-8") as f:
    f.write(tile_svg(6, 12))

print(f"✅ Generated {count} SVG tiles into {OUT_DIR}/")
print(f"✅ Wrote preview: {preview_path}")
