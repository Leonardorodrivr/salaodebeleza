const { Pool } = require('pg');
require('dotenv').config();

console.log('Conectando ao Supabase...');

const configs = [
  { host: 'aws-0-sa-east-1.pooler.supabase.com', port: 6543, user: 'postgres.euktrbwrgzigwlvqlzma' },
  { host: 'aws-1-sa-east-1.pooler.supabase.com', port: 6543, user: 'postgres.euktrbwrgzigwlvqlzma' },
  { host: 'aws-0-sa-east-1.pooler.supabase.com', port: 5432, user: 'postgres.euktrbwrgzigwlvqlzma' },
  { host: 'aws-1-sa-east-1.pooler.supabase.com', port: 5432, user: 'postgres.euktrbwrgzigwlvqlzma' },
];

let pool;

async function iniciarConexao() {
  for (const config of configs) {
    try {
      console.log(`Tentando ${config.host}:${config.port}...`);
      const p = new Pool({
        host: config.host, port: config.port,
        database: 'postgres', user: config.user,
        password: process.env.DB_PASSWORD,
        max: 5, idleTimeoutMillis: 60000,
        connectionTimeoutMillis: 10000,
        ssl: { rejectUnauthorized: false },
      });
      const client = await p.connect();
      client.release();
      pool = p;
      console.log(`Conectado! ${config.host}:${config.port}`);
      return;
    } catch (err) {
      console.log(`Falhou: ${err.message}`);
    }
  }
  console.error('Nenhuma configuracao funcionou!');
}

iniciarConexao();

const query = async (text, params) => {
  try {
    return await pool.query(text, params);
  } catch (error) {
    console.error('Erro query:', error.message);
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

module.exports = { query, transaction };