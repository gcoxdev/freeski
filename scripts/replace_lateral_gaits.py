#!/usr/bin/env python3
"""Install reviewed whole-body lateral gait poses into the source sheets."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SHEETS = ROOT / "assets" / "sprite-sheets"


def alpha_bounds(image: Image.Image) -> tuple[int, int, int, int]:
    bounds = image.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError("pose contains no visible pixels")
    return bounds


def fit_pose(path: Path, size: tuple[int, int], margin: int = 14) -> Image.Image:
    pose = Image.open(path).convert("RGBA")
    pose = pose.crop(alpha_bounds(pose))
    maximum_width = size[0] - margin * 2
    maximum_height = size[1] - margin * 2
    scale = min(maximum_width / pose.width, maximum_height / pose.height)
    pose = pose.resize(
        (max(1, round(pose.width * scale)), max(1, round(pose.height * scale))),
        Image.Resampling.LANCZOS,
    )
    cell = Image.new("RGBA", size, (0, 0, 0, 0))
    cell.alpha_composite(
        pose,
        ((size[0] - pose.width) // 2, size[1] - margin - pose.height),
    )
    return cell


def mirror(cell: Image.Image) -> Image.Image:
    return cell.transpose(Image.Transpose.FLIP_LEFT_RIGHT)


def keyed(cell: Image.Image) -> Image.Image:
    background = Image.new("RGBA", cell.size, (255, 0, 255, 255))
    background.alpha_composite(cell)
    return background.convert("RGB")


def replace_cells(
    sheet_path: Path,
    chroma_path: Path,
    columns: int,
    rows: int,
    cells: dict[int, Image.Image],
) -> None:
    sheet = Image.open(sheet_path).convert("RGBA")
    chroma = Image.open(chroma_path).convert("RGB")
    for index, cell in cells.items():
        column = index % columns
        row = index // columns
        left = column * sheet.width // columns
        right = (column + 1) * sheet.width // columns
        top = row * sheet.height // rows
        bottom = (row + 1) * sheet.height // rows
        expected = (right - left, bottom - top)
        if cell.size != expected:
            raise ValueError(f"cell {index}: expected {expected}, received {cell.size}")
        sheet.paste((0, 0, 0, 0), (left, top, right, bottom))
        sheet.paste(cell, (left, top), cell)
        chroma.paste(keyed(cell), (left, top))
    sheet.save(sheet_path, optimize=True, compress_level=9)
    chroma.save(chroma_path, optimize=True, compress_level=9)


def depth_grade(
    cell: Image.Image,
    lighter_leg: list[tuple[int, int]],
    darker_leg: list[tuple[int, int]],
) -> Image.Image:
    """Make anatomical leg identity readable without adding artificial marks."""
    result = cell.copy()
    for polygon, factor in ((darker_leg, 0.76), (lighter_leg, 1.12)):
        mask = Image.new("L", cell.size, 0)
        ImageDraw.Draw(mask).polygon(polygon, fill=255)
        mask = mask.filter(ImageFilter.GaussianBlur(3))
        mask = Image.composite(mask, Image.new("L", cell.size, 0), cell.getchannel("A"))
        graded = ImageEnhance.Brightness(result).enhance(factor)
        result = Image.composite(graded, result, mask)
    return result


def color_proof(
    cell: Image.Image,
    red_leg: list[tuple[int, int]],
    blue_leg: list[tuple[int, int]],
) -> Image.Image:
    """Color anatomical legs while retaining texture for a review-only map."""
    result = cell.copy()
    for polygon, black, white in (
        (red_leg, (45, 0, 4), (255, 52, 61)),
        (blue_leg, (0, 15, 52), (35, 136, 255)),
    ):
        mask = Image.new("L", cell.size, 0)
        ImageDraw.Draw(mask).polygon(polygon, fill=255)
        alpha = cell.getchannel("A")
        mask = ImageChops.multiply(mask, alpha)
        colored = ImageOps.colorize(ImageOps.grayscale(result), black, white).convert(
            "RGBA"
        )
        colored.putalpha(cell.getchannel("A"))
        result = Image.composite(colored, result, mask)
    return result


def review_strip(frames: list[Image.Image], path: Path) -> None:
    tile_size = 270
    background = (220, 234, 244, 255)
    strip = Image.new("RGBA", (tile_size * len(frames) + 80, 340), background)
    for index, frame in enumerate(frames):
        pose = frame.crop(alpha_bounds(frame))
        scale = min(tile_size / pose.width, tile_size / pose.height)
        pose = pose.resize(
            (round(pose.width * scale), round(pose.height * scale)),
            Image.Resampling.LANCZOS,
        )
        x = 40 + index * tile_size + (tile_size - pose.width) // 2
        y = (strip.height - pose.height) // 2
        strip.alpha_composite(pose, (x, y))
    strip.save(path, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--yeti-a", type=Path, required=True)
    parser.add_argument("--yeti-b", type=Path, required=True)
    parser.add_argument("--tree-a", type=Path, required=True)
    parser.add_argument("--tree-b", type=Path, required=True)
    parser.add_argument("--yeti-b-proof", type=Path)
    parser.add_argument("--tree-b-proof", type=Path)
    arguments = parser.parse_args()

    yeti_a_red = [(95, 185), (150, 165), (174, 296), (20, 296), (30, 225)]
    yeti_a_blue = [(150, 165), (220, 180), (293, 296), (164, 296)]
    yeti_b_red = [(155, 165), (225, 180), (300, 297), (162, 297)]
    yeti_b_blue = [(105, 180), (165, 165), (165, 297), (16, 297), (25, 225)]
    yeti_a = depth_grade(
        fit_pose(arguments.yeti_a, (313, 314)),
        yeti_a_red,
        yeti_a_blue,
    )
    yeti_b = depth_grade(
        fit_pose(arguments.yeti_b, (314, 314)),
        yeti_b_red,
        yeti_b_blue,
    )
    replace_cells(
        SHEETS / "03-yeti.png",
        SHEETS / "source-chroma" / "03-yeti-chroma.png",
        4,
        4,
        {
            4: yeti_a,
            5: yeti_b,
            6: mirror(yeti_a),
            7: mirror(yeti_b),
        },
    )

    tree_a_red = [(105, 160), (155, 145), (161, 246), (23, 246), (60, 195)]
    tree_a_blue = [(155, 145), (225, 165), (284, 246), (156, 246)]
    tree_b_red = [(150, 145), (225, 165), (286, 246), (154, 246)]
    tree_b_blue = [(95, 165), (158, 145), (158, 246), (18, 246), (55, 195)]
    tree_a = depth_grade(
        fit_pose(arguments.tree_a, (307, 256), margin=10),
        tree_a_red,
        tree_a_blue,
    )
    tree_b = depth_grade(
        fit_pose(arguments.tree_b, (307, 256), margin=10),
        tree_b_red,
        tree_b_blue,
    )
    replace_cells(
        SHEETS / "04-terrain.png",
        SHEETS / "source-chroma" / "04-terrain-chroma.png",
        5,
        4,
        {16: tree_a, 17: tree_b},
    )

    proof_dir = SHEETS / "gait-proof"
    proof_dir.mkdir(exist_ok=True)
    yeti_a_proof = color_proof(yeti_a, yeti_a_red, yeti_a_blue)
    yeti_a_proof.save(proof_dir / "yeti-contact-a-leg-map.png", optimize=True)
    if arguments.yeti_b_proof:
        proof = fit_pose(arguments.yeti_b_proof, (314, 314))
        proof.save(proof_dir / "yeti-contact-b-leg-map.png", optimize=True)
        review_strip(
            [yeti_a, yeti_b, yeti_a_proof, proof],
            proof_dir / "yeti-review-a-b-proof.png",
        )
    tree_a_proof = color_proof(tree_a, tree_a_red, tree_a_blue)
    tree_a_proof.save(
        proof_dir / "walking-tree-contact-a-leg-map.png", optimize=True
    )
    if arguments.tree_b_proof:
        proof = fit_pose(arguments.tree_b_proof, (307, 256), margin=10)
        proof.save(proof_dir / "walking-tree-contact-b-leg-map.png", optimize=True)
        review_strip(
            [tree_a, tree_b, tree_a_proof, proof],
            proof_dir / "walking-tree-review-a-b-proof.png",
        )


if __name__ == "__main__":
    main()
