WITH
    target_users_cte AS (SELECT client_id FROM analytics.users WHERE client_id IN {user_list:Array(String)}),
    all_users AS (SELECT client_id FROM target_users_cte),
    
    -- V1 Metrics
    holding_duration_cte AS (
        SELECT client_id, avg(duration_seconds) AS avg_holding_duration_all_time
        FROM (
            SELECT t.client_id, dateDiff('second', min(t._timestamp), max(t._timestamp)) AS duration_seconds
            FROM analytics.trades AS t
            LEFT JOIN analytics.orders AS o ON t.order_id = o.order_id
            WHERE t.client_id IN (SELECT client_id FROM target_users_cte)
            GROUP BY t.client_id, CAST(o.order_details.description.tradingSymbol, 'String'), toDate(t._timestamp)
            HAVING count() > 1
        ) GROUP BY client_id
    ),
    
    order_metrics_cte AS (
        SELECT client_id,
            countIf(status IN ('CANCELLED', 'CANCEL_CONFIRMED')) / nullIf(count(), 0) AS order_cancellation_rate_30d,
            countIf(status = 'MODIFY_CONFIRMED') / nullIf(count(), 0) AS order_modification_rate_30d,
            sumIf(CAST(order_details.price AS Float64) * CAST(order_details.quantity AS Float64), CAST(order_details.side AS UInt8) != 2) /
                nullIf(sumIf(CAST(order_details.price AS Float64) * CAST(order_details.quantity AS Float64), CAST(order_details.side AS UInt8) = 2), 0) AS buy_to_sell_ratio_30d
        FROM analytics.orders 
        WHERE client_id IN (SELECT client_id FROM target_users_cte) 
          AND _timestamp >= (now() - INTERVAL 30 DAY) 
        GROUP BY client_id
    ),
    
    trade_metrics_cte AS (
        SELECT t.client_id,
            uniqIf(CAST(o.order_details.description.tradingSymbol, 'String'), t._timestamp >= (now() - INTERVAL 90 DAY)) AS distinct_symbols_traded_90d
        FROM analytics.trades AS t
        LEFT JOIN analytics.orders AS o ON t.order_id = o.order_id
        WHERE t.client_id IN (SELECT client_id FROM target_users_cte) 
        GROUP BY t.client_id
    ),
    
    pnl_metrics_cte AS (
        WITH daily_pnl AS (
            SELECT client_id, toDate(_timestamp) AS report_date,
                sumIf(CAST(order_details.price, 'Float64') * CAST(order_details.quantity, 'Float64'), CAST(order_details.side, 'UInt8') = 0) -
                sumIf(CAST(order_details.price, 'Float64') * CAST(order_details.quantity, 'Float64'), CAST(order_details.side, 'UInt8') = 1) AS pnl
            FROM analytics.orders 
            WHERE status = 'COMPLETE' 
              AND _timestamp >= (now() - INTERVAL 90 DAY) 
              AND client_id IN (SELECT client_id FROM target_users_cte)
            GROUP BY client_id, report_date
        )
        SELECT client_id,
            round(countIf(pnl > 0) / count(), 2) AS win_rate_90d,
            round(sumIf(pnl, pnl > 0) / nullIf(abs(sumIf(pnl, pnl < 0)), 0), 2) AS profit_factor_90d
        FROM daily_pnl 
        GROUP BY client_id
    ),
    
    event_metrics_cte AS (
        SELECT client_id,
            uniq(session_id) AS platform_logins_30d
        FROM analytics.events 
        WHERE client_id IN (SELECT client_id FROM target_users_cte) 
          AND _timestamp >= (now() - INTERVAL 30 DAY) 
        GROUP BY client_id
    ),
    
    -- V2 Metrics
    v2_behavioral_metrics AS (
        SELECT client_id,
            countIf(event_name = 'HTTP Request' AND CAST(event_data.http_url AS String) LIKE '%/user/funds/margins%') AS funds_check_count_30d,
            countIf(event_name = 'Click' AND CAST(event_data.text AS String) = 'Portfolio') AS portfolio_click_count_30d,
            countIf(event_name = 'Click' AND CAST(event_data.text AS String) = 'Orders') AS orders_page_view_count_30d,
            countIf(event_name = 'HTTP Request' AND CAST(event_data.http_url AS String) = '/api/v1/dashboard/pins') AS dashboard_pins_view_count_30d
        FROM analytics.events 
        WHERE client_id IN (SELECT client_id FROM target_users_cte) 
          AND _timestamp >= (now() - INTERVAL 30 DAY) 
        GROUP BY client_id
    ),
    
    order_to_trade_ratio_cte AS (
        WITH orders_30d AS (
            SELECT client_id, count() AS order_count 
            FROM analytics.orders 
            WHERE _timestamp >= (now() - toIntervalDay(30)) 
              AND client_id IN (SELECT client_id FROM target_users_cte) 
            GROUP BY client_id
        ),
        trades_30d AS (
            SELECT client_id, count() AS trade_count 
            FROM analytics.trades 
            WHERE _timestamp >= (now() - toIntervalDay(30)) 
              AND client_id IN (SELECT client_id FROM target_users_cte) 
            GROUP BY client_id
        )
        SELECT o.client_id, o.order_count / nullIf(t.trade_count, 0) AS order_to_trade_ratio_30d
        FROM orders_30d AS o
        LEFT JOIN trades_30d AS t ON o.client_id = t.client_id
    ),
    
    options_trader_flag AS (
        SELECT t.client_id, 
               countIf(CAST(o.order_details.description.instrumentName AS String) ILIKE 'OPT%') > 0 AS is_options_trader_flag
        FROM analytics.trades AS t
        LEFT JOIN analytics.orders AS o ON t.order_id = o.order_id
        WHERE t.client_id IN (SELECT client_id FROM target_users_cte)
        GROUP BY t.client_id
    ),
    
    -- V3 Metrics
    v3_order_metrics AS (
        SELECT client_id,
            CAST(countDistinct(IF(status = 'MODIFY_CONFIRMED', order_id, NULL)), 'Float64') / countDistinct(order_id) AS order_modification_pre_execution_rate_30d,
            countIf(CAST(order_details.type AS String) = '2') / nullIf(count(), 0) AS stop_loss_usage_rate_90d,
            countIf(CAST(order_details.prodType AS String) = '2') / nullIf(countIf(CAST(order_details.prodType AS String) = '1'), 0) AS intraday_vs_delivery_ratio_90d,
            countIf((CAST(order_details.side AS UInt8) = 1 AND CAST(order_details.price AS Float64) > CAST(order_details.prevModifyPrice AS Float64)) OR (CAST(order_details.side AS UInt8) = 0 AND CAST(order_details.price AS Float64) < CAST(order_details.prevModifyPrice AS Float64))) / nullIf(count(), 0) AS order_chasing_rate_30d
        FROM analytics.orders
        WHERE client_id IN (SELECT client_id FROM target_users_cte)
          AND _timestamp >= (now() - toIntervalDay(90))
        GROUP BY client_id
    ),
    
    primary_order_type_cte AS (
        SELECT client_id, argMax(order_type, type_count) AS primary_order_type
        FROM (
            SELECT client_id, CAST(order_details.type AS String) AS order_type, count() AS type_count
            FROM analytics.orders
            WHERE client_id IN (SELECT client_id FROM target_users_cte)
              AND order_type != ''
            GROUP BY client_id, order_type
        )
        GROUP BY client_id
    ),
    
    median_trades_time AS (
        WITH trade_times AS (
            SELECT client_id, _timestamp,
                   lagInFrame(_timestamp) OVER (PARTITION BY client_id ORDER BY _timestamp ASC) AS prev_timestamp
            FROM analytics.trades
            WHERE _timestamp >= (now() - toIntervalDay(90))
              AND client_id IN (SELECT client_id FROM target_users_cte)
        ),
        time_diffs AS (
            SELECT client_id,
                   dateDiff('minute', prev_timestamp, _timestamp) AS diff_minutes
            FROM trade_times
            WHERE prev_timestamp IS NOT NULL AND diff_minutes > 0
        )
        SELECT client_id,
               quantile(0.5)(diff_minutes) AS median_time_between_trades_90d
        FROM time_diffs
        GROUP BY client_id
    ),
    
    overnight_position_flag AS (
        SELECT client_id,
               max(abs(JSONExtractFloat(JSONExtractString(CAST(event_data.http_response_preview AS String), 'result'), 'unrealized_mtm'))) > 0 AS is_holding_overnight_positions_flag
        FROM analytics.events
        WHERE event_name = 'HTTP Request'
          AND CAST(event_data.http_url AS String) LIKE '%/user/funds/margins%'
          AND _timestamp >= (now() - toIntervalDay(30))
          AND client_id IN (SELECT client_id FROM target_users_cte)
        GROUP BY client_id
    )

SELECT
    au.client_id AS client_id,
    COALESCE(hdc.avg_holding_duration_all_time, 0) AS avg_holding_duration_all_time, 
    COALESCE(omc.order_cancellation_rate_30d, 0) AS order_cancellation_rate_30d, 
    COALESCE(omc.order_modification_rate_30d, 0) AS order_modification_rate_30d, 
    COALESCE(omc.buy_to_sell_ratio_30d, 0) AS buy_to_sell_ratio_30d,
    COALESCE(tmc.distinct_symbols_traded_90d, 0) AS distinct_symbols_traded_90d, 
    COALESCE(pmc.win_rate_90d, 0) AS win_rate_90d, 
    COALESCE(pmc.profit_factor_90d, 0) AS profit_factor_90d, 
    COALESCE(emc.platform_logins_30d, 0) AS platform_logins_30d,
    -- V2 Metrics
    COALESCE(v2bm.funds_check_count_30d, 0) AS funds_check_count_30d,
    COALESCE(v2bm.portfolio_click_count_30d, 0) AS portfolio_click_count_30d,
    COALESCE(v2bm.orders_page_view_count_30d, 0) AS orders_page_view_count_30d,
    COALESCE(v2bm.dashboard_pins_view_count_30d, 0) AS dashboard_pins_view_count_30d,
    COALESCE(otrc.order_to_trade_ratio_30d, 0) AS order_to_trade_ratio_30d,
    COALESCE(otf.is_options_trader_flag, 0) AS is_options_trader_flag,
    -- V3 Metrics
    COALESCE(v3om.order_modification_pre_execution_rate_30d, 0) AS order_modification_pre_execution_rate_30d,
    COALESCE(v3om.stop_loss_usage_rate_90d, 0) AS stop_loss_usage_rate_90d,
    COALESCE(v3om.intraday_vs_delivery_ratio_90d, 0) AS intraday_vs_delivery_ratio_90d,
    COALESCE(v3om.order_chasing_rate_30d, 0) AS order_chasing_rate_30d,
    COALESCE(pot.primary_order_type, '') AS primary_order_type,
    COALESCE(mtt.median_time_between_trades_90d, 0) AS median_time_between_trades_90d,
    COALESCE(opf.is_holding_overnight_positions_flag, 0) AS is_holding_overnight_positions_flag
FROM all_users AS au
LEFT JOIN holding_duration_cte AS hdc ON au.client_id = hdc.client_id
LEFT JOIN order_metrics_cte AS omc ON au.client_id = omc.client_id
LEFT JOIN trade_metrics_cte AS tmc ON au.client_id = tmc.client_id
LEFT JOIN pnl_metrics_cte AS pmc ON au.client_id = pmc.client_id
LEFT JOIN event_metrics_cte AS emc ON au.client_id = emc.client_id
LEFT JOIN v2_behavioral_metrics AS v2bm ON au.client_id = v2bm.client_id
LEFT JOIN order_to_trade_ratio_cte AS otrc ON au.client_id = otrc.client_id
LEFT JOIN options_trader_flag AS otf ON au.client_id = otf.client_id
LEFT JOIN v3_order_metrics AS v3om ON au.client_id = v3om.client_id
LEFT JOIN primary_order_type_cte AS pot ON au.client_id = pot.client_id
LEFT JOIN median_trades_time AS mtt ON au.client_id = mtt.client_id
LEFT JOIN overnight_position_flag AS opf ON au.client_id = opf.client_id