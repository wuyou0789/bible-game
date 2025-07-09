// public/js/game.js (Question Bundle Logic)
document.addEventListener('DOMContentLoaded', () => {
    const API_ENDPOINT = '/api/get-question-bundle';

    // ... (获取所有HTML元素) ...

    let currentBundle = null; // 缓存整个题目包
    let nextBundlePromise = null; // 用于预取下一个题目包

    // --- 核心游戏逻辑 ---
    function startGame() {
        // 游戏开始时，获取第一个题目包
        loadNextBundleAndRender();
    }

    function loadNextBundleAndRender() {
        // ... (显示加载动画) ...
        
        const bundlePromise = nextBundlePromise || fetch(API_ENDPOINT).then(handleFetchError);
        nextBundlePromise = null; // 用掉了就清空

        bundlePromise.then(bundle => {
            currentBundle = bundle;
            renderMainQuestion(bundle.mainQuestion);
            enableAllOptions();
            
            // 【核心】立即预取下一个题目包
            prefetchNextBundle();
        }).catch(handleError);
    }

    function prefetchNextBundle() {
        nextBundlePromise = fetch(API_ENDPOINT).then(handleFetchError);
    }
    
    function renderMainQuestion(mainQuestion) {
        // ... (渲染主问题界面) ...
    }

    function handleMainOptionClick(selectedId) {
        disableAllOptions();
        const { correctOptionId, options } = currentBundle.mainQuestion;

        if (selectedId === correctOptionId) {
            // 答对，直接从内存中加载下一题
            showFeedback('✅ 正确!', 'green');
            setTimeout(loadNextBundleAndRender, 1000);
        } else {
            // 答错，直接从内存中获取复习题来渲染
            showFeedback('❌ 答错了...', '#db7100');
            const reviewData = currentBundle.reviewQuestions[selectedId];
            renderReviewQuestion(reviewData);
            enableAllOptions();
        }
    }

    function renderReviewQuestion(reviewData) {
        // ... (渲染复习题界面) ...
    }

    function handleReviewOptionClick(isCorrect) {
        if (isCorrect) {
            // 复习正确，返回主问题（所有数据都在内存里，瞬时完成）
            showFeedback('👍 复习正确！', 'green');
            renderMainQuestion(currentBundle.mainQuestion);
            enableAllOptions();
        } else {
            // ...
        }
    }

    // ... (其他所有辅助函数) ...

    startGame();
});
