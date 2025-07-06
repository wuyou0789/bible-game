const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const R2_BUCKET = "bible-game-verses";
const VERSES_FILE_PATH = path.join(__dirname, 'data-source', 'verses_content.json');
const BOOK_NAMES_FILE_PATH = path.join(__dirname, 'data-source', 'book_names.json');

function runCommand(command) {
  console.log(`\n> ${command}`);
  try {
    execSync(command, { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error(`❌ Command failed: ${command}`);
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

    console.log("🚀 Starting data seeding process...");

    console.log("\n[Step 1/3] Uploading book names to R2...");
    if (!runCommand(`wrangler r2 object put ${R2_BUCKET}/book_names.json --file=${BOOK_NAMES_FILE_PATH}`)) return;

    console.log("\n[Step 2/3] Uploading full verses content to R2...");
    if (!runCommand(`wrangler r2 object put ${R2_BUCKET}/verses_content.json --file=${VERSES_FILE_PATH}`)) return;

    console.log("\n[Step 3/3] Seeding individual verses into KV...");
    const versesContent = JSON.parse(fs.readFileSync(VERSES_FILE_PATH, 'utf-8'));
    for (const bookId in versesContent) {
        for (const chapterVerse in versesContent[bookId]) {
            const key = `${bookId}_${chapterVerse}`;
            const value = JSON.stringify(versesContent[bookId][chapterVerse]);
            // 【关键】使用您电脑Wrangler认可的旧版命令格式
            if (!runCommand(`wrangler kv key put --namespace-id=${KV_NAMESPACE_ID} "${key}" '${value}'`)) return;
        }
    }
    console.log("\n✅ Seeding complete!");
}

seed();