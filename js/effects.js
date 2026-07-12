// ============================================================
//  effects.js  –  Particles, muzzle flash, hit sparks
// ============================================================
const Effects = (function () {
    let scene = null;
    const particles = [];

    // Muzzle flash assets (camera-space, set up by init)
    const flash = { light: null, timer: 0 };

    /* ---------- particle spawn ---------- */
    function spawnParticles(pos, color, count, speed, lifetime, sizeMin, sizeMax) {
        for (let i = 0; i < count; i++) {
            const s = sizeMin + Math.random() * (sizeMax - sizeMin);
            const geo = new THREE.SphereGeometry(s, 4, 3);
            const mat = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 1,
                depthWrite: false
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(pos);
            scene.add(mesh);

            const vel = new THREE.Vector3(
                (Math.random() - 0.5) * speed * 2,
                Math.random() * speed + 0.5,
                (Math.random() - 0.5) * speed * 2
            );
            particles.push({ mesh, vel, life: lifetime, maxLife: lifetime });
        }
    }

    return {
        init(s, camera) {
            scene = s;

            // Flash point light attached to camera
            const fl = new THREE.PointLight(0xffbb44, 0, 6);
            fl.position.set(0.3, -0.25, -0.8);
            camera.add(fl);
            flash.light = fl;
        },

        triggerMuzzleFlash() {
            flash.light.intensity = 6;
            flash.timer = 0.055;
        },

        // Bullet hit sparks on surfaces
        spawnImpact(pos) {
            spawnParticles(pos, 0xffcc44, 5, 4, 0.25, 0.02, 0.06);
            spawnParticles(pos, 0xffffff, 3, 6, 0.15, 0.01, 0.03);
        },

        // Enemy damage — red blood-like
        spawnBlood(pos) {
            spawnParticles(pos, 0xff2200, 7, 5, 0.35, 0.03, 0.08);
            spawnParticles(pos, 0xff6600, 4, 7, 0.25, 0.02, 0.05);
        },

        // Enemy death explosion
        spawnExplosion(pos) {
            spawnParticles(pos, 0xff4400, 18, 8.5, 0.70, 0.06, 0.14);
            spawnParticles(pos, 0xffaa00, 12, 10.5, 0.55, 0.04, 0.10);
            spawnParticles(pos, 0xffffff, 6, 6.5, 0.38, 0.02, 0.06);
        },

        // Pickup collect sparkle
        spawnPickup(pos, color) {
            spawnParticles(pos, color || 0x00ff88, 10, 5, 0.6, 0.04, 0.10);
        },

        update(dt) {
            // Muzzle flash decay
            if (flash.timer > 0) {
                flash.timer -= dt;
                if (flash.timer <= 0) flash.light.intensity = 0;
            }

            // Particle simulation
            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.life -= dt;

                if (p.life <= 0) {
                    scene.remove(p.mesh);
                    p.mesh.geometry.dispose();
                    p.mesh.material.dispose();
                    particles.splice(i, 1);
                    continue;
                }

                // Gravity
                p.vel.y -= 14 * dt;
                p.mesh.position.addScaledVector(p.vel, dt);

                // Bounce off floor
                if (p.mesh.position.y < 0.04) {
                    p.mesh.position.y = 0.04;
                    p.vel.y *= -0.3;
                    p.vel.x *= 0.7;
                    p.vel.z *= 0.7;
                }

                // Fade
                const frac = p.life / p.maxLife;
                p.mesh.material.opacity = frac;
                p.mesh.scale.setScalar(frac * 0.8 + 0.2);
            }
        }
    };
})();
