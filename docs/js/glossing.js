/**
 * Tirzah Reader — Glossing Engine
 *
 * Wraps words in tappable spans, shows definitions from a pre-generated glossary,
 * tracks per-word encounter history in localStorage, and fades scaffolding over time.
 *
 * Word states:
 *   "new"      — first encounter, full scaffold (English def + Chinese + example)
 *   "learning" — 2-4 encounters, reduced scaffold (English def + Chinese)
 *   "known"    — 5+ encounters without recent taps, no visual indicator
 */

(function () {
  'use strict';

  // ===== Storage =====

  const STORAGE_KEY = 'tirzah_vocab';

  function loadVocab() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveVocab(vocab) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(vocab));
  }

  function recordTap(word) {
    const vocab = loadVocab();
    const key = word.toLowerCase();
    if (!vocab[key]) {
      vocab[key] = { taps: 0, encounters: 0, firstSeen: Date.now() };
    }
    vocab[key].taps += 1;
    vocab[key].lastTapped = Date.now();
    saveVocab(vocab);
    return vocab[key];
  }

  function recordEncounter(word) {
    const vocab = loadVocab();
    const key = word.toLowerCase();
    if (!vocab[key]) {
      vocab[key] = { taps: 0, encounters: 0, firstSeen: Date.now() };
    }
    vocab[key].encounters += 1;
    saveVocab(vocab);
    return vocab[key];
  }

  function getWordState(word) {
    const vocab = loadVocab();
    const entry = vocab[word.toLowerCase()];
    if (!entry || entry.taps === 0) return 'new';
    if (entry.encounters < 5 || entry.taps > entry.encounters * 0.3) return 'learning';
    return 'known';
  }

  // ===== Glossary =====

  let currentGlossary = {};

  async function loadGlossary(path) {
    // Derive glossary path from the current page
    // Hash may or may not include .md extension
    // e.g., books/philippa-perry/part1-01-the-past-comes-back → glossaries/part1-01-the-past-comes-back.json
    const cleanPath = path.replace(/\.md$/, '');

    // Extract the filename (last segment of the path)
    const parts = cleanPath.split('/');
    const filename = parts[parts.length - 1];

    // Build glossary path: same directory level, under glossaries/
    const dir = parts.slice(0, -1).join('/');
    const glossaryPath = (dir ? dir + '/' : '') + 'glossaries/' + filename + '.json';

    // Skip home/root pages
    if (!filename || filename === 'home' || filename === 'README') {
      currentGlossary = {};
      return;
    }

    try {
      const response = await fetch(glossaryPath);
      if (response.ok) {
        currentGlossary = await response.json();
        console.log('[Tirzah] Loaded glossary:', Object.keys(currentGlossary).length, 'words');
      } else {
        currentGlossary = {};
      }
    } catch {
      currentGlossary = {};
    }
  }

  function lookupWord(word) {
    const key = word.toLowerCase();
    return currentGlossary[key] || null;
  }

  // ===== Word wrapping =====

  function isWord(text) {
    return /^[a-zA-Z'-]+$/.test(text);
  }

  function wrapWordsInElement(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];

    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    textNodes.forEach(function (textNode) {
      const parent = textNode.parentNode;
      if (!parent || parent.classList?.contains('gloss-word-wrap')) return;
      if (parent.tagName === 'CODE' || parent.tagName === 'PRE') return;
      if (parent.tagName === 'A') return;

      const text = textNode.nodeValue;
      // Split on word boundaries, preserving whitespace and punctuation
      const parts = text.split(/(\b[a-zA-Z'-]+\b)/);

      if (parts.length <= 1) return;

      const fragment = document.createDocumentFragment();

      parts.forEach(function (part) {
        if (isWord(part) && part.length > 1) {
          const glossEntry = lookupWord(part);
          if (glossEntry) {
            // Word is in glossary — make it tappable
            const span = document.createElement('span');
            span.className = 'gloss-word-wrap';
            span.textContent = part;
            span.setAttribute('data-word', part.toLowerCase());
            recordEncounter(part);
            fragment.appendChild(span);
          } else {
            // Not in glossary — render as plain text
            fragment.appendChild(document.createTextNode(part));
          }
        } else {
          fragment.appendChild(document.createTextNode(part));
        }
      });

      parent.replaceChild(fragment, textNode);
    });
  }

  // ===== Popup =====

  const popup = {
    el: null,

    init() {
      this.el = document.getElementById('gloss-popup');

      // Add close button
      const closeBtn = document.createElement('button');
      closeBtn.className = 'gloss-close';
      closeBtn.textContent = '\u00d7';
      closeBtn.addEventListener('touchend', (e) => { e.preventDefault(); this.hide(); });
      closeBtn.addEventListener('click', (e) => { e.preventDefault(); this.hide(); });
      this.el.querySelector('.gloss-content').prepend(closeBtn);

      // Add swipe-down handle
      const handle = document.createElement('div');
      handle.className = 'gloss-handle';
      this.el.querySelector('.gloss-content').prepend(handle);

      // Swipe down to dismiss
      let startY = 0;
      this.el.addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; }, { passive: true });
      this.el.addEventListener('touchend', (e) => {
        const endY = e.changedTouches[0].clientY;
        if (endY - startY > 40) this.hide();
      });

      // Tap outside to close
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.gloss-word-wrap') && !e.target.closest('.gloss-popup')) {
          this.hide();
        }
      });
      document.addEventListener('touchend', (e) => {
        if (!e.target.closest('.gloss-word-wrap') && !e.target.closest('.gloss-popup')) {
          this.hide();
        }
      });
    },

    show(word, entry, wordData) {
      if (!this.el) return;

      this.el.querySelector('.gloss-word').textContent = word;
      this.el.querySelector('.gloss-definition').textContent = entry.definition || '';
      this.el.querySelector('.gloss-chinese').textContent = entry.chinese || '';
      this.el.querySelector('.gloss-example').textContent = entry.example || '';

      this.el.classList.remove('hidden');
    },

    hide() {
      if (this.el) {
        this.el.classList.add('hidden');
      }
    }
  };

  // ===== Event handling =====

  function handleWordTap(e) {
    const wordEl = e.target.closest('.gloss-word-wrap');
    if (!wordEl) return;

    const word = wordEl.getAttribute('data-word');
    if (!word) return;

    const entry = lookupWord(word);
    if (!entry) return;

    e.preventDefault();
    e.stopPropagation();

    const wordData = recordTap(word);
    popup.show(word, entry, wordData);
  }

  // ===== Reading progress bar =====

  function initProgressBar() {
    const bar = document.createElement('div');
    bar.className = 'reading-progress';
    document.body.appendChild(bar);

    function updateProgress() {
      const content = document.querySelector('.markdown-section');
      if (!content) return;
      const scrollTop = window.scrollY;
      const docHeight = content.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? Math.min(scrollTop / docHeight * 100, 100) : 0;
      bar.style.width = progress + '%';
    }

    window.addEventListener('scroll', updateProgress, { passive: true });
    updateProgress();
  }

  // ===== Docsify plugin =====

  function glossingPlugin(hook) {
    console.log('[Tirzah] Plugin registered');

    hook.doneEach(async function () {
      // Determine current page path for glossary loading
      const hash = window.location.hash.replace('#/', '') || 'home';
      console.log('[Tirzah] Page loaded, hash:', hash);
      await loadGlossary(hash);

      // Wrap words in the content area
      const content = document.querySelector('.markdown-section');
      if (content) {
        const glossarySize = Object.keys(currentGlossary).length;
        console.log('[Tirzah] Wrapping words, glossary has', glossarySize, 'entries');
        wrapWordsInElement(content);

        const wrapped = content.querySelectorAll('.gloss-word-wrap[data-word]');
        console.log('[Tirzah] Wrapped', wrapped.length, 'glossary words');

        // Attach tap handler
        content.addEventListener('click', handleWordTap);
      }
    });

    hook.ready(function () {
      console.log('[Tirzah] Ready, initializing popup');
      popup.init();
      initProgressBar();
    });
  }

  // Expose plugin globally so index.html can register it in the docsify config
  window.tirzahGlossingPlugin = glossingPlugin;

  // ===== Stats API (for progress dashboard) =====

  window.TirzahReader = {
    getStats() {
      const vocab = loadVocab();
      const words = Object.keys(vocab);
      const known = words.filter(w => getWordState(w) === 'known').length;
      const learning = words.filter(w => getWordState(w) === 'learning').length;
      const newWords = words.filter(w => getWordState(w) === 'new').length;
      return { total: words.length, known, learning, new: newWords };
    },

    resetVocab() {
      localStorage.removeItem(STORAGE_KEY);
    },

    exportVocab() {
      return loadVocab();
    }
  };

})();
