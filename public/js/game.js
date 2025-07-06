// public/js/game.js (Final, Configurable Version)
document.addEventListener('DOMContentLoaded', () => {
  // 选择数据来源，KV、R2或JSON文件
  const DATA_SOURCE_MODE = 'LOCAL_FILE'; // 'CLOUDFLARE' 或 'LOCAL_FILE'

  const API_ENDPOINTS = {
    newQuestion: DATA_SOURCE_MODE === 'CLOUDFLARE' ? '/api/new-question' : '/api/new-question-from-file',
    reviewQuestion: DATA_SOURCE_MODE === 'CLOUDFLARE' ? '/api/review-question' : '/api/review-question-from-file'
  };

  const questionTitleElement = document.getElementById('question-title');
  const questionTextElement = document.getElementById('question-text');
  const optionsContainer = document.getElementById('options-container');
  const feedbackElement = document.getElementById('feedback');
  const difficultyButtons = document.querySelectorAll('.difficulty-btn');
  const streakContainerElement = document.getElementById('streak-container');
  const streakCounterElement = document.getElementById('streak-counter');

  let gameState = 'playing';
  let currentQuestionData = null;
  let reviewCache = new Map();
  let currentDifficulty = 'easy';
  let correctStreak = 0;

  function fetchAndDisplayQuestion() {
    // 这个函数现在只负责获取和渲染，不再重置UI，因为UI的重置发生在调用它之前
    fetch(`${API_ENDPOINTS.newQuestion}?lang=zh&difficulty=${currentDifficulty}`)
      .then(handleFetchError)
      .then(data => {
        currentQuestionData = data;
        renderMainQuestion(data);
        enableAllOptions();
      })
      .catch(handleError);
  }

  function renderMainQuestion(data) {
    questionTextElement.textContent = `"${data.promptVerseText}"`;
    optionsContainer.innerHTML = '';
    data.options.forEach(option => {
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
      
      setTimeout(() => {
        // 在开始获取前，给出一个“即将加载”的视觉提示
        questionTextElement.textContent = '...';
        fetchAndDisplayQuestion();
      }, 1000); 

    } else {
      correctStreak = 0;
      updateStreakDisplay();
      if(selectedButton) selectedButton.classList.add('incorrect');
      showFeedback('❌ 答错了。我们一起来复习一下这节经文吧！', '#db7100');
      setTimeout(() => startReviewMode(selectedId), 1500);
    }
  }

  async function startReviewMode(verseIdToReview) {
    gameState = 'reviewing';
    resetUIForNewQuestion(`复习一下:`, '正在加载复习题...');
    streakContainerElement.style.display = 'none';
    try {
      if (reviewCache.has(verseIdToReview)) {
        renderReviewQuestion(reviewCache.get(verseIdToReview));
        return;
      }
      const response = await fetch(`${API_ENDPOINTS.reviewQuestion}?lang=zh&verseId=${verseIdToReview}`);
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
    streakContainerElement.style.display = 'block';
    renderMainQuestion(currentQuestionData);
  }
  
  function createButton(option, onClick) {
    const button = document.createElement('button');
    button.textContent = option.text;
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
    // 在这里直接调用重置UI的函数，并开始获取
    resetUIForNewQuestion('这是哪节经文？', '...');
    fetchAndDisplayQuestion();
  }

  function updateStreakDisplay() {
    streakCounterElement.textContent = correctStreak;
  }

  function resetUIForNewQuestion(title, questionText) {
    questionTitleElement.textContent = title;
    questionTextElement.textContent = questionText;
    optionsContainer.innerHTML = '加载中...';
    feedbackElement.textContent = '';
  }

  function disableAllOptions() { optionsContainer.querySelectorAll('button').forEach(btn => btn.disabled = true); }
  function enableAllOptions() { optionsContainer.querySelectorAll('button').forEach(btn => btn.disabled = false); }
  function showFeedback(message, color) { feedbackElement.textContent = message; feedbackElement.style.color = color; }
  async function handleFetchError(response) { if (!response.ok) { const errorData = await response.json().catch(() => ({ error: "无法解析错误信息" })); throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.error}`); } return response.json(); }
  function handleError(error) { questionTextElement.textContent = '出错了！'; feedbackElement.textContent = error.message; console.error('Error:', error); }

  difficultyButtons.forEach(btn => btn.addEventListener('click', handleDifficultyChange));
  // 初始加载
  resetUIForNewQuestion('这是哪节经文？', '...');
  fetchAndDisplayQuestion();
});