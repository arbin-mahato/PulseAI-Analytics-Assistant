import datetime as dt, importlib.util, json, math, tempfile, unittest
from pathlib import Path
import duckdb

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("seed", ROOT / "script/data/seed.py")
seed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seed)


class DatasetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.file = Path(cls.tmp.name) / "fixture.duckdb"
        seed.build(cls.file, 42, 8, "2026-09-11")
        cls.db = duckdb.connect(str(cls.file), read_only=True)

    @classmethod
    def tearDownClass(cls):
        cls.db.close()
        cls.tmp.cleanup()

    def test_exact_schema_and_population(self):
        spec = json.loads((ROOT / "src/content/db/metrics.json").read_text())
        self.assertEqual(sum(map(len, spec.values())), 106)
        for table, cols in spec.items():
            self.assertEqual(
                self.db.execute(f"SELECT count(*) FROM {table}").fetchone()[0], 8
            )
            self.assertEqual(
                {r[0] for r in self.db.execute(f"DESCRIBE {table}").fetchall()},
                {c["name"] for c in cols},
            )

    def test_totals_from_independent_raw_records(self):
        anchor, rows = seed.create_fixture(42, 8, "2026-09-11")
        cutoff = anchor - dt.timedelta(days=90)
        for client in rows["analytics.users"]:
            cid = client["client_id"]
            trades = [
                t
                for t in rows["analytics.trades"]
                if t["client_id"] == cid and t["_timestamp"] >= cutoff
            ]
            v = self.db.execute(
                "SELECT total_volume_90d FROM financial_volume WHERE client_id=?", [cid]
            ).fetchone()[0]
            pnl = self.db.execute(
                "SELECT pnl_90d,total_pnl_90d FROM risk_profile WHERE client_id=?",
                [cid],
            ).fetchone()
            self.assertAlmostEqual(
                v, sum(t["price"] * t["quantity"] for t in trades), places=5
            )
            self.assertAlmostEqual(
                pnl[0], sum(t["realized_pnl"] for t in trades), places=5
            )
            self.assertEqual(pnl[0], pnl[1])

    def test_order_linkage_and_matched_pnl(self):
        _, rows = seed.create_fixture(42, 8, "2026-09-11")
        orders = {o["order_id"]: o for o in rows["analytics.orders"]}
        for trade in rows["analytics.trades"]:
            self.assertIn(trade["order_id"], orders)
            self.assertLessEqual(
                trade["quantity"], orders[trade["order_id"]]["quantity"]
            )
            if trade["side"] == "SELL":
                buy = orders[trade["order_id"].replace("SELL", "BUY")]
                self.assertAlmostEqual(
                    trade["realized_pnl"],
                    round((trade["price"] - buy["price"]) * trade["quantity"], 2),
                )

    def test_rates_are_fractions_and_rejections_are_counted(self):
        rates = self.db.execute(
            "SELECT order_rejection_rate_30d FROM platform_health"
        ).fetchall()
        self.assertTrue(any(r[0] and r[0] > 0 for r in rates))
        self.assertTrue(all(r[0] is None or 0 <= r[0] <= 1 for r in rates))

    def test_global_metrics_consistent_and_inactive_not_fabricated(self):
        self.assertEqual(
            self.db.execute(
                "SELECT count(DISTINCT most_cancelled_instrument_30d) FROM market_health"
            ).fetchone()[0],
            1,
        )
        self.assertEqual(
            self.db.execute(
                "SELECT trade_count_90d FROM trading_frequency WHERE client_id='DEMO0001'"
            ).fetchone()[0],
            0,
        )
        self.assertIsNone(
            self.db.execute(
                "SELECT win_rate_90d FROM behavioral_style WHERE client_id='DEMO0001'"
            ).fetchone()[0]
        )

    def test_determinism(self):
        self.assertEqual(
            seed.create_fixture(7, 3, "2026-09-11"),
            seed.create_fixture(7, 3, "2026-09-11"),
        )


if __name__ == "__main__":
    unittest.main()
