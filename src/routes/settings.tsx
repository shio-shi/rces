import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Rawblox" },
      {
        name: "description",
        content: "Change your Rawblox username, password and profile description.",
      },
      { property: "og:title", content: "Settings — Rawblox" },
      {
        property: "og:description",
        content: "Change your Rawblox username, password and profile description.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { profile, refresh } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [desc, setDesc] = useState("");
  const [pw, setPw] = useState("");

  useEffect(() => {
    if (profile) setDesc(profile.description);
  }, [profile]);

  async function changeUsername() {
    const { data, error } = await supabase.rpc("change_username", { _new: newName.trim() });
    if (error) { toast.error(error.message); return; }
    if (data === "ok") {
      toast.success("Username changed for 1,000 Rawbux.");
      setNewName("");
      await refresh();
    } else toast.error(String(data));
  }

  async function saveDescription() {
    const { data, error } = await supabase.rpc("update_description", { _desc: desc });
    if (error) { toast.error(error.message); return; }
    if (data === "ok") {
      toast.success("Description saved.");
      await refresh();
    }
  }

  async function changePassword() {
    if (pw.length < 6) { toast.error("Password must be at least 6 characters."); return; }
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) { toast.error(error.message); return; }
    setPw("");
    toast.success("Password updated.");
  }

  async function logout() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    await navigate({ to: "/auth", replace: true });
  }

  return (
    <AppLayout>
      <div className="rb-card p-5">
        <h1 className="rb-heading">Settings</h1>

        <section className="mb-6">
          <h2 className="font-semibold">Username</h2>
          <p className="mb-2 text-sm text-muted-foreground">
            Current: <strong>{profile?.username}</strong> — changing it costs 1,000 Rawbux.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New username"
              maxLength={20}
              className="h-9 w-56 rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={changeUsername}
              className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90"
            >
              Change (1,000)
            </button>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="font-semibold">Description</h2>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            maxLength={1000}
            rows={4}
            className="mt-1 w-full rounded-md border border-input bg-card p-3 text-sm outline-none focus:border-primary"
            placeholder="Tell people about yourself"
          />
          <button
            onClick={saveDescription}
            className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90"
          >
            Save
          </button>
        </section>

        <section className="mb-6">
          <h2 className="font-semibold">Password</h2>
          <div className="mt-1 flex flex-wrap gap-2">
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="New password"
              className="h-9 w-56 rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={changePassword}
              className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90"
            >
              Update password
            </button>
          </div>
        </section>

        <section>
          <button
            onClick={logout}
            className="rounded-md bg-destructive px-4 py-2 text-sm font-bold text-destructive-foreground hover:opacity-90"
          >
            Log Out
          </button>
        </section>
      </div>
    </AppLayout>
  );
}
