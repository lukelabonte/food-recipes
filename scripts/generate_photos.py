#!/usr/bin/env python3
"""Generate recipe photos via Cloudflare Workers AI (Flux 2 Klein 4B).

Scans recipe HTML files, checks for existing photos in assets/photos/<slug>/,
and generates missing photos using the Workers AI image generation API.

Photo directory structure per recipe:
    assets/photos/<slug>/
    ├── photo.webp         # Generated/final photo (used by the site)
    ├── prompt.txt         # Custom generation prompt (written by AI during upload)
    ├── source-1.jpg       # Original uploaded image (if any)
    └── source-2.jpg       # Additional sources (if any)

Prompt priority:
    1. prompt.txt + recipe title/description (richest context)
    2. Auto-built from recipe title + subtitle/description (fallback)

Usage:
    python3 scripts/generate_photos.py            # Generate missing photos only
    python3 scripts/generate_photos.py --force     # Regenerate all photos
    python3 scripts/generate_photos.py --dry-run   # Show what would be generated

Requires:
    - Pillow (brew install pillow or pip install Pillow)
    - Auth: CLOUDFLARE_API_TOKEN env var (CI) or Wrangler OAuth token (local dev)
"""

import io
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error

try:
    import tomllib
except ImportError:
    import tomli as tomllib  # Python < 3.11

from PIL import Image

# --- Config ---

ACCOUNT_ID = "3a857a3e3e6eba503ec56169d44aba39"
MODEL = "@cf/black-forest-labs/flux-2-klein-4b"
API_URL = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/{MODEL}"

TARGET_WIDTH = 800
TARGET_HEIGHT = 600
WEBP_QUALITY = 82

WRANGLER_CONFIG = os.path.expanduser(
    "~/Library/Preferences/.wrangler/config/default.toml"
)

FALLBACK_PROMPT_TEMPLATE = (
    "Overhead food photography of {description}. "
    "Warm natural lighting, clean background, appetizing presentation. "
    "No text, no watermarks, no UI elements."
)

SKIP_DIRS = {".git", "docs", "assets", "scripts", "worker", ".github", "node_modules"}


# --- Token ---

def get_api_token():
    """Get Cloudflare API token: env var (CI) or Wrangler OAuth (local dev)."""
    env_token = os.environ.get("CLOUDFLARE_API_TOKEN")
    if env_token:
        return env_token

    if not os.path.exists(WRANGLER_CONFIG):
        print("Error: No CLOUDFLARE_API_TOKEN env var and no Wrangler config found.")
        print("Set CLOUDFLARE_API_TOKEN or run `npx wrangler login`.")
        sys.exit(1)

    with open(WRANGLER_CONFIG, "rb") as f:
        config = tomllib.load(f)

    token = config.get("oauth_token")
    if not token:
        print("Error: No oauth_token found in wrangler config.")
        print("Run `npx wrangler login` to authenticate.")
        sys.exit(1)

    return token


# --- Recipe discovery ---

def extract_recipe_info(html_content):
    """Extract title and subtitle/description from recipe HTML."""
    title_match = re.search(r"<title>([^<]+)</title>", html_content)
    title = title_match.group(1).strip() if title_match else ""

    subtitle_match = re.search(
        r'<p\s+class="subtitle">(.*?)</p>', html_content, re.DOTALL
    )
    subtitle = ""
    if subtitle_match:
        subtitle = re.sub(r"<[^>]+>", "", subtitle_match.group(1)).strip()

    og_match = re.search(
        r'<meta\s+property="og:description"\s+content="([^"]*)"', html_content
    )
    og_desc = og_match.group(1).strip() if og_match else ""

    description = subtitle or og_desc or title
    return title, description


def discover_recipes(repo_root):
    """Find all recipe HTML files and return (slug, title, description) tuples."""
    recipes = []

    for entry in sorted(os.listdir(repo_root)):
        entry_path = os.path.join(repo_root, entry)
        if not os.path.isdir(entry_path):
            continue
        if entry in SKIP_DIRS or entry.startswith("."):
            continue

        for filename in sorted(os.listdir(entry_path)):
            if not filename.endswith(".html"):
                continue

            filepath = os.path.join(entry_path, filename)
            with open(filepath, "r", encoding="utf-8") as f:
                html_content = f.read()

            slug = filename.removesuffix(".html")
            title, description = extract_recipe_info(html_content)
            recipes.append((slug, title, description))

    return recipes


# --- Prompt resolution ---

def get_prompt(slug, title, description, photos_dir):
    """Get the generation prompt: combine prompt.txt with recipe info, or fall back to template.

    When prompt.txt exists (written by AI during upload with visual context from
    source images), it's combined with the recipe title and description for the
    richest possible prompt. Without prompt.txt, a template is built from title
    and description alone.
    """
    prompt_path = os.path.join(photos_dir, slug, "prompt.txt")
    if os.path.exists(prompt_path):
        with open(prompt_path, "r", encoding="utf-8") as f:
            visual_context = f.read().strip()
        if visual_context:
            prompt = (
                f"Overhead food photography of {title.lower()}: {description.lower()}. "
                f"{visual_context} "
                "Warm natural lighting, clean background, appetizing presentation. "
                "No text, no watermarks, no UI elements."
            )
            return prompt, "prompt.txt + recipe info"

    prompt = FALLBACK_PROMPT_TEMPLATE.format(description=description.lower())
    return prompt, "auto-generated"


# --- Image generation ---

def generate_image(prompt, token):
    """Call Workers AI to generate an image, return PIL Image.

    Flux 2 models require multipart/form-data input, even for text-only prompts.
    Response is JSON with result.image as base64-encoded JPEG.
    """
    import base64
    import uuid

    boundary = uuid.uuid4().hex
    safe_prompt = prompt.replace("\r\n", " ").replace("\r", " ").replace("\n", " ")
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="prompt"\r\n\r\n'
        f"{safe_prompt}\r\n"
        f"--{boundary}--\r\n"
    ).encode("utf-8")

    req = urllib.request.Request(
        API_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            response_bytes = resp.read()
    except urllib.error.HTTPError as e:
        if e.code == 401:
            print("\nError: API token unauthorized. Check CLOUDFLARE_API_TOKEN or run `npx wrangler login`.")
            sys.exit(1)
        body_text = e.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"API error {e.code}: {body_text}")

    # Response is JSON: {"result": {"image": "<base64-jpeg>"}, "success": true}
    data = json.loads(response_bytes)
    if not data.get("success"):
        errors = data.get("errors", [])
        raise RuntimeError(f"API returned failure: {errors}")

    result = data.get("result") or {}
    image_b64 = result.get("image")
    if not image_b64:
        raise RuntimeError(f"API returned success but no image data: {data}")
    image_bytes = base64.b64decode(image_b64)
    return Image.open(io.BytesIO(image_bytes))


def resize_and_save(img, output_path):
    """Center-crop to 4:3 aspect ratio and resize to 800x600, save as WebP."""
    w, h = img.size
    target_ratio = TARGET_WIDTH / TARGET_HEIGHT

    current_ratio = w / h
    if current_ratio > target_ratio:
        new_w = int(h * target_ratio)
        left = (w - new_w) // 2
        img = img.crop((left, 0, left + new_w, h))
    elif current_ratio < target_ratio:
        new_h = int(w / target_ratio)
        top = (h - new_h) // 2
        img = img.crop((0, top, w, top + new_h))

    img = img.resize((TARGET_WIDTH, TARGET_HEIGHT), Image.LANCZOS)

    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")

    img.save(output_path, "WEBP", quality=WEBP_QUALITY)


# --- Main ---

def main():
    force = "--force" in sys.argv
    dry_run = "--dry-run" in sys.argv

    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    photos_dir = os.path.join(repo_root, "assets", "photos")
    os.makedirs(photos_dir, exist_ok=True)

    recipes = discover_recipes(repo_root)
    if not recipes:
        print("No recipes found.")
        return

    # Determine which need generation
    to_generate = []
    for slug, title, description in recipes:
        photo_path = os.path.join(photos_dir, slug, "photo.webp")
        if os.path.exists(photo_path) and not force:
            continue
        to_generate.append((slug, title, description))

    if not to_generate:
        print(f"All {len(recipes)} recipes already have photos. Use --force to regenerate.")
        return

    if dry_run:
        print(f"Would generate {len(to_generate)} photos:")
        for slug, title, description in to_generate:
            _, prompt_source = get_prompt(slug, title, description, photos_dir)
            print(f"  {slug}/photo.webp ({title}) [prompt: {prompt_source}]")
        return

    token = get_api_token()
    print(f"Generating {len(to_generate)}/{len(recipes)} recipe photos...")
    print()

    generated = 0
    for i, (slug, title, description) in enumerate(to_generate, 1):
        slug_dir = os.path.join(photos_dir, slug)
        os.makedirs(slug_dir, exist_ok=True)
        output_path = os.path.join(slug_dir, "photo.webp")

        prompt, prompt_source = get_prompt(slug, title, description, photos_dir)

        print(f"  [{i}/{len(to_generate)}] {slug}/photo.webp [{prompt_source}]...", end=" ", flush=True)
        start = time.time()

        try:
            img = generate_image(prompt, token)
            resize_and_save(img, output_path)
            size_kb = os.path.getsize(output_path) / 1024
            elapsed = time.time() - start
            print(f"done ({size_kb:.0f} KB, {elapsed:.1f}s)")
            generated += 1
        except Exception as e:
            print(f"FAILED: {e}")
            continue

        # Rate limit courtesy
        if i < len(to_generate):
            time.sleep(1)

    print()
    print(f"Generated {generated} photos in assets/photos/")


if __name__ == "__main__":
    main()
