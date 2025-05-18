// This file is kept for compatibility but migrations are now handled directly in SQLiteSessionRepository
import { Database } from 'sqlite3';
import { Migration } from './MigrationManager';

/**
 * Initial schema migration
 */
export const initialSchemaMigration: Migration = {
  version: 1,
  description: 'Initial schema with sessions table',
  up: (db: Database): void => {
    // Migrations are now handled directly in SQLiteSessionRepository
    console.log('Migrations are now handled directly in SQLiteSessionRepository');
  }
};