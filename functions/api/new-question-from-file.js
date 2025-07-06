// functions/api/new-question-from-file.js

// ▼▼▼▼▼ 核心改动：我们直接导入(import)本地的JSON文件 ▼▼▼▼▼
import versesContent from '../../data-source/verses_content.json';
import bookNames from '../../data-source/book_names.json';
// ▲▲▲▲▲ 改动结束 ▲▲▲▲▲


// --- 在内存中动态生成ID查找表 (逻辑不变，但数据源变了) ---
function initializeIdLookupTable() {
  console.log("[File Worker] Generating ID lookup table from imported JSON...");
  const lookupTable = {};
  for (const bookId of Object.keys(versesContent)) {
    const chapterVerseKeys = Object.keys(versesContent[bookId]);
    lookupTable[bookId] = chapterVerseKeys.map(cv => `${bookId}_${cv}`);
  }
  console.log("[File Worker] Lookup table generated.");
  return lookupTable;
}

// --- 在全局作用域只生成一次，作为内存缓存 ---
const idLookupTable = initializeIdLookupTable();


// --- 洗牌算法函数 (保持不变) ---
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// --- 选题策略函数 (保持不变) ---
function selectIdsBasedOnDifficulty(difficulty) {
    // ... (这部分函数与new-question.js里的完全一样) ...
    const allBookIds = Object.keys(idLookupTable);
    const correctBookId = allBookIds[Math.floor(Math.random() * allBookIds.length)];
    const versesInCorrectBook = idLookupTable[correctBookId];
    const correctId = versesInCorrectBook[Math.floor(Math.random() * versesInCorrectBook.length)];

    const sameBookDistractions = versesInCorrectBook.filter(id => id !== correctId);
    const otherBookIds = allBookIds.filter(id => id !== correctBookId);
    let otherBookDistractions = otherBookIds.map(bookId => idLookupTable[bookId]).flat();
    shuffleArray(sameBookDistractions);
    shuffleArray(otherBookDistractions);

    let distractionIds = [];
    switch (difficulty) {
        case 'hard':
            distractionIds.push(...sameBookDistractions.slice(0, 2));
            distractionIds.push(...otherBookDistractions.slice(0, 1));
            break;
        case 'medium':
            distractionIds.push(...sameBookDistractions.slice(0, 1));
            distractionIds.push(...otherBookDistractions.slice(0, 2));
            break;
        default:
            distractionIds.push(...otherBookDistractions.slice(0, 3));
            break;
    }
    while (distractionIds.length < 3) {
        const randomId = otherBookDistractions[Math.floor(Math.random() * otherBookDistractions.length)];
        if(!distractionIds.includes(randomId) && randomId !== correctId) {
            distractionIds.push(randomId);
        }
    }
    distractionIds = distractionIds.slice(0, 3);

    return [correctId, ...distractionIds];
}

// --- 请求处理函数 ---
export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);
    const lang = url.searchParams.get('lang') || 'zh';
    const difficulty = url.searchParams.get('difficulty') || 'easy';

    // 1. 获取ID
    const finalIds = selectIdsBasedOnDifficulty(difficulty);
    const correctId = finalIds[0];

    // 2. 【核心改动】直接从导入的JSON对象中获取经文详情，不再访问KV
    const versesDetails = finalIds.map(id => {
        const [book, chapter, verse] = id.split('_');
        return versesContent[book][`${chapter}_${verse}`];
    });

    const correctVerseDetails = versesDetails[0];

    // 3. 组题 (逻辑不变)
    let options = finalIds.map(id => {
      const firstUnderscoreIndex = id.indexOf('_');
      const bookId = id.substring(0, firstUnderscoreIndex);
      const chapterVerseRaw = id.substring(firstUnderscoreIndex + 1);
      const chapterAndVerse = chapterVerseRaw.replace(/_/g, ':');
      return { id: id, text: `${bookNames[lang][bookId]} ${chapterAndVerse}` };
    });
    shuffleArray(options);

    const questionData = {
      promptVerseText: correctVerseDetails[lang],
      options: options,
      correctOptionId: correctId 
    };

    return new Response(JSON.stringify(questionData));

  } catch (error) {
    console.error("Error in file-based API:", error);
    return new Response(JSON.stringify({ error: 'Failed to process request from file', details: error.message, stack: error.stack }), { status: 500 });
  }
}