WITH
    target_users_cte AS (SELECT client_id FROM analytics.users WHERE client_id IN {user_list:Array(String)}),
    all_users AS (SELECT client_id FROM target_users_cte),

    -- V1 Metrics
    first_trade_cte AS (
        SELECT
            client_id,
            min(toDate(_timestamp)) AS first_trade_date
        FROM analytics.trades
        WHERE client_id IN (SELECT client_id FROM target_users_cte)
        GROUP BY client_id
    ),

    event_based_metrics AS (
        SELECT
            client_id,
            argMax(platform, platform_count) AS primary_platform_30d,
            if(uniq(platform) > 1, 1, 0) AS is_multi_platform_user_30d,
            uniq(ip_address) AS unique_ip_count_30d
        FROM (
            SELECT
                client_id, platform, ip_address, count() as platform_count
            FROM analytics.events
            WHERE _timestamp >= now() - INTERVAL 30 DAY
              AND client_id IN (SELECT client_id FROM target_users_cte)
              AND platform IS NOT NULL AND ip_address IS NOT NULL
            GROUP BY client_id, platform, ip_address
        )
        GROUP BY client_id
    ),
    
    latest_app_version_cte AS (
        SELECT
            client_id,
            argMax(app_version, _timestamp) AS latest_app_version_used
        FROM analytics.events
        WHERE client_id IN (SELECT client_id FROM target_users_cte) AND app_version IS NOT NULL
        GROUP BY client_id
    ),
    
    -- V2 Metrics
    signup_metrics AS (
        SELECT
            client_id,
            toDate(created_at) AS signup_date,
            dateDiff('day', created_at, today()) AS account_age_days
        FROM analytics.users
        WHERE client_id IN (SELECT client_id FROM target_users_cte)
    ),
    
    activation_metrics AS (
        WITH deposit_users AS (
            SELECT DISTINCT client_id
            FROM analytics.events
            WHERE
                event_name = 'HTTP Request'
                AND JSONExtractString(CAST(event_data AS String), 'http_url') LIKE '%/user/funds/margins%'
                AND JSONExtractFloat(
                    JSONExtractString(CAST(event_data AS String), 'http_response_preview'),
                    'result', 'deposit'
                ) > 0
                AND client_id IN (SELECT client_id FROM target_users_cte)
        )
        SELECT
            u.client_id,
            if(du.client_id IS NOT NULL, 'Activated', 'Not Activated') AS activation_status
        FROM target_users_cte AS u
        LEFT JOIN deposit_users AS du ON u.client_id = du.client_id
    ),
    
    activity_metrics AS (
        SELECT
            client_id,
            uniq(toDate(_timestamp)) AS active_days_30d
        FROM analytics.events
        WHERE _timestamp >= now() - INTERVAL 30 DAY
          AND client_id IN (SELECT client_id FROM target_users_cte)
          AND client_id != ''
        GROUP BY client_id
    ),
    
    -- V3 Metrics
    v3_identity_metrics AS (
        WITH login_sessions AS (
            SELECT client_id, login_id,
                MIN(_timestamp) AS login_start_time
            FROM analytics.orders
            WHERE login_id IS NOT NULL
              AND _timestamp >= (now() - toIntervalDay(90))
              AND client_id IN (SELECT client_id FROM target_users_cte)
            GROUP BY client_id, login_id
        ),
        session_gaps AS (
            SELECT client_id,
                dateDiff('day', lagInFrame(login_start_time) OVER (PARTITION BY client_id ORDER BY login_start_time ASC), login_start_time) AS day_gap
            FROM login_sessions
        )
        SELECT client_id,
            AVG(day_gap) AS avg_time_since_last_activity_per_login
        FROM session_gaps
        WHERE day_gap > 0 AND day_gap < 90
        GROUP BY client_id
    ),
    
    distinct_logins AS (
        SELECT client_id,
            uniq(login_id) AS distinct_login_ids_90d
        FROM analytics.orders
        WHERE _timestamp >= (now() - toIntervalDay(90))
          AND client_id IN (SELECT client_id FROM target_users_cte)
        GROUP BY client_id
    )

SELECT
    au.client_id AS client_id,
    COALESCE(u.name, '') AS name,
    COALESCE(u.email, '') AS email,
    ft.first_trade_date,
    COALESCE(if(ft.first_trade_date IS NULL, NULL, dateDiff('day', ft.first_trade_date, today())), 0) AS days_since_first_trade,
    now() AS last_calculated_at,
    COALESCE(dateDiff('day', toDate(u.last_seen), today()), 0) AS days_since_last_seen,
    -- V2 Metrics
    COALESCE(ebm.primary_platform_30d, '') AS primary_platform_30d,
    COALESCE(ebm.is_multi_platform_user_30d, 0) AS is_multi_platform_user_30d,
    COALESCE(ebm.unique_ip_count_30d, 0) AS unique_ip_count_30d,
    COALESCE(lav.latest_app_version_used, '') AS latest_app_version_used,
    sm.signup_date,
    COALESCE(sm.account_age_days, 0) AS account_age_days,
    COALESCE(actm.activation_status, 'Not Activated') AS activation_status,
    COALESCE(acm.active_days_30d, 0) AS active_days_30d,
    -- V3 Metrics
    COALESCE(v3im.avg_time_since_last_activity_per_login, 0) AS avg_time_since_last_activity_per_login,
    COALESCE(dl.distinct_login_ids_90d, 0) AS distinct_login_ids_90d
FROM all_users AS au
LEFT JOIN analytics.users AS u ON au.client_id = u.client_id
LEFT JOIN first_trade_cte AS ft ON au.client_id = ft.client_id
LEFT JOIN event_based_metrics AS ebm ON au.client_id = ebm.client_id
LEFT JOIN latest_app_version_cte AS lav ON au.client_id = lav.client_id
LEFT JOIN signup_metrics AS sm ON au.client_id = sm.client_id
LEFT JOIN activation_metrics AS actm ON au.client_id = actm.client_id
LEFT JOIN activity_metrics AS acm ON au.client_id = acm.client_id
LEFT JOIN v3_identity_metrics AS v3im ON au.client_id = v3im.client_id
LEFT JOIN distinct_logins AS dl ON au.client_id = dl.client_id