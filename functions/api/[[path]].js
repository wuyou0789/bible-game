// functions/api/[[path]].js (The Ultimate All-in-Memory/File-based Worker)

// --- 【核心改动】直接从项目文件导入JSON数据 ---
// Cloudflare Pages在部署时，会自动将这些文件打包进Worker函数中
import versesByBook from '../../data-source/verses_content.json';
import bookNames from '../../data-source/book_names.json';


// --- 全局缓存，我们唯一的“数据库” ---
// 这些变量只会在Worker第一次被请求时（冷启动）填充一次
let allVersesById = null;
let idLookupTable = null;

/**
 * 优雅的初始化函数
 * @param {object} env - Worker的环境变量，包含R2绑定
 */
function initialize() {
    console.log("[Worker] Cold start: Initializing all data into memory from imported JSON files...");
    
    const lookupTable = {};
    const versesMap = {};

    for (const bookId in versesByBook) {
        if (!versesByBook[bookId] || !Array.isArray(versesByBook[bookId])) continue;
        
        lookupTable[bookId] = versesByBook[bookId].map(verse => {
            versesMap[verse.id] = verse; // 用ID作为Key，存下整个经文对象
            return verse.id;
        });
    }

    idLookupTable = lookupTable;
    allVersesById = versesMap;

    console.log(`[Worker] Initialization complete. ${Object.keys(allVersesById).length} verses loaded into memory.`);
}

// --- 辅助函数 (保持不变) ---
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function selectIdsBasedOnDifficulty(difficulty, localIdLookupTable) {
    const allBookIds = Object.keys(localIdLookupTable);
    const correctBookId = allBookIds[Math.floor(Math.random() * allBookIds.length)];
    const versesInCorrectBook = localIdLookupTable[correctBookId];
    if (!versesInCorrectBook || versesInCorrectBook.length === 0) {
        return selectIdsBasedOnDifficulty(difficulty, localIdLookupTable);
    }
    const correctId = versesInCorrectBook[Math.floor(Math.random() * versesInCorrectBook.length)];

    const sameBookDistractions = versesInCorrectBook.filter(id => id !== correctId);
    const otherBookIds = allBookIds.filter(id => id !== correctBookId);
    let otherBookDistractions = otherBookIds.map(bookId => localIdLookupTable[bookId]).flat();
    
    shuffleArray(sameBookDistractions);
    shuffleArray(otherBookDistractions);

    let distractionIds = [];
    switch (difficulty) {
        case 'hard':
            distractionIds.push(...sameBookDistractions.slice(0, 2));
            distractionIds.push(...otherBookDistractions.slice(0, 1));
            break;
        case 'medium':
            distractionIds.push(...sameBookDistractions.slice(0, 1));
            distractionIds.push(...otherBookDistractions.slice(0, 2));
            break;
        default: // easy
            distractionIds.push(...otherBookDistractions.slice(0, 3));
            break;
    }
    
    let allDistractions = [...sameBookDistractions, ...otherBookDistractions];
    let i = 0;
    while (distractionIds.length < 3 && i < allDistractions.length) {
        const randomDistraction = allDistractions[i];
        if (!distractionIds.includes(randomDistraction) && randomDistraction !== correctId) {
            distractionIds.push(randomDistraction);
        }
        i++;
    }
    
    return [correctId, ...distractionIds.slice(0, 3)];
}


// --- 统一的请求处理入口 ---
export async function onRequest(context) {
    // 【关键】这个模式下，我们不再需要env了
    const { request } = context;
    const url = new URL(request.url);
    const lang = url.searchParams.get('lang') || 'zh';

    try {
        // 如果内存缓存为空（冷启动），则执行初始化
        // ▼▼▼▼▼▼▼▼▼▼ 核心修复点 ▼▼▼▼▼▼▼▼▼▼
        // 我们不再需要从R2初始化，因为数据已经通过import导入了
        if (!idLookupTable) {
            initialize();
        }
        // ▲▲▲▲▲▲▲▲▲▲ 修复结束 ▲▲▲▲▲▲▲▲▲▲

        let responseData;

        // --- 简单的API路由器 ---
        if (url.pathname.endsWith('/new-question')) {
            const difficulty = url.searchParams.get('difficulty') || 'easy';
            const finalIds = selectIdsBasedOnDifficulty(difficulty, idLookupTable);
            const correctId = finalIds[0];
            const correctVerseDetails = allVersesById[correctId];
            
            let options = finalIds.map(id => {
                const verseData = allVersesById[id];
                const bookId = id.split('_')[0];
                const verseDisplay = verseData.verse.replace(/-/g, '–');
                return { id: id, text: `${bookNames[lang][bookId]} ${verseData.chapter}:${verseDisplay}` };
            });
            shuffleArray(options);

            responseData = {
                promptVerseText: correctVerseDetails.text[lang],
                options: options,
                correctOptionId: correctId
            };

        } else if (url.pathname.endsWith('/review-question')) {
            const verseIdToReview = url.searchParams.get('verseId');
            if (!verseIdToReview) return new Response(JSON.stringify({ error: 'verseId parameter is required' }), { status: 400 });

            const allIds = Object.keys(allVersesById);
            const distractionIds = new Set();
            while (distractionIds.size < 2) {
                const randomId = allIds[Math.floor(Math.random() * allIds.length)];
                if (randomId !== verseIdToReview) distractionIds.add(randomId);
            }

            const finalIds = [verseIdToReview, ...Array.from(distractionIds)];
            const correctVerseData = allVersesById[verseIdToReview];

            let options = finalIds.map(id => ({
                text: allVersesById[id].text[lang],
                isCorrect: id === verseIdToReview
            }));
            shuffleArray(options);

            const bookIdForReview = verseIdToReview.split('_')[0];
            responseData = {
                questionText: `${bookNames[lang][bookIdForReview]} ${correctVerseData.chapter}:${correctVerseData.verse.replace(/-/g, '–')}`,
                options: options
            };

        } else {
            return new Response("API endpoint not found", { status: 404 });
        }

        return new Response(JSON.stringify(responseData));

    } catch (error) {
        console.error("Error in onRequest:", error);
        return new Response(JSON.stringify({ error: 'Failed to process request', details: error.message, stack: error.stack }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
