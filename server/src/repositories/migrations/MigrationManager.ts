// This file is kept for compatibility but migrations are now handled directly in SQLiteSessionRepository
import { Database } from 'sqlite3';

/**
 * Migration interface
 */
export interface Migration {
  version: number;
  description: string;
  up: (db: Database) => void;
}

/**
 * Migration manager
 */
export class MigrationManager {
  /**
   * Creates a new migration manager
   * @param db Database instance
   * @param migrations Migrations to apply
   */
  constructor(private db: Database, private migrations: Migration[]) {}

  /**
   * Migrates the database to the latest version
   */
  migrateToLatest(): void {
    // Migrations are now handled directly in SQLiteSessionRepository
    console.log('Migrations are now handled directly in SQLiteSessionRepository');
  }
}