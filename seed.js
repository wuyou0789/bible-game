// 导入Node.js的内置工具
const { execSync } = require('child_process');
const path = require('path');

// ------------------------------------------------------------------
// --- 配置区域 ---
// ------------------------------------------------------------------

// 您的R2存储桶的真实名称
const R2_BUCKET_NAME = "bible-game-verses";

// 您的数据源文件的准确路径
const VERSES_FILE_PATH = path.join(__dirname, 'data-source', 'verses_content.json');
const BOOK_NAMES_FILE_PATH = path.join(__dirname, 'data-source', 'book_names.json');


// ------------------------------------------------------------------
// --- 【核心改动】智能判断目标环境 ---
// ------------------------------------------------------------------

// process.argv是一个数组，包含了所有命令行参数，例如：
// ['/usr/local/bin/node', '/path/to/seed.js', '--remote']
// 我们检查这个数组里是否包含 '--remote' 这个标志
const targetRemote = process.argv.includes('--remote');

// 根据判断结果，设置一个友好的文本，用于日志输出
const targetLocation = targetRemote ? 'REMOTE (Cloud)' : 'LOCAL (Development)';


// ------------------------------------------------------------------
// --- 程序核心逻辑 ---
// ------------------------------------------------------------------

/**
 * 在终端运行一条命令，并根据目标环境决定是否添加 --remote 参数
 * @param {string} command 要运行的命令
 * @returns {boolean} 命令是否成功
 */
function runCommand(command) {
    // 如果目标是远程，就在命令末尾加上 --remote
    const finalCommand = targetRemote ? `${command} --remote` : command;
    
    console.log(`\n> Executing: ${finalCommand}`);
    try {
        execSync(finalCommand, { stdio: 'inherit' });
        return true;
    } catch (error) {
        console.error(`[ERROR] Command failed: ${finalCommand}`);
        return false;
    }
}

/**
 * 主函数，执行所有上传任务
 */
function seed() {
    console.log(`[START] Starting data seeding process to ${targetLocation} environment...`);

    console.log("\n[Step 1/2] Uploading book_names.json...");
    if (!runCommand(`wrangler r2 object put ${R2_BUCKET_NAME}/book_names.json --file=${BOOK_NAMES_FILE_PATH}`)) return;

    console.log("\n[Step 2/2] Uploading verses_content.json...");
    if (!runCommand(`wrangler r2 object put ${R2_BUCKET_NAME}/verses_content.json --file=${VERSES_FILE_PATH}`)) return;
    
    console.log(`\n[SUCCESS] Seeding to ${targetLocation} complete!`);
}

// --- 运行主函数 ---
seed();
