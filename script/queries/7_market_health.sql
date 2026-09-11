CREATE TABLE market_health AS
SELECT u.client_id,
 (SELECT symbol FROM analytics.orders WHERE status='CANCEL_CONFIRMED' AND _timestamp>=as_of()-INTERVAL '30 days' GROUP BY symbol ORDER BY count(*) DESC,symbol LIMIT 1) most_cancelled_instrument_30d,
 (SELECT symbol FROM analytics.trades WHERE _timestamp>=as_of()-INTERVAL '90 days' GROUP BY symbol ORDER BY sum(realized_pnl) DESC,symbol LIMIT 1) most_profitable_instrument_all_users_90d
FROM analytics.users u;
