// functions/api/[[path]].js (The Ultimate D1 & R2 Powered Worker)

// --- 全局缓存 ---
// 在Worker的生命周期内，这些变量只会在冷启动时被填充一次
let gamePacks = null;
let bookNames = null;

/**
 * 优雅的初始化函数
 * 在Worker冷启动时，从R2一次性读取所有数据并加载到内存中
 * @param {object} env - Worker的环境变量，包含D1和R2的绑定
 */
async function initialize(env) {
    console.log("[Worker] Cold start: Initializing data from R2...");
    
    // 并行地从R2获取两个核心JSON文件
    const [gamePacksObj, bookNamesObj] = await Promise.all([
        env.BIBLE_DATA_BUCKET.get('game-packs.json'),
        env.BIBLE_DATA_BUCKET.get('book_names.json')
    ]);

    // 健壮性检查，确保文件存在
    if (!gamePacksObj) throw new Error("FATAL: 'game-packs.json' not found in R2 bucket. Please run the seed command.");
    if (!bookNamesObj) throw new Error("FATAL: 'book_names.json' not found in R2 bucket. Please run the seed command.");

    gamePacks = await gamePacksObj.json();
    bookNames = await bookNamesObj.json();

    console.log("[Worker] Initialization complete. Game data loaded into memory.");
}


// --- 辅助函数：洗牌算法 ---
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

/**
 * 从一个数组中安全地随机挑选指定数量的唯一元素
 * @param {Array} arr - 源数组
 * @param {number} numItems - 要挑选的数量
 * @returns {Array} 包含随机元素的数组
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
            // --- 在冷启动时，从R2获取题库包和书卷名 ---
            if (!gamePacks || !bookNames) {
                await initialize(env);
            }

            // --- API 路由器：根据路径决定做什么 ---
            if (url.pathname.endsWith('/new-question')) {
                // --- 处理主问题请求 ---
                const theme = url.searchParams.get('theme') || 'default';
                const difficulty = url.searchParams.get('difficulty') || 'easy';
                
                const versePool = gamePacks[theme] || gamePacks['default'];
                if (versePool.length < 10) { // 确保题库足够大以生成题目包
                    throw new Error(`Theme "${theme}" has fewer than 10 verses required for a full bundle.`);
                }

                // 1. 挑选出本轮游戏需要的所有ID
                const selectedRefs = getRandomItems(versePool, 10);
                const mainQuestionRef = selectedRefs[0];
                const mainDistractionRefs = selectedRefs.slice(1, 4);
                const reviewDistractionPool = selectedRefs.slice(4);

                // 2. 使用这10个ID，向D1进行一次高效的批量查询
                const placeholders = selectedRefs.map(() => '?').join(',');
                const query = `SELECT * FROM verses WHERE verse_ref IN (${placeholders}) AND lang = ?`;
                const stmt = env.DB.prepare(query).bind(...selectedRefs, lang);
                const { results: verseDetails } = await stmt.all();

                if (!verseDetails || verseDetails.length < selectedRefs.length) {
                    throw new Error(`Could not fetch all required verses from D1.`);
                }
                
                const verseDetailsMap = new Map(verseDetails.map(v => [v.verse_ref, v]));

                // 3. 组装主问题选项
                let mainOptions = [mainQuestionRef, ...mainDistractionRefs].map(ref => {
                    const verse = verseDetailsMap.get(ref);
                    return { id: verse.verse_ref, text: `${verse.book_name} ${verse.chapter}:${verse.verse_num.replace(/-/g, '–')}` };
                });
                shuffleArray(mainOptions);

                // 4. 为每个主干扰项，准备好它们的复习题
                const reviewQuestions = {};
                mainDistractionRefs.forEach((distractionRef, index) => {
                    const correctReviewVerse = verseDetailsMap.get(distractionRef);
                    // 从备用池里为它分配2个复习干扰项
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

                // 5. 组装最终的“题目包”
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
            console.error("Error in fetch handler:", error);
            return new Response(JSON.stringify({ error: 'Failed to process request', details: error.message, stack: error.stack }), { 
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    }
};
