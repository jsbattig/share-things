const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'build/config/data/sessions.db');

console.log('Opening database at:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    return;
  }
  console.log('Connected to SQLite database.');
});

// Check sessions table
db.all("SELECT * FROM sessions WHERE session_name = 'test'", [], (err, rows) => {
  if (err) {
    console.error('Error querying sessions:', err.message);
    return;
  }
  console.log('\n=== SESSIONS TABLE ===');
  console.log('Sessions found:', rows.length);
  rows.forEach((row, index) => {
    console.log(`\nSession ${index + 1}:`);
    console.log('ID:', row.id);
    console.log('Session Name:', row.session_name);
    console.log('Username:', row.username);
    console.log('Passphrase Hash:', row.passphrase_hash);
    console.log('Salt:', row.salt);
    console.log('Created At:', row.created_at);
    console.log('Last Access:', row.last_access);
  });
});

// Check content table
db.all("SELECT * FROM content", [], (err, rows) => {
  if (err) {
    console.error('Error querying content:', err.message);
    return;
  }
  console.log('\n=== CONTENT TABLE ===');
  console.log('Content items found:', rows.length);
  rows.forEach((row, index) => {
    console.log(`\nContent ${index + 1}:`);
    console.log('ID:', row.id);
    console.log('Session ID:', row.session_id);
    console.log('Title:', row.title);
    console.log('Type:', row.type);
    console.log('Size:', row.size);
    console.log('Chunk Count:', row.chunk_count);
    console.log('Created At:', row.created_at);
    console.log('Updated At:', row.updated_at);
  });
  
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
    } else {
      console.log('\nDatabase connection closed.');
    }
  });
});