import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { ItemCard } from "@/components/ItemCard";
import { useAuth } from "@/lib/auth";
import { rpcMessage } from "@/lib/social";
import type { Item } from "@/lib/format";

export const Route = createFileRoute("/users/$username")({
  head: () => ({
    meta: [
      { title: "User Profile — Rawblox" },
      { name: "description", content: "View a Rawblox player's profile and their collection." },
      { property: "og:title", content: "User Profile — Rawblox" },
      {
        property: "og:description",
        content: "View a Rawblox player's profile and their collection.",
      },
    ],
  }),
  component: UserPage,
});

function UserPage() {
  const { username } = Route.useParams();
  const { profile: me } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["user", username],
    queryFn: async () => {
      const { data: p } = await supabase
        .from("profiles")
        .select("*")
        .ilike("username", username)
        .maybeSingle();
      if (!p) return null;
      const banned = p.is_banned && (!p.ban_until || new Date(p.ban_until) > new Date());
      if (banned) return null;
      const { data: owned } = await supabase.from("user_items").select("item_id").eq("user_id", p.id);
      const ids = [...new Set((owned ?? []).map((o) => o.item_id))];
      const { data: its } = ids.length
        ? await supabase.from("items").select("*").in("id", ids)
        : { data: [] };
      return { profile: p, items: (its ?? []) as Item[] };
    },
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="rb-card p-8 text-center text-sm text-muted-foreground">Loading...</div>
      </AppLayout>
    );
  }

  if (!data) {
    return (
      <AppLayout>
        <div className="rb-card p-10 text-center">
          <h1 className="text-lg font-semibold">Page cannot be found or no longer exists</h1>
        </div>
      </AppLayout>
    );
  }

  const isMe = me?.id === data.profile.id;

  return (
    <AppLayout>
      <div className="rb-card p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-24 w-24 items-center justify-center rounded bg-surface text-3xl font-bold text-muted-foreground">
            {data.profile.username.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{data.profile.username}</h1>
            <p className="text-sm text-muted-foreground">
              Joined {new Date(data.profile.created_at).toLocaleDateString()}
            </p>
          </div>
          {!isMe && (
            <div className="flex gap-2">
              <button
                disabled
                title="Friends launch in the next update"
                className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground opacity-60"
              >
                Add Friend
              </button>
              <button
                disabled
                title="Trading launches in the next update"
                className="rounded-md border border-border px-4 py-2 text-sm font-bold opacity-60"
              >
                Trade Items
              </button>
            </div>
          )}
        </div>
        <div className="mt-5">
          <h2 className="rb-heading">About</h2>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {data.profile.description || "This user hasn't written a description."}
          </p>
        </div>
      </div>

      <div className="rb-card mt-4 p-4">
        <h2 className="rb-heading">Inventory</h2>
        {data.items.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {data.items.map((i) => (
              <ItemCard key={i.id} item={i} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">This user doesn't own any items.</p>
        )}
      </div>
    </AppLayout>
  );
}
