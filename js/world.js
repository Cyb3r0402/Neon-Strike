// ============================================================
//  world.js  –  Builds the arena geometry + collision data
// ============================================================
const World = (function () {
    const ARENA  = 80;   // full side length
    const HALF   = ARENA / 2;
    const H      = 12;   // wall height
    const THICK  = 1.2;  // outer wall thickness

    let wallBoxes = [];  // AABB list for collision: { minX, maxX, minZ, maxZ }

    /* ---------- materials ---------- */
    function wallMat(hex) {
        return new THREE.MeshStandardMaterial({
            color: hex || 0x141424,
            emissive: hex || 0x08080f,
            emissiveIntensity: 0.25,
            metalness: 0.85,
            roughness: 0.25
        });
    }

    /* ---------- wall helper ---------- */
    function addBox(scene, px, py, pz, sx, sy, sz, mat) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat || wallMat());
        mesh.position.set(px, py, pz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);

        // Register collision box (Y ignored for simplicity)
        wallBoxes.push({
            minX: px - sx / 2,  maxX: px + sx / 2,
            minZ: pz - sz / 2,  maxZ: pz + sz / 2
        });
        return mesh;
    }

    /* ---------- canvas textures ---------- */
    function gridTex(size, lineColor, alpha) {
        const c = document.createElement('canvas');
        c.width = c.height = 512;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#050510';
        ctx.fillRect(0, 0, 512, 512);
        ctx.strokeStyle = lineColor || `rgba(0,255,204,${alpha || 0.14})`;
        ctx.lineWidth = 1;
        const step = 512 / 16;
        for (let i = 0; i <= 16; i++) {
            ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, 512); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(512, i * step); ctx.stroke();
        }
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(ARENA / 4, ARENA / 4);
        return tex;
    }

    function grassTex() {
        const c = document.createElement('canvas');
        c.width = c.height = 512;
        const ctx = c.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 0, 512);
        grad.addColorStop(0, '#2f5e2a');
        grad.addColorStop(1, '#17331a');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 512, 512);

        for (let i = 0; i < 220; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            ctx.strokeStyle = Math.random() > 0.5 ? '#4f8f41' : '#6bb85d';
            ctx.lineWidth = 1 + Math.random() * 2;
            ctx.beginPath();
            ctx.moveTo(x, y + 6);
            ctx.lineTo(x + (Math.random() - 0.5) * 8, y - 6 - Math.random() * 8);
            ctx.stroke();
        }

        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(12, 12);
        return tex;
    }

    function addTree(scene, x, z, scale = 1) {
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18 * scale, 0.24 * scale, 1.2 * scale, 8),
            new THREE.MeshStandardMaterial({ color: 0x5a3418, roughness: 1 })
        );
        trunk.position.set(x, 0.6 * scale, z);
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        scene.add(trunk);

        const crown = new THREE.Mesh(
            new THREE.ConeGeometry(1.0 * scale, 2.2 * scale, 8),
            new THREE.MeshStandardMaterial({ color: 0x2f7a2f, roughness: 0.9 })
        );
        crown.position.set(x, 1.8 * scale, z);
        crown.castShadow = true;
        crown.receiveShadow = true;
        scene.add(crown);
    }

    /* ---------- neon strip ---------- */
    function neonStrip(scene, sx, sz, px, py, pz, color) {
        const mat = new THREE.MeshBasicMaterial({ color });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.06, sz), mat);
        mesh.position.set(px, py, pz);
        scene.add(mesh);
    }

    return {
        ARENA,
        HALF,
        WALL_H: H,

        getWalls() { return wallBoxes; },

        build(scene) {
            wallBoxes = [];

            /* ---- Ground / grass ---- */
            const floorMat = new THREE.MeshStandardMaterial({
                map: grassTex(),
                metalness: 0.1,
                roughness: 0.95,
                color: 0x3a7d3d
            });
            const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA, ARENA), floorMat);
            floor.rotation.x = -Math.PI / 2;
            floor.receiveShadow = true;
            scene.add(floor);

            /* ---- Sky ---- */
            const skyGeo = new THREE.SphereGeometry(220, 32, 32);
            const skyMat = new THREE.MeshBasicMaterial({
                color: 0x87ceeb,
                side: THREE.BackSide
            });
            const sky = new THREE.Mesh(skyGeo, skyMat);
            scene.add(sky);

            /* ---- Distant hills ---- */
            const hillMat = new THREE.MeshStandardMaterial({ color: 0x4b6b3d, roughness: 1 });
            const hillGeo = new THREE.CylinderGeometry(70, 110, 26, 16, 1, true);
            const hill = new THREE.Mesh(hillGeo, hillMat);
            hill.position.set(0, -14, -110);
            hill.rotation.z = Math.PI;
            scene.add(hill);

            /* ---- Outer bounds as low terrain edges ---- */
            const T = THICK;
            addBox(scene,          0, 0.6,  -HALF + T/2, ARENA, 1.2, T, wallMat(0x2d4d2a)); // North
            addBox(scene,          0, 0.6,   HALF - T/2, ARENA, 1.2, T, wallMat(0x2d4d2a)); // South
            addBox(scene,  -HALF+T/2, 0.6,            0,  T, 1.2, ARENA, wallMat(0x2d4d2a)); // West
            addBox(scene,   HALF-T/2, 0.6,            0,  T, 1.2, ARENA, wallMat(0x2d4d2a)); // East

            /* ---- Inner cover structures ---- */
            const covers = [
                // centre pillar cluster
                { x:  0,   z:  0,   w: 2,   d: 2  },
                { x:  3.5, z:  0,   w: 2,   d: 2  },
                { x: -3.5, z:  0,   w: 2,   d: 2  },
                // NW L-wall
                { x: -16,  z: -16,  w: 9,   d: 1.5 },
                { x: -16,  z: -12,  w: 1.5, d: 7  },
                // NE L-wall
                { x:  16,  z: -16,  w: 9,   d: 1.5 },
                { x:  16,  z: -12,  w: 1.5, d: 7  },
                // SW L-wall
                { x: -16,  z:  16,  w: 9,   d: 1.5 },
                { x: -16,  z:  12,  w: 1.5, d: 7  },
                // SE L-wall
                { x:  16,  z:  16,  w: 9,   d: 1.5 },
                { x:  16,  z:  12,  w: 1.5, d: 7  },
                // scattered cover
                { x: -28,  z:  5,   w: 5,   d: 1.5 },
                { x:  28,  z: -5,   w: 5,   d: 1.5 },
                { x: -5,   z: -28,  w: 1.5, d: 5  },
                { x:  5,   z:  28,  w: 1.5, d: 5  },
                { x: -22,  z: -30,  w: 7,   d: 1.5 },
                { x:  22,  z:  30,  w: 7,   d: 1.5 },
                { x:  30,  z:  22,  w: 1.5, d: 7  },
                { x: -30,  z: -22,  w: 1.5, d: 7  },
            ];

            covers.forEach(c => {
                addBox(scene, c.x, H/2, c.z, c.w, H, c.d, wallMat(0x1a2044));
            });

            /* ---- Trees and environmental detail ---- */
            const treePositions = [
                [-24, -20], [24, -24], [-28, 18], [20, 26],
                [-12, 30], [14, -32], [-34, -8], [32, 8],
                [-18, -34], [28, -14]
            ];
            treePositions.forEach(([x, z]) => addTree(scene, x, z, 0.9 + Math.random() * 0.6));

            /* ---- Soft outdoor lighting ---- */
            const sunLight = new THREE.DirectionalLight(0xffe7a3, 1.2);
            sunLight.position.set(18, 24, 14);
            sunLight.castShadow = true;
            scene.add(sunLight);

            const fillLight = new THREE.AmbientLight(0x7aa2ff, 0.35);
            scene.add(fillLight);
        }
    };
})();
