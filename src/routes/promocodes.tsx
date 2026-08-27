import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";

export const Route = createFileRoute("/promocodes")({
  head: () => ({
    meta: [
      { title: "Promocodes — Rawblox" },
      { name: "description", content: "Redeem Rawblox promocodes for free items and Rawbux." },
      { property: "og:title", content: "Promocodes — Rawblox" },
      {
        property: "og:description",
        content: "Redeem Rawblox promocodes for free items and Rawbux.",
      },
    ],
  }),
  component: PromocodesPage,
});

function PromocodesPage() {
  const [code, setCode] = useState("");
  return (
    <AppLayout>
      <div className="rb-card p-5">
        <h1 className="rb-heading">Promocodes</h1>
        <p className="mb-3 text-sm text-muted-foreground">
          Enter a promocode below to redeem free rewards.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enter your code"
            className="h-9 w-64 rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={() => toast.error("Invalid promocode.")}
            className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90"
          >
            Redeem
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
