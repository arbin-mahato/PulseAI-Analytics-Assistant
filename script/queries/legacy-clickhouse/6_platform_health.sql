WITH
    target_users_cte AS (SELECT client_id FROM analytics.users WHERE client_id IN {user_list:Array(String)}),
    all_users AS (SELECT client_id FROM target_users_cte),

    -- User-Specific Health Metrics
    user_health_metrics AS (
        SELECT
            client_id,
            countIf(http_status >= 400 AND http_status < 500) / countIf(event_name = 'HTTP Request') AS client_error_rate_30d,
            avg(CAST(event_data.http_duration_ms AS UInt32)) AS avg_api_response_time_ms_30d
        FROM (
            SELECT client_id, event_name, 
                   CAST(event_data.http_status AS UInt16) AS http_status,
                   event_data
            FROM analytics.events
            WHERE _timestamp >= now() - INTERVAL 30 DAY
              AND client_id IN (SELECT client_id FROM target_users_cte)
        )
        GROUP BY client_id
    ),
    
    -- Global session expirations (not user-specific)
    global_session_expirations AS (
        SELECT count() as total_session_expirations_30d
        FROM log_aggregator.logs
        WHERE service = 'auth'
          AND _timestamp >= (now() - INTERVAL 30 DAY)
          AND has(string_names, 'msg')
          AND (string_values[indexOf(string_names, 'msg')] = 'Token expired' 
               OR string_values[indexOf(string_names, 'msg')] = 'error redis ray :expired')
    ),
    
    -- Global most traded instrument
    most_traded_instrument AS (
        SELECT argMax(instrument_symbol, total_instrument_volume) as most_traded_instrument_by_volume_30d
        FROM (
            SELECT CAST(o.order_details.description.tradingSymbol AS String) AS instrument_symbol,
                   sum(CAST(o.order_details.price AS Float64) * CAST(o.order_details.quantity AS Float64)) AS total_instrument_volume
            FROM analytics.trades AS t 
            LEFT JOIN analytics.orders AS o ON t.order_id = o.order_id
            WHERE t._timestamp >= (now() - toIntervalDay(30)) 
              AND CAST(o.order_details.description.tradingSymbol AS String) != ''
            GROUP BY instrument_symbol
        )
    ),
    
    -- Global trending instrument
    trending_instrument AS (
        SELECT argMax(instrument_symbol, increase_in_traders) as instrument_with_largest_trader_increase
        FROM (
            WITH
            baseline_traders AS (
                SELECT CAST(o.order_details.description.tradingSymbol AS String) AS instrument_symbol, 
                       count(DISTINCT t.client_id) / 30 AS avg_daily_traders_30d
                FROM analytics.trades AS t 
                LEFT JOIN analytics.orders AS o ON t.order_id = o.order_id
                WHERE t._timestamp >= (now() - toIntervalDay(30)) 
                  AND CAST(o.order_details.description.tradingSymbol AS String) != ''
                GROUP BY instrument_symbol
            ),
            recent_traders AS (
                SELECT CAST(o.order_details.description.tradingSymbol AS String) AS instrument_symbol, 
                       uniq(t.client_id) AS recent_trader_count_3d
                FROM analytics.trades AS t 
                LEFT JOIN analytics.orders AS o ON t.order_id = o.order_id
                WHERE t._timestamp >= (now() - toIntervalDay(3) + 1) 
                  AND CAST(o.order_details.description.tradingSymbol AS String) != ''
                GROUP BY instrument_symbol
            )
            SELECT
                r.instrument_symbol,
                r.recent_trader_count_3d - b.avg_daily_traders_30d AS increase_in_traders
            FROM recent_traders AS r
            INNER JOIN baseline_traders AS b ON r.instrument_symbol = b.instrument_symbol
        )
    ),
    
    -- V3 Metrics
    v3_platform_metrics AS (
        SELECT t.client_id,
            avg(dateDiff('second', o._timestamp, t._timestamp)) AS avg_time_to_fill_seconds_30d,
            countIf(o.status = 'REJECTED') / nullIf(count(), 0) AS order_rejection_rate_30d,
            CAST(countDistinct(IF(o.status IN ('REJECTED', 'CANCEL_CONFIRMED'), o.order_id, NULL)), 'Float64') / countDistinct(o.order_id) AS orders_not_traded_ratio_30d,
            avg(dateDiff('minute', o.modified_at, o._timestamp)) AS avg_order_life_to_cancel_minutes
        FROM analytics.trades AS t
        INNER JOIN analytics.orders AS o ON t.order_id = o.order_id
        WHERE t._timestamp >= (now() - toIntervalDay(30))
          AND o.status = 'COMPLETE'
          AND t.client_id IN (SELECT client_id FROM target_users_cte)
        GROUP BY t.client_id
    ),
    
    error_trade_ratio AS (
        WITH error_count AS (
            SELECT client_id,
                countIf((event_name = 'HTTP Request') AND ((CAST(JSONExtractString(CAST(event_data, 'String'), 'http_status'), 'UInt16') >= 400) AND (CAST(JSONExtractString(CAST(event_data, 'String'), 'http_status'), 'UInt16') <= 499))) AS client_error_count
            FROM analytics.events
            WHERE _timestamp >= (now() - toIntervalDay(30))
              AND client_id IN (SELECT client_id FROM target_users_cte)
            GROUP BY client_id
        ),
        trade_count AS (
            SELECT client_id, count() AS trade_count
            FROM analytics.trades
            WHERE _timestamp >= (now() - toIntervalDay(30))
              AND client_id IN (SELECT client_id FROM target_users_cte)
            GROUP BY client_id
        )
        SELECT t.client_id,
            COALESCE(e.client_error_count, 0) / NULLIF(t.trade_count, 0) AS error_to_trade_ratio_30d
        FROM trade_count AS t
        LEFT JOIN error_count AS e ON t.client_id = e.client_id
    ),
    
    dashboard_load_time AS (
        SELECT client_id,
            avg(CAST(event_data.http_duration_ms AS UInt32)) AS avg_time_to_load_dashboard_ms
        FROM analytics.events
        WHERE event_name = 'HTTP Request'
          AND CAST(event_data.http_url AS String) = '/api/v1/dashboard/pins'
          AND _timestamp >= (now() - toIntervalDay(30))
          AND client_id IN (SELECT client_id FROM target_users_cte)
        GROUP BY client_id
    ),
    
    trade_fill_ratio AS (
        WITH order_executed_quantities AS (
            SELECT t.order_id, t.client_id,
                sum(JSONExtractFloat(CAST(t.trade_details, 'String'), 'OriginalVol')) AS total_traded_quantity
            FROM analytics.trades AS t
            WHERE t._timestamp >= (now() - toIntervalDay(90))
              AND t.client_id IN (SELECT client_id FROM target_users_cte)
            GROUP BY t.order_id, t.client_id
        ),
        order_quantities AS (
            SELECT order_id,
                JSONExtractFloat(CAST(order_details, 'String'), 'quantity') AS original_quantity
            FROM analytics.orders
            WHERE order_id IN (SELECT order_id FROM order_executed_quantities)
              AND original_quantity > 0
        )
        SELECT eeq.client_id,
            avg(eeq.total_traded_quantity / oq.original_quantity) AS avg_trade_fill_ratio_90d
        FROM order_executed_quantities AS eeq
        INNER JOIN order_quantities AS oq ON eeq.order_id = oq.order_id
        GROUP BY eeq.client_id
    ),
    
    high_volume_cancelled AS (
        WITH user_cancelled_volume AS (
            SELECT client_id,
                sumIf(CAST(order_details.price, 'Float64') * CAST(order_details.quantity, 'Float64'), status = 'CANCEL_CONFIRMED') AS cancelled_volume
            FROM analytics.orders
            WHERE _timestamp >= (now() - toIntervalDay(90))
              AND client_id IN (SELECT client_id FROM target_users_cte)
            GROUP BY client_id
        ),
        global_threshold AS (
            SELECT quantile(0.95)(cancelled_volume) AS volume_95th_percentile
            FROM user_cancelled_volume
        )
        SELECT ucv.client_id,
            CAST(ucv.cancelled_volume > (SELECT volume_95th_percentile FROM global_threshold), 'UInt8') AS is_high_volume_cancelled_flag
        FROM user_cancelled_volume AS ucv
    )

SELECT
    au.client_id AS client_id,
    (SELECT total_session_expirations_30d FROM global_session_expirations) AS total_session_expirations_30d,
    (SELECT most_traded_instrument_by_volume_30d FROM most_traded_instrument) AS most_traded_instrument_by_volume_30d,
    (SELECT instrument_with_largest_trader_increase FROM trending_instrument) AS instrument_with_largest_trader_increase,
    COALESCE(uhm.client_error_rate_30d, 0) AS client_error_rate_30d, 
    COALESCE(uhm.avg_api_response_time_ms_30d, 0) AS avg_api_response_time_ms_30d,
    -- V3 Metrics
    COALESCE(v3pm.avg_time_to_fill_seconds_30d, 0) AS avg_time_to_fill_seconds_30d,
    COALESCE(etr.error_to_trade_ratio_30d, 0) AS error_to_trade_ratio_30d,
    COALESCE(dlt.avg_time_to_load_dashboard_ms, 0) AS avg_time_to_load_dashboard_ms,
    COALESCE(v3pm.order_rejection_rate_30d, 0) AS order_rejection_rate_30d,
    COALESCE(v3pm.orders_not_traded_ratio_30d, 0) AS orders_not_traded_ratio_30d,
    COALESCE(v3pm.avg_order_life_to_cancel_minutes, 0) AS avg_order_life_to_cancel_minutes,
    COALESCE(tfr.avg_trade_fill_ratio_90d, 0) AS avg_trade_fill_ratio_90d,
    COALESCE(hvc.is_high_volume_cancelled_flag, 0) AS is_high_volume_cancelled_flag
FROM all_users AS au
LEFT JOIN user_health_metrics AS uhm ON au.client_id = uhm.client_id
LEFT JOIN v3_platform_metrics AS v3pm ON au.client_id = v3pm.client_id
LEFT JOIN error_trade_ratio AS etr ON au.client_id = etr.client_id
LEFT JOIN dashboard_load_time AS dlt ON au.client_id = dlt.client_id
LEFT JOIN trade_fill_ratio AS tfr ON au.client_id = tfr.client_id
LEFT JOIN high_volume_cancelled AS hvc ON au.client_id = hvc.client_id