import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";

export const Route = createFileRoute("/trade")({
  head: () => ({
    meta: [
      { title: "Trades — Rawblox" },
      { name: "description", content: "Inbound, outbound, completed and inactive Rawblox trades." },
      { property: "og:title", content: "Trades — Rawblox" },
      {
        property: "og:description",
        content: "Inbound, outbound, completed and inactive Rawblox trades.",
      },
    ],
  }),
  component: TradePage,
});

const TABS = ["Inbound", "Outbound", "Completed", "Inactive"] as const;

function TradePage() {
  const [tab, setTab] = useState<string>(TABS[0]);
  return (
    <AppLayout>
      <div className="rb-card p-4">
        <h1 className="rb-heading">Trades</h1>
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
          You have no {tab.toLowerCase()} trades. Trading arrives in the next update.
        </p>
      </div>
    </AppLayout>
  );
}
