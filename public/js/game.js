// public/js/game.js (Final Optimized Version with Seamless Transitions)
document.addEventListener('DOMContentLoaded', () => {
    // --- API端点配置 ---
    const API_ENDPOINTS = {
        newQuestion: '/api/new-question',
        reviewQuestion: '/api/review-question'
    };

    // --- 获取页面元素 ---
    const questionTitleElement = document.getElementById('question-title');
    const questionTextElement = document.getElementById('question-text');
    const optionsContainer = document.getElementById('options-container');
    const feedbackElement = document.getElementById('feedback');
    const difficultyButtons = document.querySelectorAll('.difficulty-btn');
    const streakContainerElement = document.getElementById('streak-container');
    const streakCounterElement = document.getElementById('streak-counter');

    // --- 状态管理变量 ---
    let gameState = 'playing';
    let currentQuestionData = null;
    let reviewCache = new Map();
    let currentDifficulty = 'easy';
    let correctStreak = 0;
    let isLoadingNextQuestion = false; // 防止重复加载

    // --- 主问题逻辑 ---
    function fetchAndDisplayQuestion() {
        if (isLoadingNextQuestion) return;
        isLoadingNextQuestion = true;
        
        // 初始加载时，显示加载状态
        if (!currentQuestionData) {
            resetUIForNewQuestion('这是哪节经文？', '...');
        }

        fetch(`${API_ENDPOINTS.newQuestion}?lang=zh&difficulty=${currentDifficulty}`)
            .then(handleFetchError)
            .then(data => {
                currentQuestionData = data;
                renderMainQuestion(data);
                enableAllOptions();
            })
            .catch(handleError)
            .finally(() => {
                isLoadingNextQuestion = false;
            });
    }

    function renderMainQuestion(data) {
        questionTitleElement.textContent = '这是哪节经文？';
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
        if (isLoadingNextQuestion) return; // 如果正在加载下一题，则不响应点击

        disableAllOptions();
        const correctId = currentQuestionData.correctOptionId;
        const selectedButton = optionsContainer.querySelector(`[data-id="${selectedId}"]`);

        if (selectedId === correctId) {
            correctStreak++;
            updateStreakDisplay();
            showFeedback('✅ 正确!', 'green');
            if (selectedButton) selectedButton.classList.add('correct');
            
            // 【极致优化】
            // 1. 立即在后台开始获取下一题的数据
            const nextQuestionPromise = fetch(`${API_ENDPOINTS.newQuestion}?lang=zh&difficulty=${currentDifficulty}`)
                .then(handleFetchError);

            // 2. 创建一个保证至少有1秒视觉延迟的Promise
            const delayPromise = new Promise(resolve => setTimeout(resolve, 1000));

            // 3. 等待数据获取和最小延迟都完成后，再用新数据更新UI
            Promise.all([nextQuestionPromise, delayPromise])
                .then(([newData]) => {
                    currentQuestionData = newData;
                    renderMainQuestion(newData); // 用新数据直接渲染，跳过加载状态
                    enableAllOptions();
                })
                .catch(handleError);

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
        renderMainQuestion(currentQuestionData); // 直接从内存中恢复主问题
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
        if (isLoadingNextQuestion) return;
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

    // --- 辅助函数 ---
    function resetUIForNewQuestion(title, questionText) { 
        questionTitleElement.textContent = title; 
        questionTextElement.textContent = questionText; 
        optionsContainer.innerHTML = '加载中...'; 
        feedbackElement.textContent = ''; 
    }
    function disableAllOptions() { optionsContainer.querySelectorAll('button').forEach(btn => btn.disabled = true); }
    function enableAllOptions() { optionsContainer.querySelectorAll('button').forEach(btn => btn.disabled = false); }
    function showFeedback(message, color) { feedbackElement.textContent = message; feedbackElement.style.color = color; }
    async function handleFetchError(response) { 
        if (!response.ok) { 
            const errorData = await response.json().catch(() => ({ error: "无法解析错误信息" })); 
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.error}`); 
        } 
        return response.json(); 
    }
    function handleError(error) { 
        questionTextElement.textContent = '出错了！'; 
        feedbackElement.textContent = error.message; 
        console.error('Error:', error); 
    }

    // --- 游戏开始 ---
    difficultyButtons.forEach(btn => btn.addEventListener('click', handleDifficultyChange));
    fetchAndDisplayQuestion(); // 初始加载
});
