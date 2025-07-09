// public/js/game.js (The Ultimate Question Bundle Version)
document.addEventListener('DOMContentLoaded', () => {
    // --- API端点配置 ---
    const API_ENDPOINT = '/api/get-question-bundle';

    // --- 获取所有HTML元素 ---
    const questionTitleElement = document.getElementById('question-title');
    const questionTextElement = document.getElementById('question-text');
    const optionsContainer = document.getElementById('options-container');
    const feedbackElement = document.getElementById('feedback');
    const difficultyButtons = document.querySelectorAll('.difficulty-btn');
    const streakContainerElement = document.getElementById('streak-container');
    const streakCounterElement = document.getElementById('streak-counter');
    const languageButtons = document.querySelectorAll('.lang-btn');
    const streakLabelElement = document.getElementById('streak-label');

    // --- 状态管理变量 ---
    let gameState = 'playing'; // 'playing' 或 'reviewing'
    let currentBundle = null; // 缓存整个当前题目包
    let nextBundlePromise = null; // 用于预取下一个题目包
    let currentDifficulty = 'easy';
    let currentLang = 'zh';
    let correctStreak = 0;
    let isLoading = false;

    // --- 【新增】UI文本国际化字典 ---
    const UI_TEXT = {
        zh: {
            title: '这是哪节经文？',
            reviewTitle: '复习一下:',
            loading: '加载中...',
            correct: '✅ 正确!',
            incorrect: '❌ 答错了...',
            reviewCorrect: '👍 复习正确！',
            reviewIncorrect: '不对哦，再仔细看看。',
            errorTitle: '出错了！',
            streakLabel: '连续答对'
        },
        en: {
            title: 'Which verse is this?',
            reviewTitle: 'Review:',
            loading: 'Loading...',
            correct: '✅ Correct!',
            incorrect: '❌ Incorrect...',
            reviewCorrect: '👍 Great! Back to the main question.',
            reviewIncorrect: 'Not quite, try again.',
            errorTitle: 'An error occurred!',
            streakLabel: 'Streak'
        }
    };

    // --- 核心游戏逻辑 ---
    function startGame() {
        // 游戏开始时，获取第一个题目包
        loadNextBundleAndRender();
    }

    function loadNextBundleAndRender() {
        if (isLoading) return;
        isLoading = true;
        resetUIForNewQuestion();

        const bundlePromise = nextBundlePromise || fetch(`${API_ENDPOINT}?lang=${currentLang}&difficulty=${currentDifficulty}&theme=default`).then(handleFetchError);
        nextBundlePromise = null; // 用掉了就清空

        bundlePromise.then(bundle => {
            currentBundle = bundle;
            renderMainQuestion(bundle.mainQuestion);
            enableAllOptions();
            // 【核心】立即预取下一个题目包
            prefetchNextBundle();
        }).catch(handleError)
          .finally(() => {
            isLoading = false;
          });
    }

    function prefetchNextBundle() {
        nextBundlePromise = fetch(`${API_ENDPOINT}?lang=${currentLang}&difficulty=${currentDifficulty}&theme=default`).then(handleFetchError);
    }
    
    function renderMainQuestion(mainQuestion) {
        questionTitleElement.textContent = UI_TEXT[currentLang].title;
        questionTextElement.textContent = `\"${mainQuestion.promptVerseText}\"`;
        optionsContainer.innerHTML = '';
        feedbackElement.textContent = '';
        streakContainerElement.style.display = 'block';

        mainQuestion.options.forEach(option => {
            const button = createButton(option, () => handleMainOptionClick(option.id));
            optionsContainer.appendChild(button);
        });
    }

    function handleMainOptionClick(selectedId) {
        if (isLoading) return;
        disableAllOptions();
        
        const { correctOptionId } = currentBundle.mainQuestion;
        const selectedButton = optionsContainer.querySelector(`[data-id="${selectedId}"]`);

        if (selectedId === correctOptionId) {
            // 答对，直接从内存中加载下一题
            correctStreak++;
            updateStreakDisplay();
            showFeedback(UI_TEXT[currentLang].correct, 'green');
            if (selectedButton) selectedButton.classList.add('correct');
            setTimeout(loadNextBundleAndRender, 1000);
        } else {
            // 答错，直接从内存中获取复习题来渲染
            correctStreak = 0;
            updateStreakDisplay();
            showFeedback(UI_TEXT[currentLang].incorrect, '#db7100');
            if (selectedButton) selectedButton.classList.add('incorrect');
            
            setTimeout(() => {
                const reviewData = currentBundle.reviewQuestions[selectedId];
                renderReviewQuestion(reviewData);
                enableAllOptions();
            }, 1500);
        }
    }

    function renderReviewQuestion(reviewData) {
        gameState = 'reviewing';
        questionTitleElement.textContent = UI_TEXT[currentLang].reviewTitle;
        questionTextElement.textContent = reviewData.questionText;
        optionsContainer.innerHTML = '';
        feedbackElement.textContent = '';
        streakContainerElement.style.display = 'none';

        reviewData.options.forEach(option => {
            const button = createButton(option, () => handleReviewOptionClick(option.isCorrect));
            optionsContainer.appendChild(button);
        });
    }

    function handleReviewOptionClick(isCorrect) {
        disableAllOptions();
        if (isCorrect) {
            // 复习正确，返回主问题（所有数据都在内存里，瞬时完成）
            showFeedback(UI_TEXT[currentLang].reviewCorrect, 'green');
            setTimeout(returnToMainQuestion, 1500);
        } else {
            showFeedback(UI_TEXT[currentLang].reviewIncorrect, 'red');
            setTimeout(() => {
                enableAllOptions();
                feedbackElement.textContent = '';
            }, 1000);
        }
    }

    function returnToMainQuestion() {
        gameState = 'playing';
        renderMainQuestion(currentBundle.mainQuestion);
        enableAllOptions();
    }

    // --- UI与事件处理 ---
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
        if (isLoading) return;
        const selectedBtn = event.target;
        currentDifficulty = selectedBtn.dataset.difficulty;
        correctStreak = 0;
        updateStreakDisplay();
        difficultyButtons.forEach(btn => btn.classList.remove('active'));
        selectedBtn.classList.add('active');
        // 重置预取，以获取新难度的题目
        nextBundlePromise = null; 
        loadNextBundleAndRender();
    }

    function handleLanguageChange(event) {
        if (isLoading) return;
        const selectedBtn = event.target;
        currentLang = selectedBtn.dataset.lang;
        streakLabelElement.textContent = UI_TEXT[currentLang].streakLabel;
        languageButtons.forEach(btn => btn.classList.remove('active'));
        selectedBtn.classList.add('active');
        nextBundlePromise = null;
        correctStreak = 0;
        updateStreakDisplay();
        loadNextBundleAndRender();
    }

    function updateStreakDisplay() {
        streakCounterElement.textContent = correctStreak;
    }

    // --- 【重要】所有辅助函数都已补全 ---
    function resetUIForNewQuestion() { 
        questionTitleElement.textContent = UI_TEXT[currentLang].title; 
        questionTextElement.textContent = '...'; 
        optionsContainer.innerHTML = UI_TEXT[currentLang].loading; 
        feedbackElement.textContent = ''; 
    }
    function disableAllOptions() { optionsContainer.querySelectorAll('button').forEach(btn => btn.disabled = true); }
    function enableAllOptions() { optionsContainer.querySelectorAll('button').forEach(btn => btn.disabled = false); }
    function showFeedback(message, color) { feedbackElement.textContent = message; feedbackElement.style.color = color; }
    
    async function handleFetchError(response) { 
        if (!response.ok) { 
            const errorData = await response.json().catch(() => ({ error: "无法解析错误信息" })); 
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.error || response.statusText}`); 
        } 
        return response.json(); 
    }

    function handleError(error) { 
        isLoading = false;
        questionTitleElement.textContent = UI_TEXT[currentLang].errorTitle; 
        feedbackElement.textContent = error.message; 
        console.error('Error:', error); 
    }

    // --- 游戏开始 ---
    difficultyButtons.forEach(btn => btn.addEventListener('click', handleDifficultyChange));
    languageButtons.forEach(btn => btn.addEventListener('click', handleLanguageChange));
    startGame();
});
