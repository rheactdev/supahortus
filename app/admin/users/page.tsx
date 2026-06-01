import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import db from "@/db";

export default async function AdminUsersPage() {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  if (!session?.user || session.user.role !== 'admin') return redirect("/auth/login");

  const stmt = db.prepare(`SELECT id, name, email, emailVerified, image, createdAt, updatedAt FROM user`);
  const users = stmt.all() as any[];

  return (
    <div className="w-full h-full flex flex-col">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Users</h1>
        <p className="text-base-content/60 mt-1">
          {users.length} registered user{users.length !== 1 && "s"}.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-base-content/5">
        <table className="table">
          <thead>
            <tr className="bg-base-200/50">
              <th>Email</th>
              <th>Created</th>
              <th>Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-base-200/30">
                <td>
                  <div className="flex items-center gap-2">
                    <div className="avatar placeholder">
                      <div className="bg-neutral text-neutral-content w-8 rounded-full">
                        <span className="text-xs">
                          {(user.email ?? "?").charAt(0).toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <span className="font-medium text-sm">{user.email}</span>
                  </div>
                </td>
                <td className="text-sm text-base-content/60">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td className="text-sm text-base-content/60">
                  {new Date(user.updatedAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
