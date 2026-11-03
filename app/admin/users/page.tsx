import { Suspense } from "react";
import { getAdminUserId, userIsAdmin } from "@/lib/admin-access";
import { RouteLoading } from "@/components/ui/RouteLoading";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DeleteUserButton } from "./DeleteUserButton";

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<RouteLoading label="Loading users" />}>
      <AdminUsers />
    </Suspense>
  );
}

async function AdminUsers() {
  const adminUserId = await getAdminUserId();
  if (!adminUserId) redirect("/my-gardens");
  const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
  const users = usersData?.users ?? [];

  return (
    <div className="w-full h-full flex flex-col">
      <div className="overflow-x-auto rounded-lg border border-base-content/5">
        <table className="table">
          <thead>
            <tr className="bg-base-200/50">
              <th>Account</th>
              <th>Created</th>
              <th>Last Sign In</th>
              <th>Provider</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const contact = user.email?.trim() || user.phone?.trim();
              const accountLabel = user.is_anonymous ? "Anonymous user" : contact || "Unknown user";
              const accountReference = user.is_anonymous || !contact ? user.id.slice(0, 8) : null;
              const deleteLabel = accountReference ? `${accountLabel} (${accountReference})` : accountLabel;
              const provider = user.is_anonymous
                ? "Anonymous"
                : user.app_metadata?.provider || (user.email ? "email" : user.phone ? "phone" : "Unknown");

              return (
                <tr key={user.id} className="hover:bg-base-200/30">
                  <td>
                    <div className="flex items-center gap-2">
                      <div aria-hidden="true" className="avatar avatar-placeholder shrink-0">
                        <div className="w-8 rounded-full bg-base-300 text-base-content">
                          <span className="text-xs">
                            {user.is_anonymous ? "A" : contact?.charAt(0).toUpperCase() || "?"}
                          </span>
                        </div>
                      </div>
                      <div>
                        <div className="font-medium text-sm">{accountLabel}</div>
                        {accountReference && (
                          <div className="font-mono text-xs text-base-content/70">{accountReference}</div>
                        )}
                      </div>
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
                      {provider}
                    </span>
                  </td>
                  <td className="text-right">
                    {user.id !== adminUserId && !userIsAdmin(user) && (
                      <DeleteUserButton userId={user.id} label={deleteLabel} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
