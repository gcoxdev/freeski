#!/usr/bin/env python3
"""Build FreeSki's production atlas without mutating approved concept sheets."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import statistics
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "assets" / "sprite-sheets"
OUTPUT_DIR = ROOT / "public" / "assets" / "production"
MANIFEST_PATH = SOURCE_DIR / "manifest.json"
ATLAS_WIDTH = 1024
PADDING = 4
ALPHA_CROP_THRESHOLD = 8
PIPELINE_VERSION = "freeski-atlas-v1"
RUNTIME_SCALE = 0.55


@dataclass
class Frame:
    name: str
    source_sheet: str
    source_sha256: str
    cell_index: int
    cell: tuple[int, int, int, int]
    trim: tuple[int, int, int, int]
    image: Image.Image
    family: str
    normalization_scale: float = 1.0
    atlas_x: int = 0
    atlas_y: int = 0


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def family_for(name: str) -> str:
    prefix = name.split("/", 1)[0]
    return prefix if prefix in {
        "player",
        "beginner",
        "snowboarder",
        "dog",
        "chairlift",
        "yeti",
        "walking-tree",
    } else name


def clean_matte(image: Image.Image) -> Image.Image:
    """Remove residual keyed edge pixels without disturbing the approved matte."""
    rgba = image.convert("RGBA")
    source = list(rgba.get_flattened_data())
    cleaned: list[tuple[int, int, int, int]] = []
    for index, (red, green, blue, alpha) in enumerate(source):
        if alpha <= 3:
            cleaned.append((0, 0, 0, 0))
            continue
        magenta_excess = min(red, blue) - green
        if alpha < 24 and magenta_excess > 72:
            cleaned.append((0, 0, 0, 0))
            continue
        if alpha < 245 and magenta_excess > 42:
            x = index % rgba.width
            y = index // rgba.width
            neighbours: list[tuple[int, int, int]] = []
            for sample_y in range(max(0, y - 2), min(rgba.height, y + 3)):
                for sample_x in range(max(0, x - 2), min(rgba.width, x + 3)):
                    sample = source[sample_y * rgba.width + sample_x]
                    sample_red, sample_green, sample_blue, sample_alpha = sample
                    if (
                        sample_alpha >= 180
                        and min(sample_red, sample_blue) - sample_green < 28
                    ):
                        neighbours.append((sample_red, sample_green, sample_blue))
            if neighbours:
                red = round(sum(value[0] for value in neighbours) / len(neighbours))
                green = round(sum(value[1] for value in neighbours) / len(neighbours))
                blue = round(sum(value[2] for value in neighbours) / len(neighbours))
        cleaned.append((red, green, blue, alpha))
    rgba.putdata(cleaned)
    return rgba


def alpha_bounds(image: Image.Image) -> tuple[int, int, int, int]:
    mask = image.getchannel("A").point(
        lambda value: 255 if value > ALPHA_CROP_THRESHOLD else 0
    )
    bounds = mask.getbbox()
    if bounds is None:
        return (0, 0, 1, 1)
    left, top, right, bottom = bounds
    return (
        max(0, left - 1),
        max(0, top - 1),
        min(image.width, right + 1),
        min(image.height, bottom + 1),
    )


def remove_specks(image: Image.Image) -> Image.Image:
    """Remove disconnected generation flecks while preserving real equipment."""
    alpha = image.getchannel("A")
    active = bytearray(1 if value > ALPHA_CROP_THRESHOLD else 0 for value in alpha.get_flattened_data())
    visited = bytearray(len(active))
    components: list[list[int]] = []
    width = image.width
    height = image.height
    for start, present in enumerate(active):
        if not present or visited[start]:
            continue
        visited[start] = 1
        stack = [start]
        component: list[int] = []
        while stack:
            current = stack.pop()
            component.append(current)
            x = current % width
            y = current // width
            for neighbour_y in range(max(0, y - 1), min(height, y + 2)):
                for neighbour_x in range(max(0, x - 1), min(width, x + 2)):
                    neighbour = neighbour_y * width + neighbour_x
                    if active[neighbour] and not visited[neighbour]:
                        visited[neighbour] = 1
                        stack.append(neighbour)
        components.append(component)
    if not components:
        return image
    largest = max(len(component) for component in components)
    minimum = max(24, round(largest * 0.0015))
    pixels = list(image.get_flattened_data())
    for component in components:
        if len(component) >= minimum:
            continue
        for index in component:
            pixels[index] = (0, 0, 0, 0)
    cleaned = Image.new("RGBA", image.size)
    cleaned.putdata(pixels)
    return cleaned


def extract_frames(manifest: dict[str, Any]) -> list[Frame]:
    frames: list[Frame] = []
    for sheet in manifest["sheets"]:
        source_path = SOURCE_DIR / sheet["file"]
        source_hash = sha256(source_path)
        source = Image.open(source_path).convert("RGBA")
        columns = int(sheet["columns"])
        rows = int(sheet["rows"])
        for index, name in enumerate(sheet["cells"]):
            column = index % columns
            row = index // columns
            left = column * source.width // columns
            right = (column + 1) * source.width // columns
            top = row * source.height // rows
            bottom = (row + 1) * source.height // rows
            cell = clean_matte(source.crop((left, top, right, bottom)))
            if not name.startswith("vfx/"):
                cell = remove_specks(cell)
            trim = alpha_bounds(cell)
            frames.append(
                Frame(
                    name=name,
                    source_sheet=sheet["file"],
                    source_sha256=source_hash,
                    cell_index=index,
                    cell=(left, top, right, bottom),
                    trim=trim,
                    image=cell.crop(trim),
                    family=family_for(name),
                )
            )
    return frames


def normalize_families(frames: list[Frame]) -> None:
    families: dict[str, list[Frame]] = {}
    for frame in frames:
        if frame.family != frame.name:
            families.setdefault(frame.family, []).append(frame)
    for family_frames in families.values():
        target_extent = statistics.median(
            max(frame.image.width, frame.image.height) for frame in family_frames
        )
        for frame in family_frames:
            extent = max(frame.image.width, frame.image.height)
            scale = max(0.82, min(1.22, target_extent / max(1, extent)))
            frame.normalization_scale = round(scale, 6)
            if abs(scale - 1) < 0.005:
                continue
            frame.image = frame.image.resize(
                (
                    max(1, round(frame.image.width * scale)),
                    max(1, round(frame.image.height * scale)),
                ),
                Image.Resampling.LANCZOS,
            )
    for frame in frames:
        resized = frame.image.resize(
            (
                max(1, round(frame.image.width * RUNTIME_SCALE)),
                max(1, round(frame.image.height * RUNTIME_SCALE)),
            ),
            Image.Resampling.LANCZOS,
        )
        frame.image = Image.new(
            "RGBA", (resized.width + 2, resized.height + 2), (0, 0, 0, 0)
        )
        frame.image.alpha_composite(resized, (1, 1))


def pack(frames: list[Frame]) -> tuple[int, int]:
    cursor_x = PADDING
    cursor_y = PADDING
    shelf_height = 0
    for frame in sorted(frames, key=lambda value: (-value.image.height, value.name)):
        padded_width = frame.image.width + PADDING * 2
        padded_height = frame.image.height + PADDING * 2
        if cursor_x + padded_width + PADDING > ATLAS_WIDTH:
            cursor_x = PADDING
            cursor_y += shelf_height
            shelf_height = 0
        frame.atlas_x = cursor_x + PADDING
        frame.atlas_y = cursor_y + PADDING
        cursor_x += padded_width
        shelf_height = max(shelf_height, padded_height)
    used_height = cursor_y + shelf_height + PADDING
    atlas_height = 1 << math.ceil(math.log2(max(1, used_height)))
    if atlas_height > 4096:
        raise RuntimeError(f"atlas height {atlas_height} exceeds 4096px")
    return ATLAS_WIDTH, atlas_height


def paste_extruded(atlas: Image.Image, frame: Frame) -> None:
    x = frame.atlas_x
    y = frame.atlas_y
    image = frame.image
    atlas.alpha_composite(image, (x, y))
    left = image.crop((0, 0, 1, image.height)).resize((PADDING, image.height))
    right = image.crop((image.width - 1, 0, image.width, image.height)).resize(
        (PADDING, image.height)
    )
    top = image.crop((0, 0, image.width, 1)).resize((image.width, PADDING))
    bottom = image.crop((0, image.height - 1, image.width, image.height)).resize(
        (image.width, PADDING)
    )
    atlas.alpha_composite(left, (x - PADDING, y))
    atlas.alpha_composite(right, (x + image.width, y))
    atlas.alpha_composite(top, (x, y - PADDING))
    atlas.alpha_composite(bottom, (x, y + image.height))
    corners = [
        (image.crop((0, 0, 1, 1)), x - PADDING, y - PADDING),
        (image.crop((image.width - 1, 0, image.width, 1)), x + image.width, y - PADDING),
        (image.crop((0, image.height - 1, 1, image.height)), x - PADDING, y + image.height),
        (
            image.crop((image.width - 1, image.height - 1, image.width, image.height)),
            x + image.width,
            y + image.height,
        ),
    ]
    for corner, target_x, target_y in corners:
        atlas.alpha_composite(corner.resize((PADDING, PADDING)), (target_x, target_y))


def geometry_for(name: str) -> tuple[float, float, float]:
    prefix = name.split("/", 1)[0]
    if prefix == "player":
        return (0.65, 1.8, 0.94)
    values = {
        "beginner": (0.75, 1.45, 0.94),
        "snowboarder": (0.75, 1.35, 0.94),
        "dog": (0.65, 0.42, 0.88),
        "chairlift": (0.7, 3.2, 0.52),
        "yeti": (1.35, 2.7, 0.95),
        "walking-tree": (2.2, 2.35, 0.94),
        "terrain": (1.0, 0.7, 0.92),
        "secret": (0.7, 0.2, 0.88),
        "lift": (1.4, 2.6, 0.92),
        "course": (0.5, 1.4, 0.94),
        "vfx": (0.0, 0.0, 0.5),
    }
    radius, clearance, pivot = values.get(prefix, (0.5, 0.5, 0.92))
    if name == "terrain/rainbow-ramp":
        return (2.0, 0.2, 0.79)
    if name == "terrain/evergreen-small":
        return (1.45, 2.0, 0.94)
    if name == "terrain/evergreen-medium":
        return (1.85, 2.2, 0.94)
    if name == "terrain/evergreen-large":
        return (2.2, 2.35, 0.94)
    if name == "terrain/dead-tree":
        return (2.2, 2.35, 0.94)
    if name == "terrain/stump":
        return (1.0, 0.68, 0.86)
    if name == "terrain/rock":
        return (1.35, 0.72, 0.84)
    if name == "terrain/bump-small":
        return (0.8, 0.08, 0.78)
    if name == "terrain/bump-large":
        return (1.5, 0.16, 0.78)
    if name == "terrain/mogul-field":
        return (1.1, 0.18, 0.8)
    return (radius, clearance, pivot)


def write_outputs(frames: list[Frame], manifest: dict[str, Any]) -> None:
    width, height = pack(frames)
    atlas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    for frame in frames:
        paste_extruded(atlas, frame)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    atlas_path = OUTPUT_DIR / "freeski-atlas.png"
    atlas.save(atlas_path, optimize=True, compress_level=9)

    phaser_frames: dict[str, Any] = {}
    metadata_frames: dict[str, Any] = {}
    for frame in sorted(frames, key=lambda value: value.name):
        cell_left, cell_top, cell_right, cell_bottom = frame.cell
        trim_left, trim_top, trim_right, trim_bottom = frame.trim
        footprint, clearance, pivot_y = geometry_for(frame.name)
        phaser_frames[frame.name] = {
            "frame": {
                "x": frame.atlas_x,
                "y": frame.atlas_y,
                "w": frame.image.width,
                "h": frame.image.height,
            },
            "rotated": False,
            "trimmed": True,
            "spriteSourceSize": {
                "x": trim_left,
                "y": trim_top,
                "w": trim_right - trim_left,
                "h": trim_bottom - trim_top,
            },
            "sourceSize": {
                "w": cell_right - cell_left,
                "h": cell_bottom - cell_top,
            },
            "pivot": {"x": 0.5, "y": pivot_y},
        }
        metadata_frames[frame.name] = {
            "sourceSheet": frame.source_sheet,
            "sourceSha256": frame.source_sha256,
            "cellIndex": frame.cell_index,
            "cellBounds": {
                "x": cell_left,
                "y": cell_top,
                "width": cell_right - cell_left,
                "height": cell_bottom - cell_top,
            },
            "trimBounds": {
                "x": trim_left,
                "y": trim_top,
                "width": trim_right - trim_left,
                "height": trim_bottom - trim_top,
            },
            "atlasFrame": phaser_frames[frame.name]["frame"],
            "padding": PADDING,
            "normalizationFamily": frame.family,
            "normalizationScale": frame.normalization_scale,
            "runtimeScale": RUNTIME_SCALE,
            "groundPivot": {
                "normalizedX": 0.5,
                "normalizedY": pivot_y,
                "pixelX": round(frame.image.width * 0.5, 3),
                "pixelY": round(frame.image.height * pivot_y, 3),
            },
            "footprint": {
                "shape": "circle",
                "offsetXMeters": 0,
                "offsetYMeters": 0.15 if footprint else 0,
                "radiusMeters": footprint,
            },
            "clearanceHeightMeters": clearance,
        }

    phaser = {
        "frames": phaser_frames,
        "meta": {
            "app": PIPELINE_VERSION,
            "version": "1.0",
            "image": "freeski-atlas.png",
            "format": "RGBA8888",
            "size": {"w": width, "h": height},
            "scale": "1",
        },
    }
    metadata = {
        "pipelineVersion": PIPELINE_VERSION,
        "sourceManifest": str(MANIFEST_PATH.relative_to(ROOT)),
        "sourceManifestSha256": sha256(MANIFEST_PATH),
        "approvedSourcesPreserved": True,
        "runtimeScale": RUNTIME_SCALE,
        "frameCount": len(frames),
        "atlas": {
            "image": "freeski-atlas.png",
            "width": width,
            "height": height,
            "extrudedPaddingPixels": PADDING,
            "sha256": sha256(atlas_path),
        },
        "frames": metadata_frames,
        "sourceStatus": manifest["status"],
    }
    (OUTPUT_DIR / "freeski-atlas.json").write_text(
        json.dumps(phaser, indent=2) + "\n", encoding="utf-8"
    )
    (OUTPUT_DIR / "freeski-atlas.meta.json").write_text(
        json.dumps(metadata, indent=2) + "\n", encoding="utf-8"
    )


def validate() -> None:
    atlas_path = OUTPUT_DIR / "freeski-atlas.png"
    phaser_path = OUTPUT_DIR / "freeski-atlas.json"
    metadata_path = OUTPUT_DIR / "freeski-atlas.meta.json"
    for path in (atlas_path, phaser_path, metadata_path):
        if not path.exists():
            raise RuntimeError(f"missing generated asset: {path.relative_to(ROOT)}")
    atlas = Image.open(atlas_path).convert("RGBA")
    phaser = json.loads(phaser_path.read_text(encoding="utf-8"))
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    expected = sum(len(sheet["cells"]) for sheet in json.loads(MANIFEST_PATH.read_text())["sheets"])
    if len(phaser["frames"]) != expected or metadata["frameCount"] != expected:
        raise RuntimeError("generated frame count does not match source manifest")
    if metadata["atlas"]["extrudedPaddingPixels"] != PADDING:
        raise RuntimeError("atlas padding metadata is invalid")
    if metadata["atlas"]["sha256"] != sha256(atlas_path):
        raise RuntimeError("atlas checksum mismatch")
    magenta_pixels = 0
    opaque_pixels = 0
    transparent_corners = True
    for name, value in phaser["frames"].items():
        rectangle = value["frame"]
        frame = atlas.crop(
            (
                rectangle["x"],
                rectangle["y"],
                rectangle["x"] + rectangle["w"],
                rectangle["y"] + rectangle["h"],
            )
        )
        frame_pixels = frame.get_flattened_data()
        opaque_pixels += sum(1 for *_, alpha in frame_pixels if alpha > 16)
        magenta_pixels += sum(
            1
            for red, green, blue, alpha in frame_pixels
            if alpha > 16 and red > 180 and blue > 180 and green < 70
        )
        if name.startswith("vfx/"):
            continue
        transparent_corners &= all(
            frame.getpixel(point)[3] < 16
            for point in [
                (0, 0),
                (frame.width - 1, 0),
                (0, frame.height - 1),
                (frame.width - 1, frame.height - 1),
            ]
        )
    ratio = magenta_pixels / max(1, opaque_pixels)
    if ratio > 0.00035:
        raise RuntimeError(f"magenta audit ratio too high: {ratio:.6f}")
    if not transparent_corners:
        raise RuntimeError("non-VFX frame has an opaque trim corner")
    print(
        json.dumps(
            {
                "atlas": f"{atlas.width}x{atlas.height}",
                "frames": expected,
                "magentaPixelRatio": round(ratio, 8),
                "paddingPixels": PADDING,
                "transparentCorners": transparent_corners,
            },
            sort_keys=True,
        )
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    arguments = parser.parse_args()
    if not arguments.check:
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        frames = extract_frames(manifest)
        normalize_families(frames)
        write_outputs(frames, manifest)
    validate()


if __name__ == "__main__":
    main()
