"use client";


import { signIn } from "@/lib/auth-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await signIn.email({
        email,
        password,
      });
      if (error) throw error;
      router.push("/my-gardens");
    } catch (error: any) {
      setError(error?.message || "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleLogin}>
      <fieldset className="fieldset bg-base-200 border-base-300 rounded-box w-xs border p-4">
        <legend className="fieldset-legend">Login</legend>

        <label className="label mt-2">Email</label>
        <input type="email" className="input mb-4" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />

        <div className="flex justify-between">
          <label className="label">Password</label>
          <Link href="/auth/forgot-password" className="label link link-info link-hover">Forgot password?</Link>
        </div>

        <input type="password" className="input" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />

        {error && <p className="text-sm text-error mt-1">{error}</p>}

        <button className="btn btn-primary mt-4">Login</button>
      </fieldset>
    </form>
  )


  // return (
  //   <div className={cn("flex flex-col gap-6", className)} {...props}>
  //     <div className="card bg-base-100 shadow-xl border border-base-content/10">
  //       <div className="card-body">
  //         <h2 className="card-title text-2xl justify-center font-bold">Login</h2>
  //         <p className="text-center text-base-content/70 mb-4">
  //           Enter your email below to login to your account
  //         </p>

  //         <form onSubmit={handleLogin}>
  //           <div className="flex flex-col gap-4">
  //             <div className="form-control w-full">
  //               <label className="label" htmlFor="email">
  //                 <span className="label-text font-medium">Email</span>
  //               </label>
  //               <input
  //                 id="email"
  //                 type="email"
  //                 placeholder="m@example.com"
  //                 className="input input-bordered w-full"
  //                 required
  //                 value={email}
  //                 onChange={(e) => setEmail(e.target.value)}
  //               />
  //             </div>

  //             <div className="form-control w-full">
  //               <div className="flex items-center justify-between">
  //                 <label className="label" htmlFor="password">
  //                   <span className="label-text font-medium">Password</span>
  //                 </label>
  //                 <Link
  //                   href="/auth/forgot-password"
  //                   className="label-text-alt link link-hover text-secondary font-medium"
  //                 >
  //                   Forgot your password?
  //                 </Link>
  //               </div>
  //               <input
  //                 id="password"
  //                 type="password"
  //                 className="input input-bordered w-full"
  //                 required
  //                 value={password}
  //                 onChange={(e) => setPassword(e.target.value)}
  //               />
  //             </div>

  //             {error && <p className="text-sm text-error mt-1">{error}</p>}

  //             <button
  //               type="submit"
  //               className="btn btn-primary w-full mt-2"
  //               disabled={isLoading}
  //             >
  //               {isLoading ? <span className="loading loading-ring"></span> : "Login"}
  //             </button>
  //           </div>

  //           <div className="mt-6 text-center text-sm">
  //             Don&apos;t have an account?{" "}
  //             <Link
  //               href="/auth/sign-up"
  //               className="link link-primary font-semibold"
  //             >
  //               Sign up
  //             </Link>
  //           </div>
  //         </form>
  //       </div>
  //     </div>
  //   </div>
  // );
}
