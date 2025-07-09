// functions/api/get-full-question.js (Final, Intelligent Bundle Architecture)
import bookNames from '../../data-source/book_names.json'; // 我们将book_names也打包进来，因为它不常变

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const url = new URL(request.url);
    const theme = url.searchParams.get('theme') || 'default';
    const lang = url.searchParams.get('lang') || 'zh';
    const difficulty = url.searchParams.get('difficulty') || 'easy';

    // 1. 从R2获取题库ID列表
    const gamePacksObj = await env.BIBLE_DATA_BUCKET.get('game-packs.json');
    if (!gamePacksObj) throw new Error("game-packs.json not found.");
    const gamePacks = await gamePacksObj.json();
    const themeVerseRefs = gamePacks[theme];
    shuffleArray(themeVerseRefs);

    // 2. 【核心】先在内存中智能地挑选出所有需要的10个ID
    const allNeededRefs = new Set();

    // a. 选出主问题ID和其书卷
    const correctMainRef = themeVerseRefs[0];
    const correctBookId = correctMainRef.split('_')[0];
    allNeededRefs.add(correctMainRef);

    // b. 根据难度策略，挑选3个主干扰项ID
    const sameBookDistractionsPool = themeVerseRefs.filter(ref => ref.startsWith(correctBookId + '_') && ref !== correctMainRef);
    const otherBookDistractionsPool = themeVerseRefs.filter(ref => !ref.startsWith(correctBookId + '_'));
    shuffleArray(sameBookDistractionsPool);
    shuffleArray(otherBookDistractionsPool);
    
    let mainDistractionRefs = [];
    if (difficulty === 'hard') {
        mainDistractionRefs.push(...sameBookDistractionsPool.slice(0, 2));
        mainDistractionRefs.push(...otherBookDistractionsPool.slice(0, 1));
    } else if (difficulty === 'medium') {
        mainDistractionRefs.push(...sameBookDistractionsPool.slice(0, 1));
        mainDistractionRefs.push(...otherBookDistractionsPool.slice(0, 2));
    } else {
        mainDistractionRefs.push(...otherBookDistractionsPool.slice(0, 3));
    }
    // 确保有3个干扰项
    while(mainDistractionRefs.length < 3) mainDistractionRefs.push(otherBookDistractionsPool[mainDistractionRefs.length]);
    mainDistractionRefs.forEach(ref => allNeededRefs.add(ref));

    // c. 为每个主干扰项，挑选2个复习干扰项ID
    mainDistractionRefs.forEach(distractionRef => {
      let count = 0;
      while (count < 2) {
        const randomReviewDistraction = themeVerseRefs[Math.floor(Math.random() * themeVerseRefs.length)];
        if (!allNeededRefs.has(randomReviewDistraction)) {
          allNeededRefs.add(randomReviewDistraction);
          count++;
        }
      }
    });

    const finalRefs = Array.from(allNeededRefs);

    // 3. 一次性从D1获取所有需要的数据
    const placeholders = finalRefs.map(() => '?').join(',');
    const stmt = env.DB.prepare(`SELECT id, book_id, chapter, verse_num, text FROM verses WHERE verse_ref IN (${placeholders}) AND lang = ?`);
    const { results } = await stmt.bind(...finalRefs, lang).all();
    const versesMap = new Map(results.map(row => [row.verse_ref, row]));

    // 4. 精心组装“超级题目包”
    const correctVerse = versesMap.get(correctMainRef);
    
    let mainOptions = [correctMainRef, ...mainDistractionRefs].map(ref => {
      const verse = versesMap.get(ref);
      return { id: verse.id, ref: ref, text: `${bookNames[lang][verse.book_id]} ${verse.chapter}:${verse.verse_num}` };
    });
    shuffleArray(mainOptions);

    const reviewData = {};
    mainDistractionRefs.forEach(distractionRef => {
      const correctReviewVerse = versesMap.get(distractionRef);
      // 从所有获取到的数据中，排除掉主问题和当前复习题，剩下的都可以做干扰项
      const reviewDistractionPool = results.filter(v => v.verse_ref !== correctMainRef && v.verse_ref !== distractionRef);
      shuffleArray(reviewDistractionPool);
      
      let reviewOptions = [correctReviewVerse, ...reviewDistractionPool.slice(0, 2)].map(v => ({
          text: v.text,
          isCorrect: v.id === correctReviewVerse.id
      }));
      shuffleArray(reviewOptions);

      reviewData[distractionRef] = {
        questionText: `${bookNames[lang][correctReviewVerse.book_id]} ${correctReviewVerse.chapter}:${correctReviewVerse.verse_num}`,
        options: reviewOptions
      };
    });

    const fullQuestionPackage = {
      mainQuestion: {
        promptVerseText: correctVerse.text,
        options: mainOptions,
        correctOptionId: correctVerse.id,
        correctOptionRef: correctVerse.verse_ref,
      },
      reviewData: reviewData
    };

    return new Response(JSON.stringify(fullQuestionPackage));

  } catch (error) {
    console.error("Error in get-full-question:", error);
    return new Response(JSON.stringify({ error: 'Failed to generate full package', details: error.message, stack: error.stack }), { status: 500 });
  }
}