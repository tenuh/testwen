import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDownToLine, ArrowLeft, ArrowRight, Award, BookOpen, CalendarDays,
  Check, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, ClipboardList,
  Clock3, FilePlus2, FileText, GraduationCap, LayoutDashboard, Link2, LogOut,
  Menu, MoreHorizontal, Plus, Search, ShieldCheck, Sparkles, StickyNote, Timer,
  Trash2, UserRound, Users, Video, X, Pencil, CalendarClock, MapPin,
} from "lucide-react";
import { signIn, restoreSession, signOut } from "./lib/session.js";
import {
  listUsers, listLectureNotes, saveLectureNote, deleteLectureNote, uploadLectureFile,
  downloadLectureFile, listAssignments, saveAssignment, deleteAssignment,
  listAssignmentSubmissions, setAssignmentDone, listQuizzes, listQuizzesForStudents,
  saveQuiz, deleteQuiz, submitQuiz, listQuizAttempts, listMeetings, saveMeeting,
  deleteMeeting, listEvents, saveEvent, deleteEvent, listDeadlines,
  listStudentNotes, saveStudentNote, deleteStudentNote, listBadges, awardBadge,
  listDiary, saveDiary, deleteDiary,
} from "./lib/data.js";
import { missingSupabaseConfig } from "./lib/supabase.js";

const NAV_ITEMS = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/notes", label: "Lecture Notes", icon: BookOpen },
  { path: "/meetings", label: "Meetings", icon: Video },
  { path: "/deadlines", label: "Deadlines", icon: CalendarDays },
  { path: "/assignments", label: "Assignments & Quizzes", icon: ClipboardList },
  { path: "/events", label: "Events", icon: CalendarClock },
  { path: "/my-notes", label: "Student Notes", icon: StickyNote, student: true },
  { path: "/growth", label: "Badges & Diary", icon: Award },
  { path: "/students", label: "Students", icon: Users, lecturer: true },
  { path: "/profile", label: "Profile", icon: UserRound },
];
const PAGE_COPY = {
  "/dashboard": ["Your study desk", "A clear view of what’s happening in your construction studies."],
  "/notes": ["Lecture notes", "Find a reference, revisit a topic, or save a new class resource."],
  "/meetings": ["Meetings", "Class sessions and lecturer meetings, all in one place."],
  "/deadlines": ["Deadlines", "See the work ahead and plan your next step."],
  "/assignments": ["Assignments & quizzes", "Keep coursework moving and check your understanding."],
  "/events": ["Events", "What's coming up in your department and campus community."],
  "/my-notes": ["Student notes", "A private space for ideas, reminders, and learning takeaways."],
  "/growth": ["Badges & diary", "Notice your progress. Small steps add up to good work."],
  "/students": ["Students", "A current roster of learners in your study hub."],
  "/profile": ["Your profile", "Account details and session settings."],
};
const TODAY = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

function initials(name = "") {
  return name.trim().split(/\s+/).slice(0, 2).map((s) => s[0] || "").join("").toUpperCase() || "U";
}
function dateLabel(value, options = { month: "short", day: "numeric", year: "numeric" }) {
  if (!value) return "Date not set";
  const parsed = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString(undefined, options);
}
function dateStatus(value) {
  const day = String(value || "").slice(0, 10);
  if (!day) return "upcoming";
  if (day < TODAY()) return "overdue";
  if (day === TODAY()) return "today";
  return "upcoming";
}
function displayTime(value) {
  if (!value) return "";
  const [h, m] = String(value).split(":");
  const d = new Date();
  d.setHours(Number(h), Number(m || 0), 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function getTitle(item) { return item?.title || item?.name || item?.subject || "Untitled"; }

function Toasts({ items, dismiss }) {
  return <div className="toast-stack" aria-live="polite">{items.map((toast) =>
    <div key={toast.id} className={`toast ${toast.type}`} role="status">
      {toast.type === "error" ? <CircleAlert size={16} /> : <CheckCircle2 size={16} />}
      <span>{toast.message}</span>
      <button className="icon-button" onClick={() => dismiss(toast.id)} aria-label="Dismiss notification"><X size={14} /></button>
    </div>)}</div>;
}

function EmptyState({ icon: Icon = FileText, title, message, action }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={19} /></div><h3>{title}</h3><p>{message}</p>{action && <div style={{ marginTop: 15 }}>{action}</div>}</div>;
}

function SkeletonPage() {
  return <div className="loading-block" aria-label="Loading">
    <div className="skeleton" style={{ width: 220, height: 34, marginBottom: 7 }} />
    <div className="stats-grid">{[1, 2, 3, 4].map((i) => <div key={i} className="surface panel"><div className="skeleton loading-line" /><div className="skeleton" style={{ height: 30, width: 65, marginTop: 20 }} /></div>)}</div>
    <div className="surface panel"><div className="skeleton loading-line" style={{ width: "40%" }} />{[1, 2, 3].map((i) => <div key={i} className="skeleton loading-line" style={{ marginTop: 19, height: 38 }} />)}</div>
  </div>;
}

function Modal({ title, subtitle, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header className="modal-head"><div><h2 id="modal-title">{title}</h2>{subtitle && <div className="panel-note">{subtitle}</div>}</div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={17} /></button></header>
      <div className="modal-body">{children}</div>
      {footer && <footer className="modal-foot">{footer}</footer>}
    </section>
  </div>;
}

function Field({ label, children, hint, className = "" }) {
  return <div className={`field ${className}`}><label>{label}</label>{children}{hint && <span className="field-hint">{hint}</span>}</div>;
}

function AuthScreen({ onLogin, loading }) {
  const [role, setRole] = useState("student");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const profile = await signIn(loginId, password, role);
      onLogin(profile);
    } catch (e) {
      const msg = e?.message || "Unable to sign in. Please try again.";
      setError(msg.includes("Wrong role") ? "Wrong role. Choose the account type assigned to your Login ID." : msg.includes("Wrong ID or Password") ? "Wrong ID or Password. Check your details and try again." : msg);
    } finally { setBusy(false); }
  }
  if (loading) return <div className="auth-page"><div className="auth-aside"><div className="auth-brand"><div className="brand-mark"><GraduationCap size={20} /></div><div><div className="brand-title">Construction<br />Study Hub</div></div></div></div><div className="auth-panel-wrap"><div className="auth-panel"><div className="skeleton" style={{ height: 32, width: 190 }} /><div className="skeleton" style={{ height: 44, marginTop: 24 }} /><div className="skeleton" style={{ height: 44, marginTop: 14 }} /></div></div></div>;
  return <main className="auth-page">
    <section className="auth-aside">
      <div className="auth-brand"><div className="brand-mark"><GraduationCap size={20} /></div><div><div className="brand-title">Construction<br />Study Hub</div></div></div>
      <div className="auth-copy"><div className="eyebrow" style={{ color: "#a2b3a6" }}>Your daily study workspace</div><h1>Build your<br /><span>next chapter.</span></h1><p>Classes, coursework, and the notes that move your learning forward — together in one steady place.</p></div>
      <div className="auth-foot">A dependable place to make progress</div>
    </section>
    <section className="auth-panel-wrap"><form className="auth-panel" onSubmit={submit}>
      <div className="eyebrow">Welcome back</div><h2>Sign in to your hub</h2><p>Use the Login ID provided by your lecturer or study hub administrator.</p>
      <div className="role-tabs" role="tablist" aria-label="Account role">
        {["student", "lecturer"].map((item) => <button type="button" role="tab" aria-selected={role === item} key={item} className={`role-tab ${role === item ? "selected" : ""}`} onClick={() => { setRole(item); setError(""); }}>{item === "student" ? "Student" : "Lecturer"}</button>)}
      </div>
      {error && <div className="auth-error" role="alert"><CircleAlert size={15} />{error}</div>}
      <Field label="Login ID"><input className="input" autoComplete="username" value={loginId} onChange={(e) => setLoginId(e.target.value)} required placeholder="e.g. STU-2048" /></Field>
      <div style={{ height: 14 }} />
      <Field label="Password"><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Enter your password" /></Field>
      <button type="submit" className="button button-dark auth-submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"} {!busy && <ArrowRight size={15} />}</button>
      <p className="auth-support">No signup is needed. If you cannot access your account, contact your lecturer.</p>
    </form></section>
  </main>;
}

function App() {
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [path, setPath] = useState(window.location.pathname || "/dashboard");
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState("");
  const [data, setData] = useState({});
  const [toasts, setToasts] = useState([]);
  const [modal, setModal] = useState(null);
  const [mobileMore, setMobileMore] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedDate, setSelectedDate] = useState(TODAY());
  const [quizState, setQuizState] = useState(null);

  const notify = useCallback((message, type = "success") => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((items) => [...items, { id, message, type }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4600);
  }, []);
  const dismissToast = useCallback((id) => setToasts((items) => items.filter((item) => item.id !== id)), []);
  const navigate = useCallback((target) => {
    if (!target || target === path) { setMobileMore(false); return; }
    window.history.pushState({}, "", target);
    setPath(target);
    setSearch(""); setFilter("all"); setMobileMore(false);
  }, [path]);

  useEffect(() => {
    const onPop = () => { setPath(window.location.pathname); setMobileMore(false); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (missingSupabaseConfig.length) { setAuthLoading(false); return; }
    let live = true;
    restoreSession().then((user) => { if (live) setProfile(user); })
      .catch(() => { if (live) setProfile(null); })
      .finally(() => { if (live) setAuthLoading(false); });
    return () => { live = false; };
  }, []);

  const role = profile?.role || "student";
  const allowedNav = useMemo(() => NAV_ITEMS.filter((item) => (!item.student || role === "student") && (!item.lecturer || role === "lecturer")), [role]);
  const allowedPaths = useMemo(() => allowedNav.map((item) => item.path), [allowedNav]);
  useEffect(() => {
    if (!profile) return;
    if (!allowedPaths.includes(path)) navigate("/dashboard");
  }, [profile, path, allowedPaths, navigate]);

  const loadPage = useCallback(async () => {
    if (!profile || !allowedPaths.includes(path)) return;
    setPageLoading(true); setPageError("");
    try {
      let next = {};
      if (path === "/dashboard") {
        const [deadlines, meetings, assignments, submissions, badges, events] = await Promise.all([
          listDeadlines(), listMeetings(), listAssignments(), listAssignmentSubmissions(), listBadges(role === "student" ? profile.id : undefined), listEvents(),
        ]);
        next = { deadlines, meetings, assignments, submissions, badges, events };
      } else if (path === "/notes") next.notes = await listLectureNotes(search);
      else if (path === "/meetings") next.meetings = await listMeetings();
      else if (path === "/deadlines") next.deadlines = await listDeadlines();
      else if (path === "/assignments") {
        const [assignments, submissions, quizzes, attempts] = await Promise.all([
          listAssignments(), listAssignmentSubmissions(), role === "lecturer" ? listQuizzes() : listQuizzesForStudents(), listQuizAttempts(),
        ]);
        next = { assignments, submissions, quizzes, attempts };
      } else if (path === "/events") next.events = await listEvents();
      else if (path === "/my-notes") next.studentNotes = await listStudentNotes(profile.id);
      else if (path === "/growth") {
        const [badges, diary, users] = await Promise.all([
          listBadges(role === "student" ? profile.id : undefined),
          role === "student" ? listDiary(profile.id) : Promise.resolve([]),
          role === "lecturer" ? listUsers() : Promise.resolve([]),
        ]);
        next = { badges, diary, users };
      } else if (path === "/students") next.users = (await listUsers()).filter((user) => user.role === "student");
      setData((old) => ({ ...old, [path]: next }));
    } catch (e) {
      setPageError(e?.message || "We couldn't load this page. Please try again.");
    } finally { setPageLoading(false); }
  }, [profile, path, role, search, allowedPaths]);
  useEffect(() => { loadPage(); }, [loadPage]);

  async function refresh() { await loadPage(); }
  async function logout() {
    try { await signOut(); } catch (e) { notify(e?.message || "Could not close your session.", "error"); }
    setProfile(null); setData({}); setPath("/dashboard"); window.history.replaceState({}, "", "/dashboard");
  }
  function requireDelete(itemTitle) { return window.confirm(`Delete “${itemTitle}”? This cannot be undone.`); }

  const currentData = data[path] || {};
  const pageHeading = PAGE_COPY[path] || PAGE_COPY["/dashboard"];
  const openModal = (kind, item = null) => setModal({ kind, item });

  async function deleteItem(kind, item) {
    if (!requireDelete(getTitle(item))) return;
    try {
      if (kind === "note") await deleteLectureNote(item.id);
      if (kind === "assignment") await deleteAssignment(item.id);
      if (kind === "quiz") await deleteQuiz(item.id);
      if (kind === "meeting") await deleteMeeting(item.id);
      if (kind === "event") await deleteEvent(item.id);
      if (kind === "student-note") await deleteStudentNote(item.id);
      if (kind === "diary") await deleteDiary(item.id);
      notify("Removed successfully.");
      await refresh();
    } catch (e) { notify(e?.message || "That change could not be saved.", "error"); }
  }

  async function saveRecord(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form.entries());
    const { kind, item } = modal;
    const id = item?.id;
    const setValue = (key, value) => { values[key] = value; };
    try {
      if (kind === "note") {
        const file = form.get("file");
        let fileUrl = item?.file_url || "";
        if (file && file.size) fileUrl = await uploadLectureFile(file);
        await saveLectureNote({ title: values.title.trim(), subject: values.subject.trim(), description: values.description.trim(), file_url: fileUrl || null }, id);
      } else if (kind === "meeting") {
        await saveMeeting({ title: values.title.trim(), meeting_date: values.meeting_date, meeting_time: values.meeting_time || null, join_url: values.join_url.trim(), description: values.description.trim() }, id);
      } else if (kind === "assignment") {
        await saveAssignment({ title: values.title.trim(), subject: values.subject.trim() || "General", description: values.description.trim(), deadline: values.deadline || null }, id);
      } else if (kind === "event") {
        await saveEvent({ title: values.title.trim(), event_date: values.event_date, event_time: values.event_time || null, location: values.location.trim(), description: values.description.trim() }, id);
      } else if (kind === "student-note") {
        await saveStudentNote({ user_id: profile.id, title: values.title.trim(), content: values.content.trim() }, id);
      } else if (kind === "diary") {
        await saveDiary({ user_id: profile.id, date: values.date || TODAY(), reflection: values.reflection.trim(), mood: values.mood || "steady" }, id);
      } else if (kind === "quiz") {
        let questions;
        try { questions = JSON.parse(values.questions); } catch { throw new Error("Questions must be valid JSON."); }
        if (!Array.isArray(questions) || !questions.length || questions.some((q) => !q.prompt?.trim() || !Array.isArray(q.options) || q.options.length < 2 || q.options.some((option) => !option.trim()) || !Number.isInteger(Number(q.correctIndex)) || Number(q.correctIndex) >= q.options.length)) {
          throw new Error("Add a prompt, at least two answer options, and mark one correct answer for every question.");
        }
        await saveQuiz({ title: values.title.trim(), subject: values.subject.trim() || "General", deadline: values.deadline || null, description: values.description.trim(), duration_minutes: Number(values.duration_minutes) || 10, questions }, id);
      }
      setModal(null); notify(id ? "Changes saved." : "Added to your hub."); await refresh();
    } catch (e) { notify(e?.message || "That change could not be saved.", "error"); }
  }

  async function awardToStudent(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await awardBadge({ user_id: form.get("user_id"), name: form.get("name").trim(), description: form.get("description").trim() });
      setModal(null); notify("Badge awarded."); await refresh();
    } catch (e) { notify(e?.message || "Badge could not be awarded.", "error"); }
  }

  async function downloadNote(note) {
    if (!note.file_url) { notify("This note has no file attached.", "error"); return; }
    try {
      const blob = await downloadLectureFile(note.file_url);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = note.file_name || note.file_url.split("/").pop() || "lecture-note";
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    } catch (e) { notify(e?.message || "Download failed. Try again.", "error"); }
  }

  async function markDone(assignmentId, isDone) {
    try { await setAssignmentDone(assignmentId, profile.id, isDone); notify(isDone ? "Assignment marked complete." : "Completion unchecked."); await refresh(); }
    catch (e) { notify(e?.message || "Progress could not be updated.", "error"); }
  }

  function startQuiz(quiz) {
    const questions = quiz.questions || [];
    setQuizState({ quiz, answers: {}, startedAt: Date.now(), seconds: Math.max(60, (Number(quiz.duration_minutes) || 10) * 60), submitting: false });
  }
  useEffect(() => {
    if (!quizState || quizState.result || quizState.submitting) return;
    const timer = window.setInterval(() => setQuizState((state) => {
      if (!state || state.result) return state;
      if (state.seconds <= 1) return { ...state, seconds: 0 };
      return { ...state, seconds: state.seconds - 1 };
    }), 1000);
    return () => window.clearInterval(timer);
  }, [quizState?.quiz?.id, Boolean(quizState?.result), Boolean(quizState?.submitting)]);
  useEffect(() => {
    if (quizState?.seconds === 0 && !quizState.result && !quizState.submitting) submitQuizNow();
    // Timer expiration intentionally triggers the same API submission flow as the button.
  }, [quizState?.seconds]);
  async function submitQuizNow() {
    if (!quizState || quizState.submitting || quizState.result) return;
    const current = quizState;
    setQuizState((state) => state && ({ ...state, submitting: true }));
    const answers = Object.entries(current.answers).map(([questionIndex, answerIndex]) => ({ questionIndex: Number(questionIndex), answerIndex: Number(answerIndex) }));
    try {
      const result = await submitQuiz(current.quiz.id, answers, Math.max(0, Math.floor((Date.now() - current.startedAt) / 1000)));
      setQuizState((state) => state && ({ ...state, result, submitting: false }));
      notify("Quiz submitted.");
      await refresh();
    } catch (e) {
      setQuizState((state) => state && ({ ...state, submitting: false }));
      notify(e?.message || "Your quiz could not be submitted.", "error");
    }
  }

  if (missingSupabaseConfig.length) {
    return <main className="app-shell min-h-screen"><Toasts items={toasts} dismiss={dismissToast} /><section className="surface setup-card">
      <div className="empty-icon"><ShieldCheck size={21} /></div><div className="eyebrow">One quick setup step</div>
      <h1 className="page-title">Connect your study hub</h1>
      <p className="page-subtitle" style={{ marginBottom: 22 }}>This workspace uses Supabase for accounts, course records, and private lecture files. Add the missing configuration values to your environment to continue.</p>
      <div className="setup-code">{missingSupabaseConfig.join("  ·  ")}</div>
      <p className="row-meta" style={{ marginTop: 15 }}>Once configured, refresh this page. No course data is stored in this browser.</p>
    </section></main>;
  }
  if (!profile) return <><Toasts items={toasts} dismiss={dismissToast} /><AuthScreen loading={authLoading} onLogin={(user) => { setProfile(user); navigate("/dashboard"); }} /></>;

  const navLink = (item, mobile = false) => {
    const Icon = item.icon;
    return <a key={item.path} className={`nav-link ${path === item.path ? "active" : ""}`} href={item.path} onClick={(e) => { e.preventDefault(); navigate(item.path); }} aria-current={path === item.path ? "page" : undefined}><Icon size={17} /><span>{item.label}</span></a>;
  };
  const mainMobileNav = ["/dashboard", "/notes", "/assignments", "/deadlines"].map((itemPath) => allowedNav.find((item) => item.path === itemPath)).filter(Boolean);
  const otherMobile = allowedNav.filter((item) => !mainMobileNav.includes(item));

  return <div className="app-shell min-h-screen">
    <Toasts items={toasts} dismiss={dismissToast} />
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><GraduationCap size={20} /></div><div><div className="brand-title">Construction<br />Study Hub</div><div className="brand-sub">Field notes for learning</div></div></div>
      <div className="nav-label">Workspace</div><nav className="nav-list" aria-label="Main navigation">{allowedNav.map((item) => navLink(item))}</nav>
      <div className="sidebar-spacer" />
      <div className="side-profile"><div className="avatar">{initials(profile.full_name)}</div><div style={{ minWidth: 0 }}><div className="profile-name">{profile.full_name || "Study Hub user"}</div><div className="profile-role">{role}</div></div><button className="logout-side" title="Sign out" aria-label="Sign out" onClick={logout}><LogOut size={16} /></button></div>
    </aside>
    {mobileMore && <div className="mobile-drawer">{otherMobile.map((item) => navLink(item, true))}<button className="nav-link" onClick={logout}><LogOut size={17} /><span>Sign out</span></button></div>}
    <div className="main-area">
      <header className="topbar"><div><div className="top-kicker">Construction Study Hub</div><div className="top-date">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div></div><span className="role-chip">{role}</span></header>
      <main className="main-content">
        <div className="page-heading"><div><div className="eyebrow">Study workspace</div><h1 className="page-title">{pageHeading[0]}</h1><p className="page-subtitle">{pageHeading[1]}</p></div>{renderAddButton(path, role, () => openModal(path === "/growth" ? (role === "lecturer" ? "award" : "diary") : getCreateKind(path)))}</div>
        {pageLoading && !currentData[resourceFor(path)] ? <SkeletonPage /> : pageError ? <div className="surface panel"><EmptyState icon={CircleAlert} title="Couldn't load this page" message={pageError} action={<button className="button button-primary" onClick={refresh}>Try again</button>} /></div> :
          <PageBody
            path={path} role={role} profile={profile} data={currentData} search={search} setSearch={setSearch} filter={filter} setFilter={setFilter}
            selectedDate={selectedDate} setSelectedDate={setSelectedDate} onEdit={openModal} onDelete={deleteItem} onDownload={downloadNote}
            onDone={markDone} onStartQuiz={startQuiz} onAward={() => openModal("award")} navigate={navigate} notify={notify} onLogout={logout}
          />}
      </main>
    </div>
    <nav className="mobile-nav" aria-label="Mobile navigation">{mainMobileNav.map((item) => navLink(item, true))}<button className={`more-mobile ${mobileMore ? "active" : ""}`} onClick={() => setMobileMore((v) => !v)} aria-expanded={mobileMore}><MoreHorizontal size={19} /><span>More</span></button></nav>
    {modal && <EditorModal modal={modal} role={role} data={currentData} onClose={() => setModal(null)} onSave={saveRecord} onAward={awardToStudent} />}
    {quizState && <QuizModal state={quizState} setState={setQuizState} onClose={() => setQuizState(null)} onSubmit={submitQuizNow} />}
  </div>;
}

function resourceFor(path) {
  return ({ "/dashboard": "deadlines", "/notes": "notes", "/meetings": "meetings", "/deadlines": "deadlines", "/assignments": "assignments", "/events": "events", "/my-notes": "studentNotes", "/growth": "badges", "/students": "users" })[path];
}
function getCreateKind(path) {
  return ({ "/notes": "note", "/meetings": "meeting", "/assignments": "assignment", "/events": "event", "/my-notes": "student-note" })[path] || null;
}
function renderAddButton(path, role, onClick) {
  const byPath = {
    "/notes": "Add lecture note", "/meetings": "Schedule meeting", "/assignments": "Add assignment / quiz",
    "/events": "Add event", "/my-notes": "New private note", "/growth": role === "lecturer" ? "Award a badge" : "Write diary entry",
  };
  if (path === "/growth" && role === "lecturer") return <button className="button button-primary" onClick={onClick}><Plus size={15} />{byPath[path]}</button>;
  if (!byPath[path] || (path === "/growth" && role !== "student")) return null;
  return <button className="button button-primary" onClick={onClick}><Plus size={15} />{byPath[path]}</button>;
}

function PageBody({ path, role, profile, data, search, setSearch, filter, setFilter, selectedDate, setSelectedDate, onEdit, onDelete, onDownload, onDone, onStartQuiz, onAward, navigate, notify, onLogout }) {
  if (path === "/dashboard") return <Dashboard data={data} role={role} profile={profile} navigate={navigate} />;
  if (path === "/notes") return <NotesPage data={data} role={role} search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} onEdit={onEdit} onDelete={onDelete} onDownload={onDownload} />;
  if (path === "/meetings") return <MeetingsPage data={data} role={role} onEdit={onEdit} onDelete={onDelete} />;
  if (path === "/deadlines") return <DeadlinesPage data={data} role={role} selectedDate={selectedDate} setSelectedDate={setSelectedDate} />;
  if (path === "/assignments") return <AssignmentsPage data={data} role={role} profile={profile} onEdit={onEdit} onDelete={onDelete} onDone={onDone} onStartQuiz={onStartQuiz} />;
  if (path === "/events") return <EventsPage data={data} role={role} onEdit={onEdit} onDelete={onDelete} />;
  if (path === "/my-notes") return <StudentNotesPage data={data} onEdit={onEdit} onDelete={onDelete} />;
  if (path === "/growth") return <GrowthPage data={data} role={role} onEdit={onEdit} onDelete={onDelete} onAward={onAward} />;
  if (path === "/students") return <StudentsPage data={data} />;
  if (path === "/profile") return <ProfilePage profile={profile} role={role} onLogout={onLogout} />;
  return <EmptyState title="Page not found" message="Choose a destination from your workspace navigation." />;
}

function Dashboard({ data, role, profile, navigate }) {
  const deadlines = data.deadlines || [];
  const assignments = data.assignments || [];
  const submissions = data.submissions || [];
  const badges = data.badges || [];
  const meetings = (data.meetings || []).filter((item) => item.meeting_date >= TODAY());
  const todaysMeetings = meetings.filter((item) => item.meeting_date === TODAY());
  const pending = assignments.filter((a) => !submissions.some((s) => s.assignment_id === a.id && s.user_id === profile.id)).length;
  const upcomingDeadlines = deadlines.filter((d) => dateStatus(d.due_date) !== "overdue" && (role !== "student" || !d.completed)).slice(0, 4);
  const nextMeeting = [...meetings].sort((a, b) => `${a.meeting_date} ${a.meeting_time || ""}`.localeCompare(`${b.meeting_date} ${b.meeting_time || ""}`))[0];
  return <>
    <section className="stats-grid">
      <Stat icon={BookOpen} label="Open assignments" value={role === "student" ? pending : assignments.length} foot={role === "student" ? "Your coursework in progress" : "Across the study hub"} />
      <Stat icon={CalendarDays} label="Upcoming deadlines" value={upcomingDeadlines.length} foot="Next items to plan for" />
      <Stat icon={Video} label="Classes today" value={todaysMeetings.length} foot={todaysMeetings.length ? "On your class calendar" : "No sessions scheduled"} />
      <Stat icon={Award} label="Badges earned" value={badges.length} foot={role === "student" ? "A record of your progress" : "Recently awarded"} />
    </section>
    <div className="dashboard-grid">
      <div className="stack">
        <section className="surface panel"><div className="panel-head"><div><h2 className="panel-title">Today’s classes</h2><div className="panel-note">Sessions on your calendar</div></div><button className="button button-small button-quiet" onClick={() => navigate("/meetings")}>All meetings <ArrowRight size={13} /></button></div>
          {todaysMeetings.length ? todaysMeetings.map((m) => <div className="list-row" key={m.id}><div className="date-block"><b>{displayTime(m.meeting_time) || "—"}</b><span>today</span></div><div className="row-main"><div className="row-title">{getTitle(m)}</div><div className="row-meta">{m.subject || "General"}{m.description ? ` · ${m.description}` : " · Class session"}{m.meeting_time ? ` · ${displayTime(m.meeting_time)}` : ""}</div></div>{m.join_url && <a className="button button-small button-dark" href={m.join_url} target="_blank" rel="noreferrer"><Video size={13} /> Join</a>}</div>) : <EmptyState icon={Video} title="A little room in your day" message="No classes are scheduled for today." />}
        </section>
        <section className="surface panel"><div className="panel-head"><div><h2 className="panel-title">Upcoming deadlines</h2><div className="panel-note">A short look at what's next</div></div><button className="button button-small button-quiet" onClick={() => navigate("/deadlines")}>View calendar <ArrowRight size={13} /></button></div>
          {upcomingDeadlines.length ? upcomingDeadlines.map((d) => <DeadlineRow key={d.id} item={d} />) : <EmptyState icon={CheckCircle2} title="Nothing due soon" message="There are no upcoming deadlines to show." />}
        </section>
      </div>
      <div className="stack">
        <section className="surface panel meeting-highlight"><div className="panel-head" style={{ marginBottom: 8 }}><div><div className="eyebrow" style={{ marginBottom: 4 }}>Next meeting</div><h2 className="panel-title">{nextMeeting ? getTitle(nextMeeting) : "No meeting scheduled"}</h2></div><div className="stat-icon"><Video size={15} /></div></div>
          {nextMeeting ? <><div className="meeting-time">{dateLabel(nextMeeting.meeting_date, { month: "short", day: "numeric" })}{nextMeeting.meeting_time ? ` · ${displayTime(nextMeeting.meeting_time)}` : ""}</div><div className="row-meta">{nextMeeting.description || "Session details"}</div>{nextMeeting.join_url && <a href={nextMeeting.join_url} className="button button-dark" target="_blank" rel="noreferrer" style={{ marginTop: 16 }}><Video size={14} /> Join meeting</a>}</> : <div className="row-meta" style={{ marginTop: 11 }}>New meetings will appear here.</div>}
        </section>
        <section className="surface panel"><div className="panel-head"><div><h2 className="panel-title">{role === "student" ? "Recent badges" : "Recent recognition"}</h2><div className="panel-note">Progress worth noticing</div></div><button className="icon-button" aria-label="Open badges and diary" onClick={() => navigate("/growth")}><ArrowRight size={16} /></button></div>
          {badges.slice(0, 3).length ? badges.slice(0, 3).map((badge) => <BadgeRow key={badge.id} badge={badge} />) : <EmptyState icon={Award} title="Your milestones start here" message={role === "student" ? "Badges awarded for your work will appear here." : "Recognition awarded to students will appear here."} />}
        </section>
      </div>
    </div>
  </>;
}

function Stat({ icon: Icon, label, value, foot }) {
  return <section className="surface stat-card"><div className="panel-head" style={{ marginBottom: 0 }}><div className="stat-label">{label}</div><div className="stat-icon"><Icon size={15} /></div></div><div className="stat-value">{value}</div><div className="stat-foot">{foot}</div></section>;
}
function DeadlineRow({ item }) {
  const status = dateStatus(item.due_date);
  return <div className="deadline-item"><div className={`deadline-indicator ${status}`} /><div className="row-main"><div className="row-title">{getTitle(item)}</div><div className="row-meta">{dateLabel(item.due_date)}{item.description ? ` · ${item.description}` : ""}</div></div><StatusPill status={status} /></div>;
}
function StatusPill({ status }) {
  return <span className={`pill ${status === "overdue" ? "pill-red" : status === "today" ? "pill-orange" : "pill-green"}`}>{status}</span>;
}
function BadgeRow({ badge, userName }) {
  return <div className="badge-row"><div className="badge-medal"><Award size={17} /></div><div className="row-main"><div className="row-title">{badge.name || badge.title || "Study milestone"}{userName ? ` · ${userName}` : ""}</div><div className="row-meta">{badge.description || "Recognized for steady progress"}{badge.awarded_at ? ` · ${dateLabel(badge.awarded_at)}` : ""}</div></div></div>;
}

function NotesPage({ data, role, search, setSearch, filter, setFilter, onEdit, onDelete, onDownload }) {
  const notes = data.notes || [];
  const filtered = notes.filter((note) => filter === "all" || (filter === "files" ? Boolean(note.file_url) : !note.file_url));
  return <>
    <div className="filter-row"><div className="search-wrap"><Search size={15} /><input className="input" placeholder="Search subjects and titles" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search lecture notes" /></div><select className="select" style={{ width: 145 }} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter notes"><option value="all">All notes</option><option value="files">With files</option><option value="text">Text only</option></select></div>
    {filtered.length ? <div className="note-grid">{filtered.map((note) => <article className="surface note-card" key={note.id}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span className="pill pill-green">{note.subject || "Lecture"}</span><span className="row-meta">{dateLabel(note.created_at, { month: "short", day: "numeric" })}</span></div><h3>{getTitle(note)}</h3><p>{note.description || "No summary has been added."}</p><div className="note-actions">{note.file_url && <button className="button button-small" onClick={() => onDownload(note)}><ArrowDownToLine size={13} /> Download</button>}{role === "lecturer" && <><button className="icon-button" title="Edit note" aria-label="Edit note" onClick={() => onEdit("note", note)}><Pencil size={14} /></button><button className="icon-button" title="Delete note" aria-label="Delete note" onClick={() => onDelete("note", note)}><Trash2 size={14} /></button></>}</div></article>)}</div> : <section className="surface"><EmptyState icon={BookOpen} title={search ? "No matching notes" : "No lecture notes yet"} message={search ? "Try another subject or title." : role === "lecturer" ? "Add a class reference so students can find it here." : "Lecture resources shared by your lecturer will appear here."} /></section>}
  </>;
}

function MeetingsPage({ data, role, onEdit, onDelete }) {
  const meetings = data.meetings || [];
  const ordered = [...meetings].sort((a, b) => `${a.meeting_date} ${a.meeting_time || ""}`.localeCompare(`${b.meeting_date} ${b.meeting_time || ""}`));
  return <section className="surface panel"><div className="panel-head"><div><h2 className="panel-title">Class calendar</h2><div className="panel-note">Scheduled sessions and join details</div></div><span className="pill pill-gray">{meetings.length} {meetings.length === 1 ? "meeting" : "meetings"}</span></div>
    {ordered.length ? ordered.map((m) => <div className="list-row" key={m.id}><div className="date-block"><b>{new Date(`${String(m.meeting_date).slice(0, 10)}T12:00:00`).getDate()}</b><span>{new Date(`${String(m.meeting_date).slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: "short" })}</span></div><div className="row-main"><div className="row-title">{getTitle(m)}</div><div className="row-meta">{m.subject || "General"} · {dateLabel(m.meeting_date)}{m.meeting_time ? ` · ${displayTime(m.meeting_time)}` : ""}{m.description ? ` · ${m.description}` : ""}</div></div>{m.join_url && <a className="button button-small button-dark" href={m.join_url} target="_blank" rel="noreferrer"><Video size={13} /> Join</a>}{role === "lecturer" && <><button className="icon-button" aria-label="Edit meeting" onClick={() => onEdit("meeting", m)}><Pencil size={14} /></button><button className="icon-button" aria-label="Delete meeting" onClick={() => onDelete("meeting", m)}><Trash2 size={14} /></button></>}</div>) : <EmptyState icon={Video} title="No meetings scheduled" message={role === "lecturer" ? "Schedule a class session or student meeting to get started." : "Your upcoming class sessions will be listed here."} />}
  </section>;
}

function DeadlinesPage({ data, role, selectedDate, setSelectedDate }) {
  const deadlines = data.deadlines || [];
  const month = new Date(`${selectedDate}T12:00:00`);
  const year = month.getFullYear(), monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const lastDate = new Date(year, monthIndex + 1, 0).getDate();
  const priorLast = new Date(year, monthIndex, 0).getDate();
  const dayCells = Array.from({ length: 42 }, (_, i) => {
    const day = i - firstDay + 1;
    const inMonth = day > 0 && day <= lastDate;
    const d = inMonth ? new Date(year, monthIndex, day) : day <= 0 ? new Date(year, monthIndex - 1, priorLast + day) : new Date(year, monthIndex + 1, day - lastDate);
    return { date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, day: d.getDate(), inMonth };
  });
  const monthDeadlines = deadlines.filter((d) => String(d.due_date || "").slice(0, 7) === selectedDate.slice(0, 7));
  const selected = deadlines.filter((d) => String(d.due_date || "").slice(0, 10) === selectedDate);
  const counts = { overdue: deadlines.filter((d) => dateStatus(d.due_date) === "overdue").length, today: deadlines.filter((d) => dateStatus(d.due_date) === "today").length, upcoming: deadlines.filter((d) => dateStatus(d.due_date) === "upcoming").length };
  const progressItems = deadlines.filter((deadline) => deadline.type === "assignment" || deadline.type === "quiz");
  const completedCount = progressItems.filter((d) => d.completed || d.is_completed || d.completed_at).length;
  const completionPercent = progressItems.length ? Math.round(completedCount / progressItems.length * 100) : 0;
  function shiftMonth(dir) { const d = new Date(year, monthIndex + dir, 1); setSelectedDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`); }
  return <>
    <div className="stats-grid"><Stat icon={CircleAlert} label="Overdue" value={counts.overdue} foot="Past the due date" /><Stat icon={Clock3} label="Due today" value={counts.today} foot="Needs attention today" /><Stat icon={ArrowRight} label="Coming up" value={counts.upcoming} foot="Future deadlines" /><Stat icon={CheckCircle2} label={role === "student" ? "Coursework done" : "Coursework tracked"} value={role === "student" ? `${completionPercent}%` : progressItems.length} foot={role === "student" ? `${completedCount} of ${progressItems.length} assignments and quizzes` : "Assignments and quizzes"} /></div>
    {role === "student" && progressItems.length > 0 && <div className="surface panel" style={{ marginBottom: 16, padding: "14px 18px" }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 9 }}><span className="row-title">Coursework completion</span><span className="row-meta">{completedCount} / {progressItems.length}</span></div><div className="progress-track"><div className="progress-fill" style={{ width: `${completionPercent}%` }} /></div></div>}
    <div className="calendar-layout">
      <section className="surface panel"><div className="calendar-top"><button className="icon-button" onClick={() => shiftMonth(-1)} aria-label="Previous month"><ChevronLeft size={17} /></button><div className="calendar-month">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div><button className="icon-button" onClick={() => shiftMonth(1)} aria-label="Next month"><ChevronRight size={17} /></button></div>
        <div className="calendar-grid">{["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => <div className="calendar-dow" key={d}>{d}</div>)}{dayCells.map((cell) => {
          const onDay = deadlines.filter((d) => String(d.due_date || "").slice(0, 10) === cell.date);
          return <button key={cell.date} className={`calendar-day ${cell.inMonth ? "" : "outside"} ${selectedDate === cell.date ? "selected" : ""}`} onClick={() => setSelectedDate(cell.date)} aria-label={`${dateLabel(cell.date)}${onDay.length ? `, ${onDay.length} deadlines` : ""}`}>{cell.day}{onDay.length > 0 && <span className="day-dots">{onDay.slice(0, 3).map((d) => <i className={`day-dot ${dateStatus(d.due_date) === "overdue" ? "overdue" : ""}`} key={d.id} />)}</span>}</button>;
        })}</div>
        <div className="row-meta" style={{ marginTop: 16 }}>{monthDeadlines.length} deadline{monthDeadlines.length === 1 ? "" : "s"} in this month</div>
      </section>
      <section className="surface panel"><div className="panel-head"><div><h2 className="panel-title">{dateLabel(selectedDate)}</h2><div className="panel-note">Deadlines for the selected day</div></div><span className="pill pill-gray">{selected.length}</span></div>
        {selected.length ? selected.map((d) => <DeadlineRow item={d} key={d.id} />) : <EmptyState icon={CheckCircle2} title="No deadlines this day" message="Choose another date to see what is due." />}
      </section>
    </div>
    <section className="surface panel" style={{ marginTop: 16 }}><div className="panel-head"><div><h2 className="panel-title">All deadlines</h2><div className="panel-note">Sorted by due date</div></div><span className="pill pill-gray">{deadlines.length} total</span></div>
      {deadlines.length ? [...deadlines].sort((a, b) => String(a.due_date).localeCompare(String(b.due_date))).map((d) => <DeadlineRow item={d} key={d.id} />) : <EmptyState icon={CalendarDays} title="No deadlines listed" message="Deadlines from your classes will appear here." />}
    </section>
  </>;
}

function AssignmentsPage({ data, role, profile, onEdit, onDelete, onDone, onStartQuiz }) {
  const assignments = data.assignments || [], submissions = data.submissions || [], quizzes = data.quizzes || [], attempts = data.attempts || [];
  const mine = submissions.filter((s) => s.user_id === profile.id);
  const done = (id) => mine.some((s) => s.assignment_id === id);
  const completedCount = assignments.filter((a) => done(a.id)).length;
  return <div className="stack">
    <section className="surface panel"><div className="panel-head"><div><h2 className="panel-title">Assignments</h2><div className="panel-note">{role === "student" ? "Mark work complete when you’ve submitted it." : "Coursework currently assigned to students."}</div></div><span className="pill pill-green">{role === "student" ? `${completedCount} / ${assignments.length} complete` : `${assignments.length} listed`}</span></div>
      {role === "student" && assignments.length > 0 && <div className="progress-track" style={{ marginBottom: 12 }}><div className="progress-fill" style={{ width: `${Math.round(completedCount / assignments.length * 100)}%` }} /></div>}
      {assignments.length ? assignments.map((a) => <div className="list-row" key={a.id}><div className={`stat-icon ${done(a.id) ? "" : ""}`}>{done(a.id) ? <Check size={16} /> : <ClipboardList size={15} />}</div><div className="row-main"><div className="row-title">{getTitle(a)}</div><div className="row-meta">{a.subject || "General"} · {a.description || "No instructions added."}{(a.deadline || a.due_date) ? ` · Due ${dateLabel(a.deadline || a.due_date)}` : ""}</div></div>{role === "student" ? <button className={`button button-small ${done(a.id) ? "" : "button-primary"}`} onClick={() => onDone(a.id, !done(a.id))}>{done(a.id) ? <><Check size={13} /> Completed</> : "Mark done"}</button> : <><button className="icon-button" aria-label="Edit assignment" onClick={() => onEdit("assignment", a)}><Pencil size={14} /></button><button className="icon-button" aria-label="Delete assignment" onClick={() => onDelete("assignment", a)}><Trash2 size={14} /></button></>}</div>) : <EmptyState icon={ClipboardList} title="No assignments yet" message={role === "lecturer" ? "Add an assignment to share coursework with students." : "New coursework from your lecturers will appear here."} />}
    </section>
    <section className="surface panel"><div className="panel-head"><div><h2 className="panel-title">Quizzes</h2><div className="panel-note">Short checks for understanding</div></div>{role === "lecturer" && <button className="button button-small" onClick={() => onEdit("quiz", null)}><Plus size={13} /> Create quiz</button>}</div>
      {quizzes.length ? quizzes.map((quiz) => {
        const attempt = attempts.find((a) => a.quiz_id === quiz.id && a.user_id === profile.id);
        const questions = quiz.questions || [];
        return <div className="list-row" key={quiz.id}><div className="stat-icon"><Sparkles size={15} /></div><div className="row-main"><div className="row-title">{getTitle(quiz)}</div><div className="row-meta">{quiz.subject || "General"} · {quiz.description || `${questions.length} question${questions.length === 1 ? "" : "s"}`}{quiz.deadline ? ` · Due ${dateLabel(quiz.deadline)}` : ""}{quiz.duration_minutes ? ` · ${quiz.duration_minutes} min` : ""}{attempt && Number.isFinite(Number(attempt.score)) ? ` · Last score ${attempt.score}%` : ""}</div></div>{role === "student" ? <button className="button button-small button-dark" onClick={() => onStartQuiz(quiz)}>{attempt ? "Try again" : "Start quiz"} <ArrowRight size={13} /></button> : <><button className="icon-button" aria-label="Edit quiz" onClick={() => onEdit("quiz", quiz)}><Pencil size={14} /></button><button className="icon-button" aria-label="Delete quiz" onClick={() => onDelete("quiz", quiz)}><Trash2 size={14} /></button></>}</div>;
      }) : <EmptyState icon={Sparkles} title="No quizzes available" message={role === "lecturer" ? "Create a short quiz to check understanding." : "Quizzes shared by your lecturer will appear here."} />}
    </section>
    {role === "student" && attempts.length > 0 && <section className="surface panel"><div className="panel-head"><div><h2 className="panel-title">Quiz attempts</h2><div className="panel-note">Your recent submissions</div></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Quiz</th><th>Score</th><th>Completed</th></tr></thead><tbody>{attempts.filter((a) => a.user_id === profile.id).map((attempt) => <tr key={attempt.id}><td>{quizzes.find((q) => q.id === attempt.quiz_id)?.title || "Quiz"}</td><td>{attempt.score ?? "—"}</td><td>{dateLabel(attempt.completed_at)}</td></tr>)}</tbody></table></div></section>}
  </div>;
}

function EventsPage({ data, role, onEdit, onDelete }) {
  const events = (data.events || []).filter((event) => !event.event_date || event.event_date >= TODAY());
  return <section className="surface panel"><div className="panel-head"><div><h2 className="panel-title">Coming up</h2><div className="panel-note">Upcoming department and campus events</div></div><span className="pill pill-gray">{events.length} events</span></div>
    {events.length ? [...events].sort((a, b) => String(a.event_date).localeCompare(String(b.event_date))).map((event) => <div className="list-row" key={event.id}><div className="date-block"><b>{event.event_date ? new Date(`${String(event.event_date).slice(0, 10)}T12:00:00`).getDate() : "—"}</b><span>{event.event_date ? new Date(`${String(event.event_date).slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: "short" }) : "event"}</span></div><div className="row-main"><div className="row-title">{getTitle(event)}</div><div className="row-meta">{event.description || "A hub event"}{event.event_time ? ` · ${displayTime(event.event_time)}` : ""}{event.location ? ` · ${event.location}` : ""}</div></div>{role === "lecturer" && <><button className="icon-button" aria-label="Edit event" onClick={() => onEdit("event", event)}><Pencil size={14} /></button><button className="icon-button" aria-label="Delete event" onClick={() => onDelete("event", event)}><Trash2 size={14} /></button></>}</div>) : <EmptyState icon={CalendarClock} title="No upcoming events" message={role === "lecturer" ? "Add a site visit, workshop, or department event." : "New events will appear here when they are announced."} />}
  </section>;
}

function StudentNotesPage({ data, onEdit, onDelete }) {
  const notes = data.studentNotes || [];
  return notes.length ? <div className="note-grid">{notes.map((note) => <article className="surface note-card" key={note.id}><div className="eyebrow">{dateLabel(note.updated_at || note.created_at, { month: "short", day: "numeric" })}</div><h3>{getTitle(note)}</h3><p style={{ whiteSpace: "pre-wrap" }}>{note.content || "No note content."}</p><div className="note-actions"><button className="icon-button" aria-label="Edit private note" onClick={() => onEdit("student-note", note)}><Pencil size={14} /></button><button className="icon-button" aria-label="Delete private note" onClick={() => onDelete("student-note", note)}><Trash2 size={14} /></button></div></article>)}</div> : <section className="surface"><EmptyState icon={StickyNote} title="A fresh page" message="Keep a reminder, idea, or learning takeaway here. These notes are private to your account." /></section>;
}

function GrowthPage({ data, role, onEdit, onDelete, onAward }) {
  const badges = data.badges || [], diary = data.diary || [], users = data.users || [];
  return <div className="growth-grid">
    <section className="surface panel"><div className="panel-head"><div><h2 className="panel-title">{role === "student" ? "Your badges" : "Student recognition"}</h2><div className="panel-note">{role === "student" ? "Milestones and skills recognized along the way." : "Recognition awarded to learners."}</div></div>{role === "lecturer" && <button className="button button-small button-primary" onClick={onAward}><Plus size={13} /> Award</button>}</div>
      {badges.length ? badges.map((badge) => <BadgeRow key={badge.id} badge={badge} userName={role === "lecturer" ? users.find((u) => u.id === badge.user_id)?.full_name : null} />) : <EmptyState icon={Award} title="No badges just yet" message={role === "student" ? "When your lecturer recognizes your work, your badge will show up here." : "Choose a student and award a badge for their progress."} />}
    </section>
    {role === "student" && <section className="surface panel"><div className="panel-head"><div><h2 className="panel-title">Study diary</h2><div className="panel-note">A private record of how your learning is going.</div></div><button className="button button-small" onClick={() => onEdit("diary", diary.find((entry) => entry.date === TODAY()) || null)}><Plus size={13} /> Write entry</button></div>
      {diary.length ? diary.map((entry) => <article className="diary-entry" key={entry.id}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}><div style={{ display: "flex", alignItems: "center", gap: 9 }}><div className="row-title">{dateLabel(entry.date)}</div><span className="pill pill-gray" style={{ textTransform: "capitalize" }}>{entry.mood || "steady"}</span></div><div><button className="icon-button" aria-label="Edit diary entry" onClick={() => onEdit("diary", entry)}><Pencil size={14} /></button><button className="icon-button" aria-label="Delete diary entry" onClick={() => onDelete("diary", entry)}><Trash2 size={14} /></button></div></div><p>{entry.reflection || entry.content || "No reflection entered."}</p></article>) : <EmptyState icon={StickyNote} title="Start with today" message="Write a few lines about something you learned or want to revisit." />}
    </section>}
  </div>;
}

function StudentsPage({ data }) {
  const users = data.users || [];
  return <section className="surface panel"><div className="panel-head"><div><h2 className="panel-title">Student list</h2><div className="panel-note">Current student accounts</div></div><span className="pill pill-gray">{users.length} students</span></div>
    {users.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Student</th><th>Login ID</th><th>Joined</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><div style={{ display: "flex", alignItems: "center", gap: 9 }}><div className="avatar" style={{ width: 29, height: 29, fontSize: 10 }}>{initials(user.full_name)}</div><span style={{ color: "#364238", fontWeight: 600 }}>{user.full_name || "Student"}</span></div></td><td>{user.login_id || "—"}</td><td>{dateLabel(user.created_at)}</td></tr>)}</tbody></table></div> : <EmptyState icon={Users} title="No student accounts" message="Student accounts will appear here when they are added to the hub." />}
  </section>;
}

function ProfilePage({ profile, role, onLogout }) {
  return <div className="dashboard-grid">
    <section className="surface panel"><div className="panel-head"><div><h2 className="panel-title">Account details</h2><div className="panel-note">Your current Construction Study Hub profile</div></div></div>
      <div style={{ display: "flex", alignItems: "center", gap: 15, padding: "10px 0 22px", borderBottom: "1px solid #edf0e9" }}><div className="avatar" style={{ width: 54, height: 54, fontSize: 17 }}>{initials(profile.full_name)}</div><div><div className="row-title" style={{ fontSize: 15 }}>{profile.full_name || "Study Hub user"}</div><div className="row-meta" style={{ marginTop: 6 }}>{profile.login_id || "Login ID not available"}</div></div></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, paddingTop: 18 }}><div><div className="eyebrow">Role</div><span className="role-chip">{role}</span></div><div><div className="eyebrow">Account status</div><span className="pill pill-green">Active session</span></div></div>
    </section>
    <section className="surface panel"><div className="empty-icon"><ShieldCheck size={19} /></div><h2 className="panel-title">A focused workspace</h2><p className="page-subtitle" style={{ marginBottom: 20 }}>Your study records are loaded from the hub and your session is kept only for this browser session.</p><button className="button button-danger" onClick={onLogout}><LogOut size={14} /> Sign out</button></section>
  </div>;
}

function EditorModal({ modal, role, data, onClose, onSave, onAward }) {
  const { kind, item } = modal;
  const [questions, setQuestions] = useState(() => (item?.questions?.length
    ? item.questions.map((question) => ({
        prompt: question.prompt || "",
        options: Array.isArray(question.options) ? question.options : ["", ""],
        correctIndex: Number.isInteger(Number(question.correctIndex)) ? Number(question.correctIndex) : 0,
      }))
    : [{ prompt: "", options: ["", ""], correctIndex: 0 }]));
  const config = {
    note: { title: item ? "Edit lecture note" : "Add lecture note", subtitle: "Share a useful class resource with students." },
    meeting: { title: item ? "Edit meeting" : "Schedule a meeting", subtitle: "Add the session time and a secure join link." },
    assignment: { title: item ? "Edit assignment" : "Add assignment", subtitle: "Give students a clear task and due date." },
    event: { title: item ? "Edit event" : "Add event", subtitle: "Share a department or campus event." },
    "student-note": { title: item ? "Edit private note" : "New private note", subtitle: "Only you can see your student notes." },
    diary: { title: item ? "Edit diary entry" : "Write a diary entry", subtitle: "A few lines about today's learning is enough." },
    quiz: { title: item ? "Edit quiz" : "Create a quiz", subtitle: "Questions are stored as prompt, options, and correctIndex." },
    award: { title: "Award a badge", subtitle: "Recognize a student's effort or progress." },
  }[kind] || { title: "Edit details" };
  function updateQuestion(questionIndex, patch) {
    setQuestions((items) => items.map((question, index) => index === questionIndex ? { ...question, ...patch } : question));
  }
  if (kind === "award") return <Modal title={config.title} subtitle={config.subtitle} onClose={onClose}><form id="modal-form" onSubmit={onAward}>
    <div className="form-grid"><Field label="Student" className="span-2"><select className="select" name="user_id" required defaultValue=""><option value="" disabled>Select a student</option>{(data.users || []).filter((u) => u.role === "student").map((u) => <option value={u.id} key={u.id}>{u.full_name} · {u.login_id}</option>)}</select></Field>
      <Field label="Badge name" className="span-2"><input className="input" name="name" required placeholder="e.g. Site Safety Fundamentals" /></Field><Field label="Reason or description" className="span-2"><textarea className="textarea" name="description" placeholder="What did they do well?" /></Field></div>
  </form><div className="modal-foot"><button className="button" onClick={onClose}>Cancel</button><button form="modal-form" className="button button-primary"><Award size={14} /> Award badge</button></div></Modal>;

  return <Modal title={config.title} subtitle={config.subtitle} onClose={onClose}>
    <form id="modal-form" onSubmit={onSave}>
      {kind === "note" && <div className="form-grid"><Field label="Title"><input className="input" name="title" defaultValue={item?.title || ""} required placeholder="e.g. Foundations and footings" /></Field><Field label="Subject"><input className="input" name="subject" defaultValue={item?.subject || ""} required placeholder="e.g. Construction methods" /></Field><Field label="Summary" className="span-2"><textarea className="textarea" name="description" defaultValue={item?.description || ""} placeholder="Key ideas, chapter references, or class context" /></Field><Field label="Attach a file" className="span-2" hint={item?.file_url ? "A file is attached. Choose a new one to replace it." : "PDF, slides, or another class file."}><input className="input" name="file" type="file" /></Field></div>}
      {kind === "meeting" && <div className="form-grid"><Field label="Meeting title" className="span-2"><input className="input" name="title" defaultValue={item?.title || ""} required placeholder="e.g. Materials lab review" /></Field><Field label="Date"><input className="input" name="meeting_date" type="date" defaultValue={item?.meeting_date || ""} required /></Field><Field label="Time"><input className="input" name="meeting_time" type="time" defaultValue={item?.meeting_time || ""} /></Field><Field label="Join link" className="span-2"><input className="input" name="join_url" type="url" defaultValue={item?.join_url || ""} placeholder="https://" /></Field><Field label="Details" className="span-2"><textarea className="textarea" name="description" defaultValue={item?.description || ""} /></Field></div>}
      {kind === "assignment" && <div className="form-grid"><Field label="Assignment title" className="span-2"><input className="input" name="title" defaultValue={item?.title || ""} required placeholder="e.g. Concrete mix comparison" /></Field><Field label="Subject"><input className="input" name="subject" defaultValue={item?.subject || ""} placeholder="e.g. Materials" /></Field><Field label="Due date"><input className="input" name="deadline" type="date" defaultValue={item?.deadline || item?.due_date || ""} /></Field><Field label="Instructions" className="span-2"><textarea className="textarea" name="description" defaultValue={item?.description || ""} placeholder="What should students complete?" /></Field></div>}
      {kind === "event" && <div className="form-grid"><Field label="Event title" className="span-2"><input className="input" name="title" defaultValue={item?.title || ""} required /></Field><Field label="Date"><input className="input" name="event_date" type="date" defaultValue={item?.event_date || ""} required /></Field><Field label="Time"><input className="input" name="event_time" type="time" defaultValue={item?.event_time || ""} /></Field><Field label="Location" className="span-2"><input className="input" name="location" defaultValue={item?.location || ""} placeholder="Room, campus, or meeting point" /></Field><Field label="Details" className="span-2"><textarea className="textarea" name="description" defaultValue={item?.description || ""} /></Field></div>}
      {kind === "student-note" && <div className="form-grid"><Field label="Title" className="span-2"><input className="input" name="title" defaultValue={item?.title || ""} required placeholder="Give this note a name" /></Field><Field label="Note" className="span-2"><textarea className="textarea" style={{ minHeight: 160 }} name="content" defaultValue={item?.content || ""} required placeholder="Your thoughts, reminders, or learning notes…" /></Field></div>}
      {kind === "diary" && <div className="form-grid"><Field label="Date" className="span-2"><input className="input" name="date" type="date" defaultValue={item?.date || TODAY()} required /></Field><Field label="Mood" className="span-2"><select className="select" name="mood" defaultValue={item?.mood || "steady"}><option value="focused">Focused</option><option value="curious">Curious</option><option value="steady">Steady</option><option value="tired">Tired</option><option value="stuck">Stuck</option></select></Field><Field label="Reflection" className="span-2"><textarea className="textarea" style={{ minHeight: 160 }} name="reflection" defaultValue={item?.reflection || item?.content || ""} required placeholder="What did you learn, notice, or want to remember?" /></Field></div>}
      {kind === "quiz" && <div className="form-grid">
        <Field label="Quiz title" className="span-2"><input className="input" name="title" defaultValue={item?.title || ""} required /></Field>
        <Field label="Subject"><input className="input" name="subject" defaultValue={item?.subject || ""} placeholder="e.g. Materials" /></Field>
        <Field label="Due date"><input className="input" name="deadline" type="date" defaultValue={item?.deadline || ""} /></Field>
        <Field label="Duration (minutes)"><input className="input" name="duration_minutes" type="number" min="1" defaultValue={item?.duration_minutes || 10} required /></Field>
        <Field label="Description"><input className="input" name="description" defaultValue={item?.description || ""} /></Field>
        <input type="hidden" name="questions" value={JSON.stringify(questions)} />
        <div className="span-2 quiz-editor">
          <div className="field-hint">Add each question and mark its correct answer.</div>
          {questions.map((question, questionIndex) => <section className="quiz-editor-question" key={questionIndex}>
            <div className="quiz-editor-head"><strong>Question {questionIndex + 1}</strong><button type="button" className="icon-button" aria-label={`Remove question ${questionIndex + 1}`} disabled={questions.length === 1} onClick={() => setQuestions((items) => items.filter((_, index) => index !== questionIndex))}><Trash2 size={14} /></button></div>
            <Field label="Question"><textarea className="textarea" value={question.prompt} required onChange={(event) => updateQuestion(questionIndex, { prompt: event.target.value })} placeholder="Write the question" /></Field>
            <div className="quiz-options-editor">
              {question.options.map((option, optionIndex) => <div className="quiz-option-editor" key={optionIndex}>
                <input type="radio" name={`correct-${questionIndex}`} checked={Number(question.correctIndex) === optionIndex} onChange={() => updateQuestion(questionIndex, { correctIndex: optionIndex })} aria-label={`Mark option ${optionIndex + 1} as correct`} />
                <input className="input" aria-label={`Question ${questionIndex + 1}, option ${optionIndex + 1}`} value={option} required onChange={(event) => updateQuestion(questionIndex, { options: question.options.map((value, index) => index === optionIndex ? event.target.value : value) })} placeholder={`Answer option ${optionIndex + 1}`} />
                <button type="button" className="icon-button" aria-label={`Remove option ${optionIndex + 1}`} disabled={question.options.length <= 2} onClick={() => {
                  const options = question.options.filter((_, index) => index !== optionIndex);
                  const correctIndex = Number(question.correctIndex) === optionIndex ? 0 : Number(question.correctIndex) > optionIndex ? Number(question.correctIndex) - 1 : Number(question.correctIndex);
                  updateQuestion(questionIndex, { options, correctIndex });
                }}><X size={14} /></button>
              </div>)}
            </div>
            <button type="button" className="button button-small" onClick={() => updateQuestion(questionIndex, { options: [...question.options, ""] })}><Plus size={13} /> Add answer option</button>
          </section>)}
          <button type="button" className="button button-small" onClick={() => setQuestions((items) => [...items, { prompt: "", options: ["", ""], correctIndex: 0 }])}><Plus size={13} /> Add question</button>
        </div>
      </div>}
    </form>
    <div className="modal-foot"><button className="button" onClick={onClose}>Cancel</button><button form="modal-form" className="button button-primary"><Check size={14} /> {item ? "Save changes" : "Save"}</button></div>
  </Modal>;
}

function QuizModal({ state, setState, onClose, onSubmit }) {
  const quiz = state.quiz;
  const questions = quiz.questions || [];
  const result = state.result;
  const resultRow = Array.isArray(result) ? result[0] : result;
  const resultScore = resultRow?.score;
  const timeLeft = `${String(Math.floor(state.seconds / 60)).padStart(2, "0")}:${String(state.seconds % 60).padStart(2, "0")}`;
  return <Modal title={result ? "Quiz results" : getTitle(quiz)} subtitle={result ? "Your response has been recorded." : quiz.description || "Choose the best answer for each question."} onClose={onClose} footer={!result ? <><span className="quiz-timer"><Timer size={13} style={{ verticalAlign: "middle", marginRight: 5 }} />{timeLeft}</span><span style={{ flex: 1 }} /><button className="button" onClick={onClose}>Exit quiz</button><button className="button button-primary" onClick={onSubmit} disabled={state.submitting}>{state.submitting ? "Submitting…" : "Submit answers"} <ArrowRight size={14} /></button></> : <button className="button button-primary" onClick={onClose}>Done</button>}>
    {result ? <div className="empty-state"><div className="empty-icon"><CheckCircle2 size={20} /></div><h3>Attempt submitted</h3><p>{resultScore !== undefined ? `Your score: ${resultScore}%${resultRow.correct !== undefined ? ` (${resultRow.correct} of ${resultRow.total})` : ""}` : "Your lecturer can review your submitted attempt."}</p></div> :
      questions.length ? questions.map((question, index) => <div className="quiz-question" key={`${index}-${question.prompt}`}><div className="row-title" style={{ whiteSpace: "normal", lineHeight: 1.5 }}>{index + 1}. {question.prompt}</div>{(question.options || []).map((option, optionIndex) => <label className="option" key={optionIndex}><input type="radio" name={`question-${index}`} checked={Number(state.answers[index]) === optionIndex} onChange={() => setState((old) => ({ ...old, answers: { ...old.answers, [index]: optionIndex } }))} /><span>{option}</span></label>)}</div>) : <EmptyState icon={CircleAlert} title="No quiz questions" message="Ask your lecturer to update this quiz." />}
  </Modal>;
}

export default App;
