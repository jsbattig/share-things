/**
 * Script to clean up all content in the database
 * This is useful for testing and debugging
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

async function cleanupAllContent() {
  console.log('Starting cleanup of all content...');
  
  // Path to the database file
  const dbPath = path.join(__dirname, '..', 'data', 'sessions', 'metadata.db');
  
  // Check if the database file exists
  if (!fs.existsSync(dbPath)) {
    console.log(`Database file not found at ${dbPath}`);
    return;
  }
  
  console.log(`Opening database at ${dbPath}`);
  
  try {
    // Open the database
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });
    
    console.log('Database opened successfully');
    
    // Get all content IDs
    const contentRows = await db.all('SELECT content_id FROM content_metadata');
    console.log(`Found ${contentRows.length} content items to remove`);
    
    // Delete all content metadata
    const metadataResult = await db.run('DELETE FROM content_metadata');
    console.log(`Deleted ${metadataResult.changes} rows from content_metadata`);
    
    // Delete all chunk metadata
    const chunkMetadataResult = await db.run('DELETE FROM chunk_metadata');
    console.log(`Deleted ${chunkMetadataResult.changes} rows from chunk_metadata`);
    
    // Close the database
    await db.close();
    console.log('Database closed');
    
    // Delete all chunk files
    const chunksDir = path.join(__dirname, '..', 'data', 'sessions', 'chunks');
    if (fs.existsSync(chunksDir)) {
      // Get all content directories
      const contentDirs = fs.readdirSync(chunksDir);
      console.log(`Found ${contentDirs.length} content directories to remove`);
      
      // Delete each content directory
      for (const contentDir of contentDirs) {
        const contentDirPath = path.join(chunksDir, contentDir);
        if (fs.statSync(contentDirPath).isDirectory()) {
          // Get all chunk files
          const chunkFiles = fs.readdirSync(contentDirPath);
          
          // Delete each chunk file
          for (const chunkFile of chunkFiles) {
            const chunkFilePath = path.join(contentDirPath, chunkFile);
            fs.unlinkSync(chunkFilePath);
          }
          
          // Delete the content directory
          fs.rmdirSync(contentDirPath);
          console.log(`Deleted content directory ${contentDir}`);
        }
      }
    }
    
    console.log('All content has been cleaned up successfully');
  } catch (error) {
    console.error('Error cleaning up content:', error);
  }
}

// Run the cleanup function
cleanupAllContent();