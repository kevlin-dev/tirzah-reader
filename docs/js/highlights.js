/**
 * Tirzah Reader — Highlight Engine
 *
 * Select text → tap highlight button → saved to localStorage.
 * Highlights persist across sessions and re-render on page load.
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'tirzah_highlights';

  // ===== Storage =====

  function loadHighlights() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveHighlights(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function getPageKey() {
    return window.location.hash.replace('#/', '') || 'home';
  }

  function addHighlight(text) {
    const data = loadHighlights();
    const page = getPageKey();
    if (!data[page]) data[page] = [];
    // Avoid duplicates
    if (!data[page].some(h => h.text === text)) {
      data[page].push({ text: text, created: Date.now() });
      saveHighlights(data);
    }
    return data[page];
  }

  function removeHighlight(text) {
    const data = loadHighlights();
    const page = getPageKey();
    if (data[page]) {
      data[page] = data[page].filter(h => h.text !== text);
      if (data[page].length === 0) delete data[page];
      saveHighlights(data);
    }
  }

  function getPageHighlights() {
    const data = loadHighlights();
    return data[getPageKey()] || [];
  }

  // ===== Highlight rendering =====

  function applyHighlights(content) {
    const highlights = getPageHighlights();
    if (highlights.length === 0) return;

    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    highlights.forEach(function (h) {
      const searchText = h.text;
      for (let i = 0; i < textNodes.length; i++) {
        const node = textNodes[i];
        const idx = node.nodeValue.indexOf(searchText);
        if (idx === -1) continue;

        // Already highlighted?
        if (node.parentNode.classList && node.parentNode.classList.contains('tirzah-highlight')) continue;

        const before = node.nodeValue.substring(0, idx);
        const match = node.nodeValue.substring(idx, idx + searchText.length);
        const after = node.nodeValue.substring(idx + searchText.length);

        const span = document.createElement('span');
        span.className = 'tirzah-highlight';
        span.textContent = match;
        span.setAttribute('data-highlight-text', searchText);

        const parent = node.parentNode;
        if (before) parent.insertBefore(document.createTextNode(before), node);
        parent.insertBefore(span, node);
        if (after) {
          const afterNode = document.createTextNode(after);
          parent.insertBefore(afterNode, node);
          // Update textNodes array so we can find multi-occurrence highlights
          textNodes[i] = afterNode;
        }
        parent.removeChild(node);
        break; // One match per highlight entry per pass
      }
    });
  }

  // ===== Selection toolbar =====

  const toolbar = {
    el: null,

    init() {
      this.el = document.createElement('div');
      this.el.className = 'tirzah-toolbar hidden';
      this.el.innerHTML = '<button class="tirzah-toolbar-btn tirzah-highlight-btn" title="Highlight">&#9998;</button>' +
        '<button class="tirzah-toolbar-btn tirzah-speak-btn" title="Read aloud">&#9654;</button>';
      document.body.appendChild(this.el);

      // Highlight button
      this.el.querySelector('.tirzah-highlight-btn').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.doHighlight();
      });
      this.el.querySelector('.tirzah-highlight-btn').addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.doHighlight();
      });

      // Speak button
      this.el.querySelector('.tirzah-speak-btn').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.doSpeak();
      });
      this.el.querySelector('.tirzah-speak-btn').addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.doSpeak();
      });

      // Hide on scroll
      window.addEventListener('scroll', () => this.hide(), { passive: true });
    },

    show(x, y, bottom) {
      this.el.classList.remove('hidden');
      // Position below selection to avoid iOS native menu
      const toolbarWidth = 88;
      const left = Math.max(8, Math.min(x - toolbarWidth / 2, window.innerWidth - toolbarWidth - 8));
      const top = bottom + window.scrollY + 8;
      this.el.style.left = left + 'px';
      this.el.style.top = top + 'px';
    },

    hide() {
      this.el.classList.add('hidden');
    },

    doHighlight() {
      const sel = window.getSelection();
      const text = sel.toString().trim();
      if (!text) return;

      addHighlight(text);
      sel.removeAllRanges();
      this.hide();

      // Re-apply highlights
      const content = document.querySelector('.markdown-section');
      if (content) applyHighlights(content);
    },

    doSpeak() {
      const sel = window.getSelection();
      const text = sel.toString().trim();
      if (!text) return;

      sel.removeAllRanges();
      this.hide();

      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-GB';
        utterance.rate = 0.85;
        window.speechSynthesis.speak(utterance);
      }
    }
  };

  // ===== Highlight tap to remove =====

  function handleHighlightTap(e) {
    const el = e.target.closest('.tirzah-highlight');
    if (!el) return;

    const text = el.getAttribute('data-highlight-text');
    if (!text) return;

    // Show a small confirm to remove
    if (confirm('Remove highlight?')) {
      removeHighlight(text);
      // Unwrap the highlight span
      const parent = el.parentNode;
      parent.insertBefore(document.createTextNode(el.textContent), el);
      parent.removeChild(el);
      parent.normalize();
    }
  }

  // ===== Selection detection =====

  function onSelectionChange() {
    const sel = window.getSelection();
    const text = sel.toString().trim();
    if (text.length < 2) {
      toolbar.hide();
      return;
    }

    // Get selection position
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    toolbar.show(rect.left + rect.width / 2, rect.top + window.scrollY, rect.bottom);
  }

  // ===== Docsify plugin =====

  function highlightPlugin(hook) {
    hook.doneEach(function () {
      const content = document.querySelector('.markdown-section');
      if (content) {
        applyHighlights(content);
        content.addEventListener('click', handleHighlightTap);
      }
    });

    hook.ready(function () {
      toolbar.init();

      // Listen for text selection
      let selectionTimeout;
      document.addEventListener('selectionchange', function () {
        clearTimeout(selectionTimeout);
        selectionTimeout = setTimeout(onSelectionChange, 300);
      });
    });
  }

  window.tirzahHighlightPlugin = highlightPlugin;

  // ===== Public API =====

  window.TirzahHighlights = {
    getAll() { return loadHighlights(); },
    getPage() { return getPageHighlights(); },
    clear() { localStorage.removeItem(STORAGE_KEY); }
  };

})();
