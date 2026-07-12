// ============================================================
//  weapons.js  –  Multiple guns with primary/secondary swapping
// ============================================================
const Weapons = (function () {

    /* ---------- weapon definitions ---------- */
    const DEFS = {
        pistol: {
            name: 'PISTOL',
            damage: 25,
            fireRate: 0.22,
            ammo: 15, maxAmmo: 15, reserve: 90,
            spread: 0.012,
            pellets: 1,
            reloadTime: 1.4
        },
        shotgun: {
            name: 'SHOTGUN',
            damage: 16,
            fireRate: 0.85,
            ammo: 6, maxAmmo: 6, reserve: 30,
            spread: 0.13,
            pellets: 7,
            reloadTime: 2.4
        },
        rifle: {
            name: 'RIFLE',
            damage: 34,
            fireRate: 0.10,
            ammo: 24, maxAmmo: 24, reserve: 96,
            spread: 0.008,
            pellets: 1,
            reloadTime: 1.7
        }
    };

    /* ---------- state ---------- */
    let camera  = null;
    let gunGroup = null;
    let gunMesh  = null;

    const weapons = {};
    let current = null;
    let primaryType = 'pistol';
    let secondaryType = 'shotgun';
    let activeSlot = 'primary';

    let lastFireTime  = -99;
    let reloading     = false;
    let reloadTimer   = 0;
    let bobTime       = 0;
    const GUN_BASE    = new THREE.Vector3(0.32, -0.36, -0.58);

    /* ---------- gun mesh builders ---------- */
    function buildPistol() {
        const g = new THREE.Group();
        const dark = new THREE.MeshStandardMaterial({ color: 0x22222e, metalness: 0.9, roughness: 0.2 });
        const grip = new THREE.MeshStandardMaterial({ color: 0x101018, metalness: 0.4, roughness: 0.9 });
        const glow = new THREE.MeshBasicMaterial({ color: 0x00ffcc });

        const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.32), dark);
        barrel.position.set(0, 0.01, -0.16); g.add(barrel);

        const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.18), dark);
        body.position.set(0, -0.01, 0.06); g.add(body);

        const gripMesh = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.19, 0.075), grip);
        gripMesh.position.set(0, -0.15, 0.09); g.add(gripMesh);

        const acc = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.09, 0.016), glow);
        acc.position.set(0.048, -0.04, 0.06); g.add(acc);
        return g;
    }

    function buildShotgun() {
        const g = new THREE.Group();
        const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a28, metalness: 0.85, roughness: 0.25 });
        const wood = new THREE.MeshStandardMaterial({ color: 0x2a1800, metalness: 0.1, roughness: 0.95 });
        const glow = new THREE.MeshBasicMaterial({ color: 0xff8800 });

        const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.065, 0.50), dark);
        b1.position.set(-0.05, 0.01, -0.25); g.add(b1);
        const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.065, 0.50), dark);
        b2.position.set( 0.05, 0.01, -0.25); g.add(b2);

        const recv = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.28), dark);
        recv.position.set(0, -0.01, 0.05); g.add(recv);

        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, 0.30), wood);
        stock.position.set(0, -0.02, 0.23); g.add(stock);

        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.20, 0.075), wood);
        grip.position.set(0, -0.15, 0.04); g.add(grip);

        const acc = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.016, 0.016), glow);
        acc.position.set(0, 0.07, -0.30); g.add(acc);
        return g;
    }

    function buildRifle() {
        const g = new THREE.Group();
        const dark = new THREE.MeshStandardMaterial({ color: 0x141421, metalness: 0.9, roughness: 0.2 });
        const grip = new THREE.MeshStandardMaterial({ color: 0x1b1205, metalness: 0.35, roughness: 0.95 });
        const glow = new THREE.MeshBasicMaterial({ color: 0x00ccff });

        const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.65), dark);
        barrel.position.set(0, 0.01, -0.33); g.add(barrel);

        const body = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.12, 0.22), dark);
        body.position.set(0, -0.01, 0.04); g.add(body);

        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.10, 0.24), grip);
        stock.position.set(0, -0.03, 0.22); g.add(stock);

        const gripMesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.06), grip);
        gripMesh.position.set(0, -0.12, 0.07); g.add(gripMesh);

        const acc = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.016, 0.016), glow);
        acc.position.set(0, 0.06, -0.34); g.add(acc);
        return g;
    }

    function setActiveWeapon(type, slot) {
        if (!weapons[type] || reloading) return false;
        if (current && current.type === type) return true;

        current = weapons[type];
        if (slot) activeSlot = slot;

        if (gunGroup && gunMesh) {
            gunGroup.remove(gunMesh);
            gunMesh = buildGunModel(type);
            gunGroup.add(gunMesh);
        }
        return true;
    }

    function buildGunModel(type) {
        switch (type) {
            case 'shotgun': return buildShotgun();
            case 'rifle': return buildRifle();
            default: return buildPistol();
        }
    }

    /* ---------- public API ---------- */
    return {
        init(cam) {
            camera = cam;

            Object.keys(DEFS).forEach(type => {
                weapons[type] = Object.assign({}, DEFS[type], { type });
            });

            current = weapons[primaryType];
            reloading = false;
            reloadTimer = 0;
            lastFireTime = -99;
            bobTime = 0;

            gunGroup = new THREE.Group();
            gunGroup.position.copy(GUN_BASE);
            camera.add(gunGroup);

            gunMesh = buildGunModel(current.type);
            gunGroup.add(gunMesh);
        },

        getCurrent() { return current; },
        isReloading() { return reloading; },

        switchWeapon() {
            if (reloading) return;
            const targetType = activeSlot === 'primary' ? secondaryType : primaryType;
            if (targetType === current.type) return;
            setActiveWeapon(targetType, activeSlot === 'primary' ? 'secondary' : 'primary');
        },

        selectWeapon(type) {
            if (!weapons[type]) return false;
            if (activeSlot === 'primary') primaryType = type;
            else secondaryType = type;
            return setActiveWeapon(type, activeSlot);
        },

        setPrimaryWeapon(type) {
            if (!weapons[type]) return false;
            primaryType = type;
            if (activeSlot === 'primary') return setActiveWeapon(type, 'primary');
            return true;
        },

        setSecondaryWeapon(type) {
            if (!weapons[type]) return false;
            secondaryType = type;
            if (activeSlot === 'secondary') return setActiveWeapon(type, 'secondary');
            return true;
        },

        swapPrimarySecondary() {
            if (reloading) return false;
            const targetType = activeSlot === 'primary' ? secondaryType : primaryType;
            const newSlot = activeSlot === 'primary' ? 'secondary' : 'primary';
            return setActiveWeapon(targetType, newSlot);
        },

        canFire(now) {
            return !reloading
                && current.ammo > 0
                && (now - lastFireTime) >= current.fireRate;
        },

        fire(now) {
            if (!this.canFire(now)) return null;
            lastFireTime = now;
            current.ammo--;
            gunGroup.position.z += 0.09;

            return {
                type:    current.type,
                damage:  current.damage,
                pellets: current.pellets,
                spread:  current.spread
            };
        },

        startReload() {
            if (reloading) return;
            if (current.ammo >= current.maxAmmo) return;
            if (current.reserve <= 0) return;
            reloading = true;
            reloadTimer = current.reloadTime;
            AudioManager.reload();
        },

        addReserve(type, amount) {
            const w = weapons[type];
            if (!w) return;
            w.reserve = Math.min(w.reserve + amount, DEFS[type].reserve * 2);
        },

        update(dt, moving) {
            const bz = GUN_BASE.z;
            gunGroup.position.z += (bz - gunGroup.position.z) * Math.min(dt * 18, 1);

            if (moving) bobTime += dt * 9;
            else        bobTime += dt * 2;

            gunGroup.position.y = GUN_BASE.y + Math.sin(bobTime)      * 0.013;
            gunGroup.position.x = GUN_BASE.x + Math.sin(bobTime * 0.5) * 0.007;
            gunGroup.rotation.z =              Math.sin(bobTime * 0.5) * 0.025;

            if (reloading) {
                reloadTimer -= dt;
                const prog = 1 - reloadTimer / current.reloadTime;
                gunGroup.rotation.x = Math.sin(prog * Math.PI) * 0.45;

                if (reloadTimer <= 0) {
                    const need  = current.maxAmmo - current.ammo;
                    const take  = Math.min(need, current.reserve);
                    current.ammo    += take;
                    current.reserve -= take;
                    reloading = false;
                    gunGroup.rotation.x = 0;
                }
            }
        }
    };
})();
