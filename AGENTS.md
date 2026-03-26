<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


## 部署到 Vercel

**Vercel 项目地址**：[may3rrs-projects/claude-clone](https://vercel.com/may3rrs-projects/claude-clone)
**线上地址**：https://ljcr.chat

1. 将项目推送到 GitHub
2. 在 [Vercel](https://vercel.com) 导入项目
3. 在 Settings → Environment Variables 中添加 `GPT_GE_API_URL` 和每个用户的 `KEY_XXX`
4. 部署完成

或使用 CLI：

```bash
npm i -g vercel
vercel deploy --prod
```