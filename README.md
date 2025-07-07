### **圣经问答游戏：从零到全球部署完整教程 (最终版)**

**项目作者:** wuyou0789
**项目仓库:** `https://github.com/wuyou0789/bible-game.git`

#### **一、项目概述**

本项目是一个基于Cloudflare全家桶（Pages, Functions, KV, R2）构建的全栈Web应用。它实现了动态难度、互动式复习、连对计数等功能，并拥有一个美观、自适应的界面。项目支持两种数据获取模式：“云端模式”（从KV/R2读取，有网络延迟）和“本地文件模式”（从打包的JSON文件读取，几乎无延迟），便于性能对比和多平台部署。

---

#### **二、项目文件结构解析**

```
/bible-game
  |
  ├── /public/                       # 【前端静态资源】用户浏览器直接访问的内容。
  |   ├── /js/
  |   |   └── game.js                # 游戏主逻辑脚本，包含UI渲染、状态管理、API调用等。
  |   ├── /css/
  |   |   └── style.css              # 游戏所有视觉样式和响应式布局。
  |   └── index.html                 # 游戏主页面HTML结构。
  |
  ├── /functions/                    # 【后端API】所有在服务器运行的Worker函数。
  |   └── api/
  |       ├── new-question.js        # 【云端API】从Cloudflare KV/R2获取主问题。
  |       ├── review-question.js     # 【云端API】从Cloudflare KV/R2获取复习题。
  |       ├── new-question-from-file.js # 【本地文件API】从打包的JSON文件获取主问题。
  |       └── review-question-from-file.js # 【本地文件API】从打包的JSON文件获取复习题。
  |
  ├── /data-source/                  # 【原始数据】项目所有内容的核心源文件。
  |   ├── verses_content.json        # 经文内容库，采用高效的嵌套字典结构。
  |   └── book_names.json            # 书卷名翻译字典，按语言分组。
  |
  ├── seed.js                        # 【数据上传脚本】读取data-source并强制上传到真实的云端资源。
  |
  ├── wrangler.toml                  # 【项目配置文件】定义项目名称及绑定的云端资源。
  |
  ├── .gitignore                     # 【忽略文件】排除不应进入版本控制的文件。
  |
  └── package.json                   # 【项目依赖清单】。
```

---

### **三、全新环境安装与运行步骤**

#### **第一阶段：获取项目并配置环境**

1.  **安装必备工具 (在新的macOS终端):**
    *   **Node.js/npm:** 运行 `node -v` 检查。若无，请从官网安装。
    *   **Wrangler:** 运行 `npm install -g wrangler@latest` 进行全局安装。
    *   **Git:** 运行 `git --version` 检查。

2.  **克隆您的项目代码:**
    *   打开终端，进入您希望存放项目的目录（例如`~/Developer`），然后运行：
        ```bash
        git clone https://github.com/wuyou0789/bible-game.git
        ```
    *   进入刚刚克隆下来的项目文件夹：
        ```bash
        cd bible-game
        ```
    *   **安装项目依赖** (虽然我们目前没有外部依赖，但这是个好习惯):
        ```bash
        npm install
        ```

3.  **登录并创建云端资源:**
    *   **登录Cloudflare:**
        ```bash
        wrangler login
        ```
    *   **创建KV数据库:** (如果命令失败，请尝试去掉中间的冒号)
        ```bash
        wrangler kv:namespace create "VERSES_KV"
        ```
        **【重要】** 复制并**保存好输出的`id`**。
    *   **创建R2存储桶:** (如果提示未启用，请先到Cloudflare官网控制台手动启用R2)
        ```bash
        wrangler r2 bucket create "bible-game-verses"
        ```

4.  **配置本地项目 (`wrangler.toml`):**
    *   用VSCode打开项目。
    *   打开`wrangler.toml`文件。
    *   找到`[[kv_namespaces]]`部分，将`id`的值**替换为您刚刚保存的那个新的KV ID**。

#### **第二阶段：上传核心数据**

1.  **检查`seed.js`:**
    *   确认`seed.js`中的`wrangler`命令都带有`--remote`参数，以确保数据上传到真实的云端。

2.  **运行上传脚本:**
    *   在终端中（确保仍在`bible-game`目录下），运行：
        ```bash
        node seed.js
        ```
    *   **检查：** 观察输出，确保`Resource location:`显示为`remote`，并最终提示`✅ Seeding to remote complete!`。

#### **第三阶段：本地开发与测试**

1.  **启动本地服务器:**
    *   **要测试“本地文件模式” (几乎无延迟):**
        *   在`public/js/game.js`中，确认`const DATA_SOURCE_MODE = 'LOCAL_FILE';`。
        *   在终端运行：
            ```bash
            wrangler pages dev public
            ```    *   **要测试“云端模式” (有真实网络延迟):**
        *   在`public/js/game.js`中，将`DATA_SOURCE_MODE`改为`'CLOUDFLARE'`。
        *   在终端运行以下命令，强制连接到远程资源：
            ```bash
            wrangler pages dev public --kv=VERSES_KV --r2=IDS_SOURCE_BUCKET
            ```
2.  **测试:**
    *   打开浏览器访问 `http://localhost:8788`，全面测试游戏功能。

#### **第四阶段：部署到生产环境**

1.  **在Cloudflare控制台连接项目:**
    *   进入 **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**。
    *   选择您的`wuyou0789/bible-game`仓库。
2.  **配置构建:**
    *   **Production branch:** `main`
    *   **Framework preset:** `None`
    *   **Build output directory:** `/public`
3.  **绑定生产环境资源:**
    *   向下滚动到**绑定(Bindings)**部分。
    *   添加**KV Namespace Binding**: 变量名`VERSES_KV`，值选择您创建的`VERSES_KV`。
    *   添加**R2 Bucket Binding**: 变量名`IDS_SOURCE_BUCKET`，值选择`bible-game-verses`。
4.  **保存并部署:**
    *   点击 **“Save and Deploy”**。几分钟后，您的网站就会部署到`.pages.dev`的网址上。

---

#### **四、日常维护与更新**

*   **更新代码/功能:**
    1.  在本地修改代码。
    2.  测试通过后，推送到GitHub：
        ```bash
        git add .
        git commit -m "feat: [您做的更新描述]"
        git push origin main
        ```
    3.  Cloudflare Pages会自动检测到推送并重新部署您的网站。

*   **更新游戏内容 (经文):**
    1.  在本地修改`/data-source/`中的`verses_content.json`和`book_names.json`文件。
    2.  在终端运行`node seed.js`，将新数据上传到云端。
    3.  **（可选）** 去Cloudflare控制台手动触发一次新的部署，以确保Worker能立即使用到最新的数据。

---