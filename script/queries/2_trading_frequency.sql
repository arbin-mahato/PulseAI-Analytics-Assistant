CREATE TABLE trading_frequency AS
WITH t AS (SELECT client_id,
 count(*) FILTER(WHERE _timestamp>=as_of()-INTERVAL '1 day') trade_count_1d,
 count(*) FILTER(WHERE _timestamp>=as_of()-INTERVAL '7 days') trade_count_7d,
 count(*) FILTER(WHERE _timestamp>=as_of()-INTERVAL '30 days') trade_count_30d,
 count(*) FILTER(WHERE _timestamp>=as_of()-INTERVAL '90 days') trade_count_90d,
 count(*) FILTER(WHERE _timestamp>=as_of()-INTERVAL '360 days') trade_count_360d,
 count(DISTINCT _timestamp::DATE) FILTER(WHERE _timestamp>=as_of()-INTERVAL '90 days') active_trading_days_90d,
 mode(dayname(_timestamp)) FILTER(WHERE _timestamp>=as_of()-INTERVAL '90 days') primary_trade_day_90d
 FROM analytics.trades GROUP BY 1),
s AS (SELECT client_id,avg(duration) duration,avg(requests) requests,avg((events<=3)::INTEGER) bounce,count(*) FILTER(WHERE isodow(started)>5) weekends FROM metric_helpers.sessions30 GROUP BY 1),
e AS (SELECT client_id,mode(hour(_timestamp)) primary_hour,avg((hour(_timestamp)<12)::INTEGER)>.5 morning FROM analytics.events WHERE _timestamp>=as_of()-INTERVAL '90 days' GROUP BY 1),
v AS (SELECT client_id,1/(1+stddev_pop(volume)/nullif(avg(volume),0)) consistency FROM metric_helpers.daily WHERE day>=as_of()::DATE-INTERVAL '90 days' GROUP BY 1),
sec AS (SELECT client_id,max(n) max_n FROM (SELECT client_id,date_trunc('second',_timestamp),count(*) n FROM analytics.trades WHERE _timestamp>=as_of()-INTERVAL '90 days' GROUP BY 1,2) GROUP BY 1),
dow AS (SELECT client_id,sum((n/total)*(n/total)) concentration,stddev_pop(n) variance FROM (SELECT client_id,isodow(_timestamp),count(*) n,sum(count(*)) OVER(PARTITION BY client_id) total FROM analytics.trades WHERE _timestamp>=as_of()-INTERVAL '90 days' GROUP BY 1,2) GROUP BY 1)
SELECT u.client_id,coalesce(t.trade_count_1d,0) trade_count_1d,coalesce(t.trade_count_7d,0) trade_count_7d,coalesce(t.trade_count_30d,0) trade_count_30d,coalesce(t.trade_count_90d,0) trade_count_90d,coalesce(t.trade_count_360d,0) trade_count_360d,
 coalesce(t.active_trading_days_90d,0) active_trading_days_90d,t.trade_count_90d/nullif(t.active_trading_days_90d,0) trades_per_active_day_90d,
 s.duration avg_activity_cluster_duration_minutes_30d,s.requests avg_http_requests_per_session_30d,s.bounce cluster_bounce_rate_30d,coalesce(s.weekends,0) weekend_cluster_count_30d,
 e.primary_hour primary_activity_hour,coalesce(e.morning,false) is_morning_active_flag,dow.concentration weekday_concentration_score_90d,v.consistency trade_volume_consistency_score_90d,coalesce(sec.max_n,0) max_trades_per_second_90d,
 t.primary_trade_day_90d,dow.variance trade_count_by_day_of_week_variance_90d,(t.trade_count_30d/30.0)/nullif(t.trade_count_90d/90.0,0) activity_momentum_score
FROM analytics.users u LEFT JOIN t USING(client_id) LEFT JOIN s USING(client_id) LEFT JOIN e USING(client_id) LEFT JOIN v USING(client_id) LEFT JOIN sec USING(client_id) LEFT JOIN dow USING(client_id);
