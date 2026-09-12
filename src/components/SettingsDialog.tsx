import { useId } from 'react';
import { useSystemDark } from '../hooks/useSystemDark';
import { resolveTheme, useSettingsStore, type Gap } from '../store/settingsStore';
import { DialogFrame } from './DialogFrame';
import { TIP } from './tips';
import styles from './SettingsDialog.module.css';

interface SettingsDialogProps {
  onClose(): void;
}

const GAPS: readonly { value: Gap; label: string; tip: string }[] = [
  { value: 'small', label: 'Small', tip: TIP.gapSmall },
  { value: 'medium', label: 'Medium', tip: TIP.gapMedium },
  { value: 'large', label: 'Large', tip: TIP.gapLarge },
];

/**
 * The per-device preferences. It only reads and writes the settings store; putting them on
 * the document is useApplySettings' job, mounted once in App.
 */
export function SettingsDialog({ onClose }: SettingsDialogProps) {
  const id = useId();
  const theme = useSettingsStore((s) => s.theme);
  const gap = useSettingsStore((s) => s.gap);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setGap = useSettingsStore((s) => s.setGap);
  const systemDark = useSystemDark();
  // The switch shows the theme actually in force, so 'system' on a dark device reads as on.
  const dark = resolveTheme(theme, systemDark) === 'dark';

  return (
    <DialogFrame heading="Settings" onClose={onClose} className={styles.panel}>
      <section className={styles.section}>
        <div className={styles.switchRow}>
          <span id={`${id}-night`} className={styles.rowLabel}>Night mode</span>
          <button
            type="button"
            role="switch"
            aria-checked={dark}
            aria-labelledby={`${id}-night`}
            title={TIP.nightMode}
            className={styles.switch}
            onClick={() => setTheme(dark ? 'light' : 'dark')}
          >
            <span className={styles.track}><span className={styles.thumb} /></span>
          </button>
        </div>
        {theme === 'system' ? (
          <p className={styles.note}>Following the device setting</p>
        ) : (
          <button
            type="button"
            className={styles.secondary}
            title={TIP.useDevice}
            onClick={() => setTheme('system')}
          >
            Use device setting
          </button>
        )}
      </section>
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Gap between items</legend>
        {GAPS.map((option) => (
          <label key={option.value} className={styles.radioRow}>
            <input
              type="radio"
              className={styles.radio}
              name={`${id}-gap`}
              value={option.value}
              checked={gap === option.value}
              title={option.tip}
              onChange={() => setGap(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
      <button type="button" className={styles.done} title={TIP.done} onClick={onClose} autoFocus>
        Done
      </button>
    </DialogFrame>
  );
}
