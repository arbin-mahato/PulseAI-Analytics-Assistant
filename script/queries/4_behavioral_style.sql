CREATE TABLE behavioral_style AS
WITH o AS (SELECT client_id,
 avg((status='CANCEL_CONFIRMED')::INTEGER) FILTER(WHERE _timestamp>=as_of()-INTERVAL '30 days') cancel_rate,
 avg(is_modified::INTEGER) FILTER(WHERE _timestamp>=as_of()-INTERVAL '30 days') modification_rate,
 sum(price*quantity) FILTER(WHERE side='BUY' AND _timestamp>=as_of()-INTERVAL '30 days')/nullif(sum(price*quantity) FILTER(WHERE side='SELL' AND _timestamp>=as_of()-INTERVAL '30 days'),0) buy_sell,
 count(*) FILTER(WHERE _timestamp>=as_of()-INTERVAL '30 days') orders30,
 avg(is_modified::INTEGER) FILTER(WHERE _timestamp>=as_of()-INTERVAL '30 days') modification_pre,
 avg((order_type='STOP')::INTEGER) FILTER(WHERE _timestamp>=as_of()-INTERVAL '90 days') stop_rate,
 count(*) FILTER(WHERE product_type='INTRADAY' AND _timestamp>=as_of()-INTERVAL '90 days')/nullif(count(*) FILTER(WHERE product_type='DELIVERY' AND _timestamp>=as_of()-INTERVAL '90 days'),0) intraday_ratio,
 avg((is_modified AND ((side='BUY' AND price>previous_price) OR (side='SELL' AND price<previous_price)))::INTEGER) FILTER(WHERE _timestamp>=as_of()-INTERVAL '30 days') chasing,
 mode(order_type) primary_type FROM analytics.orders GROUP BY 1),
t AS (SELECT client_id,avg(holding_seconds) FILTER(WHERE side='SELL') holding,count(DISTINCT symbol) FILTER(WHERE _timestamp>=as_of()-INTERVAL '90 days') symbols,bool_or(asset_class='OPTIONS') options_flag,
 count(*) FILTER(WHERE _timestamp>=as_of()-INTERVAL '30 days') trades30,bool_or(holding_seconds>=86400) overnight FROM analytics.trades GROUP BY 1),
p AS (SELECT client_id,avg((pnl>0)::INTEGER) win,sum(pnl) FILTER(WHERE pnl>0)/nullif(abs(sum(pnl) FILTER(WHERE pnl<0)),0) factor FROM metric_helpers.daily WHERE day>=as_of()::DATE-INTERVAL '90 days' GROUP BY 1),
e AS (SELECT client_id,count(DISTINCT session_id) logins,count(*) FILTER(WHERE event_name='HTTP Request' AND http_url='/user/funds/margins') funds,count(*) FILTER(WHERE text='Portfolio') portfolio,count(*) FILTER(WHERE text='Orders') orders_page,count(*) FILTER(WHERE http_url='/api/v1/dashboard/pins') dashboard FROM analytics.events WHERE _timestamp>=as_of()-INTERVAL '30 days' GROUP BY 1),
g AS (SELECT client_id,median(gap) gap FROM (SELECT client_id,date_diff('second',lag(_timestamp) OVER(PARTITION BY client_id ORDER BY _timestamp),_timestamp)/60.0 gap FROM analytics.trades WHERE _timestamp>=as_of()-INTERVAL '90 days') WHERE gap>0 GROUP BY 1)
SELECT u.client_id,t.holding avg_holding_duration_all_time,o.cancel_rate order_cancellation_rate_30d,o.modification_rate order_modification_rate_30d,o.buy_sell buy_to_sell_ratio_30d,
 coalesce(t.symbols,0) distinct_symbols_traded_90d,p.win win_rate_90d,p.factor profit_factor_90d,coalesce(e.logins,0) platform_logins_30d,coalesce(e.funds,0) funds_check_count_30d,coalesce(e.portfolio,0) portfolio_click_count_30d,coalesce(e.orders_page,0) orders_page_view_count_30d,coalesce(e.dashboard,0) dashboard_pins_view_count_30d,
 o.orders30/nullif(t.trades30,0) order_to_trade_ratio_30d,coalesce(t.options_flag,false) is_options_trader_flag,o.modification_pre order_modification_pre_execution_rate_30d,o.stop_rate stop_loss_usage_rate_90d,o.intraday_ratio intraday_vs_delivery_ratio_90d,o.chasing order_chasing_rate_30d,o.primary_type primary_order_type,g.gap median_time_between_trades_90d,coalesce(t.overnight,false) is_holding_overnight_positions_flag
FROM analytics.users u LEFT JOIN o USING(client_id) LEFT JOIN t USING(client_id) LEFT JOIN p USING(client_id) LEFT JOIN e USING(client_id) LEFT JOIN g USING(client_id);
