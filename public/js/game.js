// public/js/game.js (Final, Robust, Production-Ready Version)

document.addEventListener("DOMContentLoaded", () => {
  // --- 1. DOM Element Cache ---
  const elements = {
    title: document.getElementById("question-title"),
    text: document.getElementById("question-text"),
    optionsContainer: document.getElementById("options-container"),
    feedback: document.getElementById("feedback"),
    difficultyButtons: document.querySelectorAll(".difficulty-btn"),
    languageButtons: document.querySelectorAll(".lang-btn"),
    streakContainer: document.getElementById("streak-container"),
    streakCounter: document.getElementById("streak-counter"),
  };

  // --- 2. Game State Management ---
  const state = {
    gameState: "loading", // loading, playing, answered, reviewing
    activePackage: null,
    prefetchBuffer: null,
    isLoadingNext: false,
    currentDifficulty: "easy",
    currentLang: "zh",
    correctStreak: 0,
    bookNames: null,
  };

  // --- 3. Core Game Flow ---
  /**
   * Initializes the game: fetches book names and the first question package.
   */
  async function startGame() {
    updateUIState("loading", "正在准备游戏...");
    try {
      const [names, pkg] = await Promise.all([
        fetchBookNames(),
        fetchFullQuestionPackage(),
      ]);

      if (!names || !pkg) throw new Error("Failed to load initial game data.");

      state.bookNames = names;
      state.activePackage = pkg;

      displayMainQuestion();
      prefetchNextPackage();
    } catch (error) {
      handleError(error);
    }
  }

  /**
   * Fetches a new "super" question package from the backend.
   */
  async function fetchFullQuestionPackage() {
    try {
      const url = `/api/get-full-question?difficulty=${state.currentDifficulty}&lang=${state.currentLang}`;
      const response = await fetch(url);
      if (!response.ok) {
        const errData = await response
          .json()
          .catch(() => ({ details: "Unknown API error" }));
        throw new Error(errData.details || "Failed to fetch question package.");
      }
      return await response.json();
    } catch (error) {
      handleError(error);
      return null; // Return null on failure
    }
  }

  /**
   * Fetches the book names JSON from our new dedicated API.
   */
  async function fetchBookNames() {
    // We can cache this in the session as it rarely changes.
    if (state.bookNames) return state.bookNames;
    try {
      const response = await fetch("/api/get-book-names");
      if (!response.ok) throw new Error("Could not load book names.");
      const names = await response.json();
      state.bookNames = names;
      return names;
    } catch (e) {
      handleError(e);
      return null;
    }
  }

  /**
   * Fetches the next package in the background.
   */
  function prefetchNextPackage() {
    if (state.isLoadingNext || state.prefetchBuffer) return;

    state.isLoadingNext = true;
    /**
    console.log("...后台正在预取下一超级包...");
                 */

    fetchFullQuestionPackage()
      .then((pkg) => {
        if (pkg) {
          state.prefetchBuffer = pkg;
          /**
          console.log("✅ 下一超级包已就绪！");
             */
        }
      })
      .catch((error) => {
        console.error("Prefetch failed:", error);
      })
      .finally(() => {
        state.isLoadingNext = false;
      });
  }

  // --- 4. UI Rendering ---

  function displayMainQuestion() {
    const question = state.activePackage.mainQuestion;
    const title =
      (state.bookNames[state.currentLang] &&
        state.bookNames[state.currentLang]["UI_MAIN_TITLE"]) ||
      "这是哪节经文？";
    updateUIState("playing", title, `"${question.promptVerseText}"`);
    elements.streakContainer.style.display = "block";

    elements.optionsContainer.innerHTML = "";
    question.options.forEach((option) => {
      // ▼▼▼▼▼ 前端在这里进行翻译和拼接 ▼▼▼▼▼
      const bookName = state.bookNames[state.currentLang][option.bookId];
      const displayText = `${bookName} ${option.chapter}:${option.verseNum}`;
      const buttonOption = {
        id: option.id,
        ref: option.ref,
        text: displayText,
      }; // 创建一个新的option对象用于按钮

      const button = createButton(buttonOption, () =>
        handleMainOptionClick(option.id, option.ref)
      );
      elements.optionsContainer.appendChild(button);
    });
  }

  function displayReviewQuestion(reviewQuestion) {
    // ▼▼▼▼▼ 前端在这里进行翻译和拼接 ▼▼▼▼▼
    const bookName = state.bookNames[state.currentLang][reviewQuestion.bookId];
    const questionText = `${bookName} ${reviewQuestion.chapter}:${reviewQuestion.verseNum}`;
    const title =
      (state.bookNames[state.currentLang] &&
        state.bookNames[state.currentLang]["UI_REVIEW_TITLE"]) ||
      "复习一下:";

    updateUIState("reviewing", title, questionText);
    elements.streakContainer.style.display = "none";

    elements.optionsContainer.innerHTML = "";
    reviewQuestion.options.forEach((option) => {
      const button = createButton(option, () =>
        handleReviewClick(option.isCorrect)
      );
      elements.optionsContainer.appendChild(button);
    });
  }

  // --- 5. Event Handlers ---

  function handleMainOptionClick(selectedId, selectedRef) {
    if (state.gameState !== "playing") return;
    updateUIState("answered");
    const mainQuestion = state.activePackage.mainQuestion;
    const selectedButton = elements.optionsContainer.querySelector(
      `[data-id="${selectedId}"]`
    );

    if (selectedId === mainQuestion.correctOptionId) {
      state.correctStreak++;
      showFeedback("✅ 正确!", "green");
      if (selectedButton) selectedButton.classList.add("correct");
      setTimeout(loadNextPackage, 1000);
    } else {
      state.correctStreak = 0;
      if (selectedButton) selectedButton.classList.add("incorrect");
      showFeedback("❌ 答错了，我们一起来复习一下这节经文吧！", "#db7100");
      const reviewQuestion = state.activePackage.reviewData[selectedRef];
      setTimeout(() => displayReviewQuestion(reviewQuestion), 1500);
    }
    updateStreakDisplay();
  }

  function handleReviewClick(isCorrect) {
    if (state.gameState !== "reviewing") return;
    updateUIState("answered");
    if (isCorrect) {
      showFeedback("👍 复习正确！现在回到主问题。", "green");
      setTimeout(displayMainQuestion, 1500);
    } else {
      showFeedback("不对哦，再仔细看看。", "red");
      setTimeout(() => updateUIState("reviewing"), 1000);
    }
  }

  function loadNextPackage() {
    if (state.prefetchBuffer) {
      state.activePackage = state.prefetchBuffer;
      state.prefetchBuffer = null;
      displayMainQuestion();
      prefetchNextPackage();
    } else {
      console.log("预取包尚不可用，重新开始加载...");
      startGame();
    }
  }

  function handleSettingChange(event, type) {
    const selectedBtn = event.target;
    const value = selectedBtn.dataset[type];

    if (type === "difficulty") state.currentDifficulty = value;
    if (type === "lang") state.currentLang = value;

    state.correctStreak = 0;
    updateStreakDisplay();
    const buttons =
      type === "difficulty"
        ? elements.difficultyButtons
        : elements.languageButtons;
    buttons.forEach((btn) => btn.classList.remove("active"));
    selectedBtn.classList.add("active");

    // 重置缓存并重新开始游戏
    state.activePackage = null;
    state.prefetchBuffer = null;
    startGame();
  }

  // --- 6. UI Helper Functions ---
  function createButton(option, onClick) {
    const button = document.createElement("button");
    button.textContent = option.text;
    // 【关键修改】现在它能正确地处理主问题和复习题两种不同的option结构
    if (option.id) button.dataset.id = option.id;
    if (option.ref) button.dataset.ref = option.ref;
    button.addEventListener("click", onClick);
    return button;
  }

  function updateStreakDisplay() {
    elements.streakCounter.textContent = state.correctStreak;
  }

  function showFeedback(message, color) {
    elements.feedback.textContent = message;
    elements.feedback.style.color = color;
  }

  function updateUIState(newState, title, text) {
    state.gameState = newState;
    const isInteractive = newState === "playing" || newState === "reviewing";
    elements.optionsContainer
      .querySelectorAll("button")
      .forEach((btn) => (btn.disabled = !isInteractive));
    if (title) elements.title.textContent = title;
    if (text) elements.text.textContent = text;
    if (newState !== "answered") elements.feedback.textContent = "";
  }

  function handleError(error) {
    console.error("An error occurred:", error);
    updateUIState(
      "error",
      "出错了!",
      error.message || "无法加载游戏数据，请刷新页面重试。"
    );
  }

  // --- 7. Initialization ---
  elements.difficultyButtons.forEach((btn) =>
    btn.addEventListener("click", (e) => handleSettingChange(e, "difficulty"))
  );
  elements.languageButtons.forEach((btn) =>
    btn.addEventListener("click", (e) => handleSettingChange(e, "lang"))
  );
  startGame();
});
