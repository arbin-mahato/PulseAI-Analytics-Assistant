WITH
    target_users_cte AS (SELECT client_id FROM analytics.users WHERE client_id IN {user_list:Array(String)}),
    all_users AS (SELECT client_id FROM target_users_cte),
    
    -- Most cancelled instrument (global metric, same for all users)
    most_cancelled_instrument AS (
        SELECT argMax(symbol, cancel_count) AS most_cancelled_instrument_30d
        FROM (
            SELECT CAST(order_details.description.tradingSymbol AS String) AS symbol, 
                   count() as cancel_count
            FROM analytics.orders
            WHERE status = 'CANCEL_CONFIRMED' 
              AND _timestamp >= (now() - toIntervalDay(30)) 
              AND symbol != ''
            GROUP BY symbol
        )
    ),
    
    -- Most profitable instrument (global metric, same for all users)
    most_profitable_instrument AS (
        SELECT argMax(instrument_symbol, total_pnl) AS most_profitable_instrument_all_users_90d
        FROM (
            SELECT CAST(order_details.description.tradingSymbol AS String) AS instrument_symbol,
                   sum(if(CAST(order_details.side AS UInt8) = 0, 1, -1) * CAST(order_details.price AS Float64) * CAST(order_details.quantity AS Float64)) AS total_pnl
            FROM analytics.orders
            WHERE status = 'COMPLETE' 
              AND _timestamp >= (now() - toIntervalDay(90)) 
              AND instrument_symbol != ''
            GROUP BY instrument_symbol
        )
    )

SELECT
    au.client_id AS client_id,
    mci.most_cancelled_instrument_30d,
    mpi.most_profitable_instrument_all_users_90d
FROM all_users AS au
CROSS JOIN most_cancelled_instrument AS mci
CROSS JOIN most_profitable_instrument AS mpi