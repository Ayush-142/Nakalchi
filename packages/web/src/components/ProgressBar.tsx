import styles from './ProgressBar.module.css';

export function ProgressBar({ progress }: { progress: number }) {
  const clamped = Math.min(100, Math.max(0, progress));
  return (
    <div className={styles.track} role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
      <div className={styles.fill} style={{ width: `${clamped}%` }} />
      <span className={styles.label}>{clamped}%</span>
    </div>
  );
}
