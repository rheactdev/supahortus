import { Suspense } from "react";
import { DriveExplorer } from "@/components/ui/DriveExplorer";

export default function DashboardPage() {
  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Your Drive</h1>
          <p className="text-base-content/60 mt-1">Manage and access all your files safely stored in B2.</p>
        </div>
      </div>
      <Suspense fallback={<div className="flex justify-center p-12"><span className="loading loading-ring text-primary loading-lg"></span></div>}>
        <DriveExplorer />
      </Suspense>
    </div>
  );
}
