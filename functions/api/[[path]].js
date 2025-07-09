// --- 辅助函数，保持不变 ---
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

/**
 * 专门负责从R2获取book_names.json
 */
async function handleGetBookNames(env) {
  const bookNamesObj = await env.BIBLE_DATA_BUCKET.get('book_names.json');
  if (!bookNamesObj) {
    return new Response('Book names not found', { status: 404 });
  }
  return new Response(bookNamesObj.body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' }
  });
}

/**
 * 专门负责生成“超级题目包”
 */
async function handleGetFullQuestion(url, env) {
  const theme = url.searchParams.get('theme') || 'default';
  const lang = url.searchParams.get('lang') || 'zh';
  const difficulty = url.searchParams.get('difficulty') || 'easy';

  // 从R2并行获取数据
   const gamePacksObj = await env.BIBLE_DATA_BUCKET.get('game-packs.json');
  if (!gamePacksObj) throw new Error("game-packs.json not found.");
  const gamePacks = await gamePacksObj.json();
  
  const themeVerseRefs = gamePacks[theme];
  shuffleArray(themeVerseRefs);

  // 1. 智能挑选10个ID
  const correctMainRef = themeVerseRefs[0];
  const correctBookId = correctMainRef.split('_')[0];
  const allNeededRefs = new Set([correctMainRef]);
  
  const sameBookDistractionsPool = themeVerseRefs.filter(ref => ref.startsWith(correctBookId + '_') && ref !== correctMainRef);
  const otherBookDistractionsPool = themeVerseRefs.filter(ref => !ref.startsWith(correctBookId + '_'));
  shuffleArray(sameBookDistractionsPool);
  shuffleArray(otherBookDistractionsPool);

  let mainDistractionRefs = [];
  if (difficulty === 'hard') mainDistractionRefs.push(...sameBookDistractionsPool.slice(0, 2));
  else if (difficulty === 'medium') mainDistractionRefs.push(...sameBookDistractionsPool.slice(0, 1));
  mainDistractionRefs.push(...otherBookDistractionsPool);
  mainDistractionRefs = mainDistractionRefs.slice(0, 3);
  mainDistractionRefs.forEach(ref => allNeededRefs.add(ref));

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

  // 2. 一次性从D1获取所有数据
  const placeholders = finalRefs.map(() => '?').join(',');
  const stmt = env.DB.prepare(`SELECT id, book_id, chapter, verse_num, text, verse_ref FROM verses WHERE verse_ref IN (${placeholders}) AND lang = ?`);
  const { results } = await stmt.bind(...finalRefs, lang).all();
  const versesMap = new Map(results.map(row => [row.verse_ref, row]));
  
  // 3. 组装“超级题目包”
  const correctVerse = versesMap.get(correctMainRef);
  if (!correctVerse) throw new Error(`Correct verse ${correctMainRef} not found`);
  
  let mainOptions = [correctMainRef, ...mainDistractionRefs].map(ref => {
    const verse = versesMap.get(ref);
    if (!verse) return null;
    // 我们只返回最原始的数据
    return { id: verse.id, ref: ref, bookId: verse.book_id, chapter: verse.chapter, verseNum: verse.verse_num };
  }).filter(Boolean);
  shuffleArray(mainOptions);

  const reviewData = {};
  mainDistractionRefs.forEach(distractionRef => {
    const correctReviewVerse = versesMap.get(distractionRef);
    if(!correctReviewVerse) return;
    const reviewDistractionPool = results.filter(v => v.verse_ref !== correctMainRef && v.verse_ref !== distractionRef);
    shuffleArray(reviewDistractionPool);
    let reviewOptions = [correctReviewVerse, ...reviewDistractionPool.slice(0, 2)].map(v => ({
        text: v.text,
        isCorrect: v.id === correctReviewVerse.id
    }));
    shuffleArray(reviewOptions);
    reviewData[distractionRef] = {
      // 复习题的问题文本也返回原始数据
      bookId: correctReviewVerse.book_id,
      chapter: correctReviewVerse.chapter,
      verseNum: correctReviewVerse.verse_num,
      options: reviewOptions
    };
  });

  const fullQuestionPackage = {
    mainQuestion: {
      promptVerseText: correctVerse.text,
      options: mainOptions,
      correctOptionId: correctVerse.id,
      correctOptionRef: correctVerse.verse_ref
    },
    reviewData: reviewData
  };
  
  return new Response(JSON.stringify(fullQuestionPackage));
}


// --- 总前台：onRequest 路由器 ---
export async function onRequest(context) {
  const { request, env, params } = context;
  try {
    const apiPath = params.path.join('/'); // `path`来自`[[path]]`文件名

    // 根据路径，调用不同的处理函数
    if (apiPath === 'get-book-names') {
      return await handleGetBookNames(env);
    }
    
    if (apiPath === 'get-full-question') {
      return await handleGetFullQuestion(new URL(request.url), env);
    }

    return new Response('API endpoint not found', { status: 404 });

  } catch (error) {
    console.error(`Error in API router for path:`, context.request.url, error);
    return new Response(JSON.stringify({ error: 'Internal Server Error', details: error.message, stack: error.stack }), { status: 500 });
  }
}