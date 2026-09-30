WITH
    target_users_cte AS (SELECT client_id FROM analytics.users WHERE client_id IN {user_list:Array(String)}),
    all_users AS (SELECT client_id FROM target_users_cte),
    
    -- V1 Metrics: Volume metrics
    volume_metrics AS (
        SELECT client_id, 
            sumIf(order_value, trade_date >= now() - INTERVAL 1 DAY) AS total_volume_1d, 
            sumIf(order_value, trade_date >= now() - INTERVAL 7 DAY) AS total_volume_7d, 
            sumIf(order_value, trade_date >= now() - INTERVAL 30 DAY) AS total_volume_30d, 
            sumIf(order_value, trade_date >= now() - INTERVAL 90 DAY) AS total_volume_90d, 
            avgIf(order_value, trade_date >= now() - INTERVAL 90 DAY) AS avg_trade_size_90d
        FROM (
            SELECT DISTINCT t.client_id, t.order_id, t._timestamp as trade_date, 
                   CAST(o.order_details.price, 'Float64') * CAST(o.order_details.quantity, 'UInt64') AS order_value
            FROM analytics.trades AS t 
            LEFT JOIN analytics.orders AS o ON t.order_id = o.order_id
            WHERE t.client_id IN (SELECT client_id FROM target_users_cte)
        ) AS traded_orders 
        GROUP BY client_id
    ),
    
    v1_deposit_metrics AS (
        SELECT e.client_id, 
               e.end_deposit AS total_deposit_amount_all_time, 
               (e.end_deposit - COALESCE(s.start_deposit, 0)) - (e.end_withdraw - COALESCE(s.start_withdraw, 0)) AS net_deposit_flow_90d
        FROM (
            SELECT client_id, 
                   argMax(JSONExtractFloat(JSONExtractString(CAST(event_data AS String), 'http_response_preview'), 'result', 'deposit'), _timestamp) AS end_deposit, 
                   argMax(JSONExtractFloat(JSONExtractString(CAST(event_data AS String), 'http_response_preview'), 'result', 'withdraw'), _timestamp) AS end_withdraw
            FROM analytics.events 
            WHERE client_id IN (SELECT client_id FROM target_users_cte) 
              AND event_name = 'HTTP Request' 
              AND JSONExtractString(CAST(event_data AS String), 'http_url') LIKE '%/user/funds/margins%' 
            GROUP BY client_id
        ) AS e
        LEFT JOIN (
            SELECT client_id, 
                   argMax(JSONExtractFloat(JSONExtractString(CAST(event_data AS String), 'http_response_preview'), 'result', 'deposit'), _timestamp) AS start_deposit, 
                   argMax(JSONExtractFloat(JSONExtractString(CAST(event_data AS String), 'http_response_preview'), 'result', 'withdraw'), _timestamp) AS start_withdraw
            FROM analytics.events 
            WHERE client_id IN (SELECT client_id FROM target_users_cte) 
              AND event_name = 'HTTP Request' 
              AND JSONExtractString(CAST(event_data AS String), 'http_url') LIKE '%/user/funds/margins%' 
              AND _timestamp < (now() - INTERVAL 90 DAY) 
            GROUP BY client_id
        ) AS s ON e.client_id = s.client_id
    ),
    
    -- V2 Metrics: Net deposit value all time
    v2_financial_metrics AS (
        WITH individual_transactions AS (
            SELECT
                client_id,
                _timestamp,
                deposit_total - lagInFrame(deposit_total, 1, 0) OVER (PARTITION BY client_id ORDER BY _timestamp ASC) AS deposit_amount,
                withdraw_total - lagInFrame(withdraw_total, 1, 0) OVER (PARTITION BY client_id ORDER BY _timestamp ASC) AS withdraw_amount
            FROM (
                SELECT
                    client_id,
                    _timestamp,
                    JSONExtractFloat(JSONExtractString(CAST(event_data, 'String'), 'http_response_preview'), 'result', 'deposit') AS deposit_total,
                    JSONExtractFloat(JSONExtractString(CAST(event_data, 'String'), 'http_response_preview'), 'result', 'withdraw') AS withdraw_total
                FROM analytics.events
                WHERE (event_name = 'HTTP Request') 
                  AND (JSONExtractString(CAST(event_data, 'String'), 'http_url') LIKE '%/user/funds/margins%') 
                  AND (client_id IN (SELECT client_id FROM target_users_cte))
            )
        )
        SELECT
            client_id,
            sum(deposit_amount) + sum(withdraw_amount) AS net_deposit_value_all_time
        FROM individual_transactions
        GROUP BY client_id
    ),
    
    -- V3 Metrics
    v3_financial_metrics AS (
        WITH deposit_events AS (
            SELECT client_id, _timestamp,
                if(current_deposit_total > lag(current_deposit_total, 1, 0) OVER (PARTITION BY client_id ORDER BY _timestamp), 1, 0) AS is_deposit_event
            FROM (
                SELECT client_id, _timestamp,
                    JSONExtractFloat(JSONExtractString(CAST(event_data.http_response_preview AS String), 'result'), 'deposit') AS current_deposit_total
                FROM analytics.events
                WHERE event_name = 'HTTP Request' 
                  AND CAST(event_data.http_url AS String) LIKE '%/user/funds/margins%'
                  AND client_id IN (SELECT client_id FROM target_users_cte)
            )
        )
        SELECT client_id,
            count() AS deposit_frequency_90d
        FROM deposit_events
        WHERE is_deposit_event = 1 
          AND _timestamp >= (now() - toIntervalDay(90))
        GROUP BY client_id
    ),
    
    first_withdrawal AS (
        SELECT client_id, min(toDate(_timestamp)) as withdrawal_date
        FROM (
            SELECT client_id, _timestamp,
                if(current_withdraw_total < lag(current_withdraw_total, 1, 0) OVER (PARTITION BY client_id ORDER BY _timestamp), 1, 0) AS is_withdrawal_event
            FROM (
                SELECT client_id, _timestamp,
                    JSONExtractFloat(JSONExtractString(CAST(event_data.http_response_preview AS String), 'result'), 'withdraw') AS current_withdraw_total
                FROM analytics.events
                WHERE event_name = 'HTTP Request' 
                  AND CAST(event_data.http_url AS String) LIKE '%/user/funds/margins%'
                  AND client_id IN (SELECT client_id FROM target_users_cte)
            )
        )
        WHERE is_withdrawal_event = 1
        GROUP BY client_id
    ),
    
    margin_utilization AS (
        SELECT client_id,
            avg(
                JSONExtractFloat(JSONExtractString(CAST(event_data.http_response_preview AS String), 'result'), 'blocked_margin')
                / nullIf(
                    JSONExtractFloat(JSONExtractString(CAST(event_data.http_response_preview AS String), 'result'), 'opening_cash') +
                    JSONExtractFloat(JSONExtractString(CAST(event_data.http_response_preview AS String), 'result'), 'deposit') -
                    JSONExtractFloat(JSONExtractString(CAST(event_data.http_response_preview AS String), 'result'), 'withdraw') +
                    JSONExtractFloat(JSONExtractString(CAST(event_data.http_response_preview AS String), 'result'), 'realized_mtm'),
                    0
                )
            ) AS avg_margin_utilization_pct_30d
        FROM analytics.events
        WHERE event_name = 'HTTP Request'
          AND CAST(event_data.http_url AS String) LIKE '%/user/funds/margins%'
          AND _timestamp >= (now() - toIntervalDay(30))
          AND client_id IN (SELECT client_id FROM target_users_cte)
        GROUP BY client_id
    ),
    
    withdrawal_days AS (
        SELECT client_id,
            dateDiff('day', withdrawal_date, today()) AS days_since_first_withdrawal
        FROM first_withdrawal
    )

SELECT
    au.client_id AS client_id,
    COALESCE(vm.total_volume_1d, 0) AS total_volume_1d, 
    COALESCE(vm.total_volume_7d, 0) AS total_volume_7d, 
    COALESCE(vm.total_volume_30d, 0) AS total_volume_30d, 
    COALESCE(vm.total_volume_90d, 0) AS total_volume_90d, 
    COALESCE(vm.avg_trade_size_90d, 0) AS avg_trade_size_90d,
    COALESCE(v1dm.total_deposit_amount_all_time, 0) AS total_deposit_amount_all_time, 
    COALESCE(v1dm.net_deposit_flow_90d, 0) AS net_deposit_flow_90d,
    -- V2 Metrics
    COALESCE(v2fm.net_deposit_value_all_time, 0) AS net_deposit_value_all_time,
    -- V3 Metrics
    COALESCE(v3fm.deposit_frequency_90d, 0) AS deposit_frequency_90d,
    COALESCE(mu.avg_margin_utilization_pct_30d, 0) AS avg_margin_utilization_pct_30d,
    COALESCE(wd.days_since_first_withdrawal, 0) AS days_since_first_withdrawal
FROM all_users AS au
LEFT JOIN volume_metrics AS vm ON au.client_id = vm.client_id
LEFT JOIN v1_deposit_metrics AS v1dm ON au.client_id = v1dm.client_id
LEFT JOIN v2_financial_metrics AS v2fm ON au.client_id = v2fm.client_id
LEFT JOIN v3_financial_metrics AS v3fm ON au.client_id = v3fm.client_id
LEFT JOIN margin_utilization AS mu ON au.client_id = mu.client_id
LEFT JOIN withdrawal_days AS wd ON au.client_id = wd.client_id
