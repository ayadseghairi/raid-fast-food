import React from 'react';
import Icon from './Icon.jsx';
import styles from './Placeholder.module.css';

/** Placeholder screen used for unbuilt features */
export default function Placeholder({ title }) {
  return (
    <div className={styles.wrapper}>
      <Icon name="package" size={48} className={styles.icon} />
      <p className={styles.text}>{title}</p>
      <p className={styles.sub}>قريباً…</p>
    </div>
  );
}
