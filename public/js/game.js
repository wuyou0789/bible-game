// public/js/game.js (Final Perfect Experience Version)
document.addEventListener('DOMContentLoaded', () => {
    // --- API端点配置 ---
    // 我们现在只使用一套从D1数据库获取数据的API
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
    let gameState = 'playing'; // 'playing' 或 'reviewing'
    let currentQuestionData = null; // 用于缓存主问题数据
    let reviewCache = new Map(); // 用于缓存已获取的复习题
    let currentDifficulty = 'easy';
    let correctStreak = 0;
    let isLoading = false; // 全局加载状态，防止用户在加载时重复点击

    // --- 主问题逻辑 ---
    function fetchAndDisplayQuestion() {
        if (isLoading) return;
        isLoading = true;
        
        // 只有在游戏初次加载时，才显示“加载中”
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
                isLoading = false;
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
        if (isLoading) return;

        disableAllOptions();
        const correctId = currentQuestionData.correctOptionId;
        const selectedButton = optionsContainer.querySelector(`[data-id="${selectedId}"]`);

        if (selectedId === correctId) {
            // --- 回答正确 ---
            correctStreak++;
            updateStreakDisplay();
            showFeedback('✅ 正确!', 'green');
            if (selectedButton) selectedButton.classList.add('correct');
            
            isLoading = true;
            // 1. 立即在后台开始获取下一题的数据
            const nextQuestionPromise = fetch(`${API_ENDPOINTS.newQuestion}?lang=zh&difficulty=${currentDifficulty}`).then(handleFetchError);
            // 2. 创建一个保证至少有1秒视觉延迟的Promise
            const delayPromise = new Promise(resolve => setTimeout(resolve, 1000));

            // 3. 等待数据获取和最小延迟都完成后，再用新数据更新UI
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
            // --- 回答错误 ---
            correctStreak = 0;
            updateStreakDisplay();
            if(selectedButton) selectedButton.classList.add('incorrect');
            showFeedback('❌ 答错了。我们一起来复习一下这节经文吧！', '#db7100');
            
            // 【极致优化】调用新的、无缝切换的复习模式函数
            startReviewMode(selectedId);
        }
    }

    // --- 复习模式逻辑 ---
    async function startReviewMode(verseIdToReview) {
        isLoading = true;
        gameState = 'reviewing';
        streakContainerElement.style.display = 'none';
        
        try {
            // 1. 在后台获取复习题数据
            let reviewDataPromise;
            if (reviewCache.has(verseIdToReview)) {
                reviewDataPromise = Promise.resolve(reviewCache.get(verseIdToReview));
            } else {
                reviewDataPromise = fetch(`${API_ENDPOINTS.reviewQuestion}?lang=zh&verseId=${verseIdToReview}`)
                    .then(handleFetchError)
                    .then(data => {
                        reviewCache.set(verseIdToReview, data);
                        return data;
                    });
            }
            
            // 2. 创建一个保证至少有1.5秒视觉延迟的Promise
            const delayPromise = new Promise(resolve => setTimeout(resolve, 1500));

            // 3. 等待数据和延迟都完成后，直接渲染复习界面
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
        questionTitleElement.textContent = '复习一下:';
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
        isLoading = false;
        questionTitleElement.textContent = '出错了！'; 
        feedbackElement.textContent = error.message; 
        console.error('Error:', error); 
    }

    // --- 游戏开始 ---
    difficultyButtons.forEach(btn => btn.addEventListener('click', handleDifficultyChange));
    fetchAndDisplayQuestion();
});
