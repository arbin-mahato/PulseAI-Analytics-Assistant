WITH
    target_users_cte AS (SELECT client_id FROM analytics.users WHERE client_id IN {user_list:Array(String)}),
    all_users AS (SELECT client_id FROM target_users_cte),
    
    -- V1 Metrics: PnL calculations
    pnl_base AS (
        SELECT client_id,
            sumIf(CAST(order_details.price AS Float64) * CAST(order_details.quantity AS Float64), CAST(order_details.side AS UInt8) = 2) -
            sumIf(CAST(order_details.price AS Float64) * CAST(order_details.quantity AS Float64), CAST(order_details.side AS UInt8) != 2) AS pnl_1d
        FROM analytics.orders
        WHERE status = 'COMPLETE'
          AND _timestamp >= (now() - toIntervalDay(1))
          AND client_id IN (SELECT client_id FROM target_users_cte)
        GROUP BY client_id
        
        UNION ALL
        
        SELECT client_id,
            sumIf(CAST(order_details.price AS Float64) * CAST(order_details.quantity AS Float64), CAST(order_details.side AS UInt8) = 2) -
            sumIf(CAST(order_details.price AS Float64) * CAST(order_details.quantity AS Float64), CAST(order_details.side AS UInt8) != 2) AS pnl_7d
        FROM analytics.orders
        WHERE status = 'COMPLETE'
          AND _timestamp >= (now() - toIntervalDay(7))
          AND client_id IN (SELECT client_id FROM target_users_cte)
        GROUP BY client_id
        
        UNION ALL
        
        SELECT client_id,
            sumIf(CAST(order_details.price AS Float64) * CAST(order_details.quantity AS Float64), CAST(order_details.side AS UInt8) = 2) -
            sumIf(CAST(order_details.price AS Float64) * CAST(order_details.quantity AS Float64), CAST(order_details.side AS UInt8) != 2) AS pnl_30d
        FROM analytics.orders
        WHERE status = 'COMPLETE'
          AND _timestamp >= (now() - toIntervalDay(30))
          AND client_id IN (SELECT client_id FROM target_users_cte)
        GROUP BY client_id
        
        UNION ALL
        
        SELECT client_id,
            sumIf(CAST(order_details.price AS Float64) * CAST(order_details.quantity AS Float64), CAST(order_details.side AS UInt8) = 2) -
            sumIf(CAST(order_details.price AS Float64) * CAST(order_details.quantity AS Float64), CAST(order_details.side AS UInt8) != 2) AS pnl_90d
        FROM analytics.orders
        WHERE status = 'COMPLETE'
          AND _timestamp >= (now() - toIntervalDay(90))
          AND client_id IN (SELECT client_id FROM target_users_cte)
        GROUP BY client_id
        
        UNION ALL
        
        SELECT client_id,
            sumIf(CAST(order_details.price AS Float64) * CAST(order_details.quantity AS Float64), CAST(order_details.side AS UInt8) = 2) -
            sumIf(CAST(order_details.price AS Float64) * CAST(order_details.quantity AS Float64), CAST(order_details.side AS UInt8) != 2) AS pnl_360d
        FROM analytics.orders
        WHERE status = 'COMPLETE'
          AND _timestamp >= (now() - toIntervalDay(360))
          AND client_id IN (SELECT client_id FROM target_users_cte)
        GROUP BY client_id
    ),
    
    pnl_consolidated AS (
        SELECT client_id,
            sum(CASE WHEN _timestamp >= (now() - toIntervalDay(1)) THEN pnl_value ELSE 0 END) AS pnl_1d,
            sum(CASE WHEN _timestamp >= (now() - toIntervalDay(7)) THEN pnl_value ELSE 0 END) AS pnl_7d,
            sum(CASE WHEN _timestamp >= (now() - toIntervalDay(30)) THEN pnl_value ELSE 0 END) AS pnl_30d,
            sum(CASE WHEN _timestamp >= (now() - toIntervalDay(90)) THEN pnl_value ELSE 0 END) AS pnl_90d,
            sum(CASE WHEN _timestamp >= (now() - toIntervalDay(360)) THEN pnl_value ELSE 0 END) AS pnl_360d
        FROM (
            SELECT client_id, _timestamp,
                sumIf(CAST(order_details.price AS Float64) * CAST(order_details.quantity AS Float64), CAST(order_details.side AS UInt8) = 2) -
                sumIf(CAST(order_details.price AS Float64) * CAST(order_details.quantity AS Float64), CAST(order_details.side AS UInt8) != 2) AS pnl_value
            FROM analytics.orders
            WHERE status = 'COMPLETE'
              AND client_id IN (SELECT client_id FROM target_users_cte)
              AND _timestamp >= (now() - toIntervalDay(360))
            GROUP BY client_id, _timestamp
        )
        GROUP BY client_id
    ),
    
    asset_preference AS (
        SELECT client_id, argMax(asset, trade_count) AS preferred_asset_class
        FROM (
            SELECT t.client_id, CAST(o.order_details.description.instrumentName, 'String') AS asset, count() AS trade_count
            FROM analytics.trades t 
            LEFT JOIN analytics.orders o ON t.order_id = o.order_id
            WHERE t.client_id IN (SELECT client_id FROM target_users_cte) 
            GROUP BY t.client_id, asset
        ) GROUP BY client_id
    ),
    
    -- V2 Metrics: PnL ranking and percentile
    pnl_ranking_cte AS (
        WITH
            user_pnl_cte AS (
                SELECT client_id,
                    sumIf(CAST(order_details.price, 'Float64') * CAST(order_details.quantity, 'Float64'), CAST(order_details.side, 'UInt8') = 0) -
                    sumIf(CAST(order_details.price, 'Float64') * CAST(order_details.quantity, 'Float64'), CAST(order_details.side, 'UInt8') = 1) AS total_pnl_90d
                FROM analytics.orders
                WHERE status = 'COMPLETE' 
                  AND _timestamp >= (now() - toIntervalDay(90)) 
                  AND client_id IN (SELECT client_id FROM target_users_cte)
                GROUP BY client_id
            ),
            ranked_users_cte AS (
                SELECT client_id, total_pnl_90d, 
                       rank() OVER (ORDER BY total_pnl_90d DESC) AS user_rank, 
                       count() OVER () AS total_users
                FROM user_pnl_cte
            )
        SELECT client_id, 
               total_pnl_90d, 
               user_rank, 
               round((total_users - user_rank) / total_users, 4) AS pnl_percentile_90d
        FROM ranked_users_cte
    ),
    
    -- V3 Metrics
    v3_risk_metrics AS (
        WITH daily_pnl AS (
            SELECT client_id, toDate(_timestamp) AS report_date,
                sumIf(CAST(order_details.price, 'Float64') * CAST(order_details.quantity, 'Float64'), CAST(order_details.side, 'UInt8') = 0) -
                sumIf(CAST(order_details.price, 'Float64') * CAST(order_details.quantity, 'Float64'), CAST(order_details.side, 'UInt8') = 1) AS pnl
            FROM analytics.orders
            WHERE status = 'COMPLETE' AND _timestamp >= (now() - toIntervalDay(90))
              AND client_id IN (SELECT client_id FROM target_users_cte)
            GROUP BY client_id, report_date
        ),
        cumulative_pnl AS (
            SELECT client_id, report_date,
                sum(pnl) OVER (PARTITION BY client_id ORDER BY report_date) AS c_pnl
            FROM daily_pnl
        ),
        daily_drawdowns AS (
            SELECT client_id,
                max(c_pnl) OVER (PARTITION BY client_id ORDER BY report_date) - c_pnl AS drawdown
            FROM cumulative_pnl
        )
        SELECT client_id,
            abs(min(pnl)) AS max_single_day_loss_90d,
            stddevPop(pnl) AS pnl_volatility_90d,
            countIf(pnl < -10000) AS large_loss_day_count_90d
        FROM daily_pnl
        GROUP BY client_id
    ),
    
    drawdown_metrics AS (
        WITH daily_pnl AS (
            SELECT client_id, toDate(_timestamp) AS report_date,
                sumIf(CAST(order_details.price, 'Float64') * CAST(order_details.quantity, 'Float64'), CAST(order_details.side, 'UInt8') = 0) -
                sumIf(CAST(order_details.price, 'Float64') * CAST(order_details.quantity, 'Float64'), CAST(order_details.side, 'UInt8') = 1) AS pnl
            FROM analytics.orders
            WHERE status = 'COMPLETE' AND _timestamp >= (now() - toIntervalDay(90))
              AND client_id IN (SELECT client_id FROM target_users_cte)
            GROUP BY client_id, report_date
        ),
        cumulative_pnl AS (
            SELECT client_id, report_date,
                sum(pnl) OVER (PARTITION BY client_id ORDER BY report_date) AS c_pnl
            FROM daily_pnl
        ),
        daily_drawdowns AS (
            SELECT client_id,
                max(c_pnl) OVER (PARTITION BY client_id ORDER BY report_date) - c_pnl AS drawdown
            FROM cumulative_pnl
        )
        SELECT client_id,
            max(drawdown) AS max_pnl_drawdown_90d
        FROM daily_drawdowns
        GROUP BY client_id
    ),
    
    concentration_metrics AS (
        WITH user_symbol_volumes AS (
            SELECT t.client_id,
                CAST(o.order_details.description.tradingSymbol AS String) AS symbol,
                sum(CAST(o.order_details.price AS Float64) * CAST(o.order_details.quantity AS Float64)) AS symbol_volume
            FROM analytics.trades AS t
            LEFT JOIN analytics.orders AS o ON t.order_id = o.order_id
            WHERE t._timestamp >= (now() - toIntervalDay(90))
              AND t.client_id IN (SELECT client_id FROM target_users_cte)
              AND symbol != ''
            GROUP BY t.client_id, symbol
        ),
        user_total_volumes AS (
            SELECT client_id, sum(symbol_volume) AS total_user_volume
            FROM user_symbol_volumes
            GROUP BY client_id
        ),
        symbol_concentration AS (
            SELECT usv.client_id,
                utv.total_user_volume,
                sum(CAST(usv.symbol_volume, 'Float64') * CAST(usv.symbol_volume, 'Float64')) / CAST(utv.total_user_volume, 'Float64') / CAST(utv.total_user_volume, 'Float64') AS trade_concentration_index_90d,
                max(usv.symbol_volume / utv.total_user_volume) > 0.8 AS is_concentrated_trader_flag
            FROM user_symbol_volumes AS usv
            JOIN user_total_volumes AS utv ON usv.client_id = utv.client_id
            GROUP BY usv.client_id, utv.total_user_volume
        )
        SELECT client_id, trade_concentration_index_90d, is_concentrated_trader_flag
        FROM symbol_concentration
    ),
    
    lifetime_symbols AS (
        SELECT t.client_id,
            uniq(CAST(o.order_details.description.tradingSymbol AS String)) AS lifetime_distinct_symbols_traded
        FROM analytics.trades AS t
        LEFT JOIN analytics.orders AS o ON t.order_id = o.order_id
        WHERE t.client_id IN (SELECT client_id FROM target_users_cte)
          AND CAST(o.order_details.description.tradingSymbol AS String) != ''
        GROUP BY t.client_id
    ),
    
    post_large_loss_behavior AS (
        WITH daily_pnl AS (
            SELECT toDate(_timestamp) AS report_date, client_id,
                sumIf(CAST(order_details.price, 'Float64') * CAST(order_details.quantity, 'Float64'), CAST(order_details.side, 'UInt8') = 0) -
                sumIf(CAST(order_details.price, 'Float64') * CAST(order_details.quantity, 'Float64'), CAST(order_details.side, 'UInt8') = 1) AS pnl
            FROM analytics.orders
            WHERE status = 'COMPLETE' AND _timestamp >= (now() - toIntervalDay(90))
              AND client_id IN (SELECT client_id FROM target_users_cte)
            GROUP BY client_id, report_date
        ),
        daily_volume AS (
            SELECT toDate(t._timestamp) AS report_date, t.client_id,
                sum(CAST(o.order_details.price, 'Float64') * CAST(o.order_details.quantity, 'Float64')) AS volume
            FROM analytics.trades AS t
            LEFT JOIN analytics.orders AS o ON t.order_id = o.order_id
            WHERE t._timestamp >= (now() - toIntervalDay(90))
              AND t.client_id IN (SELECT client_id FROM target_users_cte)
            GROUP BY t.client_id, report_date
        ),
        joined_data AS (
            SELECT p.report_date, p.client_id, p.pnl, v.volume
            FROM daily_pnl p
            JOIN daily_volume v ON p.client_id = v.client_id AND p.report_date = v.report_date
        ),
        user_avg_vol AS (
            SELECT client_id, avg(volume) AS avg_daily_volume
            FROM joined_data
            GROUP BY client_id
        ),
        ranked_days AS (
            SELECT client_id, pnl,
                lead(volume, 1) OVER (PARTITION BY client_id ORDER BY report_date) AS next_day_volume
            FROM joined_data
        )
        SELECT r.client_id,
            countIf(r.pnl < -10000 AND r.next_day_volume > (uav.avg_daily_volume * 2)) > 0 AS post_large_loss_behavior_change_flag
        FROM ranked_days r
        JOIN user_avg_vol uav ON r.client_id = uav.client_id
        GROUP BY r.client_id
    )

SELECT
    au.client_id AS client_id, 
    COALESCE(pc.pnl_1d, 0) AS pnl_1d, 
    COALESCE(pc.pnl_7d, 0) AS pnl_7d, 
    COALESCE(pc.pnl_30d, 0) AS pnl_30d, 
    COALESCE(pc.pnl_90d, 0) AS pnl_90d, 
    COALESCE(pc.pnl_360d, 0) AS pnl_360d,
    COALESCE(ap.preferred_asset_class, '') AS preferred_asset_class,
    -- V2 Metrics
    COALESCE(pr.total_pnl_90d, 0) AS total_pnl_90d, 
    COALESCE(pr.user_rank, 0) AS user_rank_by_pnl_90d, 
    COALESCE(pr.pnl_percentile_90d, 0) AS pnl_percentile_90d,
    -- V3 Metrics
    COALESCE(v3rm.max_single_day_loss_90d, 0) AS max_single_day_loss_90d,
    COALESCE(v3rm.pnl_volatility_90d, 0) AS pnl_volatility_90d,
    COALESCE(v3rm.large_loss_day_count_90d, 0) AS large_loss_day_count_90d,
    COALESCE(dm.max_pnl_drawdown_90d, 0) AS max_pnl_drawdown_90d,
    COALESCE(plbc.post_large_loss_behavior_change_flag, 0) AS post_large_loss_behavior_change_flag,
    COALESCE(cm.is_concentrated_trader_flag, 0) AS is_concentrated_trader_flag,
    COALESCE(cm.trade_concentration_index_90d, 0) AS trade_concentration_index_90d,
    COALESCE(ls.lifetime_distinct_symbols_traded, 0) AS lifetime_distinct_symbols_traded
FROM all_users AS au
LEFT JOIN pnl_consolidated AS pc ON au.client_id = pc.client_id
LEFT JOIN asset_preference AS ap ON au.client_id = ap.client_id
LEFT JOIN pnl_ranking_cte AS pr ON au.client_id = pr.client_id
LEFT JOIN v3_risk_metrics AS v3rm ON au.client_id = v3rm.client_id
LEFT JOIN drawdown_metrics AS dm ON au.client_id = dm.client_id
LEFT JOIN concentration_metrics AS cm ON au.client_id = cm.client_id
LEFT JOIN lifetime_symbols AS ls ON au.client_id = ls.client_id
LEFT JOIN post_large_loss_behavior AS plbc ON au.client_id = plbc.client_id
