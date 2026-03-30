import { Suspense } from "react";

async function ErrorContent({
  searchParams,
}: {
  searchParams: Promise<{ error: string }>;
}) {
  const params = await searchParams;

  return (
    <>
      {params?.error ? (
        <p className="text-sm text-base-content/70">
          Code error: {params.error}
        </p>
      ) : (
        <p className="text-sm text-base-content/70">
          An unspecified error occurred.
        </p>
      )}
    </>
  );
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ error: string }>;
}) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="card bg-base-100 shadow-xl border border-base-content/10">
          <div className="card-body">
            <h2 className="card-title text-2xl font-bold">
              Sorry, something went wrong.
            </h2>
            <div className="mt-2">
              <Suspense>
                <ErrorContent searchParams={searchParams} />
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
