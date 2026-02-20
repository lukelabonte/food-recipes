#!/usr/bin/env python3
"""Generate recipes.json search index from recipe HTML files."""

import json
import os
from html.parser import HTMLParser


class RecipeParser(HTMLParser):
    """Parse a single recipe HTML file and extract structured data."""

    def __init__(self):
        super().__init__()
        self.title = ""
        self.description = ""
        self.subtitle = ""
        self.time = ""
        self.servings = ""
        self.method = ""
        self.ingredients = []

        # State tracking
        self._in_title = False
        self._in_subtitle = False
        self._in_meta_list = False
        self._in_meta_li = False
        self._in_meta_strong = False
        self._in_ingredient_list = False
        self._in_ingredient_li = False
        self._in_ingredient_grams = False
        self._in_sub_list = False
        self._current_meta_label = ""
        self._current_meta_value = ""
        self._current_ingredient = ""

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)

        if tag == "title":
            self._in_title = True

        elif tag == "p":
            if "subtitle" in attrs_dict.get("class", ""):
                self._in_subtitle = True

        elif tag == "meta":
            if attrs_dict.get("property") == "og:description":
                self.description = attrs_dict.get("content", "")

        elif tag == "ul":
            class_attr = attrs_dict.get("class", "")
            if "sub-list" in class_attr:
                self._in_sub_list = True
            elif "meta-list" in class_attr:
                self._in_meta_list = True
            elif "ingredient-list" in class_attr:
                self._in_ingredient_list = True

        elif tag == "li":
            if self._in_sub_list:
                pass
            elif self._in_meta_list:
                self._in_meta_li = True
                self._current_meta_label = ""
                self._current_meta_value = ""
            elif self._in_ingredient_list:
                self._in_ingredient_li = True
                self._current_ingredient = ""

        elif tag == "strong" and self._in_meta_li:
            self._in_meta_strong = True

        elif tag == "span":
            class_attr = attrs_dict.get("class", "")
            if "ingredient-grams" in class_attr and self._in_ingredient_li:
                self._in_ingredient_grams = True

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False

        elif tag == "p" and self._in_subtitle:
            self._in_subtitle = False

        elif tag == "ul":
            if self._in_sub_list:
                self._in_sub_list = False
            elif self._in_meta_list:
                self._in_meta_list = False
            elif self._in_ingredient_list:
                self._in_ingredient_list = False

        elif tag == "li":
            if self._in_sub_list:
                pass
            elif self._in_meta_li:
                self._in_meta_li = False
                label = self._current_meta_label.strip().rstrip(":").lower()
                value = self._current_meta_value.strip()
                if label == "total":
                    self.time = value
                elif label == "servings":
                    self.servings = value
                elif label in ("method", "cooking method"):
                    self.method = value
            elif self._in_ingredient_li:
                self._in_ingredient_li = False
                ingredient = self._current_ingredient.strip()
                if ingredient:
                    self.ingredients.append(ingredient)

        elif tag == "strong" and self._in_meta_strong:
            self._in_meta_strong = False

        elif tag == "span" and self._in_ingredient_grams:
            self._in_ingredient_grams = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data

        elif self._in_subtitle:
            self.subtitle += data

        elif self._in_meta_strong:
            self._current_meta_label += data

        elif self._in_meta_li and not self._in_meta_strong:
            self._current_meta_value += data

        elif self._in_ingredient_li and not self._in_ingredient_grams and not self._in_sub_list:
            self._current_ingredient += data


def format_category(dirname):
    """Convert directory name to display format: 'soups-and-stews' -> 'Soups and Stews'."""
    return " ".join(
        word if word in ("and", "or", "the", "of") else word.capitalize()
        for word in dirname.split("-")
    )


def main():
    repo_root = os.path.dirname(os.path.abspath(__file__))
    skip_dirs = {".git", "docs"}
    recipes = []

    for entry in sorted(os.listdir(repo_root)):
        entry_path = os.path.join(repo_root, entry)
        if not os.path.isdir(entry_path):
            continue
        if entry in skip_dirs or entry.startswith("."):
            continue

        for filename in sorted(os.listdir(entry_path)):
            if not filename.endswith(".html"):
                continue

            filepath = os.path.join(entry_path, filename)
            with open(filepath, "r", encoding="utf-8") as f:
                html_content = f.read()

            parser = RecipeParser()
            parser.feed(html_content)

            recipe = {
                "title": parser.title,
                "description": parser.subtitle or parser.description,
                "category": format_category(entry),
                "time": parser.time,
                "servings": parser.servings,
                "method": parser.method,
                "ingredients": parser.ingredients,
                "url": f"{entry}/{filename}",
            }
            recipes.append(recipe)

    recipes.sort(key=lambda r: r["title"])

    output_path = os.path.join(repo_root, "recipes.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(recipes, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"Generated recipes.json with {len(recipes)} recipes")


if __name__ == "__main__":
    main()
