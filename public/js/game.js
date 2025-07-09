// public/js/game.js (Final Perfect Version with All Features)
document.addEventListener('DOMContentLoaded', () => {
    // --- API端点配置 ---
    const API_ENDPOINTS = {
        newQuestion: '/api/new-question',
        reviewQuestion: '/api/review-question'
    };

    // --- 【新增】UI文本国际化字典 ---
    const UI_TEXT = {
        zh: {
            title: '这是哪节经文？',
            reviewTitle: '复习一下:',
            loading: '加载中...',
            correct: '✅ 正确!',
            incorrect: '❌ 答错了。我们一起来复习一下这节经文吧！',
            reviewCorrect: '👍 复习正确！现在回到主问题。',
            reviewIncorrect: '不对哦，再仔细看看。',
            errorTitle: '出错了！',
            streakLabel: '连续答对'
        },
        en: {
            title: 'Which verse is this?',
            reviewTitle: 'Review:',
            loading: 'Loading...',
            correct: '✅ Correct!',
            incorrect: '❌ Incorrect. Let\'s review this verse!',
            reviewCorrect: '👍 Great! Now back to the main question.',
            reviewIncorrect: 'Not quite, try again.',
            errorTitle: 'An error occurred!',
            streakLabel: 'Streak'
        }
    };

    // --- 获取页面元素 ---
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
    let gameState = 'playing';
    let currentQuestionData = null;
    let reviewCache = new Map();
    let currentDifficulty = 'easy';
    let currentLang = 'zh'; // 【关键】语言状态变量
    let correctStreak = 0;
    let isLoading = false;

    // --- 主问题逻辑 ---
    function fetchAndDisplayQuestion() {
        if (isLoading) return;
        isLoading = true;
        
        resetUIForNewQuestion();

        // 【关键】API调用现在会带上正确的语言参数
        fetch(`${API_ENDPOINTS.newQuestion}?lang=${currentLang}&difficulty=${currentDifficulty}`)
            .then(handleFetchError)
            .then(data => {
                currentQuestionData = data;
                renderMainQuestion(data);
                enableAllOptions();
            })
            .catch(handleError)
            .finally(() => {
                isLoading = false;
            });
    }

    function renderMainQuestion(data) {
        questionTitleElement.textContent = UI_TEXT[currentLang].title;
        questionTextElement.textContent = `\"${data.promptVerseText}\"`;
        optionsContainer.innerHTML = '';
        feedbackElement.textContent = '';
        streakContainerElement.style.display = 'block';

        data.options.forEach(option => {
            const button = createButton(option, () => handleMainOptionClick(option.id));
            optionsContainer.appendChild(button);
        });
    }

    function handleMainOptionClick(selectedId) {
        if (isLoading) return;

        disableAllOptions();
        const correctId = currentQuestionData.correctOptionId;
        const selectedButton = optionsContainer.querySelector(`[data-id="${selectedId}"]`);

        if (selectedId === correctId) {
            correctStreak++;
            updateStreakDisplay();
            showFeedback(UI_TEXT[currentLang].correct, 'green');
            if (selectedButton) selectedButton.classList.add('correct');
            
            isLoading = true;
            const nextQuestionPromise = fetch(`${API_ENDPOINTS.newQuestion}?lang=${currentLang}&difficulty=${currentDifficulty}`).then(handleFetchError);
            const delayPromise = new Promise(resolve => setTimeout(resolve, 1000));

            Promise.all([nextQuestionPromise, delayPromise])
                .then(([newData]) => {
                    currentQuestionData = newData;
                    renderMainQuestion(newData);
                    enableAllOptions();
                })
                .catch(handleError)
                .finally(() => {
                    isLoading = false;
                });

        } else {
            correctStreak = 0;
            updateStreakDisplay();
            if(selectedButton) selectedButton.classList.add('incorrect');
            showFeedback(UI_TEXT[currentLang].incorrect, '#db7100');
            startReviewMode(selectedId);
        }
    }

    // --- 复习模式逻辑 ---
    async function startReviewMode(verseIdToReview) {
        isLoading = true;
        gameState = 'reviewing';
        streakContainerElement.style.display = 'none';
        
        try {
            const cacheKey = `${verseIdToReview}_${currentLang}`;
            let reviewDataPromise;
            if (reviewCache.has(cacheKey)) {
                reviewDataPromise = Promise.resolve(reviewCache.get(cacheKey));
            } else {
                reviewDataPromise = fetch(`${API_ENDPOINTS.reviewQuestion}?lang=${currentLang}&verseId=${verseIdToReview}`)
                    .then(handleFetchError)
                    .then(data => {
                        reviewCache.set(cacheKey, data);
                        return data;
                    });
            }
            
            const delayPromise = new Promise(resolve => setTimeout(resolve, 1500));
            const [reviewData] = await Promise.all([reviewDataPromise, delayPromise]);
            
            renderReviewQuestion(reviewData);
            enableAllOptions();

        } catch (error) {
            handleError(error);
        } finally {
            isLoading = false;
        }
    }

    function renderReviewQuestion(data) {
        questionTitleElement.textContent = UI_TEXT[currentLang].reviewTitle;
        questionTextElement.textContent = data.questionText;
        optionsContainer.innerHTML = '';
        feedbackElement.textContent = ''; 

        data.options.forEach(option => {
            const button = createButton(option, () => handleReviewOptionClick(option.isCorrect));
            optionsContainer.appendChild(button);
        });
    }

    function handleReviewOptionClick(isCorrect) {
        if (isLoading) return;
        disableAllOptions();
        if (isCorrect) {
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
        renderMainQuestion(currentQuestionData);
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
        fetchAndDisplayQuestion();
    }

    // --- 【新增】语言切换处理函数 ---
    function handleLanguageChange(event) {
        if (isLoading) return;
        const selectedBtn = event.target;
        currentLang = selectedBtn.dataset.lang;

        // 更新UI文本
        streakLabelElement.textContent = UI_TEXT[currentLang].streakLabel;

        // 更新按钮视觉状态
        languageButtons.forEach(btn => btn.classList.remove('active'));
        selectedBtn.classList.add('active');

        // 清空缓存并重新开始游戏
        reviewCache.clear();
        correctStreak = 0;
        updateStreakDisplay();
        fetchAndDisplayQuestion();
    }

    function updateStreakDisplay() {
        streakCounterElement.textContent = correctStreak;
    }

    // --- 辅助函数 ---
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
            const errorData = await response.json().catch(() => ({ error: "Could not parse error response" })); 
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.error}`); 
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
    languageButtons.forEach(btn => btn.addEventListener('click', handleLanguageChange)); // 新增事件绑定
    fetchAndDisplayQuestion();
});
