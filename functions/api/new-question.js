// functions/api/new-question.js (The correct, elegant, production-ready version)

// --- 全局缓存变量，用于热启动 ---
let idLookupTable = null;
let bookNames = null;

// --- 优雅的初始化函数 ---
async function initialize(env) {
  console.log("[Worker] Cold start: Initializing from R2 source files...");
  
  // 1. 并行地从R2获取两个核心JSON文件
  const [versesContentObj, bookNamesObj] = await Promise.all([
    env.IDS_SOURCE_BUCKET.get('verses_content.json'),
    env.IDS_SOURCE_BUCKET.get('book_names.json')
  ]);

  // 2. 检查文件是否存在
  if (!versesContentObj) throw new Error("FATAL: 'verses_content.json' not found in R2 bucket.");
  if (!bookNamesObj) throw new Error("FATAL: 'book_names.json' not found in R2 bucket.");

  // 3. 解析JSON
  const versesContent = await versesContentObj.json();
  bookNames = await bookNamesObj.json();

  // 4. 【核心】在内存中动态生成ID查找表
  const lookupTable = {};
  for (const bookId of Object.keys(versesContent)) {
    const chapterVerseKeys = Object.keys(versesContent[bookId]);
    // 将 "1_1" 这样的key，转换成 "GEN_1_1" 这样的完整ID
    lookupTable[bookId] = chapterVerseKeys.map(cv => `${bookId}_${cv}`);
  }
  idLookupTable = lookupTable;
  
  console.log("[Worker] Initialization complete. ID table generated in memory.");
}


// --- 请求处理函数 ---
// 您本地能正常工作的onRequest函数就是最完善的
export async function onRequest(context) {
  const { request, env } = context;
  try {
    // 冷启动检查
    if (!idLookupTable || !bookNames) {
      await initialize(env);
    }

    // 后续所有逻辑都依赖于内存中被正确初始化的 idLookupTable 和 bookNames
    // 这部分代码您本地已经是正确的了，包含了难度选择、随机选题、洗牌等所有功能
    const url = new URL(request.url);
    const lang = url.searchParams.get('lang') || 'zh';
    const difficulty = url.searchParams.get('difficulty') || 'easy';

    // 为了确保万无一失，我把这部分逻辑也重新贴一遍
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
    distractionIds = distractionIds.slice(0,3);

    const finalIds = [correctId, ...distractionIds];
    const promises = finalIds.map(id => env.VERSES_KV.get(id, 'json'));
    const versesDetails = await Promise.all(promises);
    
    const correctVerseIndex = finalIds.indexOf(correctId);
    const correctVerseDetails = versesDetails[correctVerseIndex];
    
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
    console.error("Error in onRequest:", error);
    return new Response(JSON.stringify({ error: 'Failed to process request', details: error.message, stack: error.stack }), { status: 500 });
  }
}

// shuffleArray函数也需要保留
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}