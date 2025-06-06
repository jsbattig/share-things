const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data/sessions/metadata.db');
console.log('Checking database schema at:', dbPath);

try {
  const db = new Database(dbPath);
  
  // Get schema for content table
  const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='content'").get();
  console.log('\nContent table schema:');
  console.log(schema ? schema.sql : 'Table not found');
  
  // Get all tables
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('\nAll tables:');
  tables.forEach(table => console.log('-', table.name));
  
  // Check if content table has the required columns
  const columns = db.prepare("PRAGMA table_info(content)").all();
  console.log('\nContent table columns:');
  columns.forEach(col => console.log(`- ${col.name}: ${col.type} (nullable: ${!col.notnull}, default: ${col.dflt_value})`));
  
  // Check for specific columns
  const hasPinnedColumn = columns.some(col => col.name === 'is_pinned');
  const hasLargeFileColumn = columns.some(col => col.name === 'is_large_file');
  
  console.log('\nColumn check:');
  console.log('- is_pinned column:', hasPinnedColumn ? '✓ EXISTS' : '✗ MISSING');
  console.log('- is_large_file column:', hasLargeFileColumn ? '✓ EXISTS' : '✗ MISSING');
  
  db.close();
} catch (error) {
  console.error('Error checking database:', error.message);
}