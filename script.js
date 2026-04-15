const REVIEWS_KEY = "homeschoolHubClassReviewsV1";
const REQUESTS_KEY = "homeschoolHubScheduleRequestsV1";
const COMPLETED_CLASS_KEY = "homeschoolHubCompletedClassesV1";
const FEEDBACK_MESSAGES_KEY = "homeschoolHubFeedbackMessagesV1";

const signupForm = document.getElementById("signup-form");
const loginForm = document.getElementById("login-form");
const signupMsg = document.getElementById("signup-msg");
const loginMsg = document.getElementById("login-msg");
const authGate = document.getElementById("auth-gate");
const userBar = document.getElementById("user-bar");
const welcome = document.getElementById("welcome");
const logoutButton = document.getElementById("logout");
const authHint = document.getElementById("auth-hint");

const classForm = document.getElementById("class-form");
const filterForm = document.getElementById("filter-form");
const classList = document.getElementById("class-list");
const emptyMessage = document.getElementById("empty");
const clearAllButton = document.getElementById("clear-all");

const statCount = document.getElementById("stat-count");
const statSubjects = document.getElementById("stat-subjects");
const statModes = document.getElementById("stat-modes");

let authenticatedUser = null;
let classes = [];
let supportRequests = [];
let supportSummaryByClass = new Map();

function loadReviews() {
  const raw = localStorage.getItem(REVIEWS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadScheduleRequests() {
  const raw = localStorage.getItem(REQUESTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadCompletedClasses() {
  const raw = localStorage.getItem(COMPLETED_CLASS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadFeedbackMessages() {
  const raw = localStorage.getItem(FEEDBACK_MESSAGES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let reviews = loadReviews();
let scheduleRequests = loadScheduleRequests();
let completedClasses = loadCompletedClasses();
let feedbackMessages = loadFeedbackMessages();

function saveReviews() {
  localStorage.setItem(REVIEWS_KEY, JSON.stringify(reviews));
}

function saveScheduleRequests() {
  localStorage.setItem(REQUESTS_KEY, JSON.stringify(scheduleRequests));
}

function saveFeedbackMessages() {
  localStorage.setItem(FEEDBACK_MESSAGES_KEY, JSON.stringify(feedbackMessages));
}

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      credentials: "same-origin",
      body: options.body ? JSON.stringify(options.body) : undefined
    });
  } catch {
    throw new Error("Cannot reach server. Start `node server.js` and open http://localhost:3000");
  }

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }

  return payload;
}

function normalizeClass(item) {
  return {
    ...item,
    minRequired: Number(item.minRequired || 3),
    maxSeats: Number(item.maxSeats || 3),
    currentEnrollment: Number(item.currentEnrollment || 0),
    duration: String(item.duration || "Program length TBD"),
    ownerId: String(item.ownerId || ""),
    allowDiscounts: Boolean(item.allowDiscounts),
    discountSpots: Math.max(0, Number(item.discountSpots || 0)),
    allowCompensation: Boolean(item.allowCompensation),
    compensationSpots: Math.max(0, Number(item.compensationSpots || 0)),
    compensationExamples: Array.isArray(item.compensationExamples)
      ? item.compensationExamples.map((entry) => String(entry).trim()).filter(Boolean).slice(0, 5)
      : [],
    registrationNotes: String(item.registrationNotes || ""),
    tags: Array.isArray(item.tags) ? item.tags : []
  };
}

async function refreshRemoteData() {
  const classesResult = await api("/api/classes");
  classes = Array.isArray(classesResult.classes) ? classesResult.classes.map(normalizeClass) : [];

  const summaryResult = await api("/api/support-requests/summary");
  const summaryEntries = Array.isArray(summaryResult.summary) ? summaryResult.summary : [];
  supportSummaryByClass = new Map(
    summaryEntries.map((entry) => [
      entry.classId,
      {
        total: Number(entry.total || 0),
        pending: Number(entry.pending || 0),
        accepted: Number(entry.accepted || 0),
        declined: Number(entry.declined || 0)
      }
    ])
  );

  if (authenticatedUser) {
    const mineResult = await api("/api/support-requests?scope=mine");
    supportRequests = Array.isArray(mineResult.entries) ? mineResult.entries : [];
  } else {
    supportRequests = [];
  }
}

function showMessage(element, message, error = false) {
  element.textContent = message;
  element.style.color = error ? "#8c1d1d" : "#1f6b5c";
}

function currency(cost) {
  const number = Number(cost) || 0;
  return number === 0 ? "Free" : `$${number}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function activeFilters() {
  const data = new FormData(filterForm);
  return {
    search: String(data.get("search") || "").trim().toLowerCase(),
    subject: String(data.get("subject") || ""),
    mode: String(data.get("mode") || ""),
    maxCost: Number(data.get("maxCost") || ""),
    sort: String(data.get("sort") || "newest")
  };
}

function applyFilters(items) {
  const filters = activeFilters();
  let result = [...items];

  if (filters.search) {
    result = result.filter((item) => {
      const blob = [item.title, item.location, item.description, item.tags.join(" "), item.postedBy, item.duration]
        .join(" ")
        .toLowerCase();
      return blob.includes(filters.search);
    });
  }

  if (filters.subject) result = result.filter((item) => item.subject === filters.subject);
  if (filters.mode) result = result.filter((item) => item.mode === filters.mode);
  if (!Number.isNaN(filters.maxCost) && filters.maxCost > 0) {
    result = result.filter((item) => Number(item.cost) <= filters.maxCost);
  }

  if (filters.sort === "lowCost") {
    result.sort((a, b) => Number(a.cost) - Number(b.cost));
  } else if (filters.sort === "highSeats") {
    result.sort((a, b) => Number(b.maxSeats || 0) - Number(a.maxSeats || 0));
  } else {
    result.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  }

  return result;
}

function renderStats() {
  statCount.textContent = String(classes.length);
  statSubjects.textContent = String(new Set(classes.map((item) => item.subject)).size);
  statModes.textContent = String(new Set(classes.map((item) => item.mode)).size);
}

function reviewSummaryTemplate(classId) {
  const classReviews = reviews
    .filter((entry) => entry.classId === classId)
    .sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0));

  if (classReviews.length === 0) {
    return `<p class="review-empty">No reviews yet.</p>`;
  }

  const average = classReviews.reduce((sum, entry) => sum + (Number(entry.rating) || 0), 0) / classReviews.length;
  const visibleReviews = classReviews.slice(0, 2);
  const reviewItems = visibleReviews
    .map((entry) => {
      const rating = Math.max(1, Math.min(5, Number(entry.rating) || 1));
      const stars = `Rating ${rating}/5`;
      return `
        <li>
          <strong>${stars}</strong>
          <span>${escapeHtml(entry.comment)}</span>
        </li>
      `;
    })
    .join("");

  return `
    <div class="review-block">
      <p class="review-head">
        <strong>${average.toFixed(1)}/5</strong>
        <span>from ${classReviews.length} review${classReviews.length === 1 ? "" : "s"}</span>
      </p>
      <ul class="review-list">${reviewItems}</ul>
    </div>
  `;
}

function requestBlockTemplate(item) {
  const requestCount = scheduleRequests.filter((entry) => entry.classId === item.id).length;
  const summary = supportSummaryByClass.get(item.id) || { total: 0, pending: 0, accepted: 0, declined: 0 };
  const supportAvailable = item.allowDiscounts || item.allowCompensation;
  const helpText = authenticatedUser
    ? "Use Request Time next to Join to send preferred day/time."
    : "Log in to request a different day/time.";
  const supportHelpText = !supportAvailable
    ? "This class does not currently accept discount or compensation requests."
    : authenticatedUser
      ? "Use Request Discount/Comp to ask for tuition help or non-cash contribution options."
      : "Log in to request discount or compensated registration.";

  return `
    <div class="request-block">
      <p class="request-meta">${requestCount} time-change request${requestCount === 1 ? "" : "s"} submitted.</p>
      <p class="request-help">${helpText}</p>
      <p class="request-meta">${summary.total} discount/comp request${summary.total === 1 ? "" : "s"} submitted.</p>
      <p class="request-help">Pending ${summary.pending} | Accepted ${summary.accepted} | Declined ${summary.declined}</p>
      <p class="request-help">${supportHelpText}</p>
      <p class="request-msg" data-class-id="${item.id}"></p>
      <p class="request-msg" data-support-class-id="${item.id}"></p>
    </div>
  `;
}

function registrationOptionsTemplate(item) {
  if (!item.allowDiscounts && !item.allowCompensation && !item.registrationNotes) return "";
  const lines = [];
  if (item.allowDiscounts) {
    const discountSpots = Number(item.discountSpots || 0);
    lines.push(`<li>Discount requests allowed (${discountSpots} spot${discountSpots === 1 ? "" : "s"}).</li>`);
  }
  if (item.allowCompensation) {
    const compensationSpots = Number(item.compensationSpots || 0);
    const examples = item.compensationExamples.length
      ? ` Example options: ${escapeHtml(item.compensationExamples.join(", "))}.`
      : "";
    lines.push(`<li>Compensated registration allowed (volunteering/carpooling) (${compensationSpots} spot${compensationSpots === 1 ? "" : "s"}).${examples}</li>`);
  }
  if (item.registrationNotes) {
    lines.push(`<li>${escapeHtml(item.registrationNotes)}</li>`);
  }
  return `
    <div class="registration-block">
      <p class="registration-head">Flexible registration options</p>
      <ul class="registration-list">${lines.join("")}</ul>
    </div>
  `;
}

function setRequestMessage(classId, message, isError = false) {
  const messageElement = classList.querySelector(`.request-msg[data-class-id="${classId}"]`);
  if (!messageElement) return;
  messageElement.textContent = message;
  messageElement.style.color = isError ? "#8c1d1d" : "#1f6b5c";
}

function setFeedbackMessage(classId, message, isError = false) {
  const messageElement = classList.querySelector(`.feedback-msg[data-class-id="${classId}"]`);
  if (!messageElement) return;
  messageElement.textContent = message;
  messageElement.style.color = isError ? "#8c1d1d" : "#1f6b5c";
}

function setSupportMessage(classId, message, isError = false) {
  const messageElement = classList.querySelector(`.request-msg[data-support-class-id="${classId}"]`);
  if (!messageElement) return;
  messageElement.textContent = message;
  messageElement.style.color = isError ? "#8c1d1d" : "#1f6b5c";
}

function latestOwnSupportRequest(classId) {
  if (!authenticatedUser) return null;
  const mine = supportRequests
    .filter((entry) => entry.classId === classId && entry.requesterId === authenticatedUser.id)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  return mine[0] || null;
}

function supportStatusText(entry) {
  if (!entry) return "";
  const status = String(entry.status || "pending");
  const base = `Your latest support request is ${escapeHtml(status)}.`;
  if (!entry.decisionNote) return base;
  return `${base} Organizer note: ${escapeHtml(String(entry.decisionNote))}`;
}

function canSendFeedback(classId) {
  if (!authenticatedUser) return false;
  return completedClasses.some(
    (entry) => entry.ownerId === authenticatedUser.id && entry.classId === classId
  );
}

function cardTemplate(item) {
  const isConfirmed = Number(item.currentEnrollment) >= Number(item.minRequired);
  const isFull = Number(item.currentEnrollment) >= Number(item.maxSeats);
  const statusClass = isConfirmed ? "status-confirmed" : "status-pending";
  const statusText = isConfirmed ? "Confirmed" : "Pending";
  const tagMarkup = item.tags.filter(Boolean).map((tag) => `<span>${tag}</span>`).join("");
  const reviewMarkup = reviewSummaryTemplate(item.id);
  const requestMarkup = requestBlockTemplate(item);
  const registrationMarkup = registrationOptionsTemplate(item);
  const feedbackEnabled = canSendFeedback(item.id);
  const feedbackDisabled = feedbackEnabled && item.ownerId ? "" : "disabled";
  const canRequestSupport = item.allowDiscounts || item.allowCompensation;
  const supportDisabled = authenticatedUser && canRequestSupport && item.ownerId ? "" : "disabled";
  const latestSupportRequest = latestOwnSupportRequest(item.id);
  const latestSupportStatus = supportStatusText(latestSupportRequest);
  const feedbackHelp = !item.ownerId
    ? "Feedback not available until class has an owner."
    : feedbackEnabled
      ? "You completed this class. You can message the class holder."
      : "Complete this class in Dashboard first to send feedback.";

  return `
    <li class="class-card">
      <div class="class-head">
        <h3>${item.title}</h3>
        <div class="class-head-right">
          <span class="badge">${item.subject}</span>
          <span class="status-pill ${statusClass}">${statusText}</span>
        </div>
      </div>
      <p class="meta">
        <span>${item.schedule}</span>
        <span>${item.duration}</span>
        <span>${item.mode}</span>
        <span>${item.location}</span>
        <span>${currency(item.cost)}</span>
        <span>Min ${item.minRequired} to run</span>
        <span>Max ${item.maxSeats} seats</span>
        <span>Filled ${item.currentEnrollment}/${item.maxSeats}</span>
      </p>
      <p class="description">${item.description}</p>
      <div class="tags">${tagMarkup}</div>
      ${registrationMarkup}
      ${reviewMarkup}
      ${requestMarkup}
      ${latestSupportStatus ? `<p class="feedback-help">${latestSupportStatus}</p>` : ""}
      <p class="feedback-help">${feedbackHelp}</p>
      <p class="feedback-msg" data-class-id="${item.id}"></p>
      <div class="enroll-controls">
        <button type="button" class="small ghost" data-action="leave" data-id="${item.id}" ${item.currentEnrollment <= 0 ? "disabled" : ""}>- Leave</button>
        <button type="button" class="small" data-action="join" data-id="${item.id}" ${isFull ? "disabled" : ""}>+ Join</button>
        <button type="button" class="small ghost" data-action="requestTime" data-id="${item.id}" ${authenticatedUser ? "" : "disabled"}>Request Time</button>
        <button type="button" class="small ghost" data-action="requestSupport" data-id="${item.id}" ${supportDisabled}>Request Discount/Comp</button>
        <button type="button" class="small ghost" data-action="sendFeedback" data-id="${item.id}" ${feedbackDisabled}>Send Feedback</button>
      </div>
    </li>
  `;
}

function renderClasses() {
  reviews = loadReviews();
  scheduleRequests = loadScheduleRequests();
  completedClasses = loadCompletedClasses();
  feedbackMessages = loadFeedbackMessages();
  const visible = applyFilters(classes);
  classList.innerHTML = visible.map(cardTemplate).join("");
  emptyMessage.hidden = visible.length > 0;
  renderStats();
}

async function updateEnrollment(classId, delta) {
  try {
    await api(`/api/classes/${encodeURIComponent(classId)}/enrollment`, {
      method: "POST",
      body: { delta }
    });
    await refreshRemoteData();
    renderClasses();
  } catch (err) {
    setRequestMessage(classId, err.message, true);
  }
}

function setClassFormEnabled(enabled) {
  const controls = classForm.querySelectorAll("input, select, textarea, button");
  controls.forEach((control) => {
    control.disabled = !enabled;
  });

  if (enabled) {
    authHint.textContent = "You are logged in. Use Dashboard to fully manage classes and schedules.";
    authHint.style.color = "#1f6b5c";
  } else {
    authHint.textContent = "Log in, then use Dashboard to manage classes and schedules.";
    authHint.style.color = "#8c1d1d";
  }
}

function renderAuthState() {
  const isAuthed = Boolean(authenticatedUser);
  authGate.hidden = isAuthed;
  userBar.hidden = !isAuthed;
  setClassFormEnabled(isAuthed);
  welcome.textContent = isAuthed ? `Logged in as ${authenticatedUser.username}` : "";
  renderClasses();
}

async function initializeAuth() {
  try {
    const result = await api("/api/session");
    authenticatedUser = result.authenticated ? result.user : null;
  } catch (err) {
    authenticatedUser = null;
    showMessage(loginMsg, err.message, true);
  }

  try {
    await refreshRemoteData();
  } catch (err) {
    showMessage(loginMsg, err.message, true);
  }
  renderAuthState();
}

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(signupForm);
  try {
    const result = await api("/api/signup", {
      method: "POST",
      body: {
        username: String(data.get("username") || "").trim(),
        email: String(data.get("email") || "").trim().toLowerCase(),
        password: String(data.get("password") || "")
      }
    });
    authenticatedUser = result.user;
    window.location.href = "dashboard.html";
  } catch (err) {
    showMessage(signupMsg, err.message, true);
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(loginForm);
  try {
    const result = await api("/api/login", {
      method: "POST",
      body: {
        email: String(data.get("email") || "").trim().toLowerCase(),
        password: String(data.get("password") || "")
      }
    });
    authenticatedUser = result.user;
    window.location.href = "dashboard.html";
  } catch (err) {
    showMessage(loginMsg, err.message, true);
  }
});

logoutButton.addEventListener("click", async () => {
  try {
    await api("/api/logout", { method: "POST" });
  } catch {
    // no-op
  }
  authenticatedUser = null;
  supportRequests = [];
  try {
    await refreshRemoteData();
  } catch {
    classes = [];
    supportSummaryByClass = new Map();
  }
  renderAuthState();
});

classForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!authenticatedUser) return;

  const data = new FormData(classForm);
  const minRequired = Number(data.get("minRequired") || 0);
  const maxSeats = Number(data.get("maxSeats") || 0);
  if (minRequired < 3) {
    authHint.textContent = "Minimum required must be at least 3 students.";
    authHint.style.color = "#8c1d1d";
    return;
  }
  if (maxSeats < minRequired) {
    authHint.textContent = "Maximum seats must be greater than or equal to minimum required.";
    authHint.style.color = "#8c1d1d";
    return;
  }

  try {
    await api("/api/classes", {
      method: "POST",
      body: {
        title: String(data.get("title") || "").trim(),
        subject: String(data.get("subject") || ""),
        ageRange: String(data.get("ageRange") || "").trim(),
        schedule: String(data.get("schedule") || "").trim(),
        duration: String(data.get("duration") || "").trim(),
        mode: String(data.get("mode") || ""),
        location: String(data.get("location") || "").trim(),
        cost: Number(data.get("cost") || 0),
        allowDiscounts: data.get("allowDiscounts") === "on",
        discountSpots: Math.max(0, Number(data.get("discountSpots") || 0)),
        allowCompensation: data.get("allowCompensation") === "on",
        compensationSpots: Math.max(0, Number(data.get("compensationSpots") || 0)),
        compensationExamples: String(data.get("compensationExamples") || ""),
        registrationNotes: String(data.get("registrationNotes") || "").trim(),
        minRequired,
        maxSeats,
        description: String(data.get("description") || "").trim(),
        tags: String(data.get("tags") || "")
      }
    });
    classForm.reset();
    authHint.textContent = "Class posted successfully.";
    authHint.style.color = "#1f6b5c";
    await refreshRemoteData();
    renderClasses();
  } catch (err) {
    authHint.textContent = err.message;
    authHint.style.color = "#8c1d1d";
  }
});

filterForm.addEventListener("input", renderClasses);
filterForm.addEventListener("change", renderClasses);
classList.addEventListener("click", async (event) => {
  const actionElement = event.target.closest("[data-action]");
  if (!actionElement) return;
  const classId = actionElement.dataset.id;
  const action = actionElement.dataset.action;
  if (!classId || !action) return;

  if (action === "requestTime") {
    const targetClass = classes.find((item) => item.id === classId);
    if (!targetClass) {
      setRequestMessage(classId, "Class not found.", true);
      return;
    }
    if (!authenticatedUser) {
      setRequestMessage(classId, "Log in to send a time-change request.", true);
      return;
    }

    const preferredDayTime = String(window.prompt("Preferred day/time:", "") || "").trim();
    if (!preferredDayTime) {
      setRequestMessage(classId, "Time-change request canceled.", true);
      return;
    }
    const note = String(window.prompt("Optional note:", "") || "").trim();

    scheduleRequests.unshift({
      id: crypto.randomUUID(),
      classId,
      classTitle: targetClass.title,
      requesterId: authenticatedUser.id,
      requesterName: authenticatedUser.username,
      preferredDayTime,
      note,
      status: "pending",
      createdAt: Date.now()
    });

    saveScheduleRequests();
    renderClasses();
    setRequestMessage(classId, "Request sent to class organizer.");
    return;
  }

  if (action === "sendFeedback") {
    const targetClass = classes.find((item) => item.id === classId);
    if (!targetClass) {
      setFeedbackMessage(classId, "Class not found.", true);
      return;
    }
    if (!authenticatedUser) {
      setFeedbackMessage(classId, "Log in to send feedback.", true);
      return;
    }
    if (!targetClass.ownerId) {
      setFeedbackMessage(classId, "This class does not have a message recipient yet.", true);
      return;
    }
    if (!canSendFeedback(classId)) {
      setFeedbackMessage(classId, "Complete this class in Dashboard before sending feedback.", true);
      return;
    }

    const message = String(window.prompt("Send feedback to class holder:", "") || "").trim();
    if (!message) {
      setFeedbackMessage(classId, "Feedback canceled.", true);
      return;
    }
    if (message.length < 8) {
      setFeedbackMessage(classId, "Feedback must be at least 8 characters.", true);
      return;
    }

    feedbackMessages.unshift({
      id: crypto.randomUUID(),
      classId,
      classTitle: targetClass.title,
      toOwnerId: targetClass.ownerId,
      fromUserId: authenticatedUser.id,
      fromName: authenticatedUser.username,
      message,
      status: "new",
      createdAt: Date.now()
    });

    saveFeedbackMessages();
    setFeedbackMessage(classId, "Feedback sent to class holder.");
    return;
  }

  if (action === "requestSupport") {
    const targetClass = classes.find((item) => item.id === classId);
    if (!targetClass) {
      setSupportMessage(classId, "Class not found.", true);
      return;
    }
    if (!authenticatedUser) {
      setSupportMessage(classId, "Log in to send a discount/comp request.", true);
      return;
    }
    if (!targetClass.ownerId) {
      setSupportMessage(classId, "This class does not have an owner inbox yet.", true);
      return;
    }
    const allowsDiscount = Boolean(targetClass.allowDiscounts);
    const allowsCompensation = Boolean(targetClass.allowCompensation);
    if (!allowsDiscount && !allowsCompensation) {
      setSupportMessage(classId, "This class is not accepting discount or compensation requests.", true);
      return;
    }

    const defaultType = allowsDiscount ? "discount" : "compensation";
    const promptText = allowsDiscount && allowsCompensation
      ? "Request type (discount or compensation):"
      : allowsDiscount
        ? "Request type (discount):"
        : "Request type (compensation):";
    const typeInput = String(window.prompt(promptText, defaultType) || "").trim().toLowerCase();
    const normalizedType = typeInput === "comp" ? "compensation" : typeInput;
    const typeAllowed = (normalizedType === "discount" && allowsDiscount) || (normalizedType === "compensation" && allowsCompensation);
    if (!typeAllowed) {
      setSupportMessage(classId, "Request canceled. Enter discount or compensation based on available options.", true);
      return;
    }

    const details = String(
      window.prompt(
        normalizedType === "discount"
          ? "Share your discount request details:"
          : "Share your compensation offer (volunteering/carpooling) details:",
        ""
      ) || ""
    ).trim();
    if (details.length < 8) {
      setSupportMessage(classId, "Please include at least 8 characters so the organizer has enough context.", true);
      return;
    }

    try {
      await api("/api/support-requests", {
        method: "POST",
        body: {
          classId,
          type: normalizedType,
          details
        }
      });
      await refreshRemoteData();
      renderClasses();
      setSupportMessage(classId, "Discount/comp request sent to class organizer.");
    } catch (err) {
      setSupportMessage(classId, err.message, true);
    }
    return;
  }

  if (action === "join" || action === "leave") {
    await updateEnrollment(classId, action === "join" ? 1 : -1);
  }
});

clearAllButton.addEventListener("click", () => {
  authHint.textContent = "Classes are server-managed now. Delete classes from Dashboard if you own them.";
  authHint.style.color = "#8c1d1d";
});

initializeAuth();
