"use client";

import { signOut } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  const logout = async () => {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          router.refresh();
          router.push("/auth/login");
        },
      },
    });
    router.refresh();
    router.push("/auth/login");
  };

  return <button onClick={logout}>Logout</button>;
}
