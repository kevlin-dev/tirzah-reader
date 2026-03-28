# Tirzah Reader

An adaptive English reading tool built for Tong Sin — a Chinese-native speaker learning to read English fluently.

## What This Is
A Docsify-based web reader that makes English books accessible by providing intelligent, level-calibrated word definitions on tap. Built on language acquisition research (Nation, Krashen, glossing studies).

## Architecture
- **Docsify** static site, hosted on GitHub Pages (mobile-first — she reads on her phone)
- **Book text** as markdown files in `books/` directory
- **Glossing engine** — tap any word, get a calibrated definition (simple English + Chinese translation)
- **Vocabulary tracker** — localStorage tracks per-word tap history for scaffold fading

## Core Design Principles (research-backed)
1. **95-98% coverage threshold** — glossing raises effective coverage into the pleasure-reading zone
2. **Click-to-reveal** — tap to see definition (micro-effort improves retention)
3. **Scaffold fading** — 1st encounter: Chinese + English. 3rd: English only. 5th+: no gloss
4. **Calibrated definitions** — not dictionary entries. Simple, level-appropriate explanations
5. **Volume over difficulty** — make reading pleasant so she reads more

## Current Book
"The Book You Wish Your Parents Had Read" by Philippa Perry

## Research
- Language acquisition science: `~/second-brain/study/ideas/language-acquisition-science-research.md`
- Tools landscape: `~/second-brain/study/ideas/bilingual-reading-tools-landscape-research.md`

## Hosting
- GitHub Pages — same pattern as second-brain reader
- Repo: tirzah-reader
