import importlib.util, unittest, tempfile, json
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "analysis", Path(__file__).resolve().parents[1] / "worker/analysis.py"
)
analysis = importlib.util.module_from_spec(spec)
spec.loader.exec_module(analysis)


class Recipes(unittest.TestCase):
    def test_only_literal_recipes_are_accepted(self):
        for source in [
            'import os\nos.system("id")',
            'from tradelab_analysis import run\nrun(__import__("os").environ)',
            'from tradelab_analysis import run\nrun({"chart":"bar", "data_file":open(".env.local").read()})',
            'from tradelab_analysis import run\nrun({"chart":"bar"})\nprint("extra")',
        ]:
            with self.subTest(source=source), self.assertRaises(
                (ValueError, SyntaxError)
            ):
                analysis.parse_recipe(source)

    def test_chart_recipe_is_data_not_code(self):
        result = analysis.parse_recipe(
            'from tradelab_analysis import run\nrun({"chart":"bar","x":"client_id","y":"volume","data_file":"result.csv"})'
        )
        self.assertEqual(result["chart"], "bar")


class Reports(unittest.TestCase):
    def test_large_table_is_explicitly_marked_as_a_preview(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "rows.json"
            source.write_text(
                json.dumps(
                    [
                        {"client_id": f"DEMO{i:04}", "volume": i * 1000.25}
                        for i in range(201)
                    ]
                )
            )
            output = Path(directory) / "report.pdf"
            result = analysis.pdf(
                {
                    "content": "Verified result preview",
                    "data_files": [str(source)],
                    "images": [],
                    "output": str(output),
                }
            )
            self.assertEqual(
                result["tables"], [{"rows": 200, "total_rows": 201, "complete": False}]
            )
            self.assertTrue(output.read_bytes().startswith(b"%PDF-"))
