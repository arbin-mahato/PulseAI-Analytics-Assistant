import importlib.util, unittest
from pathlib import Path

p = Path(__file__).resolve().parents[1] / "worker/query.py"
spec = importlib.util.spec_from_file_location("query", p)
q = importlib.util.module_from_spec(spec)
spec.loader.exec_module(q)


class QueryTests(unittest.TestCase):
    def test_selects_and_ctes(self):
        q.validate(
            "WITH totals AS (SELECT client_id,SUM(total_volume_30d) volume FROM financial_volume GROUP BY client_id) SELECT * FROM totals"
        )

    def test_disallows_modifications_and_external_access(self):
        for sql in [
            "DELETE FROM financial_volume",
            "SELECT * INTO temp FROM financial_volume",
            "SELECT 1; DROP TABLE financial_volume",
            "SELECT * FROM read_csv('/etc/passwd')",
            "SELECT * FROM glob('/tmp/*')",
            "SELECT * FROM information_schema.tables",
            "SELECT * FROM duckdb_secrets()",
            "SELECT * FROM query('DELETE FROM financial_volume')",
            "COPY financial_volume TO '/tmp/x'",
        ]:
            with self.subTest(sql=sql):
                with self.assertRaises((ValueError, Exception)):
                    q.validate(sql)

    def test_big_integers_preserve_precision(self):
        self.assertEqual(q.safe(2**60), str(2**60))
        self.assertEqual(q.safe(100), 100)


if __name__ == "__main__":
    unittest.main()
