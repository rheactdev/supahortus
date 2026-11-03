import { createClient } from "@/lib/supabase/server";
import { searchAllItems, getThumbnailUrls } from "@/lib/data";
import { SearchResults } from "@/components/ui/SearchResults";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { RouteLoading } from "@/components/ui/RouteLoading";

type SearchPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default function SearchPage({ searchParams }: SearchPageProps) {
  return (
    <Suspense fallback={<RouteLoading label="Loading search results" />}>
      <SearchPageContents searchParams={searchParams} />
    </Suspense>
  );
}

async function SearchPageContents({ searchParams }: SearchPageProps) {
  const { q } = await searchParams;
  const searchQuery = typeof q === 'string' ? q : '';

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (typeof userId !== "string") {
    redirect("/auth/login");
  }

  const results = await searchAllItems(userId, searchQuery);

  const itemsByGarden: Record<string, string[]> = {};
  results.forEach(r => {
    if (!itemsByGarden[r.garden_id]) itemsByGarden[r.garden_id] = [];
    itemsByGarden[r.garden_id].push(r.id);
  });

  const thumbnailUrls: Record<string, string> = {};
  await Promise.all(
    Object.entries(itemsByGarden).map(async ([gId, itemIds]) => {
      const urls = await getThumbnailUrls(gId, itemIds);
      Object.assign(thumbnailUrls, urls);
    })
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Search Results</h1>
          {searchQuery ? (
            <p className="text-base-content/60 mt-1">
              Showing {results.length} result{results.length !== 1 && 's'} for "{searchQuery}"
            </p>
          ) : (
            <p className="text-base-content/60 mt-1">Enter a search term in the navbar to begin.</p>
          )}
        </div>
      </div>

      <div className="mt-4">
        {searchQuery && (
          <SearchResults results={results} thumbnailUrls={thumbnailUrls} userId={userId} />
        )}
      </div>
    </div>
  );
}
