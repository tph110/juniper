// GP Sim portrait: a code-drawn SVG patient that feels alive.
// - Breathing: gentle CSS translate loop on the body group
// - Blinking: randomised eyelid closures
// - Speaking: mouth opening driven by live audio amplitude (setMouth 0..1)
// - Expressions: neutral / worried / pain / relieved via brow, lip and eyelid morphs
//
// Drawn with gradient shading rather than flat fills: skin, hair and clothing
// each carry a light source from the upper left, eyes have iris/pupil/catchlight
// and a lash line, and the cheeks and nose shadow are softly blurred. Anchor
// points (brow pivots at y=92, mouth centred on 120,148) are kept stable so the
// expression morphs below line up with the artwork.

const EXPRESSIONS = {
    neutral: {
        browL: 'rotate(0 88 92)', browR: 'rotate(0 152 92)', browY: 0,
        mouthClosed: 'M 105.5 147 Q 120 150.5 134.5 147',
        lips: 'M 104 147 Q 112 142 120 142.8 Q 128 142 136 147 Q 128 154.5 120 154.5 Q 112 154.5 104 147 Z',
        lidY: 0,
    },
    worried: {
        browL: 'rotate(13 88 92)', browR: 'rotate(-13 152 92)', browY: -3,
        mouthClosed: 'M 105 151 Q 120 147 135 151',
        lips: 'M 105 149.5 Q 112.5 145.5 120 145.5 Q 127.5 145.5 135 149.5 Q 127.5 154 120 154.3 Q 112.5 154 105 149.5 Z',
        lidY: 0.8,
    },
    pain: {
        browL: 'rotate(19 88 92)', browR: 'rotate(-19 152 92)', browY: -5,
        mouthClosed: 'M 105 152 Q 120 145.5 135 152',
        lips: 'M 106 151 Q 113 144.8 120 144.5 Q 127 144.8 134 151 Q 127 153.8 120 153.8 Q 113 153.8 106 151 Z',
        lidY: 2.2,
    },
    relieved: {
        browL: 'rotate(-4 88 92)', browR: 'rotate(4 152 92)', browY: 1,
        mouthClosed: 'M 103 146 Q 120 156.5 137 146',
        lips: 'M 103 145.5 Q 112 142 120 142.8 Q 128 142 137 145.5 Q 128 156 120 156 Q 112 156 103 145.5 Z',
        lidY: -0.5,
    },
};

const SVG = `
<svg viewBox="0 0 240 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Margaret Hughes, patient">
  <defs>
    <clipPath id="jp-frame"><rect x="0" y="0" width="240" height="260" rx="17"/></clipPath>

    <radialGradient id="jp-bg" cx="0.34" cy="0.26" r="0.95">
      <stop offset="0%" stop-color="#f4f2f9"/>
      <stop offset="55%" stop-color="#e7e2f1"/>
      <stop offset="100%" stop-color="#d5cde6"/>
    </radialGradient>

    <linearGradient id="jp-skin" x1="0.2" y1="0" x2="0.85" y2="1">
      <stop offset="0%" stop-color="#f7d3b2"/>
      <stop offset="45%" stop-color="#efc6a1"/>
      <stop offset="100%" stop-color="#dda87f"/>
    </linearGradient>

    <linearGradient id="jp-skin-dark" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0%" stop-color="#e0aa82"/>
      <stop offset="100%" stop-color="#c9906a"/>
    </linearGradient>

    <linearGradient id="jp-hair" x1="0.15" y1="0" x2="0.9" y2="1">
      <stop offset="0%" stop-color="#ded7d0"/>
      <stop offset="45%" stop-color="#c3b9b0"/>
      <stop offset="100%" stop-color="#9c9089"/>
    </linearGradient>

    <linearGradient id="jp-hair-back" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0%" stop-color="#b3a9a1"/>
      <stop offset="100%" stop-color="#867b74"/>
    </linearGradient>

    <linearGradient id="jp-cardigan" x1="0.15" y1="0" x2="0.9" y2="1">
      <stop offset="0%" stop-color="#a294bb"/>
      <stop offset="55%" stop-color="#84759f"/>
      <stop offset="100%" stop-color="#5f5279"/>
    </linearGradient>

    <radialGradient id="jp-iris" cx="0.42" cy="0.36" r="0.72">
      <stop offset="0%" stop-color="#8fa08c"/>
      <stop offset="55%" stop-color="#63765f"/>
      <stop offset="100%" stop-color="#3c4a3a"/>
    </radialGradient>

    <linearGradient id="jp-sclera" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ece2da"/>
      <stop offset="40%" stop-color="#fdfaf7"/>
      <stop offset="100%" stop-color="#f3ece6"/>
    </linearGradient>

    <linearGradient id="jp-lips" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#cf9a91"/>
      <stop offset="55%" stop-color="#c2867d"/>
      <stop offset="100%" stop-color="#b0736a"/>
    </linearGradient>

    <filter id="jp-soft" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="3.4"/>
    </filter>
    <filter id="jp-soft-sm" x="-70%" y="-70%" width="240%" height="240%">
      <feGaussianBlur stdDeviation="1.7"/>
    </filter>
    <filter id="jp-drop" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#3b2d55" flood-opacity="0.22"/>
    </filter>
  </defs>

  <g clip-path="url(#jp-frame)">
    <rect width="240" height="260" fill="url(#jp-bg)"/>
    <circle cx="196" cy="46" r="74" fill="#ffffff" opacity="0.34"/>
    <ellipse cx="120" cy="252" rx="120" ry="52" fill="#b9aed2" opacity="0.28"/>

    <g id="jp-body" class="jp-breathe">
      <!-- neck first, so the cardigan hides its base (no hard edge) -->
      <path d="M 106 150 L 106 198 Q 120 206 134 198 L 134 150 Z" fill="url(#jp-skin-dark)"/>
      <path d="M 106 157 Q 120 177 134 157 L 134 148 L 106 148 Z" fill="#000000" opacity="0.14"/>

      <!-- shoulders / cardigan -->
      <g filter="url(#jp-drop)">
        <path d="M 38 260 Q 42 195 88 182 L 152 182 Q 198 195 202 260 Z" fill="url(#jp-cardigan)"/>
      </g>
      <!-- cardigan fold shading + collar -->
      <path d="M 38 260 Q 42 195 88 182 L 96 186 Q 58 200 54 260 Z" fill="#ffffff" opacity="0.10"/>
      <path d="M 202 260 Q 198 195 152 182 L 144 186 Q 182 200 186 260 Z" fill="#000000" opacity="0.10"/>
      <path d="M 104 183 L 120 210 L 136 183 Q 120 193 104 183 Z" fill="#f3eee6"/>
      <path d="M 104 183 L 120 210 L 136 183 Q 120 193 104 183 Z" fill="#000000" opacity="0.05"/>

      <g id="jp-head" class="jp-sway">
        <!-- hair, back mass -->
        <path d="M 61 96 Q 56 33 120 29 Q 184 33 179 96 L 177 134 Q 184 150 172 154 L 170 106 L 70 106 L 68 154 Q 56 150 63 134 Z" fill="url(#jp-hair-back)"/>

        <!-- ears, drawn before the face so they tuck behind the jaw -->
        <ellipse cx="73" cy="118" rx="6.5" ry="10" fill="url(#jp-skin-dark)"/>
        <ellipse cx="167" cy="118" rx="6.5" ry="10" fill="url(#jp-skin-dark)"/>
        <ellipse cx="73" cy="118" rx="6.5" ry="10" fill="#a8714f" opacity="0.25"/>
        <ellipse cx="167" cy="118" rx="6.5" ry="10" fill="#a8714f" opacity="0.25"/>

        <!-- face -->
        <path d="M 70 92 Q 70 51 120 49 Q 170 51 170 92 L 168 122 Q 164 152 138 160 Q 120 165.5 102 160 Q 76 152 72 122 Z" fill="url(#jp-skin)"/>
        <!-- temple + jaw shading (blurred so no hard band shows on the cheek) -->
        <path d="M 70 92 Q 70 51 120 49 L 120 56 Q 78 59 76 94 Z" fill="#ffffff" opacity="0.18" filter="url(#jp-soft)"/>
        <path d="M 167 106 Q 165 145 139 158 Q 151 145 157 106 Z" fill="#c9906a" opacity="0.32" filter="url(#jp-soft)"/>

        <!-- forehead shadow cast by the hairline (under the hair, on the skin) -->
        <path d="M 76 74 Q 120 66 164 74 Q 120 83 76 82 Z" fill="#c9906a" opacity="0.26" filter="url(#jp-soft)"/>

        <!-- hair, front sweep -->
        <path d="M 63 101 Q 58 34 120 31 Q 182 34 177 101 Q 174 76 150 68 Q 147 61 137 59 Q 126 70 96 68 Q 73 72 67 101 Q 65 101 63 101 Z" fill="url(#jp-hair)"/>
        <!-- strand highlights -->
        <path d="M 82 76 Q 94 60 116 57 Q 98 64 88 80 Z" fill="#ffffff" opacity="0.2"/>
        <path d="M 153 70 Q 167 80 172 96 Q 165 81 149 73 Z" fill="#ffffff" opacity="0.16"/>
        <path d="M 67 101 Q 73 72 96 68 Q 89 79 87 92 Q 75 94 67 101 Z" fill="#8e837c" opacity="0.3"/>
        <path d="M 128 36 Q 150 42 164 60 Q 148 46 126 41 Z" fill="#8e837c" opacity="0.22"/>

        <!-- cheeks -->
        <ellipse cx="90" cy="129" rx="11" ry="6" fill="#e08e77" opacity="0.35" filter="url(#jp-soft)"/>
        <ellipse cx="150" cy="129" rx="11" ry="6" fill="#e08e77" opacity="0.35" filter="url(#jp-soft)"/>

        <!-- brows: tapered filled shapes rather than flat strokes -->
        <g id="jp-brow-group">
          <path id="jp-brow-l" d="M 75 93.5 Q 87 86.5 101 90.5 Q 100 92.8 99 93 Q 87 89.8 76.5 95.4 Z" fill="#9c8a7d"/>
          <path id="jp-brow-r" d="M 165 93.5 Q 153 86.5 139 90.5 Q 140 92.8 141 93 Q 153 89.8 163.5 95.4 Z" fill="#9c8a7d"/>
        </g>

        <!-- eyes -->
        <g class="jp-eye" transform="translate(88 106)">
          <ellipse rx="9.6" ry="6" fill="url(#jp-sclera)"/>
          <g class="jp-eyeball">
            <circle r="4.5" fill="url(#jp-iris)"/>
            <circle r="2" fill="#241c14"/>
            <circle cx="-1.7" cy="-1.9" r="1.35" fill="#ffffff" opacity="0.92"/>
            <circle cx="1.6" cy="1.8" r="0.7" fill="#ffffff" opacity="0.35"/>
          </g>
          <path d="M -9.6 -1.4 Q 0 -8.2 9.6 -1.4" fill="none" stroke="#000000" stroke-width="2.6" opacity="0.1" filter="url(#jp-soft-sm)"/>
          <path d="M -9.6 -1.2 Q 0 -7.6 9.6 -1.2" fill="none" stroke="#5f4a3b" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M -8.4 3.6 Q 0 6.4 8.4 3.6" fill="none" stroke="#c48f6a" stroke-width="1" opacity="0.75"/>
          <rect class="jp-lid" x="-10.6" y="-8" width="21.2" height="15" rx="6" fill="#eec19d"/>
        </g>
        <g class="jp-eye" transform="translate(152 106)">
          <ellipse rx="9.6" ry="6" fill="url(#jp-sclera)"/>
          <g class="jp-eyeball">
            <circle r="4.5" fill="url(#jp-iris)"/>
            <circle r="2" fill="#241c14"/>
            <circle cx="-1.7" cy="-1.9" r="1.35" fill="#ffffff" opacity="0.92"/>
            <circle cx="1.6" cy="1.8" r="0.7" fill="#ffffff" opacity="0.35"/>
          </g>
          <path d="M -9.6 -1.4 Q 0 -8.2 9.6 -1.4" fill="none" stroke="#000000" stroke-width="2.6" opacity="0.1" filter="url(#jp-soft-sm)"/>
          <path d="M -9.6 -1.2 Q 0 -7.6 9.6 -1.2" fill="none" stroke="#5f4a3b" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M -8.4 3.6 Q 0 6.4 8.4 3.6" fill="none" stroke="#c48f6a" stroke-width="1" opacity="0.75"/>
          <rect class="jp-lid" x="-10.6" y="-8" width="21.2" height="15" rx="6" fill="#eec19d"/>
        </g>

        <!-- fine lines at the outer canthus -->
        <path d="M 73.5 103 Q 70 106.5 73.5 110" fill="none" stroke="#c9906a" stroke-width="1.1" opacity="0.55"/>
        <path d="M 166.5 103 Q 170 106.5 166.5 110" fill="none" stroke="#c9906a" stroke-width="1.1" opacity="0.55"/>

        <!-- nose: soft shadow mass, not an outline -->
        <path d="M 116 108 Q 112 124 109 130 Q 114 135 122 133 Q 118 128 119 108 Z" fill="#c9906a" opacity="0.34" filter="url(#jp-soft-sm)"/>
        <path d="M 110.5 130.5 Q 114.5 133.5 121 132" fill="none" stroke="#b9805c" stroke-width="1.3" stroke-linecap="round" opacity="0.75"/>
        <ellipse cx="112" cy="130.8" rx="1.5" ry="1" fill="#a8714f" opacity="0.55"/>
        <ellipse cx="124" cy="130.4" rx="1.5" ry="1" fill="#a8714f" opacity="0.4"/>
        <!-- philtrum -->
        <path d="M 118 134 Q 117.6 138 118 141" fill="none" stroke="#c9906a" stroke-width="1" opacity="0.4"/>

        <!-- mouth -->
        <g id="jp-mouth">
          <path id="jp-lips" d="M 104 147 Q 112 142 120 142.8 Q 128 142 136 147 Q 128 154.5 120 154.5 Q 112 154.5 104 147 Z" fill="url(#jp-lips)"/>
          <ellipse id="jp-mouth-open" cx="120" cy="148.8" rx="8" ry="1" fill="#7d443a" opacity="0"/>
          <path id="jp-mouth-closed" d="M 105.5 147 Q 120 150.5 134.5 147" fill="none" stroke="#9c6055" stroke-width="1.3" stroke-linecap="round" opacity="0.85"/>
        </g>

        <!-- nasolabial + chin shading -->
        <path d="M 100 141 Q 97 147 100 152" fill="none" stroke="#c9906a" stroke-width="1.3" opacity="0.26"/>
        <path d="M 140 141 Q 143 147 140 152" fill="none" stroke="#c9906a" stroke-width="1.3" opacity="0.26"/>
        <ellipse cx="120" cy="162" rx="11" ry="4.5" fill="#c9906a" opacity="0.18" filter="url(#jp-soft)"/>
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
    const lips = svg.querySelector('#jp-lips');
    const lids = svg.querySelectorAll('.jp-lid');
    const eyeballs = svg.querySelectorAll('.jp-eyeball');

    let currentMouth = 0; // smoothed 0..1
    let restingLidY = 0;  // expression-driven lid droop

    // --- blinking ---------------------------------------------------------
    lids.forEach((lid) => {
        lid.style.transformOrigin = 'center -8px';
        lid.style.transform = 'scaleY(0)';
    });
    function setLids(scale) {
        lids.forEach((lid) => { lid.style.transform = `scaleY(${scale})`; });
    }
    function blink() {
        lids.forEach((lid) => { lid.style.transition = 'transform 70ms'; });
        setLids(1);
        setTimeout(() => setLids(restingLidY), 110);
        setTimeout(blink, 2400 + Math.random() * 3200);
    }
    setTimeout(blink, 1200);

    // --- occasional gaze shift -------------------------------------------
    function gaze() {
        const dx = (Math.random() - 0.5) * 3.2;
        const dy = (Math.random() - 0.5) * 1.4;
        eyeballs.forEach((g) => {
            g.style.transition = 'transform 320ms ease';
            g.style.transform = `translate(${dx}px, ${dy}px)`;
        });
        setTimeout(() => eyeballs.forEach((g) => { g.style.transform = 'translate(0,0)'; }), 900 + Math.random() * 1200);
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
            lips.style.transition = 'd 450ms ease';
            lips.setAttribute('d', ex.lips);
            // Tension around the eyes carries as much expression as the brows.
            restingLidY = Math.max(0, (ex.lidY || 0) / 8);
            lids.forEach((lid) => { lid.style.transition = 'transform 450ms ease'; });
            setLids(restingLidY);
        },

        // amp: 0..1 live audio amplitude. Smoothed here so the mouth doesn't flicker.
        setMouth(amp) {
            currentMouth += (amp - currentMouth) * 0.45;
            const open = Math.min(1, currentMouth * 1.6);
            if (open > 0.06) {
                mouthOpen.setAttribute('ry', (1 + open * 5.6).toFixed(2));
                mouthOpen.setAttribute('rx', (7.5 + open * 2.2).toFixed(2));
                mouthOpen.style.opacity = '1';
                mouthClosed.style.opacity = '0';
            } else {
                mouthOpen.style.opacity = '0';
                mouthClosed.style.opacity = '0.85';
            }
        },

        stopSpeaking() {
            currentMouth = 0;
            mouthOpen.style.opacity = '0';
            mouthClosed.style.opacity = '0.85';
        },
    };
}
