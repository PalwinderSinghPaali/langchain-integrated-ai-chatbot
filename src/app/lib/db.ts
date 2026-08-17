 import { Pool } from 'pg';
import { DataAPIClient } from '@datastax/astra-db-ts';

// PostgreSQL connection
const pgPool = new Pool({
  user: process.env.NEXT_PUBLIC_PG_USER,
  host: process.env.NEXT_PUBLIC_PG_HOST,
  database: process.env.NEXT_PUBLIC_PG_DATABASE,
  password: process.env.NEXT_PUBLIC_PG_PASSWORD,
  port: Number(process.env.NEXT_PUBLIC_PG_PORT),
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Initialize vector extension
async function initVectorExtension() {
  const client = await pgPool.connect();
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
  } catch (error) {
    console.error('Error initializing vector extension:', error);
  } finally {
    client.release();
  }
}

// Initialize tables
async function initTables() {
  const client = await pgPool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS document_chunks (
        id SERIAL PRIMARY KEY,
        document_name TEXT NOT NULL,
        chunk_text TEXT NOT NULL,
        embedding VECTOR(3072),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_document_name ON document_chunks(document_name);
      CREATE INDEX IF NOT EXISTS idx_chunk_embedding ON document_chunks USING ivfflat (embedding vector_cosine_ops);
    `);
  } catch (error) {
    console.error('Error initializing tables:', error);
  } finally {
    client.release();
  }
}

// Initialize database
initVectorExtension().then(initTables).catch(console.error);

// Astra DB (if needed)
const astraClient = new DataAPIClient(process.env.ASTRA_TOKEN!);
const astraDb = astraClient.db(process.env.ASTRA_DB_ENDPOINT!);

export { pgPool, astraDb };
