-- Construction Study Hub
-- Run this whole script once in Supabase Dashboard > SQL Editor.
-- Password hashes and session tokens are kept in the non-API private schema.
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  role text not null check (role in ('student', 'lecturer')),
  login_id text not null unique,
  -- Write-only at insert/update time. A trigger hashes this value and clears it.
  password text,
  created_at timestamptz not null default now()
);

create table if not exists private.user_credentials (
  user_id uuid primary key references public.users(id) on delete cascade deferrable initially deferred,
  password_hash text not null,
  changed_at timestamptz not null default now()
);

create table if not exists private.user_sessions (
  token_hash text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists private.login_attempts (
  bucket_key text primary key,
  failure_count integer not null default 0,
  window_started_at timestamptz not null default now()
);

create table if not exists public.lecture_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text not null,
  description text not null default '',
  file_url text,
  uploaded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text not null default 'General',
  description text not null default '',
  deadline date,
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null
);

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text not null default 'General',
  description text not null default '',
  duration_minutes integer not null default 10 check (duration_minutes > 0),
  deadline date,
  questions jsonb not null default '[]'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.zoom_meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text not null default 'General',
  description text not null default '',
  meeting_link text,
  meeting_date date not null,
  meeting_time time,
  created_by uuid references public.users(id) on delete set null
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  event_date date not null,
  event_time time,
  location text not null default '',
  created_by uuid references public.users(id) on delete set null
);

create table if not exists public.deadlines (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null check (type in ('assignment', 'quiz', 'exam', 'event')),
  due_date date not null,
  subject text not null default 'General',
  user_id uuid references public.users(id) on delete cascade,
  assignment_id uuid unique references public.assignments(id) on delete cascade,
  quiz_id uuid unique references public.quizzes(id) on delete cascade,
  event_id uuid unique references public.events(id) on delete cascade
);

create table if not exists public.student_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  badge_name text not null,
  badge_icon text not null default 'award',
  reason text not null default '',
  awarded_at timestamptz not null default now()
);

create table if not exists public.diary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  entry text not null default '',
  mood text not null default 'steady',
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create table if not exists public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (assignment_id, user_id)
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  score numeric(5,2) not null,
  correct_answers integer not null,
  total_questions integer not null,
  duration_seconds integer not null default 0,
  completed_at timestamptz not null default now()
);

-- The API key alone is not a user session. This function checks the opaque
-- random token attached by the browser in x-studyhub-session.
create or replace function public.current_user_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_headers jsonb;
  v_token text;
  v_user_id uuid;
begin
  v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  v_token := v_headers ->> 'x-studyhub-session';
  if v_token is null or length(v_token) < 32 then
    return null;
  end if;

  select s.user_id into v_user_id
  from private.user_sessions as s
  where s.token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex')
    and s.expires_at > now();
  return v_user_id;
end;
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.role from public.users as u where u.id = public.current_user_id()
$$;

create or replace function public.login_with_login_id(
  p_login_id text,
  p_password text,
  p_requested_role text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user public.users%rowtype;
  v_password_hash text;
  v_token text;
  v_headers jsonb;
  v_request_ip text;
  v_bucket_key text;
  v_failure_count integer;
  v_window_started_at timestamptz;
begin
  v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  v_request_ip := coalesce(split_part(v_headers ->> 'x-forwarded-for', ',', 1), 'unknown');
  v_bucket_key := encode(
    extensions.digest(lower(trim(coalesce(p_login_id, ''))) || ':' || v_request_ip, 'sha256'),
    'hex'
  );

  select a.failure_count, a.window_started_at
  into v_failure_count, v_window_started_at
  from private.login_attempts as a
  where a.bucket_key = v_bucket_key
  for update;

  if found and v_failure_count >= 8 and v_window_started_at > now() - interval '15 minutes' then
    return jsonb_build_object('status', 'invalid');
  end if;

  select u, c.password_hash
  into v_user, v_password_hash
  from public.users as u
  join private.user_credentials as c on c.user_id = u.id
  where upper(u.login_id) = upper(trim(coalesce(p_login_id, '')))
  limit 1;

  if not found or v_password_hash is null
    or extensions.crypt(coalesce(p_password, ''), v_password_hash) <> v_password_hash then
    insert into private.login_attempts (bucket_key, failure_count, window_started_at)
    values (v_bucket_key, 1, now())
    on conflict (bucket_key) do update
    set failure_count = case
          when private.login_attempts.window_started_at <= now() - interval '15 minutes' then 1
          else private.login_attempts.failure_count + 1
        end,
        window_started_at = case
          when private.login_attempts.window_started_at <= now() - interval '15 minutes' then now()
          else private.login_attempts.window_started_at
        end;
    return jsonb_build_object('status', 'invalid');
  end if;

  if lower(coalesce(p_requested_role, '')) <> v_user.role then
    return jsonb_build_object('status', 'wrong_role');
  end if;

  delete from private.user_sessions where expires_at <= now();
  delete from private.login_attempts where window_started_at <= now() - interval '1 day';
  delete from private.login_attempts where bucket_key = v_bucket_key;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.user_sessions (token_hash, user_id, expires_at)
  values (
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    v_user.id,
    now() + interval '12 hours'
  );

  return jsonb_build_object(
    'status', 'ok',
    'token', v_token,
    'user', jsonb_build_object(
      'id', v_user.id,
      'full_name', v_user.full_name,
      'role', v_user.role,
      'login_id', v_user.login_id,
      'created_at', v_user.created_at
    )
  );
end;
$$;

create or replace function public.get_my_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', u.id,
    'full_name', u.full_name,
    'role', u.role,
    'login_id', u.login_id,
    'created_at', u.created_at
  )
  from public.users as u
  where u.id = public.current_user_id()
$$;

create or replace function public.logout_studyhub()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_headers jsonb;
  v_token text;
begin
  v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  v_token := v_headers ->> 'x-studyhub-session';
  if v_token is null then return true; end if;
  delete from private.user_sessions
  where token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex');
  return true;
end;
$$;

create or replace function public.list_quizzes_for_student()
returns table (
  id uuid,
  title text,
  subject text,
  description text,
  duration_minutes integer,
  questions jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.current_user_id() is null then
    raise exception 'Sign in to view quizzes.';
  end if;
  return query
  select q.id, q.title, q.subject, q.description, q.duration_minutes,
    coalesce((
      select jsonb_agg(question.value - 'correctIndex' order by question.ordinality)
      from jsonb_array_elements(q.questions) with ordinality as question(value, ordinality)
    ), '[]'::jsonb) as questions,
    q.created_at
  from public.quizzes as q
  order by q.created_at desc;
end;
$$;

create or replace function public.submit_quiz_attempt(
  p_quiz_id uuid,
  p_answers jsonb,
  p_duration_seconds integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.current_user_id();
  v_questions jsonb;
  v_total integer;
  v_correct integer;
  v_score numeric(5,2);
begin
  if v_user_id is null or public.current_user_role() <> 'student' then
    raise exception 'A student session is required to submit a quiz.';
  end if;

  select q.questions into v_questions from public.quizzes as q where q.id = p_quiz_id;
  if not found then raise exception 'Quiz not found.'; end if;

  v_total := jsonb_array_length(coalesce(v_questions, '[]'::jsonb));
  if v_total < 1 then raise exception 'This quiz has no questions.'; end if;

  select count(*)::integer into v_correct
  from jsonb_array_elements(v_questions) with ordinality as question(value, ordinality)
  where exists (
    select 1
    from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) as answer(value)
    where (answer.value ->> 'questionIndex')::integer = question.ordinality - 1
      and (answer.value ->> 'answerIndex')::integer = (question.value ->> 'correctIndex')::integer
  );

  v_score := round((v_correct::numeric / v_total::numeric) * 100, 2);
  insert into public.quiz_attempts (
    quiz_id, user_id, score, correct_answers, total_questions, duration_seconds
  ) values (
    p_quiz_id, v_user_id, v_score, v_correct, v_total, greatest(coalesce(p_duration_seconds, 0), 0)
  );

  return jsonb_build_object('score', v_score, 'correct', v_correct, 'total', v_total);
end;
$$;

create or replace function public.set_record_creator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is null then new.created_by := public.current_user_id(); end if;
  return new;
end;
$$;

create or replace function public.set_note_uploader()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.uploaded_by is null then new.uploaded_by := public.current_user_id(); end if;
  return new;
end;
$$;

create or replace function public.hash_user_password()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.password is not null and new.password <> '' then
    if length(new.password) < 8 then
      raise exception 'Passwords must contain at least 8 characters.';
    end if;
    insert into private.user_credentials (user_id, password_hash)
    values (new.id, extensions.crypt(new.password, extensions.gen_salt('bf', 12)))
    on conflict (user_id) do update
      set password_hash = excluded.password_hash, changed_at = now();
    new.password := null;
  elsif tg_op = 'INSERT' and not exists (
    select 1 from private.user_credentials as c where c.user_id = new.id
  ) then
    raise exception 'A password is required when creating a user.';
  end if;
  return new;
end;
$$;

create or replace function public.sync_assignment_deadline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deadline is null then
    delete from public.deadlines where assignment_id = new.id;
  else
    insert into public.deadlines (title, type, due_date, subject, assignment_id)
    values (new.title, 'assignment', new.deadline, coalesce(new.subject, 'General'), new.id)
    on conflict (assignment_id) do update
      set title = excluded.title, due_date = excluded.due_date, subject = excluded.subject;
  end if;
  return new;
end;
$$;

create or replace function public.sync_event_deadline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.deadlines (title, type, due_date, subject, event_id)
  values (new.title, 'event', new.event_date, 'Events', new.id)
  on conflict (event_id) do update
    set title = excluded.title, due_date = excluded.due_date, subject = excluded.subject;
  return new;
end;
$$;

create or replace function public.sync_quiz_deadline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deadline is null then
    delete from public.deadlines where quiz_id = new.id;
  else
    insert into public.deadlines (title, type, due_date, subject, quiz_id)
    values (new.title, 'quiz', new.deadline, coalesce(new.subject, 'General'), new.id)
    on conflict (quiz_id) do update
      set title = excluded.title, due_date = excluded.due_date, subject = excluded.subject;
  end if;
  return new;
end;
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists lecture_notes_set_uploader on public.lecture_notes;
create trigger lecture_notes_set_uploader before insert on public.lecture_notes
for each row execute function public.set_note_uploader();
drop trigger if exists users_hash_password on public.users;
create trigger users_hash_password before insert or update of password on public.users
for each row execute function public.hash_user_password();
drop trigger if exists assignments_set_creator on public.assignments;
create trigger assignments_set_creator before insert on public.assignments
for each row execute function public.set_record_creator();
drop trigger if exists assignments_sync_deadline on public.assignments;
create trigger assignments_sync_deadline after insert or update of title, subject, deadline on public.assignments
for each row execute function public.sync_assignment_deadline();
drop trigger if exists quizzes_set_creator on public.quizzes;
create trigger quizzes_set_creator before insert on public.quizzes
for each row execute function public.set_record_creator();
drop trigger if exists zoom_meetings_set_creator on public.zoom_meetings;
create trigger zoom_meetings_set_creator before insert on public.zoom_meetings
for each row execute function public.set_record_creator();
drop trigger if exists events_set_creator on public.events;
create trigger events_set_creator before insert on public.events
for each row execute function public.set_record_creator();
drop trigger if exists events_sync_deadline on public.events;
create trigger events_sync_deadline after insert or update of title, event_date on public.events
for each row execute function public.sync_event_deadline();
drop trigger if exists quizzes_sync_deadline on public.quizzes;
create trigger quizzes_sync_deadline after insert or update of title, subject, deadline on public.quizzes
for each row execute function public.sync_quiz_deadline();
drop trigger if exists student_notes_touch_updated_at on public.student_notes;
create trigger student_notes_touch_updated_at before update on public.student_notes
for each row execute function public.touch_updated_at();

alter table public.users enable row level security;
alter table public.lecture_notes enable row level security;
alter table public.assignments enable row level security;
alter table public.quizzes enable row level security;
alter table public.zoom_meetings enable row level security;
alter table public.deadlines enable row level security;
alter table public.events enable row level security;
alter table public.student_notes enable row level security;
alter table public.badges enable row level security;
alter table public.diary enable row level security;
alter table public.assignment_submissions enable row level security;
alter table public.quiz_attempts enable row level security;
alter table private.user_credentials enable row level security;
alter table private.user_sessions enable row level security;
alter table private.login_attempts enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.users to anon, authenticated;
grant select, insert, update, delete on
  public.lecture_notes, public.assignments, public.quizzes, public.zoom_meetings,
  public.deadlines, public.events, public.student_notes, public.badges, public.diary,
  public.assignment_submissions
to anon, authenticated;
grant select on public.quiz_attempts to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;

drop policy if exists users_select_scoped on public.users;
create policy users_select_scoped on public.users for select to anon, authenticated
using (id = public.current_user_id() or public.current_user_role() = 'lecturer');

drop policy if exists lecture_notes_read_signed_in on public.lecture_notes;
create policy lecture_notes_read_signed_in on public.lecture_notes for select to anon, authenticated
using (public.current_user_id() is not null);
drop policy if exists lecture_notes_lecturer_write on public.lecture_notes;
create policy lecture_notes_lecturer_write on public.lecture_notes for all to anon, authenticated
using (public.current_user_role() = 'lecturer')
with check (public.current_user_role() = 'lecturer');

drop policy if exists assignments_read_signed_in on public.assignments;
create policy assignments_read_signed_in on public.assignments for select to anon, authenticated
using (public.current_user_id() is not null);
drop policy if exists assignments_lecturer_write on public.assignments;
create policy assignments_lecturer_write on public.assignments for all to anon, authenticated
using (public.current_user_role() = 'lecturer')
with check (public.current_user_role() = 'lecturer');

drop policy if exists quizzes_lecturer_only on public.quizzes;
create policy quizzes_lecturer_only on public.quizzes for all to anon, authenticated
using (public.current_user_role() = 'lecturer')
with check (public.current_user_role() = 'lecturer');

drop policy if exists meetings_read_signed_in on public.zoom_meetings;
create policy meetings_read_signed_in on public.zoom_meetings for select to anon, authenticated
using (public.current_user_id() is not null);
drop policy if exists meetings_lecturer_write on public.zoom_meetings;
create policy meetings_lecturer_write on public.zoom_meetings for all to anon, authenticated
using (public.current_user_role() = 'lecturer')
with check (public.current_user_role() = 'lecturer');

drop policy if exists deadlines_read_scoped on public.deadlines;
create policy deadlines_read_scoped on public.deadlines for select to anon, authenticated
using (user_id is null or user_id = public.current_user_id() or public.current_user_role() = 'lecturer');
drop policy if exists deadlines_lecturer_write on public.deadlines;
create policy deadlines_lecturer_write on public.deadlines for all to anon, authenticated
using (public.current_user_role() = 'lecturer')
with check (public.current_user_role() = 'lecturer');

drop policy if exists events_read_signed_in on public.events;
create policy events_read_signed_in on public.events for select to anon, authenticated
using (public.current_user_id() is not null);
drop policy if exists events_lecturer_write on public.events;
create policy events_lecturer_write on public.events for all to anon, authenticated
using (public.current_user_role() = 'lecturer')
with check (public.current_user_role() = 'lecturer');

drop policy if exists student_notes_own on public.student_notes;
create policy student_notes_own on public.student_notes for all to anon, authenticated
using (user_id = public.current_user_id() and public.current_user_role() = 'student')
with check (user_id = public.current_user_id() and public.current_user_role() = 'student');

drop policy if exists badges_read_scoped on public.badges;
create policy badges_read_scoped on public.badges for select to anon, authenticated
using (user_id = public.current_user_id() or public.current_user_role() = 'lecturer');
drop policy if exists badges_lecturer_award on public.badges;
create policy badges_lecturer_award on public.badges for insert to anon, authenticated
with check (public.current_user_role() = 'lecturer');

drop policy if exists diary_own on public.diary;
create policy diary_own on public.diary for all to anon, authenticated
using (user_id = public.current_user_id() and public.current_user_role() = 'student')
with check (user_id = public.current_user_id() and public.current_user_role() = 'student');

drop policy if exists assignment_submissions_read_scoped on public.assignment_submissions;
create policy assignment_submissions_read_scoped on public.assignment_submissions for select to anon, authenticated
using (user_id = public.current_user_id() or public.current_user_role() = 'lecturer');
drop policy if exists assignment_submissions_student_write on public.assignment_submissions;
create policy assignment_submissions_student_write on public.assignment_submissions for all to anon, authenticated
using (user_id = public.current_user_id() and public.current_user_role() = 'student')
with check (user_id = public.current_user_id() and public.current_user_role() = 'student');

drop policy if exists quiz_attempts_read_scoped on public.quiz_attempts;
create policy quiz_attempts_read_scoped on public.quiz_attempts for select to anon, authenticated
using (user_id = public.current_user_id() or public.current_user_role() = 'lecturer');

-- Browser clients can never directly read password hashes or session tokens.
revoke all on private.user_credentials, private.user_sessions, private.login_attempts from public, anon, authenticated;
revoke all on function public.current_user_id() from public;
revoke all on function public.current_user_role() from public;
revoke all on function public.login_with_login_id(text, text, text) from public;
revoke all on function public.get_my_profile() from public;
revoke all on function public.logout_studyhub() from public;
revoke all on function public.list_quizzes_for_student() from public;
revoke all on function public.submit_quiz_attempt(uuid, jsonb, integer) from public;
grant execute on function public.current_user_id() to anon, authenticated;
grant execute on function public.current_user_role() to anon, authenticated;
grant execute on function public.login_with_login_id(text, text, text) to anon, authenticated;
grant execute on function public.get_my_profile() to anon, authenticated;
grant execute on function public.logout_studyhub() to anon, authenticated;
grant execute on function public.list_quizzes_for_student() to anon, authenticated;
grant execute on function public.submit_quiz_attempt(uuid, jsonb, integer) to anon, authenticated;

-- Private storage: students may download course files; only lecturers can upload/remove.
insert into storage.buckets (id, name, public)
values ('lecture-notes', 'lecture-notes', false)
on conflict (id) do update set public = false;
drop policy if exists lecture_notes_files_read on storage.objects;
create policy lecture_notes_files_read on storage.objects for select to anon, authenticated
using (bucket_id = 'lecture-notes' and public.current_user_id() is not null);
drop policy if exists lecture_notes_files_insert on storage.objects;
create policy lecture_notes_files_insert on storage.objects for insert to anon, authenticated
with check (bucket_id = 'lecture-notes' and public.current_user_role() = 'lecturer');
drop policy if exists lecture_notes_files_update on storage.objects;
create policy lecture_notes_files_update on storage.objects for update to anon, authenticated
using (bucket_id = 'lecture-notes' and public.current_user_role() = 'lecturer')
with check (bucket_id = 'lecture-notes' and public.current_user_role() = 'lecturer');
drop policy if exists lecture_notes_files_delete on storage.objects;
create policy lecture_notes_files_delete on storage.objects for delete to anon, authenticated
using (bucket_id = 'lecture-notes' and public.current_user_role() = 'lecturer');

-- Seed accounts are inserted only when they do not already exist. Re-running
-- this script does not reset a password an administrator has changed later.
do $$
begin
  if not exists (select 1 from public.users where login_id = 'ADMIN001') then
    insert into public.users (full_name, role, login_id, password)
    values ('Admin', 'lecturer', 'ADMIN001', 'admin123');
  end if;
  if not exists (select 1 from public.users where login_id = 'LEC001') then
    insert into public.users (full_name, role, login_id, password)
    values ('Mr. Kamal Lecturer', 'lecturer', 'LEC001', 'lecturer123');
  end if;
  if not exists (select 1 from public.users where login_id = 'STU001') then
    insert into public.users (full_name, role, login_id, password)
    values ('Nimal Student', 'student', 'STU001', 'student123');
  end if;
end;
$$;
