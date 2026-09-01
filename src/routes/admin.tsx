import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import {
  adminBanUser,
  adminCreatePromocode,
  adminDeleteItem,
  adminFindUser,
  adminGrantRawbux,
  adminListItems,
  adminListPromocodes,
  adminLogin,
  adminLogout,
  adminSetPromocodeActive,
  adminStatus,
  adminUnbanUser,
  publishItem,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Panel — Rawblox" },
      { name: "description", content: "Restricted Rawblox administration tools." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Admin Panel — Rawblox" },
      { property: "og:description", content: "Restricted Rawblox administration tools." },
    ],
  }),
  component: AdminPage,
});

const KINDS = ["hat", "hair", "face", "neck", "shoulder", "front", "back", "waist", "gear"];
const DURATIONS = [
  ["1d", "1 Day"],
  ["3d", "3 Days"],
  ["7d", "7 Days"],
  ["14d", "14 Days"],
  ["1mo", "1 Month"],
  ["6mo", "6 Months"],
  ["1y", "1 Year"],
  ["perm", "Permanent"],
];

type FoundUser = {
  id: string;
  username: string;
  rawbux: number;
  is_banned: boolean;
  ban_reason: string | null;
  ban_until: string | null;
};

type Promocode = {
  id: string;
  code: string;
  rawbux_reward: number;
  item_id: string | null;
  max_uses: number | null;
  uses: number;
  expires_at: string | null;
  is_active: boolean;
};

type AdminItem = {
  id: string;
  name: string;
  kind: string;
  class: string;
  price: number;
  copies_sold: number;
};

function AdminPage() {
  const status = useServerFn(adminStatus);
  const login = useServerFn(adminLogin);
  const logout = useServerFn(adminLogout);
  const publish = useServerFn(publishItem);
  const findUser = useServerFn(adminFindUser);
  const ban = useServerFn(adminBanUser);
  const unban = useServerFn(adminUnbanUser);
  const grant = useServerFn(adminGrantRawbux);
  const listCodes = useServerFn(adminListPromocodes);
  const createCode = useServerFn(adminCreatePromocode);
  const setCodeActive = useServerFn(adminSetPromocodeActive);
  const listItems = useServerFn(adminListItems);
  const deleteItem = useServerFn(adminDeleteItem);

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pw, setPw] = useState("");

  const [name, setName] = useState("");
  const [kind, setKind] = useState(KINDS[0]!);
  const [cls, setCls] = useState<"normal" | "limited" | "limitedu">("normal");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [price, setPrice] = useState("100");
  const [timerH, setTimerH] = useState("24");
  const [timerM, setTimerM] = useState("0");
  const [timerS, setTimerS] = useState("0");
  const [stock, setStock] = useState("");

  const [search, setSearch] = useState("");
  const [user, setUser] = useState<FoundUser | null>(null);
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState("1d");
  const [amount, setAmount] = useState("100");

  const [code, setCode] = useState("");
  const [codeRawbux, setCodeRawbux] = useState("100");
  const [codeItem, setCodeItem] = useState("");
  const [codeMax, setCodeMax] = useState("");
  const [codeDays, setCodeDays] = useState("");
  const [codes, setCodes] = useState<Promocode[]>([]);
  const [itemOptions, setItemOptions] = useState<AdminItem[]>([]);

  useEffect(() => {
    status().then((r) => setAuthed(r.admin));
  }, [status]);

  const reloadCodes = useCallback(async () => {
    setCodes((await listCodes()) as Promocode[]);
  }, [listCodes]);

  const reloadItems = useCallback(async () => {
    setItemOptions((await listItems()) as AdminItem[]);
  }, [listItems]);

  useEffect(() => {
    if (!authed) return;
    void reloadCodes();
    void reloadItems();
  }, [authed, reloadCodes, reloadItems]);

  async function doCreateCode() {
    try {
      await createCode({
        data: {
          code,
          rawbux: Number(codeRawbux) || 0,
          itemId: codeItem || null,
          maxUses: codeMax ? Number(codeMax) : null,
          expiresInDays: codeDays ? Number(codeDays) : null,
        },
      });
      toast.success("Promocode created.");
      setCode("");
      await reloadCodes();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function doLogin() {
    const r = await login({ data: { password: pw } });
    if (!r.ok) {
      toast.error("Incorrect password.");
      return;
    }
    // Confirm the admin session cookie actually stuck before showing the panel.
    const check = await status();
    if (!check.admin) {
      toast.error("Could not start an admin session. Try opening the preview in a new tab.");
      return;
    }
    setAuthed(true);
    setPw("");
  }

  async function doPublish() {
    try {
      await publish({
        data: {
          name,
          kind,
          cls,
          description,
          imageUrl,
          price: Number(price) || 0,
          timerHours: cls === "normal" ? null : Number(timerH) || 0,
          timerMinutes: cls === "normal" ? null : Number(timerM) || 0,
          timerSeconds: cls === "normal" ? null : Number(timerS) || 0,
          stock: cls !== "normal" && stock.trim() !== "" ? Number(stock) || 0 : null,
        },
      });
      toast.success("Item published.");
      setName("");
      setDescription("");
      setImageUrl("");
      await reloadItems();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function doDeleteItem(item: AdminItem) {
    if (!window.confirm(`Delete "${item.name}" from the catalog? Owners will lose their copies.`)) return;
    try {
      await deleteItem({ data: { itemId: item.id } });
      toast.success("Item deleted.");
      await reloadItems();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function doFind() {
    try {
      const u = (await findUser({ data: { username: search } })) as FoundUser | null;
      setUser(u);
      if (!u) toast.error("User not found.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (authed === null) return null;

  if (!authed) {
    return (
      <AppLayout>
        <div className="rb-card mx-auto max-w-sm p-6">
          <h1 className="rb-heading">Admin Panel</h1>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doLogin()}
            placeholder="Admin password"
            className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={doLogin}
            className="mt-3 w-full rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90"
          >
            Enter
          </button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="rb-card p-5">
        <div className="flex items-center justify-between">
          <h1 className="rb-heading mb-0">Admin Panel</h1>
          <button
            onClick={async () => {
              await logout();
              setAuthed(false);
            }}
            className="text-sm font-semibold text-primary hover:underline"
          >
            Lock panel
          </button>
        </div>
      </div>

      <div className="rb-card mt-4 p-5">
        <h2 className="rb-heading">Publish item</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Item name"
            className="h-9 rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-primary"
          />
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="Image URL"
            className="h-9 rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-primary"
          />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="h-9 rounded-md border border-input bg-card px-3 text-sm capitalize"
          >
            {KINDS.map((k) => (
              <option key={k} value={k} className="capitalize">
                {k}
              </option>
            ))}
          </select>
          <select
            value={cls}
            onChange={(e) => setCls(e.target.value as typeof cls)}
            className="h-9 rounded-md border border-input bg-card px-3 text-sm"
          >
            <option value="normal">Normal (on sale)</option>
            <option value="limited">Limited</option>
            <option value="limitedu">Limited U</option>
          </select>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Price"
            inputMode="numeric"
            className="h-9 rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-primary"
          />
          {cls !== "normal" && (
            <div className="flex items-center gap-2">
              <input
                value={timerH}
                onChange={(e) => setTimerH(e.target.value)}
                placeholder="Hours"
                inputMode="numeric"
                className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-primary"
              />
              <input
                value={timerM}
                onChange={(e) => setTimerM(e.target.value)}
                placeholder="Minutes"
                inputMode="numeric"
                className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-primary"
              />
              <input
                value={timerS}
                onChange={(e) => setTimerS(e.target.value)}
                placeholder="Seconds"
                inputMode="numeric"
                className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-primary"
              />
            </div>
          )}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
            rows={3}
            className="rounded-md border border-input bg-card p-3 text-sm outline-none focus:border-primary sm:col-span-2"
          />
        </div>
        <button
          onClick={doPublish}
          className="mt-3 rounded-md bg-buy px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90"
        >
          Publish
        </button>
      </div>

      <div className="rb-card mt-4 p-5">
        <h2 className="rb-heading">Manage player</h2>
        <div className="flex flex-wrap gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Username"
            className="h-9 w-56 rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={doFind}
            className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90"
          >
            Find
          </button>
        </div>

        {user && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-sm">
              <strong>{user.username}</strong> — {user.rawbux.toLocaleString("en-US")} Rawbux
              {user.is_banned ? " — currently banned" : ""}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="h-9 rounded-md border border-input bg-card px-3 text-sm"
              >
                {DURATIONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ban reason"
                className="h-9 w-64 rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-primary"
              />
              <button
                onClick={async () => {
                  await ban({ data: { userId: user.id, duration, reason } });
                  toast.success("Player banned.");
                  await doFind();
                }}
                className="rounded-md bg-destructive px-4 py-2 text-sm font-bold text-destructive-foreground hover:opacity-90"
              >
                Ban
              </button>
              <button
                onClick={async () => {
                  await unban({ data: { userId: user.id } });
                  toast.success("Player unbanned.");
                  await doFind();
                }}
                className="rounded-md border border-border px-4 py-2 text-sm font-bold hover:bg-surface"
              >
                Unban
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="numeric"
                className="h-9 w-32 rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-primary"
              />
              <button
                onClick={async () => {
                  await grant({ data: { userId: user.id, amount: Number(amount) || 0 } });
                  toast.success("Rawbux granted.");
                  await doFind();
                }}
                className="rounded-md bg-buy px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90"
              >
                Give Rawbux
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rb-card mt-4 p-5">
        <h2 className="rb-heading">Promocodes</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Code (e.g. RAWBLOX2021)"
            className="h-9 rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-primary"
          />
          <input
            value={codeRawbux}
            onChange={(e) => setCodeRawbux(e.target.value)}
            inputMode="numeric"
            placeholder="Rawbux reward"
            className="h-9 rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-primary"
          />
          <select
            value={codeItem}
            onChange={(e) => setCodeItem(e.target.value)}
            className="h-9 rounded-md border border-input bg-card px-3 text-sm"
          >
            <option value="">No item reward</option>
            {itemOptions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <input
            value={codeMax}
            onChange={(e) => setCodeMax(e.target.value)}
            inputMode="numeric"
            placeholder="Max uses (blank = unlimited)"
            className="h-9 rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-primary"
          />
          <input
            value={codeDays}
            onChange={(e) => setCodeDays(e.target.value)}
            inputMode="numeric"
            placeholder="Expires in days (blank = never)"
            className="h-9 rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <button
          onClick={doCreateCode}
          className="mt-3 rounded-md bg-buy px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90"
        >
          Create promocode
        </button>

        {codes.length > 0 && (
          <ul className="mt-4 divide-y divide-border border-t border-border">
            {codes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="font-bold">{c.code}</span>
                <span className="text-muted-foreground">
                  {c.rawbux_reward} Rawbux · {c.uses}
                  {c.max_uses ? `/${c.max_uses}` : ""} uses
                  {c.expires_at ? ` · expires ${new Date(c.expires_at).toLocaleDateString()}` : ""}
                  {c.is_active ? "" : " · disabled"}
                </span>
                <button
                  onClick={async () => {
                    await setCodeActive({ data: { id: c.id, active: !c.is_active } });
                    await reloadCodes();
                  }}
                  className="ml-auto rounded-md border border-border px-3 py-1 text-xs font-bold hover:bg-surface"
                >
                  {c.is_active ? "Disable" : "Enable"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rb-card mt-4 p-5">
        <h2 className="rb-heading">Catalog items</h2>
        {itemOptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No items published yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {itemOptions.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="font-bold">{i.name}</span>
                <span className="capitalize text-muted-foreground">
                  {i.kind} · {i.class === "limitedu" ? "Limited U" : i.class} · {i.price.toLocaleString("en-US")} Rawbux
                  {i.class !== "normal" ? ` · ${i.copies_sold} sold` : ""}
                </span>
                <button
                  onClick={() => doDeleteItem(i)}
                  className="ml-auto rounded-md bg-destructive px-3 py-1 text-xs font-bold text-destructive-foreground hover:opacity-90"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppLayout>
  );
}
