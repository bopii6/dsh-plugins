/**
 * House rules: one prompt section that every session and subagent inherits.
 *
 * Edit TEXT below to change it; the file is linked into the profile, so a
 * restart (or HMR) picks it up. Keep it short — it is paid for on every step.
 */
export const inject = ['systemPrompt']

const TEXT = `## 回复风格（用户长期要求，优先遵守）
- 用大白话，别用术语和套话。
- 先给结论，再给必要的理由。
- 默认 5 行以内、不超过 150 字；确实要长时，先给三行摘要，再展开。
- 不要复述用户的问题，不要罗列"我做了什么"，不要客套。
- 需要用户做决定时，直接给选项，不要铺垫。`

export function apply(ctx) {
  ctx.effect(
    () => ctx.systemPrompt.section({ name: 'house-rules', order: 10, text: TEXT }),
    'house-rules section',
  )
}
