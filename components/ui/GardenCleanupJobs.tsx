import { retryGardenCleanup } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/admin-access";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GardenCleanupJobs() {
  await requireAdmin();

  const { data: jobs, error } = await supabaseAdmin
    .from("garden_deletions")
    .select("garden_id, slug, last_error")
    .is("completed_at", null)
    .order("requested_at");

  if (error) {
    return <p role="alert" className="text-error">Could not load garden cleanup jobs.</p>;
  }
  if (!jobs?.length) return null;

  return (
    <section className="space-y-3" aria-labelledby="garden-cleanup-heading">
      <h2 id="garden-cleanup-heading" className="text-xl font-semibold">
        Garden cleanup
      </h2>
      <p className="text-sm text-base-content/70">
        These slugs are reserved until storage cleanup finishes.
      </p>
      <ul className="divide-y divide-base-content/10">
        {jobs.map((job) => (
          <li key={job.garden_id} className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="font-medium">{job.slug}</p>
              <p className={job.last_error ? "text-sm text-error" : "text-sm text-base-content/70"}>
                {job.last_error ?? "Cleanup pending"}
              </p>
            </div>
            <form action={retryGardenCleanup.bind(null, job.garden_id)}>
              <button className="btn btn-sm btn-outline">Retry cleanup</button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
