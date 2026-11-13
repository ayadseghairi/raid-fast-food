import React, { useRef, useState, useEffect, useCallback } from 'react';
import Icon from './Icon.jsx';
import styles from './CategoryTabs.module.css';

/**
 * Horizontally scrollable category tab bar.
 *
 * Props:
 *   categories  – [{ id, name }]
 *   activeId    – id of active category
 *   onChange    – (id) => void
 *
 * Features:
 *   - Single row, horizontal scroll (touch + mouse wheel + arrow buttons)
 *   - Scrollbar hidden
 *   - Soft fade masks at left/right edges when more items exist off-screen
 *   - Arrow buttons appear only when there is overflow in that direction
 *   - Active tab auto-scrolls into view
 *   - Touch targets >= 56 px (tab height 44 px inside 56 px wrapper)
 *   - RTL-aware: right arrow scrolls toward start of list (logical "back")
 */
export default function CategoryTabs({ categories = [], activeId, onChange }) {
  const scrollRef = useRef(null);
  const [canScrollStart, setCanScrollStart] = useState(false); // more items in RTL "start" = right
  const [canScrollEnd, setCanScrollEnd] = useState(false);     // more items in RTL "end" = left

  // --- Scroll state check ---
  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    // In RTL, scrollLeft is negative in some browsers (or positive in others).
    // We use Math.abs for safety.
    const absLeft = Math.abs(scrollLeft);
    const maxScroll = scrollWidth - clientWidth;
    setCanScrollStart(absLeft > 2);
    setCanScrollEnd(maxScroll - absLeft > 2);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      ro.disconnect();
    };
  }, [checkScroll, categories]);

  // Auto-scroll active tab into view
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !activeId) return;
    // Find the button with matching data-id
    const btn = el.querySelector(`[data-tabid="${activeId}"]`);
    if (btn) {
      btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [activeId]);

  // Mouse-wheel horizontal scroll
  function handleWheel(e) {
    const el = scrollRef.current;
    if (!el) return;
    e.preventDefault();
    el.scrollBy({ left: e.deltaY * 1.5, behavior: 'smooth' });
  }

  function scrollBy(amount) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: amount, behavior: 'smooth' });
  }

  return (
    <div className={styles.wrapper}>
      {/* Arrow: scroll toward document end (left in RTL) */}
      <button
        className={`${styles.arrow} ${styles.arrowEnd} ${canScrollEnd ? styles.arrowVisible : ''}`}
        onClick={() => scrollBy(-200)}
        aria-hidden="true"
        tabIndex={-1}
      >
        <Icon name="chevronLeft" size={16} />
      </button>

      {/* Fade mask – start edge (right in RTL) */}
      <div className={`${styles.fade} ${styles.fadeStart} ${canScrollStart ? styles.fadeVisible : ''}`} />

      <div
        className={styles.track}
        ref={scrollRef}
        onWheel={handleWheel}
      >
        {categories.map(cat => (
          <button
            key={cat.id}
            data-tabid={cat.id}
            className={`${styles.tab} ${activeId === cat.id ? styles.tabActive : ''}`}
            onClick={() => onChange(cat.id)}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Fade mask – end edge (left in RTL) */}
      <div className={`${styles.fade} ${styles.fadeEnd} ${canScrollEnd ? styles.fadeVisible : ''}`} />

      {/* Arrow: scroll toward document start (right in RTL) */}
      <button
        className={`${styles.arrow} ${styles.arrowStart} ${canScrollStart ? styles.arrowVisible : ''}`}
        onClick={() => scrollBy(200)}
        aria-hidden="true"
        tabIndex={-1}
      >
        <Icon name="chevronRight" size={16} />
      </button>
    </div>
  );
}
