// ============================================================
//  audio.js  –  Procedural sound via Web Audio API
//  No external files needed; all sounds synthesised in code.
// ============================================================
const AudioManager = (function () {
    let ctx = null;

    /* ---------- helpers ---------- */
    function noise(duration, gainVal, filterFreq, filterType) {
        if (!ctx) return;
        const len = Math.floor(ctx.sampleRate * duration);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.8);
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;

        const gain = ctx.createGain();
        gain.gain.value = gainVal;

        if (filterFreq) {
            const f = ctx.createBiquadFilter();
            f.type = filterType || 'lowpass';
            f.frequency.value = filterFreq;
            src.connect(f);
            f.connect(gain);
        } else {
            src.connect(gain);
        }
        gain.connect(ctx.destination);
        src.start();
    }

    function osc(type, freqStart, freqEnd, duration, gainVal, startTime) {
        if (!ctx) return;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const t = startTime != null ? startTime : ctx.currentTime;
        o.type = type;
        o.connect(g);
        g.connect(ctx.destination);
        o.frequency.setValueAtTime(freqStart, t);
        if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);
        g.gain.setValueAtTime(gainVal, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
        o.start(t);
        o.stop(t + duration);
    }

    return {
        init() {
            try {
                ctx = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) { console.warn('Web Audio unavailable'); }
        },

        resume() {
            if (ctx && ctx.state === 'suspended') ctx.resume();
        },

        // --- gunshots ---
        gunshot(type) {
            if (type === 'shotgun') {
                noise(0.28, 2.2, 500);
                noise(0.10, 1.0, 1800, 'highpass');
            } else {
                noise(0.13, 1.1);
                osc('square', 220, 60, 0.09, 0.15);
            }
        },

        // --- enemy / player hits ---
        enemyHit()    { osc('square', 350, 120, 0.07, 0.25); },
        playerHurt()  { osc('sawtooth', 180, 70, 0.28, 0.3); },
        enemyDeath()  { noise(0.32, 0.9, 220); osc('sine', 100, 40, 0.2, 0.2); },
        pickup()      { osc('sine', 660, 1100, 0.18, 0.2); },
        emptyGun()    { osc('square', 80, 80, 0.06, 0.3); },
        reload()      { osc('triangle', 120, 280, 0.14, 0.35); setTimeout(() => osc('triangle', 280, 120, 0.14, 0.25), 200); },

        waveComplete() {
            if (!ctx) return;
            [523, 659, 784, 1047].forEach((freq, i) => {
                osc('sine', freq, null, 0.35, 0.22, ctx.currentTime + i * 0.18);
            });
        }
    };
})();
