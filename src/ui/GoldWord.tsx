/**
 * Cast-gold lettering for the hero plates (RUN, CASH OUT, ENTER), as on the reference's "AZTEC":
 * three copies of one live string, stacked: a dark bronze edge (thick stroke, dropped a few
 * pixels for the cast depth and the shadow), the gold face (yellow-white top, deep orange-amber
 * body, a carved notch across the middle), and a lit bevel along the top. Only the face is read
 * by assistive tech; the copies are decoration.
 */
export function GoldWord({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={`gw ${className}`}>
      <span className="gw-edge" aria-hidden>
        {text}
      </span>
      <span className="gw-face">{text}</span>
      <span className="gw-hi" aria-hidden>
        {text}
      </span>
    </span>
  );
}
