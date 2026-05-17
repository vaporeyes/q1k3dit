// ABOUTME: Implements Q1K3DIT map editing, Quake map parsing, and packed PLB export.
// ABOUTME: Keeps editor data in Q1K3 block grid units for direct engine compatibility.
const MAP_SIZE = 128;
const CELL_XZ = 32;
const CELL_Y = 16;
const ENTITY_TYPES = [
	{ id: 0, classname: "info_player_start", label: "Player start" },
	{ id: 1, classname: "enemy_grunt", label: "Enemy grunt", p1: "patrol" },
	{ id: 2, classname: "enemy_enforcer", label: "Enemy enforcer", p1: "patrol" },
	{ id: 3, classname: "enemy_ogre", label: "Enemy ogre", p1: "patrol" },
	{ id: 4, classname: "enemy_zombie", label: "Enemy zombie", p1: "patrol" },
	{ id: 5, classname: "enemy_hound", label: "Enemy hound", p1: "patrol" },
	{ id: 6, classname: "pickup_nailgun", label: "Pickup nailgun" },
	{ id: 7, classname: "pickup_grenadelauncher", label: "Pickup grenade launcher" },
	{ id: 8, classname: "pickup_health", label: "Pickup health" },
	{ id: 9, classname: "pickup_nails", label: "Pickup nails" },
	{ id: 10, classname: "pickup_grenades", label: "Pickup grenades" },
	{ id: 11, classname: "barrel", label: "Barrel" },
	{ id: 12, classname: "light", label: "Light", p1: "light", p2: "color" },
	{ id: 13, classname: "trigger_levelchange", label: "Level trigger" },
	{ id: 14, classname: "door", label: "Door", p1: "texture", p2: "dir" },
	{ id: 15, classname: "pickup_key", label: "Pickup key" },
	{ id: 16, classname: "torch", label: "Torch" }
];
const TEXTURE_COLORS = [
	"#615348", "#6f665c", "#83735b", "#9b7b55", "#766f46", "#4f6655",
	"#566d76", "#5d607c", "#85655d", "#a07a5c", "#3f4b4d", "#95635b",
	"#b78b45", "#6f844d", "#8f904f", "#4c706d", "#87543e", "#8f3532",
	"#6d3f48", "#48506e", "#5b3d37", "#8c6f51", "#5d5251", "#a13e3e",
	"#9a8e62", "#997247", "#384f59", "#7c6a86", "#9a936b", "#33383b",
	"#c96b3f"
];

const state = {
	blocks: [],
	entities: [],
	unsupported: 0,
	tool: "select",
	layer: 0,
	texture: 1,
	brushHeight: 1,
	showGrid: true,
	showLighting: true,
	ambientLight: 0.42,
	sunAngle: 315,
	selectedBlockId: null,
	selectedEntityId: null,
	nextId: 1,
	camera: {
		mode: "perspective",
		target: { x: 21, y: 3, z: 21 },
		yaw: -0.78,
		pitch: -0.58,
		distance: 46
	},
	view: null,
	isDragging: false,
	isOrbiting: false,
	isPanning: false,
	lastPointer: null,
	dragStart: null,
	dragCurrent: null
};

const el = {};

function boot() {
	for (const id of [
		"mapCanvas", "status", "mapImport", "exportMap", "exportPlb", "layerInput",
		"layerDown", "layerUp", "blockX", "blockY", "blockZ", "blockSx", "blockSy",
		"blockSz", "textureInput", "texturePalette", "entityType", "entityX",
		"entityY", "entityZ", "entityP1", "entityP2", "blockCount", "entityCount",
		"unsupportedCount", "addRoom", "clearMap", "brushHeight", "viewIso",
		"viewTop", "viewReset", "focusSelection", "showGrid", "showLighting",
		"ambientLight", "sunAngle", "lightPower", "lightColor", "addLight",
		"deleteSelected"
	]) {
		el[id] = document.getElementById(id);
	}

	for (const type of ENTITY_TYPES) {
		const option = document.createElement("option");
		option.value = type.id;
		option.textContent = type.label;
		el.entityType.append(option);
	}

	for (let i = 0; i < TEXTURE_COLORS.length; i++) {
		const swatch = document.createElement("button");
		swatch.className = "swatch";
		swatch.dataset.id = i;
		swatch.title = `Texture ${i}`;
		swatch.style.background = textureBackground(i);
		swatch.addEventListener("click", () => setTexture(i));
		el.texturePalette.append(swatch);
	}

	document.querySelectorAll("[data-tool]").forEach((button) => {
		button.addEventListener("click", () => setTool(button.dataset.tool));
	});

	el.mapImport.addEventListener("change", importMapFile);
	el.exportMap.addEventListener("click", () => downloadText("q1k3dit.map", exportMap()));
	el.exportPlb.addEventListener("click", () => downloadBlob("q1k3dit.plb", exportPlb()));
	el.layerInput.addEventListener("change", () => setLayer(Number(el.layerInput.value)));
	el.layerDown.addEventListener("click", () => setLayer(state.layer - 1));
	el.layerUp.addEventListener("click", () => setLayer(state.layer + 1));
	el.textureInput.addEventListener("change", () => setTexture(Number(el.textureInput.value)));
	el.brushHeight.addEventListener("change", () => setBrushHeight(Number(el.brushHeight.value)));
	el.viewIso.addEventListener("click", () => setCameraPreset("iso"));
	el.viewTop.addEventListener("click", () => setCameraPreset("top"));
	el.viewReset.addEventListener("click", resetCamera);
	el.focusSelection.addEventListener("click", focusSelection);
	el.showGrid.addEventListener("change", () => {
		state.showGrid = el.showGrid.checked;
		render();
	});
	el.showLighting.addEventListener("change", () => {
		state.showLighting = el.showLighting.checked;
		render();
	});
	el.ambientLight.addEventListener("input", () => {
		state.ambientLight = Number(el.ambientLight.value) / 100;
		render();
	});
	el.sunAngle.addEventListener("input", () => {
		state.sunAngle = Number(el.sunAngle.value);
		render();
	});
	el.lightPower.addEventListener("change", updateSelectedLightFromLightingControls);
	el.lightColor.addEventListener("input", updateSelectedLightFromLightingControls);
	el.addLight.addEventListener("click", addLightHere);
	el.deleteSelected.addEventListener("click", deleteSelected);
	el.addRoom.addEventListener("click", addStarterRoom);
	el.clearMap.addEventListener("click", clearMap);

	for (const input of [el.blockX, el.blockY, el.blockZ, el.blockSx, el.blockSy, el.blockSz, el.textureInput]) {
		input.addEventListener("change", updateSelectedBlockFromForm);
	}
	for (const input of [el.entityType, el.entityX, el.entityY, el.entityZ, el.entityP1, el.entityP2]) {
		input.addEventListener("change", updateSelectedEntityFromForm);
	}

	const canvas = el.mapCanvas;
	canvas.addEventListener("pointerdown", onPointerDown);
	canvas.addEventListener("pointermove", onPointerMove);
	canvas.addEventListener("pointerup", onPointerUp);
	canvas.addEventListener("pointerleave", onPointerUp);
	canvas.addEventListener("wheel", onWheel, { passive: false });
	canvas.addEventListener("contextmenu", (event) => event.preventDefault());
	window.addEventListener("keydown", onKeyDown);
	window.addEventListener("resize", resizeCanvas);

	addStarterRoom();
	resizeCanvas();
	render();
}

function textureBackground(index) {
	const base = TEXTURE_COLORS[index] || "#777";
	return `linear-gradient(135deg, ${base}, #1e2225), repeating-linear-gradient(45deg, transparent 0 7px, rgba(255,255,255,0.18) 7px 9px)`;
}

function setTool(tool) {
	state.tool = tool;
	document.querySelectorAll("[data-tool]").forEach((button) => {
		button.classList.toggle("is-active", button.dataset.tool === tool);
	});
	setStatus(`${tool} tool`);
}

function setLayer(layer) {
	state.layer = clamp(Math.round(layer), 0, MAP_SIZE - 1);
	el.layerInput.value = state.layer;
	state.brushHeight = clamp(state.brushHeight, 1, MAP_SIZE - state.layer);
	el.brushHeight.value = state.brushHeight;
	render();
}

function setTexture(texture) {
	state.texture = clamp(Math.round(texture), 0, 30);
	el.textureInput.value = state.texture;
	document.querySelectorAll(".swatch").forEach((swatch) => {
		swatch.classList.toggle("is-active", Number(swatch.dataset.id) === state.texture);
	});
	updateSelectedBlockFromForm();
	render();
}

function setBrushHeight(height) {
	state.brushHeight = clamp(Math.round(height), 1, MAP_SIZE - state.layer);
	el.brushHeight.value = state.brushHeight;
	render();
}

function resetCamera() {
	state.camera.mode = "perspective";
	state.camera.target = { x: 21, y: 3, z: 21 };
	state.camera.yaw = -0.78;
	state.camera.pitch = -0.58;
	state.camera.distance = 46;
	setStatus("Camera reset");
	render();
}

function setCameraPreset(preset) {
	if (preset === "top") {
		state.camera.mode = "top";
		state.camera.yaw = 0;
		state.camera.pitch = -Math.PI / 2;
		state.camera.distance = 58;
	}
	else {
		state.camera.mode = "perspective";
		state.camera.yaw = -0.78;
		state.camera.pitch = -0.58;
		state.camera.distance = 46;
	}
	setStatus(`${preset} view`);
	render();
}

function focusSelection() {
	const b = selectedBlock();
	const item = selectedEntity();
	if (b) {
		state.camera.target = { x: b.x + b.sx / 2, y: b.y + b.sy / 2, z: b.z + b.sz / 2 };
		state.camera.distance = clamp(Math.max(b.sx, b.sy, b.sz) * 4, 14, 90);
		setStatus("Focused brush");
	}
	else if (item) {
		state.camera.target = { x: item.x + 0.5, y: item.y + 1, z: item.z + 0.5 };
		state.camera.distance = 18;
		setStatus("Focused entity");
	}
	render();
}

function panCamera(dx, dy) {
	const view = state.view || cameraView(el.mapCanvas.width, el.mapCanvas.height);
	if (view.mode === "top") {
		state.camera.target.x -= dx / view.scale;
		state.camera.target.z -= dy / view.scale;
		return;
	}
	const worldPerPixel = state.camera.distance / view.focal;
	const moveRight = mul3(view.right, -dx * worldPerPixel);
	const moveUp = mul3(view.up, dy * worldPerPixel);
	state.camera.target = add3(state.camera.target, add3(moveRight, moveUp));
}

function addLightHere() {
	const target = state.camera.target;
	const light = entity(
		state.nextId++,
		12,
		clamp(Math.round(target.x), 0, MAP_SIZE - 1),
		clamp(Math.round(state.layer + 3), 0, MAP_SIZE - 1),
		clamp(Math.round(target.z), 0, MAP_SIZE - 1),
		formInt(el.lightPower, 192, 0, 255),
		hexToPackedColor(el.lightColor.value)
	);
	state.entities.push(light);
	selectEntity(light.id);
	setTool("select");
	setStatus("Light added");
	render();
}

function updateSelectedLightFromLightingControls() {
	const item = selectedEntity();
	if (!item || item.type !== 12) {
		return;
	}
	item.p1 = formInt(el.lightPower, item.p1, 0, 255);
	item.p2 = hexToPackedColor(el.lightColor.value);
	el.entityP1.value = item.p1;
	el.entityP2.value = item.p2;
	render();
}

function addStarterRoom() {
	const base = state.blocks.length === 0 ? 1 : state.nextId;
	state.blocks.push(
		block(base, 12, 0, 12, 18, 1, 18, 4),
		block(base + 1, 12, 8, 12, 18, 1, 18, 6),
		block(base + 2, 12, 1, 12, 1, 7, 18, 9),
		block(base + 3, 29, 1, 12, 1, 7, 18, 9),
		block(base + 4, 12, 1, 12, 18, 7, 1, 9),
		block(base + 5, 12, 1, 29, 18, 7, 1, 9)
	);
	state.nextId = base + 6;
	if (!state.entities.some((entity) => entity.type === 0)) {
		state.entities.push(entity(state.nextId++, 0, 20, 2, 20, 0, 0));
	}
	selectBlock(state.blocks[0].id);
	setStatus("Starter room added");
	render();
}

function clearMap() {
	state.blocks = [];
	state.entities = [];
	state.unsupported = 0;
	state.selectedBlockId = null;
	state.selectedEntityId = null;
	setStatus("Map cleared");
	refreshForms();
	render();
}

function deleteSelected() {
	if (state.selectedBlockId !== null) {
		state.blocks = state.blocks.filter((item) => item.id !== state.selectedBlockId);
		state.selectedBlockId = null;
		setStatus("Brush deleted");
		refreshForms();
		render();
		return;
	}
	if (state.selectedEntityId !== null) {
		state.entities = state.entities.filter((item) => item.id !== state.selectedEntityId);
		state.selectedEntityId = null;
		setStatus("Entity deleted");
		refreshForms();
		render();
		return;
	}
	setStatus("Nothing selected");
}

function block(id, x, y, z, sx, sy, sz, tex) {
	return { id, x, y, z, sx, sy, sz, tex };
}

function entity(id, type, x, y, z, p1, p2) {
	return { id, type, x, y, z, p1, p2 };
}

function resizeCanvas() {
	const rect = el.mapCanvas.parentElement.getBoundingClientRect();
	el.mapCanvas.width = Math.max(640, Math.floor(rect.width * devicePixelRatio));
	el.mapCanvas.height = Math.max(420, Math.floor(rect.height * devicePixelRatio));
	el.mapCanvas.style.width = `${rect.width}px`;
	el.mapCanvas.style.height = `${rect.height}px`;
	render();
}

function render() {
	const canvas = el.mapCanvas;
	const ctx = canvas.getContext("2d");
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	state.view = cameraView(canvas.width, canvas.height);
	drawScene(ctx, canvas.width, canvas.height);
	refreshStats();
}

function drawScene(ctx, width, height) {
	const sky = ctx.createLinearGradient(0, 0, 0, height);
	sky.addColorStop(0, "#171b1e");
	sky.addColorStop(0.55, "#252a2d");
	sky.addColorStop(1, "#111315");
	ctx.fillStyle = sky;
	ctx.fillRect(0, 0, width, height);
	if (state.showGrid) {
		drawGrid3d(ctx);
	}
	drawLayerPlane(ctx);
	drawWorldItems(ctx);
	drawDrag3d(ctx);
	drawViewportText(ctx);
}

function cameraView(width, height) {
	const camera = state.camera;
	if (camera.mode === "top") {
		return {
			mode: "top",
			width,
			height,
			position: { x: camera.target.x, y: MAP_SIZE * 2, z: camera.target.z },
			forward: { x: 0, y: -1, z: 0 },
			right: { x: 1, y: 0, z: 0 },
			up: { x: 0, y: 0, z: -1 },
			target: camera.target,
			scale: Math.min(width, height) / camera.distance
		};
	}
	const cp = Math.cos(camera.pitch);
	const sp = Math.sin(camera.pitch);
	const cy = Math.cos(camera.yaw);
	const sy = Math.sin(camera.yaw);
	const target = camera.target;
	const position = {
		x: target.x + sy * cp * camera.distance,
		y: target.y - sp * camera.distance,
		z: target.z + cy * cp * camera.distance
	};
	const forward = normalize3(sub3(target, position));
	const right = normalize3(cross3(forward, { x: 0, y: 1, z: 0 }));
	const up = normalize3(cross3(right, forward));
	return {
		width,
		height,
		position,
		forward,
		right,
		up,
		focal: Math.min(width, height) * 0.92
	};
}

function project(point) {
	const view = state.view;
	if (view.mode === "top") {
		return {
			x: view.width * 0.5 + (point.x - view.target.x) * view.scale,
			y: view.height * 0.5 + (point.z - view.target.z) * view.scale,
			z: MAP_SIZE * 2 - point.y
		};
	}
	const local = sub3(point, view.position);
	const z = dot3(local, view.forward);
	if (z <= 0.05) {
		return null;
	}
	const x = dot3(local, view.right);
	const y = dot3(local, view.up);
	return {
		x: view.width * 0.5 + x * view.focal / z,
		y: view.height * 0.5 - y * view.focal / z,
		z
	};
}

function drawGrid3d(ctx) {
	ctx.lineWidth = 1 * devicePixelRatio;
	for (let i = 0; i <= 64; i++) {
		const strong = i % 4 === 0;
		const color = strong ? "rgba(216, 208, 189, 0.26)" : "rgba(216, 208, 189, 0.11)";
		drawWorldLine(ctx, { x: i, y: 0, z: 0 }, { x: i, y: 0, z: 64 }, color);
		drawWorldLine(ctx, { x: 0, y: 0, z: i }, { x: 64, y: 0, z: i }, color);
	}
	drawWorldLine(ctx, { x: 0, y: 0, z: 0 }, { x: 64, y: 0, z: 0 }, "#c85832", 2);
	drawWorldLine(ctx, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 64 }, "#e0a33a", 2);
}

function drawLayerPlane(ctx) {
	const y = state.layer;
	const corners = [
		{ x: 0, y, z: 0 },
		{ x: 64, y, z: 0 },
		{ x: 64, y, z: 64 },
		{ x: 0, y, z: 64 }
	].map(project);
	if (corners.some((point) => !point)) {
		return;
	}
	ctx.beginPath();
	ctx.moveTo(corners[0].x, corners[0].y);
	for (let i = 1; i < corners.length; i++) {
		ctx.lineTo(corners[i].x, corners[i].y);
	}
	ctx.closePath();
	ctx.fillStyle = "rgba(224, 163, 58, 0.08)";
	ctx.fill();
	ctx.strokeStyle = "rgba(224, 163, 58, 0.48)";
	ctx.lineWidth = 2 * devicePixelRatio;
	ctx.stroke();
}

function drawWorldItems(ctx) {
	const faces = [];
	for (const b of state.blocks) {
		faces.push(...blockFaces(b));
	}
	faces.sort((a, b) => b.depth - a.depth);
	for (const face of faces) {
		drawFace(ctx, face);
	}

	const entityDraws = state.entities.map((item) => {
		const center = { x: item.x + 0.5, y: item.y + 0.8, z: item.z + 0.5 };
		const screen = project(center);
		return { item, center, screen, depth: screen?.z || 0 };
	}).filter((draw) => draw.screen).sort((a, b) => b.depth - a.depth);

	for (const draw of entityDraws) {
		drawEntity3d(ctx, draw);
	}
}

function blockFaces(b) {
	const x1 = b.x;
	const x2 = b.x + b.sx;
	const y1 = b.y;
	const y2 = b.y + b.sy;
	const z1 = b.z;
	const z2 = b.z + b.sz;
	const color = TEXTURE_COLORS[b.tex] || "#777";
	const selected = state.selectedBlockId === b.id;
	const definitions = [
		{ points: [{ x: x1, y: y2, z: z1 }, { x: x2, y: y2, z: z1 }, { x: x2, y: y2, z: z2 }, { x: x1, y: y2, z: z2 }], normal: { x: 0, y: 1, z: 0 }, shade: 1.14 },
		{ points: [{ x: x1, y: y1, z: z2 }, { x: x2, y: y1, z: z2 }, { x: x2, y: y2, z: z2 }, { x: x1, y: y2, z: z2 }], normal: { x: 0, y: 0, z: 1 }, shade: 0.92 },
		{ points: [{ x: x2, y: y1, z: z1 }, { x: x2, y: y1, z: z2 }, { x: x2, y: y2, z: z2 }, { x: x2, y: y2, z: z1 }], normal: { x: 1, y: 0, z: 0 }, shade: 0.82 },
		{ points: [{ x: x1, y: y1, z: z1 }, { x: x1, y: y2, z: z1 }, { x: x1, y: y2, z: z2 }, { x: x1, y: y1, z: z2 }], normal: { x: -1, y: 0, z: 0 }, shade: 0.7 },
		{ points: [{ x: x1, y: y1, z: z1 }, { x: x2, y: y1, z: z1 }, { x: x2, y: y2, z: z1 }, { x: x1, y: y2, z: z1 }], normal: { x: 0, y: 0, z: -1 }, shade: 0.78 }
	];
	return definitions.map((face) => ({
		item: b,
		points: face.points,
		screen: face.points.map(project),
		color: shadeColor(color, face.shade * lightAt(faceCenter(face.points), face.normal)),
		stroke: selected ? "#e0a33a" : "rgba(0,0,0,0.64)",
		depth: face.points.reduce((sum, point) => sum + projectDepth(point), 0) / face.points.length,
		selected
	})).filter((face) => face.screen.every((point) => point));
}

function drawFace(ctx, face) {
	ctx.beginPath();
	ctx.moveTo(face.screen[0].x, face.screen[0].y);
	for (let i = 1; i < face.screen.length; i++) {
		ctx.lineTo(face.screen[i].x, face.screen[i].y);
	}
	ctx.closePath();
	ctx.fillStyle = face.color;
	ctx.fill();
	ctx.strokeStyle = face.stroke;
	ctx.lineWidth = (face.selected ? 2.5 : 1) * devicePixelRatio;
	ctx.stroke();
}

function drawEntity3d(ctx, draw) {
	const screen = draw.screen;
	const size = clamp(900 / screen.z, 7 * devicePixelRatio, 18 * devicePixelRatio);
	if (draw.item.type === 12) {
		const glow = ctx.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, size * 4);
		glow.addColorStop(0, packedColorCss(draw.item.p2, 0.42));
		glow.addColorStop(1, "rgba(255,255,255,0)");
		ctx.fillStyle = glow;
		ctx.beginPath();
		ctx.arc(screen.x, screen.y, size * 4, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.beginPath();
	ctx.arc(screen.x, screen.y, size, 0, Math.PI * 2);
	ctx.fillStyle = state.selectedEntityId === draw.item.id ? "#e0a33a" : entityColor(draw.item);
	ctx.fill();
	ctx.strokeStyle = "#17191b";
	ctx.lineWidth = 2 * devicePixelRatio;
	ctx.stroke();
	ctx.fillStyle = "#17191b";
	ctx.font = `${10 * devicePixelRatio}px Avenir Next, Segoe UI, sans-serif`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(String(draw.item.type), screen.x, screen.y);
	ctx.textAlign = "start";
	ctx.textBaseline = "alphabetic";
	drawWorldLine(ctx, { x: draw.item.x + 0.5, y: draw.item.y, z: draw.item.z + 0.5 }, draw.center, "rgba(243,238,227,0.48)");
}

function drawDrag3d(ctx) {
	if (!state.isDragging || !state.dragStart || !state.dragCurrent || state.tool !== "block") {
		return;
	}
	const preview = block(-1, dragBox().x, state.layer, dragBox().z, dragBox().sx, state.brushHeight, dragBox().sz, state.texture);
	for (const face of blockFaces(preview).sort((a, b) => b.depth - a.depth)) {
		face.color = "rgba(224, 163, 58, 0.28)";
		face.stroke = "#e0a33a";
		drawFace(ctx, face);
	}
}

function drawViewportText(ctx) {
	ctx.fillStyle = "#d8d0bd";
	ctx.font = `${12 * devicePixelRatio}px Avenir Next, Segoe UI, sans-serif`;
	ctx.fillText(`Layer Y ${state.layer}`, 14 * devicePixelRatio, 24 * devicePixelRatio);
	ctx.fillText(`Brush height ${state.brushHeight}`, 14 * devicePixelRatio, 44 * devicePixelRatio);
	ctx.fillText("Right drag orbit  Wheel zoom  Left drag edit", 14 * devicePixelRatio, 64 * devicePixelRatio);
}

function drawWorldLine(ctx, a, b, color, width = 1) {
	const pa = project(a);
	const pb = project(b);
	if (!pa || !pb) {
		return;
	}
	ctx.beginPath();
	ctx.moveTo(pa.x, pa.y);
	ctx.lineTo(pb.x, pb.y);
	ctx.strokeStyle = color;
	ctx.lineWidth = width * devicePixelRatio;
	ctx.stroke();
}

function faceCenter(points) {
	return mul3(points.reduce((sum, point) => add3(sum, point), { x: 0, y: 0, z: 0 }), 1 / points.length);
}

function lightAt(point, normal) {
	if (!state.showLighting) {
		return 1;
	}
	const sun = sunVector();
	let value = state.ambientLight + Math.max(0, dot3(normal, sun)) * 0.52;
	for (const item of state.entities) {
		if (item.type !== 12) {
			continue;
		}
		const lightPos = { x: item.x + 0.5, y: item.y + 0.8, z: item.z + 0.5 };
		const toLight = sub3(lightPos, point);
		const distance = Math.hypot(toLight.x, toLight.y, toLight.z);
		const strength = clamp((item.p1 || 0) / 255, 0, 1);
		const facing = Math.max(0, dot3(normal, normalize3(toLight)));
		value += facing * strength * clamp(1 - distance / 18, 0, 1) * 1.1;
	}
	return clamp(value, 0.22, 1.45);
}

function sunVector() {
	const angle = state.sunAngle * Math.PI / 180;
	return normalize3({ x: Math.cos(angle) * 0.62, y: 0.74, z: Math.sin(angle) * 0.62 });
}

function entityColor(item) {
	if (item.type === 12) {
		return packedColorCss(item.p2, 1);
	}
	if (item.type === 0) {
		return "#f3eee3";
	}
	if (item.type >= 1 && item.type <= 5) {
		return "#c85832";
	}
	if (item.type === 13) {
		return "#6da0a5";
	}
	return "#e0a33a";
}

function rayPlaneCell(x, y, layer) {
	const ray = screenRay(x, y);
	if (Math.abs(ray.dir.y) < 0.0001) {
		return null;
	}
	const t = (layer - ray.origin.y) / ray.dir.y;
	if (t <= 0) {
		return null;
	}
	const hit = add3(ray.origin, mul3(ray.dir, t));
	return { x: Math.floor(hit.x), z: Math.floor(hit.z) };
}

function pickScene(event) {
	const rect = el.mapCanvas.getBoundingClientRect();
	const x = (event.clientX - rect.left) * devicePixelRatio;
	const y = (event.clientY - rect.top) * devicePixelRatio;
	const ray = screenRay(x, y);
	let best = null;
	for (const item of state.entities) {
		const center = { x: item.x + 0.5, y: item.y + 0.8, z: item.z + 0.5 };
		const t = raySphere(ray, center, 0.5);
		if (t !== null && (!best || t < best.t)) {
			best = { kind: "entity", item, t };
		}
	}
	for (const b of state.blocks) {
		const t = rayBox(ray, { x: b.x, y: b.y, z: b.z }, { x: b.x + b.sx, y: b.y + b.sy, z: b.z + b.sz });
		if (t !== null && (!best || t < best.t)) {
			best = { kind: "block", item: b, t };
		}
	}
	return best;
}

function screenRay(x, y) {
	const view = state.view || cameraView(el.mapCanvas.width, el.mapCanvas.height);
	if (view.mode === "top") {
		return {
			origin: {
				x: view.target.x + (x - view.width * 0.5) / view.scale,
				y: MAP_SIZE * 2,
				z: view.target.z + (y - view.height * 0.5) / view.scale
			},
			dir: { x: 0, y: -1, z: 0 }
		};
	}
	const nx = (x - view.width * 0.5) / view.focal;
	const ny = -(y - view.height * 0.5) / view.focal;
	const dir = normalize3(add3(add3(mul3(view.right, nx), mul3(view.up, ny)), view.forward));
	return { origin: view.position, dir };
}

function rayBox(ray, min, max) {
	let tMin = 0;
	let tMax = Infinity;
	for (const axis of ["x", "y", "z"]) {
		if (Math.abs(ray.dir[axis]) < 0.0001) {
			if (ray.origin[axis] < min[axis] || ray.origin[axis] > max[axis]) {
				return null;
			}
			continue;
		}
		let t1 = (min[axis] - ray.origin[axis]) / ray.dir[axis];
		let t2 = (max[axis] - ray.origin[axis]) / ray.dir[axis];
		if (t1 > t2) {
			[t1, t2] = [t2, t1];
		}
		tMin = Math.max(tMin, t1);
		tMax = Math.min(tMax, t2);
		if (tMin > tMax) {
			return null;
		}
	}
	return tMin;
}

function raySphere(ray, center, radius) {
	const oc = sub3(ray.origin, center);
	const a = dot3(ray.dir, ray.dir);
	const b = 2 * dot3(oc, ray.dir);
	const c = dot3(oc, oc) - radius * radius;
	const discriminant = b * b - 4 * a * c;
	if (discriminant < 0) {
		return null;
	}
	const t = (-b - Math.sqrt(discriminant)) / (2 * a);
	return t > 0 ? t : null;
}

function projectDepth(point) {
	return dot3(sub3(point, state.view.position), state.view.forward);
}

function shadeColor(hex, factor) {
	const rgb = hex.replace("#", "");
	const r = clamp(Math.round(Number.parseInt(rgb.slice(0, 2), 16) * factor), 0, 255);
	const g = clamp(Math.round(Number.parseInt(rgb.slice(2, 4), 16) * factor), 0, 255);
	const b = clamp(Math.round(Number.parseInt(rgb.slice(4, 6), 16) * factor), 0, 255);
	return `rgb(${r}, ${g}, ${b})`;
}

function add3(a, b) {
	return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub3(a, b) {
	return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function mul3(a, n) {
	return { x: a.x * n, y: a.y * n, z: a.z * n };
}

function dot3(a, b) {
	return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross3(a, b) {
	return {
		x: a.y * b.z - a.z * b.y,
		y: a.z * b.x - a.x * b.z,
		z: a.x * b.y - a.y * b.x
	};
}

function normalize3(a) {
	const length = Math.hypot(a.x, a.y, a.z) || 1;
	return { x: a.x / length, y: a.y / length, z: a.z / length };
}

function onPointerDown(event) {
	el.mapCanvas.setPointerCapture(event.pointerId);
	state.lastPointer = { x: event.clientX, y: event.clientY };
	if (event.button === 1) {
		state.isPanning = true;
		setStatus("Pan camera");
		return;
	}
	if (event.button === 2 || event.altKey || event.metaKey) {
		if (state.camera.mode === "top") {
			state.camera.mode = "perspective";
			state.camera.pitch = -0.58;
		}
		state.isOrbiting = true;
		setStatus("Orbit camera");
		return;
	}
	const cell = eventToCell(event);
	state.isDragging = true;
	state.dragStart = cell;
	state.dragCurrent = cell;

	if (state.tool === "select") {
		const hit = pickScene(event);
		if (hit?.kind === "entity") {
			selectEntity(hit.item.id);
			render();
			return;
		}
		selectBlock(hit?.kind === "block" ? hit.item.id : null);
	}
	else if (state.tool === "erase" && cell) {
		eraseAt(cell);
	}
	else if (state.tool === "entity" && cell) {
		const type = Number(el.entityType.value);
		const item = entity(state.nextId++, type, cell.x, state.layer, cell.z, defaultP1(type), defaultP2(type));
		state.entities.push(item);
		selectEntity(item.id);
		setStatus("Entity placed");
	}
	render();
}

function onPointerMove(event) {
	if (state.isPanning && state.lastPointer) {
		const dx = (event.clientX - state.lastPointer.x) * devicePixelRatio;
		const dy = (event.clientY - state.lastPointer.y) * devicePixelRatio;
		panCamera(dx, dy);
		state.lastPointer = { x: event.clientX, y: event.clientY };
		render();
		return;
	}
	if (state.isOrbiting && state.lastPointer) {
		const dx = event.clientX - state.lastPointer.x;
		const dy = event.clientY - state.lastPointer.y;
		state.camera.yaw -= dx * 0.008;
		state.camera.pitch = clamp(state.camera.pitch + dy * 0.006, -1.25, -0.12);
		state.lastPointer = { x: event.clientX, y: event.clientY };
		render();
		return;
	}
	const cell = eventToCell(event);
	state.dragCurrent = cell;
	el.status.textContent = cell ? `X ${cell.x} Y ${state.layer} Z ${cell.z}` : "Outside edit plane";
	if (state.isDragging && state.tool === "erase") {
		if (cell) {
			eraseAt(cell);
		}
		render();
	}
	else if (state.isDragging && state.tool === "block") {
		render();
	}
}

function onPointerUp(event) {
	if (state.isDragging && state.tool === "block" && state.dragStart && state.dragCurrent) {
		const box = dragBox();
		const created = block(state.nextId++, box.x, state.layer, box.z, box.sx, state.brushHeight, box.sz, state.texture);
		state.blocks.push(created);
		selectBlock(created.id);
		setStatus("Brush placed");
	}
	if (event?.pointerId !== undefined && el.mapCanvas.hasPointerCapture(event.pointerId)) {
		el.mapCanvas.releasePointerCapture(event.pointerId);
	}
	state.isDragging = false;
	state.isOrbiting = false;
	state.isPanning = false;
	state.lastPointer = null;
	state.dragStart = null;
	state.dragCurrent = null;
	render();
}

function onKeyDown(event) {
	const tag = document.activeElement?.tagName;
	if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") {
		return;
	}
	if (event.key === "Delete" || event.key === "Backspace") {
		event.preventDefault();
		deleteSelected();
	}
}

function eventToCell(event) {
	const rect = el.mapCanvas.getBoundingClientRect();
	const x = (event.clientX - rect.left) * devicePixelRatio;
	const y = (event.clientY - rect.top) * devicePixelRatio;
	const hit = rayPlaneCell(x, y, state.layer);
	if (!hit || hit.x < 0 || hit.z < 0 || hit.x >= MAP_SIZE || hit.z >= MAP_SIZE) {
		return null;
	}
	return hit;
}

function onWheel(event) {
	event.preventDefault();
	const zoom = Math.exp(event.deltaY * 0.001);
	state.camera.distance = clamp(state.camera.distance * zoom, 10, 150);
	render();
}

function dragBox() {
	const x1 = Math.min(state.dragStart.x, state.dragCurrent.x);
	const x2 = Math.max(state.dragStart.x, state.dragCurrent.x);
	const z1 = Math.min(state.dragStart.z, state.dragCurrent.z);
	const z2 = Math.max(state.dragStart.z, state.dragCurrent.z);
	return { x: x1, z: z1, sx: x2 - x1 + 1, sz: z2 - z1 + 1 };
}

function findBlockAt(x, y, z) {
	for (let i = state.blocks.length - 1; i >= 0; i--) {
		const b = state.blocks[i];
		if (x >= b.x && x < b.x + b.sx && y >= b.y && y < b.y + b.sy && z >= b.z && z < b.z + b.sz) {
			return b;
		}
	}
	return null;
}

function findEntityAt(x, y, z) {
	return state.entities.find((item) => item.x === x && item.y === y && item.z === z);
}

function eraseAt(cell) {
	const blockAtCell = findBlockAt(cell.x, state.layer, cell.z);
	if (blockAtCell) {
		state.blocks = state.blocks.filter((item) => item.id !== blockAtCell.id);
		if (state.selectedBlockId === blockAtCell.id) {
			selectBlock(null);
		}
		setStatus("Brush erased");
	}
	const entityAtCell = findEntityAt(cell.x, state.layer, cell.z);
	if (entityAtCell) {
		state.entities = state.entities.filter((item) => item.id !== entityAtCell.id);
		if (state.selectedEntityId === entityAtCell.id) {
			selectEntity(null);
		}
		setStatus("Entity erased");
	}
}

function selectBlock(id) {
	state.selectedBlockId = id;
	state.selectedEntityId = null;
	refreshForms();
}

function selectEntity(id) {
	state.selectedEntityId = id;
	state.selectedBlockId = null;
	refreshForms();
}

function selectedBlock() {
	return state.blocks.find((item) => item.id === state.selectedBlockId);
}

function selectedEntity() {
	return state.entities.find((item) => item.id === state.selectedEntityId);
}

function refreshForms() {
	const b = selectedBlock();
	for (const [input, value] of [
		[el.blockX, b?.x], [el.blockY, b?.y], [el.blockZ, b?.z],
		[el.blockSx, b?.sx], [el.blockSy, b?.sy], [el.blockSz, b?.sz]
	]) {
		input.value = value ?? "";
	}
	if (b) {
		setTexture(b.tex);
	}

	const item = selectedEntity();
	el.entityType.value = item?.type ?? 0;
	el.entityX.value = item?.x ?? "";
	el.entityY.value = item?.y ?? "";
	el.entityZ.value = item?.z ?? "";
	el.entityP1.value = item?.p1 ?? "";
	el.entityP2.value = item?.p2 ?? "";
	if (item?.type === 12) {
		el.lightPower.value = item.p1 || 192;
		el.lightColor.value = packedColorHex(item.p2 || 0);
	}
}

function updateSelectedBlockFromForm() {
	const b = selectedBlock();
	if (!b) {
		return;
	}
	b.x = formInt(el.blockX, b.x, 0, MAP_SIZE - 1);
	b.y = formInt(el.blockY, b.y, 0, MAP_SIZE - 1);
	b.z = formInt(el.blockZ, b.z, 0, MAP_SIZE - 1);
	b.sx = formInt(el.blockSx, b.sx, 1, MAP_SIZE - b.x);
	b.sy = formInt(el.blockSy, b.sy, 1, MAP_SIZE - b.y);
	b.sz = formInt(el.blockSz, b.sz, 1, MAP_SIZE - b.z);
	b.tex = formInt(el.textureInput, b.tex, 0, 30);
	state.texture = b.tex;
	setLayer(b.y);
	render();
}

function updateSelectedEntityFromForm() {
	const item = selectedEntity();
	if (!item) {
		return;
	}
	item.type = formInt(el.entityType, item.type, 0, 16);
	item.x = formInt(el.entityX, item.x, 0, MAP_SIZE - 1);
	item.y = formInt(el.entityY, item.y, 0, MAP_SIZE - 1);
	item.z = formInt(el.entityZ, item.z, 0, MAP_SIZE - 1);
	item.p1 = formInt(el.entityP1, item.p1, 0, 255);
	item.p2 = formInt(el.entityP2, item.p2, 0, 255);
	if (item.type === 12) {
		el.lightPower.value = item.p1;
		el.lightColor.value = packedColorHex(item.p2);
	}
	setLayer(item.y);
	render();
}

function formInt(input, fallback, min, max) {
	const value = Number(input.value);
	const result = Number.isFinite(value) ? Math.round(value) : fallback;
	return clamp(result, min, max);
}

function refreshStats() {
	el.blockCount.textContent = `${state.blocks.length} brushes`;
	el.entityCount.textContent = `${state.entities.length} entities`;
	el.unsupportedCount.textContent = `${state.unsupported} skipped`;
	document.querySelectorAll(".swatch").forEach((swatch) => {
		swatch.classList.toggle("is-active", Number(swatch.dataset.id) === state.texture);
	});
}

function importMapFile(event) {
	const file = event.target.files[0];
	if (!file) {
		return;
	}
	const reader = new FileReader();
	reader.onload = () => {
		importMap(String(reader.result || ""));
		event.target.value = "";
	};
	reader.readAsText(file);
}

function importMap(text) {
	const parsed = parseMap(text);
	state.blocks = parsed.blocks.map((item) => ({ ...item, id: state.nextId++ }));
	state.entities = parsed.entities.map((item) => ({ ...item, id: state.nextId++ }));
	state.unsupported = parsed.unsupported;
	selectBlock(state.blocks[0]?.id ?? null);
	setStatus(`Imported ${state.blocks.length} brushes`);
	render();
}

function parseMap(text) {
	const entities = [];
	const blocks = [];
	let unsupported = 0;
	const entityTexts = topLevelBlocks(text);
	for (const entityText of entityTexts) {
		const kvs = parseKvs(entityText);
		const classname = kvs.classname || "";
		if (classname === "worldspawn") {
			for (const brushText of topLevelBlocks(entityText)) {
				const parsed = parseBrush(brushText);
				if (parsed) {
					blocks.push(parsed);
				}
				else {
					unsupported++;
				}
			}
		}
		else {
			const type = ENTITY_TYPES.find((item) => item.classname === classname);
			const origin = parseOrigin(kvs.origin || "0 0 0");
			if (!type) {
				unsupported++;
				continue;
			}
			entities.push({
				type: type.id,
				x: clamp(Math.round(origin.x / CELL_XZ), 0, MAP_SIZE - 1),
				y: clamp(Math.round(origin.z / CELL_Y), 0, MAP_SIZE - 1),
				z: clamp(Math.round(origin.y / CELL_XZ), 0, MAP_SIZE - 1),
				p1: entityP1FromKvs(type, kvs),
				p2: entityP2FromKvs(type, kvs)
			});
		}
	}
	return { blocks, entities, unsupported };
}

function topLevelBlocks(text) {
	const blocks = [];
	let depth = 0;
	let start = -1;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (ch === "{") {
			if (depth === 0) {
				start = i + 1;
			}
			depth++;
		}
		else if (ch === "}") {
			depth--;
			if (depth === 0 && start >= 0) {
				blocks.push(text.slice(start, i));
				start = -1;
			}
		}
	}
	return blocks;
}

function parseKvs(text) {
	const kvs = {};
	const pattern = /"([^"]+)"\s+"([^"]*)"/g;
	let match = pattern.exec(text);
	while (match) {
		kvs[match[1]] = match[2];
		match = pattern.exec(text);
	}
	return kvs;
}

function parseBrush(text) {
	const lines = text.split("\n").filter((lineText) => lineText.trim().startsWith("("));
	if (lines.length < 6) {
		return null;
	}
	const points = [];
	let texture = 1;
	for (const lineText of lines) {
		const nums = [...lineText.matchAll(/\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/g)];
		if (nums.length !== 3) {
			return null;
		}
		for (const match of nums) {
			points.push({ x: Number(match[1]), y: Number(match[2]), z: Number(match[3]) });
		}
		const tail = lineText.replace(/^.*\)\s*/, "").trim().split(/\s+/);
		const tex = Number.parseInt(tail[0], 10);
		if (Number.isFinite(tex)) {
			texture = tex;
		}
	}
	const xs = uniqueSorted(points.map((p) => p.x));
	const ys = uniqueSorted(points.map((p) => p.y));
	const zs = uniqueSorted(points.map((p) => p.z));
	if (xs.length !== 2 || ys.length !== 2 || zs.length !== 2) {
		return null;
	}
	const min = { x: xs[0], y: ys[0], z: zs[0] };
	const max = { x: xs[1], y: ys[1], z: zs[1] };
	const sx = Math.round((max.x - min.x) / CELL_XZ);
	const sy = Math.round((max.z - min.z) / CELL_Y);
	const sz = Math.round((max.y - min.y) / CELL_XZ);
	if (sx < 1 || sy < 1 || sz < 1) {
		return null;
	}
	return {
		x: clamp(Math.round(min.x / CELL_XZ), 0, MAP_SIZE - 1),
		y: clamp(Math.round(min.z / CELL_Y), 0, MAP_SIZE - 1),
		z: clamp(Math.round(min.y / CELL_XZ), 0, MAP_SIZE - 1),
		sx: clamp(sx, 1, MAP_SIZE - 1),
		sy: clamp(sy, 1, MAP_SIZE - 1),
		sz: clamp(sz, 1, MAP_SIZE - 1),
		tex: clamp(texture, 0, 30)
	};
}

function uniqueSorted(values) {
	return [...new Set(values.map((value) => Math.round(value)))].sort((a, b) => a - b);
}

function parseOrigin(text) {
	const parts = text.trim().split(/\s+/).map(Number);
	return { x: parts[0] || 0, y: parts[1] || 0, z: parts[2] || 0 };
}

function entityP1FromKvs(type, kvs) {
	if (type.classname.startsWith("enemy_")) {
		return Number(kvs.patrol || 0);
	}
	if (type.classname === "light") {
		return Number(kvs.light || 192);
	}
	if (type.classname === "door") {
		return Number(kvs.texture || 1);
	}
	return 0;
}

function entityP2FromKvs(type, kvs) {
	if (type.classname === "light") {
		return packColor(kvs.color || "255 220 180");
	}
	if (type.classname === "door") {
		return Number(kvs.dir || 0);
	}
	return 0;
}

function defaultP1(typeId) {
	const type = ENTITY_TYPES[typeId];
	if (type?.classname === "light") {
		return 192;
	}
	if (type?.classname === "door") {
		return state.texture;
	}
	return 0;
}

function defaultP2(typeId) {
	const type = ENTITY_TYPES[typeId];
	if (type?.classname === "light") {
		return packColor("255 220 180");
	}
	return 0;
}

function exportMap() {
	const lines = [
		"// Game: qu1k3",
		"// Format: Standard",
		"{",
		"\"message\" \"q1k3dit map\"",
		"\"wad\" \"gfx/base.wad\"",
		"\"classname\" \"worldspawn\"",
		"\"_tb_textures\" \"assets/textures\""
	];
	state.blocks.forEach((b, index) => {
		lines.push(`// brush ${index}`);
		lines.push(...brushToMapLines(b));
	});
	lines.push("}");
	for (const item of state.entities) {
		lines.push(...entityToMapLines(item));
	}
	return `${lines.join("\n")}\n`;
}

function brushToMapLines(b) {
	const x1 = b.x * CELL_XZ;
	const x2 = (b.x + b.sx) * CELL_XZ;
	const y1 = b.z * CELL_XZ;
	const y2 = (b.z + b.sz) * CELL_XZ;
	const z1 = b.y * CELL_Y;
	const z2 = (b.y + b.sy) * CELL_Y;
	const t = b.tex;
	return [
		"{",
		`( ${x1} ${y2} ${z2} ) ( ${x1} ${y1} ${z2} ) ( ${x1} ${y1} ${z1} ) ${t} 0 0 0 1 1`,
		`( ${x1} ${y1} ${z2} ) ( ${x2} ${y1} ${z2} ) ( ${x2} ${y1} ${z1} ) ${t} 0 0 0 1 1`,
		`( ${x2} ${y2} ${z1} ) ( ${x1} ${y2} ${z1} ) ( ${x1} ${y1} ${z1} ) ${t} 0 0 0 1 1`,
		`( ${x1} ${y1} ${z2} ) ( ${x1} ${y2} ${z2} ) ( ${x2} ${y2} ${z2} ) ${t} 0 0 0 1 1`,
		`( ${x2} ${y2} ${z2} ) ( ${x1} ${y2} ${z2} ) ( ${x1} ${y2} ${z1} ) ${t} 0 0 0 1 1`,
		`( ${x2} ${y1} ${z2} ) ( ${x2} ${y2} ${z2} ) ( ${x2} ${y2} ${z1} ) ${t} 0 0 0 1 1`,
		"}"
	];
}

function entityToMapLines(item) {
	const type = ENTITY_TYPES[item.type] || ENTITY_TYPES[0];
	const x = item.x * CELL_XZ;
	const y = item.z * CELL_XZ;
	const z = item.y * CELL_Y;
	const lines = [
		"{",
		`"classname" "${type.classname}"`,
		`"origin" "${x} ${y} ${z}"`
	];
	if (type.classname.startsWith("enemy_")) {
		lines.push(`"patrol" "${item.p1 || 0}"`);
	}
	if (type.classname === "light") {
		lines.push(`"light" "${item.p1 || 192}"`);
		lines.push(`"color" "${unpackColor(item.p2 || 0)}"`);
	}
	if (type.classname === "door") {
		lines.push(`"texture" "${item.p1 || 1}"`);
		lines.push(`"dir" "${item.p2 || 0}"`);
	}
	lines.push("}");
	return lines;
}

function exportPlb() {
	const blocks = [...state.blocks].sort((a, b) => a.tex === b.tex ? a.sx - b.sx : a.tex - b.tex);
	let blockBytes = blocks.length * 6;
	let lastTex = -1;
	for (const b of blocks) {
		if (b.tex !== lastTex) {
			blockBytes += 2;
			lastTex = b.tex;
		}
	}
	const entityBytes = state.entities.length * 6;
	const buffer = new ArrayBuffer(2 + blockBytes + 2 + entityBytes);
	const data = new Uint8Array(buffer);
	let i = writeU16(data, 0, blockBytes);
	lastTex = -1;
	for (const b of blocks) {
		if (b.tex !== lastTex) {
			data[i++] = 255;
			data[i++] = b.tex;
			lastTex = b.tex;
		}
		data[i++] = b.x;
		data[i++] = b.y;
		data[i++] = b.z;
		data[i++] = b.sx;
		data[i++] = b.sy;
		data[i++] = b.sz;
	}
	const entities = [...state.entities].sort((a, b) => a.type - b.type);
	i = writeU16(data, i, entities.length);
	for (const item of entities) {
		data[i++] = item.type;
		data[i++] = item.x;
		data[i++] = item.y;
		data[i++] = item.z;
		data[i++] = item.p1 || 0;
		data[i++] = item.p2 || 0;
	}
	return new Blob([buffer], { type: "application/octet-stream" });
}

function writeU16(data, offset, value) {
	data[offset] = value & 255;
	data[offset + 1] = (value >> 8) & 255;
	return offset + 2;
}

function packColor(text) {
	const [r, g, b] = text.trim().split(/\s+/).map(Number);
	return ((r || 0) >> 5) | (((g || 0) >> 5) << 3) | (((b || 0) >> 6) << 6);
}

function hexToPackedColor(hex) {
	const value = hex.replace("#", "");
	const r = Number.parseInt(value.slice(0, 2), 16);
	const g = Number.parseInt(value.slice(2, 4), 16);
	const b = Number.parseInt(value.slice(4, 6), 16);
	return packColor(`${r} ${g} ${b}`);
}

function unpackColor(value) {
	const r = (value & 7) << 5;
	const g = ((value >> 3) & 7) << 5;
	const b = ((value >> 6) & 3) << 6;
	return `${r} ${g} ${b}`;
}

function packedColorHex(value) {
	const [r, g, b] = unpackColor(value).split(" ").map(Number);
	return `#${hexByte(r)}${hexByte(g)}${hexByte(b)}`;
}

function packedColorCss(value, alpha) {
	const [r, g, b] = unpackColor(value).split(" ").map(Number);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexByte(value) {
	return clamp(value, 0, 255).toString(16).padStart(2, "0");
}

function downloadText(filename, text) {
	downloadBlob(filename, new Blob([text], { type: "text/plain" }));
}

function downloadBlob(filename, blob) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	link.click();
	URL.revokeObjectURL(url);
}

function setStatus(message) {
	el.status.textContent = message;
}

function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

boot();
