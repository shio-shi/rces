import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { ItemCard } from "@/components/ItemCard";
import { ITEM_KINDS, type Item } from "@/lib/format";

export const Route = createFileRoute("/catalog")({
  head: () => ({
    meta: [
      { title: "Catalog — Rawblox" },
      {
        name: "description",
        content: "Browse every hat, hair, face and gear item on Rawblox, including limiteds.",
      },
      { property: "og:title", content: "Catalog — Rawblox" },
      {
        property: "og:description",
        content: "Browse every hat, hair, face and gear item on Rawblox, including limiteds.",
      },
    ],
  }),
  component: CatalogPage,
});

const FILTERS = [
  { key: "all", label: "All" },
  { key: "normal", label: "On Sale" },
  { key: "limited", label: "Limited" },
  { key: "limitedu", label: "Limited U" },
] as const;

function CatalogPage() {
  const [cls, setCls] = useState<string>("all");
  const [kind, setKind] = useState<string>("all");

  const { data: items, isLoading } = useQuery({
    queryKey: ["catalog", cls, kind],
    queryFn: async () => {
      let q = supabase.from("items").select("*").order("created_at", { ascending: false });
      if (cls !== "all") q = q.eq("class", cls as "normal");
      if (kind !== "all") q = q.eq("kind", kind as "hat");
      const { data } = await q;
      return (data ?? []) as Item[];
    },
  });

  return (
    <AppLayout>
      <div className="rb-card p-4">
        <h1 className="rb-heading">Catalog</h1>
        <div className="mb-4 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setCls(f.key)}
              className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${
                cls === f.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-accent"
              }`}
            >
              {f.label}
            </button>
          ))}
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="ml-auto h-9 rounded-md border border-input bg-card px-2 text-sm capitalize outline-none"
          >
            <option value="all">All types</option>
            {ITEM_KINDS.map((k) => (
              <option key={k} value={k} className="capitalize">
                {k}
              </option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
        ) : items && items.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {items.map((i) => (
              <ItemCard key={i.id} item={i} />
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">No items found.</p>
        )}
      </div>
    </AppLayout>
  );
}
