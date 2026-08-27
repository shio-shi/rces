# Finding the admin panel

The admin panel already exists, but nothing in the site links to it — that was deliberate so normal players can't discover it. You reach it by typing the address directly:

```text
/admin
```

So in the preview: add `/admin` to the end of the preview URL. It asks for your admin password (the one you gave me), then unlocks item publishing, bans/unbans and Rawbux grants for 8 hours.

## Optional change: a discreet way in

If typing the URL is annoying, I can add an admin entry point that stays invisible to everyone else:

- Add an "Admin Panel" link at the bottom of the Settings page, shown only after the server confirms the admin session cookie is already unlocked.
- Because the check runs on the server, a normal player never sees the link even if they inspect the page.

That is a small frontend-only change: a status call on the Settings page plus one conditional link.

## Technical notes

- Route file: `src/routes/admin.tsx`, gated by `adminLogin` / `adminStatus` in `src/lib/admin.functions.ts`.
- The gate uses an encrypted, http-only session cookie; the password itself is stored as a server secret and never reaches the browser.
