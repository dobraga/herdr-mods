# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow"]
# ///
"""Crop a full-window Herdr shot to one mod's area, saved as its preview.png.

    uv run tools/crop.py <mod> <shot.png> [--dest ~/src/herdr-mods]
    uv run tools/crop.py --list

Regions are fractions of the window (x0, y0, x1, y1) in the main-folders layout.
Open the preview afterwards and check no real names, paths or messages are visible.
"""

import argparse
import logging
from pathlib import Path

from PIL import Image

logger = logging.getLogger(__name__)

Region = tuple[float, float, float, float]

RIGHT_PANEL: Region = (0.783, 0.05, 0.995, 0.945)
RIGHT_PANEL_MODS = (
    "dg-changes",
    "dg-files",
    "dg-prs",
    "dg-loadout",
    "dg-tasks",
    "dg-inbox",
)

REGIONS: dict[str, Region | list[Region]] = {
    **dict.fromkeys(RIGHT_PANEL_MODS, RIGHT_PANEL),
    "dg-spaces": (0.0, 0.04, 0.155, 0.32),
    "dg-agents": (0.0, 0.49, 0.155, 0.80),
    "dg-workspace-chrome": (0.0, 0.0, 0.153, 1.0),
    "dg-tabs": (0.155, 0.0, 1.0, 0.046),
    "dg-workspace-status": (0.155, 0.968, 0.84, 1.0),
    "dg-file-view": (0.158, 0.05, 0.78, 0.96),
    "dg-file-picker": (0.32, 0.05, 0.68, 0.58),
    "dg-new-tab": (0.40, 0.34, 0.60, 0.66),
    "dg-new-menu": (0.47, 0.052, 0.78, 0.405),
    "dg-settings": (0.24, 0.158, 0.76, 0.842),
    "dg-desktop-toast": (0.79, 0.85, 0.995, 0.945),
}


def main() -> None:
    """Parse arguments, then list the known mods or crop one shot."""
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    args = _parse_args()
    if args.list:
        logger.info("\n".join(sorted(REGIONS)))
        return
    if not args.mod or not args.shot:
        raise SystemExit("usage: crop.py <mod> <shot.png> [--dest DIR] | --list")
    logger.info("%s", crop_preview(args.mod, args.shot, args.dest))


def crop_preview(mod: str, shot: Path, dest: Path) -> Path:
    """Crop `shot` to the region of `mod`; save as `dest/<mod>/preview.png`."""
    image = Image.open(shot).convert("RGB")
    width, height = image.size
    regions = REGIONS[mod] if isinstance(REGIONS[mod], list) else [REGIONS[mod]]
    parts = [
        image.crop(
            (int(x0 * width), int(y0 * height), int(x1 * width), int(y1 * height))
        )
        for x0, y0, x1, y1 in regions
    ]
    sheet = Image.new(
        "RGB", (max(c.width for c in parts), sum(c.height for c in parts))
    )
    top = 0
    for part in parts:
        sheet.paste(part, (0, top))
        top += part.height
    out = dest.expanduser() / mod / "preview.png"
    sheet.save(out)
    return out


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("mod", nargs="?", choices=sorted(REGIONS))
    parser.add_argument("shot", nargs="?", type=Path)
    parser.add_argument("--dest", type=Path, default=Path("~/src/herdr-mods"))
    parser.add_argument("--list", action="store_true")
    return parser.parse_args()


if __name__ == "__main__":
    main()
