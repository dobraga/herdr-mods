# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow"]
# ///
"""Render each mod's preview as a 1920x1080 slide.

Title, tagline, three points, and a crop of the app on the right.

    uv run tools/slides/render.py <mod> [<mod>...]   (default: every mod)

Inputs: slides.json (text, which part of the shot to show) and a full-window
shot per mod in $SHOTS (default /dev/shm/slideshots), made at 2x zoom with:

    ZOOM=2.0 tools/demo/setup.sh      # then run.sh and populate.sh
    NOCROP=1 OUT=/dev/shm/slideshots tools/demo/shoot.sh <mod>...

Chrome: $CHROME, or the Playwright Chromium under ~/.cache/ms-playwright.
"""

import json
import logging
import os
import subprocess
import sys
import tempfile
from html import escape
from pathlib import Path

from PIL import Image

logger = logging.getLogger(__name__)
HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent


def main() -> None:
    """Render the requested slides (all by default)."""
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    spec = json.loads((HERE / "slides.json").read_text())
    for mod in sys.argv[1:] or list(spec):
        logger.info("%s", render(mod, spec[mod]))


def render(mod: str, slide: dict) -> Path:
    """Crop the shot, fill the template and screenshot it into `<mod>/preview.png`."""
    shots = Path(os.environ.get("SHOTS", "/dev/shm/slideshots"))
    with tempfile.TemporaryDirectory() as tmp:
        crops = _crops(shots / f"{mod}.png", slide, Path(tmp))
        html = Path(tmp) / "slide.html"
        html.write_text(
            _fill(
                (HERE / slide.get("template", "template.html")).read_text(),
                mod,
                slide,
                crops,
            )
        )
        out = REPO / mod / "preview.png"
        subprocess.run(
            [
                _chrome(),
                "--headless=new",
                "--no-sandbox",
                "--hide-scrollbars",
                "--force-device-scale-factor=1",
                "--window-size=1920,1080",
                "--virtual-time-budget=2000",
                f"--screenshot={out}",
                f"file://{html}",
            ],
            check=True,
            capture_output=True,
        )
    return out


def _crop(shot: Path, box: list) -> Image.Image:
    """Crop one box, or several boxes (a list of boxes) stacked top to bottom at the widest width."""
    image = Image.open(shot).convert("RGB")
    w, h = image.size
    boxes = box if isinstance(box[0], list) else [box]
    parts = [
        image.crop((int(x0 * w), int(y0 * h), int(x1 * w), int(y1 * h)))
        for x0, y0, x1, y1 in boxes
    ]
    scale = 1700 / max(part.width for part in parts) if len(parts) > 1 else 1
    parts = [
        part.resize((round(part.width * scale), round(part.height * scale)), Image.LANCZOS)
        for part in parts
    ]
    width = max(part.width for part in parts)
    out = Image.new("RGB", (width, sum(part.height for part in parts)), parts[-1].getpixel((2, parts[-1].height // 2)))
    y = 0
    for part in parts:
        out.paste(part, (0, y))
        y += part.height
    return out


def _fill(template: str, mod: str, slide: dict, images: list[Path]) -> str:
    points = "".join(
        f"<li><span>{i:02d}</span>{escape(p)}</li>"
        for i, p in enumerate(slide["points"], 1)
    )
    values = {
        "name": mod,
        "title": escape(slide["title"]),
        "tsize": str(_title_size(slide["title"])),
        "lead": escape(slide["lead"]),
        "points": points,
    }
    figure = '<figure class="shot"><img src="{{image}}" style="{{mask}}"></figure>'
    mask = _mask(slide.get("fade", []))
    figures = "".join(
        figure.replace("{{image}}", f"file://{image}").replace("{{mask}}", mask)
        for image in images
    )
    template = template.replace(figure, figures)
    for key, value in values.items():
        template = template.replace("{{" + key + "}}", value)
    return template


def _crops(shot: Path, slide: dict, tmp: Path) -> list[Path]:
    """Save the crop as one image, or as one image per box when the slide sets `split`."""
    boxes = slide["crop"]
    if not (slide.get("split") and isinstance(boxes[0], list)):
        boxes = [boxes]
    paths = []
    for i, box in enumerate(boxes):
        path = tmp / f"crop{i}.png"
        image = _crop(shot, box)
        if len(boxes) > 1:
            image = image.resize((1500, round(image.height * 1500 / image.width)), Image.LANCZOS)
        image.save(path)
        paths.append(path)
    return paths


def _title_size(title: str) -> int:
    """Big titles for short names, smaller for long ones so they stay on one line."""
    return 150 if len(title) <= 8 else 128 if len(title) <= 11 else 104


def _mask(edges: list[str]) -> str:
    """CSS that fades the listed edges out, so cut-off elements do not look cropped."""
    fades = {
        "left": "linear-gradient(to right, transparent 0, #000 110px)",
        "right": "linear-gradient(to left, transparent 0, #000 110px)",
        "bottom": "linear-gradient(to top, transparent 0, #000 90px)",
    }
    layers = [fades[e] for e in edges]
    if not layers:
        return ""
    mask = ", ".join(layers)
    return (
        f"-webkit-mask-image: {mask}; -webkit-mask-composite: source-in; "
        "mask-composite: intersect;"
    )


def _chrome() -> str:
    if os.environ.get("CHROME"):
        return os.environ["CHROME"]
    found = sorted(
        Path.home().glob(".cache/ms-playwright/chromium-*/chrome-linux*/chrome")
    )
    if not found:
        raise SystemExit("no Chrome found: set CHROME=/path/to/chrome")
    return str(found[-1])


if __name__ == "__main__":
    main()
