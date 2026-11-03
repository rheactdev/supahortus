export function RouteLoading({ label }: { label: string }) {
  return (
    <div className="flex justify-center p-12" role="status" aria-label={label}>
      <span className="loading loading-ring text-primary loading-lg" />
    </div>
  );
}
