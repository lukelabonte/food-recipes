"""Offline composer and reference pipeline tests; all network calls are mocked."""

import ast
import base64
from contextlib import redirect_stdout
from email import policy
from email.parser import BytesParser
import importlib.util
import io
import os
from pathlib import Path
import re
import struct
import tempfile
import unittest
from unittest import mock
import zlib


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


class ReferenceImageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            from PIL import Image, PngImagePlugin
        except ImportError:
            raise unittest.SkipTest("Reference tests require the existing production Pillow dependency")
        cls.image_module = Image
        cls.png_metadata = PngImagePlugin
        source_path = Path(__file__).with_name("generate_photos.py")
        specification = importlib.util.spec_from_file_location("photo_generator_under_test", source_path)
        cls.generator = importlib.util.module_from_spec(specification)
        specification.loader.exec_module(cls.generator)

    def setUp(self):
        self.directory = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.photos_directory = self.directory / "assets" / "photos"
        self.recipe_directory = self.photos_directory / "test-dish"
        self.recipe_directory.mkdir(parents=True)
        self.network = self.enterContext(mock.patch.object(
            self.generator.urllib.request, "urlopen", side_effect=AssertionError("Network is forbidden")
        ))

    def png_bytes(self, size=(32, 24), metadata=None):
        output = io.BytesIO()
        self.image_module.new("RGB", size, (30, 90, 150)).save(output, "PNG", pnginfo=metadata)
        return output.getvalue()

    def write_reference(self, content):
        reference_path = self.recipe_directory / "reference.png"
        reference_path.write_bytes(content)
        return reference_path

    def test_only_explicit_reference_png_is_selected(self):
        (self.recipe_directory / "source-1.png").write_bytes(self.png_bytes())
        (self.recipe_directory / "source-2.jpg").write_bytes(b"not a reference")
        self.assertIsNone(self.generator.load_reference("test-dish", self.photos_directory))
        self.write_reference(self.png_bytes())
        reference = self.generator.load_reference("test-dish", self.photos_directory)
        with self.image_module.open(io.BytesIO(reference)) as image:
            image.load()
            self.assertEqual(image.size, (32, 24))
            self.assertEqual(image.getpixel((0, 0)), (30, 90, 150, 255))
        self.network.assert_not_called()

    def test_reference_metadata_is_removed_before_upload(self):
        metadata = self.png_metadata.PngInfo()
        metadata.add_text("private-note", "must not be uploaded")
        exif = self.image_module.Exif()
        exif[270] = "private EXIF description"
        output = io.BytesIO()
        self.image_module.new("RGB", (32, 24), (30, 90, 150)).save(
            output, "PNG", pnginfo=metadata, exif=exif, icc_profile=b"private ICC profile"
        )
        original = output.getvalue()
        self.write_reference(original)
        reference = self.generator.load_reference("test-dish", self.photos_directory)
        self.assertNotEqual(reference, original)
        self.assertNotIn(b"private-note", reference)
        self.assertNotIn(b"must not be uploaded", reference)
        with self.image_module.open(io.BytesIO(reference)) as image:
            self.assertEqual(image.info, {})
            self.assertEqual(image.getpixel((0, 0)), (30, 90, 150, 255))
        self.network.assert_not_called()

    def test_invalid_references_raise_without_network(self):
        for content in [b"", b"not PNG", b"\x89PNG\r\n\x1a\ncorrupt", self.png_bytes()[:-12],
                        self.png_bytes((513, 1)), self.png_bytes((1, 513)), b"x" * (2 * 1024 * 1024 + 1)]:
            with self.subTest(length=len(content)):
                self.write_reference(content)
                with self.assertRaises(ValueError):
                    self.generator.load_reference("test-dish", self.photos_directory)
        self.network.assert_not_called()

    def test_symlink_reference_and_unsafe_slug_raise(self):
        outside = self.directory / "private.png"
        outside.write_bytes(self.png_bytes())
        (self.recipe_directory / "reference.png").symlink_to(outside)
        for slug in ["test-dish", "../test-dish", "/test-dish", "..", "test\\dish"]:
            with self.subTest(slug=slug), self.assertRaises(ValueError):
                self.generator.load_reference(slug, self.photos_directory)
        self.network.assert_not_called()

    def test_maximum_512_square_reference_is_accepted(self):
        self.write_reference(self.png_bytes((512, 512)))
        reference = self.generator.load_reference("test-dish", self.photos_directory)
        with self.image_module.open(io.BytesIO(reference)) as image:
            image.load()
            self.assertEqual(image.size, (512, 512))
        self.network.assert_not_called()

    def test_zero_dimension_renamed_jpeg_and_animated_png_are_rejected(self):
        zero_width = bytearray(self.png_bytes())
        zero_width[16:20] = struct.pack(">I", 0)
        zero_width[29:33] = struct.pack(">I", zlib.crc32(zero_width[12:29]))
        jpeg = io.BytesIO()
        self.image_module.new("RGB", (2, 2)).save(jpeg, "JPEG")
        animation = io.BytesIO()
        self.image_module.new("RGBA", (2, 2), "red").save(
            animation, "PNG", save_all=True,
            append_images=[self.image_module.new("RGBA", (2, 2), "blue")], duration=10
        )
        for content in [zero_width, jpeg.getvalue(), animation.getvalue()]:
            with self.subTest(signature=bytes(content[:8])):
                self.write_reference(content)
                with self.assertRaises(ValueError):
                    self.generator.load_reference("test-dish", self.photos_directory)
        self.network.assert_not_called()

    def test_directory_symlink_broken_link_and_nonregular_reference_are_rejected(self):
        (self.directory / "dish-link").symlink_to(self.recipe_directory, target_is_directory=True)
        self.write_reference(self.png_bytes())
        with self.assertRaises(ValueError):
            self.generator.load_reference("dish-link", self.directory)
        (self.recipe_directory / "reference.png").unlink()
        (self.recipe_directory / "reference.png").symlink_to(self.directory / "missing.png")
        with self.assertRaises(ValueError):
            self.generator.load_reference("test-dish", self.photos_directory)
        (self.recipe_directory / "reference.png").unlink()
        (self.recipe_directory / "reference.png").mkdir()
        with self.assertRaises(ValueError):
            self.generator.load_reference("test-dish", self.photos_directory)
        self.network.assert_not_called()

    def test_inaccessible_reference_path_is_not_treated_as_absent(self):
        with mock.patch.object(self.generator.os, "lstat", side_effect=PermissionError), self.assertRaises(ValueError):
            self.generator.load_reference("test-dish", self.photos_directory)
        self.network.assert_not_called()

    def mock_image_response(self):
        response = b'{"success":true,"result":{"image":"' + base64.b64encode(self.png_bytes()) + b'"}}'
        self.network.side_effect = lambda *args, **kwargs: io.BytesIO(response)
        self.enterContext(mock.patch("uuid.uuid4", return_value=mock.Mock(hex="test-boundary")))

    def request_parts(self):
        request = self.network.call_args.args[0]
        message = BytesParser(policy=policy.default).parsebytes(
            b"Content-Type: " + request.get_header("Content-type").encode() + b"\r\n\r\n" + request.data
        )
        parts = {part.get_param("name", header="content-disposition"): part for part in message.iter_parts()}
        return request, parts

    def test_no_reference_request_preserves_exact_text_only_defaults(self):
        self.mock_image_response()
        self.generator.generate_image("Same visual\r\nwith fixed style.", "offline-only")
        request, parts = self.request_parts()
        self.assertEqual(request.data, (
            b'--test-boundary\r\nContent-Disposition: form-data; name="prompt"\r\n\r\n'
            b'Same visual with fixed style.\r\n--test-boundary--\r\n'
        ))
        self.assertEqual(list(parts), ["prompt"])
        self.assertEqual(request.full_url, self.generator.API_URL)
        self.assertTrue(request.full_url.endswith("/@cf/black-forest-labs/flux-2-klein-4b"))
        self.network.assert_called_once()

    def test_reference_request_sends_binary_png_with_exact_trial_settings(self):
        self.write_reference(self.png_bytes())
        reference = self.generator.load_reference("test-dish", self.photos_directory)
        prompt, _ = self.generator.get_prompt("test-dish", "Dish", "Finished food", self.photos_directory)
        self.mock_image_response()
        self.generator.generate_image(prompt, "offline-only", reference_png=reference)

        request, parts = self.request_parts()
        self.assertEqual(list(parts), ["prompt", "width", "height", "seed", "input_image_0"])
        self.assertEqual(parts["prompt"].get_payload(decode=True), prompt.encode())
        for field, value in [("width", b"1024"), ("height", b"1024"), ("seed", b"2718")]:
            self.assertEqual(parts[field].get_payload(decode=True), value)
        self.assertEqual(parts["input_image_0"].get_payload(decode=True), reference)
        self.assertEqual(parts["input_image_0"].get_content_type(), "image/png")
        self.assertEqual(parts["input_image_0"].get_filename(), "reference.png")
        self.assertNotIn(base64.b64encode(reference), request.data)
        self.network.assert_called_once()

    def run_main(self, arguments=()):
        output = io.StringIO()
        with mock.patch.object(self.generator, "__file__", str(self.directory / "scripts" / "generate_photos.py")), \
                mock.patch.object(self.generator, "discover_recipes", return_value=[("test-dish", "Dish", "Finished food")]), \
                mock.patch.object(self.generator, "get_api_token", return_value="offline-only") as token_lookup, \
                mock.patch.object(self.generator.sys, "argv", ["generate_photos.py", *arguments]), \
                redirect_stdout(output):
            self.generator.main()
        return token_lookup, output.getvalue()

    def test_main_propagates_explicit_reference_to_the_binary_request(self):
        metadata = self.png_metadata.PngInfo()
        metadata.add_text("private-note", "must not be uploaded")
        original = self.png_bytes(metadata=metadata)
        self.write_reference(original)
        self.mock_image_response()
        self.run_main()
        _, parts = self.request_parts()
        self.assertIn("input_image_0", parts)
        payload = parts["input_image_0"].get_payload(decode=True)
        self.assertNotEqual(payload, original)
        self.assertNotIn(b"private-note", payload)
        with self.image_module.open(io.BytesIO(payload)) as image:
            self.assertEqual(image.size, (32, 24))
            self.assertEqual(image.info, {})
        self.network.assert_called_once()

    def test_main_does_not_upload_ordinary_sources(self):
        (self.recipe_directory / "source-1.png").write_bytes(self.png_bytes())
        self.mock_image_response()
        self.run_main()
        _, parts = self.request_parts()
        self.assertEqual(list(parts), ["prompt"])
        self.network.assert_called_once()

    def test_invalid_opt_in_does_not_make_a_request_or_fall_back(self):
        self.write_reference(b"corrupt PNG")
        _, output = self.run_main()
        self.assertIn("FAILED:", output)
        self.assertFalse((self.recipe_directory / "photo.webp").exists())
        self.network.assert_not_called()

    def test_reference_failure_never_attempts_a_text_only_fallback(self):
        self.write_reference(self.png_bytes())
        self.network.side_effect = RuntimeError("offline simulated failure")
        _, output = self.run_main()
        _, parts = self.request_parts()
        self.assertIn("input_image_0", parts)
        self.assertIn("FAILED:", output)
        self.assertFalse((self.recipe_directory / "photo.webp").exists())
        self.network.assert_called_once()

    def test_dry_run_does_not_resolve_token_or_upload_even_with_invalid_opt_in(self):
        self.write_reference(b"invalid PNG")
        token_lookup, output = self.run_main(["--dry-run"])
        self.assertIn("Would generate 1 photos", output)
        token_lookup.assert_not_called()
        self.network.assert_not_called()

    def test_existing_photo_is_skipped_without_token_lookup_or_upload(self):
        (self.recipe_directory / "photo.webp").write_bytes(b"existing photo, do not replace")
        self.write_reference(b"invalid PNG")
        token_lookup, output = self.run_main()
        self.assertIn("already have photos", output)
        self.assertEqual((self.recipe_directory / "photo.webp").read_bytes(), b"existing photo, do not replace")
        token_lookup.assert_not_called()
        self.network.assert_not_called()


if __name__ == "__main__":
    unittest.main()
