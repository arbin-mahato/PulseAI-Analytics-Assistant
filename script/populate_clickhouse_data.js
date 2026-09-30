import {spawnSync} from 'node:child_process';import fs from 'node:fs';
const python=process.env.PYTHON_BIN||(fs.existsSync('.venv/bin/python')?'.venv/bin/python':'python3');
const result=spawnSync(python,['script/data/seed_clickhouse.py',...process.argv.slice(2)],{stdio:'inherit'});if(result.error)throw result.error;process.exit(result.status||0);
