"""Offline tests of the actual composer without importing Pillow or API code."""

import ast
import os
from pathlib import Path
import re
import tempfile
import unittest


def load_composer():
    source_path = Path(__file__).with_name("generate_photos.py")
    source_tree = ast.parse(source_path.read_text(encoding="utf-8"))
    composer_nodes = [
        node for node in source_tree.body
        if (isinstance(node, ast.FunctionDef) and node.name == "get_prompt")
        or (isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == "FALLBACK_PROMPT_TEMPLATE"
            for target in node.targets
        ))
    ]
    namespace = {"os": os}
    exec(compile(ast.Module(body=composer_nodes, type_ignores=[]),
                 str(source_path), "exec"), namespace)
    return namespace["get_prompt"]


class PhotoPromptTests(unittest.TestCase):
    def test_custom_visual_is_used_once_without_title_or_marketing(self):
        # Proposed visual grounded in the rye loaf, dip, and dippers in the recipe.
        visual = (
            "A round rye bread bowl filled with smooth, glossy, pale cream-yellow cheese dip. "
            "Torn bread chunks surround the bowl for dipping."
        )
        with tempfile.TemporaryDirectory() as photos_directory:
            prompt_directory = Path(photos_directory) / "cheese-dip"
            prompt_directory.mkdir()
            (prompt_directory / "prompt.txt").write_text(visual, encoding="utf-8")
            prompt, source = load_composer()(
                "cheese-dip", "Uncle Larry's Cheese Bread Beer Dip",
                "A crowd-pleasing party classic.", photos_directory
            )

        self.assertEqual(prompt, (
            "Overhead food photography of A round rye bread bowl filled with smooth, glossy, "
            "pale cream-yellow cheese dip. Torn bread chunks surround the bowl for dipping. "
            "Warm natural lighting, clean background, appetizing presentation. "
            "No text, no watermarks, no UI elements."
        ))
        self.assertEqual(source, "prompt.txt")
        self.assertEqual(prompt.count(visual), 1)
        self.assertNotIn("uncle larry", prompt.lower())
        self.assertNotIn("crowd-pleasing", prompt)

    def test_custom_visual_is_trimmed_without_rewriting_internal_text(self):
        visual = (
            "Smooth golden cheese dip with red tomato pieces and green chile in a white bowl.\n"
            "Tortilla chips sit beside the bowl."
        )
        with tempfile.TemporaryDirectory() as photos_directory:
            prompt_directory = Path(photos_directory) / "rotel-dip"
            prompt_directory.mkdir()
            (prompt_directory / "prompt.txt").write_text(
                " \t\n" + visual + "\n\t ", encoding="utf-8"
            )
            prompt, source = load_composer()(
                "rotel-dip", "Rotel Tomato Cheese Dip",
                "The ultimate two-ingredient queso dip.", photos_directory
            )

        self.assertEqual(prompt, (
            "Overhead food photography of Smooth golden cheese dip with red tomato pieces "
            "and green chile in a white bowl.\nTortilla chips sit beside the bowl. "
            "Warm natural lighting, clean background, appetizing presentation. "
            "No text, no watermarks, no UI elements."
        ))
        self.assertEqual(source, "prompt.txt")
        self.assertEqual(prompt.count(visual), 1)
        self.assertEqual(prompt.count("Overhead food photography of "), 1)
        self.assertEqual(prompt.count("Warm natural lighting, clean background, appetizing presentation."), 1)
        self.assertEqual(prompt.count("No text, no watermarks, no UI elements."), 1)
        self.assertNotIn("ultimate", prompt)

    def test_missing_empty_and_whitespace_prompts_preserve_exact_fallback(self):
        for visual in [None, "", " \t\n\r\n "]:
            with self.subTest(visual=visual), tempfile.TemporaryDirectory() as photos_directory:
                if visual is not None:
                    prompt_directory = Path(photos_directory) / "onions"
                    prompt_directory.mkdir()
                    (prompt_directory / "prompt.txt").write_text(visual, encoding="utf-8")
                prompt, source = load_composer()(
                    "onions", "Quick Pickled Red Onions",
                    "Tangy, slightly sweet, and spiced with cinnamon and oregano. Put them on everything.",
                    photos_directory
                )

                # The existing fallback deliberately retains lowercasing and double punctuation.
                self.assertEqual(prompt, (
                    "Overhead food photography of tangy, slightly sweet, and spiced with cinnamon "
                    "and oregano. put them on everything.. "
                    "Warm natural lighting, clean background, appetizing presentation. "
                    "No text, no watermarks, no UI elements."
                ))
                self.assertEqual(source, "auto-generated")

    def test_proposed_visual_examples_fit_the_instruction_bounds(self):
        # Proposed examples grounded in the named recipe HTML and audited visual text.
        examples = {
            "rotel-tomato-cheese-dip": (
                "Smooth golden cheese dip with red tomato pieces and green chile in a white bowl. "
                "Tortilla chips sit beside the bowl."
            ),
            "uncle-larrys-cheese-bread-beer-dip": (
                "A round rye bread bowl filled with smooth, glossy, pale cream-yellow cheese dip. "
                "Torn bread chunks surround the bowl for dipping."
            ),
            "double-chocolate-cookies": (
                "Thick, dark brown chocolate cookies on a white plate with crackled surfaces "
                "and glossy chocolate chips. A broken cookie reveals a dense interior."
            )
        }
        for slug, visual in examples.items():
            with self.subTest(slug=slug):
                self.assertLessEqual(len(visual.split()), 60)
                sentences = [sentence for sentence in re.split(r"[.!?]+", visual) if sentence.strip()]
                self.assertGreaterEqual(len(sentences), 1)
                self.assertLessEqual(len(sentences), 3)


if __name__ == "__main__":
    unittest.main()
