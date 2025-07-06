// functions/api/review-question-from-file.js

// --- 核心改动：直接导入本地的JSON文件 ---
import versesContent from '../../data-source/verses_content.json';
import bookNames from '../../data-source/book_names.json';

// --- 请求处理函数 ---
export async function onRequest(context) {
  try {
    // 1. 在内存中动态生成拍平的ID列表，用于随机选择
    const allIds = Object.keys(versesContent).flatMap(bookId => 
        Object.keys(versesContent[bookId]).map(cv => `${bookId}_${cv}`)
    );

    // 2. 获取前端参数
    const url = new URL(context.request.url);
    const lang = url.searchParams.get('lang') || 'zh';
    const verseIdToReview = url.searchParams.get('verseId');

    if (!verseIdToReview) {
      return new Response(JSON.stringify({ error: 'verseId parameter is required' }), { status: 400 });
    }

    // 3. 挑选干扰项
    const distractionIds = new Set();
    while (distractionIds.size < 2) {
      const randomId = allIds[Math.floor(Math.random() * allIds.length)];
      if (randomId !== verseIdToReview) {
        distractionIds.add(randomId);
      }
    }

    const finalIds = [verseIdToReview, ...Array.from(distractionIds)];

    // 4. 【核心改动】直接从导入的JSON对象中获取经文详情，不再访问KV
    const versesDetails = finalIds.map(id => {
        const [book, ...cvParts] = id.split('_');
        const chapterVerse = cvParts.join('_');
        return versesContent[book][chapterVerse];
    });

    // 5. 组装复习题
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
    console.error("Error generating review question from file:", error);
    return new Response(JSON.stringify({ error: 'Failed to generate review question from file', details: error.message, stack: error.stack }), { status: 500 });
  }
}