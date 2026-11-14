import { requireSupabase } from "./supabase.js";

function check(result) {
  if (result.error) throw result.error;
  return result.data;
}

function table(name) {
  return requireSupabase().from(name);
}

export async function listUsers() {
  return check(await table("users").select("id,full_name,role,login_id,created_at").order("full_name"));
}

export async function listLectureNotes(search = "") {
  let query = table("lecture_notes").select("*").order("created_at", { ascending: false });
  const term = search.trim().replace(/[,%()]/g, " ").trim();
  if (term) query = query.or(`subject.ilike.%${term}%,title.ilike.%${term}%`);
  return check(await query);
}

export async function saveLectureNote(values, id) {
  const query = id ? table("lecture_notes").update(values).eq("id", id) : table("lecture_notes").insert(values);
  return check(await query.select().single());
}

export async function deleteLectureNote(id) {
  const existing = check(await table("lecture_notes").select("file_url").eq("id", id).maybeSingle());
  if (existing?.file_url) {
    const { error } = await requireSupabase().storage.from("lecture-notes").remove([existing.file_url]);
    if (error) throw error;
  }
  return check(await table("lecture_notes").delete().eq("id", id));
}

export async function uploadLectureFile(file) {
  const client = requireSupabase();
  const path = `${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
  const { data, error } = await client.storage.from("lecture-notes").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  return data.path;
}

export async function downloadLectureFile(path) {
  const client = requireSupabase();
  const { data, error } = await client.storage.from("lecture-notes").download(path);
  if (error) throw error;
  return data;
}

export async function listAssignments() {
  return check(await table("assignments").select("*").order("deadline"));
}

export async function saveAssignment(values, id) {
  const query = id ? table("assignments").update(values).eq("id", id) : table("assignments").insert(values);
  return check(await query.select().single());
}

export async function deleteAssignment(id) {
  return check(await table("assignments").delete().eq("id", id));
}

export async function listAssignmentSubmissions() {
  return check(await table("assignment_submissions").select("*"));
}

export async function setAssignmentDone(assignmentId, userId, isDone) {
  if (isDone) {
    return check(
      await table("assignment_submissions")
        .upsert(
          { assignment_id: assignmentId, user_id: userId, completed_at: new Date().toISOString() },
          { onConflict: "assignment_id,user_id" },
        )
        .select()
        .single(),
    );
  }
  return check(
    await table("assignment_submissions")
      .delete()
      .eq("assignment_id", assignmentId)
      .eq("user_id", userId),
  );
}

export async function listQuizzes() {
  return check(await table("quizzes").select("*").order("created_at", { ascending: false }));
}

export async function listQuizzesForStudents() {
  return check(await requireSupabase().rpc("list_quizzes_for_student"));
}

export async function saveQuiz(values, id) {
  const query = id ? table("quizzes").update(values).eq("id", id) : table("quizzes").insert(values);
  return check(await query.select().single());
}

export async function deleteQuiz(id) {
  return check(await table("quizzes").delete().eq("id", id));
}

export async function submitQuiz(quizId, answers, durationSeconds) {
  return check(
    await requireSupabase().rpc("submit_quiz_attempt", {
      p_quiz_id: quizId,
      p_answers: answers,
      p_duration_seconds: durationSeconds,
    }),
  );
}

export async function listQuizAttempts() {
  return check(await table("quiz_attempts").select("*").order("completed_at", { ascending: false }));
}

export async function listMeetings() {
  return (check(await table("zoom_meetings").select("*").order("meeting_date").order("meeting_time")) || []).map((item) => ({
    ...item,
    join_url: item.meeting_link,
  }));
}

export async function saveMeeting(values, id) {
  const { join_url, ...rest } = values;
  const record = { ...rest, meeting_link: join_url || null };
  const query = id ? table("zoom_meetings").update(record).eq("id", id) : table("zoom_meetings").insert(record);
  return check(await query.select().single());
}

export async function deleteMeeting(id) {
  return check(await table("zoom_meetings").delete().eq("id", id));
}

export async function listEvents() {
  return check(await table("events").select("*").order("event_date"));
}

export async function saveEvent(values, id) {
  const query = id ? table("events").update(values).eq("id", id) : table("events").insert(values);
  return check(await query.select().single());
}

export async function deleteEvent(id) {
  return check(await table("events").delete().eq("id", id));
}

export async function listDeadlines() {
  const [deadlines, assignments, submissions, attempts] = await Promise.all([
    table("deadlines").select("*").order("due_date"),
    table("assignments").select("id,title"),
    table("assignment_submissions").select("assignment_id,user_id"),
    table("quiz_attempts").select("quiz_id,user_id"),
  ]);
  check(deadlines);
  check(assignments);
  check(submissions);
  check(attempts);
  let profileId = null;
  try {
    profileId = JSON.parse(sessionStorage.getItem("study-hub-profile") || "null")?.id || null;
  } catch {
    profileId = null;
  }
  const assignmentById = new Map((assignments.data || []).map((assignment) => [assignment.id, assignment]));
  const completedIds = new Set(
    (submissions.data || [])
      .filter((submission) => submission.user_id === profileId)
      .map((submission) => submission.assignment_id),
  );
  const attemptedQuizIds = new Set(
    (attempts.data || [])
      .filter((attempt) => attempt.user_id === profileId)
      .map((attempt) => attempt.quiz_id),
  );
  return (deadlines.data || []).map((deadline) => {
    const assignment = deadline.assignment_id ? assignmentById.get(deadline.assignment_id) : null;
    return {
      ...deadline,
      title: deadline.title || assignment?.title || deadline.subject || "Deadline",
      completed: deadline.assignment_id
        ? completedIds.has(deadline.assignment_id)
        : deadline.quiz_id
          ? attemptedQuizIds.has(deadline.quiz_id)
          : false,
    };
  });
}

export async function listStudentNotes(userId) {
  return check(await table("student_notes").select("*").eq("user_id", userId).order("created_at", { ascending: false }));
}

export async function saveStudentNote(values, id) {
  const query = id ? table("student_notes").update(values).eq("id", id) : table("student_notes").insert(values);
  return check(await query.select().single());
}

export async function deleteStudentNote(id) {
  return check(await table("student_notes").delete().eq("id", id));
}

export async function listBadges(userId) {
  let query = table("badges").select("*").order("awarded_at", { ascending: false });
  if (userId) query = query.eq("user_id", userId);
  return (check(await query) || []).map((badge) => ({
    ...badge,
    name: badge.badge_name,
    description: badge.reason,
  }));
}

export async function awardBadge(values) {
  const { name, description, ...rest } = values;
  return check(
    await table("badges")
      .insert({ ...rest, badge_name: name, reason: description || null, badge_icon: "award" })
      .select()
      .single(),
  );
}

export async function listDiary(userId) {
  return (check(await table("diary").select("*").eq("user_id", userId).order("date", { ascending: false })) || []).map((entry) => ({
    ...entry,
    reflection: entry.entry,
  }));
}

export async function saveDiary(values, id) {
  const { reflection, ...rest } = values;
  const record = { ...rest, entry: reflection };
  const query = id
    ? table("diary").update(record).eq("id", id)
    : table("diary").upsert(record, { onConflict: "user_id,date" });
  return check(await query.select().single());
}

export async function deleteDiary(id) {
  return check(await table("diary").delete().eq("id", id));
}
