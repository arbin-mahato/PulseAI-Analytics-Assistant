import axios from 'axios';
import { Readable } from 'stream';
import { parse } from 'csv-parse';

// --- Reusable ClickHouse Fetcher ---
export async function fetchFromClickHouse(query, targetUsers) {
    const CLICKHOUSE_HOST = process.env.CLICKHOUSE_HOST;
    const CLICKHOUSE_USER = process.env.CLICKHOUSE_USER;
    const CLICKHOUSE_PASSWORD = process.env.CLICKHOUSE_PASSWORD;
    const CLICKHOUSE_DB = process.env.CLICKHOUSE_DB;

    // A simple way to get a readable name for logging
    const queryName = query.split('\n')[1].replace('-- FILE:', '').trim();
    console.log(`Executing query for: ${queryName}`);

    const params = { database: CLICKHOUSE_DB, param_user_list: targetUsers.join(',') };
    const finalQuery = query.replace('{user_list:Array(String)}', `(splitByString(',', {user_list:String}))`) + " FORMAT CSVWithNames";

    try {
        const response = await axios.post(CLICKHOUSE_HOST, finalQuery, {
            params: params,
            headers: { 'X-ClickHouse-User': CLICKHOUSE_USER, 'X-ClickHouse-Key': CLICKHOUSE_PASSWORD },
            timeout: 180000 
        });
        return await parseCsv(response.data);
    } catch (error) {
        console.error("Error connecting to or querying ClickHouse:", error.message);
        if (error.response) console.error("Response Body:", error.response.data);
        return null;
    }
}

// --- Reusable CSV Parser ---
async function parseCsv(csvData) {
    return new Promise((resolve, reject) => {
        const records = [];
        const parser = parse({ columns: true, skip_empty_lines: true, cast: true });
        parser.on('readable', () => { let record; while ((record = parser.read()) !== null) { records.push(record); }});
        parser.on('error', (err) => reject(err));
        parser.on('end', () => resolve(records));
        Readable.from(csvData).pipe(parser);
    });
}

// --- Reusable DuckDB Writer ---
export async function writeToDuckDB(db, tableName, columns, data) {
    if (!data) {
        console.log(` - No data returned for '${tableName}' due to fetch error. Skipping.`);
        return;
    }
    
    const conn = db.connect();
    
    try {
        // Drop and create table
        await new Promise((resolve, reject) => {
            conn.run(`DROP TABLE IF EXISTS ${tableName}`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        const columnsSql = columns.map(c => `${c} VARCHAR`).join(', ');
        await new Promise((resolve, reject) => {
            conn.run(`CREATE TABLE ${tableName} (${columnsSql})`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        if (data.length === 0) {
            console.log(`  - Created empty table '${tableName}' as no data was returned.`);
            return;
        }
        
        // Insert data using prepared statements
        const placeholders = columns.map(() => '?').join(', ');
        const insertSql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
        
        // Prepare the statement
        const stmt = conn.prepare(insertSql);
        
        const batchSize = 100;
        for (let i = 0; i < data.length; i += batchSize) {
            const batch = data.slice(i, i + batchSize);
            
            for (const record of batch) {
                const values = columns.map(col => {
                    const val = record[col];
                    return val === null || val === undefined ? null : String(val);
                });
                
                // Execute the prepared statement with parameters
                stmt.run(...values);
            }
        }
        
        console.log(`  - Table '${tableName}' created successfully with ${data.length} rows.`);
    } finally {
        conn.close();
    }
}