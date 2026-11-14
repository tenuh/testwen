# Construction Study Hub

## Run

- Start the Replit preview with `npm run dev` (Vite serves on port 5000).
- Build production assets with `npm run build`.

## Supabase setup

- This project uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Run `supabase/schema.sql` in the Supabase SQL Editor before using the app.
- Never put a service-role or other privileged key in frontend configuration.
- Add accounts through Supabase Table Editor or SQL Editor; a database trigger bcrypt-hashes their passwords into the private schema.
- The browser stores only the short-lived session token and public profile in `sessionStorage`; course and student data remain in Supabase.
