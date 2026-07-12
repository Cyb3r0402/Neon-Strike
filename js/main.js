// ============================================================
//  main.js  –  Game loop, state machine, scene setup
// ============================================================
(function () {

    /* ========== Three.js Core ========== */
    let scene, renderer, camera, composer;
    const clock = { last: 0 };

    /* ========== Game State ========== */
    const STATE = { MENU: 0, PLAYING: 1, WAVE_COMPLETE: 2, GAME_OVER: 3, PAUSED: 4 };
    let state = STATE.MENU;

    let waveNum   = 0;
    let score     = 0;
    let waveTimer = 0;     // countdown before next wave

    let raycaster;
    let pickups = [];
    let touchLookActive = false;
    let touchLookLast = null;

    /* ========== Init ========== */
    function init() {
        /* --- Scene --- */
        scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x000a14, 0.022);
        scene.background = new THREE.Color(0x000a14);

        /* --- Camera --- */
        camera = new THREE.PerspectiveCamera(
            72, window.innerWidth / window.innerHeight, 0.05, 180
        );
        scene.add(camera);   // gun mesh is child of camera

        /* --- Renderer --- */
        const canvas = document.getElementById('game-canvas');
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type   = THREE.PCFSoftShadowMap;
        renderer.outputEncoding   = THREE.sRGBEncoding;
        renderer.toneMapping      = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.1;

        /* --- Lighting --- */
        scene.add(new THREE.AmbientLight(0x08101e, 0.8));

        const sun = new THREE.DirectionalLight(0x2244aa, 0.4);
        sun.position.set(10, 20, 10);
        sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
        scene.add(sun);

        /* --- Post-processing (bloom) --- */
        composer = new THREE.EffectComposer(renderer);
        composer.addPass(new THREE.RenderPass(scene, camera));

        const bloom = new THREE.UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.90,   // strength
            0.30,   // radius
            0.82    // threshold
        );
        composer.addPass(bloom);

        /* --- Build World --- */
        World.build(scene);

        /* --- Managers --- */
        raycaster = new THREE.Raycaster();
        AudioManager.init();
        HUD.init();
        Effects.init(scene, camera);
        EnemyManager.init(scene, World.getWalls());
        Player.init(camera, World.getWalls());
        Weapons.init(camera);

        /* --- UI Events --- */
        document.getElementById('start-btn').addEventListener('click', startGame);
        document.getElementById('restart-btn').addEventListener('click', restartGame);

        /* --- Global keyboard --- */
        document.addEventListener('keydown', onGlobalKey);

        /* --- Canvas click → try pointer lock if in game --- */
        canvas.addEventListener('click', () => {
            if (state === STATE.PLAYING || state === STATE.WAVE_COMPLETE) {
                Player.requestLock();
                AudioManager.resume();
            }
        });

        /* --- Mouse fire --- */
        canvas.addEventListener('mousedown', e => {
            if (e.button === 0 && state === STATE.PLAYING && Player.isLocked()) {
                handleShoot();
            }
        });

        canvas.addEventListener('touchstart', e => {
            if (state === STATE.PLAYING) {
                Player.requestLock();
                const t = e.touches[0];
                touchLookActive = true;
                touchLookLast = { x: t.clientX, y: t.clientY };
                e.preventDefault();
            }
        }, { passive: false });

        canvas.addEventListener('touchmove', e => {
            if (state === STATE.PLAYING && touchLookActive && touchLookLast) {
                const t = e.touches[0];
                Player.moveTouchLook(t.clientX, t.clientY);
                touchLookLast = { x: t.clientX, y: t.clientY };
                e.preventDefault();
            }
        }, { passive: false });

        canvas.addEventListener('touchend', () => {
            touchLookActive = false;
            touchLookLast = null;
            Player.endTouchLook();
        });

        canvas.addEventListener('touchcancel', () => {
            touchLookActive = false;
            touchLookLast = null;
            Player.endTouchLook();
        });

        setupMobileControls();

        /* --- Resize --- */
        window.addEventListener('resize', onResize);

        /* --- Start loop --- */
        requestAnimationFrame(loop);
    }

    /* ========== Key Handling ========== */
    function onGlobalKey(e) {
        if (e.code === 'KeyQ' && state === STATE.PLAYING) Weapons.swapPrimarySecondary();
        if (e.code === 'KeyR' && state === STATE.PLAYING) Weapons.startReload();
        if (e.code === 'Digit1' && state === STATE.PLAYING) Weapons.selectWeapon('pistol');
        if (e.code === 'Digit2' && state === STATE.PLAYING) Weapons.selectWeapon('shotgun');
        if (e.code === 'Digit3' && state === STATE.PLAYING) Weapons.selectWeapon('rifle');
        if (e.code === 'Escape') {
            if (state === STATE.PLAYING)  { togglePause(); }
            else if (state === STATE.PAUSED) { togglePause(); }
        }
    }

    function setupMobileControls() {
        const buttons = document.querySelectorAll('[data-mobile-key]');
        buttons.forEach(btn => {
            const code = btn.dataset.mobileKey;
            const press = () => {
                if (state === STATE.PLAYING) Player.setKeyPressed(code, true);
            };
            const release = () => {
                if (state === STATE.PLAYING) Player.setKeyPressed(code, false);
            };

            btn.addEventListener('pointerdown', press);
            btn.addEventListener('pointerup', release);
            btn.addEventListener('pointerleave', release);
            btn.addEventListener('pointercancel', release);
        });

        document.getElementById('fire-btn').addEventListener('pointerdown', () => {
            if (state === STATE.PLAYING) handleShoot();
        });
        document.getElementById('reload-btn').addEventListener('pointerdown', () => {
            if (state === STATE.PLAYING) Weapons.startReload();
        });
        document.getElementById('swap-btn').addEventListener('pointerdown', () => {
            if (state === STATE.PLAYING) Weapons.swapPrimarySecondary();
        });

        document.querySelectorAll('[data-weapon]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (state === STATE.PLAYING) Weapons.selectWeapon(btn.dataset.weapon);
            });
        });
    }

    /* ========== Shooting ========== */
    function handleShoot() {
        const now = performance.now() / 1000;
        const w = Weapons.getCurrent();

        if (Weapons.isReloading()) return;
        if (w.ammo === 0) {
            if (w.reserve > 0) Weapons.startReload();
            else AudioManager.emptyGun();
            return;
        }

        const info = Weapons.fire(now);
        if (!info) return;

        AudioManager.gunshot(info.type);
        Effects.triggerMuzzleFlash();
        HUD.setFiring(true);
        setTimeout(() => HUD.setFiring(false), 80);

        // Cast rays (one per pellet)
        const enemyMeshes = EnemyManager.getEnemyMeshes();

        for (let p = 0; p < info.pellets; p++) {
            const dir = new THREE.Vector3(
                (Math.random() - 0.5) * info.spread * 2,
                (Math.random() - 0.5) * info.spread * 2,
                -1
            ).normalize();
            dir.applyQuaternion(camera.quaternion);

            raycaster.set(camera.position, dir);
            raycaster.near = 0.1;
            raycaster.far  = 200;

            const hits = raycaster.intersectObjects(enemyMeshes, true);
            if (hits.length > 0) {
                const h = hits[0];
                const result = EnemyManager.hitEnemy(h.object, info.damage);
                if (result) {
                    Effects.spawnBlood(h.point);
                    HUD.flashHitMarker();
                    AudioManager.enemyHit();
                    if (result.dead) {
                        Effects.spawnExplosion(result.position.clone().add(new THREE.Vector3(0, 1, 0)));
                        AudioManager.enemyDeath();
                        Player.addKill();
                        score += result.points;
                    }
                }
            } else {
                // Wall impact
                const wHits = raycaster.intersectObjects(scene.children, false);
                if (wHits.length > 0) Effects.spawnImpact(wHits[0].point);
            }
        }
    }

    /* ========== Game Flow ========== */
    function startGame() {
        AudioManager.resume();
        HUD.hideMenu();
        HUD.hideGameOver();
        HUD.showHUD();

        waveNum = 0;
        score   = 0;

        // Re-init everything
        EnemyManager.init(scene, World.getWalls());
        Player.init(camera, World.getWalls());
        Weapons.init(camera);

        clearPickups();
        state = STATE.PLAYING;
        nextWave();

        setTimeout(() => Player.requestLock(), 100);
    }

    function restartGame() { startGame(); }

    function nextWave() {
        waveNum++;
        EnemyManager.spawnWave(waveNum);
        state = STATE.PLAYING;

        const sub = waveNum === 1
            ? 'ELIMINATE ALL TARGETS'
            : (waveNum - 1) + ' WAVE' + (waveNum>2?'S':'')+' SURVIVED!';
        HUD.showBanner('WAVE  ' + waveNum, sub, 2400);
    }

    function onWaveComplete() {
        state = STATE.WAVE_COMPLETE;
        waveTimer = 3.8;
        AudioManager.waveComplete();
        HUD.showBanner('WAVE CLEARED!', 'NEXT WAVE IN 3…', 3200);
        spawnPickups();
    }

    function onPlayerDead() {
        state = STATE.GAME_OVER;
        Player.releaseLock();
        setTimeout(() => HUD.showGameOver(waveNum, score, Player.getKills()), 900);
    }

    function togglePause() {
        if (state === STATE.PLAYING) {
            state = STATE.PAUSED;
            Player.releaseLock();
            HUD.showPause();
        } else if (state === STATE.PAUSED) {
            state = STATE.PLAYING;
            Player.requestLock();
            HUD.hidePause();
        }
    }

    /* ========== Pickups ========== */
    function spawnPickups() {
        clearPickups();
        const types = ['health', 'ammo', 'ammo'];
        types.forEach((t, i) => {
            const color = t === 'health' ? 0x00ff66 : 0xffcc00;
            const geo   = new THREE.OctahedronGeometry(0.35);
            const mat   = new THREE.MeshStandardMaterial({
                color, emissive: color, emissiveIntensity: 2.5,
                metalness: 0.1, roughness: 0.2
            });
            const mesh  = new THREE.Mesh(geo, mat);

            const angle = (i / types.length) * Math.PI * 2;
            mesh.position.set(Math.cos(angle)*8, 0.6, Math.sin(angle)*8);
            scene.add(mesh);

            pickups.push({ mesh, type: t, color, active: true });
        });
    }

    function clearPickups() {
        pickups.forEach(p => { if (p.mesh.parent) scene.remove(p.mesh); });
        pickups = [];
    }

    function updatePickups(dt, t) {
        for (let i = pickups.length - 1; i >= 0; i--) {
            const p = pickups[i];
            if (!p.active) continue;

            p.mesh.rotation.y += dt * 1.8;
            p.mesh.rotation.x += dt * 0.9;
            p.mesh.position.y  = 0.6 + Math.sin(t * 2 + i) * 0.2;

            if (p.mesh.position.distanceTo(camera.position) < 1.4) {
                if (p.type === 'health') {
                    Player.heal(35);
                } else {
                    Weapons.addReserve(Weapons.getCurrent().type, 20);
                }
                Effects.spawnPickup(p.mesh.position.clone(), p.color);
                AudioManager.pickup();
                scene.remove(p.mesh);
                p.active = false;
                pickups.splice(i, 1);
            }
        }
    }

    /* ========== Resize ========== */
    function onResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
    }

    /* ========== Main Loop ========== */
    let menuAngle = 0;

    function loop(ts) {
        requestAnimationFrame(loop);

        const dt = Math.min((ts - clock.last) / 1000, 0.05);
        clock.last = ts;
        const t = ts / 1000;

        /* ---- MENU: slow orbit camera ---- */
        if (state === STATE.MENU) {
            menuAngle += dt * 0.08;
            camera.position.set(
                Math.sin(menuAngle) * 6,
                3.5,
                Math.cos(menuAngle) * 6
            );
            camera.lookAt(0, 2, 0);
        }

        /* ---- PLAYING ---- */
        if (state === STATE.PLAYING) {
            const moving = Player.update(dt);
            Weapons.update(dt, moving);
            Effects.update(dt);

            EnemyManager.update(dt, camera.position, dmg => Player.takeDamage(dmg));

            updatePickups(dt, t);

            const alive = EnemyManager.getAliveCount();

            HUD.update(
                Player.getHP(), Player.getMaxHP(),
                Weapons.getCurrent(),
                waveNum, score, alive
            );

            if (!Player.isAlive())    onPlayerDead();
            else if (alive === 0)     onWaveComplete();
        }

        /* ---- WAVE_COMPLETE ---- */
        if (state === STATE.WAVE_COMPLETE) {
            Effects.update(dt);
            updatePickups(dt, t);
            waveTimer -= dt;
            if (waveTimer <= 0) nextWave();

            HUD.update(
                Player.getHP(), Player.getMaxHP(),
                Weapons.getCurrent(),
                waveNum, score, 0
            );
        }

        /* ---- PAUSED ---- */
        // Nothing to update; scene stays rendered

        composer.render();
    }

    /* ========== Boot ========== */
    window.addEventListener('load', init);

})();
