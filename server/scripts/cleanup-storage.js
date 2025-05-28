/**
 * Script to clean up storage
 * This script deletes all content from the storage database
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Configuration
const DATA_DIR = path.join(__dirname, '../data/sessions');
const METADATA_DB = path.join(DATA_DIR, 'metadata.db');
const CHUNKS_DIR = path.join(DATA_DIR, 'chunks');

async function cleanupStorage() {
  console.log('Starting storage cleanup...');
  
  // Check if metadata.db exists
  if (fs.existsSync(METADATA_DB)) {
    console.log(`Found metadata database at ${METADATA_DB}`);
    
    // Open the database
    const db = new sqlite3.Database(METADATA_DB);
    
    // Delete all content metadata
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM content_metadata', function(err) {
        if (err) {
          console.error('Error deleting content metadata:', err);
          reject(err);
        } else {
          console.log(`Deleted ${this.changes} content metadata entries`);
          resolve();
        }
      });
    });
    
    // Delete all chunk metadata
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM chunk_metadata', function(err) {
        if (err) {
          console.error('Error deleting chunk metadata:', err);
          reject(err);
        } else {
          console.log(`Deleted ${this.changes} chunk metadata entries`);
          resolve();
        }
      });
    });
    
    // Close the database
    await new Promise((resolve) => {
      db.close(() => {
        console.log('Database closed');
        resolve();
      });
    });
  } else {
    console.log(`Metadata database not found at ${METADATA_DB}`);
  }
  
  // Delete all chunk files
  if (fs.existsSync(CHUNKS_DIR)) {
    console.log(`Found chunks directory at ${CHUNKS_DIR}`);
    
    // Get all content directories
    const contentDirs = fs.readdirSync(CHUNKS_DIR);
    console.log(`Found ${contentDirs.length} content directories`);
    
    // Delete each content directory
    for (const contentDir of contentDirs) {
      const contentDirPath = path.join(CHUNKS_DIR, contentDir);
      
      // Check if it's a directory
      if (fs.statSync(contentDirPath).isDirectory()) {
        // Delete all files in the directory
        const files = fs.readdirSync(contentDirPath);
        for (const file of files) {
          fs.unlinkSync(path.join(contentDirPath, file));
        }
        
        // Delete the directory
        fs.rmdirSync(contentDirPath);
        console.log(`Deleted content directory: ${contentDir}`);
      }
    }
  } else {
    console.log(`Chunks directory not found at ${CHUNKS_DIR}`);
  }
  
  console.log('Storage cleanup completed successfully');
}

// Run the cleanup
cleanupStorage().catch(error => {
  console.error('Error during cleanup:', error);
  process.exit(1);
});