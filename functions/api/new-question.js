// functions/api/new-question.js

let idLookupTable = null;
let bookNames = null;

async function initialize(env) {
  console.log("[Worker] Cold start: Initializing data...");
  const [idContentObj, bookNamesObj] = await Promise.all([
    env.IDS_SOURCE_BUCKET.get('verses_content.json'),
    env.IDS_SOURCE_BUCKET.get('book_names.json')
  ]);
  if (!idContentObj || !bookNamesObj) throw new Error("Could not find source files in R2.");
  const versesContent = await idContentObj.json();
  bookNames = await bookNamesObj.json();
  const lookupTable = {};
  for (const bookId of Object.keys(versesContent)) {
    const chapterVerseKeys = Object.keys(versesContent[bookId]);
    lookupTable[bookId] = chapterVerseKeys.map(cv => `${bookId}_${cv}`);
  }
  idLookupTable = lookupTable;
  console.log("[Worker] Initialization complete.");
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// --- 【新增】核心的选题策略函数 ---
function selectIdsBasedOnDifficulty(difficulty, idLookupTable) {
    const allBookIds = Object.keys(idLookupTable);
    
    // 1. 随机选出一个主问题ID
    const correctBookId = allBookIds[Math.floor(Math.random() * allBookIds.length)];
    const versesInCorrectBook = idLookupTable[correctBookId];
    const correctId = versesInCorrectBook[Math.floor(Math.random() * versesInCorrectBook.length)];

    // 2. 准备干扰项的“弹药库”
    const sameBookDistractions = versesInCorrectBook.filter(id => id !== correctId);
    const otherBookIds = allBookIds.filter(id => id !== correctBookId);
    let otherBookDistractions = otherBookIds.map(bookId => idLookupTable[bookId]).flat();

    shuffleArray(sameBookDistractions);
    shuffleArray(otherBookDistractions);

    // 3. 根据难度策略挑选干扰项
    let distractionIds = [];
    switch (difficulty) {
        case 'hard':
            // 2个同卷，1个其他
            distractionIds.push(...sameBookDistractions.slice(0, 2));
            distractionIds.push(...otherBookDistractions.slice(0, 1));
            break;
        case 'medium':
            // 1个同卷，2个其他
            distractionIds.push(...sameBookDistractions.slice(0, 1));
            distractionIds.push(...otherBookDistractions.slice(0, 2));
            break;
        case 'easy':
        default:
            // 3个都来自其他卷
            distractionIds.push(...otherBookDistractions.slice(0, 3));
            break;
    }
    
    // 确保我们总是有3个干扰项（处理书卷经文不够的边缘情况）
    while (distractionIds.length < 3) {
        distractionIds.push(...otherBookDistractions.slice(distractionIds.length, 3));
    }

    return [correctId, ...distractionIds];
}


export async function onRequest(context) {
  const { request, env } = context;
  try {
    if (!idLookupTable || !bookNames) {
      await initialize(env);
    }

    const url = new URL(request.url);
    const lang = url.searchParams.get('lang') || 'zh';
    const difficulty = url.searchParams.get('difficulty') || 'easy';

    // ▼▼▼▼▼▼▼▼▼▼ 核心逻辑改动 ▼▼▼▼▼▼▼▼▼▼
    // 1. 调用新的策略函数来获取ID
    const finalIds = selectIdsBasedOnDifficulty(difficulty, idLookupTable);
    const correctId = finalIds[0]; // 策略函数保证第一个是正确答案

    // 2. 获取数据 (并行)
    const promises = finalIds.map(id => env.VERSES_KV.get(id, 'json'));
    const versesDetails = await Promise.all(promises);
    
    // 3. 找到正确答案的详情
    const correctVerseIndex = finalIds.indexOf(correctId);
    const correctVerseDetails = versesDetails[correctVerseIndex];
    
    // 4. 生成选项并洗牌
    let options = finalIds.map((id, index) => {
      const details = versesDetails[index];
      const firstUnderscoreIndex = id.indexOf('_');
      const bookId = id.substring(0, firstUnderscoreIndex);
      const chapterVerseRaw = id.substring(firstUnderscoreIndex + 1);
      const chapterAndVerse = chapterVerseRaw.replace(/_/g, ':');
      return { id: id, text: `${bookNames[lang][bookId]} ${chapterAndVerse}` };
    });
    shuffleArray(options);
    // ▲▲▲▲▲▲▲▲▲▲ 改动结束 ▲▲▲▲▲▲▲▲▲▲
    
    const questionData = {
      promptVerseText: correctVerseDetails[lang],
      options: options,
      correctOptionId: correctId 
    };

    return new Response(JSON.stringify(questionData));
  } catch (error) {
    console.error("Error in onRequest:", error);
    return new Response(JSON.stringify({ error: 'Failed to process request', details: error.message, stack: error.stack }), { status: 500 });
  }
}