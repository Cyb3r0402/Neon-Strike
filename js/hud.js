// ============================================================
//  hud.js  –  DOM-based HUD and screen management
// ============================================================
const HUD = (function () {
    let el = {};

    return {
        init() {
            el = {
                hud:          document.getElementById('hud'),
                healthBar:    document.getElementById('health-bar'),
                healthValue:  document.getElementById('health-value'),
                ammoNow:      document.getElementById('ammo-current'),
                ammoRes:      document.getElementById('ammo-reserve'),
                weaponName:   document.getElementById('weapon-name'),
                reloadHint:   document.getElementById('reload-hint'),
                waveNum:      document.getElementById('wave-number'),
                scoreVal:     document.getElementById('score-value'),
                enemyCount:   document.getElementById('enemy-count'),
                dmgOverlay:   document.getElementById('damage-overlay'),
                waveBanner:   document.getElementById('wave-banner'),
                bannerTitle:  document.getElementById('banner-title'),
                bannerSub:    document.getElementById('banner-sub'),
                crosshair:    document.getElementById('crosshair'),
                menu:         document.getElementById('menu'),
                gameOver:     document.getElementById('game-over'),
                goWave:       document.getElementById('go-wave'),
                goScore:      document.getElementById('go-score'),
                goKills:      document.getElementById('go-kills'),
                pauseScreen:  document.getElementById('pause-screen'),
            };
        },

        /* ---- visibility ---- */
        showHUD()   { el.hud.classList.add('visible'); },
        hideHUD()   { el.hud.classList.remove('visible'); },
        showMenu()  { el.menu.style.display = 'flex'; },
        hideMenu()  { el.menu.style.display = 'none'; },

        showGameOver(wave, score, kills) {
            el.goWave.textContent  = wave;
            el.goScore.textContent = score.toLocaleString();
            el.goKills.textContent = kills;
            el.gameOver.classList.add('visible');
        },
        hideGameOver() { el.gameOver.classList.remove('visible'); },

        showPause()  { el.pauseScreen.classList.add('visible'); },
        hidePause()  { el.pauseScreen.classList.remove('visible'); },

        /* ---- wave banner ---- */
        showBanner(title, sub, duration) {
            el.bannerTitle.textContent = title;
            el.bannerSub.textContent   = sub;
            el.waveBanner.classList.add('visible');
            clearTimeout(el.waveBanner._t);
            el.waveBanner._t = setTimeout(
                () => el.waveBanner.classList.remove('visible'),
                (duration || 2500)
            );
        },

        /* ---- flash effects ---- */
        flashDamage() {
            el.dmgOverlay.classList.add('flash');
            clearTimeout(el.dmgOverlay._t);
            el.dmgOverlay._t = setTimeout(() => el.dmgOverlay.classList.remove('flash'), 200);
        },

        flashHitMarker() {
            el.crosshair.classList.add('hit');
            clearTimeout(el.crosshair._t);
            el.crosshair._t = setTimeout(() => el.crosshair.classList.remove('hit'), 110);
        },

        setFiring(on) {
            if (on) el.crosshair.classList.add('firing');
            else    el.crosshair.classList.remove('firing');
        },

        /* ---- per-frame update ---- */
        update(health, maxHealth, weapon, waveNumber, score, enemiesLeft) {
            // Health
            const pct = Math.max(0, health / maxHealth * 100);
            el.healthBar.style.width = pct + '%';
            el.healthBar.className   = pct < 30 ? 'low' : '';
            el.healthValue.textContent = Math.ceil(health);
            el.healthValue.className   = pct < 30 ? 'low' : '';

            // Ammo
            el.weaponName.textContent = weapon.name;
            el.ammoNow.textContent    = weapon.ammo;
            el.ammoRes.textContent    = '/' + weapon.reserve;

            el.ammoNow.className =
                weapon.ammo === 0               ? 'ammo-empty' :
                weapon.ammo <= weapon.maxAmmo * 0.3 ? 'ammo-low'   : '';

            const showReload = weapon.ammo === 0 && weapon.reserve > 0;
            el.reloadHint.classList.toggle('visible', showReload);

            // Wave / score / enemies
            el.waveNum.textContent    = waveNumber;
            el.scoreVal.textContent   = 'SCORE  ' + score.toLocaleString();
            el.enemyCount.textContent = enemiesLeft;
        }
    };
})();
