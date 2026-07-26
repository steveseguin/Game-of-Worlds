#!/usr/bin/env python3
"""Build deterministic derivatives from the curated lore production atlases.

The painted source images are intentionally kept beside their derivatives. This
script only crops, resizes, composites, and creates small code-native UI assets;
it does not attempt to regenerate the source artwork.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageOps


ROOT = Path(__file__).resolve().parents[1]
PRODUCTION = ROOT / "lore" / "visual-reference" / "production"
REFERENCE = ROOT / "lore" / "visual-reference"
WEB_LORE = ROOT / "public" / "lore" / "assets"
RESAMPLE = Image.Resampling.LANCZOS
BLACK = (3, 5, 8, 255)


def ensure(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def open_rgba(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def grid_cells(path: Path, cols: int, rows: int) -> list[Image.Image]:
    image = open_rgba(path)
    cells: list[Image.Image] = []
    for row in range(rows):
        for col in range(cols):
            left = round(col * image.width / cols)
            right = round((col + 1) * image.width / cols)
            top = round(row * image.height / rows)
            bottom = round((row + 1) * image.height / rows)
            cells.append(image.crop((left, top, right, bottom)))
    return cells


def contain(image: Image.Image, size: tuple[int, int], color=BLACK) -> Image.Image:
    fitted = ImageOps.contain(image, size, method=RESAMPLE)
    canvas = Image.new("RGBA", size, color)
    canvas.alpha_composite(
        fitted, ((size[0] - fitted.width) // 2, (size[1] - fitted.height) // 2)
    )
    return canvas


def cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    return ImageOps.fit(image, size, method=RESAMPLE, centering=(0.5, 0.5))


def save_png(image: Image.Image, path: Path) -> None:
    ensure(path.parent)
    image.save(path, "PNG", optimize=True)


def save_webp(image: Image.Image, path: Path, size: tuple[int, int]) -> None:
    ensure(path.parent)
    fitted = ImageOps.contain(image.convert("RGB"), size, method=RESAMPLE)
    fitted.save(path, "WEBP", quality=84, method=6)


def save_jpeg_cover(image: Image.Image, path: Path, size: tuple[int, int]) -> None:
    ensure(path.parent)
    fitted = ImageOps.fit(image.convert("RGB"), size, method=RESAMPLE)
    fitted.save(path, "JPEG", quality=88, optimize=True, progressive=True)


def build_web_lore_assets() -> list[str]:
    """Publish small, web-ready copies of the curated archive artwork."""
    sources = {
        "poster-lamps.webp": (PRODUCTION / "posters" / "01-the-lamps-are-out.png", (760, 1140)),
        "poster-wrecks.webp": (PRODUCTION / "posters" / "02-every-map-is-written-in-wrecks.png", (760, 1140)),
        "poster-roads.webp": (PRODUCTION / "posters" / "03-roads-run-both-ways.png", (760, 1140)),
        "story-sesse-sight.webp": (PRODUCTION / "campaign" / "01-sesses-two-seconds.png", (960, 640)),
        "story-sesses-crossing.webp": (PRODUCTION / "campaign" / "02-sesses-crossing.png", (960, 640)),
        "story-the-schedule.webp": (PRODUCTION / "campaign" / "03-the-schedule.png", (960, 640)),
        "story-ninefold-patience.webp": (PRODUCTION / "campaign" / "04-ninefold-patience.png", (960, 640)),
        "story-wren-sideways.webp": (PRODUCTION / "campaign" / "05-wren-sideways.png", (960, 640)),
        "story-ordel-gate.webp": (PRODUCTION / "campaign" / "06-they-could-not-be-moved.png", (960, 640)),
        "story-four-hundred.webp": (PRODUCTION / "campaign" / "07-four-hundred-alone.png", (960, 640)),
        "story-three-cards.webp": (PRODUCTION / "campaign" / "08-three-cards.png", (960, 640)),
        "story-trace-market.webp": (PRODUCTION / "campaign" / "09-trace-market.png", (960, 640)),
        "rell.webp": (PRODUCTION / "commander" / "rell-idle-portrait.png", (600, 800)),
        "race-board.webp": (PRODUCTION / "supporting" / "race-selection-contact-sheet.png", (800, 900)),
        "relic-board.webp": (PRODUCTION / "relics" / "relics-atlas.png", (800, 800)),
        "terra.webp": (PRODUCTION / "homeworlds" / "01-terra-960x540.png", (960, 540)),
        "kettering.webp": (PRODUCTION / "homeworlds" / "08-kettering-960x540.png", (960, 540)),
        "ordel-deep.webp": (PRODUCTION / "homeworlds" / "11-ordel-deep-960x540.png", (960, 540)),
    }
    outputs: list[str] = []
    for filename, (source, size) in sources.items():
        output = WEB_LORE / filename
        save_webp(Image.open(source), output, size)
        outputs.append(output.as_posix())
    social_source = PRODUCTION / "social" / "lore-social-source.png"
    social_output = WEB_LORE / "lore-social.jpg"
    save_jpeg_cover(Image.open(social_source), social_output, (1200, 630))
    outputs.append(social_output.as_posix())
    return outputs


def build_commander() -> list[str]:
    source = PRODUCTION / "commander" / "rell-states-atlas.png"
    states = ["idle", "speaking", "alert", "signal-lost"]
    outputs: list[str] = []
    for state, cell in zip(states, grid_cells(source, 2, 2), strict=True):
        square = cover(cell, (512, 512))
        portrait = contain(square, (768, 1024))
        square_path = PRODUCTION / "commander" / f"rell-{state}-512.png"
        portrait_path = PRODUCTION / "commander" / f"rell-{state}-portrait.png"
        save_png(square, square_path)
        save_png(portrait, portrait_path)
        outputs.extend([square_path.as_posix(), portrait_path.as_posix()])
    return outputs


def build_crests() -> list[str]:
    source = PRODUCTION / "crests" / "registry-glyphs-atlas.png"
    names = [
        "01-terran",
        "02-silicon",
        "03-zephyr",
        "04-crystalline",
        "05-void-walkers",
        "06-mechanicus",
        "07-bioform",
        "08-star-nomads",
        "09-ancients",
        "10-quantum",
        "11-titan-lords",
        "12-shadow-realm",
    ]
    outputs: list[str] = []
    for name, cell in zip(names, grid_cells(source, 3, 4), strict=True):
        master = contain(cell, (512, 512))
        for size in (32, 64, 128, 512):
            path = PRODUCTION / "crests" / str(size) / f"{name}.png"
            save_png(master.resize((size, size), RESAMPLE), path)
            outputs.append(path.as_posix())
    return outputs


def build_sectors() -> list[str]:
    source = PRODUCTION / "sectors" / "sector-tiles-atlas.png"
    names = [
        "type-00-empty-space",
        "type-01-asteroid-shoal",
        "type-02-collapsar-mouth",
        "type-03-unstable-star",
        "type-04-brown-dwarf",
        "type-05-small-moon",
        "type-06-marginal-world",
        "type-07-viable-world",
        "type-08-rich-world",
        "type-09-abundant-world",
        "type-10-homeworld",
    ]
    outputs: list[str] = []
    for name, cell in zip(names, grid_cells(source, 3, 4)[:11], strict=True):
        master = contain(cell, (512, 512))
        for size in (256, 512):
            path = PRODUCTION / "sectors" / str(size) / f"{name}.png"
            save_png(master.resize((size, size), RESAMPLE), path)
            outputs.append(path.as_posix())
    return outputs


FLEETS = [
    ("01-terran.png", "01-terran", ["scout", "colony-ship", "dreadnought"]),
    (
        "02-silicon.png",
        "02-silicon",
        ["scout", "colony-processor", "carrier-battleship"],
    ),
    (
        "03-zephyr.png",
        "03-zephyr",
        ["frigate-swarm", "colony-migration", "cruiser-mass"],
    ),
    (
        "04-crystalline.png",
        "04-crystalline",
        ["scout-shard", "colony-lattice", "dreadnought"],
    ),
    (
        "05-void-walkers.png",
        "05-void-walkers",
        ["courier-scout", "colony-route-holder", "carrier"],
    ),
    (
        "06-mechanicus.png",
        "06-mechanicus",
        ["frigate", "colony-work-vessel", "dreadnought"],
    ),
    (
        "07-bioform.png",
        "07-bioform",
        ["scout-organism", "colony-seed-vessel", "dreadnought-organism"],
    ),
    (
        "08-star-nomads.png",
        "08-star-nomads",
        ["trace-scout", "colony-caravan", "dreadnought"],
    ),
    (
        "09-ancients.png",
        "09-ancients",
        ["scout-instrument", "colony-vessel", "dreadnought"],
    ),
    (
        "10-quantum.png",
        "10-quantum",
        ["phase-scout", "colony-anchor", "carrier-battleship"],
    ),
    (
        "11-titan-lords.png",
        "11-titan-lords",
        ["cruiser", "colony-ship", "dreadnought"],
    ),
    (
        "12-shadow-realm.png",
        "12-shadow-realm",
        ["stealth-scout", "colony-vessel", "intruder-battleship"],
    ),
]


def build_fleets() -> list[str]:
    outputs: list[str] = []
    for filename, race, roles in FLEETS:
        cells = grid_cells(PRODUCTION / "fleets" / filename, 3, 1)
        for role, cell in zip(roles, cells, strict=True):
            path = PRODUCTION / "fleets" / race / f"{role}-512.png"
            save_png(contain(cell, (512, 512)), path)
            outputs.append(path.as_posix())
    return outputs


def build_effects() -> list[str]:
    names = [
        "laser-impact",
        "plasma-impact",
        "missile",
        "shield-ripple",
        "hull-explosion",
        "wreckage",
        "retreat-arcs",
        "warning-sweep",
    ]
    source = PRODUCTION / "effects" / "battle-effects-atlas.png"
    outputs: list[str] = []
    for name, cell in zip(names, grid_cells(source, 4, 2), strict=True):
        path = PRODUCTION / "effects" / f"{name}-512.png"
        save_png(contain(cell, (512, 512)), path)
        outputs.append(path.as_posix())
    return outputs


def build_construction() -> list[str]:
    names = ["scaffolding", "upgrading", "damaged", "disabled", "completed"]
    source = PRODUCTION / "construction" / "construction-states-atlas.png"
    outputs: list[str] = []
    for name, cell in zip(names, grid_cells(source, 5, 1), strict=True):
        square_edge = min(cell.width, cell.height)
        top = max(0, (cell.height - square_edge) // 2)
        cropped = cell.crop((0, top, cell.width, top + square_edge))
        path = PRODUCTION / "construction" / f"{name}-512.png"
        save_png(cover(cropped, (512, 512)), path)
        outputs.append(path.as_posix())
    return outputs


def build_relics() -> list[str]:
    names = [
        "01-folded-object",
        "02-spindle",
        "03-internal-void",
        "04-structural-arc",
        "05-asymmetric-lens",
    ]
    source = PRODUCTION / "relics" / "relics-atlas.png"
    outputs: list[str] = []
    for name, cell in zip(names, grid_cells(source, 3, 2)[:5], strict=True):
        card_path = PRODUCTION / "relics" / "discovery-cards" / f"{name}.png"
        icon_path = PRODUCTION / "relics" / "icons" / f"{name}-512.png"
        save_png(cover(cell, (512, 768)), card_path)
        save_png(contain(cell, (512, 512)), icon_path)
        outputs.extend([card_path.as_posix(), icon_path.as_posix()])
    lifter = open_rgba(PRODUCTION / "relics" / "relic-lifter.png")
    lifter_path = PRODUCTION / "relics" / "relic-lifter-768.png"
    save_png(contain(lifter, (768, 512)), lifter_path)
    outputs.append(lifter_path.as_posix())
    return outputs


def build_event_cards() -> list[str]:
    names = [
        "probe-lost",
        "shoal-damage",
        "collapsar-annihilation",
        "first-colony",
        "battle-victory",
        "battle-defeat",
    ]
    source = PRODUCTION / "events" / "event-cards-atlas.png"
    outputs: list[str] = []
    for name, cell in zip(names, grid_cells(source, 3, 2), strict=True):
        card = cover(cell, (512, 768))
        card_path = PRODUCTION / "events" / f"{name}-512x768.png"
        thumb_path = PRODUCTION / "events" / "thumbnails" / f"{name}-256x384.png"
        save_png(card, card_path)
        save_png(card.resize((256, 384), RESAMPLE), thumb_path)
        outputs.extend([card_path.as_posix(), thumb_path.as_posix()])
    return outputs


HOMEWORLDS = [
    "01-terra",
    "02-sill",
    "03-churn",
    "04-sarns-world",
    "05-bell",
    "06-works",
    "07-ossas-delta",
    "08-kettering",
    "09-ancient-installation",
    "10-osks-flux",
    "11-ordel-deep",
    "12-sables-dark",
]


def build_homeworlds() -> list[str]:
    source = REFERENCE / "assets" / "07-homeworlds.png"
    outputs: list[str] = []
    for name, cell in zip(HOMEWORLDS, grid_cells(source, 3, 4), strict=True):
        path = PRODUCTION / "homeworlds" / f"{name}-960x540.png"
        save_png(cover(cell, (960, 540)), path)
        outputs.append(path.as_posix())
    return outputs


def build_marketing_derivatives() -> list[str]:
    outputs: list[str] = []

    still = open_rgba(PRODUCTION / "campaign" / "01-sesses-two-seconds.png")
    hero = cover(still, (1600, 900))
    shade = Image.new("RGBA", hero.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(shade)
    for x in range(900):
        alpha = round(188 * (1 - x / 900) ** 1.6)
        draw.line((x, 0, x, 900), fill=(0, 0, 0, alpha))
    hero = Image.alpha_composite(hero, shade)
    hero_path = PRODUCTION / "supporting" / "landing-hero-1600x900.png"
    save_png(hero, hero_path)
    outputs.append(hero_path.as_posix())

    cards: list[Image.Image] = []
    for index, homeworld in enumerate(HOMEWORLDS, start=1):
        race = FLEETS[index - 1][1]
        world = open_rgba(PRODUCTION / "homeworlds" / f"{homeworld}-960x540.png")
        fleet = open_rgba(PRODUCTION / "fleets" / FLEETS[index - 1][0])
        crest = open_rgba(
            PRODUCTION / "crests" / "128" / f"{race}.png"
        )
        card = Image.new("RGBA", (600, 900), BLACK)
        card.alpha_composite(cover(world, (600, 420)), (0, 0))
        card.alpha_composite(contain(fleet, (600, 300)), (0, 420))
        card.alpha_composite(crest.resize((128, 128), RESAMPLE), (28, 742))
        overlay = Image.new("RGBA", card.size, (0, 0, 0, 0))
        odraw = ImageDraw.Draw(overlay)
        odraw.rectangle((0, 0, 599, 899), outline=(125, 158, 164, 130), width=3)
        odraw.line((0, 420, 600, 420), fill=(125, 158, 164, 95), width=2)
        card = Image.alpha_composite(card, overlay)
        path = PRODUCTION / "supporting" / "race-cards" / f"{race}.png"
        save_png(card, path)
        outputs.append(path.as_posix())
        cards.append(card.resize((240, 360), RESAMPLE))

    sheet = Image.new("RGBA", (960, 1080), BLACK)
    for index, card in enumerate(cards):
        sheet.alpha_composite(card, ((index % 4) * 240, (index // 4) * 360))
    sheet_path = PRODUCTION / "supporting" / "race-selection-contact-sheet.png"
    save_png(sheet, sheet_path)
    outputs.append(sheet_path.as_posix())
    return outputs


def svg_document(title: str, body: str, width: int = 256, height: int = 256) -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <title>{title}</title>
  <defs>
    <filter id="glow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 1.5H4" stroke="#b9d7d8" stroke-opacity=".08"/></pattern>
    <pattern id="stripe" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="18" fill="#e85d3f" fill-opacity=".28"/></pattern>
  </defs>
  {body}
</svg>
"""


def write_svg(path: Path, title: str, body: str, width: int = 256, height: int = 256) -> str:
    ensure(path.parent)
    path.write_text(svg_document(title, body, width, height), encoding="utf-8")
    return path.as_posix()


def build_map_states() -> list[str]:
    base = '<rect width="256" height="256" fill="none"/>'
    assets = {
        "fog": base
        + '<rect width="256" height="256" fill="#020408" fill-opacity=".86"/>'
        + '<path d="M0 42Q64 10 128 48T256 42V210Q190 244 126 210T0 214Z" fill="#53606a" fill-opacity=".16"/>'
        + '<rect width="256" height="256" fill="url(#scan)"/>',
        "remembered": base
        + '<rect width="256" height="256" fill="#07111b" fill-opacity=".5"/>'
        + '<rect x="14" y="14" width="228" height="228" rx="18" fill="none" stroke="#82939d" stroke-opacity=".55" stroke-width="5" stroke-dasharray="15 12"/>',
        "probe-intel": base
        + '<circle cx="128" cy="128" r="88" fill="#46d4df" fill-opacity=".06" stroke="#46d4df" stroke-width="4"/>'
        + '<circle cx="128" cy="128" r="48" fill="none" stroke="#46d4df" stroke-opacity=".55" stroke-width="3"/>'
        + '<path d="M128 22V234M22 128H234M128 128L206 78" stroke="#46d4df" stroke-width="3" stroke-opacity=".75"/>',
        "owned": base
        + '<path d="M18 82V18H82M174 18H238V82M238 174V238H174M82 238H18V174" fill="none" stroke="#6dd58c" stroke-width="9" filter="url(#glow)"/>',
        "contested": base
        + '<path d="M18 52L102 128 18 204M238 52L154 128 238 204" fill="none" stroke="#f0b34c" stroke-width="12"/>'
        + '<circle cx="128" cy="128" r="34" fill="#e85d3f" fill-opacity=".2" stroke="#e85d3f" stroke-width="5"/>',
        "hazardous": base
        + '<rect width="256" height="256" fill="url(#stripe)"/>'
        + '<path d="M128 34L226 216H30Z" fill="#210807" fill-opacity=".45" stroke="#e85d3f" stroke-width="8"/>'
        + '<circle cx="128" cy="169" r="7" fill="#e85d3f"/><path d="M128 88V145" stroke="#e85d3f" stroke-width="12" stroke-linecap="round"/>',
    }
    return [
        write_svg(PRODUCTION / "map-states" / f"{name}.svg", name.replace("-", " ").title(), body, 256, 256)
        for name, body in assets.items()
    ]


def framed_icon(title: str, color: str, symbol: str) -> str:
    return (
        '<rect width="256" height="256" rx="30" fill="#05080c"/>'
        f'<rect x="13" y="13" width="230" height="230" rx="24" fill="#0b1117" stroke="{color}" stroke-width="7"/>'
        '<rect width="256" height="256" fill="url(#scan)"/>'
        f'<g fill="none" stroke="{color}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round">{symbol}</g>'
    )


def build_supporting_icons() -> list[str]:
    outputs: list[str] = []

    diplomacy = {
        "neutral": ("#91a0a9", '<circle cx="128" cy="104" r="34"/><path d="M70 210Q82 150 128 150T186 210"/>'),
        "friendly": ("#6dd58c", '<circle cx="128" cy="104" r="34"/><path d="M70 210Q82 150 128 150T186 210M92 116Q128 142 164 116"/>'),
        "hostile": ("#e85d3f", '<circle cx="128" cy="104" r="34"/><path d="M70 210Q82 150 128 150T186 210M94 90L115 97M162 90L141 97"/>'),
        "distressed": ("#f0b34c", '<circle cx="128" cy="104" r="34" stroke-dasharray="18 10"/><path d="M70 210Q82 150 128 150T186 210M84 36L48 66M172 36L208 66"/>'),
    }
    for name, (color, symbol) in diplomacy.items():
        outputs.append(
            write_svg(
                PRODUCTION / "supporting" / "diplomacy" / f"{name}-frame.svg",
                f"Diplomacy posture: {name}",
                framed_icon(name, color, symbol),
            )
        )

    victory = {
        "domination": '<circle cx="72" cy="158" r="24"/><circle cx="128" cy="86" r="24"/><circle cx="184" cy="158" r="24"/><path d="M87 139L113 106M143 106L169 139M96 158H160"/>',
        "elimination": '<path d="M62 184L128 62 194 184Z"/><path d="M46 58L84 96M84 58L46 96M172 58L210 96M210 58L172 96"/>',
        "economic": '<path d="M52 188H104V126H52ZM152 188H204V94H152Z"/><path d="M128 48L162 82 128 116 94 82Z"/>',
        "scientific": '<circle cx="128" cy="128" r="24"/><ellipse cx="128" cy="128" rx="84" ry="38"/><ellipse cx="128" cy="128" rx="38" ry="84"/><circle cx="206" cy="128" r="8" fill="#46d4df"/>',
        "time": '<circle cx="128" cy="128" r="80"/><path d="M128 74V130L170 158"/>',
        "wonder": '<path d="M82 204V96Q82 52 128 52T174 96V204M60 204H196M104 112H152M128 52V24"/>',
    }
    for name, symbol in victory.items():
        outputs.append(
            write_svg(
                PRODUCTION / "supporting" / "victory" / f"{name}.svg",
                f"Victory condition: {name}",
                framed_icon(name, "#d5b76a", symbol),
            )
        )

    achievements = {
        "first-probe": '<path d="M128 42V176M90 84L128 42 166 84M86 188H170"/><circle cx="128" cy="110" r="26"/>',
        "first-sweep": '<path d="M38 178Q96 82 218 82M48 196Q106 108 218 108"/><path d="M74 78L94 98M112 52L126 76M158 56L150 82"/>',
        "first-colony": '<path d="M50 186Q128 108 206 186M78 186V124H178V186M106 124V90H150V124"/>',
        "first-battle": '<path d="M64 54L192 202M192 54L64 202"/><path d="M54 54L82 58 58 82M202 54L174 58 198 82"/>',
        "all-research": '<path d="M52 190H204M72 190V72H184V190M98 102H158M98 132H158M98 162H142"/>',
        "relic-found": '<path d="M128 42Q178 42 188 94T128 214Q68 146 68 94T128 42Z"/><circle cx="128" cy="112" r="26"/>',
    }
    for name, symbol in achievements.items():
        outputs.append(
            write_svg(
                PRODUCTION / "supporting" / "achievements" / f"{name}.svg",
                f"Achievement: {name}",
                framed_icon(name, "#46d4df", symbol),
            )
        )

    resources = {
        "metal-production": ("#b9c3c8", '<path d="M58 158L94 94H162L198 158 164 198H92Z"/><path d="M128 104V42M98 72L128 42 158 72"/>'),
        "metal-shortage": ("#e85d3f", '<path d="M58 158L94 94H162L198 158 164 198H92Z"/><path d="M128 112V156M128 182V184"/>'),
        "crystal-production": ("#46d4df", '<path d="M128 48L190 128 128 208 66 128Z"/><path d="M128 112V42M98 72L128 42 158 72"/>'),
        "crystal-shortage": ("#e85d3f", '<path d="M128 48L190 128 128 208 66 128Z"/><path d="M128 104V154M128 178V180"/>'),
        "research-gain": ("#d5b76a", '<circle cx="128" cy="132" r="30"/><ellipse cx="128" cy="132" rx="80" ry="42"/><path d="M128 84V34M100 62L128 34 156 62"/>'),
        "research-stalled": ("#f0b34c", '<circle cx="128" cy="132" r="30"/><ellipse cx="128" cy="132" rx="80" ry="42"/><path d="M108 104V160M148 104V160"/>'),
    }
    for name, (color, symbol) in resources.items():
        outputs.append(
            write_svg(
                PRODUCTION / "supporting" / "resources" / f"{name}.svg",
                name.replace("-", " ").title(),
                framed_icon(name, color, symbol),
            )
        )

    orders = {
        "intercept": '<path d="M54 60L202 202M202 60L54 202M54 60H98M54 60V104M202 60H158M202 60V104"/>',
        "blockade": '<circle cx="128" cy="128" r="76"/><path d="M54 92H202M54 128H202M54 164H202"/>',
        "escort": '<path d="M72 184L128 58 184 184Z"/><path d="M36 178L62 116 86 178ZM170 178L194 116 220 178Z"/>',
        "patrol": '<path d="M64 90Q128 30 192 90L176 58M192 90L158 88M192 166Q128 226 64 166L80 198M64 166L98 168"/>',
        "retreat": '<path d="M204 62L132 128 204 194M132 62L60 128 132 194"/>',
        "hold": '<rect x="66" y="66" width="124" height="124"/><path d="M96 128H160M128 96V160"/>',
    }
    for name, symbol in orders.items():
        outputs.append(
            write_svg(
                PRODUCTION / "supporting" / "fleet-orders" / f"{name}.svg",
                f"Fleet order: {name}",
                framed_icon(name, "#7fcbd1", symbol),
            )
        )

    return outputs


def build_console_assets() -> list[str]:
    outputs: list[str] = []
    assets = {
        "scanlines": '<rect width="256" height="256" fill="url(#scan)"/>',
        "radar-sweep": '<circle cx="128" cy="128" r="100" fill="#46d4df" fill-opacity=".03" stroke="#46d4df" stroke-opacity=".35" stroke-width="3"/><path d="M128 128L128 28A100 100 0 0 1 214 178Z" fill="#46d4df" fill-opacity=".18"><animateTransform attributeName="transform" type="rotate" from="0 128 128" to="360 128 128" dur="3s" repeatCount="indefinite"/></path>',
        "warning-lamp": '<circle cx="128" cy="128" r="74" fill="#e85d3f" fill-opacity=".28" filter="url(#glow)"><animate attributeName="fill-opacity" values=".12;.72;.12" dur="1.1s" repeatCount="indefinite"/></circle><circle cx="128" cy="128" r="46" fill="#ff6b45"/>',
        "waveform": '<path d="M18 128H42L54 92 72 170 92 68 112 152 132 104 150 144 170 78 190 166 208 112 238 128" fill="none" stroke="#8bd68f" stroke-width="7" filter="url(#glow)"><animate attributeName="stroke-opacity" values=".55;1;.55" dur=".8s" repeatCount="indefinite"/></path>',
        "signal-static": '<filter id="noise"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="3"><animate attributeName="seed" values="1;9;3;14;1" dur=".35s" repeatCount="indefinite"/></feTurbulence><feColorMatrix values="0 0 0 0 .2 0 0 0 0 .7 0 0 0 0 .45 0 0 0 .8 0"/></filter><rect width="256" height="256" filter="url(#noise)"/>',
        "sparks": '<g stroke="#ffb14a" stroke-width="5" stroke-linecap="round" filter="url(#glow)"><path d="M50 60L98 112" stroke-dasharray="0 80"><animate attributeName="stroke-dasharray" values="0 80;22 58;0 80" dur=".7s" repeatCount="indefinite"/></path><path d="M132 42L118 112" stroke-dasharray="0 80"><animate attributeName="stroke-dasharray" values="0 80;18 62;0 80" dur=".9s" begin=".2s" repeatCount="indefinite"/></path><path d="M202 74L150 126" stroke-dasharray="0 80"><animate attributeName="stroke-dasharray" values="0 80;20 60;0 80" dur=".6s" begin=".35s" repeatCount="indefinite"/></path></g>',
        "cable-sway": '<path d="M42 0Q80 110 54 256" fill="none" stroke="#242d31" stroke-width="18"><animate attributeName="d" values="M42 0Q80 110 54 256;M42 0Q32 116 68 256;M42 0Q80 110 54 256" dur="4.2s" repeatCount="indefinite"/></path><path d="M42 0Q80 110 54 256" fill="none" stroke="#667077" stroke-opacity=".45" stroke-width="3"/>',
        "steam": '<g fill="#c9d4d5"><circle cx="100" cy="210" r="20" opacity=".16"><animate attributeName="cy" values="220;36" dur="3s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;.28;0" dur="3s" repeatCount="indefinite"/></circle><circle cx="152" cy="224" r="28" opacity=".12"><animate attributeName="cy" values="232;52" dur="3.8s" begin=".6s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;.22;0" dur="3.8s" begin=".6s" repeatCount="indefinite"/></circle></g>',
    }
    for name, body in assets.items():
        outputs.append(
            write_svg(
                PRODUCTION / "console" / f"{name}.svg",
                name.replace("-", " ").title(),
                body,
            )
        )
    return outputs


def tutorial_body(title: str, subtitle: str, scene: str) -> str:
    return f"""
  <rect width="960" height="540" rx="24" fill="#05080c"/>
  <rect x="14" y="14" width="932" height="512" rx="18" fill="#0a1117" stroke="#52656d" stroke-width="4"/>
  <rect width="960" height="540" fill="url(#scan)"/>
  <text x="48" y="70" fill="#d8e1df" font-family="Arial, sans-serif" font-size="34" font-weight="700">{title}</text>
  <text x="48" y="108" fill="#8fa3a8" font-family="Arial, sans-serif" font-size="20">{subtitle}</text>
  {scene}
"""


def build_tutorials() -> list[str]:
    diagrams = {
        "01-probing": tutorial_body(
            "PROBING",
            "Spend reckoning to buy a dated fact before risking a fleet.",
            '<circle cx="190" cy="320" r="92" fill="#111a22" stroke="#52656d" stroke-width="5" stroke-dasharray="12 10"/>'
            '<text x="138" y="328" fill="#8fa3a8" font-family="Arial" font-size="24">UNKNOWN</text>'
            '<path d="M310 320H626" stroke="#46d4df" stroke-width="7" marker-end="url(#arrow)"/>'
            '<path d="M432 286L476 320 432 354Z" fill="#46d4df"/>'
            '<circle cx="770" cy="320" r="92" fill="#10212a" stroke="#46d4df" stroke-width="5"/>'
            '<path d="M706 340Q770 242 834 340" fill="none" stroke="#d5b76a" stroke-width="7"/>'
            '<text x="716" y="398" fill="#d8e1df" font-family="Arial" font-size="20">DATED INTEL</text>',
        ),
        "02-hazards": tutorial_body(
            "HAZARDS",
            "A shoal rolls per hull. A mouth does not roll.",
            '<path d="M72 294H378" stroke="#46d4df" stroke-width="7"/>'
            '<path d="M132 266L178 294 132 322Z" fill="#d8e1df"/>'
            '<g fill="#7b8588"><circle cx="266" cy="264" r="18"/><circle cx="306" cy="308" r="26"/><circle cx="342" cy="252" r="13"/></g>'
            '<path d="M378 294H518" stroke="#e85d3f" stroke-width="7" stroke-dasharray="14 10"/>'
            '<text x="110" y="402" fill="#f0b34c" font-family="Arial" font-size="24">SHOAL: SURVIVORS MAY SWEEP</text>'
            '<circle cx="738" cy="292" r="92" fill="#000" stroke="#4d5a61" stroke-width="7"/>'
            '<path d="M602 292H680" stroke="#e85d3f" stroke-width="7"/><path d="M610 264L654 292 610 320Z" fill="#d8e1df"/>'
            '<text x="654" y="430" fill="#e85d3f" font-family="Arial" font-size="24">MOUTH: NOTHING ARRIVES</text>',
        ),
        "03-colonization": tutorial_body(
            "COLONIZATION",
            "World + Colony Ship + sufficient terraforming = permanent settlement.",
            '<circle cx="180" cy="314" r="78" fill="#344a3c" stroke="#86a38c" stroke-width="7"/>'
            '<path d="M320 270L388 314 320 358Z" fill="#d8e1df"/><rect x="388" y="286" width="92" height="56" rx="12" fill="#26343b" stroke="#46d4df" stroke-width="5"/>'
            '<path d="M536 314H648" stroke="#46d4df" stroke-width="7"/>'
            '<path d="M710 386Q770 228 830 386Z" fill="#26343b" stroke="#d5b76a" stroke-width="7"/>'
            '<rect x="744" y="302" width="52" height="84" fill="#566b70"/>'
            '<text x="682" y="430" fill="#d8e1df" font-family="Arial" font-size="22">COLONY CONFIRMED</text>',
        ),
        "04-route-control": tutorial_body(
            "ROUTE CONTROL",
            "Survive, hold, sweep: the death trap becomes a permanent road.",
            '<g fill="#777f82"><circle cx="190" cy="258" r="28"/><circle cx="252" cy="330" r="34"/><circle cx="310" cy="246" r="22"/><circle cx="348" cy="338" r="19"/></g>'
            '<path d="M74 302H420" stroke="#e85d3f" stroke-width="8" stroke-dasharray="16 12"/>'
            '<path d="M470 302H598" stroke="#d5b76a" stroke-width="9"/><path d="M550 268L598 302 550 336Z" fill="#d5b76a"/>'
            '<g fill="#777f82"><circle cx="684" cy="258" r="28"/><circle cx="746" cy="330" r="34"/><circle cx="804" cy="246" r="22"/><circle cx="842" cy="338" r="19"/></g>'
            '<path d="M620 302H900" stroke="#46d4df" stroke-width="12"/>'
            '<text x="98" y="424" fill="#e85d3f" font-family="Arial" font-size="22">UNSWEPT: RISK EACH CROSSING</text>'
            '<text x="654" y="424" fill="#46d4df" font-family="Arial" font-size="22">HELD: SAFE FOREVER</text>',
        ),
    }
    outputs: list[str] = []
    for name, body in diagrams.items():
        body = (
            '<defs><marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M0 0L12 6 0 12Z" fill="#46d4df"/></marker></defs>'
            + body
        )
        outputs.append(
            write_svg(
                PRODUCTION / "supporting" / "tutorials" / f"{name}.svg",
                name.replace("-", " ").title(),
                body,
                960,
                540,
            )
        )
    return outputs


def build_relic_markers() -> list[str]:
    marker = framed_icon(
        "Relic world marker",
        "#46d4df",
        '<path d="M128 42Q178 42 188 94T128 214Q68 146 68 94T128 42Z"/><circle cx="128" cy="112" r="22"/><path d="M104 112H152M128 88V136"/>',
    )
    return [
        write_svg(
            PRODUCTION / "relics" / "relic-world-marker.svg",
            "Relic world marker",
            marker,
        )
    ]


def main() -> None:
    absolute_manifest: dict[str, list[str]] = {
        "commander": build_commander(),
        "crests": build_crests(),
        "sectors": build_sectors(),
        "mapStates": build_map_states(),
        "fleets": build_fleets(),
        "battleEffects": build_effects(),
        "construction": build_construction(),
        "relics": build_relics() + build_relic_markers(),
        "events": build_event_cards(),
        "homeworlds": build_homeworlds(),
        "supporting": build_supporting_icons()
        + build_tutorials()
        + build_marketing_derivatives(),
        "console": build_console_assets(),
    }
    manifest = {
        group: [
            Path(path).resolve().relative_to(ROOT).as_posix()
            for path in paths
        ]
        for group, paths in absolute_manifest.items()
    }
    manifest_path = PRODUCTION / "catalog.json"
    manifest_path.write_text(
        json.dumps(
            {
                "status": "PRODUCTION_REFERENCE",
                "generatedBy": "tools/build-lore-production-assets.py",
                "groups": manifest,
                "counts": {key: len(value) for key, value in manifest.items()},
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    web_assets = build_web_lore_assets()
    counts = {key: len(value) for key, value in manifest.items()}
    counts["webLore"] = len(web_assets)
    print(json.dumps(counts, indent=2))


if __name__ == "__main__":
    main()
