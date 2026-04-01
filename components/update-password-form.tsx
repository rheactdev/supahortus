"use client";


import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function UpdatePasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      router.push("/dashboard");
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`flex flex-col gap-6 ${className ?? ""}`.trim()} {...props}>
      <div className="card bg-base-100 shadow-xl border border-base-content/10">
        <div className="card-body">
          <h2 className="card-title text-2xl justify-center font-bold">Reset Your Password</h2>
          <p className="text-center text-base-content/70 mb-4">
            Please enter your new password below.
          </p>
          <form onSubmit={handleForgotPassword}>
            <div className="flex flex-col gap-4">
              <div className="form-control w-full">
                <label className="label" htmlFor="password">
                  <span className="label-text font-medium">New password</span>
                </label>
                <input
                  id="password"
                  type="password"
                  placeholder="New password"
                  className="input input-bordered w-full"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {error && <p className="text-sm text-error mt-1">{error}</p>}

              <button
                type="submit"
                className="btn btn-primary w-full mt-2"
                disabled={isLoading}
              >
                {isLoading ? <span className="loading loading-ring"></span> : "Save new password"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
