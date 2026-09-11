CREATE TABLE identity_and_lifecycle AS
WITH t AS (SELECT client_id,min(_timestamp)::DATE first_trade_date FROM analytics.trades GROUP BY 1),
e AS (SELECT client_id,mode(platform) FILTER(WHERE _timestamp>=as_of()-INTERVAL '30 days') primary_platform_30d,
 count(DISTINCT platform) FILTER(WHERE _timestamp>=as_of()-INTERVAL '30 days')>1 is_multi_platform_user_30d,
 count(DISTINCT ip_address) FILTER(WHERE _timestamp>=as_of()-INTERVAL '30 days') unique_ip_count_30d,
 arg_max(app_version,_timestamp) latest_app_version_used,
 count(DISTINCT _timestamp::DATE) FILTER(WHERE _timestamp>=as_of()-INTERVAL '30 days') active_days_30d,
 max(deposit)>0 activated FROM analytics.events GROUP BY 1),
l AS (SELECT client_id,count(DISTINCT login_id) distinct_login_ids_90d FROM analytics.orders WHERE _timestamp>=as_of()-INTERVAL '90 days' GROUP BY 1),
g AS (SELECT client_id,avg(gap) avg_gap FROM (SELECT client_id,date_diff('day',lag(started) OVER(PARTITION BY client_id ORDER BY started),started) gap FROM (SELECT client_id,session_id,min(_timestamp) started FROM analytics.events GROUP BY 1,2)) GROUP BY 1)
SELECT u.client_id,u.name,u.email,t.first_trade_date,date_diff('day',t.first_trade_date,as_of()) days_since_first_trade,
 as_of() last_calculated_at,date_diff('day',u.last_seen,as_of()) days_since_last_seen,
 e.primary_platform_30d,coalesce(e.is_multi_platform_user_30d,false) is_multi_platform_user_30d,
 coalesce(e.unique_ip_count_30d,0) unique_ip_count_30d,e.latest_app_version_used,u.created_at::DATE signup_date,
 date_diff('day',u.created_at,as_of()) account_age_days,CASE WHEN e.activated THEN 'Activated' ELSE 'Not Activated' END activation_status,
 coalesce(e.active_days_30d,0) active_days_30d,g.avg_gap avg_time_since_last_activity_per_login,coalesce(l.distinct_login_ids_90d,0) distinct_login_ids_90d
FROM analytics.users u LEFT JOIN t USING(client_id) LEFT JOIN e USING(client_id) LEFT JOIN l USING(client_id) LEFT JOIN g USING(client_id);
