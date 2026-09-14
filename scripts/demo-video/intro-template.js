/**
 * The brand intro — a typed title, a tagline, and the capability badges.
 *
 * Rendered as a real page in the Playwright browser rather than through
 * ffmpeg's drawtext, because a real page gets webfonts and animation for free
 * and does not depend on the ffmpeg build having libfreetype.
 *
 * The title is appended one letter at a time by script rather than revealed by
 * a CSS width animation: steps(n) divides the width into n equal slices, and
 * no proportional font has equal letters, so the edge lands mid-letter and it
 * reads as a wipe with a cursor parked on it. The box is fixed at the finished
 * width with the text left-aligned inside, so only the right edge moves.
 *
 * Note for anyone editing the markup below: it is a template literal, so a
 * backtick anywhere inside it — including in a CSS comment — ends the string.
 */

/** Per badge, so the row is not six grey pills. */
const BADGE_COLORS = {
  'Spend Guard': '#22c55e',
  'Any OpenAI API': '#6366f1',
  'Audit Log': '#06b6d4',
  'Git AI': '#a78bfa',
  'Vision': '#3b82f6',
  'Local models': '#f59e0b',
};

/** How long a keystroke takes. Five a second reads as typing; eleven does not. */
const PER_CHAR = 0.2;
const TYPE_START = 0.35;

/** When the badges begin, relative to the page load. */
const BADGES_AT = 2.45;
const BADGE_STAGGER = 0.07;
const BADGE_FADE = 0.5;

function badgeHtml(name, i) {
  const color = BADGE_COLORS[name] || '#8a93a3';
  const at = (BADGES_AT + i * BADGE_STAGGER).toFixed(2);
  return `<span class="badge" style="color:${color};animation-delay:${at}s">${name}</span>`;
}

/** How long the animation runs, so record.js can wait for it plus the hold. */
function introAnimationSec(intro) {
  const typed = TYPE_START + (intro.title || '').length * PER_CHAR;
  const badges = BADGES_AT + ((intro.badges || []).length - 1) * BADGE_STAGGER + BADGE_FADE;
  return Math.max(typed, badges);
}

function buildIntroHtml(intro) {
  const accent = intro.accentColor || '#6366f1';
  const badges = (intro.badges || []).map(badgeHtml).join('');

  return `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>
  :root { --accent: ${accent}; }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    background:
      radial-gradient(1100px 620px at 50% 38%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 70%),
      #101014;
    color: #e8e8ea;
    font-family: Inter, "Segoe UI", system-ui, sans-serif;
    display: grid; place-items: center;
    overflow: hidden;
  }

  /* A faint grid, so the ground is not flat black behind the card. */
  body::before {
    content: ""; position: fixed; inset: 0;
    background-image:
      linear-gradient(rgba(255,255,255,.028) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,.028) 1px, transparent 1px);
    background-size: 46px 46px;
    mask-image: radial-gradient(760px 440px at 50% 45%, #000 40%, transparent 78%);
  }

  .card { position: relative; text-align: center; }

  .mark {
    width: 74px; height: 74px; margin: 0 auto 26px;
    display: grid; place-items: center;
    border-radius: 20px;
    border: 1px solid color-mix(in srgb, var(--accent) 34%, transparent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--accent);
    opacity: 0; animation: rise .7s ease-out .1s forwards;
  }
  .mark svg { width: 40px; height: 40px; }

  /* Fixed at the finished width, text left-aligned: only the right edge moves. */
  .title-wrap { display: inline-block; text-align: left; }
  .title {
    font-size: 66px; font-weight: 800; letter-spacing: -.028em;
    line-height: 1.05; white-space: pre; margin: 0;
  }
  .cursor {
    display: inline-block; width: 3px; height: .92em; margin-left: 4px;
    background: var(--accent); vertical-align: -.09em;
    animation: blink 1s steps(1) infinite;
  }
  .measure { visibility: hidden; height: 0; overflow: hidden; }

  .tagline {
    margin: 16px 0 0; font-size: 19px; color: #a6a6ad; letter-spacing: -.005em;
    opacity: 0; animation: rise .6s ease-out 2.0s forwards;
  }

  .badges { margin-top: 28px; display: flex; gap: 9px; justify-content: center; flex-wrap: wrap; }
  .badge {
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 11.5px; font-weight: 500; letter-spacing: .04em;
    padding: 6px 12px; border-radius: 999px;
    border: 1px solid currentColor;
    background: color-mix(in srgb, currentColor 10%, transparent);
    opacity: 0; animation: rise ${BADGE_FADE}s ease-out forwards;
  }

  @keyframes rise { from { opacity: 0; transform: translateY(9px); } to { opacity: 1; transform: none; } }
  @keyframes blink { 50% { opacity: 0; } }
</style></head>
<body>
  <div class="card">
    <div class="mark">
      <svg viewBox="0 0 128 128" fill="none" stroke="currentColor" stroke-width="7"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M53 13C44 13 36 16 30 22C22 28 17 38 16 50C10 53 7 59 7 67V77C7 87 14 94 24 95C29 108 43 116 64 116C85 116 99 108 104 95C114 94 121 87 121 77V67C121 59 118 53 112 50C111 38 106 28 98 22C92 16 84 13 75 13H70V22C70 26 67 29 64 29C61 29 58 26 58 22V13Z"/>
        <rect x="27" y="40" width="74" height="43" rx="17"/>
        <circle cx="50" cy="61.5" r="5.5" fill="currentColor" stroke="none"/>
        <circle cx="78" cy="61.5" r="5.5" fill="currentColor" stroke="none"/>
      </svg>
    </div>

    <div class="title-wrap">
      <h1 class="title measure" id="measure">${intro.title}</h1>
      <h1 class="title" id="typed"><span id="text"></span><span class="cursor"></span></h1>
    </div>

    <p class="tagline">${intro.tagline}</p>
    <div class="badges">${badges}</div>
  </div>

<script>
  // The box holds the finished width, so the reveal does not reflow the card.
  const measure = document.getElementById('measure');
  const wrap = document.querySelector('.title-wrap');
  wrap.style.width = measure.getBoundingClientRect().width + 'px';

  const title = ${JSON.stringify(intro.title)};
  const text = document.getElementById('text');
  let i = 0;
  setTimeout(function tick() {
    text.textContent = title.slice(0, ++i);
    if (i < title.length) setTimeout(tick, ${PER_CHAR * 1000});
  }, ${TYPE_START * 1000});
</script>
</body></html>`;
}

module.exports = { buildIntroHtml, introAnimationSec };
