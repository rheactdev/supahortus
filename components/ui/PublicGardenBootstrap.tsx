"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { redeemPublicGardenLink } from "@/lib/public-actions";

export function PublicGardenBootstrap({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function connect() {
      try {
        const supabase = createClient();
        const { data: sessionData } = await supabase.auth.getSession();

        if (!sessionData.session) {
          const { error: signInError } =
            await supabase.auth.signInAnonymously();
          if (signInError) throw signInError;
        }

        await redeemPublicGardenLink(token);
        if (active) router.refresh();
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not open this public garden",
          );
        }
      }
    }

    connect();
    return () => {
      active = false;
    };
  }, [router, token]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        {error ? (
          <>
            <h1 className="text-xl font-bold">Unable to open garden</h1>
            <p className="text-sm text-error mt-2">{error}</p>
          </>
        ) : (
          <>
            <span className="loading loading-ring loading-lg text-primary" />
            <p className="text-sm text-base-content/60 mt-3">
              Opening public garden...
            </p>
          </>
        )}
      </div>
    </div>
  );
}
