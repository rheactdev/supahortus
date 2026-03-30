export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="card bg-base-100 shadow-xl border border-base-content/10">
          <div className="card-body text-center">
            <h2 className="card-title text-2xl justify-center font-bold">
              Thank you for signing up!
            </h2>
            <p className="text-base-content/70 mt-1 mb-2 font-medium">Check your email to confirm</p>
            <p className="text-sm text-base-content/70">
              You&apos;ve successfully signed up. Please check your email to
              confirm your account before signing in.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
