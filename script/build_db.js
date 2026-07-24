import duckdb from 'duckdb';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { fetchFromClickHouse, writeToDuckDB } from './utils.js';

// Load .env.local first, then .env
dotenv.config({ path: '.env.local' });
dotenv.config();

// =================================================================
// METRIC STORE V2 - Main Orchestrator (Final Clean Version)
// =================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FOLDER = path.join(__dirname, '..', 'db');
if (!fs.existsSync(DB_FOLDER)) {
    fs.mkdirSync(DB_FOLDER, { recursive: true });
}
const DUCKDB_PATH = path.join(DB_FOLDER, process.env.DUCKDB_NAME || 'metric_store.duckdb');

const TARGET_USERS = [ 'A05973','A06064','A06072','A06073','A06129','A06133','A06164','A06220','A06272','A06404','A06430','A06478','A06709','A06785','A07030','A07377','A08029','A08105','A08375','A08385','A08661','A08672','A09544','A09756','A09821','A09834','A09947','A10032','A10586','A10720','A11018','A11211','A11572','A11625','A12456','A12470','A12525','A12658','A12794','A12816','A12871','A13233','A13973','A14084','A14260','A14277','A14512','A15376','A15448','A15649','A15679','A15778','A16130','A16132','A16224','A16261','A16296','A16380','A16447','A16698','A16720','A16804','A16850','A17011','A17054','A17065','A17066','A17074','B06244','B07348','B09257','B10717','B12241','B13383','B14294','B14349','B14389','B14405','B14554','B15633','B16691','B17033','C06059','C06163','C06555','C07168','C07384','C09689','C12401','C12630','C13955','C14691','C14807','C15170','C15462','C15928','C16159','C16316','C16317','D06112','D06113','D06114','D06115','D06116','D06294','D06395','D07032','D07230','D07321','D07452','D07931','D08504','D08511','D09270','D10851','D12487','D12723','D12824','D12825','D12989','D13012','D13785','D14179','D14257','D15531','D15829','D15972','D17058','F13408','G06494','G06985','G07830','G09520','G09922','G13064','G13560','G14336','G14523','G15358','G15609','G15955','G16217','G16315','G16453','G16593','H08501','H08555','H10036','H10543','H10573','H13269','H13897','H13937','H13992','H14033','H14659','H15128','H15815','H16029','H16831','H16936','H17017','H17085','I06542','I06945','I07522','I12585','I12855','I14745','I14845','I14954','J06200','J06705','J06733','J06759','J06825','J07514','J09601','J10255','J10319','J12462','J13028','J13081','J13237','J13348','J14825','J14990','J16365','J16551','J16895','J17089','K06410','K06637','K07352','K07623','K07672','K07776','K07836','K08741','K09129' ];

const TABLE_DEFINITIONS = {
    identity_and_lifecycle: {
        cols: [ 'client_id', 'name', 'email', 'first_trade_date', 'days_since_first_trade', 'last_calculated_at', 'days_since_last_seen', 'primary_platform_30d', 'is_multi_platform_user_30d', 'unique_ip_count_30d', 'latest_app_version_used', 'signup_date', 'account_age_days', 'activation_status', 'active_days_30d', 'avg_time_since_last_activity_per_login', 'distinct_login_ids_90d' ],
        queryFile: '1_identity_and_lifecycle.sql'
    },
    trading_frequency: {
        cols: [ 'client_id', 'trade_count_1d', 'trade_count_7d', 'trade_count_30d', 'trade_count_90d', 'trade_count_360d', 'active_trading_days_90d', 'trades_per_active_day_90d', 'avg_activity_cluster_duration_minutes_30d', 'avg_http_requests_per_session_30d', 'cluster_bounce_rate_30d', 'weekend_cluster_count_30d', 'primary_activity_hour', 'is_morning_active_flag', 'weekday_concentration_score_90d', 'trade_volume_consistency_score_90d', 'max_trades_per_second_90d', 'primary_trade_day_90d', 'trade_count_by_day_of_week_variance_90d', 'activity_momentum_score' ],
        queryFile: '2_trading_frequency.sql'
    },
    financial_volume: {
        cols: [ 'client_id', 'total_volume_1d', 'total_volume_7d', 'total_volume_30d', 'total_volume_90d', 'avg_trade_size_90d', 'total_deposit_amount_all_time', 'net_deposit_flow_90d', 'net_deposit_value_all_time', 'deposit_frequency_90d', 'avg_margin_utilization_pct_30d', 'days_since_first_withdrawal' ],
        queryFile: '3_financial_volume.sql'
    },
    behavioral_style: {
        cols: [ 'client_id', 'avg_holding_duration_all_time', 'order_cancellation_rate_30d', 'order_modification_rate_30d', 'buy_to_sell_ratio_30d', 'distinct_symbols_traded_90d', 'win_rate_90d', 'profit_factor_90d', 'platform_logins_30d', 'funds_check_count_30d', 'portfolio_click_count_30d', 'orders_page_view_count_30d', 'dashboard_pins_view_count_30d', 'order_to_trade_ratio_30d', 'is_options_trader_flag', 'order_modification_pre_execution_rate_30d', 'stop_loss_usage_rate_90d', 'intraday_vs_delivery_ratio_90d', 'order_chasing_rate_30d', 'primary_order_type', 'median_time_between_trades_90d', 'is_holding_overnight_positions_flag' ],
        queryFile: '4_behavioral_style.sql'
    },
    risk_profile: {
        cols: [ 'client_id', 'pnl_1d', 'pnl_7d', 'pnl_30d', 'pnl_90d', 'preferred_asset_class', 'pnl_360d', 'total_pnl_90d', 'user_rank_by_pnl_90d', 'pnl_percentile_90d', 'max_single_day_loss_90d', 'pnl_volatility_90d', 'large_loss_day_count_90d', 'max_pnl_drawdown_90d', 'post_large_loss_behavior_change_flag', 'is_concentrated_trader_flag', 'trade_concentration_index_90d', 'lifetime_distinct_symbols_traded' ],
        queryFile: '5_risk_profile.sql'
    },
    platform_health: {
        cols: [ 'client_id', 'total_session_expirations_30d', 'most_traded_instrument_by_volume_30d', 'instrument_with_largest_trader_increase', 'client_error_rate_30d', 'avg_api_response_time_ms_30d', 'avg_time_to_fill_seconds_30d', 'error_to_trade_ratio_30d', 'avg_time_to_load_dashboard_ms', 'order_rejection_rate_30d', 'orders_not_traded_ratio_30d', 'avg_order_life_to_cancel_minutes', 'avg_trade_fill_ratio_90d', 'is_high_volume_cancelled_flag' ],
        queryFile: '6_platform_health.sql'
    },
    market_health: {
        cols: [ 'client_id', 'most_cancelled_instrument_30d', 'most_profitable_instrument_all_users_90d' ],
        queryFile: '7_market_health.sql'
    }
};

async function main() {
    console.log(`Initializing and creating new database at: ${DUCKDB_PATH}`);
    
    // Remove existing file
    if (fs.existsSync(DUCKDB_PATH)) {
        fs.unlinkSync(DUCKDB_PATH);
    }
    
    const db = new duckdb.Database(DUCKDB_PATH);

    console.log('\nStarting to build tables one by one...');
    for (const [tableName, def] of Object.entries(TABLE_DEFINITIONS)) {
        try {
            const queryPath = path.join(__dirname, 'queries', def.queryFile);
            const query = fs.readFileSync(queryPath, 'utf8');
            const data = await fetchFromClickHouse(query, TARGET_USERS);
            await writeToDuckDB(db, tableName, def.cols, data);
        } catch (error) {
            console.error(`\n❌ Failed to build table '${tableName}'. Error: ${error.message}`);
        }
    }
    
    await new Promise(resolve => {
        db.close(() => {
            console.log('\n✅ All defined tables built successfully.');
            resolve();
        });
    });
}

main();