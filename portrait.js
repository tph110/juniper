// Juniper portrait: a stylised, code-drawn SVG patient that feels alive.
// - Breathing: gentle CSS translate loop on the body group
// - Blinking: randomised eyelid closures
// - Speaking: mouth opening driven by live audio amplitude (setMouth 0..1)
// - Expressions: neutral / worried / pain / relieved via brow + mouth morphs

const EXPRESSIONS = {
    neutral: {
        browL: 'rotate(0 88 92)', browR: 'rotate(0 152 92)', browY: 0,
        mouthClosed: 'M 100 148 Q 120 154 140 148',
    },
    worried: {
        browL: 'rotate(14 88 92)', browR: 'rotate(-14 152 92)', browY: -3,
        mouthClosed: 'M 100 152 Q 120 147 140 152',
    },
    pain: {
        browL: 'rotate(20 88 92)', browR: 'rotate(-20 152 92)', browY: -5,
        mouthClosed: 'M 100 153 Q 120 145 140 153',
    },
    relieved: {
        browL: 'rotate(-4 88 92)', browR: 'rotate(4 152 92)', browY: 1,
        mouthClosed: 'M 98 146 Q 120 158 142 146',
    },
};

const SVG = `
<svg viewBox="0 0 240 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Margaret Hughes, patient">
  <defs>
    <clipPath id="jp-frame"><rect x="0" y="0" width="240" height="260" rx="16"/></clipPath>
  </defs>
  <g clip-path="url(#jp-frame)">
    <rect width="240" height="260" fill="#e8eef0"/>
    <circle cx="200" cy="40" r="70" fill="#dde7e2" opacity="0.6"/>
    <circle cx="30" cy="220" r="90" fill="#dde7e2" opacity="0.45"/>

    <g id="jp-body" class="jp-breathe">
      <!-- shoulders / cardigan -->
      <path d="M 40 260 Q 44 196 88 184 L 152 184 Q 196 196 200 260 Z" fill="#7d9b8a"/>
      <path d="M 106 184 L 120 210 L 134 184 Q 120 196 106 184 Z" fill="#f2ede4"/>
      <!-- neck -->
      <path d="M 104 158 L 104 190 Q 120 200 136 190 L 136 158 Z" fill="#e8b48f"/>
      <path d="M 104 162 Q 120 176 136 162 L 136 158 L 104 158 Z" fill="#d69f7c"/>

      <g id="jp-head" class="jp-sway">
        <!-- hair back -->
        <path d="M 62 96 Q 58 34 120 30 Q 182 34 178 96 L 176 132 Q 182 148 172 152 L 170 108 L 70 108 L 68 152 Q 58 148 64 132 Z" fill="#b7aca4"/>
        <!-- face -->
        <path d="M 70 92 Q 70 52 120 50 Q 170 52 170 92 L 168 122 Q 164 152 138 160 Q 120 165 102 160 Q 76 152 72 122 Z" fill="#efc19c"/>
        <!-- ears -->
        <ellipse cx="69" cy="112" rx="7" ry="11" fill="#e8b48f"/>
        <ellipse cx="171" cy="112" rx="7" ry="11" fill="#e8b48f"/>
        <!-- hair front -->
        <path d="M 64 100 Q 60 36 120 32 Q 180 36 176 100 Q 172 74 150 66 Q 148 58 138 56 Q 128 66 96 64 Q 74 68 68 100 Q 65 100 64 100 Z" fill="#c4bab2"/>
        <path d="M 68 100 Q 74 68 96 64 Q 90 76 88 88 Q 76 90 68 100 Z" fill="#b7aca4"/>

        <!-- brows -->
        <g id="jp-brow-group">
          <path id="jp-brow-l" d="M 74 92 Q 88 86 100 91" stroke="#8d7f75" stroke-width="4" fill="none" stroke-linecap="round"/>
          <path id="jp-brow-r" d="M 140 91 Q 152 86 166 92" stroke="#8d7f75" stroke-width="4" fill="none" stroke-linecap="round"/>
        </g>

        <!-- eyes -->
        <g class="jp-eye" transform="translate(88 106)">
          <ellipse rx="10" ry="6.5" fill="#fdfaf6"/>
          <circle id="jp-pupil-l" r="3.6" fill="#4a3f38"/>
          <rect class="jp-lid" x="-11" y="-8" width="22" height="16" rx="7" fill="#efc19c"/>
        </g>
        <g class="jp-eye" transform="translate(152 106)">
          <ellipse rx="10" ry="6.5" fill="#fdfaf6"/>
          <circle id="jp-pupil-r" r="3.6" fill="#4a3f38"/>
          <rect class="jp-lid" x="-11" y="-8" width="22" height="16" rx="7" fill="#efc19c"/>
        </g>

        <!-- crow's feet + cheeks -->
        <path d="M 72 104 Q 69 107 72 110" stroke="#d69f7c" stroke-width="1.5" fill="none"/>
        <path d="M 168 104 Q 171 107 168 110" stroke="#d69f7c" stroke-width="1.5" fill="none"/>
        <ellipse cx="90" cy="128" rx="9" ry="5" fill="#e7a887" opacity="0.5"/>
        <ellipse cx="150" cy="128" rx="9" ry="5" fill="#e7a887" opacity="0.5"/>

        <!-- nose -->
        <path d="M 118 112 Q 115 126 112 130 Q 116 134 122 132" stroke="#d69f7c" stroke-width="2.5" fill="none" stroke-linecap="round"/>

        <!-- mouth: closed line morphs per expression; ellipse opens with audio -->
        <g id="jp-mouth">
          <path id="jp-mouth-closed" d="M 100 148 Q 120 154 140 148" stroke="#a96a58" stroke-width="3.5" fill="none" stroke-linecap="round"/>
          <ellipse id="jp-mouth-open" cx="120" cy="150" rx="11" ry="1" fill="#7c4437" opacity="0"/>
        </g>

        <!-- smile lines -->
        <path d="M 96 142 Q 93 148 96 153" stroke="#d69f7c" stroke-width="1.5" fill="none" opacity="0.7"/>
        <path d="M 144 142 Q 147 148 144 153" stroke="#d69f7c" stroke-width="1.5" fill="none" opacity="0.7"/>
      </g>
    </g>
  </g>
</svg>`;

export function createPortrait(container) {
    container.innerHTML = SVG;
    const svg = container.querySelector('svg');
    const browL = svg.querySelector('#jp-brow-l');
    const browR = svg.querySelector('#jp-brow-r');
    const browGroup = svg.querySelector('#jp-brow-group');
    const mouthClosed = svg.querySelector('#jp-mouth-closed');
    const mouthOpen = svg.querySelector('#jp-mouth-open');
    const lids = svg.querySelectorAll('.jp-lid');

    let currentMouth = 0; // smoothed 0..1

    // --- blinking ---------------------------------------------------------
    lids.forEach((lid) => { lid.style.transform = 'scaleY(0)'; lid.style.transformOrigin = 'center -8px'; });
    function blink() {
        lids.forEach((lid) => { lid.style.transition = 'transform 70ms'; lid.style.transform = 'scaleY(1)'; });
        setTimeout(() => lids.forEach((lid) => { lid.style.transform = 'scaleY(0)'; }), 110);
        setTimeout(blink, 2400 + Math.random() * 3200);
    }
    setTimeout(blink, 1200);

    // --- occasional gaze shift -------------------------------------------
    const pupils = svg.querySelectorAll('#jp-pupil-l, #jp-pupil-r');
    function gaze() {
        const dx = (Math.random() - 0.5) * 3.5;
        pupils.forEach((p) => { p.style.transition = 'transform 300ms'; p.style.transform = `translate(${dx}px, 0)`; });
        setTimeout(() => pupils.forEach((p) => { p.style.transform = 'translate(0,0)'; }), 900 + Math.random() * 1200);
        setTimeout(gaze, 3800 + Math.random() * 4200);
    }
    setTimeout(gaze, 2600);

    return {
        setExpression(name) {
            const ex = EXPRESSIONS[name] || EXPRESSIONS.neutral;
            [browL, browR].forEach((b) => { b.style.transition = 'transform 450ms ease'; });
            browL.setAttribute('transform', ex.browL);
            browR.setAttribute('transform', ex.browR);
            browGroup.style.transition = 'transform 450ms ease';
            browGroup.style.transform = `translateY(${ex.browY}px)`;
            mouthClosed.setAttribute('d', ex.mouthClosed);
        },

        // amp: 0..1 live audio amplitude. Smoothed here so the mouth doesn't flicker.
        setMouth(amp) {
            currentMouth += (amp - currentMouth) * 0.45;
            const open = Math.min(1, currentMouth * 1.6);
            if (open > 0.06) {
                mouthOpen.setAttribute('ry', (1 + open * 7.5).toFixed(2));
                mouthOpen.setAttribute('rx', (9 + open * 3).toFixed(2));
                mouthOpen.style.opacity = '1';
                mouthClosed.style.opacity = '0';
            } else {
                mouthOpen.style.opacity = '0';
                mouthClosed.style.opacity = '1';
            }
        },

        stopSpeaking() {
            currentMouth = 0;
            mouthOpen.style.opacity = '0';
            mouthClosed.style.opacity = '1';
        },
    };
}
