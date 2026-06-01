"use client";


import { authClient } from "@/lib/auth-client";
import Link from "next/link";
import { useState } from "react";

export function ForgotPasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await authClient.forgetPassword({
        email,
        redirectTo: `${window.location.origin}/auth/update-password`,
      });
      if (error) throw error;
      setSuccess(true);
    } catch (error: any) {
      setError(error?.message || "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`flex flex-col gap-6 ${className ?? ""}`.trim()} {...props}>
      {success ? (
        <div className="card bg-base-100 shadow-xl border border-base-content/10">
          <div className="card-body text-center">
            <h2 className="card-title text-2xl justify-center font-bold">Check Your Email</h2>
            <p className="text-base-content/70 mt-2">
              Password reset instructions sent. If you registered using your email and password, you will receive a password reset email.
            </p>
          </div>
        </div>
      ) : (
        <div className="card bg-base-100 shadow-xl border border-base-content/10">
          <div className="card-body">
            <h2 className="card-title text-2xl justify-center font-bold">Reset Your Password</h2>
            <p className="text-center text-base-content/70 mb-4">
              Type in your email and we&apos;ll send you a link to reset your password
            </p>
            <form onSubmit={handleForgotPassword}>
              <div className="flex flex-col gap-4">
                <div className="form-control w-full">
                  <label className="label" htmlFor="email">
                    <span className="label-text font-medium">Email</span>
                  </label>
                  <input
                    id="email"
                    type="email"
                    placeholder="m@example.com"
                    className="input input-bordered w-full"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                {error && <p className="text-sm text-error mt-1">{error}</p>}

                <button
                  type="submit"
                  className="btn btn-primary w-full mt-2"
                  disabled={isLoading}
                >
                  {isLoading ? <span className="loading loading-ring"></span> : "Send reset email"}
                </button>
              </div>
              <div className="mt-6 text-center text-sm">
                Already have an account?{" "}
                <Link
                  href="/auth/login"
                  className="link link-primary font-semibold"
                >
                  Login
                </Link>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
