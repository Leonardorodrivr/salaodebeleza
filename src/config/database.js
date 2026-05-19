const { Pool } = require('pg');
const dns = require('dns');
require('dotenv').config();

dns.setDefaultResultOrder('ipv4first');

console.log('🔌 Iniciando conexão com Supabase (IPv4)...');

const pool = new Pool({
  host: 'db.euktrbwrgzigwlvqlzma.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
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
    console.log('✅ Conectado ao Supabase!');
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