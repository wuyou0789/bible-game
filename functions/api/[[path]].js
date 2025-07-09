// functions/api/[[path]].js (The Ultimate D1-Powered Worker - Correct Binding)

// --- 导入我们的“题库包” ---
import gamePacks from '../../data-source/game-packs.json';

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
    if (arr.length < numItems) {
        return [...arr];
    }
    const shuffled = [...arr];
    shuffleArray(shuffled);
    return shuffled.slice(0, numItems);
}


// --- 统一的请求处理入口 ---
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const lang = url.searchParams.get('lang') || 'zh';

        try {
            // --- API 路由器：根据路径决定做什么 ---
            if (url.pathname.endsWith('/new-question')) {
                // --- 处理主问题请求 ---
                const theme = url.searchParams.get('theme') || 'default';
                const difficulty = url.searchParams.get('difficulty') || 'easy';
                
                const versePool = gamePacks[theme] || gamePacks['default'];
                if (versePool.length < 4) {
                    throw new Error(`Theme "${theme}" has fewer than 4 verses.`);
                }

                const correctRef = getRandomItems(versePool, 1)[0];
                const correctBookId = correctRef.split('_')[0];

                const sameBookDistractionsPool = versePool.filter(ref => ref.startsWith(correctBookId + '_') && ref !== correctRef);
                const otherBookDistractionsPool = versePool.filter(ref => !ref.startsWith(correctBookId + '_'));
                
                let distractionRefs = [];
                switch (difficulty) {
                    case 'hard':
                        distractionRefs.push(...getRandomItems(sameBookDistractions, 2));
                        distractionRefs.push(...getRandomItems(otherBookDistractions, 1));
                        break;
                    case 'medium':
                        distractionRefs.push(...getRandomItems(sameBookDistractions, 1));
                        distractionRefs.push(...getRandomItems(otherBookDistractions, 2));
                        break;
                    default: // easy
                        distractionRefs.push(...getRandomItems(otherBookDistractions, 3));
                        break;
                }
                
                let allDistractionsPool = [...otherBookDistractions, ...sameBookDistractions];
                let i = 0;
                while (distractionRefs.length < 3 && i < allDistractionsPool.length) {
                    const randomRef = allDistractionsPool[i];
                    if (!distractionRefs.includes(randomRef) && randomRef !== correctRef) {
                        distractionRefs.push(randomRef);
                    }
                    i++;
                }
                distractionRefs = distractionRefs.slice(0, 3);

                const finalRefs = [correctRef, ...distractionRefs];
                
                // ▼▼▼▼▼▼▼▼▼▼ 【核心修正】使用正确的绑定名 DB ▼▼▼▼▼▼▼▼▼▼
                const placeholders = finalRefs.map(() => '?').join(',');
                const query = `SELECT * FROM verses WHERE verse_ref IN (${placeholders}) AND lang = ?`;
                const stmt = env.DB.prepare(query).bind(...finalRefs, lang);
                // ▲▲▲▲▲▲▲▲▲▲ 修正结束 ▲▲▲▲▲▲▲▲▲▲
                const { results } = await stmt.all();

                if (!results || results.length < 4) {
                    throw new Error(`Could not fetch all required verses from D1 for refs: ${finalRefs.join(', ')}`);
                }

                const correctVerseDetails = results.find(v => v.verse_ref === correctRef);

                let options = results.map(verse => ({
                    id: verse.verse_ref,
                    text: `${verse.book_name} ${verse.chapter}:${verse.verse_num.replace(/-/g, '–')}`
                }));
                shuffleArray(options);

                const responseData = {
                    promptVerseText: correctVerseDetails.text,
                    options: options,
                    correctOptionId: correctRef
                };
                
                return new Response(JSON.stringify(responseData));

            } else if (url.pathname.endsWith('/review-question')) {
                // --- 处理复习题请求 ---
                const verseIdToReview = url.searchParams.get('verseId');
                if (!verseIdToReview) return new Response(JSON.stringify({ error: 'verseId parameter is required' }), { status: 400 });

                // ▼▼▼▼▼▼▼▼▼▼ 【核心修正】使用正确的绑定名 DB ▼▼▼▼▼▼▼▼▼▼
                const stmtDistractors = env.DB.prepare(
                    `SELECT * FROM verses WHERE verse_ref != ?1 AND lang = ?2 ORDER BY RANDOM() LIMIT 2`
                ).bind(verseIdToReview, lang);
                
                const stmtReview = env.DB.prepare(
                    `SELECT * FROM verses WHERE verse_ref = ?1 AND lang = ?2`
                ).bind(verseIdToReview, lang);
                // ▲▲▲▲▲▲▲▲▲▲ 修正结束 ▲▲▲▲▲▲▲▲▲▲

                const [distractorsResult, reviewResult] = await Promise.all([
                    stmtDistractors.all(),
                    reviewResult.first()
                ]);

                const distractors = distractorsResult.results;
                const correctVerseData = reviewResult;

                if (!correctVerseData || distractors.length < 2) {
                    throw new Error(`Could not fetch data for review question: ${verseIdToReview}`);
                }

                let options = [
                    { text: correctVerseData.text, isCorrect: true },
                    ...distractors.map(d => ({ text: d.text, isCorrect: false }))
                ];
                shuffleArray(options);

                const responseData = {
                    questionText: `${correctVerseData.book_name} ${correctVerseData.chapter}:${correctVerseData.verse_num.replace(/-/g, '–')}`,
                    options: options
                };

                return new Response(JSON.stringify(responseData));
            }

            return new Response("API endpoint not found", { status: 404 });

        } catch (error) {
            console.error("Error in onRequest:", error);
            return new Response(JSON.stringify({ error: 'Failed to process request', details: error.message, stack: error.stack }), { 
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    }
};
