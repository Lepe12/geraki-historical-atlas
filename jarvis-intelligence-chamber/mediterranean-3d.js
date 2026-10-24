/* True 3D basin for cited voyages only.
   The 2D portolan (chamber.js) keeps running. This view is off until the 3D control is pressed.
   The ship travels drawable segments from cited-voyage-routes.js and no others. */
(function () {
  "use strict";
  const THREE = window.THREE;
  const routes = window.NABOU_CITED_ROUTES;
  const coast = window.NABOU_MED_COAST;
  const chart = document.getElementById("chartView");
  const tools = chart && chart.querySelector(".nxs-3d-tools");
  if (!THREE || !routes || !coast || !chart || !window.NABOU_drawableVoyages) return;

  const voyages = window.NABOU_drawableVoyages(routes);
  const LON0 = 28.65;
  const LAT0 = 36;
  const SCALE = 8.2;
  const canvas = document.createElement("canvas");
  canvas.id = "cited3d";
  canvas.setAttribute("aria-label", "Τρισδιάστατος χάρτης. Το πλοίο κινείται μόνο σε ρότες με βιβλίο, σελίδα και απόσπασμα.");
  chart.appendChild(canvas);

  const panel = document.createElement("aside");
  panel.id = "cited3dPanel";
  panel.hidden = true;
  panel.setAttribute("aria-live", "polite");
  chart.appendChild(panel);

  const toggle = document.createElement("button");
  toggle.id = "cited3dToggle";
  toggle.type = "button";
  toggle.setAttribute("aria-pressed", "false");
  toggle.setAttribute("aria-label", "Τρισδιάστατος χάρτης τεκμηριωμένων ρότων");
  toggle.title = "3D: μόνο τεκμηριωμένες ρότες";
  toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 7.5v9L12 21 4 16.5v-9Z"/><path d="M12 12 20 7.5M12 12v9M12 12 4 7.5"/></svg>';
  if (tools) tools.appendChild(toggle);

  const reduceQuery = matchMedia("(prefers-reduced-motion: reduce)");
  let voyageIndex = 0;
  let progress = 0.08;
  let active = false;
  let pinned = false;
  let yaw = 0.55;
  let pitch = 0.62;
  let radius = 78;
  const target = new THREE.Vector3(2, 0.4, 0);
  let renderer;
  try {
    canvas.width = chart.clientWidth || 800;
    canvas.height = chart.clientHeight || 600;
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
  } catch (error) {
    toggle.disabled = true;
    toggle.title = "Το WebGL δεν είναι διαθέσιμο σε αυτόν τον περιηγητή";
    return;
  }
  if (renderer.outputColorSpace && THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x14384a, 1);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x14384a, 90, 210);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
  scene.add(new THREE.HemisphereLight(0xf2e2c0, 0x1a3344, 1.15));
  const sun = new THREE.DirectionalLight(0xfff1d2, 1.35);
  sun.position.set(-30, 48, 18);
  scene.add(sun);

  function project(lon, lat, y) {
    return new THREE.Vector3((lon - LON0) * SCALE, y || 0, (LAT0 - lat) * SCALE);
  }

  function ringArea(ring) {
    let area = 0;
    for (let i = 0; i < ring.length - 1; i++) area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    return area;
  }

  function toVectors(ring) {
    const ordered = ringArea(ring) < 0 ? ring.slice().reverse() : ring.slice();
    return ordered.map(function (pair) { return new THREE.Vector2((pair[0] - LON0) * SCALE, (pair[1] - LAT0) * SCALE); });
  }

  const landMaterial = new THREE.MeshStandardMaterial({ color: 0xc6b48a, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  (coast.polygons || []).forEach(function (polygon) {
    if (!polygon.outer || polygon.outer.length < 4) return;
    const shape = new THREE.Shape(toVectors(polygon.outer));
    (polygon.holes || []).forEach(function (hole) {
      if (hole.length < 4) return;
      const path = new THREE.Path(toVectors(hole.slice().reverse()));
      shape.holes.push(path);
    });
    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.42, bevelEnabled: false }), landMaterial);
    mesh.rotation.x = -Math.PI / 2;
    scene.add(mesh);
  });

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(170, 150),
    new THREE.MeshStandardMaterial({ color: 0x1b5872, roughness: 0.55, metalness: 0.08 })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.08;
  scene.add(sea);

  const grid = new THREE.Group();
  for (let lon = 22; lon <= 36; lon += 2) {
    grid.add(line([project(lon, 30, 0.02), project(lon, 42, 0.02)], 0xd7c7a2, 0.28));
  }
  for (let lat = 31; lat <= 41; lat += 2) {
    grid.add(line([project(22, lat, 0.02), project(36, lat, 0.02)], 0xd7c7a2, 0.28));
  }
  scene.add(grid);

  function line(points, color, opacity) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: opacity }));
  }

  const hitMeshes = [];
  const labels = document.createElement("div");
  labels.id = "cited3dLabels";
  labels.setAttribute("aria-hidden", "true");
  chart.appendChild(labels);
  const labelNodes = [];

  const labelled = new Set();
  function addLabel(place) {
    if (labelled.has(place.place_id)) return;
    labelled.add(place.place_id);
    const el = document.createElement("span");
    el.className = "cited3d-place";
    el.textContent = place.label;
    labels.appendChild(el);
    labelNodes.push({ el: el, position: project(place.lon, place.lat, 1.35) });
  }

  const drawn = [];
  voyages.forEach(function (voyage) {
    voyage.segments.forEach(function (segment) {
      const from = project(segment.from.lon, segment.from.lat, 0.9);
      const to = project(segment.to.lon, segment.to.lat, 0.9);
      const tube = cylinderBetween(from, to, 0.55);
      tube.material = new THREE.MeshBasicMaterial({ color: 0x8c1f18, transparent: true, opacity: 0.001 });
      tube.userData.segment = segment;
      tube.userData.voyageId = voyage.id;
      scene.add(tube);
      hitMeshes.push(tube);
      const ink = line([from, to], 0x7b1c17, 1);
      ink.userData.voyageId = voyage.id;
      scene.add(ink);
      [segment.from, segment.to].forEach(function (place) {
        const mark = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 8), new THREE.MeshStandardMaterial({ color: 0x7b1c17, roughness: 0.4 }));
        mark.position.copy(project(place.lon, place.lat, 0.7));
        mark.userData.segment = segment;
        mark.userData.voyageId = voyage.id;
        scene.add(mark);
        hitMeshes.push(mark);
      });
      drawn.push({ voyage: voyage, segment: segment, from: from, to: to, ink: ink, tube: tube });
      addLabel(segment.from);
      addLabel(segment.to);
    });
  });

  function cylinderBetween(a, b, radius) {
    const direction = new THREE.Vector3().subVectors(b, a);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, Math.max(direction.length(), 0.001), 8, 1, true));
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    return mesh;
  }

  const ship = makeShip();
  scene.add(ship);

  function makeShip() {
    const group = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x6a3b22, roughness: 0.72 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0xf3e6c4, roughness: 0.9, side: THREE.DoubleSide });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.72, 1.15), wood);
    hull.position.y = 0.36;
    const bow = new THREE.Mesh(new THREE.ConeGeometry(0.58, 1.35, 4), wood);
    bow.rotation.z = -Math.PI / 2;
    bow.position.set(2.05, 0.36, 0);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.5, 6), wood);
    mast.position.set(-0.15, 1.7, 0);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 1.55), cloth);
    sail.position.set(-0.1, 1.75, 0);
    group.add(hull, bow, mast, sail);
    return group;
  }

  function current() {
    return drawn[voyageIndex] || drawn[0];
  }

  function motionOff() {
    return reduceQuery.matches || document.body.classList.contains("nx-no-motion");
  }

  function placeShip(item, t) {
    const position = item.from.clone().lerp(item.to, t);
    position.y = 1.15 + (motionOff() ? 0 : Math.sin(performance.now() * 0.002) * 0.07);
    ship.position.copy(position);
    const forward = item.to.clone().sub(item.from);
    forward.y = 0;
    if (forward.lengthSq() > 0) ship.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), forward.normalize());
    ship.userData.segment = item.segment;
    ship.userData.voyageId = item.voyage.id;
  }

  function showVoyage(index, pin) {
    voyageIndex = (index + drawn.length) % drawn.length;
    progress = motionOff() ? 0.42 : 0.08;
    if (pin) pinned = true;
    window.NABOU_CITED_3D.progress = progress;
    drawn.forEach(function (item, i) {
      const on = i === voyageIndex;
      item.ink.material.opacity = on ? 1 : 0.28;
      item.tube.visible = on;
    });
    renderPanel(current().segment, current().voyage);
  }

  function renderPanel(segment, voyage) {
    const citation = segment.citation;
    const also = (segment.also_cited || []).map(function (item) {
      return '<blockquote><p>' + escapeHtml(item.excerpt) + '</p><small>' + escapeHtml(item.book) + ', σ. ' + escapeHtml(item.page) + '</small></blockquote>';
    }).join("");
    const choices = voyages.map(function (item, index) {
      return '<button type="button" data-voyage="' + index + '"' + (index === voyageIndex ? ' aria-pressed="true"' : "") + '>' + escapeHtml(item.title) + '</button>';
    }).join("");
    const excluded = (routes.excluded || []).map(function (item) {
      const page = item.citation.page ? "σ. " + item.citation.page : (item.citation.page_note || "χωρίς τυπωμένη σελίδα");
      return '<li><strong>' + escapeHtml(item.who) + '</strong> ' + escapeHtml(item.why_el || item.why) + ' <q>' + escapeHtml(item.citation.excerpt) + '</q> <small>' + escapeHtml(item.citation.book) + ', ' + escapeHtml(page) + '</small></li>';
    }).join("");
    const direction = segment.direction_stated
      ? "Η κατεύθυνση είναι αυτή που λέει το απόσπασμα: από «" + segment.from.label + "» προς «" + segment.to.label + "»."
      : "Το απόσπασμα δεν δηλώνει κατεύθυνση. Το πλοίο διατρέχει τη σχηματική γραμμή από το πρώτο κατονομασμένο άκρο («" + segment.from.label + "») προς το δεύτερο («" + segment.to.label + "»). Αυτό δεν είναι ιστορική κατεύθυνση.";
    panel.innerHTML =
      '<p class="cited3d-kicker">Τεκμηριωμένη ρότα · όχι ανακατασκευασμένος πλους</p>' +
      '<h2>' + escapeHtml(voyage.title) + '</h2>' +
      '<p class="cited3d-vessel">' + escapeHtml(voyage.vessel) + '</p>' +
      '<blockquote><p>' + escapeHtml(citation.excerpt) + '</p></blockquote>' +
      '<p><b>Βιβλίο</b> ' + escapeHtml(citation.book) + '</p>' +
      '<p><b>Σελίδα</b> ' + escapeHtml(citation.page) + (citation.footnote ? ' · ' + escapeHtml(citation.footnote) : '') + '</p>' +
      also +
      '<p class="cited3d-note">' + direction + ' Η γραμμή είναι σχηματική σύνδεση των δύο σημείων του γκαζετίερ, όχι ανακατασκευασμένος πλους, και δεν περνά από ενδιάμεσα λιμάνια.</p>' +
      '<p><a href="' + escapeAttr(citation.url) + '" target="_blank" rel="noopener noreferrer">Άνοιγμα της πηγής</a></p>' +
      '<p class="cited3d-path">' + escapeHtml(citation.evidence_path) + '</p>' +
      '<div class="cited3d-choices">' + choices + '</div>' +
      '<details><summary>Δεν σχεδιάστηκαν (' + (routes.excluded || []).length + ')</summary><ul>' + excluded + '</ul></details>';
    panel.querySelectorAll("[data-voyage]").forEach(function (button) {
      button.addEventListener("click", function () { showVoyage(Number(button.dataset.voyage), true); });
    });
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function escapeAttr(value) { return escapeHtml(value).replace(/"/g, "&quot;"); }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  function pick(event) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(hitMeshes.concat([ship]), true);
    return hits.map(function (hit) { return hit.object; }).find(function (object) {
      let node = object;
      while (node && !node.userData.segment) node = node.parent;
      return node && node.userData.segment;
    }) || null;
  }

  canvas.addEventListener("pointermove", function (event) {
    if (!active || pinned) return;
    const object = pick(event);
    if (!object) return;
    const node = object.userData.segment ? object : object.parent;
    const found = drawn.findIndex(function (item) { return item.segment.id === node.userData.segment.id; });
    if (found >= 0 && found !== voyageIndex) showVoyage(found, false);
  });
  canvas.addEventListener("click", function (event) {
    const object = pick(event);
    if (!object) return;
    const node = object.userData.segment ? object : object.parent;
    const found = drawn.findIndex(function (item) { return item.segment.id === node.userData.segment.id; });
    if (found >= 0) showVoyage(found, true);
  });

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener("pointerdown", function (event) {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", function (event) {
    if (!dragging) return;
    yaw -= (event.clientX - lastX) * 0.005;
    pitch = Math.max(0.25, Math.min(1.25, pitch + (event.clientY - lastY) * 0.004));
    lastX = event.clientX;
    lastY = event.clientY;
  });
  canvas.addEventListener("pointerup", function () { dragging = false; });
  canvas.addEventListener("pointercancel", function () { dragging = false; });
  canvas.addEventListener("wheel", function (event) {
    if (!active) return;
    event.preventDefault();
    radius = Math.max(28, Math.min(140, radius * Math.exp(event.deltaY * 0.001)));
  }, { passive: false });

  function zoomBy(factor) {
    radius = Math.max(28, Math.min(140, radius * factor));
  }
  ["zoomIn", "zoomOut", "resetView"].forEach(function (id) {
    const button = document.getElementById(id);
    if (!button) return;
    button.addEventListener("click", function (event) {
      if (!active) return;
      event.stopImmediatePropagation();
      event.preventDefault();
      if (id === "zoomIn") zoomBy(0.82);
      else if (id === "zoomOut") zoomBy(1.22);
      else { yaw = 0.55; pitch = 0.62; radius = 78; }
    }, true);
  });

  function resize() {
    const width = chart.clientWidth;
    const height = chart.clientHeight;
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function frameCamera() {
    const cp = Math.cos(pitch);
    camera.position.set(target.x + Math.sin(yaw) * radius * cp, target.y + Math.sin(pitch) * radius, target.z + Math.cos(yaw) * radius * cp);
    camera.lookAt(target);
  }

  function placeLabels() {
    const width = chart.clientWidth;
    const height = chart.clientHeight;
    labelNodes.forEach(function (item) {
      const vector = item.position.clone().project(camera);
      const behind = vector.z > 1;
      item.el.hidden = behind || !active;
      if (behind) return;
      item.el.style.left = ((vector.x * 0.5 + 0.5) * width) + "px";
      item.el.style.top = ((-vector.y * 0.5 + 0.5) * height) + "px";
    });
  }

  function loop(now) {
    requestAnimationFrame(loop);
    if (!active || !drawn.length) return;
    const item = current();
    if (!motionOff()) {
      progress += 0.0016;
      if (progress > 1) progress = 0;
    }
    placeShip(item, progress);
    frameCamera();
    placeLabels();
    renderer.render(scene, camera);
    window.NABOU_CITED_3D.progress = progress;
  }

  function setActive(on) {
    if (!drawn.length) return;
    active = on;
    document.body.classList.toggle("nx-cited-3d", on);
    toggle.setAttribute("aria-pressed", on ? "true" : "false");
    labels.hidden = !on;
    panel.hidden = !on;
    if (!on) pinned = false;
    if (on) {
      resize();
      showVoyage(voyageIndex, false);
    }
  }

  toggle.addEventListener("click", function () { setActive(!active); });
  addEventListener("resize", function () { if (active) resize(); });
  window.NABOU_CITED_3D = { progress: progress, active: false, voyages: voyages.length, excluded: (routes.excluded || []).length };
  Object.defineProperty(window.NABOU_CITED_3D, "active", { get: function () { return active; } });
  if (!drawn.length) {
    toggle.disabled = true;
    toggle.title = "Καμία ρότα με πλήρη παραπομπή";
  }
  requestAnimationFrame(loop);
})();
