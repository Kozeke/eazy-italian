import type { SVGProps } from 'react';

/**
 * Static LinguAI mark (+ optional wordmark) — matches AdminHeader (/admin/courses).
 */
export function LinguAiLogo({
  height = 40,
  width,
  showWordmark = true,
  ...rest
}: SVGProps<SVGSVGElement> & { height?: number; showWordmark?: boolean }) {
  const h = height;
  const w = width ?? (showWordmark ? (h * 180) / 40 : h);
  const mark = (
    <>
      <circle cx="20" cy="20" r="17" stroke="#6C6FEF" strokeWidth="1.6" />
      <circle cx="20" cy="20" r="9" stroke="#6C6FEF" strokeWidth="1.1" opacity="0.4" />
      <circle cx="20" cy="20" r="3" fill="#6C6FEF" />
      <circle cx="20" cy="3" r="2" fill="#6C6FEF" opacity="0.55" />
      <circle cx="34.7" cy="11.5" r="2" fill="#6C6FEF" opacity="0.55" />
      <circle cx="34.7" cy="28.5" r="2" fill="#6C6FEF" opacity="0.55" />
    </>
  );
  return (
    <svg
      width={w}
      height={h}
      viewBox={showWordmark ? '0 0 180 40' : '0 0 40 40'}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...rest}
    >
      {mark}
      {showWordmark && (
        <>
          <text
            x="48"
            y="26"
            fontFamily="'Syne', system-ui, sans-serif"
            fontWeight="700"
            fontSize="19"
            fill="#1A1A2E"
            letterSpacing="-0.5"
          >
            Lingu
          </text>
          <text
            x="106"
            y="26"
            fontFamily="'Syne', system-ui, sans-serif"
            fontWeight="700"
            fontSize="19"
            fill="#6C6FEF"
            letterSpacing="-0.5"
          >
            AI
          </text>
        </>
      )}
    </svg>
  );
}
