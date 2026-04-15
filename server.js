const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = process.env.VERCEL ? path.join("/tmp", "homeschool-hub-data") : path.join(ROOT, "data");
const USERS_PATH = path.join(DATA_DIR, "users.json");
const CLASSES_PATH = path.join(DATA_DIR, "classes.json");
const SUPPORT_REQUESTS_PATH = path.join(DATA_DIR, "support_requests.json");
const COOKIE_NAME = "homeschool_sid";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const sessions = new Map();

const seedClasses = [
  {
    id: crypto.randomUUID(),
    title: "Forest Geometry",
    subject: "STEM",
    ageRange: "9-12",
    schedule: "Mondays 9:30 AM",
    duration: "6-week program",
    mode: "In Person",
    location: "North Ridge Trails",
    cost: 12,
    allowDiscounts: true,
    discountSpots: 2,
    allowCompensation: true,
    compensationSpots: 1,
    compensationExamples: ["trail setup volunteer", "carpool rotation"],
    registrationNotes: "Ask the organizer about reduced tuition in exchange for volunteer support.",
    minRequired: 5,
    maxSeats: 10,
    currentEnrollment: 4,
    description: "Measure tree height, estimate angles, and use real outdoor examples to apply geometry concepts.",
    tags: ["outdoors", "project based"],
    postedBy: "Community Admin",
    ownerId: "",
    createdAt: Date.now() - 1000 * 60 * 60 * 24
  },
  {
    id: crypto.randomUUID(),
    title: "Writing Through Biographies",
    subject: "Language Arts",
    ageRange: "11-14",
    schedule: "Thursdays 1:00 PM",
    duration: "Summer program",
    mode: "Online",
    location: "Zoom",
    cost: 0,
    allowDiscounts: false,
    discountSpots: 0,
    allowCompensation: false,
    compensationSpots: 0,
    compensationExamples: [],
    registrationNotes: "",
    minRequired: 6,
    maxSeats: 16,
    currentEnrollment: 7,
    description: "Students read short biographies and develop stronger essay structure, grammar, and argument.",
    tags: ["writing", "middle school"],
    postedBy: "Community Admin",
    ownerId: "",
    createdAt: Date.now() - 1000 * 60 * 60 * 12
  }
];

ensureStorage();

function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(USERS_PATH)) {
    fs.writeFileSync(USERS_PATH, "[]", "utf8");
  }
  if (!fs.existsSync(CLASSES_PATH)) {
    fs.writeFileSync(CLASSES_PATH, JSON.stringify(seedClasses, null, 2), "utf8");
  }
  if (!fs.existsSync(SUPPORT_REQUESTS_PATH)) {
    fs.writeFileSync(SUPPORT_REQUESTS_PATH, "[]", "utf8");
  }
}

function jsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function readArray(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeArray(filePath, items) {
  fs.writeFileSync(filePath, JSON.stringify(items, null, 2), "utf8");
}

function getUsers() {
  return readArray(USERS_PATH);
}

function saveUsers(users) {
  writeArray(USERS_PATH, users);
}

function getClasses() {
  return readArray(CLASSES_PATH).map((item) => ({
    ...item,
    minRequired: Math.max(3, Number(item.minRequired || 3)),
    maxSeats: Math.max(3, Number(item.maxSeats || 3)),
    currentEnrollment: Math.max(0, Number(item.currentEnrollment || 0)),
    cost: Math.max(0, Number(item.cost || 0)),
    allowDiscounts: Boolean(item.allowDiscounts),
    discountSpots: Math.max(0, Number(item.discountSpots || 0)),
    allowCompensation: Boolean(item.allowCompensation),
    compensationSpots: Math.max(0, Number(item.compensationSpots || 0)),
    compensationExamples: Array.isArray(item.compensationExamples)
      ? item.compensationExamples.map((entry) => String(entry).trim()).filter(Boolean).slice(0, 5)
      : [],
    registrationNotes: String(item.registrationNotes || ""),
    tags: Array.isArray(item.tags) ? item.tags.map((entry) => String(entry).trim()).filter(Boolean).slice(0, 7) : []
  }));
}

function saveClasses(classes) {
  writeArray(CLASSES_PATH, classes);
}

function getSupportRequests() {
  return readArray(SUPPORT_REQUESTS_PATH).map((entry) => ({
    ...entry,
    type: String(entry.type || "support"),
    status: String(entry.status || "pending"),
    decisionNote: String(entry.decisionNote || "")
  }));
}

function saveSupportRequests(entries) {
  writeArray(SUPPORT_REQUESTS_PATH, entries);
}

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  return header.split(";").reduce((acc, part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

function getSessionUser(req) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;

  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }

  const users = getUsers();
  const user = users.find((u) => u.id === session.userId);
  if (!user) return null;

  return { id: user.id, username: user.username, email: user.email, token };
}

function requireSession(req, res) {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) {
    jsonResponse(res, 401, { error: "You must be logged in." });
    return null;
  }
  return sessionUser;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        reject(new Error("Request too large"));
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON payload"));
      }
    });
    req.on("error", reject);
  });
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, expected] = String(storedHash).split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { userId, expiresAt: Date.now() + SESSION_TTL_MS });
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Max-Age=604800; Path=/`);
}

function clearSession(req, res) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (token) sessions.delete(token);
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/`);
}

function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const routeMap = {
    "/": "/index.html",
    "/index": "/index.html",
    "/dashboard": "/dashboard.html"
  };
  const pathname = routeMap[requestUrl.pathname] || requestUrl.pathname;
  const urlPath = pathname === "/" ? "/index.html" : pathname;
  const safePath = path.normalize(urlPath).replace(/^([.][.][/\\])+/, "");
  const filePath = path.join(ROOT, safePath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(content);
  });
}

function sanitizeClassInput(body) {
  const minRequired = Math.max(3, Number(body.minRequired || 0));
  const maxSeats = Math.max(3, Number(body.maxSeats || 0));
  const currentEnrollment = Math.max(0, Number(body.currentEnrollment || 0));
  if (maxSeats < minRequired) {
    return { error: "Maximum seats must be greater than or equal to minimum required." };
  }
  return {
    title: String(body.title || "").trim(),
    subject: String(body.subject || "").trim(),
    ageRange: String(body.ageRange || "").trim(),
    schedule: String(body.schedule || "").trim(),
    duration: String(body.duration || "").trim(),
    mode: String(body.mode || "").trim(),
    location: String(body.location || "").trim(),
    cost: Math.max(0, Number(body.cost || 0)),
    allowDiscounts: Boolean(body.allowDiscounts),
    discountSpots: Math.max(0, Number(body.discountSpots || 0)),
    allowCompensation: Boolean(body.allowCompensation),
    compensationSpots: Math.max(0, Number(body.compensationSpots || 0)),
    compensationExamples: String(body.compensationExamples || "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 5),
    registrationNotes: String(body.registrationNotes || "").trim().slice(0, 240),
    minRequired,
    maxSeats,
    currentEnrollment,
    description: String(body.description || "").trim(),
    tags: String(body.tags || "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 7)
  };
}

async function handleApi(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = requestUrl.pathname;

  if (req.method === "GET" && pathname === "/api/session") {
    const user = getSessionUser(req);
    if (!user) {
      jsonResponse(res, 200, { authenticated: false });
      return true;
    }
    jsonResponse(res, 200, { authenticated: true, user: { id: user.id, username: user.username, email: user.email } });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/classes") {
    const classes = getClasses().sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    jsonResponse(res, 200, { classes });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/classes") {
    try {
      const sessionUser = requireSession(req, res);
      if (!sessionUser) return true;
      const body = await readJsonBody(req);
      const parsed = sanitizeClassInput(body);
      if (parsed.error) {
        jsonResponse(res, 400, { error: parsed.error });
        return true;
      }
      if (!parsed.title || !parsed.subject || !parsed.schedule || !parsed.description) {
        jsonResponse(res, 400, { error: "Title, subject, schedule, and description are required." });
        return true;
      }

      const classes = getClasses();
      const item = {
        id: crypto.randomUUID(),
        ...parsed,
        postedBy: sessionUser.username,
        ownerId: sessionUser.id,
        currentEnrollment: 0,
        createdAt: Date.now()
      };
      classes.unshift(item);
      saveClasses(classes);
      jsonResponse(res, 201, { classItem: item });
      return true;
    } catch (err) {
      jsonResponse(res, 400, { error: err.message || "Invalid request" });
      return true;
    }
  }

  const classMatch = pathname.match(/^\/api\/classes\/([^/]+)$/);
  if (classMatch && req.method === "PATCH") {
    try {
      const sessionUser = requireSession(req, res);
      if (!sessionUser) return true;

      const classId = decodeURIComponent(classMatch[1]);
      const classes = getClasses();
      const index = classes.findIndex((item) => item.id === classId);
      if (index < 0) {
        jsonResponse(res, 404, { error: "Class not found." });
        return true;
      }
      if (classes[index].ownerId !== sessionUser.id) {
        jsonResponse(res, 403, { error: "Only the class owner can edit this class." });
        return true;
      }

      const body = await readJsonBody(req);
      const parsed = sanitizeClassInput(body);
      if (parsed.error) {
        jsonResponse(res, 400, { error: parsed.error });
        return true;
      }

      const previous = classes[index];
      const nextEnrollment = Math.min(parsed.maxSeats, Math.max(0, Number(previous.currentEnrollment || 0)));
      const updated = {
        ...previous,
        ...parsed,
        currentEnrollment: nextEnrollment,
        updatedAt: Date.now()
      };
      classes[index] = updated;
      saveClasses(classes);
      jsonResponse(res, 200, { classItem: updated });
      return true;
    } catch (err) {
      jsonResponse(res, 400, { error: err.message || "Invalid request" });
      return true;
    }
  }

  if (classMatch && req.method === "DELETE") {
    const sessionUser = requireSession(req, res);
    if (!sessionUser) return true;
    const classId = decodeURIComponent(classMatch[1]);

    const classes = getClasses();
    const target = classes.find((item) => item.id === classId);
    if (!target) {
      jsonResponse(res, 404, { error: "Class not found." });
      return true;
    }
    if (target.ownerId !== sessionUser.id) {
      jsonResponse(res, 403, { error: "Only the class owner can delete this class." });
      return true;
    }

    saveClasses(classes.filter((item) => item.id !== classId));
    const support = getSupportRequests().filter((entry) => entry.classId !== classId);
    saveSupportRequests(support);
    jsonResponse(res, 200, { ok: true });
    return true;
  }

  const enrollmentMatch = pathname.match(/^\/api\/classes\/([^/]+)\/enrollment$/);
  if (enrollmentMatch && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const delta = Number(body.delta || 0);
      if (delta !== 1 && delta !== -1) {
        jsonResponse(res, 400, { error: "Enrollment delta must be +1 or -1." });
        return true;
      }
      const classId = decodeURIComponent(enrollmentMatch[1]);
      const classes = getClasses();
      const index = classes.findIndex((item) => item.id === classId);
      if (index < 0) {
        jsonResponse(res, 404, { error: "Class not found." });
        return true;
      }
      const target = classes[index];
      const next = Math.min(
        Number(target.maxSeats || 0),
        Math.max(0, Number(target.currentEnrollment || 0) + delta)
      );
      target.currentEnrollment = next;
      target.updatedAt = Date.now();
      classes[index] = target;
      saveClasses(classes);
      jsonResponse(res, 200, { classItem: target });
      return true;
    } catch (err) {
      jsonResponse(res, 400, { error: err.message || "Invalid request" });
      return true;
    }
  }

  if (req.method === "GET" && pathname === "/api/support-requests/summary") {
    const support = getSupportRequests();
    const byClass = new Map();
    support.forEach((entry) => {
      const bucket = byClass.get(entry.classId) || { classId: entry.classId, total: 0, pending: 0, accepted: 0, declined: 0 };
      bucket.total += 1;
      if (entry.status === "accepted") bucket.accepted += 1;
      else if (entry.status === "declined") bucket.declined += 1;
      else bucket.pending += 1;
      byClass.set(entry.classId, bucket);
    });
    jsonResponse(res, 200, { summary: Array.from(byClass.values()) });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/support-requests") {
    const sessionUser = requireSession(req, res);
    if (!sessionUser) return true;
    const scope = String(requestUrl.searchParams.get("scope") || "mine");
    const support = getSupportRequests();
    const entries = scope === "owner"
      ? support.filter((entry) => entry.toOwnerId === sessionUser.id)
      : support.filter((entry) => entry.requesterId === sessionUser.id);
    jsonResponse(res, 200, { entries });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/support-requests") {
    try {
      const sessionUser = requireSession(req, res);
      if (!sessionUser) return true;
      const body = await readJsonBody(req);
      const classId = String(body.classId || "");
      const type = String(body.type || "").trim().toLowerCase();
      const details = String(body.details || "").trim();
      if (!classId) {
        jsonResponse(res, 400, { error: "Class is required." });
        return true;
      }
      if (type !== "discount" && type !== "compensation") {
        jsonResponse(res, 400, { error: "Type must be discount or compensation." });
        return true;
      }
      if (details.length < 8) {
        jsonResponse(res, 400, { error: "Details must be at least 8 characters." });
        return true;
      }

      const classes = getClasses();
      const classItem = classes.find((item) => item.id === classId);
      if (!classItem) {
        jsonResponse(res, 404, { error: "Class not found." });
        return true;
      }
      if (!classItem.ownerId) {
        jsonResponse(res, 400, { error: "This class does not have an owner inbox yet." });
        return true;
      }
      if (type === "discount" && !classItem.allowDiscounts) {
        jsonResponse(res, 400, { error: "This class is not accepting discount requests." });
        return true;
      }
      if (type === "compensation" && !classItem.allowCompensation) {
        jsonResponse(res, 400, { error: "This class is not accepting compensation requests." });
        return true;
      }

      const support = getSupportRequests();
      const entry = {
        id: crypto.randomUUID(),
        classId,
        classTitle: classItem.title,
        toOwnerId: classItem.ownerId,
        requesterId: sessionUser.id,
        requesterName: sessionUser.username,
        type,
        details,
        status: "pending",
        decisionNote: "",
        createdAt: Date.now()
      };
      support.unshift(entry);
      saveSupportRequests(support);
      jsonResponse(res, 201, { entry });
      return true;
    } catch (err) {
      jsonResponse(res, 400, { error: err.message || "Invalid request" });
      return true;
    }
  }

  const supportDecisionMatch = pathname.match(/^\/api\/support-requests\/([^/]+)\/decision$/);
  if (supportDecisionMatch && req.method === "PATCH") {
    try {
      const sessionUser = requireSession(req, res);
      if (!sessionUser) return true;
      const supportId = decodeURIComponent(supportDecisionMatch[1]);
      const support = getSupportRequests();
      const index = support.findIndex((entry) => entry.id === supportId);
      if (index < 0) {
        jsonResponse(res, 404, { error: "Support request not found." });
        return true;
      }
      const target = support[index];
      if (target.toOwnerId !== sessionUser.id) {
        jsonResponse(res, 403, { error: "Only the class owner can respond to this request." });
        return true;
      }
      const body = await readJsonBody(req);
      const status = String(body.status || "").trim().toLowerCase();
      if (status !== "accepted" && status !== "declined") {
        jsonResponse(res, 400, { error: "Status must be accepted or declined." });
        return true;
      }
      target.status = status;
      target.decisionNote = String(body.decisionNote || "").trim().slice(0, 240);
      target.respondedAt = Date.now();
      support[index] = target;
      saveSupportRequests(support);
      jsonResponse(res, 200, { entry: target });
      return true;
    } catch (err) {
      jsonResponse(res, 400, { error: err.message || "Invalid request" });
      return true;
    }
  }

  const supportDeleteMatch = pathname.match(/^\/api\/support-requests\/([^/]+)$/);
  if (supportDeleteMatch && req.method === "DELETE") {
    const sessionUser = requireSession(req, res);
    if (!sessionUser) return true;
    const supportId = decodeURIComponent(supportDeleteMatch[1]);
    const support = getSupportRequests();
    const target = support.find((entry) => entry.id === supportId);
    if (!target) {
      jsonResponse(res, 404, { error: "Support request not found." });
      return true;
    }
    if (target.toOwnerId !== sessionUser.id) {
      jsonResponse(res, 403, { error: "Only the class owner can delete this request." });
      return true;
    }
    saveSupportRequests(support.filter((entry) => entry.id !== supportId));
    jsonResponse(res, 200, { ok: true });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/signup") {
    try {
      const body = await readJsonBody(req);
      const username = String(body.username || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");

      if (!username || !email || password.length < 6) {
        jsonResponse(res, 400, { error: "Provide username, email, and password (6+ chars)." });
        return true;
      }

      const users = getUsers();
      if (users.some((u) => u.email === email)) {
        jsonResponse(res, 409, { error: "That email is already registered." });
        return true;
      }

      const user = {
        id: crypto.randomUUID(),
        username,
        email,
        passwordHash: hashPassword(password),
        createdAt: Date.now()
      };

      users.push(user);
      saveUsers(users);
      createSession(res, user.id);
      jsonResponse(res, 201, { user: { id: user.id, username: user.username, email: user.email } });
      return true;
    } catch (err) {
      jsonResponse(res, 400, { error: err.message || "Invalid request" });
      return true;
    }
  }

  if (req.method === "POST" && pathname === "/api/login") {
    try {
      const body = await readJsonBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");

      const users = getUsers();
      const user = users.find((u) => u.email === email);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        jsonResponse(res, 401, { error: "Incorrect email or password." });
        return true;
      }

      createSession(res, user.id);
      jsonResponse(res, 200, { user: { id: user.id, username: user.username, email: user.email } });
      return true;
    } catch (err) {
      jsonResponse(res, 400, { error: err.message || "Invalid request" });
      return true;
    }
  }

  if (req.method === "POST" && pathname === "/api/profile") {
    try {
      const sessionUser = getSessionUser(req);
      if (!sessionUser) {
        jsonResponse(res, 401, { error: "You must be logged in." });
        return true;
      }

      const body = await readJsonBody(req);
      const requestedUsername = String(body.username || "").trim();
      const currentPassword = String(body.currentPassword || "");
      const newPassword = String(body.newPassword || "");

      const users = getUsers();
      const targetIndex = users.findIndex((u) => u.id === sessionUser.id);
      if (targetIndex < 0) {
        jsonResponse(res, 404, { error: "User not found." });
        return true;
      }

      const targetUser = users[targetIndex];
      let changed = false;

      if ("username" in body) {
        if (!requestedUsername || requestedUsername.length < 2) {
          jsonResponse(res, 400, { error: "Display name must be at least 2 characters." });
          return true;
        }
        if (requestedUsername !== targetUser.username) {
          targetUser.username = requestedUsername;
          changed = true;
        }
      }

      if (newPassword) {
        if (newPassword.length < 6) {
          jsonResponse(res, 400, { error: "New password must be at least 6 characters." });
          return true;
        }
        if (!currentPassword || !verifyPassword(currentPassword, targetUser.passwordHash)) {
          jsonResponse(res, 401, { error: "Current password is incorrect." });
          return true;
        }
        targetUser.passwordHash = hashPassword(newPassword);
        changed = true;
      }

      if (!changed) {
        jsonResponse(res, 400, { error: "No profile changes were submitted." });
        return true;
      }

      users[targetIndex] = targetUser;
      saveUsers(users);
      jsonResponse(res, 200, { user: { id: targetUser.id, username: targetUser.username, email: targetUser.email } });
      return true;
    } catch (err) {
      jsonResponse(res, 400, { error: err.message || "Invalid request" });
      return true;
    }
  }

  if (req.method === "POST" && pathname === "/api/logout") {
    clearSession(req, res);
    jsonResponse(res, 200, { ok: true });
    return true;
  }

  return false;
}

function createServer() {
  return http.createServer(async (req, res) => {
    try {
      if (req.url.startsWith("/api/")) {
        const handled = await handleApi(req, res);
        if (!handled) jsonResponse(res, 404, { error: "Route not found" });
        return;
      }

      serveStatic(req, res);
    } catch {
      jsonResponse(res, 500, { error: "Internal server error" });
    }
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, () => {
    console.log(`Homeschool Hub running at http://localhost:${PORT}`);
  });
}

module.exports = {
  handleApi,
  jsonResponse,
  createServer
};
