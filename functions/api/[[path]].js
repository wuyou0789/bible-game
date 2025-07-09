// functions/api/[[path]].js (The Ultimate All-in-One D1 Worker)

// --- 导入我们的“题库包” ---
import gamePacks from '../../data-source/game-packs.json';

// --- 辅助函数 ---
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function getRandomItems(arr, numItems) {
    if (!arr || arr.length < numItems) return [];
    const shuffled = [...arr];
    shuffleArray(shuffled);
    return shuffled.slice(0, numItems);
}

// --- 统一的请求处理入口 ---
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const lang = url.searchParams.get('lang') || 'zh';
        const theme = url.searchParams.get('theme') || 'default';
        const difficulty = url.searchParams.get('difficulty') || 'easy';

        try {
            // 我们只处理一个API端点
            if (!url.pathname.endsWith('/get-question-bundle')) {
                return new Response("API endpoint not found", { status: 404 });
            }

            // 1. 获取题库，并挑选出本轮游戏需要的所有ID
            // 1个主问题 + 3个主干扰项 + (3个主干扰项 * 2个复习干扰项) = 10个
            const versePool = gamePacks[theme] || gamePacks['default'];
            if (versePool.length < 10) {
                throw new Error(`Theme "${theme}" has fewer than 10 verses required for a full bundle.`);
            }
            const selectedRefs = getRandomItems(versePool, 10);

            // 2. 使用这10个ID，向D1进行一次高效的批量查询
            const placeholders = selectedRefs.map(() => '?').join(',');
            const query = `SELECT * FROM verses WHERE verse_ref IN (${placeholders}) AND lang = ?`;
            const stmt = env.DB.prepare(query).bind(...selectedRefs, lang);
            const { results: verseDetails } = await stmt.all();

            if (!verseDetails || verseDetails.length < 10) {
                throw new Error(`Could not fetch all 10 required verses from D1.`);
            }
            
            // 3. 【核心组题逻辑】将查询到的数据组装成一个完整的“题目包”
            const mainQuestionRef = selectedRefs[0];
            const mainDistractionRefs = selectedRefs.slice(1, 4);
            const reviewDistractionPool = selectedRefs.slice(4);

            // 组装主问题选项
            let mainOptions = [mainQuestionRef, ...mainDistractionRefs].map(ref => {
                const verse = verseDetails.find(v => v.verse_ref === ref);
                return { id: verse.verse_ref, text: `${verse.book_name} ${verse.chapter}:${verse.verse_num.replace(/-/g, '–')}` };
            });
            shuffleArray(mainOptions);

            // 为每个主干扰项，准备好它们的复习题
            const reviewQuestions = {};
            mainDistractionRefs.forEach((distractionRef, index) => {
                const correctReviewVerse = verseDetails.find(v => v.verse_ref === distractionRef);
                // 从备用池里为它分配2个复习干扰项
                const reviewDistractors = reviewDistractionPool.slice(index * 2, index * 2 + 2);
                
                let reviewOptions = [
                    { text: correctReviewVerse.text, isCorrect: true },
                    ...reviewDistractors.map(reviewRef => ({
                        text: verseDetails.find(v => v.verse_ref === reviewRef).text,
                        isCorrect: false
                    }))
                ];
                shuffleArray(reviewOptions);

                reviewQuestions[distractionRef] = {
                    questionText: `${correctReviewVerse.book_name} ${correctReviewVerse.chapter}:${correctVerseData.verse_num.replace(/-/g, '–')}`,
                    options: reviewOptions
                };
            });

            // 4. 组装最终的“题目包”
            const correctVerseDetails = verseDetails.find(v => v.verse_ref === mainQuestionRef);
            const questionBundle = {
                mainQuestion: {
                    promptVerseText: correctVerseDetails.text,
                    options: mainOptions,
                    correctOptionId: mainQuestionRef
                },
                reviewQuestions: reviewQuestions
            };

            return new Response(JSON.stringify(questionBundle));

        } catch (error) {
            console.error("Error in get-question-bundle API:", error);
            return new Response(JSON.stringify({ error: 'Failed to process request', details: error.message, stack: error.stack }), { 
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    }
};
