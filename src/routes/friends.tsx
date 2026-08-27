import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";

export const Route = createFileRoute("/friends")({
  head: () => ({
    meta: [
      { title: "Friends — Rawblox" },
      {
        name: "description",
        content: "Your Rawblox friend requests, friends, followers and following.",
      },
      { property: "og:title", content: "Friends — Rawblox" },
      {
        property: "og:description",
        content: "Your Rawblox friend requests, friends, followers and following.",
      },
    ],
  }),
  component: FriendsPage,
});

const TABS = ["Friend Requests", "Friends", "Followers", "Following"] as const;

function FriendsPage() {
  const [tab, setTab] = useState<string>(TABS[0]);
  return (
    <AppLayout>
      <div className="rb-card p-4">
        <h1 className="rb-heading">Friends</h1>
        <div className="mb-4 flex flex-wrap gap-2 border-b border-border">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${
                tab === t
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <p className="py-10 text-center text-sm text-muted-foreground">
          No {tab.toLowerCase()} yet. Friending arrives in the next update.
        </p>
      </div>
    </AppLayout>
  );
}
