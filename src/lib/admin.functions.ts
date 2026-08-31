import { createServerFn } from "@tanstack/react-start";

export const adminStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { isAdmin } = await import("./admin.server");
  return { admin: await isAdmin() };
});

export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((data: { password: string }) => data)
  .handler(async ({ data }) => {
    const { passwordMatches, getAdminSession } = await import("./admin.server");
    const expected = process.env["ADMIN_PANEL_PASSWORD"];
    if (!expected) throw new Error("Admin password is not configured");
    if (!passwordMatches(data.password, expected)) return { ok: false as const };
    const session = await getAdminSession();
    await session.update({ admin: true });
    return { ok: true as const };
  });

export const adminLogout = createServerFn({ method: "POST" }).handler(async () => {
  const { getAdminSession } = await import("./admin.server");
  const session = await getAdminSession();
  await session.clear();
  return { ok: true as const };
});

export const publishItem = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      name: string;
      kind: string;
      cls: "normal" | "limited" | "limitedu";
      description: string;
      imageUrl: string;
      price: number;
      timerHours: number | null;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const saleEnds =
      data.cls !== "normal" && data.timerHours
        ? new Date(Date.now() + data.timerHours * 3600000).toISOString()
        : null;
    const { error } = await supabaseAdmin.from("items").insert({
      name: data.name.trim(),
      kind: data.kind as never,
      class: data.cls,
      description: data.description,
      image_url: data.imageUrl || null,
      price: Math.max(0, Math.round(data.price)),
      sale_ends_at: saleEnds,
      rap: Math.max(0, Math.round(data.price)),
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminFindUser = createServerFn({ method: "POST" })
  .inputValidator((data: { username: string }) => data)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("profiles")
      .select("id, username, rawbux, is_banned, ban_reason, ban_until")
      .ilike("username", data.username.trim())
      .limit(1);
    return rows?.[0] ?? null;
  });

export const adminBanUser = createServerFn({ method: "POST" })
  .inputValidator((data: { userId: string; duration: string; reason: string }) => data)
  .handler(async ({ data }) => {
    const { requireAdmin, banUntil } = await import("./admin.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        is_banned: true,
        ban_reason: data.reason,
        ban_until: banUntil(data.duration),
      })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminUnbanUser = createServerFn({ method: "POST" })
  .inputValidator((data: { userId: string }) => data)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_banned: false, ban_reason: null, ban_until: null })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminGrantRawbux = createServerFn({ method: "POST" })
  .inputValidator((data: { userId: string; amount: number }) => data)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("rawbux")
      .eq("id", data.userId)
      .maybeSingle();
    if (!row) throw new Error("User not found");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ rawbux: Math.max(0, row.rawbux + Math.round(data.amount)) })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminListPromocodes = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("./admin.server");
  await requireAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("promocodes")
    .select("id, code, rawbux_reward, item_id, max_uses, uses, expires_at, is_active")
    .order("created_at", { ascending: false })
    .limit(50);
  return data ?? [];
});

export const adminCreatePromocode = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      code: string;
      rawbux: number;
      itemId: string | null;
      maxUses: number | null;
      expiresInDays: number | null;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("promocodes").insert({
      code: data.code.trim(),
      rawbux_reward: Math.max(0, Math.round(data.rawbux)),
      item_id: data.itemId || null,
      max_uses: data.maxUses ?? null,
      expires_at: data.expiresInDays
        ? new Date(Date.now() + data.expiresInDays * 86400000).toISOString()
        : null,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminSetPromocodeActive = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; active: boolean }) => data)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("promocodes")
      .update({ is_active: data.active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminListItems = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("./admin.server");
  await requireAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("items")
    .select("id, name, kind, class, price, copies_sold")
    .order("created_at", { ascending: false })
    .limit(200);
  return data ?? [];
});

export const adminDeleteItem = createServerFn({ method: "POST" })
  .inputValidator((data: { itemId: string }) => data)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Remove everything that references the item first.
    const { error: e1 } = await supabaseAdmin
      .from("trade_items")
      .delete()
      .eq("item_id", data.itemId);
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await supabaseAdmin
      .from("user_items")
      .delete()
      .eq("item_id", data.itemId);
    if (e2) throw new Error(e2.message);
    const { error: e3 } = await supabaseAdmin
      .from("promocodes")
      .update({ item_id: null })
      .eq("item_id", data.itemId);
    if (e3) throw new Error(e3.message);
    const { error } = await supabaseAdmin.from("items").delete().eq("id", data.itemId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
