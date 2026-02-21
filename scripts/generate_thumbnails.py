#!/usr/bin/env python3
"""Generate Open Graph preview images for each recipe and the index page."""

import os
import sys
from html.parser import HTMLParser

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("Pillow is required: pip install Pillow")
    sys.exit(1)

# Standard OG image dimensions
WIDTH = 1200
HEIGHT = 630

# Colors (matching site theme)
BG_COLOR = (247, 245, 242)
TEXT_COLOR = (61, 61, 61)
SUBTITLE_COLOR = (102, 102, 102)
MUTED_COLOR = (153, 153, 153)
LIGHT_COLOR = (187, 187, 187)
ACCENT_DEFAULT = (74, 157, 229)

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

SITE_BASE = "https://lukelabonte.github.io/food-recipes"


class OGDataParser(HTMLParser):
    """Extract title, subtitle, time, and servings from a recipe HTML file."""

    def __init__(self):
        super().__init__()
        self.title = ""
        self.subtitle = ""
        self.time = ""
        self.servings = ""
        self._in_title = False
        self._in_subtitle = False
        self._in_meta_list = False
        self._in_meta_li = False
        self._in_meta_strong = False
        self._label = ""
        self._value = ""

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == "title":
            self._in_title = True
        elif tag == "p" and "subtitle" in d.get("class", ""):
            self._in_subtitle = True
        elif tag == "ul" and "meta-list" in d.get("class", ""):
            self._in_meta_list = True
        elif tag == "li" and self._in_meta_list:
            self._in_meta_li = True
            self._label = ""
            self._value = ""
        elif tag == "strong" and self._in_meta_li:
            self._in_meta_strong = True

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

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        elif self._in_subtitle:
            self.subtitle += data
        elif self._in_meta_strong:
            self._label += data
        elif self._in_meta_li:
            self._value += data


def find_font(bold=False):
    """Find a suitable font file across platforms."""
    suffix = "Bold" if bold else "Regular"
    candidates = [
        # Linux (GitHub Actions Ubuntu runner)
        f"/usr/share/fonts/truetype/dejavu/DejaVuSans{'-Bold' if bold else ''}.ttf",
        f"/usr/share/fonts/truetype/liberation/LiberationSans-{suffix}.ttf",
        # macOS
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/Library/Fonts/Arial.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return None


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
    return lines


def draw_centered(draw, y, text, font, fill, max_width=None):
    """Draw horizontally centered text, with optional word wrapping. Returns new y."""
    lines = wrap_text(draw, text, font, max_width) if max_width else [text]
    line_height = int(font.size * 1.35)
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        w = bbox[2] - bbox[0]
        draw.text(((WIDTH - w) / 2, y), line, fill=fill, font=font)
        y += line_height
    return y


def generate_recipe_image(title, subtitle, category, time_str, servings, output_path, fonts):
    """Generate an OG card image for a single recipe."""
    img = Image.new("RGB", (WIDTH, HEIGHT), BG_COLOR)
    draw = ImageDraw.Draw(img)

    # Accent bar at top
    accent = CATEGORY_ACCENTS.get(category, ACCENT_DEFAULT)
    draw.rectangle([0, 0, WIDTH, 6], fill=accent)

    # Category label (small caps)
    cat_text = format_category(category).upper()
    y = 160
    y = draw_centered(draw, y, cat_text, fonts["category"], MUTED_COLOR)

    # Recipe title
    y += 20
    y = draw_centered(draw, y, title, fonts["title"], TEXT_COLOR, max_width=1000)

    # Subtitle
    if subtitle:
        y += 14
        y = draw_centered(draw, y, subtitle, fonts["subtitle"], SUBTITLE_COLOR, max_width=900)

    # Time and servings
    parts = []
    if time_str:
        parts.append(time_str)
    if servings:
        parts.append(f"{servings} servings")
    if parts:
        y += 18
        draw_centered(draw, y, " · ".join(parts), fonts["meta"], MUTED_COLOR)

    # Branding
    draw_centered(draw, HEIGHT - 50, "── Our Recipes ──", fonts["brand"], LIGHT_COLOR)

    img.save(output_path, "PNG", optimize=True)


def generate_index_image(output_path, fonts):
    """Generate an OG card image for the index page."""
    img = Image.new("RGB", (WIDTH, HEIGHT), BG_COLOR)
    draw = ImageDraw.Draw(img)

    draw.rectangle([0, 0, WIDTH, 6], fill=ACCENT_DEFAULT)

    y = 220
    y = draw_centered(draw, y, "Our Recipes", fonts["title"], TEXT_COLOR)
    y += 14
    draw_centered(draw, y, "A family recipe collection.", fonts["subtitle"], SUBTITLE_COLOR)

    img.save(output_path, "PNG", optimize=True)


def format_category(dirname):
    """Convert 'soups-and-stews' to 'Soups and Stews'."""
    return " ".join(
        word if word in ("and", "or", "the", "of") else word.capitalize()
        for word in dirname.split("-")
    )


def main():
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    output_dir = os.path.join(repo_root, "assets", "thumbnails")
    os.makedirs(output_dir, exist_ok=True)

    regular = find_font(bold=False)
    bold = find_font(bold=True)
    if not regular:
        print("Error: no suitable font found")
        sys.exit(1)

    fonts = {
        "category": ImageFont.truetype(regular, 22),
        "title": ImageFont.truetype(bold or regular, 48),
        "subtitle": ImageFont.truetype(regular, 26),
        "meta": ImageFont.truetype(regular, 22),
        "brand": ImageFont.truetype(regular, 18),
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
                output_path=os.path.join(output_dir, img_name),
                fonts=fonts,
            )
            count += 1

    print(f"Generated {count + 1} OG images ({count} recipes + index)")


if __name__ == "__main__":
    main()
