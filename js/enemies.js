// ============================================================
//  enemies.js  –  Enemy AI, wave spawner, enemy projectiles
// ============================================================
const EnemyManager = (function () {

    /* ---------- type definitions ---------- */
    const TYPES = {
        BASIC: {
            health: 80, speed: 3.8, damage: 10,
            fireRate: 2.2, attackRange: 24, detectRange: 32,
            scale: 1.0, bodyColor: 0xcc2200, eyeColor: 0xff4444,
            projColor: 0xff3300, projSpeed: 14, points: 100
        },
        FAST: {
            health: 50, speed: 7.5, damage: 8,
            fireRate: 1.6, attackRange: 20, detectRange: 36,
            scale: 0.78, bodyColor: 0xff6600, eyeColor: 0xffaa00,
            projColor: 0xffaa00, projSpeed: 20, points: 150
        },
        HEAVY: {
            health: 220, speed: 2.2, damage: 22,
            fireRate: 3.5, attackRange: 16, detectRange: 24,
            scale: 1.45, bodyColor: 0x880000, eyeColor: 0xff0000,
            projColor: 0xff0000, projSpeed: 11, points: 300
        }
    };

    let scene = null;
    let walls = [];
    let enemies = [];
    let projectiles = [];

    /* ---------- mesh builders ---------- */
    function buildEnemyMesh(t) {
        const g = new THREE.Group();
        const s = t.scale;

        const bodyMat = new THREE.MeshStandardMaterial({
            color: t.bodyColor, emissive: t.bodyColor,
            emissiveIntensity: 0.35, metalness: 0.7, roughness: 0.3
        });
        const eyeMat = new THREE.MeshStandardMaterial({
            color: t.eyeColor, emissive: t.eyeColor, emissiveIntensity: 3
        });

        // torso
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8*s, 1.1*s, 0.5*s), bodyMat);
        torso.position.y = 0.85*s; torso.castShadow = true; g.add(torso);

        // head
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.58*s, 0.58*s, 0.48*s), bodyMat);
        head.position.y = 1.65*s; head.castShadow = true; g.add(head);

        // eyes
        const eyeGeo = new THREE.SphereGeometry(0.09*s, 6, 5);
        const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
        eyeL.position.set(-0.15*s, 1.7*s, 0.25*s); g.add(eyeL);
        const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
        eyeR.position.set( 0.15*s, 1.7*s, 0.25*s); g.add(eyeR);

        // legs
        const legGeo = new THREE.BoxGeometry(0.24*s, 0.55*s, 0.24*s);
        const legL = new THREE.Mesh(legGeo, bodyMat);
        legL.position.set(-0.22*s, 0.28*s, 0); g.add(legL);
        const legR = new THREE.Mesh(legGeo, bodyMat);
        legR.position.set( 0.22*s, 0.28*s, 0); g.add(legR);

        // arms
        const armGeo = new THREE.BoxGeometry(0.18*s, 0.80*s, 0.18*s);
        const armL = new THREE.Mesh(armGeo, bodyMat);
        armL.position.set(-0.54*s, 0.85*s, 0); g.add(armL);
        const armR = new THREE.Mesh(armGeo, bodyMat);
        armR.position.set( 0.54*s, 0.85*s, 0); g.add(armR);

        // eye glow light
        const pl = new THREE.PointLight(t.eyeColor, 1.2, 3.5*s);
        pl.position.set(0, 1.7*s, 0.6*s); g.add(pl);

        // store animated refs
        g.userData = { legL, legR, armL, armR, bodyMat, t };

        return g;
    }

    /* ---------- line-of-sight (slab test vs AABBs) ---------- */
    function hasLOS(from, to) {
        const dir = new THREE.Vector3().subVectors(to, from);
        const dist = dir.length();
        dir.divideScalar(dist);

        for (const w of walls) {
            let tMin = -Infinity, tMax = Infinity;

            if (Math.abs(dir.x) < 1e-6) {
                if (from.x < w.minX || from.x > w.maxX) continue;
            } else {
                const t1 = (w.minX - from.x) / dir.x;
                const t2 = (w.maxX - from.x) / dir.x;
                tMin = Math.max(tMin, Math.min(t1, t2));
                tMax = Math.min(tMax, Math.max(t1, t2));
                if (tMax < tMin) continue;
            }

            if (Math.abs(dir.z) < 1e-6) {
                if (from.z < w.minZ || from.z > w.maxZ) continue;
            } else {
                const t1 = (w.minZ - from.z) / dir.z;
                const t2 = (w.maxZ - from.z) / dir.z;
                tMin = Math.max(tMin, Math.min(t1, t2));
                tMax = Math.min(tMax, Math.max(t1, t2));
            }

            if (tMax >= tMin && tMin > 0.15 && tMin < dist) return false;
        }
        return true;
    }

    /* ---------- movement with wall sliding ---------- */
    function moveTowards(pos, target, speed, dt) {
        const dx = target.x - pos.x;
        const dz = target.z - pos.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        if (dist < 0.4) return true; // reached

        const nx = dx/dist, nz = dz/dist;
        const mx = nx * speed * dt;
        const mz = nz * speed * dt;
        const R  = 0.45;

        let okX = true, okZ = true;
        for (const w of walls) {
            const nx2 = pos.x + mx;
            if (nx2 - R < w.maxX && nx2 + R > w.minX &&
                pos.z - R < w.maxZ && pos.z + R > w.minZ) okX = false;

            const nz2 = pos.z + mz;
            if (pos.x - R < w.maxX && pos.x + R > w.minX &&
                nz2 - R < w.maxZ && nz2 + R > w.minZ) okZ = false;
        }

        if (okX) pos.x += mx;
        if (okZ) pos.z += mz;
        return false;
    }

    /* ---------- random patrol target inside arena ---------- */
    function randPatrol(HS) {
        for (let i = 0; i < 20; i++) {
            const pos = new THREE.Vector3(
                (Math.random() - 0.5) * (HS - 4) * 2,
                0,
                (Math.random() - 0.5) * (HS - 4) * 2
            );
            let inside = false;
            for (const w of walls) {
                if (pos.x > w.minX && pos.x < w.maxX &&
                    pos.z > w.minZ && pos.z < w.maxZ) { inside = true; break; }
            }
            if (!inside) return pos;
        }
        return new THREE.Vector3(0, 0, 0);
    }

    /* ---------- Enemy class ---------- */
    class Enemy {
        constructor(pos, typeKey) {
            this.typeKey = typeKey;
            this.t = TYPES[typeKey];
            this.hp = this.t.health;
            this.alive = true;
            this.state = 'PATROL';   // PATROL | CHASE | ATTACK
            this.walkTime = 0;
            this.patrolTarget = null;
            this.patrolTimer = 0;
            this.lostTimer = 0;
            this.fireCooldown = Math.random() * this.t.fireRate;
            this.hitFlash = 0;

            this.mesh = buildEnemyMesh(this.t);
            this.mesh.position.copy(pos);
            scene.add(this.mesh);
        }

        dist2D(pos) {
            const dx = this.mesh.position.x - pos.x;
            const dz = this.mesh.position.z - pos.z;
            return Math.sqrt(dx*dx + dz*dz);
        }

        damage(dmg) {
            this.hp -= dmg;
            this.hitFlash = 0.08;
            return this.hp <= 0;
        }

        die() {
            if (!this.alive) return;
            this.alive = false;
            Effects.spawnExplosion(this.mesh.position.clone().add(new THREE.Vector3(0, 0.9 * this.t.scale, 0)));
            scene.remove(this.mesh);
        }

        shoot(playerPos) {
            const from = this.mesh.position.clone();
            from.y = 1.6 * this.t.scale;

            const dir = new THREE.Vector3()
                .subVectors(playerPos, from);
            dir.y = 0;
            dir.normalize();

            // inaccuracy
            dir.x += (Math.random() - 0.5) * 0.18;
            dir.z += (Math.random() - 0.5) * 0.18;
            dir.normalize();

            const geo = new THREE.SphereGeometry(0.10, 5, 4);
            const mat = new THREE.MeshBasicMaterial({ color: this.t.projColor });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(from);

            const pl = new THREE.PointLight(this.t.projColor, 2.5, 3);
            mesh.add(pl);
            scene.add(mesh);

            projectiles.push({
                mesh,
                vel: dir.clone().multiplyScalar(this.t.projSpeed),
                life: 3.5,
                damage: this.t.damage
            });
        }

        update(dt, playerPos) {
            if (!this.alive) return;

            const dist = this.dist2D(playerPos);
            const eyeFrom = this.mesh.position.clone();
            eyeFrom.y = 1.6 * this.t.scale;
            const eyeTo = playerPos.clone(); eyeTo.y = 1.7;
            const los = dist < this.t.detectRange && hasLOS(eyeFrom, eyeTo);

            // Hit flash
            if (this.hitFlash > 0) {
                this.hitFlash -= dt;
                const emI = this.hitFlash > 0 ? 4 : 0.35;
                this.mesh.userData.bodyMat.emissiveIntensity = emI;
            }

            // Leg animation
            this.walkTime += dt * (this.state !== 'ATTACK' ? this.t.speed * 0.6 : 1);
            const s = this.t.scale;
            const ud = this.mesh.userData;
            ud.legL.position.y = 0.28*s + Math.sin(this.walkTime*3)      * 0.14*s;
            ud.legR.position.y = 0.28*s + Math.sin(this.walkTime*3+Math.PI) * 0.14*s;
            ud.armL.rotation.x =          Math.sin(this.walkTime*3+Math.PI) * 0.35;
            ud.armR.rotation.x =          Math.sin(this.walkTime*3)         * 0.35;

            /* ---- state machine ---- */
            switch (this.state) {
                case 'PATROL':
                    this.lostTimer = 0;
                    if (los) { this.state = 'CHASE'; break; }
                    this.patrolTimer -= dt;
                    if (!this.patrolTarget || this.patrolTimer <= 0) {
                        this.patrolTarget = randPatrol(World.HALF - 4);
                        this.patrolTimer = 4 + Math.random() * 5;
                    }
                    moveTowards(this.mesh.position, this.patrolTarget, this.t.speed * 0.55, dt);
                    if (this.patrolTarget) {
                        const dx = this.patrolTarget.x - this.mesh.position.x;
                        const dz = this.patrolTarget.z - this.mesh.position.z;
                        if (Math.abs(dx) + Math.abs(dz) > 0.5)
                            this.mesh.rotation.y = Math.atan2(dx, dz);
                    }
                    break;

                case 'CHASE':
                    if (!los) {
                        this.lostTimer += dt;
                        if (this.lostTimer > 3) { this.state = 'PATROL'; }
                    } else {
                        this.lostTimer = 0;
                    }
                    if (dist <= this.t.attackRange && los) {
                        this.state = 'ATTACK';
                    } else {
                        moveTowards(this.mesh.position, playerPos, this.t.speed, dt);
                        const dx = playerPos.x - this.mesh.position.x;
                        const dz = playerPos.z - this.mesh.position.z;
                        this.mesh.rotation.y = Math.atan2(dx, dz);
                    }
                    break;

                case 'ATTACK':
                    if (dist > this.t.attackRange * 1.15 || !los) {
                        this.state = 'CHASE'; break;
                    }
                    // face player
                    const dx2 = playerPos.x - this.mesh.position.x;
                    const dz2 = playerPos.z - this.mesh.position.z;
                    this.mesh.rotation.y = Math.atan2(dx2, dz2);

                    // shoot
                    this.fireCooldown -= dt;
                    if (this.fireCooldown <= 0) {
                        this.fireCooldown = this.t.fireRate + Math.random() * 0.5;
                        this.shoot(playerPos);
                    }

                    // occasional strafe
                    if (Math.random() < dt * 0.8) {
                        const strafeDist = 4;
                        const side = new THREE.Vector3(-dz2, 0, dx2).normalize()
                            .multiplyScalar(strafeDist * (Math.random() > 0.5 ? 1 : -1));
                        const strafeTarget = this.mesh.position.clone().add(side);
                        moveTowards(this.mesh.position, strafeTarget, this.t.speed * 0.6, dt);
                    }
                    break;
            }
        }
    }

    /* ========== Manager API ========== */
    return {
        init(s, w) {
            scene = s;
            walls = w;
            enemies.forEach(e => { if (e.alive) scene.remove(e.mesh); });
            enemies = [];
            projectiles.forEach(p => scene.remove(p.mesh));
            projectiles = [];
        },

        spawnWave(waveNum) {
            enemies.forEach(e => { if (e.alive) e.die(); });
            enemies = [];

            const count = 3 + (waveNum - 1) * 2;
            const HS = World.HALF - 8;

            for (let i = 0; i < count; i++) {
                let typeKey;
                if      (waveNum <= 2) typeKey = 'BASIC';
                else if (waveNum <= 4) typeKey = Math.random() < 0.4 ? 'FAST'  : 'BASIC';
                else                   typeKey = ['BASIC','BASIC','FAST','FAST','HEAVY'][Math.floor(Math.random()*5)];

                // Place far from origin, not inside walls
                let pos, attempts = 0;
                do {
                    const angle = Math.random() * Math.PI * 2;
                    const r = 18 + Math.random() * (HS - 18);
                    pos = new THREE.Vector3(Math.cos(angle)*r, 0, Math.sin(angle)*r);
                    attempts++;
                } while (attempts < 25 && walls.some(w =>
                    pos.x > w.minX && pos.x < w.maxX &&
                    pos.z > w.minZ && pos.z < w.maxZ
                ));

                enemies.push(new Enemy(pos, typeKey));
            }
        },

        /* Returns meshes for raycasting (recursive child check in main) */
        getEnemyMeshes() {
            return enemies.filter(e => e.alive).map(e => e.mesh);
        },

        /* Walk up parent chain to find owning enemy, apply damage */
        hitEnemy(hitObj, damage) {
            let obj = hitObj;
            while (obj) {
                const e = enemies.find(en => en.alive && en.mesh === obj);
                if (e) {
                    const dead = e.damage(damage);
                    if (dead) e.die();
                    return { dead, points: dead ? e.t.points : 0, position: obj.position.clone() };
                }
                obj = obj.parent;
            }
            return null;
        },

        getAliveCount() { return enemies.filter(e => e.alive).length; },

        /* Update everything; calls onHit(damage) when a projectile hits player */
        update(dt, playerPos, onHit) {
            // Update enemies
            enemies.forEach(e => e.update(dt, playerPos));

            // Update projectiles
            for (let i = projectiles.length - 1; i >= 0; i--) {
                const p = projectiles[i];
                p.life -= dt;
                p.mesh.position.addScaledVector(p.vel, dt);

                let remove = p.life <= 0;

                // Player hit?
                if (!remove && p.mesh.position.distanceTo(playerPos) < 1.1) {
                    onHit(p.damage);
                    remove = true;
                }

                // Wall hit?
                if (!remove) {
                    const pp = p.mesh.position;
                    for (const w of walls) {
                        if (pp.x > w.minX && pp.x < w.maxX &&
                            pp.z > w.minZ && pp.z < w.maxZ) { remove = true; break; }
                    }
                }

                if (remove) {
                    scene.remove(p.mesh);
                    p.mesh.geometry.dispose();
                    p.mesh.material.dispose();
                    projectiles.splice(i, 1);
                }
            }
        }
    };
})();
