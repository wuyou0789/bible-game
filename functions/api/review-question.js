// functions/api/review-question.js (The correct, elegant, production-ready version)

export async function onRequest(context) {
  const { request, env } = context;

  try {
    // --- 1. 直接从R2获取核心数据源 ---
    const [versesContentObj, bookNamesObj] = await Promise.all([
        env.IDS_SOURCE_BUCKET.get('verses_content.json'),
        env.IDS_SOURCE_BUCKET.get('book_names.json')
    ]);
    if (!versesContentObj || !bookNamesObj) throw new Error("Could not find source files in R2.");
    const versesContent = await versesContentObj.json();
    const bookNames = await bookNamesObj.json();

    // --- 2. 动态生成拍平的ID列表，用于随机选择 ---
    const allIds = Object.keys(versesContent).flatMap(bookId => 
        Object.keys(versesContent[bookId]).map(cv => `${bookId}_${cv}`)
    );

    // --- 3. 后续逻辑不变 ---
    const url = new URL(request.url);
    const lang = url.searchParams.get('lang') || 'zh';
    const verseIdToReview = url.searchParams.get('verseId');

    if (!verseIdToReview) {
      return new Response(JSON.stringify({ error: 'verseId parameter is required' }), { status: 400 });
    }

    // 4. 挑选干扰项
    const distractionIds = new Set();
    while (distractionIds.size < 2) {
      const randomId = allIds[Math.floor(Math.random() * allIds.length)];
      if (randomId !== verseIdToReview) {
        distractionIds.add(randomId);
      }
    }

    const finalIds = [verseIdToReview, ...Array.from(distractionIds)];

    // 5. 从KV获取数据
    const promises = finalIds.map(id => env.VERSES_KV.get(id, 'json'));
    const versesDetails = await Promise.all(promises);

    // 6. 组装复习题
    const firstUnderscoreIndex = verseIdToReview.indexOf('_');
    const bookId = verseIdToReview.substring(0, firstUnderscoreIndex);
    const chapterVerseRaw = verseIdToReview.substring(firstUnderscoreIndex + 1);
    const chapterAndVerse = chapterVerseRaw.replace(/_/g, ':');
    
    const reviewData = {
      questionText: `${bookNames[lang][bookId]} ${chapterAndVerse}`,
      options: versesDetails.map((details, index) => ({
        text: details[lang],
        isCorrect: finalIds[index] === verseIdToReview 
      }))
    };
    
    reviewData.options.sort(() => Math.random() - 0.5);

    return new Response(JSON.stringify(reviewData));

  } catch (error) {
    console.error("Error generating review question:", error);
    return new Response(JSON.stringify({ error: 'Failed to generate review question', details: error.message, stack: error.stack }), { status: 500 });
  }
}