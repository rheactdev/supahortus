import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parentId = searchParams.get("parent");

  try {
    // RLS auto-filters: owners see their items, shared users see shared subtrees
    let query = supabase
      .from("items")
      .select("id, parent_id, name, size, mime_type, s3_key, created_at")
      .order("name");

    if (parentId) {
      query = query.eq("parent_id", parentId);
    } else {
      query = query.is("parent_id", null);
    }

    const { data: items, error } = await query;
    if (error) throw error;

    // Build breadcrumbs by walking up parent chain
    const breadcrumbs: { id: string; name: string }[] = [];
    if (parentId) {
      let currentId: string | null = parentId;
      while (currentId) {
        const result = await supabase
          .from("items")
          .select("id, name, parent_id")
          .eq("id", currentId)
          .single();
        const ancestor = result.data as { id: string; name: string; parent_id: string | null } | null;
        if (!ancestor) break;
        breadcrumbs.unshift({ id: ancestor.id, name: ancestor.name });
        currentId = ancestor.parent_id;
      }
    }

    return NextResponse.json({ items: items || [], breadcrumbs });
  } catch (error) {
    console.error("Listing error:", error);
    return NextResponse.json({ error: "Failed to list items" }, { status: 500 });
  }
}
