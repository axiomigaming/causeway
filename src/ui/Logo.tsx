import { Stair } from './icons';

/**
 * The CAUSEWAY wordmark, typeset: Archivo at its widest and heaviest, tracked out, with the
 * temple-stair mark set on the cap line. `title` is the hero size, `compact` the top bar;
 * `mark` is the stair alone, for the narrowest phones.
 */
export function Logo({ size = 'title' }: { size?: 'title' | 'compact' | 'mark' }) {
  return (
    <span className={`logo ${size}`}>
      <Stair className="logo-stair" />
      {size !== 'mark' && <span className="logo-word">Causeway</span>}
    </span>
  );
}
