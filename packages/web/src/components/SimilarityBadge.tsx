import styles from './SimilarityBadge.module.css';

export function SimilarityBadge({ label, value, flagged }: { label: string; value: number; flagged?: boolean }) {
  const pct = Math.round(value * 100);
  return (
    <span className={`${styles.badge} ${flagged ? styles.flagged : ''}`}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{pct}%</span>
    </span>
  );
}
