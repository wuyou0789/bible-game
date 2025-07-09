// functions/api/[[path]].js (The Ultimate D1 & R2 Powered Worker - Production Ready)

// --- 全局缓存 ---
// 在Worker的生命周期内，这些变量只会在冷启动时被填充一次
let gamePacks = null;

// --- 辅助函数：洗牌算法 ---
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

/**
 * 从一个数组中安全地随机挑选指定数量的唯一元素
 */
function getRandomItems(arr, numItems) {
    if (!arr || arr.length < numItems) {
        const shuffled = [...(arr || [])];
        shuffleArray(shuffled);
        return shuffled;
    }
    const shuffled = [...arr];
    shuffleArray(shuffled);
    return shuffled.slice(0, numItems);
}


// --- 统一的请求处理入口 (使用最稳定可靠的Service Worker格式) ---
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const lang = url.searchParams.get('lang') || 'zh';

        try {
            // 1. 检查D1数据库绑定是否存在
            if (!env.DB) {
                throw new Error("Server Configuration Error: D1 database binding 'DB' not found. Please check your Pages project settings.");
            }
            // 2. 检查R2存储桶绑定是否存在
            if (!env.BIBLE_DATA_BUCKET) {
                throw new Error("Server Configuration Error: R2 bucket binding 'BIBLE_DATA_BUCKET' not found. Please check your Pages project settings.");
            }
            
            // --- 在冷启动时，从R2获取题库包 ---
            if (!gamePacks) {
                console.log("[Worker] Cold start: Initializing game packs from R2...");
                const gamePacksObj = await env.BIBLE_DATA_BUCKET.get('game-packs.json');
                if (!gamePacksObj) {
                    throw new Error("FATAL: 'game-packs.json' not found in R2 bucket. Please ensure the file is uploaded.");
                }
                try {
                    gamePacks = await gamePacksObj.json();
                } catch (e) {
                    throw new Error("FATAL: Failed to parse 'game-packs.json'. Check the file for syntax errors.");
                }
                console.log("[Worker] Game packs loaded into memory.");
            }
            
            // --- API 路由器：根据路径决定做什么 ---
            if (url.pathname.endsWith('/new-question')) {
                const theme = url.searchParams.get('theme') || 'default';
                const difficulty = url.searchParams.get('difficulty') || 'easy';
                
                const versePool = gamePacks[theme] || gamePacks['default'];
                if (versePool.length < 10) {
                    throw new Error(`Theme "${theme}" has fewer than 10 verses required for a full bundle.`);
                }

                const selectedRefs = getRandomItems(versePool, 10);
                const mainQuestionRef = selectedRefs[0];
                const mainDistractionRefs = selectedRefs.slice(1, 4);
                const reviewDistractionPool = selectedRefs.slice(4);

                const allNeededRefs = [mainQuestionRef, ...mainDistractionRefs, ...reviewDistractionPool];
                
                const placeholders = allNeededRefs.map(() => '?').join(',');
                const query = `SELECT * FROM verses WHERE verse_ref IN (${placeholders}) AND lang = ?`;
                const stmt = env.DB.prepare(query).bind(...allNeededRefs, lang);
                const { results: verseDetails } = await stmt.all();

                if (!verseDetails || verseDetails.length < allNeededRefs.length) {
                    throw new Error(`Could not fetch all required verses from D1. Check if all verse_refs in game-packs.json exist in the database for lang '${lang}'.`);
                }
                
                const verseDetailsMap = new Map(verseDetails.map(v => [v.verse_ref, v]));

                let mainOptions = [mainQuestionRef, ...mainDistractionRefs].map(ref => {
                    const verse = verseDetailsMap.get(ref);
                    return { id: verse.verse_ref, text: `${verse.book_name} ${verse.chapter}:${verse.verse_num.replace(/-/g, '–')}` };
                });
                shuffleArray(mainOptions);

                const reviewQuestions = {};
                mainDistractionRefs.forEach((distractionRef, index) => {
                    const correctReviewVerse = verseDetailsMap.get(distractionRef);
                    const reviewDistractors = reviewDistractionPool.slice(index * 2, index * 2 + 2);
                    
                    let reviewOptions = [
                        { text: correctReviewVerse.text, isCorrect: true },
                        ...reviewDistractors.map(reviewRef => ({
                            text: verseDetailsMap.get(reviewRef).text,
                            isCorrect: false
                        }))
                    ];
                    shuffleArray(reviewOptions);

                    reviewQuestions[distractionRef] = {
                        questionText: `${correctReviewVerse.book_name} ${correctReviewVerse.chapter}:${correctReviewVerse.verse_num.replace(/-/g, '–')}`,
                        options: reviewOptions
                    };
                });

                const correctVerseDetails = verseDetailsMap.get(mainQuestionRef);
                const questionBundle = {
                    mainQuestion: {
                        promptVerseText: correctVerseDetails.text,
                        options: mainOptions,
                        correctOptionId: mainQuestionRef
                    },
                    reviewQuestions: reviewQuestions
                };
                
                return new Response(JSON.stringify(questionBundle));

            } else {
                return new Response("API endpoint not found", { status: 404 });
            }

        } catch (error) {
            console.error("Error in onRequest:", error);
            // 返回一个包含明确错误信息的JSON，方便前端调试
            return new Response(JSON.stringify({ 
                error: 'Failed to process request', 
                details: error.message, 
                stack: error.stack // 在开发中很有用
            }), { 
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    }
};
