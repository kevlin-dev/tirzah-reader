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
    // e.g., books/philippa-perry/chapter-01 -> books/philippa-perry/glossary-01.json
    const cleanPath = path.replace(/\.md$/, '');
    const glossaryPath = cleanPath.replace(/chapter-(\d+)$/, 'glossary-$1.json');

    // Only attempt fetch if we actually transformed the path
    if (glossaryPath === cleanPath) {
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
          const span = document.createElement('span');
          span.className = 'gloss-word-wrap';
          span.textContent = part;

          // Check if this word is in the glossary
          const glossEntry = lookupWord(part);
          if (glossEntry) {
            const state = getWordState(part);
            span.setAttribute('data-state', state);
            span.setAttribute('data-word', part.toLowerCase());
            recordEncounter(part);
          }

          fragment.appendChild(span);
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
      // Tap outside to close
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.gloss-word-wrap') && !e.target.closest('.gloss-popup')) {
          this.hide();
        }
      });
    },

    show(word, entry, wordData) {
      if (!this.el) return;

      const state = getWordState(word);

      this.el.querySelector('.gloss-word').textContent = word;
      this.el.querySelector('.gloss-definition').textContent = entry.definition || '';

      // Show Chinese based on scaffold level
      const chineseEl = this.el.querySelector('.gloss-chinese');
      if (state === 'known') {
        // Minimal: just definition, no Chinese
        chineseEl.textContent = '';
      } else {
        chineseEl.textContent = entry.chinese || '';
      }

      // Show example only on first encounters
      const exampleEl = this.el.querySelector('.gloss-example');
      if (state === 'new' && entry.example) {
        exampleEl.textContent = entry.example;
      } else {
        exampleEl.textContent = '';
      }

      // Show encounter count for learning words
      let encounterEl = this.el.querySelector('.gloss-encounters');
      if (!encounterEl) {
        encounterEl = document.createElement('div');
        encounterEl.className = 'gloss-encounters';
        this.el.querySelector('.gloss-content').appendChild(encounterEl);
      }

      if (wordData && wordData.taps > 1) {
        encounterEl.textContent = 'Looked up ' + wordData.taps + ' time' + (wordData.taps > 1 ? 's' : '');
      } else {
        encounterEl.textContent = '';
      }

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

    // Update visual state
    const newState = getWordState(word);
    wordEl.setAttribute('data-state', newState);

    // Update all instances of this word on the page
    document.querySelectorAll('.gloss-word-wrap[data-word="' + word + '"]').forEach(function (el) {
      el.setAttribute('data-state', newState);
    });

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
    hook.doneEach(async function () {
      // Determine current page path for glossary loading
      const hash = window.location.hash.replace('#/', '') || 'home';
      await loadGlossary(hash);

      // Wrap words in the content area
      const content = document.querySelector('.markdown-section');
      if (content) {
        wrapWordsInElement(content);

        // Attach tap handler
        content.addEventListener('click', handleWordTap);
      }
    });

    hook.ready(function () {
      popup.init();
      initProgressBar();
    });
  }

  // Register plugin
  window.$docsify = window.$docsify || {};
  window.$docsify.plugins = (window.$docsify.plugins || []).concat(glossingPlugin);

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
