import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) return redirect("/auth/login");

  const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
  const users = usersData?.users ?? [];

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
              <th>Last Sign In</th>
              <th>Provider</th>
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
                  {new Date(user.created_at).toLocaleDateString()}
                </td>
                <td className="text-sm text-base-content/60">
                  {user.last_sign_in_at
                    ? new Date(user.last_sign_in_at).toLocaleDateString()
                    : "Never"}
                </td>
                <td>
                  <span className="badge badge-sm badge-ghost">
                    {user.app_metadata?.provider ?? "email"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
