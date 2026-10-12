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
PIPELINE_VERSION = "freeski-atlas-v3"
RUNTIME_SCALE = 0.55
MOGUL_GEOMETRY = json.loads((ROOT / "src/world/mogulPatchGeometry.json").read_text())
MOGUL_POINTS = [
    {"x": (x - MOGUL_GEOMETRY["sourceWidth"] / 2) * MOGUL_GEOMETRY["heightMeters"] / MOGUL_GEOMETRY["sourceHeight"],
     "y": (y - MOGUL_GEOMETRY["sourceHeight"] * MOGUL_GEOMETRY["originY"]) * MOGUL_GEOMETRY["heightMeters"] / MOGUL_GEOMETRY["sourceHeight"] + MOGUL_GEOMETRY["drawOffsetYMeters"]}
    for x, y in MOGUL_GEOMETRY["outline"]
]
MOGUL_RADIUS = max(math.hypot(point["x"], point["y"]) for point in MOGUL_POINTS)
EDGE_BLEED_MAX_MAIN_FRACTION = 0.12


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
    edge_bleed_components_removed: int = 0
    normalization_scale: float = 1.0
    runtime_source_size: tuple[int, int] = (1, 1)
    runtime_trim: tuple[int, int, int, int] = (0, 0, 1, 1)
    atlas_x: int = 0
    atlas_y: int = 0


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def family_for(name: str) -> str:
    if name.startswith(("yeti/run-side-", "walking-tree/walk-")):
        return name  # One common source scale preserves the four-frame gait.
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
    return bounds


def opaque_components(image: Image.Image) -> list[list[int]]:
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
    return components


def clear_components(image: Image.Image, components: list[list[int]]) -> Image.Image:
    if not components:
        return image
    pixels = list(image.get_flattened_data())
    for component in components:
        for index in component:
            pixels[index] = (0, 0, 0, 0)
    cleaned = Image.new("RGBA", image.size)
    cleaned.putdata(pixels)
    return cleaned


def remove_cell_edge_bleed(image: Image.Image) -> tuple[Image.Image, int]:
    """Discard small foreign components clipped in from adjacent sheet cells."""
    components = opaque_components(image)
    if not components:
        return image, 0
    main = max(components, key=len)
    maximum = max(24, round(len(main) * EDGE_BLEED_MAX_MAIN_FRACTION))
    width = image.width
    height = image.height
    bleed: list[list[int]] = []
    for component in components:
        if component is main or len(component) > maximum:
            continue
        touches_edge = any(
            index % width == 0
            or index % width == width - 1
            or index // width == 0
            or index // width == height - 1
            for index in component
        )
        if touches_edge:
            bleed.append(component)
    return clear_components(image, bleed), len(bleed)


def remove_specks(image: Image.Image) -> Image.Image:
    """Remove disconnected generation flecks while preserving real equipment."""
    components = opaque_components(image)
    if not components:
        return image
    largest = max(len(component) for component in components)
    minimum = max(24, round(largest * 0.0015))
    return clear_components(
        image, [component for component in components if len(component) < minimum]
    )


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
            if "cell_bounds" in sheet:
                # Generated sheets can overrun a nominal grid. Explicit source
                # regions retain entire feet while sharing the same Y canvas.
                left, top, right, bottom = sheet["cell_bounds"][index]
                if not (0 <= left < right <= source.width and 0 <= top < bottom <= source.height):
                    raise ValueError(f"invalid source region for {name}")
            cell = clean_matte(source.crop((left, top, right, bottom)))
            edge_bleed_components_removed = 0
            if not name.startswith("vfx/"):
                cell, edge_bleed_components_removed = remove_cell_edge_bleed(cell)
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
                    edge_bleed_components_removed=edge_bleed_components_removed,
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
    for frame in frames:
        if frame.name.startswith("yeti/run-side-"):
            frame.normalization_scale = 0.5
        if frame.name.startswith("walking-tree/walk-"):
            frame.normalization_scale = 1.0
        scale = frame.normalization_scale * RUNTIME_SCALE
        trim_left, trim_top, trim_right, trim_bottom = frame.trim
        cell_width = frame.cell[2] - frame.cell[0]
        cell_height = frame.cell[3] - frame.cell[1]
        runtime_trim_x = round(trim_left * scale)
        runtime_trim_y = round(trim_top * scale)
        runtime_width = max(1, round((trim_right - trim_left) * scale))
        runtime_height = max(1, round((trim_bottom - trim_top) * scale))
        runtime_right_margin = round((cell_width - trim_right) * scale)
        runtime_bottom_margin = round((cell_height - trim_bottom) * scale)
        frame.runtime_source_size = (
            runtime_trim_x + runtime_width + runtime_right_margin,
            runtime_trim_y + runtime_height + runtime_bottom_margin,
        )
        if frame.name.startswith(("yeti/run-side-", "walking-tree/walk-")):
            # Round the shared canvas once; summing separately rounded margins
            # can otherwise change body scale by one pixel between phases.
            frame.runtime_source_size = (
                round(cell_width * scale), round(cell_height * scale)
            )
        frame.runtime_trim = (
            runtime_trim_x,
            runtime_trim_y,
            runtime_width,
            runtime_height,
        )
        frame.image = frame.image.resize(
            (runtime_width, runtime_height), Image.Resampling.LANCZOS
        )


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
    left = image.crop((0, 0, 1, image.height)).resize(
        (PADDING, image.height), Image.Resampling.NEAREST
    )
    right = image.crop((image.width - 1, 0, image.width, image.height)).resize(
        (PADDING, image.height), Image.Resampling.NEAREST
    )
    top = image.crop((0, 0, image.width, 1)).resize(
        (image.width, PADDING), Image.Resampling.NEAREST
    )
    bottom = image.crop((0, image.height - 1, image.width, image.height)).resize(
        (image.width, PADDING), Image.Resampling.NEAREST
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
        atlas.alpha_composite(
            corner.resize((PADDING, PADDING), Image.Resampling.NEAREST),
            (target_x, target_y),
        )


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
        return (3.0, 0.2, 0.88)
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
        return (MOGUL_RADIUS, 0.18, MOGUL_GEOMETRY["originY"])
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
        runtime_trim_x, runtime_trim_y, runtime_width, runtime_height = (
            frame.runtime_trim
        )
        runtime_source_width, runtime_source_height = frame.runtime_source_size
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
                "x": runtime_trim_x,
                "y": runtime_trim_y,
                "w": runtime_width,
                "h": runtime_height,
            },
            "sourceSize": {
                "w": runtime_source_width,
                "h": runtime_source_height,
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
            "runtimeTrimBounds": {
                "x": runtime_trim_x,
                "y": runtime_trim_y,
                "width": runtime_width,
                "height": runtime_height,
            },
            "runtimeSourceSize": {
                "width": runtime_source_width,
                "height": runtime_source_height,
            },
            "atlasFrame": phaser_frames[frame.name]["frame"],
            "padding": PADDING,
            "normalizationFamily": frame.family,
            "normalizationScale": frame.normalization_scale,
            "edgeBleedComponentsRemoved": frame.edge_bleed_components_removed,
            "runtimeScale": RUNTIME_SCALE,
            "groundPivot": {
                "normalizedX": 0.5,
                "normalizedY": pivot_y,
                "pixelX": round(runtime_source_width * 0.5, 3),
                "pixelY": round(runtime_source_height * pivot_y, 3),
            },
            "footprint": {
                "shape": "circle",
                "offsetXMeters": 0,
                "offsetYMeters": 0.15 if footprint else 0,
                "radiusMeters": footprint,
            },
            "clearanceHeightMeters": clearance,
        }
        if frame.name == "terrain/mogul-field":
            metadata_frames[frame.name]["footprint"] = {
                "shape": "polygon", "offsetXMeters": 0, "offsetYMeters": 0,
                "radiusMeters": MOGUL_RADIUS, "pointsMeters": MOGUL_POINTS,
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
    extrusion_mismatch_pixels = 0
    non_empty_padding_bands = 0
    geometry_mismatches: list[str] = []
    removed_edge_bleed_components = 0
    padded_rectangles: list[tuple[str, int, int, int, int]] = []
    for name, value in phaser["frames"].items():
        rectangle = value["frame"]
        source_size = value["sourceSize"]
        sprite_source = value["spriteSourceSize"]
        if (
            sprite_source["w"] != rectangle["w"]
            or sprite_source["h"] != rectangle["h"]
            or sprite_source["x"] < 0
            or sprite_source["y"] < 0
            or sprite_source["x"] + sprite_source["w"] > source_size["w"]
            or sprite_source["y"] + sprite_source["h"] > source_size["h"]
        ):
            geometry_mismatches.append(name)
        metadata_frame = metadata["frames"][name]
        removed_edge_bleed_components += metadata_frame.get(
            "edgeBleedComponentsRemoved", 0
        )
        runtime_trim = metadata_frame["runtimeTrimBounds"]
        runtime_source = metadata_frame["runtimeSourceSize"]
        if (
            runtime_trim["x"] != sprite_source["x"]
            or runtime_trim["y"] != sprite_source["y"]
            or runtime_trim["width"] != rectangle["w"]
            or runtime_trim["height"] != rectangle["h"]
            or runtime_source["width"] != source_size["w"]
            or runtime_source["height"] != source_size["h"]
        ):
            geometry_mismatches.append(name)
        padded_rectangles.append(
            (
                name,
                rectangle["x"] - PADDING,
                rectangle["y"] - PADDING,
                rectangle["x"] + rectangle["w"] + PADDING,
                rectangle["y"] + rectangle["h"] + PADDING,
            )
        )
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
        x = rectangle["x"]
        y = rectangle["y"]
        width = rectangle["w"]
        height = rectangle["h"]
        edge_bands = (
            (
                atlas.crop((x - PADDING, y, x, y + height)),
                frame.crop((0, 0, 1, height)).resize(
                    (PADDING, height), Image.Resampling.NEAREST
                ),
            ),
            (
                atlas.crop((x + width, y, x + width + PADDING, y + height)),
                frame.crop((width - 1, 0, width, height)).resize(
                    (PADDING, height), Image.Resampling.NEAREST
                ),
            ),
            (
                atlas.crop((x, y - PADDING, x + width, y)),
                frame.crop((0, 0, width, 1)).resize(
                    (width, PADDING), Image.Resampling.NEAREST
                ),
            ),
            (
                atlas.crop((x, y + height, x + width, y + height + PADDING)),
                frame.crop((0, height - 1, width, height)).resize(
                    (width, PADDING), Image.Resampling.NEAREST
                ),
            ),
        )
        for actual, expected_band in edge_bands:
            extrusion_mismatch_pixels += sum(
                actual_pixel != expected_pixel
                for actual_pixel, expected_pixel in zip(
                    actual.get_flattened_data(),
                    expected_band.get_flattened_data(),
                    strict=True,
                )
            )
            if any(pixel[3] > 0 for pixel in actual.get_flattened_data()):
                non_empty_padding_bands += 1
        corner_pixels = (
            (x - PADDING, y - PADDING, frame.getpixel((0, 0))),
            (x + width, y - PADDING, frame.getpixel((width - 1, 0))),
            (x - PADDING, y + height, frame.getpixel((0, height - 1))),
            (
                x + width,
                y + height,
                frame.getpixel((width - 1, height - 1)),
            ),
        )
        for corner_x, corner_y, expected_pixel in corner_pixels:
            corner = atlas.crop(
                (
                    corner_x,
                    corner_y,
                    corner_x + PADDING,
                    corner_y + PADDING,
                )
            )
            extrusion_mismatch_pixels += sum(
                pixel != expected_pixel for pixel in corner.get_flattened_data()
            )
        if name.startswith("vfx/"):
            continue
        transparent_corners &= any(
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
        raise RuntimeError("non-VFX frame has no transparent trim corner")
    if extrusion_mismatch_pixels:
        raise RuntimeError(
            f"atlas extrusion has {extrusion_mismatch_pixels} mismatched pixels"
        )
    expected_padding_bands = expected * 4
    if non_empty_padding_bands != expected_padding_bands:
        raise RuntimeError(
            "atlas contains empty pseudo-extrusion: "
            f"{non_empty_padding_bands}/{expected_padding_bands} bands contain content"
        )
    if geometry_mismatches:
        raise RuntimeError(
            f"inconsistent runtime trim geometry: {sorted(set(geometry_mismatches))}"
        )
    overlaps: list[tuple[str, str]] = []
    for index, first in enumerate(padded_rectangles):
        for second in padded_rectangles[index + 1 :]:
            if not (
                first[3] <= second[1]
                or second[3] <= first[1]
                or first[4] <= second[2]
                or second[4] <= first[2]
            ):
                overlaps.append((first[0], second[0]))
    if overlaps:
        raise RuntimeError(f"padded atlas rectangles overlap: {overlaps}")
    print(
        json.dumps(
            {
                "atlas": f"{atlas.width}x{atlas.height}",
                "frames": expected,
                "magentaPixelRatio": round(ratio, 8),
                "extrudedFrames": expected,
                "extrusionMismatchPixels": extrusion_mismatch_pixels,
                "nonEmptyPaddingBands": non_empty_padding_bands,
                "paddingOverlaps": len(overlaps),
                "geometryMismatches": len(geometry_mismatches),
                "removedEdgeBleedComponents": removed_edge_bleed_components,
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
