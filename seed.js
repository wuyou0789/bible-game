const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const R2_BUCKET = "bible-game-verses";
const VERSES_FILE_PATH = path.join(__dirname, 'data-source', 'verses_content.json');
const BOOK_NAMES_FILE_PATH = path.join(__dirname, 'data-source', 'book_names.json');

function runCommand(command) {
  const remoteCommand = `${command} --remote`;
  console.log(`\n> ${remoteCommand}`);
  try {
    execSync(remoteCommand, { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error(`❌ Command failed: ${remoteCommand}`);
    return false;
  }
}

async function seed() {
    const wranglerToml = fs.readFileSync(path.join(__dirname, 'wrangler.toml'), 'utf-8');
    const match = /id\s*=\s*"([^"]+)"/.exec(wranglerToml);
    if (!match) {
        console.error("❌ Could not find KV namespace ID in wrangler.toml. Please ensure it's configured correctly.");
        return;
    }
    const KV_NAMESPACE_ID = match[1];

    console.log("🚀 Starting data seeding process to a REMOTE location...");

    console.log("\n[Step 1/3] Uploading book names to REMOTE R2...");
    if (!runCommand(`wrangler r2 object put ${R2_BUCKET}/book_names.json --file=${BOOK_NAMES_FILE_PATH}`)) return;

    console.log("\n[Step 2/3] Uploading full verses content to REMOTE R2...");
    if (!runCommand(`wrangler r2 object put ${R2_BUCKET}/verses_content.json --file=${VERSES_FILE_PATH}`)) return;

    console.log("\n[Step 3/3] Seeding individual verses into REMOTE KV...");
    const versesContent = JSON.parse(fs.readFileSync(VERSES_FILE_PATH, 'utf-8'));
    for (const bookId in versesContent) {
        for (const chapterVerse in versesContent[bookId]) {
            const key = `${bookId}_${chapterVerse}`;
            const value = JSON.stringify(versesContent[bookId][chapterVerse]);
            if (!runCommand(`wrangler kv key put --namespace-id=${KV_NAMESPACE_ID} "${key}" '${value}'`)) return;
        }
    }
    console.log("\n✅ Seeding to remote complete!");
}

seed();