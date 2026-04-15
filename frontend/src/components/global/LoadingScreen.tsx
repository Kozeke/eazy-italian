import React, { useEffect, useState } from 'react';

interface LoadingScreenProps {
  /** When true, the screen fades out and unmounts after the transition */
  isLoading: boolean;
}

/**
 * Full-viewport loading screen shown during app bootstrap / auth resolution.
 * Uses pure CSS animations — no external animation libraries required.
 *
 * Integration example (App.tsx / root layout):
 *
 *   const { loading } = useAuth();
 *   return (
 *     <>
 *       <LoadingScreen isLoading={loading} />
 *       {!loading && <RouterOutlet />}
 *     </>
 *   );
 */
const LoadingScreen: React.FC<LoadingScreenProps> = ({ isLoading }) => {
  // Keep the node in the DOM long enough to play the fade-out (~400 ms)
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => setVisible(false), 420);
      return () => clearTimeout(timer);
    } else {
      setVisible(true);
    }
  }, [isLoading]);

  if (!visible) return null;

  return (
    <>
      {/* ─── inline styles ─────────────────────────────────────────────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700&display=swap');

        /* Wrapper */
        .lngai-loading-screen {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #F7F7FA;
          /* entrance — instant; exit — smooth */
          opacity: 1;
          transition: opacity 380ms cubic-bezier(0.4, 0, 0.2, 1);
          will-change: opacity;
        }
        .lngai-loading-screen.lngai-fade-out {
          opacity: 0;
          pointer-events: none;
        }

        /* ── orbit ring ──────────────────────────────────────────────────
           We rotate a transparent wrapper that contains the three dots.
           The dots themselves counter-rotate so they keep their circular
           shape and opacity rather than spinning in place.               */
        .lngai-orbit-ring {
          transform-origin: 20px 20px; /* SVG centre */
          animation: lngai-orbit 3.6s linear infinite;
        }
        .lngai-dot-counter {
          /* each dot needs to counter-rotate around its own centre */
          transform-box: fill-box;
          transform-origin: center;
          animation: lngai-counter 3.6s linear infinite;
        }

        @keyframes lngai-orbit {
          to { transform: rotate(360deg); }
        }
        @keyframes lngai-counter {
          to { transform: rotate(-360deg); }
        }

        /* Subtle pulsing glow on the outer ring */
        .lngai-outer-ring {
          animation: lngai-ring-pulse 3.6s ease-in-out infinite;
          transform-origin: 20px 20px;
          transform-box: fill-box;
        }
        @keyframes lngai-ring-pulse {
          0%, 100% { opacity: 0.55; }
          50%       { opacity: 1;    }
        }

        /* Wordmark fade-in on mount */
        .lngai-wordmark {
          animation: lngai-wm-enter 0.7s ease both;
        }
        @keyframes lngai-wm-enter {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
      `}</style>

      {/* ─── screen ────────────────────────────────────────────────────── */}
      <div
        className={`lngai-loading-screen${!isLoading ? ' lngai-fade-out' : ''}`}
        role="status"
        aria-label="Loading LinguAI"
        aria-live="polite"
      >
        <svg
          width="240"
          height="64"
          viewBox="0 0 180 48"
          fill="none"
          overflow="visible"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {/* ── mark ─────────────────────────────────────────────────── */}

          {/* Outer ring — subtle pulse */}
          <circle
            className="lngai-outer-ring"
            cx="20" cy="20" r="17"
            stroke="#6C6FEF"
            strokeWidth="1.6"
          />

          {/* Inner ring — static */}
          <circle
            cx="20" cy="20" r="9"
            stroke="#6C6FEF"
            strokeWidth="1.1"
            opacity="0.4"
          />

          {/* Centre dot — static */}
          <circle cx="20" cy="20" r="3" fill="#6C6FEF" />

          {/* ── orbiting dots (wrapped in a rotating group) ─────────── */}
          <g className="lngai-orbit-ring">
            {/* top */}
            <circle
              className="lngai-dot-counter"
              cx="20" cy="3" r="2"
              fill="#6C6FEF"
              opacity="0.75"
            />
            {/* bottom-right */}
            <circle
              className="lngai-dot-counter"
              cx="34.7" cy="11.5" r="2"
              fill="#6C6FEF"
              opacity="0.75"
            />
            {/* bottom-left */}
            <circle
              className="lngai-dot-counter"
              cx="34.7" cy="28.5" r="2"
              fill="#6C6FEF"
              opacity="0.75"
            />
          </g>

          {/* ── wordmark ─────────────────────────────────────────────── */}
          <g className="lngai-wordmark">
            <text
              x="48"
              y="27"
              dominantBaseline="alphabetic"
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
              y="27"
              dominantBaseline="alphabetic"
              fontFamily="'Syne', system-ui, sans-serif"
              fontWeight="700"
              fontSize="19"
              fill="#6C6FEF"
              letterSpacing="-0.5"
            >
              AI
            </text>
          </g>
        </svg>

        {/* Screen-reader-only live text */}
        <span
          style={{
            position: 'absolute',
            width: 1, height: 1,
            padding: 0, margin: -1,
            overflow: 'hidden',
            clip: 'rect(0,0,0,0)',
            whiteSpace: 'nowrap',
            border: 0,
          }}
        >
          Loading…
        </span>
      </div>
    </>
  );
};

export default LoadingScreen;