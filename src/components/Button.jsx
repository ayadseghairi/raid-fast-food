import React from 'react';
import styles from './Button.module.css';

/**
 * Primary touch-friendly button.
 * variant: 'primary' | 'secondary' | 'danger' | 'ghost'
 * size: 'sm' | 'md' | 'lg'
 */
export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  fullWidth = false,
  onClick,
  type = 'button',
  className = '',
}) {
  return (
    <button
      type={type}
      className={[
        styles.btn,
        styles[variant],
        styles[size],
        fullWidth ? styles.fullWidth : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
