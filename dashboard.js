const CHILD_SCHEDULE_KEY = "homeschoolHubChildSchedulesV1";
const COMPLETED_CLASS_KEY = "homeschoolHubCompletedClassesV1";
const REVIEWS_KEY = "homeschoolHubClassReviewsV1";
const REQUESTS_KEY = "homeschoolHubScheduleRequestsV1";
const FEEDBACK_MESSAGES_KEY = "homeschoolHubFeedbackMessagesV1";

const welcome = document.getElementById("welcome");
const logoutButton = document.getElementById("logout");
const classForm = document.getElementById("class-form");
const classSubmitButton = document.getElementById("class-submit");
const classCancelButton = document.getElementById("class-cancel");
const authHint = document.getElementById("auth-hint");
const profileForm = document.getElementById("profile-form");
const profileNameInput = document.getElementById("profile-name");
const profileCurrentPasswordInput = document.getElementById("profile-current-password");
const profileNewPasswordInput = document.getElementById("profile-new-password");
const profileMsg = document.getElementById("profile-msg");
const myClassesList = document.getElementById("my-classes-list");
const myClassesEmpty = document.getElementById("my-classes-empty");
const feedbackInboxList = document.getElementById("feedback-inbox-list");
const feedbackInboxEmpty = document.getElementById("feedback-inbox-empty");
const childScheduleForm = document.getElementById("child-schedule-form");
const childClassSelect = document.getElementById("child-class-select");
const childScheduleList = document.getElementById("child-schedule-list");
const childScheduleEmpty = document.getElementById("child-schedule-empty");
const reviewForm = document.getElementById("review-form");
const reviewClassSelect = document.getElementById("review-class-select");
const reviewSubmitButton = document.getElementById("review-submit");
const reviewCancelButton = document.getElementById("review-cancel");
const reviewMsg = document.getElementById("review-msg");
const myReviewsList = document.getElementById("my-reviews-list");
const myReviewsEmpty = document.getElementById("my-reviews-empty");

let authenticatedUser = null;
let editingClassId = null;
let editingReviewId = null;
let classes = [];
let supportRequests = [];

function loadLocal(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

let childSchedules = loadLocal(CHILD_SCHEDULE_KEY);
let completedClasses = loadLocal(COMPLETED_CLASS_KEY);
let reviews = loadLocal(REVIEWS_KEY);
let scheduleRequests = loadLocal(REQUESTS_KEY);
let feedbackMessages = loadLocal(FEEDBACK_MESSAGES_KEY);

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "same-origin",
    body: options.body ? JSON.stringify(options.body) : undefined
  });
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeClass(item) {
  return {
    ...item,
    minRequired: Number(item.minRequired || 3),
    maxSeats: Number(item.maxSeats || 3),
    currentEnrollment: Number(item.currentEnrollment || 0),
    discountSpots: Number(item.discountSpots || 0),
    compensationSpots: Number(item.compensationSpots || 0),
    compensationExamples: Array.isArray(item.compensationExamples) ? item.compensationExamples : [],
    tags: Array.isArray(item.tags) ? item.tags : []
  };
}

async function refreshServerData() {
  const [classRes, supportRes] = await Promise.all([
    api("/api/classes"),
    api("/api/support-requests?scope=owner")
  ]);
  classes = Array.isArray(classRes.classes) ? classRes.classes.map(normalizeClass) : [];
  supportRequests = Array.isArray(supportRes.entries) ? supportRes.entries : [];
}

function getMyClasses() {
  return classes.filter((item) => item.ownerId === authenticatedUser.id);
}

function renderClassOptions() {
  const options = classes.map((item) => `<option value="${item.id}">${escapeHtml(item.title)} (${escapeHtml(item.schedule)})</option>`).join("");
  childClassSelect.innerHTML = `<option value="">Choose a class</option>${options}`;
  reviewClassSelect.innerHTML = `<option value="">Choose a completed class</option>${options}`;
}

function renderMyClasses() {
  const mine = getMyClasses();
  myClassesList.innerHTML = mine.map((item) => {
    const support = supportRequests.filter((entry) => entry.classId === item.id);
    const supportMarkup = support.length
      ? `<ul class="owner-request-list">${support.map((entry) => `
          <li>
            <div class="manage-row">
              <span>${escapeHtml(entry.requesterName)} requested ${escapeHtml(entry.type || "support")} help</span>
              <div class="stack-actions">
                <span class="message-status">${entry.status === "accepted" ? "Accepted" : entry.status === "declined" ? "Declined" : "Pending"}</span>
                <button type="button" class="small ghost" data-action="deleteSupportRequest" data-id="${entry.id}">Remove</button>
              </div>
            </div>
            <p class="manage-meta">${escapeHtml(entry.details || "")}</p>
            ${entry.decisionNote ? `<p class="manage-meta">Owner note: ${escapeHtml(entry.decisionNote)}</p>` : ""}
            <div class="form-actions">
              <button type="button" class="small" data-action="acceptSupportRequest" data-id="${entry.id}" ${entry.status === "accepted" ? "disabled" : ""}>Accept</button>
              <button type="button" class="small ghost" data-action="declineSupportRequest" data-id="${entry.id}" ${entry.status === "declined" ? "disabled" : ""}>Decline</button>
            </div>
          </li>
        `).join("")}</ul>`
      : `<p class="manage-meta">No discount/comp requests yet.</p>`;
    return `
      <li>
        <div class="manage-row">
          <strong>${escapeHtml(item.title)}</strong>
          <div class="stack-actions">
            <button type="button" class="small ghost" data-action="editClass" data-id="${item.id}">Edit</button>
            <button type="button" class="small ghost" data-action="deleteClass" data-id="${item.id}">Delete</button>
          </div>
        </div>
        <p class="manage-meta">${item.currentEnrollment}/${item.maxSeats} filled | ${escapeHtml(item.duration || "")}</p>
        <p class="manage-meta">Flexible registration: Discounts ${item.discountSpots} spots | Compensation ${item.compensationSpots} spots</p>
        ${supportMarkup}
      </li>
    `;
  }).join("");
  myClassesEmpty.hidden = mine.length > 0;
}

function renderLocalSections() {
  const myFeedback = feedbackMessages.filter((entry) => entry.toOwnerId === authenticatedUser.id);
  feedbackInboxList.innerHTML = myFeedback.map((entry) => `<li><p class="manage-meta">${escapeHtml(entry.message || "")}</p></li>`).join("");
  feedbackInboxEmpty.hidden = myFeedback.length > 0;

  const mySchedules = childSchedules.filter((entry) => entry.ownerId === authenticatedUser.id);
  childScheduleList.innerHTML = mySchedules.map((entry) => `<li><p class="manage-meta">${escapeHtml(entry.childName)} -> ${escapeHtml(entry.classTitle)}</p></li>`).join("");
  childScheduleEmpty.hidden = mySchedules.length > 0;

  const myReviews = reviews.filter((entry) => entry.ownerId === authenticatedUser.id);
  myReviewsList.innerHTML = myReviews.map((entry) => `<li><p class="manage-meta">${escapeHtml(entry.classTitle)}: ${escapeHtml(entry.comment)}</p></li>`).join("");
  myReviewsEmpty.hidden = myReviews.length > 0;
}

function renderDashboard() {
  welcome.textContent = `Logged in as ${authenticatedUser.username}`;
  renderClassOptions();
  renderMyClasses();
  renderLocalSections();
}

function resetClassEditor(message = "") {
  editingClassId = null;
  classForm.reset();
  classSubmitButton.textContent = "Publish Class";
  classCancelButton.hidden = true;
  if (message) {
    authHint.textContent = message;
    authHint.style.color = "#1f6b5c";
  }
}

function beginClassEdit(classId) {
  const item = classes.find((entry) => entry.id === classId && entry.ownerId === authenticatedUser.id);
  if (!item) return;
  editingClassId = item.id;
  classSubmitButton.textContent = "Save Class Changes";
  classCancelButton.hidden = false;
  classForm.elements.namedItem("title").value = item.title || "";
  classForm.elements.namedItem("subject").value = item.subject || "";
  classForm.elements.namedItem("ageRange").value = item.ageRange || "";
  classForm.elements.namedItem("schedule").value = item.schedule || "";
  classForm.elements.namedItem("duration").value = item.duration || "";
  classForm.elements.namedItem("mode").value = item.mode || "";
  classForm.elements.namedItem("location").value = item.location || "";
  classForm.elements.namedItem("cost").value = String(Number(item.cost) || 0);
  classForm.elements.namedItem("allowDiscounts").checked = Boolean(item.allowDiscounts);
  classForm.elements.namedItem("discountSpots").value = String(Number(item.discountSpots) || 0);
  classForm.elements.namedItem("allowCompensation").checked = Boolean(item.allowCompensation);
  classForm.elements.namedItem("compensationSpots").value = String(Number(item.compensationSpots) || 0);
  classForm.elements.namedItem("minRequired").value = String(Number(item.minRequired) || 3);
  classForm.elements.namedItem("maxSeats").value = String(Number(item.maxSeats) || 3);
  classForm.elements.namedItem("compensationExamples").value = Array.isArray(item.compensationExamples) ? item.compensationExamples.join(", ") : "";
  classForm.elements.namedItem("registrationNotes").value = item.registrationNotes || "";
  classForm.elements.namedItem("description").value = item.description || "";
  classForm.elements.namedItem("tags").value = Array.isArray(item.tags) ? item.tags.join(", ") : "";
}

classForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(classForm);
  const payload = {
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
    minRequired: Number(data.get("minRequired") || 0),
    maxSeats: Number(data.get("maxSeats") || 0),
    description: String(data.get("description") || "").trim(),
    tags: String(data.get("tags") || "")
  };
  try {
    if (editingClassId) {
      await api(`/api/classes/${encodeURIComponent(editingClassId)}`, { method: "PATCH", body: payload });
      resetClassEditor("Class updated successfully.");
    } else {
      await api("/api/classes", { method: "POST", body: payload });
      classForm.reset();
      authHint.textContent = "Class posted successfully.";
      authHint.style.color = "#1f6b5c";
    }
    await refreshServerData();
    renderDashboard();
  } catch (err) {
    authHint.textContent = err.message;
    authHint.style.color = "#8c1d1d";
  }
});

classCancelButton.addEventListener("click", () => resetClassEditor("Class edit canceled."));

myClassesList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  const id = button.dataset.id;
  if (action === "editClass") {
    beginClassEdit(id);
    return;
  }
  try {
    if (action === "deleteClass") {
      await api(`/api/classes/${encodeURIComponent(id)}`, { method: "DELETE" });
      await refreshServerData();
      renderDashboard();
      return;
    }
    if (action === "deleteSupportRequest") {
      await api(`/api/support-requests/${encodeURIComponent(id)}`, { method: "DELETE" });
      await refreshServerData();
      renderMyClasses();
      return;
    }
    if (action === "acceptSupportRequest" || action === "declineSupportRequest") {
      const isAccept = action === "acceptSupportRequest";
      const suggestion = isAccept
        ? "Comped class for carpool driving, or 40% off when driving 3+ students."
        : "Unable to offer discount/compensation for this session.";
      const decisionNote = String(window.prompt("Optional owner note for this decision:", suggestion) || "").trim();
      await api(`/api/support-requests/${encodeURIComponent(id)}/decision`, {
        method: "PATCH",
        body: { status: isAccept ? "accepted" : "declined", decisionNote }
      });
      await refreshServerData();
      renderMyClasses();
    }
  } catch (err) {
    authHint.textContent = err.message;
    authHint.style.color = "#8c1d1d";
  }
});

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const result = await api("/api/profile", {
      method: "POST",
      body: {
        username: String(profileNameInput.value || "").trim(),
        currentPassword: String(profileCurrentPasswordInput.value || ""),
        newPassword: String(profileNewPasswordInput.value || "")
      }
    });
    authenticatedUser = result.user;
    profileNameInput.value = authenticatedUser.username;
    profileCurrentPasswordInput.value = "";
    profileNewPasswordInput.value = "";
    profileMsg.textContent = "Profile updated.";
    profileMsg.style.color = "#1f6b5c";
  } catch (err) {
    profileMsg.textContent = err.message;
    profileMsg.style.color = "#8c1d1d";
  }
});

childScheduleForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(childScheduleForm);
  const classId = String(data.get("classId") || "");
  const selectedClass = classes.find((item) => item.id === classId);
  if (!selectedClass) return;
  childSchedules.unshift({
    id: crypto.randomUUID(),
    ownerId: authenticatedUser.id,
    childName: String(data.get("childName") || "").trim(),
    classId,
    classTitle: selectedClass.title,
    dayTime: String(data.get("dayTime") || "").trim(),
    notes: String(data.get("notes") || "").trim()
  });
  saveLocal(CHILD_SCHEDULE_KEY, childSchedules);
  childScheduleForm.reset();
  renderLocalSections();
});

reviewCancelButton.addEventListener("click", () => {
  editingReviewId = null;
  reviewForm.reset();
  reviewSubmitButton.textContent = "Submit Review";
  reviewCancelButton.hidden = true;
  reviewMsg.textContent = "Review edit canceled.";
  reviewMsg.style.color = "#1f6b5c";
});

reviewForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(reviewForm);
  reviews.unshift({
    id: crypto.randomUUID(),
    ownerId: authenticatedUser.id,
    classId: String(data.get("classId") || ""),
    classTitle: reviewClassSelect.options[reviewClassSelect.selectedIndex]?.textContent || "",
    rating: Number(data.get("rating") || 0),
    comment: String(data.get("comment") || "").trim(),
    createdAt: Date.now()
  });
  saveLocal(REVIEWS_KEY, reviews);
  reviewForm.reset();
  renderLocalSections();
});

logoutButton.addEventListener("click", async () => {
  try {
    await api("/api/logout", { method: "POST" });
  } catch {
    // no-op
  }
  window.location.href = "index.html";
});

async function initialize() {
  try {
    const result = await api("/api/session");
    if (!result.authenticated) {
      window.location.href = "index.html";
      return;
    }
    authenticatedUser = result.user;
    await refreshServerData();
    profileNameInput.value = authenticatedUser.username;
    authHint.textContent = "Create and manage classes from this dashboard.";
    authHint.style.color = "#1f6b5c";
    reviewMsg.textContent = "Mark completed classes and share your feedback.";
    reviewMsg.style.color = "#1f6b5c";
    profileMsg.textContent = "Update your display name or password.";
    profileMsg.style.color = "#1f6b5c";
    renderDashboard();
  } catch {
    window.location.href = "index.html";
  }
}

initialize();
