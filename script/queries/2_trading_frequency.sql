WITH
    target_users_cte AS (SELECT client_id FROM analytics.users WHERE client_id IN {user_list:Array(String)}),
    all_users AS (SELECT client_id FROM target_users_cte),

    -- V1 Metrics: Basic trade counts
    trade_counts AS (
        SELECT client_id,
            countIf(_timestamp >= now() - INTERVAL 1 DAY) AS trade_count_1d,
            countIf(_timestamp >= now() - INTERVAL 7 DAY) AS trade_count_7d,
            countIf(_timestamp >= now() - INTERVAL 30 DAY) AS trade_count_30d,
            countIf(_timestamp >= now() - INTERVAL 90 DAY) AS trade_count_90d,
            countIf(_timestamp >= now() - INTERVAL 360 DAY) AS trade_count_360d,
            uniqIf(toDate(_timestamp), _timestamp >= now() - INTERVAL 90 DAY) AS active_trading_days_90d,
            round(countIf(_timestamp >= now() - INTERVAL 90 DAY) / nullIf(uniqIf(toDate(_timestamp), _timestamp >= now() - INTERVAL 90 DAY), 0), 2) AS trades_per_active_day_90d
        FROM analytics.trades 
        WHERE client_id IN (SELECT client_id FROM target_users_cte) 
        GROUP BY client_id
    ),
    
    -- V2 Metrics
    avg_cluster_duration AS (
        SELECT client_id, avg(cluster_duration_minutes) AS avg_activity_cluster_duration_minutes_30d
        FROM (
            SELECT client_id, cluster_id, dateDiff('minute', min(_timestamp), max(_timestamp)) AS cluster_duration_minutes 
            FROM (
                SELECT *, sum(is_new_cluster) OVER (PARTITION BY client_id ORDER BY _timestamp) AS cluster_id 
                FROM (
                    SELECT *, if(dateDiff('minute', lag(_timestamp, 1, _timestamp) OVER (PARTITION BY client_id ORDER BY _timestamp), _timestamp) > 30, 1, 0) AS is_new_cluster 
                    FROM analytics.events 
                    WHERE _timestamp >= now() - INTERVAL 30 DAY AND client_id IN (SELECT client_id FROM target_users_cte) AND client_id IS NOT NULL
                )
            ) 
            GROUP BY client_id, cluster_id
        ) 
        GROUP BY client_id
    ),
    
    avg_http_requests AS (
        SELECT client_id, countIf(event_name = 'HTTP Request') / (max(cluster_id) + 1) AS avg_http_requests_per_session_30d 
        FROM (
            SELECT *, sum(is_new_cluster) OVER (PARTITION BY client_id ORDER BY _timestamp) AS cluster_id 
            FROM (
                SELECT *, if(dateDiff('minute', lag(_timestamp, 1, _timestamp) OVER (PARTITION BY client_id ORDER BY _timestamp), _timestamp) > 30, 1, 0) AS is_new_cluster 
                FROM analytics.events 
                WHERE _timestamp >= now() - INTERVAL 30 DAY AND client_id IN (SELECT client_id FROM target_users_cte) AND client_id IS NOT NULL
            )
        ) 
        GROUP BY client_id
    ),
    
    cluster_bounce_rate AS (
        SELECT client_id, countIf(event_count <= 3) / count() AS cluster_bounce_rate_30d 
        FROM (
            SELECT client_id, cluster_id, count() AS event_count 
            FROM (
                SELECT *, sum(is_new_cluster) OVER (PARTITION BY client_id ORDER BY _timestamp) AS cluster_id 
                FROM (
                    SELECT *, if(dateDiff('minute', lag(_timestamp, 1, _timestamp) OVER (PARTITION BY client_id ORDER BY _timestamp), _timestamp) > 30, 1, 0) AS is_new_cluster 
                    FROM analytics.events 
                    WHERE _timestamp >= now() - INTERVAL 30 DAY AND client_id IN (SELECT client_id FROM target_users_cte) AND client_id IS NOT NULL
                )
            ) 
            GROUP BY client_id, cluster_id
        ) 
        GROUP BY client_id
    ),
    
    weekend_cluster_count AS (
        SELECT client_id, count() AS weekend_cluster_count_30d 
        FROM (
            SELECT client_id, cluster_id, min(_timestamp) AS cluster_start_time 
            FROM (
                SELECT *, sum(is_new_cluster) OVER (PARTITION BY client_id ORDER BY _timestamp) AS cluster_id 
                FROM (
                    SELECT *, if(dateDiff('minute', lag(_timestamp, 1, _timestamp) OVER (PARTITION BY client_id ORDER BY _timestamp), _timestamp) > 30, 1, 0) AS is_new_cluster 
                    FROM analytics.events 
                    WHERE _timestamp >= now() - INTERVAL 30 DAY AND client_id IN (SELECT client_id FROM target_users_cte) AND client_id IS NOT NULL
                )
            ) 
            GROUP BY client_id, cluster_id
        ) 
        WHERE toDayOfWeek(cluster_start_time) IN (6, 7) 
        GROUP BY client_id
    ),
    
    primary_activity_hour AS (
        SELECT client_id, argMax(event_hour, hourly_count) AS primary_activity_hour 
        FROM (
            SELECT client_id, toHour(_timestamp) AS event_hour, count() AS hourly_count 
            FROM analytics.events 
            WHERE _timestamp >= now() - INTERVAL 90 DAY AND client_id IN (SELECT client_id FROM target_users_cte) AND client_id IS NOT NULL
            GROUP BY client_id, event_hour
        ) 
        GROUP BY client_id
    ),
    
    morning_active_flag AS (
        SELECT client_id, if(countIf(toHour(_timestamp) < 12) / count() > 0.5, 1, 0) AS is_morning_active_flag 
        FROM analytics.events 
        WHERE _timestamp >= now() - INTERVAL 90 DAY AND client_id IN (SELECT client_id FROM target_users_cte) AND client_id IS NOT NULL
        GROUP BY client_id
    ),
    
    weekday_concentration AS (
        SELECT client_id, 1 - (stddev_normalized * (sqrt(6)/2)) AS weekday_concentration_score_90d 
        FROM (
            SELECT client_id, stddevPop(normalized_count) AS stddev_normalized 
            FROM (
                SELECT client_id, day_of_week, count() / sum(count()) OVER (PARTITION BY client_id) AS normalized_count 
                FROM (
                    SELECT client_id, toDayOfWeek(_timestamp) AS day_of_week 
                    FROM analytics.events 
                    WHERE _timestamp >= now() - INTERVAL 90 DAY AND client_id IN (SELECT client_id FROM target_users_cte) AND client_id IS NOT NULL
                ) 
                GROUP BY client_id, day_of_week
            ) 
            GROUP BY client_id
        )
    ),
    
    trade_volume_consistency AS (
        SELECT client_id, 1 / (1 + (stddev_daily_volume / nullIf(avg_daily_volume, 0))) AS trade_volume_consistency_score_90d 
        FROM (
            SELECT client_id, avg(daily_trade_volume) AS avg_daily_volume, stddevPop(daily_trade_volume) AS stddev_daily_volume 
            FROM (
                SELECT t.client_id, toDate(t._timestamp) AS trade_date, sum(CAST(o.order_details.price AS Float64) * CAST(o.order_details.quantity AS Float64)) AS daily_trade_volume 
                FROM analytics.trades AS t 
                LEFT JOIN analytics.orders AS o ON t.order_id = o.order_id 
                WHERE t._timestamp >= (now() - toIntervalDay(90)) AND t.client_id IN (SELECT client_id FROM target_users_cte) AND t.client_id IS NOT NULL
                GROUP BY t.client_id, trade_date
            ) 
            GROUP BY client_id
        )
    ),
    
    -- V3 Metrics
    v3_trading_metrics AS (
        WITH trades_per_second AS (
            SELECT client_id,
                toDateTime(toInt64(toUnixTimestamp(_timestamp))) AS second_bucket,
                count() AS trades_in_second
            FROM analytics.trades
            WHERE _timestamp >= (now() - toIntervalDay(90))
              AND client_id IN (SELECT client_id FROM target_users_cte)
            GROUP BY client_id, second_bucket
        ),
        trades_per_day AS (
            SELECT client_id,
                caseWithExpression(toDayOfWeek(_timestamp), 1, 'Mon', 2, 'Tue', 3, 'Wed', 4, 'Thu', 5, 'Fri', 6, 'Sat', 7, 'Sun', NULL) AS day_of_week,
                count() AS trades_count
            FROM analytics.trades
            WHERE _timestamp >= (now() - toIntervalDay(90))
              AND client_id IN (SELECT client_id FROM target_users_cte)
            GROUP BY client_id, day_of_week
        ),
        daily_trade_count AS (
            SELECT client_id,
                toDayOfWeek(toDateTime(_timestamp)) AS day_of_week,
                count() AS daily_count
            FROM analytics.trades
            WHERE _timestamp >= (now() - toIntervalDay(90))
              AND client_id IN (SELECT client_id FROM target_users_cte)
            GROUP BY client_id, day_of_week
        )
        SELECT client_id,
            max(trades_in_second) AS max_trades_per_second_90d
        FROM trades_per_second
        GROUP BY client_id
    ),
    
    primary_trade_day AS (
        WITH trades_per_day AS (
            SELECT client_id,
                caseWithExpression(toDayOfWeek(_timestamp), 1, 'Mon', 2, 'Tue', 3, 'Wed', 4, 'Thu', 5, 'Fri', 6, 'Sat', 7, 'Sun', NULL) AS day_of_week,
                count() AS trades_count
            FROM analytics.trades
            WHERE _timestamp >= (now() - toIntervalDay(90))
              AND client_id IN (SELECT client_id FROM target_users_cte)
            GROUP BY client_id, day_of_week
        )
        SELECT client_id,
            argMax(day_of_week, trades_count) AS primary_trade_day_90d
        FROM trades_per_day
        GROUP BY client_id
    ),
    
    trade_variance AS (
        WITH daily_trade_count AS (
            SELECT client_id,
                toDayOfWeek(toDateTime(_timestamp)) AS day_of_week,
                count() AS daily_count
            FROM analytics.trades
            WHERE _timestamp >= (now() - toIntervalDay(90))
              AND client_id IN (SELECT client_id FROM target_users_cte)
            GROUP BY client_id, day_of_week
        )
        SELECT client_id,
            stddevPop(daily_count) AS trade_count_by_day_of_week_variance_90d
        FROM daily_trade_count
        GROUP BY client_id
        HAVING count() > 1
    ),
    
    activity_momentum AS (
        SELECT client_id,
            (countIf(_timestamp >= now() - INTERVAL 30 DAY) / 30) / nullIf((countIf(_timestamp >= now() - INTERVAL 90 DAY) / 90), 0) AS activity_momentum_score
        FROM analytics.trades
        WHERE _timestamp >= (now() - toIntervalDay(90))
          AND client_id IN (SELECT client_id FROM target_users_cte)
        GROUP BY client_id
    )

SELECT
    au.client_id AS client_id,
    COALESCE(tc.trade_count_1d, 0) AS trade_count_1d,
    COALESCE(tc.trade_count_7d, 0) AS trade_count_7d,
    COALESCE(tc.trade_count_30d, 0) AS trade_count_30d,
    COALESCE(tc.trade_count_90d, 0) AS trade_count_90d,
    COALESCE(tc.trade_count_360d, 0) AS trade_count_360d,
    COALESCE(tc.active_trading_days_90d, 0) AS active_trading_days_90d,
    COALESCE(tc.trades_per_active_day_90d, 0) AS trades_per_active_day_90d,
    -- V2 Metrics
    COALESCE(acd.avg_activity_cluster_duration_minutes_30d, 0) AS avg_activity_cluster_duration_minutes_30d,
    COALESCE(ahr.avg_http_requests_per_session_30d, 0) AS avg_http_requests_per_session_30d,
    COALESCE(cbr.cluster_bounce_rate_30d, 0) AS cluster_bounce_rate_30d,
    COALESCE(wcc.weekend_cluster_count_30d, 0) AS weekend_cluster_count_30d,
    COALESCE(pah.primary_activity_hour, 0) AS primary_activity_hour,
    COALESCE(maf.is_morning_active_flag, 0) AS is_morning_active_flag,
    COALESCE(wc.weekday_concentration_score_90d, 0) AS weekday_concentration_score_90d,
    COALESCE(tvc.trade_volume_consistency_score_90d, 0) AS trade_volume_consistency_score_90d,
    -- V3 Metrics
    COALESCE(v3tm.max_trades_per_second_90d, 0) AS max_trades_per_second_90d,
    COALESCE(ptd.primary_trade_day_90d, '') AS primary_trade_day_90d,
    COALESCE(tv.trade_count_by_day_of_week_variance_90d, 0) AS trade_count_by_day_of_week_variance_90d,
    COALESCE(am.activity_momentum_score, 0) AS activity_momentum_score
FROM all_users AS au
LEFT JOIN trade_counts AS tc ON au.client_id = tc.client_id
LEFT JOIN avg_cluster_duration AS acd ON au.client_id = acd.client_id
LEFT JOIN avg_http_requests AS ahr ON au.client_id = ahr.client_id
LEFT JOIN cluster_bounce_rate AS cbr ON au.client_id = cbr.client_id
LEFT JOIN weekend_cluster_count AS wcc ON au.client_id = wcc.client_id
LEFT JOIN primary_activity_hour AS pah ON au.client_id = pah.client_id
LEFT JOIN morning_active_flag AS maf ON au.client_id = maf.client_id
LEFT JOIN weekday_concentration AS wc ON au.client_id = wc.client_id
LEFT JOIN trade_volume_consistency AS tvc ON au.client_id = tvc.client_id
LEFT JOIN v3_trading_metrics AS v3tm ON au.client_id = v3tm.client_id
LEFT JOIN primary_trade_day AS ptd ON au.client_id = ptd.client_id
LEFT JOIN trade_variance AS tv ON au.client_id = tv.client_id
LEFT JOIN activity_momentum AS am ON au.client_id = am.client_id