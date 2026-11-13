import React from 'react';
import styles from './CategoryTabs.module.css';

/**
 * Wrapping category tab bar.
 *
 * Props:
 *   categories  – [{ id, name }]
 *   activeId    – id of active category
 *   onChange    – (id) => void
 *
 * Layout:
 *   - Tabs wrap to the next line when the row is full (flex-wrap: wrap)
 *   - No horizontal scroll, no arrow buttons, no fade masks
 *   - Active tab highlighted; touch targets ≥ 44 px height
 *   - Used on both POS and Products screens
 */
export default function CategoryTabs({ categories = [], activeId, onChange }) {
  return (
    <div className={styles.wrapper}>
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
  );
}
