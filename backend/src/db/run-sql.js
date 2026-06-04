const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../config/env');

async function ensureDatabase() {
  const connection = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    multipleStatements: true,
  });

  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${env.db.database}\``);
  await connection.end();
}

async function run() {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error('Usage: node backend/src/db/run-sql.js <file.sql>');
  }

  await ensureDatabase();

  const absolutePath = path.resolve(process.cwd(), filePath);
  const sql = fs.readFileSync(absolutePath, 'utf8');
  const statements = sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
  const connection = await mysql.createConnection({
    ...env.db,
    multipleStatements: true,
  });

  try {
    for (const statement of statements) {
      try {
        await connection.query(statement);
      } catch (error) {
        if (['ER_FK_DUP_NAME', 'ER_DUP_KEYNAME', 'ER_DUP_FIELDNAME'].includes(error.code)) {
          console.warn(`Skipped duplicate schema object while running ${filePath}: ${error.message}`);
          continue;
        }
        throw error;
      }
    }
    console.log(`Executed ${filePath}`);
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
