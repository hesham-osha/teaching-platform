// علّمني — الواجهة الأمامية
// كل الكتابة والقراءة عبر الـ Edge Function "teaching" على مشروع shoghl-fawry:
//   POST https://xqtmtbvhtenwlnsipdsq.supabase.co/functions/v1/teaching?action=<name>
//   مع Authorization: Bearer <access_token> (متخزن في localStorage بعد الدخول)
// المكالمات اللايف: Jitsi Meet مضمّن (meet.jit.si) — صوت وفيديو ومشاركة
// شاشة من غير حساب، باسم غرفة فريد لكل جلسة.

// ---------- الإعدادات ----------
const CFG = window.TC_CONFIG || {};
const API_BASE = CFG.API_BASE || "";
const CONFIG_OK = API_BASE && !API_BASE.includes("PROJECT_REF");

const TOKEN_KEY = "tc-token";
const USER_KEY = "tc-user";
const DEVICE_KEY = "tc-device-id";

// ---------- حالة التطبيق ----------
const state = {
  user: null,
  subjects: [],
  teachers: [],
  teacherFilter: "all",
  courses: [],
  currentTeacher: null,
  currentCourse: null,
  currentSession: null,
  wallet: null,
  adminStats: null,
  adminSessions: [],
  adminPayments: [],
  adminCourses: [],
  adminUsers: [],
  chatTimer: null,
};

let toastTimer = null;

// ---------- أدوات مساعدة ----------
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));
const fmtUsd = (n) => {
  const v = Number(n ?? 0);
  return "$" + (Number.isInteger(v) ? v.toLocaleString("en-US") : v.toFixed(2));
};
const fmtDate = (iso) => {
  try {
    return new Date(iso).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
  } catch { return iso; }
};
function stars(rating) {
  const r = Math.round(Number(rating || 0));
  return "★".repeat(r) + "☆".repeat(Math.max(0, 5 - r));
}
function showToast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
}
function setMsg(id, text, isError) {
  const el = $(id);
  if (!el) return;
  el.textContent = text || "";
  el.className = "form-msg" + (text ? (isError ? " error" : " ok") : "");
}
function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = "dev-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}
function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  state.user = user;
}
function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  state.user = null;
}
function loadSession() {
  try {
    const u = localStorage.getItem(USER_KEY);
    if (u && localStorage.getItem(TOKEN_KEY)) state.user = JSON.parse(u);
  } catch { state.user = null; }
}

// ---------- الاتصال بالباك إند ----------
async function api(action, body, needsAuth) {
  if (!CONFIG_OK) throw new Error("إعدادات الواجهة ناقصة (API_BASE)");
  const headers = { "Content-Type": "application/json" };
  if (needsAuth) {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) throw new Error("لازم تسجّل الدخول الأول");
    headers.Authorization = "Bearer " + token;
  }
  const res = await fetch(API_BASE + "?action=" + encodeURIComponent(action), {
    method: "POST",
    headers,
    body: JSON.stringify(body || {}),
  });
  let data;
  try { data = await res.json(); } catch { throw new Error("رد السيرفر غير صحيح"); }
  if (!data.ok) throw new Error(data.error || "حصل خطأ، حاول تاني");
  return data.data;
}

// ---------- التنقل ----------
const VIEWS = ["home", "teachers", "teacher", "book", "room", "my-sessions", "courses", "course", "my-courses", "wallet", "auth", "admin"];
function showView(name) {
  stopChatPolling();
  for (const v of VIEWS) {
    const el = $("view-" + v);
    if (el) el.hidden = v !== name;
  }
  document.querySelectorAll("[data-nav]").forEach((b) => {
    b.classList.toggle("active", b.dataset.nav === name);
  });
  window.scrollTo({ top: 0 });
  refreshAuthUI();
}
function refreshAuthUI() {
  const loggedIn = !!state.user;
  document.querySelectorAll(".auth-only").forEach((el) => { el.hidden = !loggedIn; });
  document.querySelectorAll(".guest-only").forEach((el) => { el.hidden = loggedIn; });
  document.querySelectorAll(".admin-only").forEach((el) => {
    el.hidden = !(loggedIn && state.user && state.user.role === "admin");
  });
  const chip = $("userChip");
  if (chip) {
    chip.textContent = loggedIn
      ? state.user.name + " • " + fmtUsd(state.user.balance_usd) + (state.user.role === "admin" ? " • أدمن" : state.user.role === "teacher" ? " • معلم" : "")
      : "";
  }
}
async function go(view, param) {
  if (view === "teachers") { await loadTeachers(); }
  if (view === "teacher") { await loadTeacherProfile(param); }
  if (view === "book") { openBook(param); }
  if (view === "room") { await openRoom(param); }
  if (view === "my-sessions") { await loadMySessions(); }
  if (view === "courses") { await loadCourses(); }
  if (view === "course") { await loadCourseDetails(param); }
  if (view === "my-courses") { await loadMyCourses(); }
  if (view === "wallet") { await loadWallet(); }
  if (view === "admin") { await loadAdmin(); }
  if (view === "home") { await loadHome(); }
  showView(view);
}
document.addEventListener("click", (e) => {
  const nav = e.target.closest("[data-nav]");
  if (nav) {
    e.preventDefault();
    const view = nav.dataset.nav;
    if ((view === "my-sessions" || view === "my-courses" || view === "wallet" || view === "admin") && !state.user) {
      showToast("سجّل الدخول الأول");
      go("auth");
      return;
    }
    go(view);
  }
});
$("logoutBtn").addEventListener("click", () => {
  clearSession();
  refreshAuthUI();
  showToast("تم تسجيل الخروج");
  go("home");
});

// ---------- الرئيسية ----------
async function loadSubjects() {
  try {
    state.subjects = await api("list-subjects", {});
  } catch { state.subjects = []; }
}
function subjectFilterButtons(containerId, onPick) {
  const box = $(containerId);
  if (!box) return;
  const all = [{ value: "all", label: "كل المواد" }].concat(
    state.subjects.map((s) => ({ value: s.name, label: s.name }))
  );
  box.innerHTML = all.map((s) =>
    `<button class="chip${state.teacherFilter === s.value ? " active" : ""}" data-subj="${esc(s.value)}">${esc(s.label)}</button>`
  ).join("");
  box.querySelectorAll("[data-subj]").forEach((b) => {
    b.addEventListener("click", () => {
      state.teacherFilter = b.dataset.subj;
      onPick();
    });
  });
}
function teacherCard(t) {
  return `<div class="task-card">
    <div class="task-top"><h3>${esc(t.name || "معلم")}</h3><span class="pay">${fmtUsd(t.hourly_rate_usd)}/ساعة</span></div>
    <div class="stars">${stars(t.rating)} <span class="muted small">(${Number(t.rating || 0).toFixed(1)} • ${t.reviews_count || 0} تقييم)</span></div>
    <p class="task-desc">${esc(t.headline || "")}</p>
    <p>${(t.subjects || []).map((s) => `<span class="cat-badge">${esc(s)}</span>`).join(" ")}</p>
    <button class="btn btn-primary btn-sm" data-teacher="${esc(t.id)}">شوف الملف واحجز درس</button>
  </div>`;
}
function bindTeacherButtons(container) {
  container.querySelectorAll("[data-teacher]").forEach((b) => {
    b.addEventListener("click", () => go("teacher", b.dataset.teacher));
  });
}
async function loadHome() {
  await loadSubjects();
  subjectFilterButtons("homeSubjectFilters", loadHomeTeachers);
  await loadHomeTeachers();
  try {
    const courses = await api("list-courses", {});
    state.courses = courses;
    $("homeCourses").innerHTML = courses.length
      ? courses.slice(0, 4).map(courseCard).join("")
      : `<p class="empty">لسه مفيش كورسات — تابعنا قريب.</p>`;
    bindCourseButtons($("homeCourses"));
  } catch {
    $("homeCourses").innerHTML = `<p class="empty">حصل خطأ أثناء جلب الكورسات.</p>`;
  }
}
async function loadHomeTeachers() {
  try {
    const teachers = await api("list-teachers", state.teacherFilter === "all" ? {} : { subject: state.teacherFilter });
    $("homeTeachers").innerHTML = teachers.length
      ? teachers.slice(0, 4).map(teacherCard).join("")
      : `<p class="empty">مفيش معلمين للمادة دي لسه.</p>`;
    bindTeacherButtons($("homeTeachers"));
  } catch {
    $("homeTeachers").innerHTML = `<p class="empty">حصل خطأ أثناء جلب المعلمين.</p>`;
  }
}

// ---------- المعلمون ----------
async function loadTeachers() {
  await loadSubjects();
  subjectFilterButtons("teacherSubjectFilters", loadTeachersList);
  await loadTeachersList();
}
async function loadTeachersList() {
  try {
    const teachers = await api("list-teachers", state.teacherFilter === "all" ? {} : { subject: state.teacherFilter });
    state.teachers = teachers;
    $("teachersList").innerHTML = teachers.length
      ? teachers.map(teacherCard).join("")
      : `<p class="empty">مفيش معلمين للمادة دي لسه.</p>`;
    bindTeacherButtons($("teachersList"));
  } catch (e) {
    $("teachersList").innerHTML = `<p class="empty">${esc(e.message)}</p>`;
  }
}

// ---------- صفحة معلم ----------
async function loadTeacherProfile(id) {
  try {
    const t = await api("teacher-profile", { id });
    state.currentTeacher = t;
    const canBook = state.user && state.user.id !== t.id;
    $("teacherProfile").innerHTML = `<div class="card">
      <h2>${esc(t.name || "معلم")}</h2>
      <div class="stars">${stars(t.rating)} <span class="muted small">(${Number(t.rating || 0).toFixed(1)} • ${t.reviews_count || 0} تقييم)</span></div>
      <p><strong>${esc(t.headline || "")}</strong></p>
      <p>${esc(t.bio || "")}</p>
      <p>المواد: ${(t.subjects || []).map((s) => `<span class="cat-badge">${esc(s)}</span>`).join(" ")}</p>
      <p>سعر الساعة: <strong class="accent">${fmtUsd(t.hourly_rate_usd)}</strong></p>
      ${canBook ? `<button class="btn btn-primary btn-lg" id="bookTeacherBtn">احجز درس 📅</button>`
        : state.user ? `<p class="muted">ده ملفك إنت كمعلم.</p>` : `<p class="muted">سجّل الدخول عشان تحجز درس مع ${esc(t.name || "المعلم")}.</p><button class="btn btn-primary" data-nav="auth">دخول / حساب جديد</button>`}
    </div>
    ${t.courses && t.courses.length ? `<div class="card"><h3>كورسات ${esc(t.name || "")} المسجلة</h3><div class="tasks-grid">${t.courses.map(courseCard).join("")}</div></div>` : ""}
    <div class="card"><h3>التقييمات ⭐</h3>
      ${(t.reviews || []).length ? t.reviews.map((r) => `<div class="queue-item"><div class="stars">${stars(r.rating)}</div><p>${esc(r.comment || "")}</p><span class="muted small">${esc(r.reviewer_name)} • ${fmtDate(r.created_at)}</span></div>`).join("") : `<p class="empty">لسه مفيش تقييمات.</p>`}
      ${state.user && state.user.id !== t.id ? `<form id="reviewForm" class="submit-box">
        <label>قيّم المعلم
          <select id="reviewRating"><option value="5">5 — ممتاز ⭐⭐⭐⭐⭐</option><option value="4">4 — كويس جدًا</option><option value="3">3 — كويس</option><option value="2">2 — مقبول</option><option value="1">1 — ضعيف</option></select>
        </label>
        <label>تعليقك (اختياري)
          <textarea id="reviewComment" rows="2" placeholder="قول رأيك في المعلم…"></textarea>
        </label>
        <button class="btn btn-secondary" type="submit">ابعت التقييم</button>
        <p class="form-msg" id="reviewMsg"></p>
      </form>` : ""}
    </div>`;
    bindCourseButtons($("teacherProfile"));
    const bookBtn = $("bookTeacherBtn");
    if (bookBtn) bookBtn.addEventListener("click", () => go("book", t.id));
    const rf = $("reviewForm");
    if (rf) rf.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await api("review-teacher", { teacher_id: t.id, rating: Number($("reviewRating").value), comment: $("reviewComment").value }, true);
        setMsg("reviewMsg", "شكرًا! تقييمك اتسجّل ✅");
        loadTeacherProfile(t.id);
      } catch (err) { setMsg("reviewMsg", err.message, true); }
    });
  } catch (e) {
    $("teacherProfile").innerHTML = `<p class="empty">${esc(e.message)}</p>`;
  }
}

// ---------- حجز جلسة ----------
function openBook(teacherId) {
  const t = state.teachers.find((x) => x.id === teacherId) || state.currentTeacher;
  if (!t) { go("teachers"); return; }
  state.currentTeacher = t;
  $("bookTitle").textContent = "احجز درس مع " + (t.name || "المعلم");
  $("bookTeacherInfo").innerHTML = `سعر الساعة: <strong>${fmtUsd(t.hourly_rate_usd)}</strong> • المواد: ${(t.subjects || []).map(esc).join("، ")}`;
  $("bookSubject").innerHTML = (t.subjects || []).map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
  $("bookRateNote").textContent = "(" + fmtUsd(t.hourly_rate_usd) + " / ساعة)";
  $("bookBalance").textContent = fmtUsd(state.user ? state.user.balance_usd : 0);
  updateBookPrice();
  setMsg("bookMsg", "");
  showView("book");
}
function updateBookPrice() {
  const t = state.currentTeacher;
  if (!t) return;
  const dur = Number($("bookDuration").value || 60);
  $("bookPrice").textContent = fmtUsd(Number(t.hourly_rate_usd) * dur / 60);
}
$("bookDuration").addEventListener("change", updateBookPrice);
$("bookForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const t = state.currentTeacher;
  if (!t) return;
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    const s = await api("book-session", {
      teacher_id: t.id,
      subject: $("bookSubject").value,
      scheduled_at: new Date($("bookWhen").value).toISOString(),
      duration_minutes: Number($("bookDuration").value),
    }, true);
    setMsg("bookMsg", "تم الحجز ✅ — المبلغ اتحجز من رصيدك. ادخل غرفة الدرس من \"جلساتي\" في موعد الدرس.", false);
    await refreshMe();
    showToast("تم حجز الدرس ✅");
    setTimeout(() => go("my-sessions"), 1200);
  } catch (err) {
    setMsg("bookMsg", err.message, true);
  } finally {
    btn.disabled = false;
  }
});

// ---------- غرفة الدرس (Jitsi + شات) ----------
async function openRoom(sessionId) {
  try {
    const s = await api("session-room", { id: sessionId }, true);
    state.currentSession = s;
    $("roomInfo").innerHTML = `<div class="card">
      <h2>غرفة الدرس — ${esc(s.subject)}</h2>
      <p>الموعد: <strong>${fmtDate(s.scheduled_at)}</strong> • المدة: ${s.duration_minutes} دقيقة • السعر: <strong>${fmtUsd(s.price_usd)}</strong> • الحالة: <span class="badge">${esc(statusLabel(s.status))}</span></p>
      <p class="muted small">لو المكالمة مشتغلتش جوه الصفحة، افتحها مباشرة من هنا: <a href="${esc(s.room_url)}" target="_blank" rel="noopener">${esc(s.room_url)}</a></p>
    </div>`;
    $("jitsiWrap").innerHTML = `<iframe class="jitsi-frame" src="${esc(s.room_url)}" allow="camera; microphone; fullscreen; display-capture; autoplay" allowfullscreen></iframe>`;
    showView("room");
    await loadChat();
    startChatPolling();
  } catch (e) {
    showToast(e.message);
    go("my-sessions");
  }
}
function statusLabel(st) {
  return { pending: "معلّقة", confirmed: "مؤكدة", completed: "مكتملة", cancelled: "ملغية" }[st] || st;
}
async function loadChat() {
  const s = state.currentSession;
  if (!s) return;
  try {
    const msgs = await api("session-messages", { id: s.id }, true);
    $("chatBox").innerHTML = msgs.length
      ? msgs.map((m) => `<div class="chat-msg${m.mine ? " mine" : ""}"><span class="who">${esc(m.sender_name)}</span> <span class="time">${fmtDate(m.created_at)}</span><br>${esc(m.message)}</div>`).join("")
      : `<p class="empty">لسه مفيش رسائل — ابدأ الكلام 👋</p>`;
    $("chatBox").scrollTop = $("chatBox").scrollHeight;
  } catch { /* تجاهل — الشات بيتحدث مع كل تحديث */ }
}
function startChatPolling() {
  stopChatPolling();
  state.chatTimer = setInterval(loadChat, 5000);
}
function stopChatPolling() {
  if (state.chatTimer) { clearInterval(state.chatTimer); state.chatTimer = null; }
}
async function sendChat() {
  const s = state.currentSession;
  const input = $("chatInput");
  const text = input.value.trim();
  if (!s || !text) return;
  try {
    await api("send-message", { id: s.id, message: text }, true);
    input.value = "";
    await loadChat();
  } catch (e) { setMsg("roomMsg", e.message, true); }
}
$("chatSendBtn").addEventListener("click", sendChat);
$("chatInput").addEventListener("keydown", (e) => { if (e.key === "Enter") sendChat(); });
$("completeSessionBtn").addEventListener("click", async () => {
  const s = state.currentSession;
  if (!s) return;
  try {
    const r = await api("complete-session", { id: s.id }, true);
    setMsg("roomMsg", "تم تأكيد إتمام الجلسة ✅ — المعلم خد " + fmtUsd(r.teacher_payout_usd) + " (90%) والمنصة 10% عمولة.", false);
    await refreshMe();
    setTimeout(() => go("my-sessions"), 1200);
  } catch (e) { setMsg("roomMsg", e.message, true); }
});
$("cancelSessionBtn").addEventListener("click", async () => {
  const s = state.currentSession;
  if (!s) return;
  if (!confirm("متأكد إنك عايز تلغي الجلسة؟ المبلغ المحجوز هيرجع لرصيد الطالب.")) return;
  try {
    await api("cancel-session", { id: s.id }, true);
    showToast("تم إلغاء الجلسة ورجع المبلغ للطالب");
    go("my-sessions");
  } catch (e) { setMsg("roomMsg", e.message, true); }
});

// ---------- جلساتي ----------
async function loadMySessions() {
  try {
    const sessions = await api("my-sessions", {}, true);
    $("mySessionsList").innerHTML = sessions.length ? sessions.map((s) => {
      const other = s.teacher_id === state.user.id ? ("الطالب: " + (s.student_name || "")) : ("المعلم: " + (s.teacher_name || ""));
      return `<div class="queue-item">
        <strong>${esc(s.subject)}</strong> — ${esc(other)}
        <div class="meta">الموعد: ${fmtDate(s.scheduled_at)} • المدة: ${s.duration_minutes} دقيقة • السعر: ${fmtUsd(s.price_usd)} • الحالة: <span class="badge">${esc(statusLabel(s.status))}</span></div>
        <div class="review-actions">
          ${s.status !== "cancelled" && s.status !== "completed" ? `<button class="btn btn-primary btn-sm" data-room="${esc(s.id)}">ادخل غرفة الدرس 📹</button>` : ""}
          ${s.status === "pending" || s.status === "confirmed" ? `<button class="btn btn-ghost btn-sm" data-cancel-session="${esc(s.id)}">إلغاء</button>` : ""}
          ${(s.status === "pending" || s.status === "confirmed") && s.teacher_id === state.user.id ? `<button class="btn btn-secondary btn-sm" data-complete-session="${esc(s.id)}">أكّد الإتمام ✅</button>` : ""}
        </div>
      </div>`;
    }).join("") : `<p class="empty">لسه محجزتش أي جلسة — دوّر على معلم واحجز أول درس! 🎓</p>`;
    $("mySessionsList").querySelectorAll("[data-room]").forEach((b) => b.addEventListener("click", () => go("room", b.dataset.room)));
    $("mySessionsList").querySelectorAll("[data-cancel-session]").forEach((b) => b.addEventListener("click", async () => {
      try { await api("cancel-session", { id: b.dataset.cancelSession }, true); showToast("تم إلغاء الجلسة"); loadMySessions(); }
      catch (e) { showToast(e.message); }
    }));
    $("mySessionsList").querySelectorAll("[data-complete-session]").forEach((b) => b.addEventListener("click", async () => {
      try { const r = await api("complete-session", { id: b.dataset.completeSession }, true); showToast("تم إتمام الجلسة ✅ — خدت " + fmtUsd(r.teacher_payout_usd)); loadMySessions(); }
      catch (e) { showToast(e.message); }
    }));
  } catch (e) {
    $("mySessionsList").innerHTML = `<p class="empty">${esc(e.message)}</p>`;
  }
}

// ---------- الكورسات ----------
function courseCard(c) {
  return `<div class="task-card">
    <div class="task-top"><h3>${esc(c.title)}</h3><span class="pay">${fmtUsd(c.price_usd)}</span></div>
    <p class="task-desc">${esc(c.description || "")}</p>
    <p class="muted small">المعلم: ${esc(c.teacher_name || "")}</p>
    <button class="btn btn-primary btn-sm" data-course="${esc(c.id)}">شوف الكورس وسجّل</button>
  </div>`;
}
function bindCourseButtons(container) {
  if (!container) return;
  container.querySelectorAll("[data-course]").forEach((b) => {
    b.addEventListener("click", () => go("course", b.dataset.course));
  });
}
async function loadCourses() {
  try {
    const courses = await api("list-courses", {});
    state.courses = courses;
    $("coursesList").innerHTML = courses.length
      ? courses.map(courseCard).join("")
      : `<p class="empty">لسه مفيش كورسات — تابعنا قريب.</p>`;
    bindCourseButtons($("coursesList"));
  } catch (e) {
    $("coursesList").innerHTML = `<p class="empty">${esc(e.message)}</p>`;
  }
}
async function loadCourseDetails(id) {
  try {
    const c = await api("course-details", { id: Number(id) });
    state.currentCourse = c;
    $("courseDetails").innerHTML = `<div class="card">
      <h2>${esc(c.title)}</h2>
      <p>${esc(c.description || "")}</p>
      <p>المعلم: <strong>${esc(c.teacher_name || "")}</strong> • السعر: <strong class="accent">${fmtUsd(c.price_usd)}</strong> • ${c.enrollments_count || 0} طالب مسجل</p>
      <h3>دروس الكورس (${(c.lessons || []).length})</h3>
      <ol>${(c.lessons || []).map((l) => `<li><strong>${esc(l.title)}</strong> <span class="muted small">(${l.content_type === "video" ? "فيديو" : "نص"})</span></li>`).join("") || "<li>لسه مفيش دروس.</li>"}</ol>
      ${state.user ? `<button class="btn btn-primary btn-lg" id="enrollBtn">سجّل في الكورس — ${fmtUsd(c.price_usd)}</button>` : `<p class="muted">سجّل الدخول عشان تسجّل في الكورس.</p><button class="btn btn-primary" data-nav="auth">دخول / حساب جديد</button>`}
      <p class="form-msg" id="courseMsg"></p>
    </div>
    ${c.reviews && c.reviews.length ? `<div class="card"><h3>تقييمات الكورس ⭐</h3>${c.reviews.map((r) => `<div class="queue-item"><div class="stars">${stars(r.rating)}</div><p>${esc(r.comment || "")}</p><span class="muted small">${esc(r.reviewer_name)} • ${fmtDate(r.created_at)}</span></div>`).join("")}</div>` : ""}
    <div class="card"><h3>قيّم الكورس ⭐</h3>
      ${state.user ? `<form id="courseReviewForm" class="submit-box">
        <label>تقييمك
          <select id="courseReviewRating"><option value="5">5 — ممتاز ⭐⭐⭐⭐⭐</option><option value="4">4 — كويس جدًا</option><option value="3">3 — كويس</option><option value="2">2 — مقبول</option><option value="1">1 — ضعيف</option></select>
        </label>
        <label>تعليقك (اختياري)<textarea id="courseReviewComment" rows="2"></textarea></label>
        <button class="btn btn-secondary" type="submit">ابعت التقييم</button>
        <p class="form-msg" id="courseReviewMsg"></p>
      </form>` : `<p class="muted">سجّل الدخول عشان تقيّم الكورس.</p>`}
    </div>`;
    const eb = $("enrollBtn");
    if (eb) eb.addEventListener("click", async () => {
      try {
        await api("enroll-course", { course_id: c.id }, true);
        setMsg("courseMsg", "تم تسجيلك في الكورس ✅ — تقدر تشوف دروسه من \"كورساتي\".", false);
        await refreshMe();
      } catch (e) { setMsg("courseMsg", e.message, true); }
    });
    const crf = $("courseReviewForm");
    if (crf) crf.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await api("review-teacher", { teacher_id: c.teacher_id, course_id: c.id, rating: Number($("courseReviewRating").value), comment: $("courseReviewComment").value }, true);
        setMsg("courseReviewMsg", "شكرًا! تقييمك اتسجّل ✅");
      } catch (err) { setMsg("courseReviewMsg", err.message, true); }
    });
  } catch (e) {
    $("courseDetails").innerHTML = `<p class="empty">${esc(e.message)}</p>`;
  }
}
async function loadMyCourses() {
  try {
    const list = await api("my-courses", {}, true);
    $("myCoursesList").innerHTML = list.length ? list.map((c) => `<div class="card">
      <h3>${esc(c.title)}</h3>
      <p>${esc(c.description || "")}</p>
      <p class="muted small">المعلم: ${esc(c.teacher_name || "")} • دفعت: ${fmtUsd(c.paid_usd)} • سجلت يوم ${fmtDate(c.enrolled_at)}</p>
      <ol>${(c.lessons || []).map((l) => `<li><strong>${esc(l.title)}</strong> ${l.content_type === "video" ? `<a href="${esc(l.content_url || "#")}" target="_blank" rel="noopener">شاهد الفيديو ▶️</a>` : `<div class="work">${esc(l.content_url || "")}</div>`}</li>`).join("") || "<li>لسه مفيش دروس.</li>"}</ol>
    </div>`).join("") : `<p class="empty">لسه مسجلتش في أي كورس — شوف الكورسات المتاحة! 📚</p>`;
  } catch (e) {
    $("myCoursesList").innerHTML = `<p class="empty">${esc(e.message)}</p>`;
  }
}

// ---------- المحفظة ----------
async function loadWallet() {
  try {
    const w = await api("wallet", {}, true);
    state.wallet = w;
    $("walletBalance").textContent = fmtUsd(w.balance_usd);
    $("walletHeld").textContent = fmtUsd(w.held_usd);
    $("walletEarned").textContent = fmtUsd(w.total_earned_usd);
    $("minWithdrawNote").textContent = fmtUsd(w.min_withdrawal_usd);
    $("myPayments").innerHTML = (w.payments || []).length ? w.payments.map((p) => `<div class="ledger-row">
      <div><span class="note">${p.type === "deposit" ? "إيداع" : "سحب"} — ${fmtUsd(p.amount_usd)} • ${esc(p.method)}</span><span class="date">${fmtDate(p.created_at)} • ${esc(p.reference || "")}</span></div>
      <span class="status status-${p.status === "approved" || p.status === "paid" ? "approved" : p.status === "rejected" ? "rejected" : "pending"}">${p.status === "pending" ? "معلّق" : p.status === "approved" ? "موافق عليه" : p.status === "paid" ? "اتدفع" : "مرفوض"}</span>
    </div>`).join("") : `<p class="empty">لسه مفيش مدفوعات.</p>`;
    $("walletLedger").innerHTML = (w.transactions || []).length ? w.transactions.map((t) => `<div class="ledger-row">
      <div><span class="note">${esc(t.note || t.type)}</span><span class="date">${fmtDate(t.created_at)}</span></div>
      <span class="ledger-amount ${Number(t.amount_usd) >= 0 ? "pos" : "neg"}">${Number(t.amount_usd) >= 0 ? "+" : ""}${fmtUsd(t.amount_usd)}</span>
    </div>`).join("") : `<p class="empty">لسه مفيش حركات.</p>`;
    // نموذج "ابْقَ معلمًا" — اخفيه لو المستخدم معلم أو أدمن
    $("becomeTeacherCard").hidden = !!(state.user && (state.user.role === "teacher" || state.user.role === "admin"));
    $("btSubjects").innerHTML = state.subjects.map((s) => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join("");
  } catch (e) {
    showToast(e.message);
  }
}
$("depositForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("submit-payment", { amount_usd: Number($("depositAmount").value), reference: $("depositRef").value }, true);
    setMsg("depositMsg", "طلب الإيداع اتبعت ✅ — الأدمن هيراجعه وينزّل المبلغ في رصيدك.", false);
    e.target.reset();
    loadWallet();
  } catch (err) { setMsg("depositMsg", err.message, true); }
});
$("withdrawForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("request-withdrawal", { amount_usd: Number($("withdrawAmount").value), reference: $("withdrawAddress").value }, true);
    setMsg("withdrawMsg", "طلب السحب اتبعت ✅ — الأدمن هيحوّل لك USDT ويعلّم الطلب \"اتدفع\".", false);
    e.target.reset();
    await refreshMe();
    loadWallet();
  } catch (err) { setMsg("withdrawMsg", err.message, true); }
});
$("becomeTeacherForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const subjects = Array.from($("btSubjects").selectedOptions).map((o) => o.value);
  try {
    await api("become-teacher", { subjects, headline: $("btHeadline").value, bio: $("btBio").value, hourly_rate_usd: Number($("btRate").value) }, true);
    setMsg("btMsg", "مبروك! بقيت معلم على المنصة 🎓 — ملفك بقى ظاهر في صفحة المعلمين.", false);
    await refreshMe();
    loadWallet();
  } catch (err) { setMsg("btMsg", err.message, true); }
});

// ---------- الدخول / التسجيل ----------
$("tabLogin").addEventListener("click", () => {
  $("tabLogin").classList.add("active");
  $("tabRegister").classList.remove("active");
  $("loginForm").hidden = false;
  $("registerForm").hidden = true;
});
$("tabRegister").addEventListener("click", () => {
  $("tabRegister").classList.add("active");
  $("tabLogin").classList.remove("active");
  $("loginForm").hidden = true;
  $("registerForm").hidden = false;
});
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const r = await api("login", { email: $("loginEmail").value, password: $("loginPassword").value });
    saveSession(r.access_token, r.user);
    setMsg("loginMsg", "أهلاً بيك! 👋", false);
    refreshAuthUI();
    go("home");
  } catch (err) { setMsg("loginMsg", err.message, true); }
});
$("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const r = await api("register", {
      name: $("regName").value,
      email: $("regEmail").value,
      password: $("regPassword").value,
      device_id: getDeviceId(),
    });
    // التسجيل بيرجع الملف بس — لازم دخول بعدها عشان ناخد التوكن
    setMsg("regMsg", "تم إنشاء الحساب ✅ — سجّل دخولك دلوقتي.", false);
    $("tabLogin").click();
    $("loginEmail").value = $("regEmail").value;
  } catch (err) { setMsg("regMsg", err.message, true); }
});
async function refreshMe() {
  try {
    const me = await api("me", {}, true);
    state.user = me;
    localStorage.setItem(USER_KEY, JSON.stringify(me));
    refreshAuthUI();
  } catch { /* تجاهل */ }
}

// ---------- لوحة الأدمن ----------
let adminTab = "sessions";
async function loadAdmin() {
  if (!state.user || state.user.role !== "admin") { showToast("الصفحة دي للأدمن بس"); go("home"); return; }
  try {
    state.adminStats = await api("admin-stats", {}, true);
    const s = state.adminStats;
    $("adminStats").innerHTML = `
      <div class="wallet-card"><span class="muted">المستخدمون</span><strong>${s.users_count}</strong></div>
      <div class="wallet-card"><span class="muted">المعلمون</span><strong>${s.teachers_count}</strong></div>
      <div class="wallet-card"><span class="muted">جلسات معلّقة</span><strong>${s.pending_sessions}</strong></div>
      <div class="wallet-card"><span class="muted">الكورسات</span><strong>${s.courses_count}</strong></div>
      <div class="wallet-card"><span class="muted">تسجيلات الكورسات</span><strong>${s.enrollments_count}</strong></div>
      <div class="wallet-card"><span class="muted">مدفوعات معلّقة</span><strong>${s.pending_payments}</strong></div>
      <div class="wallet-card"><span class="muted">إجمالي عمولتي ($)</span><strong>${fmtUsd(s.total_commission_usd)}</strong></div>`;
  } catch (e) { showToast(e.message); return; }
  await loadAdminTab(adminTab);
  try {
    const settings = await api("admin-settings", { action2: "get" }, true);
    $("setCommission").value = settings.commission_percent;
    $("setMinWithdraw").value = settings.min_withdrawal_usd;
  } catch { /* تجاهل */ }
}
$("adminTabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-atab]");
  if (!b) return;
  adminTab = b.dataset.atab;
  document.querySelectorAll("#adminTabs .tab").forEach((t) => t.classList.toggle("active", t === b));
  ["sessions", "payments", "courses", "users", "settings"].forEach((t) => {
    $("adminTab-" + t).hidden = t !== adminTab;
  });
  loadAdminTab(adminTab);
});
async function loadAdminTab(tab) {
  if (tab === "sessions") {
    const list = await api("admin-sessions", {}, true);
    $("adminSessionsList").innerHTML = list.length ? list.map((s) => `<div class="queue-item">
      <strong>${esc(s.subject)}</strong> — معلم: ${esc(s.teacher_name || "")} • طالب: ${esc(s.student_name || "")}
      <div class="meta">الموعد: ${fmtDate(s.scheduled_at)} • المدة: ${s.duration_minutes} دقيقة • السعر: ${fmtUsd(s.price_usd)} • الحالة: ${esc(statusLabel(s.status))}</div>
      <div class="review-actions">
        ${s.status === "pending" ? `<button class="btn btn-primary btn-sm" data-admin-session="confirm" data-id="${esc(s.id)}">تأكيد ✅</button>` : ""}
        ${s.status === "pending" || s.status === "confirmed" ? `<button class="btn btn-secondary btn-sm" data-admin-session="complete" data-id="${esc(s.id)}">إتمام (المعلم 90% + عمولة 10%)</button>` : ""}
        ${s.status === "pending" || s.status === "confirmed" ? `<button class="btn btn-danger btn-sm" data-admin-session="cancel" data-id="${esc(s.id)}">إلغاء</button>` : ""}
      </div>
    </div>`).join("") : `<p class="empty">مفيش جلسات لسه.</p>`;
    $("adminSessionsList").querySelectorAll("[data-admin-session]").forEach((b) => b.addEventListener("click", async () => {
      try {
        await api("admin-session", { id: b.dataset.id, action2: b.dataset.adminSession }, true);
        showToast("تم تحديث الجلسة ✅");
        loadAdminTab("sessions");
      } catch (e) { showToast(e.message); }
    }));
  }
  if (tab === "payments") {
    const list = await api("admin-payments", {}, true);
    $("adminPaymentsList").innerHTML = list.length ? list.map((p) => `<div class="queue-item">
      <strong>${p.type === "deposit" ? "إيداع" : "سحب"}</strong> — ${esc(p.tc_users?.name || "")} (${esc(p.tc_users?.email || "")})
      <div class="meta">المبلغ: ${fmtUsd(p.amount_usd)} • ${esc(p.method)} • الحالة: ${esc(p.status)}</div>
      <div class="work">${esc(p.reference || "")}</div>
      ${p.status === "pending" ? `<div class="review-actions">
        <button class="btn btn-primary btn-sm" data-admin-pay="approve" data-id="${esc(p.id)}">${p.type === "deposit" ? "موافقة (نزّل الرصيد)" : "اتدفع ✅"}</button>
        <button class="btn btn-danger btn-sm" data-admin-pay="reject" data-id="${esc(p.id)}">رفض</button>
      </div>` : ""}
    </div>`).join("") : `<p class="empty">مفيش مدفوعات لسه.</p>`;
    $("adminPaymentsList").querySelectorAll("[data-admin-pay]").forEach((b) => b.addEventListener("click", async () => {
      try {
        await api("admin-review-payment", { id: b.dataset.id, decision: b.dataset.adminPay === "approve" ? "approved" : "rejected" }, true);
        showToast("تمت المراجعة ✅");
        loadAdminTab("payments");
      } catch (e) { showToast(e.message); }
    }));
  }
  if (tab === "courses") {
    const list = await api("admin-courses", {}, true);
    const teachers = await api("list-teachers", {});
    $("acTeacher").innerHTML = teachers.map((t) => `<option value="${esc(t.id)}">${esc(t.name || "")} — ${fmtUsd(t.hourly_rate_usd)}/ساعة</option>`).join("");
    $("adminCoursesList").innerHTML = list.length ? list.map((c) => `<div class="queue-item">
      <strong>${esc(c.title)}</strong> — المعلم: ${esc(c.teacher_name || "")} • السعر: ${fmtUsd(c.price_usd)} • ${c.active ? "نشط" : "متوقف"}
      <div class="review-actions">
        <button class="btn btn-ghost btn-sm" data-toggle-course="${esc(c.id)}" data-active="${c.active}">${c.active ? "إيقاف" : "تفعيل"}</button>
        <button class="btn btn-danger btn-sm" data-delete-course="${esc(c.id)}">حذف</button>
      </div>
    </div>`).join("") : `<p class="empty">مفيش كورسات لسه.</p>`;
    $("adminCoursesList").querySelectorAll("[data-toggle-course]").forEach((b) => b.addEventListener("click", async () => {
      try { await api("admin-course", { id: Number(b.dataset.toggleCourse), action2: "update", active: b.dataset.active !== "true" }, true); loadAdminTab("courses"); }
      catch (e) { showToast(e.message); }
    }));
    $("adminCoursesList").querySelectorAll("[data-delete-course]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("متأكد إنك عايز تحذف الكورس ده؟")) return;
      try { await api("admin-course", { id: Number(b.dataset.deleteCourse), action2: "delete" }, true); showToast("تم حذف الكورس"); loadAdminTab("courses"); }
      catch (e) { showToast(e.message); }
    }));
  }
  if (tab === "users") {
    const list = await api("admin-users", {}, true);
    $("adminUsersList").innerHTML = list.length ? list.map((u) => `<div class="user-row">
      <div><strong>${esc(u.name)}</strong> <span class="role-badge">${u.role === "admin" ? "أدمن" : u.role === "teacher" ? "معلم" : "طالب"}</span> <span class="muted small">${esc(u.email)}</span></div>
      <div class="muted small">الرصيد: ${fmtUsd(u.balance_usd)} • المحجوز: ${fmtUsd(u.held_usd)} • إجمالي الكسب: ${fmtUsd(u.total_earned_usd)}</div>
      <div class="adjust">
        <input type="number" step="0.5" placeholder="مبلغ التعديل بالدولار (+ أو -)" data-adjust-amount="${esc(u.id)}">
        <input type="text" placeholder="ملاحظة (اختياري)" data-adjust-note="${esc(u.id)}">
        <button class="btn btn-secondary btn-sm" data-adjust-user="${esc(u.id)}">عدّل الرصيد</button>
      </div>
    </div>`).join("") : `<p class="empty">مفيش مستخدمين.</p>`;
    $("adminUsersList").querySelectorAll("[data-adjust-user]").forEach((b) => b.addEventListener("click", async () => {
      const id = b.dataset.adjustUser;
      const amount = Number(document.querySelector(`[data-adjust-amount="${id}"]`).value);
      const note = document.querySelector(`[data-adjust-note="${id}"]`).value;
      try {
        await api("admin-user", { user_id: id, amount_usd: amount, note }, true);
        showToast("تم تعديل الرصيد ✅");
        loadAdminTab("users");
      } catch (e) { showToast(e.message); }
    }));
  }
}
$("adminCourseForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("admin-course", { action2: "create", title: $("acTitle").value, description: $("acDesc").value, price_usd: Number($("acPrice").value), teacher_id: $("acTeacher").value }, true);
    setMsg("acMsg", "تم إضافة الكورس ✅ — ضيف دروسه من قاعدة البيانات أو من لوحة المعلم لاحقًا.", false);
    e.target.reset();
    loadAdminTab("courses");
  } catch (err) { setMsg("acMsg", err.message, true); }
});
$("adminSettingsForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("admin-settings", { settings: { commission_percent: $("setCommission").value, min_withdrawal_usd: $("setMinWithdraw").value } }, true);
    setMsg("setMsg", "تم حفظ الإعدادات ✅", false);
  } catch (err) { setMsg("setMsg", err.message, true); }
});

// ---------- البداية ----------
loadSession();
refreshAuthUI();
if (!CONFIG_OK) showToast("إعدادات الواجهة ناقصة — كلّم الأدمن");
go("home");
