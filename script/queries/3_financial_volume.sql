CREATE TABLE financial_volume AS
WITH t AS (SELECT client_id,sum(quantity*price) FILTER(WHERE _timestamp>=as_of()-INTERVAL '1 day') v1,sum(quantity*price) FILTER(WHERE _timestamp>=as_of()-INTERVAL '7 days') v7,sum(quantity*price) FILTER(WHERE _timestamp>=as_of()-INTERVAL '30 days') v30,sum(quantity*price) FILTER(WHERE _timestamp>=as_of()-INTERVAL '90 days') v90,avg(quantity*price) FILTER(WHERE _timestamp>=as_of()-INTERVAL '90 days') avg90 FROM analytics.trades GROUP BY 1),
b AS (SELECT *,deposit-lag(deposit,1,0) OVER(PARTITION BY client_id ORDER BY _timestamp) deposit_change,withdraw-lag(withdraw,1,0) OVER(PARTITION BY client_id ORDER BY _timestamp) withdraw_change FROM analytics.events WHERE http_url='/user/funds/margins'),
e AS (SELECT client_id,arg_max(deposit,_timestamp) deposits,arg_max(withdraw,_timestamp) withdrawals,
 sum(deposit_change-withdraw_change) FILTER(WHERE _timestamp>=as_of()-INTERVAL '90 days') net90,
 count(*) FILTER(WHERE deposit_change>0 AND _timestamp>=as_of()-INTERVAL '90 days') frequency,
 avg(blocked_margin/nullif(opening_cash+deposit-withdraw+realized_mtm,0)) FILTER(WHERE _timestamp>=as_of()-INTERVAL '30 days') margin,
 min(_timestamp) FILTER(WHERE withdraw_change>0) first_withdrawal FROM b GROUP BY 1)
SELECT u.client_id,coalesce(t.v1,0) total_volume_1d,coalesce(t.v7,0) total_volume_7d,coalesce(t.v30,0) total_volume_30d,coalesce(t.v90,0) total_volume_90d,t.avg90 avg_trade_size_90d,
 coalesce(e.deposits,0) total_deposit_amount_all_time,coalesce(e.net90,0) net_deposit_flow_90d,coalesce(e.deposits-e.withdrawals,0) net_deposit_value_all_time,
 coalesce(e.frequency,0) deposit_frequency_90d,e.margin avg_margin_utilization_pct_30d,date_diff('day',e.first_withdrawal,as_of()) days_since_first_withdrawal
FROM analytics.users u LEFT JOIN t USING(client_id) LEFT JOIN e USING(client_id);
