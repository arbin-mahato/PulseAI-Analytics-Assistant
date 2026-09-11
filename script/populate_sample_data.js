import duckdb from 'duckdb';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FOLDER = path.join(__dirname, '..', 'db');
if (!fs.existsSync(DB_FOLDER)) {
    fs.mkdirSync(DB_FOLDER, { recursive: true });
}
const DUCKDB_PATH = path.join(DB_FOLDER, process.env.DUCKDB_NAME || 'metric_store.duckdb');

async function main() {
    console.log(`Creating sample trading data in: ${DUCKDB_PATH}`);
    
    // Remove existing file
    if (fs.existsSync(DUCKDB_PATH)) {
        fs.unlinkSync(DUCKDB_PATH);
    }
    
    const db = new duckdb.Database(DUCKDB_PATH);
    const conn = db.connect();

    try {
        // Create sample tables with trading data
        
        // 1. Identity and Lifecycle
        console.log('Creating identity_and_lifecycle table...');
        conn.run(`
            CREATE TABLE identity_and_lifecycle (
                client_id VARCHAR,
                name VARCHAR,
                email VARCHAR,
                first_trade_date VARCHAR,
                days_since_first_trade VARCHAR,
                last_calculated_at VARCHAR,
                days_since_last_seen VARCHAR,
                primary_platform_30d VARCHAR,
                is_multi_platform_user_30d VARCHAR,
                unique_ip_count_30d VARCHAR,
                latest_app_version_used VARCHAR,
                signup_date VARCHAR,
                account_age_days VARCHAR,
                activation_status VARCHAR,
                active_days_30d VARCHAR,
                avg_time_since_last_activity_per_login VARCHAR,
                distinct_login_ids_90d VARCHAR
            )
        `, (err) => {
            if (err) console.error('Error creating table:', err);
        });

        // Insert sample data
        conn.run(`
            INSERT INTO identity_and_lifecycle VALUES
            ('A05973', 'John Trader', 'john@example.com', '2024-01-15', '92', '2024-04-16', '2', 'web', 'true', '3', '2.1.0', '2024-01-10', '97', 'active', '28', '45.5', '15'),
            ('A06064', 'Sarah Market', 'sarah@example.com', '2024-02-01', '75', '2024-04-16', '1', 'mobile', 'true', '2', '2.0.8', '2024-01-25', '82', 'active', '30', '38.2', '18'),
            ('A06072', 'Mike Investor', 'mike@example.com', '2024-03-10', '37', '2024-04-15', '3', 'web', 'false', '1', '2.1.0', '2024-03-05', '42', 'active', '25', '52.1', '12'),
            ('A06073', 'Emily Options', 'emily@example.com', '2023-12-20', '118', '2024-04-16', '0', 'web', 'true', '4', '2.1.1', '2023-12-15', '123', 'active', '30', '41.3', '22'),
            ('A06129', 'David Day Trader', 'david@example.com', '2024-01-01', '106', '2024-04-16', '1', 'mobile', 'true', '5', '2.0.9', '2023-12-28', '110', 'very_active', '29', '35.8', '25')
        `, (err) => {
            if (err) console.error('Error inserting data:', err);
        });

        // 2. Trading Frequency
        console.log('Creating trading_frequency table...');
        conn.run(`
            CREATE TABLE trading_frequency (
                client_id VARCHAR,
                trade_count_1d VARCHAR,
                trade_count_7d VARCHAR,
                trade_count_30d VARCHAR,
                trade_count_90d VARCHAR,
                trade_count_360d VARCHAR,
                active_trading_days_90d VARCHAR,
                trades_per_active_day_90d VARCHAR,
                avg_activity_cluster_duration_minutes_30d VARCHAR,
                avg_http_requests_per_session_30d VARCHAR,
                cluster_bounce_rate_30d VARCHAR,
                weekend_cluster_count_30d VARCHAR,
                primary_activity_hour VARCHAR,
                is_morning_active_flag VARCHAR,
                weekday_concentration_score_90d VARCHAR,
                trade_volume_consistency_score_90d VARCHAR,
                max_trades_per_second_90d VARCHAR,
                primary_trade_day_90d VARCHAR,
                trade_count_by_day_of_week_variance_90d VARCHAR,
                activity_momentum_score VARCHAR
            )
        `, (err) => {
            if (err) console.error('Error creating table:', err);
        });

        conn.run(`
            INSERT INTO trading_frequency VALUES
            ('A05973', '5', '28', '95', '250', '450', '22', '11.4', '35.5', '120', '15.2', '3', '14', 'true', '0.78', '0.82', '2.3', 'Monday', '0.15', '0.85'),
            ('A06064', '3', '18', '62', '180', '320', '18', '10.0', '28.3', '95', '12.1', '2', '10', 'false', '0.72', '0.75', '1.8', 'Tuesday', '0.22', '0.79'),
            ('A06072', '8', '35', '120', '320', '580', '25', '12.8', '42.1', '145', '18.5', '4', '15', 'true', '0.81', '0.88', '3.1', 'Wednesday', '0.18', '0.91'),
            ('A06073', '2', '12', '45', '140', '250', '15', '9.3', '22.6', '78', '10.2', '1', '9', 'false', '0.65', '0.68', '1.2', 'Thursday', '0.31', '0.72'),
            ('A06129', '12', '62', '210', '580', '950', '28', '20.7', '55.3', '200', '22.5', '6', '16', 'true', '0.92', '0.95', '4.5', 'Friday', '0.12', '0.96')
        `, (err) => {
            if (err) console.error('Error inserting data:', err);
        });

        // 3. Financial Volume
        console.log('Creating financial_volume table...');
        conn.run(`
            CREATE TABLE financial_volume (
                client_id VARCHAR,
                total_volume_1d VARCHAR,
                total_volume_7d VARCHAR,
                total_volume_30d VARCHAR,
                total_volume_90d VARCHAR,
                avg_trade_size_90d VARCHAR,
                total_deposit_amount_all_time VARCHAR,
                net_deposit_flow_90d VARCHAR,
                net_deposit_value_all_time VARCHAR,
                deposit_frequency_90d VARCHAR,
                avg_margin_utilization_pct_30d VARCHAR,
                days_since_first_withdrawal VARCHAR
            )
        `, (err) => {
            if (err) console.error('Error creating table:', err);
        });

        conn.run(`
            INSERT INTO financial_volume VALUES
            ('A05973', '125000', '720000', '2400000', '6500000', '26000', '50000', '15000', '95000', '8', '35.2', '45'),
            ('A06064', '85000', '480000', '1600000', '4200000', '23333', '35000', '8000', '52000', '5', '28.5', '50'),
            ('A06072', '200000', '980000', '3200000', '8500000', '26562', '75000', '25000', '130000', '12', '42.1', '38'),
            ('A06073', '45000', '320000', '1200000', '3100000', '22142', '25000', '5000', '38000', '3', '18.5', '60'),
            ('A06129', '380000', '1820000', '5800000', '15200000', '26206', '150000', '45000', '285000', '18', '55.3', '30')
        `, (err) => {
            if (err) console.error('Error inserting data:', err);
        });

        // 4. Behavioral Style
        console.log('Creating behavioral_style table...');
        conn.run(`
            CREATE TABLE behavioral_style (
                client_id VARCHAR,
                avg_holding_duration_all_time VARCHAR,
                order_cancellation_rate_30d VARCHAR,
                order_modification_rate_30d VARCHAR,
                buy_to_sell_ratio_30d VARCHAR,
                distinct_symbols_traded_90d VARCHAR,
                win_rate_90d VARCHAR,
                profit_factor_90d VARCHAR,
                platform_logins_30d VARCHAR,
                funds_check_count_30d VARCHAR,
                portfolio_click_count_30d VARCHAR,
                orders_page_view_count_30d VARCHAR,
                dashboard_pins_view_count_30d VARCHAR,
                order_to_trade_ratio_30d VARCHAR,
                is_options_trader_flag VARCHAR,
                order_modification_pre_execution_rate_30d VARCHAR,
                stop_loss_usage_rate_90d VARCHAR,
                intraday_vs_delivery_ratio_90d VARCHAR,
                order_chasing_rate_30d VARCHAR,
                primary_order_type VARCHAR,
                median_time_between_trades_90d VARCHAR,
                is_holding_overnight_positions_flag VARCHAR
            )
        `, (err) => {
            if (err) console.error('Error creating table:', err);
        });

        conn.run(`
            INSERT INTO behavioral_style VALUES
            ('A05973', '2.5 hours', '8.5', '12.3', '1.2', '15', '52.3', '1.45', '28', '12', '45', '38', '8', '1.05', 'false', '10.2', '35.5', '0.65', '5.2', 'limit', '45 minutes', 'true'),
            ('A06064', '1.8 hours', '6.2', '9.1', '1.1', '12', '48.9', '1.32', '25', '8', '32', '28', '5', '1.02', 'false', '7.5', '28.3', '0.72', '3.8', 'market', '52 minutes', 'false'),
            ('A06072', '3.2 hours', '11.5', '15.8', '1.35', '22', '55.6', '1.62', '30', '18', '62', '52', '12', '1.08', 'true', '13.5', '42.1', '0.58', '7.5', 'limit', '38 minutes', 'true'),
            ('A06073', '1.2 hours', '5.1', '7.3', '0.95', '8', '45.2', '1.18', '20', '5', '22', '18', '3', '0.98', 'true', '5.8', '22.6', '0.85', '2.5', 'market', '65 minutes', 'false'),
            ('A06129', '4.5 hours', '15.2', '22.5', '1.55', '35', '58.9', '1.78', '30', '25', '95', '78', '18', '1.12', 'true', '18.5', '55.3', '0.45', '10.2', 'limit', '32 minutes', 'true')
        `, (err) => {
            if (err) console.error('Error inserting data:', err);
        });

        // 5. Risk Profile
        console.log('Creating risk_profile table...');
        conn.run(`
            CREATE TABLE risk_profile (
                client_id VARCHAR,
                pnl_1d VARCHAR,
                pnl_7d VARCHAR,
                pnl_30d VARCHAR,
                pnl_90d VARCHAR,
                preferred_asset_class VARCHAR,
                pnl_360d VARCHAR,
                total_pnl_90d VARCHAR,
                user_rank_by_pnl_90d VARCHAR,
                pnl_percentile_90d VARCHAR,
                max_single_day_loss_90d VARCHAR,
                pnl_volatility_90d VARCHAR,
                large_loss_day_count_90d VARCHAR,
                max_pnl_drawdown_90d VARCHAR,
                post_large_loss_behavior_change_flag VARCHAR,
                is_concentrated_trader_flag VARCHAR,
                trade_concentration_index_90d VARCHAR,
                lifetime_distinct_symbols_traded VARCHAR
            )
        `, (err) => {
            if (err) console.error('Error creating table:', err);
        });

        conn.run(`
            INSERT INTO risk_profile VALUES
            ('A05973', '2500', '18000', '52000', '125000', 'equities', '185000', '125000', '245', '75', '-8500', '12.5', '2', '15000', 'false', 'false', '0.35', '45'),
            ('A06064', '1200', '8500', '28000', '68000', 'equities', '95000', '68000', '385', '62', '-5200', '10.2', '1', '8500', 'false', 'false', '0.28', '35'),
            ('A06072', '5800', '35000', '98000', '250000', 'options', '385000', '250000', '85', '92', '-15000', '18.5', '3', '35000', 'true', 'true', '0.62', '82'),
            ('A06073', '-1500', '2000', '-5000', '12000', 'equities', '18000', '12000', '452', '48', '-3200', '8.5', '1', '-5500', 'false', 'false', '0.15', '22'),
            ('A06129', '15000', '85000', '280000', '620000', 'derivatives', '950000', '620000', '8', '98', '-25000', '22.5', '4', '85000', 'true', 'true', '0.78', '125')
        `, (err) => {
            if (err) console.error('Error inserting data:', err);
        });

        // 6. Platform Health
        console.log('Creating platform_health table...');
        conn.run(`
            CREATE TABLE platform_health (
                client_id VARCHAR,
                total_session_expirations_30d VARCHAR,
                most_traded_instrument_by_volume_30d VARCHAR,
                instrument_with_largest_trader_increase VARCHAR,
                client_error_rate_30d VARCHAR,
                avg_api_response_time_ms_30d VARCHAR,
                avg_time_to_fill_seconds_30d VARCHAR,
                error_to_trade_ratio_30d VARCHAR,
                avg_time_to_load_dashboard_ms VARCHAR,
                order_rejection_rate_30d VARCHAR,
                orders_not_traded_ratio_30d VARCHAR,
                avg_order_life_to_cancel_minutes VARCHAR,
                avg_trade_fill_ratio_90d VARCHAR,
                is_high_volume_cancelled_flag VARCHAR
            )
        `, (err) => {
            if (err) console.error('Error creating table:', err);
        });

        conn.run(`
            INSERT INTO platform_health VALUES
            ('A05973', '2', 'INFY', 'TCS', '0.5', '125', '2.3', '0.008', '450', '1.2', '5.5', '8.5', '0.95', 'false'),
            ('A06064', '1', 'RELIANCE', 'HDFC', '0.3', '98', '1.8', '0.005', '380', '0.8', '3.2', '6.2', '0.96', 'false'),
            ('A06072', '3', 'NIFTY', 'BANKNIFTY', '0.8', '156', '3.5', '0.012', '520', '2.1', '8.5', '12.5', '0.92', 'true'),
            ('A06073', '0', 'TCS', 'INFY', '0.2', '75', '1.2', '0.003', '320', '0.5', '2.1', '4.5', '0.98', 'false'),
            ('A06129', '4', 'BANKNIFTY', 'NIFTY', '1.2', '185', '4.8', '0.018', '580', '3.2', '12.5', '15.8', '0.88', 'true')
        `, (err) => {
            if (err) console.error('Error inserting data:', err);
        });

        // 7. Market Health
        console.log('Creating market_health table...');
        conn.run(`
            CREATE TABLE market_health (
                client_id VARCHAR,
                most_cancelled_instrument_30d VARCHAR,
                most_profitable_instrument_all_users_90d VARCHAR
            )
        `, (err) => {
            if (err) console.error('Error creating table:', err);
        });

        conn.run(`
            INSERT INTO market_health VALUES
            ('A05973', 'SBIN', 'INFY'),
            ('A06064', 'MARUTI', 'TCS'),
            ('A06072', 'BAJAJ', 'RELIANCE'),
            ('A06073', 'WIPRO', 'HDFC'),
            ('A06129', 'LT', 'NIFTY-FUTURES')
        `, (err) => {
            if (err) console.error('Error inserting data:', err);
        });

        console.log('\n✅ Sample data created successfully!');
        console.log('\nTables created:');
        console.log('  - identity_and_lifecycle');
        console.log('  - trading_frequency');
        console.log('  - financial_volume');
        console.log('  - behavioral_style');
        console.log('  - risk_profile');
        console.log('  - platform_health');
        console.log('  - market_health');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        conn.close();
        db.close(() => {
            console.log('\nDatabase closed.');
        });
    }
}

main();
