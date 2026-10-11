const fs = require('node:fs/promises');
const path = require('node:path');
const mysql = require('mysql2/promise');
const config = require('../src/config');

async function migrate() {
  const directory = path.resolve(__dirname, '../../database/migrations');
  const files = (await fs.readdir(directory))
    .filter((file) => /^\d+_[a-z0-9_-]+\.sql$/i.test(file))
    .sort();
  const pool = mysql.createPool({
    ...config.database,
    ...config.migrationDatabase,
    waitForConnections: true,
    connectionLimit: 1,
    charset: 'utf8mb4'
  });
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.execute(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    for (const filename of files) {
      const [existing] = await connection.execute(
        'SELECT filename FROM schema_migrations WHERE filename = ?',
        [filename]
      );
      if (existing.length) continue;

      if (filename === '001_create_users.sql') {
        const [userTable] = await connection.execute(
          `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE
           FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'`,
          [config.database.database]
        );
        if (userTable.length) {
          const columns = new Map(userTable.map((column) => [column.COLUMN_NAME, column]));
          const required = ['id', 'name', 'email', 'password', 'role'];
          const missing = required.filter((column) => !columns.has(column));
          if (missing.length || columns.get('id').DATA_TYPE !== 'int' ||
              !columns.get('id').COLUMN_TYPE.includes('unsigned')) {
            throw new Error(`Existing users table is incompatible; missing or invalid columns: ${missing.join(', ') || 'id must be INT UNSIGNED'}`);
          }
          const [emailIndexes] = await connection.execute(
            `SELECT INDEX_NAME FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email'
               AND NON_UNIQUE = 0 AND SEQ_IN_INDEX = 1 LIMIT 1`,
            [config.database.database]
          );
          if (!emailIndexes.length) {
            throw new Error('Existing users table must have a unique index on email');
          }
          await connection.execute('INSERT INTO schema_migrations (filename) VALUES (?)', [filename]);
          console.log('Recorded compatible existing users table for 001_create_users.sql');
          continue;
        }
      }

      const sql = await fs.readFile(path.join(directory, filename), 'utf8');
      const statements = sql.split(/;\s*(?:\r?\n|$)/).map((statement) => statement.trim()).filter(Boolean);
      for (const statement of statements) {
        await connection.query(statement);
      }
      await connection.execute('INSERT INTO schema_migrations (filename) VALUES (?)', [filename]);
      console.log(`Applied ${filename}`);
    }
  } finally {
    connection?.release();
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error('Database migration failed:', error.message);
  process.exitCode = 1;
});
