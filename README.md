# Construction Study Hub

A React + Vite study workspace for construction students and lecturers. Course records, student notes, diary entries, quiz attempts, and lecture files live in Supabase. The app has no public signup and does not use browser storage as a data store.

## Run in Replit

1. Create or choose a Supabase project.
2. In Supabase, open **SQL Editor**, paste and run [`supabase/schema.sql`](supabase/schema.sql).
3. Add these values to the Replit project's Secrets:
   - `VITE_SUPABASE_URL` — the project URL from Supabase Project Settings → API.
   - `VITE_SUPABASE_PUBLISHABLE_KEY` — the project's publishable key (the legacy `anon` key also works).
4. Start the app with `npm run dev`, or use the configured Replit preview.

The publishable/anon key is intended for browser use. Never add a service-role key or another privileged key to this app.

## Test accounts

The SQL setup inserts these accounts if they do not already exist:

| Login ID | Password | Role |
| --- | --- | --- |
| `ADMIN001` | `admin123` | Lecturer |
| `LEC001` | `lecturer123` | Lecturer |
| `STU001` | `student123` | Student |

Change the demo passwords before using the project with real students.

## Add a student or lecturer

In Supabase **Table Editor → public.users**, insert `full_name`, `role` (`student` or `lecturer`), `login_id`, and `password`. The database trigger hashes the password with bcrypt and clears the temporary value before the row is saved. The app never returns that field to users.

Or use **SQL Editor**:

```sql
insert into public.users (full_name, role, login_id, password)
values ('Asha Perera', 'student', 'STU002', 'choose-a-strong-password');
```

The `password` input is write-only: a database trigger hashes it into `private.user_credentials` and stores `NULL` in `public.users`. Password hashes and session records are kept in the non-API `private` schema; the browser cannot query them. The app's ID/password login is implemented with database functions and short-lived opaque sessions, not Supabase email authentication.

## Notes about the database setup

- `supabase/schema.sql` creates the requested course tables, plus assignment-completion and quiz-attempt tables needed to persist those features.
- Row-level security restricts student notes and diary entries to their owner. Lecturer-only actions are enforced in the database, not just hidden in the interface.
- Correct quiz answers are only returned to lecturer sessions. Student quiz submissions are graded by a database function.
- Lecture files are stored in a private `lecture-notes` Storage bucket.
- New accounts can be added from the Table Editor; the database hashes passwords before storage.
- Applying the schema and configuring a Supabase project are required before login and live data can work.

## Local checks

```sh
npm run dev
npm run build
```
