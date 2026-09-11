import type { CSSProperties } from 'react';
import { COLOR_NAMES, PALETTE, type ColorName } from '../lib/colors';
import styles from './ColorPicker.module.css';

interface Props {
  value: ColorName;
  onChange: (c: ColorName) => void;
  idPrefix: string;
}

export function ColorPicker({ value, onChange, idPrefix }: Props) {
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>Colour</legend>
      <div className={styles.swatches}>
        {COLOR_NAMES.map((name) => (
          <label key={name} className={styles.swatch} style={{ '--swatch': PALETTE[name].hex } as CSSProperties}>
            <input
              type="radio"
              name={`${idPrefix}-color`}
              value={name}
              checked={value === name}
              onChange={() => onChange(name)}
              aria-label={PALETTE[name].label}
              title={PALETTE[name].label}
            />
            <span className={styles.dot} />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
