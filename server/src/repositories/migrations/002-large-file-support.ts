import { Database } from 'sqlite3';

/**
 * Migration to add large file support
 */
export const migration002 = {
  id: '002-large-file-support',
  description: 'Add is_large_file column to content_metadata table',
  
  up: async (db: Database): Promise<void> => {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        // Add is_large_file column with default value FALSE
        db.run(`
          ALTER TABLE content_metadata 
          ADD COLUMN is_large_file BOOLEAN DEFAULT FALSE;
        `, (err) => {
          if (err) {
            reject(err);
            return;
          }
        });
        
        // Create index for better query performance
        db.run(`
          CREATE INDEX IF NOT EXISTS idx_content_metadata_large_file 
          ON content_metadata(is_large_file);
        `, (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    });
  },
  
  down: async (db: Database): Promise<void> => {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        // Drop index first
        db.run(`
          DROP INDEX IF EXISTS idx_content_metadata_large_file;
        `, (err) => {
          if (err) {
            reject(err);
            return;
          }
        });
        
        // Note: SQLite doesn't support DROP COLUMN directly
        // In a real migration, we would need to recreate the table
        // For now, we'll leave the column as it doesn't hurt
        resolve();
      });
    });
  }
};