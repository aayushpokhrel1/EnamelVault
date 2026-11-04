"""Draws the phone app's icons into mobile/assets, from the mark in public/favicon.svg.

Run it when the mark or the palette changes:

    python scripts/phone-icons.py

Every icon under mobile/assets was the unmodified create-expo-app template artwork until
2026-11-02: a pale blue (#E6F4FD) that appears nowhere in DESIGN.md. Nothing failed, because
a wrong picture is not a type error and no test can see one. The app would have reached the
App Store carrying Expo's default icon.

This is the same lesson scripts/og-card.py already records: a drawing nobody generates drifts
from the product it is supposed to be. So the phone icons are GENERATED from the one mark,
and the mark is the SVG the web app serves, not a redrawing of it.

The mark, from public/favicon.svg, in its own 32-unit box: a bone enamel pot with a vermilion
lid on the deep pantry wall. Three flat rectangles and a knob, drawn to survive 16px. A plate
with a vermilion rim was tried first and rejected twice, so do not reintroduce a ring.
"""

from PIL import Image, ImageDraw

from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "mobile" / "assets"

# DESIGN.md tokens, the same three the favicon uses. None is invented here.
WALL = (31, 59, 52)
PLATE = (243, 237, 225)
ACTION = (181, 53, 20)

SS = 4  # supersample, then downscale: PIL has no antialiased shapes

# Scales are fractions of the 32-unit BOX, not of the canvas. The mark's ink is 21 of those
# units wide, so an icon drawn at 1.0 fills about two thirds of its canvas, which is what an
# app icon wants.
ICON = 0.98
# Android crops an adaptive icon to whatever shape the launcher likes, and only the inner 66%
# circle is guaranteed to survive. The ink is 21 x 18.6 units, so its diagonal is 0.877 of the
# box: 0.877 * s <= 0.66 puts the ceiling at s = 0.75, and this sits inside it.
ADAPTIVE = 0.70

# The favicon's four rectangles, in its 32-unit viewBox: (x, y, w, h, radius, fill).
# `None` as the fill means the wall, drawn only when the icon carries its own background.
MARK = [
    (7.0, 13.0, 18.0, 12.0, 3.0, PLATE),
    (5.5, 10.0, 21.0, 3.4, 1.7, ACTION),
    (14.6, 6.4, 2.8, 3.8, 1.4, ACTION),
]


def draw_mark(d: ImageDraw.ImageDraw, size: int, scale: float, flat: tuple | None = None) -> None:
    """Draw the pot centred in a `size` square, occupying `scale` of it.

    `flat` overrides every fill with one colour, which is what Android's monochrome icon is:
    a silhouette the launcher tints itself.
    """
    unit = size * scale / 32.0
    # The mark's own ink spans y 6.4 to 25 of the 32 box, so centring the BOX would sit the pot
    # low. Centre the ink instead.
    left = (size - 32 * unit) / 2
    top = (size - (25.0 + 6.4) * unit) / 2
    for x, y, w, h, r, fill in MARK:
        d.rounded_rectangle(
            [left + x * unit, top + y * unit, left + (x + w) * unit, top + (y + h) * unit],
            radius=r * unit,
            fill=flat if flat else fill,
        )


def canvas(size: int, background: tuple | None) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    big = size * SS
    image = Image.new("RGBA", (big, big), background + (255,) if background else (0, 0, 0, 0))
    return image, ImageDraw.Draw(image)


def save(image: Image.Image, size: int, name: str, opaque: bool) -> None:
    out = image.resize((size, size), Image.LANCZOS)
    # iOS rejects an app icon with an alpha channel, and the store rejects it late, after a
    # build has been uploaded. Flatten the ones that must be opaque here rather than finding
    # out from App Store Connect.
    if opaque:
        flat = Image.new("RGB", out.size, WALL)
        flat.paste(out, mask=out.split()[3])
        out = flat
    out.save(OUT / name)
    print(f"{name} {size}x{size} {'RGB' if opaque else 'RGBA'}")


def main() -> None:
    # iOS and the store listing. Square: iOS applies its own mask, and corners baked into the
    # file show up as dark fringing inside it.
    image, d = canvas(1024, WALL)
    draw_mark(d, 1024 * SS, ICON)
    save(image, 1024, "icon.png", opaque=True)

    # Android adaptive: foreground and background are separate layers, and the launcher crops
    # them to whatever shape it likes. Only the inner 66% circle is guaranteed visible, so the
    # pot is drawn well inside it.
    image, d = canvas(512, None)
    draw_mark(d, 512 * SS, ADAPTIVE)
    save(image, 512, "android-icon-foreground.png", opaque=False)

    image, _ = canvas(512, WALL)
    save(image, 512, "android-icon-background.png", opaque=True)

    # Themed icons: the launcher tints a silhouette, so every part must be one colour. The pot
    # and its lid merge into one shape at this point, which is what the mark looks like in a
    # monochrome launcher and is correct.
    image, d = canvas(512, None)
    draw_mark(d, 512 * SS, ADAPTIVE, flat=(255, 255, 255))
    save(image, 512, "android-icon-monochrome.png", opaque=False)

    # The splash. Transparent, because expo-splash-screen paints the wall behind it.
    image, d = canvas(1024, None)
    draw_mark(d, 1024 * SS, 0.55)
    save(image, 1024, "splash-icon.png", opaque=False)

    image, d = canvas(48, WALL)
    draw_mark(d, 48 * SS, ICON)
    save(image, 48, "favicon.png", opaque=True)


if __name__ == "__main__":
    main()
