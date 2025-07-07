// functions/api/[[path]].js (The All-in-Memory Ultimate Worker - Final Fix V3)

// --- 全局缓存，我们唯一的“数据库” ---
let allVersesById = null;
let idLookupTable = null;
let bookNames = null;

/**
 * 优雅的初始化函数
 * 在Worker冷启动时，从R2一次性读取所有数据并加载到内存中
 */
async function initialize(env) {
    console.log("[Worker] Cold start: Initializing all data into memory from R2...");
    
    // ▼▼▼▼▼▼▼▼▼▼ 核心修复点 ▼▼▼▼▼▼▼▼▼▼
    // 将变量名改回与wrangler.toml中一致的 IDS_SOURCE_BUCKET
    const [versesContentObj, bookNamesObj] = await Promise.all([
        env.IDS_SOURCE_BUCKET.get('verses_content.json'),
        env.IDS_SOURCE_BUCKET.get('book_names.json')
    ]);
    // ▲▲▲▲▲▲▲▲▲▲ 修复结束 ▲▲▲▲▲▲▲▲▲▲

    // 健壮性检查，确保文件存在
    if (!versesContentObj) throw new Error("FATAL: 'verses_content.json' not found in R2 bucket.");
    if (!bookNamesObj) throw new Error("FATAL: 'book_names.json' not found in R2 bucket.");

    const versesByBook = await versesContentObj.json();
    bookNames = await bookNamesObj.json();

    const lookupTable = {};
    const versesMap = {};

    for (const bookId in versesByBook) {
        if (!versesByBook[bookId] || !Array.isArray(versesByBook[bookId])) continue;
        
        lookupTable[bookId] = versesByBook[bookId].map(verse => {
            versesMap[verse.id] = verse;
            return verse.id;
        });
    }

    idLookupTable = lookupTable;
    allVersesById = versesMap;

    console.log(`[Worker] Initialization complete. ${Object.keys(allVersesById).length} verses loaded into memory.`);
}

// --- 辅助函数：洗牌算法 ---
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// --- 辅助函数：根据难度选择ID ---
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
        if (!distractionIds.includes(randomDistraction)) {
            distractionIds.push(randomDistraction);
        }
        i++;
    }
    
    return [correctId, ...distractionIds.slice(0, 3)];
}


// --- 统一的请求处理入口 ---
export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const lang = url.searchParams.get('lang') || 'zh';

    try {
        if (!idLookupTable || !bookNames || !allVersesById) {
            await initialize(env);
        }

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

        return new Response(JSON.stringify(responseData), {
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error("Error in onRequest:", error);
        return new Response(JSON.stringify({ error: 'Failed to process request', details: error.message, stack: error.stack }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
