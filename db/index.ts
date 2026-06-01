import Database from 'better-sqlite3';
import path from 'path';

// Note: In Next.js, process.cwd() is the root of the project.
const dbPath = path.join(process.cwd(), 'sqlite.db');

export const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Export a helper to run queries safely
export default db;
