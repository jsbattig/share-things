// This script sets up the PostgreSQL database for tests
const { Pool } = require('pg');

async function setupTestDatabase() {
  const pool = new Pool({
    host: process.env.PG_HOST || 'postgres-test',
    port: parseInt(process.env.PG_PORT || '5432', 10),
    database: process.env.PG_DATABASE || 'sharethings_test',
    user: process.env.PG_USER || 'postgres_test',
    password: process.env.PG_PASSWORD || 'postgres_test'
  });

  try {
    // Connect to database
    const client = await pool.connect();
    
    try {
      console.log('Connected to PostgreSQL test database');
      
      // Clean up existing tables
      await client.query('DROP TABLE IF EXISTS session_tokens CASCADE');
      await client.query('DROP TABLE IF EXISTS clients CASCADE');
      await client.query('DROP TABLE IF EXISTS sessions CASCADE');
      await client.query('DROP TABLE IF EXISTS schema_version CASCADE');
      
      console.log('Test database prepared successfully');
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error setting up test database:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setupTestDatabase();
