#!/usr/bin/env python3
"""Generate Open Graph preview images for each recipe and the index page.

Produces 1200x630 PNG thumbnails used as og:image for social sharing
(iMessage, Slack, Discord, etc.). Design uses a thick left accent bar,
large title, subtitle, metadata, and contributor attribution.
"""

import os
import sys
from html.parser import HTMLParser

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("Pillow is required: pip install Pillow")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Dimensions & layout constants
# ---------------------------------------------------------------------------
WIDTH = 1200
HEIGHT = 630

ACCENT_BAR_WIDTH = 70  # thick left accent bar
CONTENT_LEFT = ACCENT_BAR_WIDTH + 60  # left margin for all text
CONTENT_RIGHT = WIDTH - 60  # right margin
CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT  # available text width

# ---------------------------------------------------------------------------
# Colors (matching site theme: warm cream, brown accents)
# ---------------------------------------------------------------------------
BG_COLOR = (250, 248, 245)  # #faf8f5 — site background
TEXT_COLOR = (61, 55, 48)  # warm dark brown for titles
SUBTITLE_COLOR = (120, 110, 100)  # warm medium gray for descriptions
MUTED_COLOR = (154, 123, 91)  # #9a7b5b — warm brown accent
META_COLOR = (160, 150, 140)  # subtle warm gray for metadata
LIGHT_COLOR = (200, 192, 184)  # very light warm gray for branding
ACCENT_DEFAULT = (154, 123, 91)  # fallback accent = warm brown

CATEGORY_ACCENTS = {
    "appetizers": (229, 168, 62),
    "beverages": (74, 157, 229),
    "breakfast": (229, 168, 62),
    "desserts": (224, 96, 85),
    "main-dishes": (229, 168, 62),
    "salads": (91, 184, 91),
    "sauces-and-dressings": (180, 140, 100),
    "side-dishes": (229, 168, 62),
    "snacks": (229, 168, 62),
    "soups-and-stews": (74, 157, 229),
}

CATEGORY_EMOJIS = {
    "appetizers": "\U0001f362",      # 🍢
    "beverages": "\U0001f964",       # 🥤
    "breakfast": "\U0001f373",       # 🍳
    "desserts": "\U0001f370",        # 🍰
    "main-dishes": "\U0001f37d\ufe0f",  # 🍽️
    "salads": "\U0001f957",          # 🥗
    "sauces-and-dressings": "\U0001fad9",  # 🫙
    "side-dishes": "\U0001f958",     # 🥘
    "snacks": "\U0001f37f",          # 🍿
    "soups-and-stews": "\U0001f372", # 🍲
}

SITE_BASE = "https://copyandpastry.com"


# ---------------------------------------------------------------------------
# HTML parser
# ---------------------------------------------------------------------------
class OGDataParser(HTMLParser):
    """Extract title, subtitle, time, servings, contributor, and source from
    a recipe HTML file."""

    def __init__(self):
        super().__init__()
        self.title = ""
        self.subtitle = ""
        self.time = ""
        self.servings = ""
        self.contributor = ""
        self.source_name = ""
        # Internal state
        self._in_title = False
        self._in_subtitle = False
        self._in_meta_list = False
        self._in_meta_li = False
        self._in_meta_strong = False
        self._in_attribution = False
        self._in_contributor = False
        self._in_source_link = False
        self._label = ""
        self._value = ""

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        cls = d.get("class", "")

        if tag == "title":
            self._in_title = True
        elif tag == "p" and "subtitle" in cls:
            self._in_subtitle = True
        elif tag == "ul" and "meta-list" in cls:
            self._in_meta_list = True
        elif tag == "li" and self._in_meta_list:
            self._in_meta_li = True
            self._label = ""
            self._value = ""
        elif tag == "strong" and self._in_meta_li:
            self._in_meta_strong = True
        elif tag == "p" and "recipe-attribution" in cls:
            self._in_attribution = True
        elif tag == "span" and "contributor" in cls:
            self._in_contributor = True
        elif tag == "a" and self._in_attribution and not self._in_contributor:
            self._in_source_link = True

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        elif tag == "p" and self._in_subtitle:
            self._in_subtitle = False
        elif tag == "ul" and self._in_meta_list:
            self._in_meta_list = False
        elif tag == "li" and self._in_meta_li:
            self._in_meta_li = False
            label = self._label.strip().lower()
            value = self._value.strip()
            if label == "total":
                self.time = value
            elif label == "servings":
                self.servings = value
        elif tag == "strong" and self._in_meta_strong:
            self._in_meta_strong = False
        elif tag == "p" and self._in_attribution:
            self._in_attribution = False
        elif tag == "span" and self._in_contributor:
            self._in_contributor = False
        elif tag == "a" and self._in_source_link:
            self._in_source_link = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        elif self._in_subtitle:
            self.subtitle += data
        elif self._in_meta_strong:
            self._label += data
        elif self._in_meta_li:
            self._value += data
        elif self._in_contributor:
            # Strip leading " · " from contributor text
            text = data.strip().lstrip("\u00b7").lstrip("·").strip()
            # Normalize "By Name" — keep "By" prefix if present
            if text:
                self.contributor = text
        elif self._in_source_link:
            self.source_name += data


# ---------------------------------------------------------------------------
# Font resolution
# ---------------------------------------------------------------------------
def _find_font_file(style="regular"):
    """Find a suitable font file across platforms.

    style: "regular", "bold", "medium", "italic"
    Returns (path, ttc_index) or (None, 0).
    """
    # macOS: prefer Avenir Next (clean geometric sans, matches site feel)
    mac_avenir_next = "/System/Library/Fonts/Avenir Next.ttc"
    avenir_indices = {
        "bold": 0,       # Avenir Next Bold
        "demibold": 2,   # Avenir Next Demi Bold
        "medium": 5,     # Avenir Next Medium
        "regular": 7,    # Avenir Next Regular
        "italic": 4,     # Avenir Next Italic
        "heavy": 8,      # Avenir Next Heavy
    }
    if os.path.exists(mac_avenir_next):
        idx = avenir_indices.get(style, avenir_indices["regular"])
        return mac_avenir_next, idx

    # macOS fallback: Arial Bold / Arial Regular
    mac_fonts = {
        "bold": "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "regular": "/System/Library/Fonts/Supplemental/Arial.ttf",
        "italic": "/System/Library/Fonts/Supplemental/Arial Italic.ttf",
        "medium": "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "demibold": "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "heavy": "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    }
    path = mac_fonts.get(style, mac_fonts["regular"])
    if os.path.exists(path):
        return path, 0

    # Linux (GitHub Actions Ubuntu runner): DejaVu Sans
    linux_map = {
        "bold": "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "regular": "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "italic": "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf",
        "medium": "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "demibold": "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "heavy": "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    }
    path = linux_map.get(style, linux_map["regular"])
    if os.path.exists(path):
        return path, 0

    # Liberation Sans fallback
    suffix = {"bold": "Bold", "italic": "Italic", "medium": "Bold"}.get(
        style, "Regular"
    )
    lib_path = f"/usr/share/fonts/truetype/liberation/LiberationSans-{suffix}.ttf"
    if os.path.exists(lib_path):
        return lib_path, 0

    return None, 0


def load_font(style, size):
    """Load a font at the given size with cross-platform fallback."""
    path, index = _find_font_file(style)
    if path:
        return ImageFont.truetype(path, size, index=index)
    # Last resort: Pillow's built-in bitmap font
    return ImageFont.load_default()


def _font_can_render_emoji(font):
    """Check whether a font can render emoji glyphs (vs. tofu boxes).

    Compares the glyph mask size of a known emoji against the Unicode
    replacement character. If they match, the font is substituting a
    generic box and can't actually render emoji.
    """
    try:
        emoji_mask = font.getmask("\U0001f373")  # 🍳
        repl_mask = font.getmask("\ufffd")  # replacement character
        return emoji_mask.size != repl_mask.size
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Text helpers
# ---------------------------------------------------------------------------
def wrap_text(draw, text, font, max_width):
    """Word-wrap text to fit within max_width pixels."""
    words = text.split()
    lines = []
    current = ""
    for word in words:
        test = f"{current} {word}".strip()
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines or [""]


def draw_left_text(draw, x, y, text, font, fill, max_width=None, max_lines=0):
    """Draw left-aligned text with optional word wrapping and line clamping.
    Returns y after the last line drawn."""
    if max_width:
        lines = wrap_text(draw, text, font, max_width)
    else:
        lines = [text]
    if max_lines and len(lines) > max_lines:
        lines = lines[:max_lines]
        # Truncate last line with ellipsis
        last = lines[-1]
        while last:
            test = last + "\u2026"
            bbox = draw.textbbox((0, 0), test, font=font)
            if bbox[2] - bbox[0] <= (max_width or 9999):
                lines[-1] = test
                break
            last = last[:-1]
    line_height = int(font.size * 1.4)
    for line in lines:
        draw.text((x, y), line, fill=fill, font=font)
        y += line_height
    return y


def text_width(draw, text, font):
    """Measure the pixel width of a text string."""
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0]


def lighten(color, factor=0.15):
    """Lighten an RGB tuple toward white by the given factor."""
    return tuple(int(c + (255 - c) * factor) for c in color)


# ---------------------------------------------------------------------------
# Category formatting
# ---------------------------------------------------------------------------
def format_category(dirname):
    """Convert 'soups-and-stews' to 'Soups and Stews'."""
    return " ".join(
        word if word in ("and", "or", "the", "of") else word.capitalize()
        for word in dirname.split("-")
    )


# ---------------------------------------------------------------------------
# Image generators
# ---------------------------------------------------------------------------
def generate_recipe_image(
    title, subtitle, category, time_str, servings, contributor, source_name,
    output_path, fonts
):
    """Generate an OG card image for a single recipe.

    Layout:
    - Full-height left accent bar (category color)
    - Category emoji + name in accent color
    - Large bold title
    - Italic subtitle / description
    - Metadata line (time, servings) left, contributor right
    - Source attribution bottom-right, site branding bottom-left
    """
    img = Image.new("RGB", (WIDTH, HEIGHT), BG_COLOR)
    draw = ImageDraw.Draw(img)

    accent = CATEGORY_ACCENTS.get(category, ACCENT_DEFAULT)

    # -- Left accent bar (full height, with subtle inner highlight) ---------
    draw.rectangle([0, 0, ACCENT_BAR_WIDTH, HEIGHT], fill=accent)
    # Subtle lighter stripe on the right edge of the bar for depth
    highlight = lighten(accent, 0.25)
    draw.rectangle(
        [ACCENT_BAR_WIDTH - 4, 0, ACCENT_BAR_WIDTH, HEIGHT], fill=highlight
    )

    # -- Subtle bottom border line ------------------------------------------
    draw.rectangle([ACCENT_BAR_WIDTH, HEIGHT - 3, WIDTH, HEIGHT], fill=accent)

    # -- Category label -----------------------------------------------------
    emoji = CATEGORY_EMOJIS.get(category, "")
    cat_display = format_category(category)
    # Include emoji only if the font can actually render it
    if emoji and _font_can_render_emoji(fonts["category"]):
        cat_text = f"{emoji}  {cat_display}"
    else:
        cat_text = cat_display
    y = 60
    draw.text((CONTENT_LEFT, y), cat_text, fill=accent, font=fonts["category"])
    y += 44

    # -- Thin separator line under category ---------------------------------
    sep_y = y + 2
    draw.rectangle(
        [CONTENT_LEFT, sep_y, CONTENT_LEFT + 60, sep_y + 2],
        fill=lighten(accent, 0.4),
    )
    y = sep_y + 20

    # -- Recipe title (large, bold) -----------------------------------------
    y = draw_left_text(
        draw, CONTENT_LEFT, y, title, fonts["title"], TEXT_COLOR,
        max_width=CONTENT_WIDTH, max_lines=2,
    )
    y += 6

    # -- Subtitle / description (italic, warm gray) -------------------------
    if subtitle:
        y = draw_left_text(
            draw, CONTENT_LEFT, y, subtitle, fonts["subtitle"], SUBTITLE_COLOR,
            max_width=CONTENT_WIDTH, max_lines=3,
        )

    # -- Metadata line (bottom area) ----------------------------------------
    meta_y = HEIGHT - 90

    # Left side: time + servings
    meta_parts = []
    if time_str:
        meta_parts.append(time_str)
    if servings:
        meta_parts.append(f"{servings} servings")
    if meta_parts:
        meta_text = "  \u00b7  ".join(meta_parts)
        draw.text(
            (CONTENT_LEFT, meta_y), meta_text, fill=META_COLOR, font=fonts["meta"]
        )

    # Right side: contributor
    if contributor:
        contributor_text = contributor if contributor.startswith("By") else f"By {contributor}"
        cw = text_width(draw, contributor_text, fonts["meta"])
        draw.text(
            (CONTENT_RIGHT - cw, meta_y),
            contributor_text,
            fill=META_COLOR,
            font=fonts["meta"],
        )

    # -- Bottom row: source left, site URL right ----------------------------
    bottom_y = HEIGHT - 50
    if source_name:
        source_display = source_name.strip()
        draw.text(
            (CONTENT_LEFT, bottom_y),
            source_display,
            fill=LIGHT_COLOR,
            font=fonts["brand"],
        )

    site_text = "copyandpastry.com"
    sw = text_width(draw, site_text, fonts["brand"])
    draw.text(
        (CONTENT_RIGHT - sw, bottom_y),
        site_text,
        fill=LIGHT_COLOR,
        font=fonts["brand"],
    )

    img.save(output_path, "PNG", optimize=True)


def generate_index_image(output_path, fonts):
    """Generate an OG card image for the index / homepage.

    Distinct from recipe cards — centered layout with warm brown accent,
    site name prominent, and a row of category emojis for visual interest.
    """
    img = Image.new("RGB", (WIDTH, HEIGHT), BG_COLOR)
    draw = ImageDraw.Draw(img)

    accent = MUTED_COLOR  # warm brown

    # Top and bottom accent bars
    draw.rectangle([0, 0, WIDTH, 5], fill=accent)
    draw.rectangle([0, HEIGHT - 5, WIDTH, HEIGHT], fill=accent)

    # Centered title
    title = "Our Recipes"
    bbox = draw.textbbox((0, 0), title, font=fonts["index_title"])
    tw = bbox[2] - bbox[0]
    title_y = 190
    draw.text(((WIDTH - tw) / 2, title_y), title, fill=TEXT_COLOR, font=fonts["index_title"])

    # Decorative line under title
    line_y = title_y + 80
    line_w = 80
    draw.rectangle(
        [(WIDTH - line_w) / 2, line_y, (WIDTH + line_w) / 2, line_y + 3],
        fill=lighten(accent, 0.3),
    )

    # Subtitle
    sub = "A family recipe collection"
    bbox = draw.textbbox((0, 0), sub, font=fonts["index_sub"])
    sw = bbox[2] - bbox[0]
    draw.text(
        ((WIDTH - sw) / 2, line_y + 24),
        sub,
        fill=SUBTITLE_COLOR,
        font=fonts["index_sub"],
    )

    # Category emoji row (only rendered if the font actually supports emoji)
    if _font_can_render_emoji(fonts["meta"]):
        emojis = list(CATEGORY_EMOJIS.values())
        emoji_str = "   ".join(emojis)
        bbox = draw.textbbox((0, 0), emoji_str, font=fonts["meta"])
        ew = bbox[2] - bbox[0]
        draw.text(
            ((WIDTH - ew) / 2, HEIGHT - 100),
            emoji_str,
            fill=META_COLOR,
            font=fonts["meta"],
        )

    # Site URL
    site_text = "copyandpastry.com"
    bbox = draw.textbbox((0, 0), site_text, font=fonts["brand"])
    sw = bbox[2] - bbox[0]
    draw.text(
        ((WIDTH - sw) / 2, HEIGHT - 50),
        site_text,
        fill=LIGHT_COLOR,
        font=fonts["brand"],
    )

    img.save(output_path, "PNG", optimize=True)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    output_dir = os.path.join(repo_root, "assets", "thumbnails")
    os.makedirs(output_dir, exist_ok=True)

    # Load fonts at various sizes / weights
    fonts = {
        "category": load_font("demibold", 22),
        "title": load_font("bold", 50),
        "subtitle": load_font("regular", 24),
        "meta": load_font("medium", 21),
        "brand": load_font("regular", 18),
        "index_title": load_font("bold", 64),
        "index_sub": load_font("regular", 28),
    }

    # Index image
    generate_index_image(os.path.join(output_dir, "index.png"), fonts)

    # Recipe images
    skip = {".git", ".github", "docs", "assets", "scripts", "fonts"}
    count = 0

    for entry in sorted(os.listdir(repo_root)):
        path = os.path.join(repo_root, entry)
        if not os.path.isdir(path) or entry in skip or entry.startswith("."):
            continue

        for fname in sorted(os.listdir(path)):
            if not fname.endswith(".html"):
                continue

            with open(os.path.join(path, fname), "r", encoding="utf-8") as f:
                html = f.read()

            parser = OGDataParser()
            parser.feed(html)

            img_name = fname.replace(".html", ".png")
            generate_recipe_image(
                title=parser.title,
                subtitle=parser.subtitle,
                category=entry,
                time_str=parser.time,
                servings=parser.servings,
                contributor=parser.contributor,
                source_name=parser.source_name,
                output_path=os.path.join(output_dir, img_name),
                fonts=fonts,
            )
            count += 1

    print(f"Generated {count + 1} OG images ({count} recipes + index)")


if __name__ == "__main__":
    main()
