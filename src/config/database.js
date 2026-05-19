const { Pool } = require('pg');
require('dotenv').config();

console.log('🔌 Conectando ao Supabase via Pooler IPv4...');

const pool = new Pool({
  host: '54.94.90.106',
  port: 6543,
  database: 'postgres',
  user: 'postgres.euktrbwrgzigwlvqlzma',
  password: process.env.DB_PASSWORD || 'Vr!@#7151650',
  max: 5,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 30000,
  ssl: { rejectUnauthorized: false },
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Erro ao conectar:', err.message);
  } else {
    console.log('✅ Conectado ao Supabase com sucesso!');
    release();
  }
});

const query = async (text, params) => {
  try {
    const res = await pool.query(text, params);
    return res;
  } catch (error) {
    console.error('Erro na query:', error.message);
    throw error;
  }
};

const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = { pool, query, transaction };