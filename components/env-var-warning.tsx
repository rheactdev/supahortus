export function EnvVarWarning() {
  return (
    <div className="flex gap-4 items-center">
      <div className="badge badge-outline font-normal">
        Supabase environment variables required
      </div>
      <div className="flex gap-2">
        <button className="btn btn-sm btn-outline" disabled>
          Sign in
        </button>
        <button className="btn btn-sm btn-primary" disabled>
          Sign up
        </button>
      </div>
    </div>
  );
}
