import { betterAuth } from "better-auth";
import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "sqlite.db");
const sqlite = new Database(dbPath);

export const auth = betterAuth({
  database: sqlite,
  emailAndPassword: {
    enabled: true,
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // Check if this is the first user
          const countStmt = sqlite.prepare("SELECT COUNT(*) as count FROM user");
          const result = countStmt.get() as { count: number };
          const isFirstUser = result.count === 0;

          return {
            data: {
              ...user,
              role: isFirstUser ? "admin" : "user",
            }
          };
        }
      }
    }
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
      }
    }
  }
});
