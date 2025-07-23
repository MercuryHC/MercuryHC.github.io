# 现代开发者博客

一个基于 Jekyll 的现代、简洁的开发者博客，支持深色/浅色主题切换，完全兼容 GitHub Pages。

## ✨ 特性

- 🌓 **主题切换**: 支持深色和浅色模式，自动保存用户偏好
- 📱 **响应式设计**: 完美适配桌面、平板和移动设备
- 🚀 **性能优化**: 快速加载，优化的图片和资源
- 🎨 **现代设计**: 简洁美观的界面，渐变色彩搭配
- 📝 **Markdown 支持**: 使用 Markdown 编写文章
- 🏷️ **标签分类**: 支持文章标签和分类管理
- 🔍 **SEO 优化**: 搜索引擎友好的结构
- ♿ **无障碍支持**: 符合 WCAG 可访问性标准
- 📄 **分页功能**: 支持文章列表分页显示
- 🎯 **代码高亮**: 支持多种编程语言语法高亮

## 🛠️ 技术栈

- **静态站点生成器**: Jekyll
- **前端技术**: HTML5, CSS3, JavaScript (ES6+)
- **样式**: 原生 CSS，CSS 变量，Flexbox/Grid
- **字体**: Inter 字体系列
- **部署**: GitHub Pages
- **版本控制**: Git

## 📁 项目结构

```
├── _config.yml          # Jekyll 配置文件
├── _layouts/            # 页面布局模板
│   ├── default.html     # 基础布局
│   ├── post.html        # 文章页面布局
│   └── page.html        # 通用页面布局
├── _posts/              # 博客文章
│   ├── 2024-12-15-building-modern-web-apps-with-ai.md
│   ├── 2024-12-10-future-of-ui-design.md
│   └── 2024-12-05-react-performance-optimization.md
├── assets/              # 静态资源
│   ├── css/
│   │   └── style.css    # 主样式文件
│   └── js/
│       └── main.js      # 主 JavaScript 文件
├── index.html           # 首页
├── blog.html            # 博客列表页
├── about.md             # 关于页面
├── Gemfile              # Ruby 依赖管理
└── README.md            # 项目说明
```

## 🚀 快速开始

### 本地开发

1. **克隆仓库**
   ```bash
   git clone https://github.com/yourusername/your-blog-repo.git
   cd your-blog-repo
   ```

2. **安装依赖**
   ```bash
   bundle install
   ```

3. **启动本地服务器**
   ```bash
   bundle exec jekyll serve
   ```

4. **访问网站**
   打开浏览器访问 `http://localhost:4000`

### GitHub Pages 部署

1. **推送到 GitHub**
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. **启用 GitHub Pages**
   - 进入仓库设置页面
   - 找到 "Pages" 选项
   - 选择 "Deploy from a branch"
   - 选择 "main" 分支
   - 点击 "Save"

3. **访问网站**
   几分钟后，您的网站将在 `https://yourusername.github.io/your-repo-name` 可用

## ✍️ 写作指南

### 创建新文章

1. 在 `_posts` 目录下创建新文件，文件名格式：`YYYY-MM-DD-title.md`

2. 添加 Front Matter：
   ```yaml
   ---
   layout: post
   title: "文章标题"
   subtitle: "文章副标题（可选）"
   date: 2024-12-15
   categories: [技术, Web开发]
   tags: [JavaScript, React, 性能优化]
   author: "作者名"
   reading_time: 10
   ---
   ```

3. 使用 Markdown 编写文章内容

### Front Matter 字段说明

- `layout`: 使用的布局模板（通常为 `post`）
- `title`: 文章标题
- `subtitle`: 文章副标题（可选）
- `date`: 发布日期
- `categories`: 文章分类
- `tags`: 文章标签
- `author`: 作者
- `reading_time`: 预估阅读时间（分钟）

## 🎨 自定义配置

### 修改站点信息

编辑 `_config.yml` 文件：

```yaml
title: "您的博客名称"
email: "your.email@example.com"
description: "博客描述"
github_username: yourusername
twitter_username: yourusername
```

### 自定义样式

主要样式文件位于 `assets/css/style.css`，您可以：

- 修改 CSS 变量来改变颜色主题
- 调整字体和排版
- 添加自定义动画效果

### 添加新页面

1. 创建新的 Markdown 文件
2. 添加适当的 Front Matter
3. 在导航栏中添加链接（编辑 `_layouts/default.html`）

## 🔧 主题切换功能

博客支持深色和浅色主题切换：

- 点击导航栏中的主题切换按钮
- 使用键盘快捷键：`Ctrl/Cmd + Shift + T`
- 自动检测系统主题偏好
- 记住用户的主题选择

## 📱 响应式设计

网站在以下设备上都有良好的显示效果：

- 桌面电脑（1200px+）
- 平板电脑（768px - 1199px）
- 手机（< 768px）

## 🔍 SEO 优化

博客包含以下 SEO 优化：

- 语义化 HTML 结构
- Meta 标签优化
- Open Graph 标签
- Twitter Card 支持
- 结构化数据
- XML 站点地图
- RSS 订阅源

## 🤝 贡献

欢迎提交 Issue 和 Pull Request 来改进这个博客模板！

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🙏 致谢

- [Jekyll](https://jekyllrb.com/) - 静态站点生成器
- [GitHub Pages](https://pages.github.com/) - 免费托管服务
- [Inter](https://rsms.me/inter/) - 优秀的字体
- 所有为开源社区做出贡献的开发者们

---

如果这个博客模板对您有帮助，请给个 ⭐ Star！

A sleek, modern personal blog website inspired by [Zed.dev](https://zed.dev)'s design philosophy. Built with vanilla HTML, CSS, and JavaScript for optimal performance and simplicity.

## ✨ Features

### 🎨 Design & UI
- **Modern, clean design** inspired by Zed.dev's aesthetic
- **Dark/Light theme system** with automatic OS preference detection
- **Responsive layout** that works on all devices
- **Smooth animations** and micro-interactions
- **Gradient accents** and modern typography
- **Interactive code preview** with syntax highlighting

### 🚀 Performance
- **Zero dependencies** - pure vanilla JavaScript
- **Optimized CSS** with CSS custom properties
- **Smooth scrolling** and optimized animations
- **Lazy loading** and intersection observers
- **Debounced/throttled** event handlers

### 🎯 Sections
- **Hero section** with animated code preview
- **About section** with skills showcase
- **Projects portfolio** with hover effects
- **Blog posts** with modern card layout
- **Contact section** with social links
- **Responsive navigation** with theme toggle

### ♿ Accessibility
- **Keyboard navigation** support
- **Focus management** and ARIA labels
- **High contrast** color schemes
- **Screen reader** friendly markup
- **Reduced motion** respect

## 🛠️ Customization

### Colors & Themes
Edit the CSS custom properties in `styles.css`:

```css
:root {
    --accent-primary: #3b82f6;    /* Primary accent color */
    --accent-secondary: #8b5cf6;  /* Secondary accent color */
    --gradient-start: #3b82f6;    /* Gradient start */
    --gradient-end: #8b5cf6;      /* Gradient end */
}
```

### Content
1. **Personal Information**: Update name, title, and description in `index.html`
2. **Skills**: Modify the skills grid in the about section
3. **Projects**: Add your own projects with links and descriptions
4. **Blog Posts**: Update with your latest blog posts
5. **Contact**: Add your social media links and contact information

### Fonts
The site uses Inter font from Google Fonts. To change:

```css
body {
    font-family: 'Your-Font', -apple-system, BlinkMacSystemFont, sans-serif;
}
```

## 🚀 Getting Started

1. **Clone or download** this repository
2. **Customize** the content in `index.html`
3. **Update** colors and styling in `styles.css`
4. **Modify** interactions in `script.js` if needed
5. **Deploy** to your preferred hosting platform

### Local Development
Simply open `index.html` in your browser, or use a local server:

```bash
# Using Python
python -m http.server 8000

# Using Node.js (http-server)
npx http-server

# Using PHP
php -S localhost:8000
```

## 📱 Browser Support

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

## 🎨 Design Inspiration

This design draws inspiration from:
- **Zed.dev** - Modern, clean aesthetic with excellent typography
- **GitHub** - Card-based layouts and subtle shadows
- **Vercel** - Gradient accents and smooth animations
- **Linear** - Minimalist design and attention to detail

## 📄 License

MIT License - feel free to use this template for your own projects!

## 🤝 Contributing

Feel free to submit issues and enhancement requests!

---

**Built with ❤️ and modern web technologies**