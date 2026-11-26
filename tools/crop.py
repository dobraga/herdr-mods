# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow"]
# ///
"""Crop a full-window Herdr shot to one mod's area, saved as its preview.png.

    uv run publish/crop.py <mod> <shot.png> [--dest ~/src/herdr-mods]
    uv run publish/crop.py --list

Regions are fractions of the window (x0, y0, x1, y1) in the main-folders layout.
Open the preview afterwards and check no real names, paths or messages are visible.
"""

import argparse
import logging
from pathlib import Path

from PIL import Image

logger = logging.getLogger(__name__)

Region = tuple[float, float, float, float]

RIGHT_PANEL: Region = (0.768, 0.05, 1.0, 0.97)
RIGHT_PANEL_MODS = (
    "changes-tabs",
    "files-tabs",
    "prs-panel",
    "loadout",
    "tasks",
    "inbox",
)

REGIONS: dict[str, Region] = {
    **dict.fromkeys(RIGHT_PANEL_MODS, RIGHT_PANEL),
    "space-folders": (0.0, 0.04, 0.2, 0.62),
    "agents-custom": (0.0, 0.48, 0.2, 0.75),
    "workspace-chrome-custom": (0.0, 0.0, 0.2, 0.08),
    "tabs-folders": (0.13, 0.0, 1.0, 0.05),
    "workspace-status-usage": (0.13, 0.965, 0.75, 1.0),
    "file-view": (0.13, 0.05, 0.77, 0.97),
    "file-picker": (0.25, 0.04, 0.75, 0.6),
    "new-tab": (0.25, 0.15, 0.75, 0.75),
    "new-menu-custom": (0.55, 0.04, 0.8, 0.4),
    "settings-custom": (0.2, 0.1, 0.8, 0.9),
    "desktop-toast": (0.55, 0.78, 1.0, 0.97),
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
    """Crop `shot` to the region of `mod`; save as `dest/mods/<mod>/preview.png`."""
    image = Image.open(shot).convert("RGB")
    width, height = image.size
    x0, y0, x1, y1 = REGIONS[mod]
    out = dest.expanduser() / "mods" / mod / "preview.png"
    image.crop(
        (int(x0 * width), int(y0 * height), int(x1 * width), int(y1 * height))
    ).save(out)
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
