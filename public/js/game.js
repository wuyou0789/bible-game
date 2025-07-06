document.addEventListener('DOMContentLoaded', () => {
  // --- 获取页面元素 ---
  const questionTitleElement = document.getElementById('question-title');
  const questionTextElement = document.getElementById('question-text');
  const optionsContainer = document.getElementById('options-container');
  const feedbackElement = document.getElementById('feedback');
  const difficultyButtons = document.querySelectorAll('.difficulty-btn');
  const streakCounterElement = document.getElementById('streak-counter');

  // --- 状态管理变量 ---
  let gameState = 'playing';
  let currentQuestionData = null;
  let reviewCache = new Map();
  let currentDifficulty = 'easy';
  let correctStreak = 0;

  // --- 主问题逻辑 ---
  function fetchAndDisplayQuestion() {
    gameState = 'playing';
    resetUIForNewQuestion('这是哪节经文？', '...');
    fetch(`/api/new-question?lang=zh&difficulty=${currentDifficulty}`)
      .then(handleFetchError)
      .then(data => {
        currentQuestionData = data;
        renderMainQuestion(data);
      })
      .catch(handleError);
  }

  function renderMainQuestion(data) {
    questionTextElement.textContent = `"${data.promptVerseText}"`;
    optionsContainer.innerHTML = '';
    data.options.forEach(option => {
      // 【优化】直接将option对象传入，更健壮
      const button = createButton(option, () => handleMainOptionClick(option.id));
      optionsContainer.appendChild(button);
    });
  }

  function handleMainOptionClick(selectedId) {
    disableAllOptions();
    const correctId = currentQuestionData.correctOptionId;
    const selectedButton = optionsContainer.querySelector(`[data-id="${selectedId}"]`);

    if (selectedId === correctId) {
      correctStreak++;
      updateStreakDisplay();
      showFeedback('✅ 正确!', 'green');
      if (selectedButton) selectedButton.classList.add('correct');
      setTimeout(fetchAndDisplayQuestion, 1000);
    } else {
      correctStreak = 0;
      updateStreakDisplay();
      if(selectedButton) selectedButton.classList.add('incorrect');
      showFeedback('❌ 答错了。我们一起来复习一下这节经文吧！', '#db7100');
      setTimeout(() => startReviewMode(selectedId), 1500);
    }
  }

  // --- 复习模式逻辑 (保持不变) ---
  async function startReviewMode(verseIdToReview) {
    gameState = 'reviewing';
    resetUIForNewQuestion(`复习一下:`, '正在加载复习题...');
    try {
      if (reviewCache.has(verseIdToReview)) {
        renderReviewQuestion(reviewCache.get(verseIdToReview));
        return;
      }
      const response = await fetch(`/api/review-question?lang=zh&verseId=${verseIdToReview}`);
      const data = await handleFetchError(response);
      reviewCache.set(verseIdToReview, data);
      renderReviewQuestion(data);
    } catch (error) {
      handleError(error);
    }
  }

  function renderReviewQuestion(data) {
    questionTextElement.textContent = data.questionText;
    optionsContainer.innerHTML = '';
    data.options.forEach(option => {
      const button = createButton(option, () => handleReviewOptionClick(option.isCorrect));
      optionsContainer.appendChild(button);
    });
  }

  function handleReviewOptionClick(isCorrect) {
    disableAllOptions();
    if (isCorrect) {
      showFeedback('👍 复习正确！现在回到主问题。', 'green');
      setTimeout(returnToMainQuestion, 1500);
    } else {
      showFeedback('不对哦，再仔细看看。', 'red');
      setTimeout(() => {
        enableAllOptions();
        feedbackElement.textContent = '';
      }, 1000);
    }
  }
  
  function returnToMainQuestion() {
    gameState = 'playing';
    resetUIForNewQuestion('这是哪节经文？', '...');
    renderMainQuestion(currentQuestionData);
  }
  
  // --- UI与事件处理 ---
  function createButton(option, onClick) {
    const button = document.createElement('button');
    button.textContent = option.text;
    // 【优化】直接使用option.id，不再需要脆弱的find逻辑
    if (option.id) {
        button.dataset.id = option.id;
    }
    button.addEventListener('click', onClick);
    return button;
  }

  function handleDifficultyChange(event) {
    const selectedBtn = event.target;
    currentDifficulty = selectedBtn.dataset.difficulty;
    correctStreak = 0;
    updateStreakDisplay();
    difficultyButtons.forEach(btn => btn.classList.remove('active'));
    selectedBtn.classList.add('active');
    fetchAndDisplayQuestion();
  }

  function updateStreakDisplay() {
    streakCounterElement.textContent = correctStreak;
  }

  // --- 其他辅助函数 (保持不变) ---
  function resetUIForNewQuestion(title, questionText) { questionTitleElement.textContent = title; questionTextElement.textContent = questionText; optionsContainer.innerHTML = '加载中...'; feedbackElement.textContent = ''; }
  function disableAllOptions() { optionsContainer.querySelectorAll('button').forEach(btn => btn.disabled = true); }
  function enableAllOptions() { optionsContainer.querySelectorAll('button').forEach(btn => btn.disabled = false); }
  function showFeedback(message, color) { feedbackElement.textContent = message; feedbackElement.style.color = color; }
  async function handleFetchError(response) { if (!response.ok) { const errorData = await response.json().catch(() => ({ error: "无法解析错误信息" })); throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.error}`); } return response.json(); }
  function handleError(error) { questionTextElement.textContent = '出错了！'; feedbackElement.textContent = error.message; console.error('Error:', error); }

  // --- 游戏开始 ---
  difficultyButtons.forEach(btn => btn.addEventListener('click', handleDifficultyChange));
  fetchAndDisplayQuestion();
});