import type { AnalysisStatus } from '../lib/types';
import styles from './StatusBadge.module.css';

const LABEL: Record<AnalysisStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
};

export function StatusBadge({ status }: { status: AnalysisStatus }) {
  return <span className={`${styles.badge} ${styles[status]}`}>{LABEL[status]}</span>;
}
