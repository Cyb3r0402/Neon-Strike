// ============================================================
//  player.js  –  First-person controller (WASD + Pointer Lock)
// ============================================================
const Player = (function () {

    const SPEED        = 8.5;
    const SPRINT_MULT  = 1.55;
    const JUMP_VEL     = 8.5;
    const GRAVITY      = -22;
    const EYE_H        = 1.72;
    const RADIUS       = 0.5;
    const SENS         = 0.0022;
    const PITCH_MAX    = Math.PI * 0.44;
    const MAX_HP       = 100;

    let camera = null;
    let wallList = [];

    // Movement
    const vel  = new THREE.Vector3();
    let yaw    = 0;
    let pitch  = 0;
    let grounded = true;

    // Health
    let hp = MAX_HP;
    let alive = true;
    let kills = 0;

    // Input
    const keys = {};
    let locked = false;
    let touchLookEnabled = false;

    // Camera shake
    let shakeAmt = 0;
    let shakeTime = 0;

    /* ---------- helpers ---------- */
    function collides(pos) {
        for (const w of wallList) {
            if (pos.x + RADIUS > w.minX && pos.x - RADIUS < w.maxX &&
                pos.z + RADIUS > w.minZ && pos.z - RADIUS < w.maxZ) return true;
        }
        return false;
    }

    /* ---------- public ---------- */
    return {
        init(cam, walls) {
            camera  = cam;
            wallList = walls;

            hp      = MAX_HP;
            alive   = true;
            kills   = 0;
            yaw     = 0;
            pitch   = 0;
            shakeAmt = 0;
            vel.set(0, 0, 0);
            grounded = true;
            locked = false;
            touchLookEnabled = false;

            camera.rotation.order = 'YXZ';
            camera.rotation.set(0, 0, 0);
            camera.position.set(0, EYE_H, 5);

            /* Pointer Lock */
            const canvas = document.getElementById('game-canvas');

            document.removeEventListener('keydown', Player._onKey);
            document.removeEventListener('keyup',   Player._onKeyUp);
            document.removeEventListener('mousemove', Player._onMouse);
            document.removeEventListener('pointerlockchange', Player._onLock);

            Player._onKey = e => {
                keys[e.code] = true;
                e.preventDefault();
            };
            Player._onKeyUp = e => { keys[e.code] = false; };
            Player._onMouse = e => {
                if (!locked && !touchLookEnabled) return;
                yaw   -= e.movementX * SENS;
                pitch -= e.movementY * SENS;
                pitch  = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, pitch));
            };
            Player._onLock = () => {
                locked = document.pointerLockElement === canvas;
            };

            document.addEventListener('keydown', Player._onKey, { passive: false });
            document.addEventListener('keyup',   Player._onKeyUp);
            document.addEventListener('mousemove', Player._onMouse);
            document.addEventListener('pointerlockchange', Player._onLock);
        },

        requestLock() {
            if (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0) {
                touchLookEnabled = true;
                return;
            }
            document.getElementById('game-canvas').requestPointerLock();
        },
        releaseLock() {
            if (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0) {
                touchLookEnabled = false;
                return;
            }
            document.exitPointerLock();
        },
        isLocked()     { return locked || touchLookEnabled; },
        isTouchEnabled() { return touchLookEnabled; },
        isAlive()      { return alive; },
        getHP()        { return hp; },
        getMaxHP()     { return MAX_HP; },
        getKills()     { return kills; },
        addKill()      { kills++; },

        takeDamage(dmg) {
            if (!alive) return;
            hp = Math.max(0, hp - dmg);
            shakeAmt = 0.12;
            HUD.flashDamage();
            AudioManager.playerHurt();
            if (hp <= 0) alive = false;
        },

        heal(amount) { hp = Math.min(MAX_HP, hp + amount); },

        keyPressed(code) { return !!keys[code]; },
        setKeyPressed(code, pressed) { keys[code] = pressed; },
        beginTouchLook(x, y) { touchLookEnabled = true; },
        moveTouchLook(x, y) {
            if (!alive || (!locked && !touchLookEnabled)) return;
            if (typeof x !== 'number' || typeof y !== 'number') return;
            const dx = x - (this._lastTouchX || x);
            const dy = y - (this._lastTouchY || y);
            this._lastTouchX = x;
            this._lastTouchY = y;
            yaw   -= dx * SENS * 0.8;
            pitch -= dy * SENS * 0.8;
            pitch  = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, pitch));
        },
        endTouchLook() { this._lastTouchX = 0; this._lastTouchY = 0; },

        update(dt) {
            if (!alive) return false;

            /* ---- rotation ---- */
            camera.rotation.order = 'YXZ';
            camera.rotation.y     = yaw;
            camera.rotation.x     = pitch + (shakeAmt > 0 ? (Math.random()-0.5)*shakeAmt : 0);
            camera.rotation.z     = 0;
            if (shakeAmt > 0) shakeAmt -= dt * 1.8;

            /* ---- movement input ---- */
            const fwd   = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
            const right = new THREE.Vector3( Math.cos(yaw), 0, -Math.sin(yaw));
            const dir   = new THREE.Vector3();

            if (keys['KeyW'] || keys['ArrowUp'])    dir.addScaledVector(fwd,   1);
            if (keys['KeyS'] || keys['ArrowDown'])  dir.addScaledVector(fwd,  -1);
            if (keys['KeyA'] || keys['ArrowLeft'])  dir.addScaledVector(right,-1);
            if (keys['KeyD'] || keys['ArrowRight']) dir.addScaledVector(right, 1);

            const moving = dir.lengthSq() > 0;
            if (moving) dir.normalize();

            const spd = (keys['ShiftLeft'] || keys['ShiftRight'])
                ? SPEED * SPRINT_MULT : SPEED;

            vel.x = dir.x * spd;
            vel.z = dir.z * spd;

            /* ---- jump ---- */
            if (keys['Space'] && grounded) {
                vel.y = JUMP_VEL;
                grounded = false;
            }

            /* ---- gravity ---- */
            if (!grounded) vel.y += GRAVITY * dt;

            /* ---- collision ---- */
            const next = camera.position.clone().addScaledVector(vel, dt);

            // X
            const nx = new THREE.Vector3(next.x, camera.position.y, camera.position.z);
            if (!collides(nx)) camera.position.x = next.x;
            else vel.x = 0;

            // Z
            const nz = new THREE.Vector3(camera.position.x, camera.position.y, next.z);
            if (!collides(nz)) camera.position.z = next.z;
            else vel.z = 0;

            // Y (floor clamp)
            camera.position.y += vel.y * dt;
            if (camera.position.y <= EYE_H) {
                camera.position.y = EYE_H;
                vel.y = 0;
                grounded = true;
            }

            return moving;
        }
    };
})();
