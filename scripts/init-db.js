import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'sqlite.db');
const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');

console.log('Initializing database at:', dbPath);

const db = new Database(dbPath);

try {
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);
  console.log('Database initialized successfully with schema.');
} catch (error) {
  console.error('Failed to initialize database:', error);
  process.exit(1);
} finally {
  db.close();
}
