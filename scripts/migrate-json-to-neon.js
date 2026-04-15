const fs = require("fs");
const path = require("path");
const {
  ensureDatabase,
  saveUsers,
  saveClasses,
  saveSupportRequests
} = require("../server");

const DATA_DIR = path.join(__dirname, "..", "data");

function readArray(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) return [];

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Array.isArray(parsed) ? parsed : [];
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Set DATABASE_URL before running the Neon migration.");
  }

  const users = readArray("users.json");
  const classes = readArray("classes.json");
  const supportRequests = readArray("support_requests.json");

  await ensureDatabase();
  await saveUsers(users);
  await saveClasses(classes);
  await saveSupportRequests(supportRequests);

  console.log(`Migrated ${users.length} users, ${classes.length} classes, and ${supportRequests.length} support requests to Neon.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
