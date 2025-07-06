// functions/api/review-question.js

export async function onRequest(context) {
  const { request, env } = context;

  try {
    const bookNamesObj = await env.IDS_SOURCE_BUCKET.get('book_names.json');
    if (!bookNamesObj) throw new Error("Could not find 'book_names.json' in R2.");
    const bookNames = await bookNamesObj.json();

    const allKeys = [];
    let cursor = null;
    do {
      const listResult = await env.VERSES_KV.list({ cursor: cursor });
      allKeys.push(...listResult.keys.map(k => k.name));
      cursor = listResult.list_complete ? null : listResult.cursor;
    } while (cursor);
    
    const url = new URL(request.url);
    const lang = url.searchParams.get('lang') || 'zh';
    const verseIdToReview = url.searchParams.get('verseId');

    if (!verseIdToReview) {
      return new Response(JSON.stringify({ error: 'verseId parameter is required' }), { status: 400 });
    }

    const distractionIds = new Set();
    while (distractionIds.size < 2) {
      const randomId = allKeys[Math.floor(Math.random() * allKeys.length)];
      if (randomId !== verseIdToReview) {
        distractionIds.add(randomId);
      }
    }

    const finalIds = [verseIdToReview, ...Array.from(distractionIds)];

    const promises = finalIds.map(id => env.VERSES_KV.get(id, 'json'));
    const versesDetails = await Promise.all(promises);
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
    return new Response(JSON.stringify({ error: 'Failed to generate review question', details: error.message }), { status: 500 });
  }
}