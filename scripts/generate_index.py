#!/usr/bin/env python3
"""Generate index.html from recipes.json and git history."""

import json
import os
import subprocess
from datetime import datetime

CATEGORY_EMOJI = {
    "appetizers": "\U0001f362",
    "beverages": "\U0001f964",
    "breakfast": "\U0001f373",
    "desserts": "\U0001f370",
    "main-dishes": "\U0001f37d\ufe0f",
    "salads": "\U0001f957",
    "sauces-and-dressings": "\U0001fad9",
    "side-dishes": "\U0001f958",
    "snacks": "\U0001f37f",
    "soups-and-stews": "\U0001f372",
}

SITE_BASE = "https://copyandpastry.com"


def category_to_dir(display_name):
    """Convert display name to directory: 'Main Dishes' -> 'main-dishes'.

    Must stay in sync with format_category() in generate_search_index.py,
    which does the reverse conversion when building recipes.json.
    """
    return display_name.lower().replace(" ", "-")


def get_git_add_date(filepath, repo_root):
    """Get the date a file was first committed. Falls back to file mtime."""
    try:
        result = subprocess.run(
            ["git", "log", "--diff-filter=A", "--format=%ai", "--", filepath],
            capture_output=True,
            text=True,
            timeout=10,
            cwd=repo_root,
        )
        if result.returncode == 0 and result.stdout.strip():
            # Last line = oldest addition (first commit of this file)
            date_str = result.stdout.strip().split("\n")[-1].strip()
            return datetime.fromisoformat(date_str)
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    # Fallback: file modification time
    try:
        return datetime.fromtimestamp(os.path.getmtime(filepath))
    except OSError:
        return datetime.min


def format_date(dt):
    """Format as 'Feb 20, 2026'."""
    return f"{dt.strftime('%b')} {dt.day}, {dt.year}"


def format_servings(servings):
    """Format servings text: '4' -> '4 servings', '1' -> '1 serving'."""
    if not servings:
        return ""
    return servings + (" serving" if servings == "1" else " servings")


def esc(text):
    """Escape HTML special characters."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def render_card(recipe, indent):
    """Render a recipe card. indent = spaces for the <a> tag."""
    url = recipe["url"].removesuffix(".html")
    i0 = " " * indent
    i1 = " " * (indent + 4)
    i2 = " " * (indent + 8)
    i3 = " " * (indent + 12)

    meta = []
    if recipe.get("time"):
        meta.append(f"{i3}<span>{esc(recipe['time'])}</span>")
    srv = format_servings(recipe.get("servings", ""))
    if srv:
        meta.append(f"{i3}<span>{esc(srv)}</span>")
    if recipe.get("method"):
        meta.append(f"{i3}<span>{esc(recipe['method'])}</span>")

    lines = [
        f'{i0}<a href="{esc(url)}" class="recipe-card">',
        f"{i1}<div class=\"recipe-card-content\">",
        f"{i2}<div class=\"recipe-card-title\">{esc(recipe['title'])}</div>",
        f"{i2}<div class=\"recipe-card-desc\">{esc(recipe['description'])}</div>",
        f"{i2}<div class=\"recipe-card-meta\">",
        *meta,
        f"{i2}</div>",
        f"{i1}</div>",
        f'{i1}<span class="recipe-card-chevron">\u203a</span>',
        f"{i0}</a>",
    ]
    return "\n".join(lines)


def main():
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    recipes_path = os.path.join(repo_root, "assets", "recipes.json")

    with open(recipes_path, "r", encoding="utf-8") as f:
        recipes = json.load(f)

    # Get git add dates for each recipe file
    for recipe in recipes:
        filepath = os.path.join(repo_root, recipe["url"])
        recipe["_git_date"] = get_git_add_date(filepath, repo_root)

    # Group by category
    categories = {}
    for recipe in recipes:
        categories.setdefault(recipe["category"], []).append(recipe)
    for cat in categories:
        categories[cat].sort(key=lambda r: r["title"])

    sorted_cats = sorted(categories.keys())

    if not recipes:
        print("No recipes found in recipes.json — skipping index generation")
        return

    # Top 3 most recently added recipes
    recent = sorted(recipes, key=lambda r: r["_git_date"], reverse=True)[:3]

    # Most recent date for "Last updated"
    latest_date = max(r["_git_date"] for r in recipes)
    total = len(recipes)

    # --- Build HTML sections ---

    # Recently added cards (indent 12 = inside category-section)
    recent_cards = "\n".join(render_card(r, 12) for r in recent)

    # Category sections
    cat_blocks = []
    for cat_name in sorted_cats:
        cat_recipes = categories[cat_name]
        slug = category_to_dir(cat_name)
        emoji = CATEGORY_EMOJI.get(slug, "\U0001f4c1")
        count = len(cat_recipes)
        count_text = f"{count} recipe" if count == 1 else f"{count} recipes"
        cards = "\n".join(render_card(r, 20) for r in cat_recipes)
        cat_blocks.append(
            f'        <div class="category-section">\n'
            f"            <details open>\n"
            f"                <summary>\n"
            f'                    <span class="category-emoji">{emoji}</span>\n'
            f'                    <span class="category-name">{esc(cat_name)}</span>\n'
            f'                    <span class="category-count">{count_text}</span>\n'
            f"                </summary>\n"
            f'                <div class="category-recipes">\n'
            f"{cards}\n"
            f"                </div>\n"
            f"            </details>\n"
            f"        </div>"
        )

    categories_html = "\n\n".join(cat_blocks)

    # --- Assemble full page ---
    html = (
        "<!DOCTYPE html>\n"
        '<html lang="en">\n'
        "<head>\n"
        '    <meta charset="UTF-8">\n'
        '    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
        "    <title>Our Recipes</title>\n"
        '    <link rel="stylesheet" href="assets/style.css">\n'
        "    <style>.index { max-width: 640px; margin: 0 auto; }</style>\n"
        "    <link rel=\"icon\" href=\"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'"
        " viewBox='0 0 100 100'><text y='.9em' font-size='90'>\U0001f4d6</text></svg>\">\n"
        '    <meta property="og:title" content="Our Recipes">\n'
        f'    <meta property="og:description" content="A family recipe collection. {total} recipes and counting.">\n'
        '    <meta property="og:type" content="website">\n'
        f'    <meta property="og:image" content="{SITE_BASE}/assets/thumbnails/index.png">\n'
        '    <meta property="og:image:width" content="1200">\n'
        '    <meta property="og:image:height" content="630">\n'
        f'    <meta property="og:url" content="{SITE_BASE}/">\n'
        '    <script src="https://cdn.jsdelivr.net/npm/fuse.js@7.1.0/dist/fuse.min.js" defer></script>\n'
        '    <script src="assets/search.js" defer></script>\n'
        '    <script src="assets/theme.js" defer></script>\n'
        "</head>\n"
        "<body>\n"
        '    <div class="index">\n'
        "\n"
        '        <div class="card header-card">\n'
        "            <h1>Our Recipes</h1>\n"
        f'            <p class="subtitle">{total} recipes \u00b7 Last updated {format_date(latest_date)}</p>\n'
        '            <div class="search-wrapper">\n'
        '                <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" fill="none"'
        ' viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">\n'
        '                    <path stroke-linecap="round" stroke-linejoin="round"'
        ' d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />\n'
        "                </svg>\n"
        '                <input type="text" id="search-input" placeholder="Search recipes..." autocomplete="off">\n'
        '                <button class="search-clear" id="search-clear" aria-label="Clear search">&times;</button>\n'
        "            </div>\n"
        "        </div>\n"
        "\n"
        '        <div id="default-content">\n'
        '        <div class="category-section">\n'
        '            <p class="section-label">\U0001f550 Recently Added</p>\n'
        f"{recent_cards}\n"
        "        </div>\n"
        "\n"
        f"{categories_html}\n"
        "        </div>\n"
        "\n"
        '        <div id="search-results"></div>\n'
        '        <div id="no-results">No recipes found</div>\n'
        "\n"
        "    </div>\n"
        "</body>\n"
        "</html>\n"
    )

    output_path = os.path.join(repo_root, "index.html")
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"Generated index.html with {total} recipes across {len(sorted_cats)} categories")


if __name__ == "__main__":
    main()
