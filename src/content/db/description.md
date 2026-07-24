# Comprehensive Metric Store Schema

## Overview
The Tradelab Metric Store is a DuckDB database containing 7 tables with 106 total columns tracking user trading behavior, financial metrics, risk profiles, and platform health across multiple time windows (1d, 7d, 30d, 90d, 360d).

---

## Table: identity_and_lifecycle (17 columns)
**Purpose**: Core user identification and lifecycle tracking metrics

| Column Name | Data Type | Key/Reference | Description |
|-------------|-----------|---------------|-------------|
| client_id | INTEGER | **Primary Key** | Unique identifier for the user |
| name | TEXT | | Full name of the user for identification |
| email | TEXT | | Primary email address of the user |
| first_trade_date | DATE | | Date of the user's first recorded trade |
| days_since_first_trade | INTEGER | | Number of days since the user's first trade (cohort analysis) |
| days_since_last_seen | INTEGER | | Number of days since the user was last active (churn risk indicator) |
| last_calculated_at | DATETIME | | Timestamp when this metric row was last updated |
| primary_platform_30d | TEXT | | Device platform with most events in last 30 days (web/ios/android) |
| is_multi_platform_user_30d | INTEGER | | Flag (1/0) if user was active on multiple platforms in last 30 days |
| unique_ip_count_30d | INTEGER | | Number of unique IP addresses used in last 30 days |
| latest_app_version_used | TEXT | | Most recent app version recorded on user's events |
| signup_date | DATE | | Date when user's account was first created |
| account_age_days | INTEGER | | Total days user has been registered on platform |
| activation_status | TEXT | | Whether user has made at least one deposit (Activated/Not Activated) |
| active_days_30d | INTEGER | | Number of unique days user was active in last 30 days |
| avg_time_since_last_activity_per_login | REAL | | Average gap in days between consecutive logins |
| distinct_login_ids_90d | INTEGER | | Number of unique login_id values in last 90 days |

---

## Table: trading_frequency (20 columns)
**Purpose**: Trading activity patterns and frequency metrics

| Column Name | Data Type | Key/Reference | Description |
|-------------|-----------|---------------|-------------|
| client_id | INTEGER | **FK → identity_and_lifecycle.client_id** | User identifier |
| trade_count_1d | INTEGER | | Total trades executed in last 24 hours |
| trade_count_7d | INTEGER | | Total trades executed in last 7 days |
| trade_count_30d | INTEGER | | Total trades executed in last 30 days (key engagement metric) |
| trade_count_90d | INTEGER | | Total trades executed in last 90 days |
| trade_count_360d | INTEGER | | Total trades executed in last 360 days |
| active_trading_days_90d | INTEGER | | Number of unique days user placed trades in last 90 days |
| trades_per_active_day_90d | REAL | | Average trades per active trading day |
| avg_activity_cluster_duration_minutes_30d | REAL | | Average duration of continuous activity sessions in minutes |
| avg_http_requests_per_session_30d | REAL | | Average API requests per activity session |
| cluster_bounce_rate_30d | REAL | | Percentage of sessions with ≤3 events (bounce indicator) |
| weekend_cluster_count_30d | INTEGER | | Number of activity sessions initiated on weekends |
| primary_activity_hour | INTEGER | | Hour of day (0-23) with highest platform events |
| is_morning_active_flag | INTEGER | | Flag (1/0) if >50% of events occur before noon |
| weekday_concentration_score_90d | REAL | | Score (0-1) measuring activity concentration on specific weekdays |
| trade_volume_consistency_score_90d | REAL | | Score (0-1) measuring consistency of daily trading volume |
| max_trades_per_second_90d | INTEGER | | Maximum trades executed in any single second |
| primary_trade_day_90d | TEXT | | Day of week with highest number of trades |
| trade_count_by_day_of_week_variance_90d | REAL | | Standard deviation of daily trade count across weekdays |
| activity_momentum_score | REAL | | Score indicating if trading activity is accelerating (>1) or decelerating (<1) |

---

## Table: financial_volume (12 columns)
**Purpose**: Financial transaction volumes and deposit/withdrawal patterns

| Column Name | Data Type | Key/Reference | Description |
|-------------|-----------|---------------|-------------|
| client_id | INTEGER | **FK → identity_and_lifecycle.client_id** | User identifier |
| total_volume_1d | REAL | | Total notional value of trades in last 24 hours |
| total_volume_7d | REAL | | Total notional value of trades in last 7 days |
| total_volume_30d | REAL | | Total notional value of trades in last 30 days (primary user value indicator) |
| total_volume_90d | REAL | | Total notional value of trades in last 90 days |
| avg_trade_size_90d | REAL | | Average notional value per trade (distinguishes HFT vs large traders) |
| total_deposit_amount_all_time | REAL | | Cumulative total amount deposited (core CLV metric) |
| net_deposit_flow_90d | REAL | | Net cash flow (Deposits - Withdrawals) in last 90 days |
| net_deposit_value_all_time | REAL | | User's total net financial contribution over lifetime |
| deposit_frequency_90d | INTEGER | | Number of distinct deposit events in last 90 days |
| avg_margin_utilization_pct_30d | REAL | | Average percentage of available capital used as margin |
| days_since_first_withdrawal | INTEGER | | Days since user made first withdrawal (success/trust indicator) |

---

## Table: behavioral_style (22 columns)
**Purpose**: Trading behavior patterns and decision-making characteristics

| Column Name | Data Type | Key/Reference | Description |
|-------------|-----------|---------------|-------------|
| client_id | INTEGER | **FK → identity_and_lifecycle.client_id** | User identifier |
| avg_holding_duration_all_time | REAL | | Average time user holds an asset (approximation) |
| order_cancellation_rate_30d | REAL | | Percentage of orders cancelled (indecision/bot indicator) |
| order_modification_rate_30d | REAL | | Percentage of orders modified |
| buy_to_sell_ratio_30d | REAL | | Ratio of buy to sell volume (accumulating vs distributing bias) |
| distinct_symbols_traded_90d | INTEGER | | Number of unique assets traded (portfolio diversification measure) |
| win_rate_90d | REAL | | Percentage of days with positive PnL in last 90 days |
| profit_factor_90d | REAL | | Ratio of gross profits to gross losses (>1 indicates profitability) |
| platform_logins_30d | INTEGER | | Number of unique login sessions (platform engagement) |
| funds_check_count_30d | INTEGER | | Times user checked account balance/margin information |
| portfolio_click_count_30d | INTEGER | | Times user clicked Portfolio navigation |
| orders_page_view_count_30d | INTEGER | | Times user viewed Orders page |
| dashboard_pins_view_count_30d | INTEGER | | Times main dashboard loaded pinned/watchlisted items |
| order_to_trade_ratio_30d | REAL | | Ratio of orders placed to trades executed |
| is_options_trader_flag | INTEGER | | Flag (1/0) if user has ever traded options contracts |
| order_modification_pre_execution_rate_30d | REAL | | Percentage of orders modified before execution |
| stop_loss_usage_rate_90d | REAL | | Percentage of orders that were triggered/stop-loss type |
| intraday_vs_delivery_ratio_90d | REAL | | Ratio of intraday to delivery trades |
| order_chasing_rate_30d | REAL | | Percentage of modified orders with less favorable prices (urgency indicator) |
| primary_order_type | TEXT | | Most frequently used order type (MARKET/LIMIT strategy indicator) |
| median_time_between_trades_90d | REAL | | Median duration in minutes between consecutive trades |
| is_holding_overnight_positions_flag | INTEGER | | Flag (1/0) if user holds positions with unrealized P&L (swing vs day trader) |

---

## Table: risk_profile (18 columns)
**Purpose**: Risk exposure, P&L performance, and trading outcomes

| Column Name | Data Type | Key/Reference | Description |
|-------------|-----------|---------------|-------------|
| client_id | INTEGER | **FK → identity_and_lifecycle.client_id** | User identifier |
| pnl_1d | REAL | | Profit/loss from trading in last 24 hours |
| pnl_7d | REAL | | Profit/loss from trading in last 7 days |
| pnl_30d | REAL | | Profit/loss from trading in last 30 days |
| pnl_90d | REAL | | Profit/loss from trading in last 90 days |
| pnl_360d | REAL | | Profit/loss from trading in last 360 days |
| preferred_asset_class | TEXT | | Asset class most frequently traded |
| total_pnl_90d | REAL | | Net realized profit/loss from all completed trades in 90 days |
| user_rank_by_pnl_90d | INTEGER | | User's absolute rank based on total_pnl_90d vs all traders |
| pnl_percentile_90d | REAL | | Performance percentile showing % of traders outperformed |
| max_single_day_loss_90d | REAL | | Largest single-day negative P&L (maximum daily risk measure) |
| pnl_volatility_90d | REAL | | Standard deviation of daily P&L (risk volatility measure) |
| large_loss_day_count_90d | INTEGER | | Number of days with P&L below -₹10,000 threshold |
| max_pnl_drawdown_90d | REAL | | Largest peak-to-trough decline in cumulative P&L |
| post_large_loss_behavior_change_flag | INTEGER | | Flag (1/0) for revenge trading behavior after large losses |
| is_concentrated_trader_flag | INTEGER | | Flag (1/0) if >80% of volume from single instrument (high-risk concentration) |
| trade_concentration_index_90d | REAL | | Score (0-1) measuring volume concentration in top 3 instruments |
| lifetime_distinct_symbols_traded | INTEGER | | Total unique instruments ever traded (specialist vs explorer) |

---

## Table: platform_health (14 columns)
**Purpose**: Technical performance, execution quality, and platform reliability metrics

| Column Name | Data Type | Key/Reference | Description |
|-------------|-----------|---------------|-------------|
| client_id | INTEGER | **FK → identity_and_lifecycle.client_id** | User identifier |
| total_session_expirations_30d | INTEGER | | Global count of session expirations due to token expiry |
| most_traded_instrument_by_volume_30d | TEXT | | Single instrument with highest trading volume across all users |
| instrument_with_largest_trader_increase | TEXT | | Instrument with largest increase in unique traders (trending) |
| client_error_rate_30d | REAL | | Percentage of API requests resulting in 4xx client errors |
| avg_api_response_time_ms_30d | REAL | | Average server response time for user's API requests |
| avg_time_to_fill_seconds_30d | REAL | | Average time from order placement to trade execution |
| error_to_trade_ratio_30d | REAL | | Ratio of client-side errors to executed trades |
| avg_time_to_load_dashboard_ms | REAL | | Average response time for dashboard API calls |
| order_rejection_rate_30d | REAL | | Percentage of orders explicitly rejected by system |
| orders_not_traded_ratio_30d | REAL | | Ratio of orders never filled (cancelled/rejected) to total orders |
| avg_order_life_to_cancel_minutes | REAL | | Average time cancelled orders survived before cancellation |
| avg_trade_fill_ratio_90d | REAL | | Average ratio of traded quantity to original order quantity |
| is_high_volume_cancelled_flag | INTEGER | | Flag (1/0) if user has high notional value of cancelled orders (top 5%) |

---

## Table: market_health (3 columns)
**Purpose**: Global market trends and instrument performance indicators

| Column Name | Data Type | Key/Reference | Description |
|-------------|-----------|---------------|-------------|
| client_id | INTEGER | **FK → identity_and_lifecycle.client_id** | User identifier |
| most_cancelled_instrument_30d | TEXT | | Instrument with highest cancellation count (volatility/friction indicator) |
| most_profitable_instrument_all_users_90d | TEXT | | Instrument generating highest total positive P&L across all users |

---

## Database Statistics
- **Total Tables**: 7
- **Total Columns**: 106
- **Time Windows**: 1d, 7d, 30d, 90d, 360d, all-time
- **Data Source**: ClickHouse analytics database
- **Update Frequency**: Daily batch processing
