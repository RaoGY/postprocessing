import {
	AmbientLight,
	CubeTextureLoader,
	DirectionalLight,
	PerspectiveCamera,
	Raycaster,
	sRGBEncoding,
	Vector2
} from "three";

import { DeltaControls } from "delta-controls";
import { ProgressManager } from "../utils/ProgressManager.js";
import { Cage } from "./objects/Cage.js";
import { SphereCloud } from "./objects/SphereCloud.js";
import { PostProcessingDemo } from "./PostProcessingDemo.js";

import {
	BlendFunction,
	BloomEffect,
	EdgeDetectionMode,
	EffectPass,
	KernelSize,
	SelectiveBloomEffect,
	SMAAEffect,
	SMAAPreset,
	SMAAImageLoader
} from "../../../src";

/**
 * A mouse position.
 *
 * @type {Vector2}
 * @private
 */

const mouse = new Vector2();

/**
 * A bloom demo setup.
 *
 * @implements {EventListener}
 */

export class BloomDemo extends PostProcessingDemo {

	/**
	 * Constructs a new bloom demo.
	 *
	 * @param {EffectComposer} composer - An effect composer.
	 */

	constructor(composer) {

		super("bloom", composer);

		/**
		 * A raycaster.
		 *
		 * @type {Raycaster}
		 * @private
		 */

		this.raycaster = null;

		/**
		 * A selected object.
		 *
		 * @type {Object3D}
		 * @private
		 */

		this.selectedObject = null;

		/**
		 * A bloom effect.
		 *
		 * @type {BloomEffect}
		 * @private
		 */

		this.effectA = null;

		/**
		 * A selective bloom effect.
		 *
		 * @type {SelectiveBloomEffect}
		 * @private
		 */

		this.effectB = null;

		/**
		 * A pass that contains the normal bloom effect.
		 *
		 * @type {Pass}
		 * @private
		 */

		this.passA = null;

		/**
		 * A pass that contains the selective bloom effect.
		 *
		 * @type {Pass}
		 * @private
		 */

		this.passB = null;

		/**
		 * An object.
		 *
		 * @type {Object3D}
		 * @private
		 */

		this.object = null;

	}

	/**
	 * Raycasts the scene.
	 *
	 * @param {PointerEvent} event - A pointer event.
	 */

	raycast(event) {

		const raycaster = this.raycaster;

		mouse.x = (event.clientX / window.innerWidth) * 2.0 - 1.0;
		mouse.y = -(event.clientY / window.innerHeight) * 2.0 + 1.0;

		raycaster.setFromCamera(mouse, this.camera);
		const intersects = raycaster.intersectObjects(this.object.children);

		this.selectedObject = null;

		if(intersects.length > 0) {

			const x = intersects[0];

			if(x.object !== undefined) {

				this.selectedObject = x.object;

			} else {

				console.warn("Encountered an undefined object", intersects);

			}

		}

	}

	/**
	 * Handles the current selection.
	 *
	 * @private
	 */

	handleSelection() {

		const selection = this.effectB.selection;
		const selectedObject = this.selectedObject;

		if(selectedObject !== null) {

			if(selection.has(selectedObject)) {

				selection.delete(selectedObject);

			} else {

				selection.add(selectedObject);

			}

		}

	}

	/**
	 * Raycasts on mouse move events.
	 *
	 * @param {Event} event - An event.
	 */

	handleEvent(event) {

		switch(event.type) {

			case "mousemove":
				this.raycast(event);
				break;

			case "mousedown":
				this.handleSelection();
				break;

		}

	}

	/**
	 * Loads scene assets.
	 *
	 * @return {Promise} A promise that returns a collection of assets.
	 */

	load() {

		const assets = this.assets;
		const loadingManager = this.loadingManager;
		const cubeTextureLoader = new CubeTextureLoader(loadingManager);
		const smaaImageLoader = new SMAAImageLoader(loadingManager);

		const path = "textures/skies/space-green/";
		const format = ".jpg";
		const urls = [
			path + "px" + format, path + "nx" + format,
			path + "py" + format, path + "ny" + format,
			path + "pz" + format, path + "nz" + format
		];

		return new Promise((resolve, reject) => {

			if(assets.size === 0) {

				loadingManager.onLoad = () => setTimeout(resolve, 250);
				loadingManager.onProgress = ProgressManager.updateProgress;
				loadingManager.onError = reject;

				cubeTextureLoader.load(urls, (t) => {

					t.encoding = sRGBEncoding;
					assets.set("sky", t);

				});

				smaaImageLoader.load(([search, area]) => {

					assets.set("smaa-search", search);
					assets.set("smaa-area", area);

				});

			} else {

				resolve();

			}

		});

	}

	/**
	 * Creates the scene.
	 */

	initialize() {

		const scene = this.scene;
		const assets = this.assets;
		const composer = this.composer;
		const renderer = composer.getRenderer();

		// Camera.

		const aspect = window.innerWidth / window.innerHeight;
		const camera = new PerspectiveCamera(50, aspect, 1, 2000);
		camera.position.set(-10, 6, 15);
		camera.lookAt(scene.position);
		this.camera = camera;

		// Controls.

		const controls = new DeltaControls(camera.position, camera.quaternion, renderer.domElement);
		controls.settings.pointer.lock = false;
		controls.settings.translation.enabled = false;
		controls.settings.sensitivity.zoom = 1.0;
		controls.lookAt(scene.position);
		this.controls = controls;

		// Sky.

		scene.background = assets.get("sky");

		// Lights.

		const ambientLight = new AmbientLight(0x212121);
		const mainLight = new DirectionalLight(0xffffff, 1.0);
		const backLight = new DirectionalLight(0xff7e66, 0.1);

		mainLight.position.set(-1, 1, 1);
		backLight.position.copy(mainLight.position).negate();

		scene.add(ambientLight, mainLight, backLight);

		// Random objects.

		const cloud = SphereCloud.create();
		cloud.scale.setScalar(0.4);
		this.object = cloud;
		scene.add(cloud);

		// Cubic cage.

		scene.add(Cage.create());

		// Raycaster.

		this.raycaster = new Raycaster();

		// Passes.

		const smaaEffect = new SMAAEffect(
			assets.get("smaa-search"),
			assets.get("smaa-area"),
			SMAAPreset.HIGH,
			EdgeDetectionMode.DEPTH
		);

		smaaEffect.edgeDetectionMaterial.setEdgeDetectionThreshold(0.05);

		const bloomOptions = {
			blendFunction: BlendFunction.SCREEN,
			kernelSize: KernelSize.MEDIUM,
			luminanceThreshold: 0.8,
			luminanceSmoothing: 0.075,
			height: 480
		};

		/* If you don't need to limit bloom to a subset of objects, it's recommended
		to use the normal BloomEffect for better performance. */
		const bloomEffect = new BloomEffect(bloomOptions);
		const selectiveBloomEffect = new SelectiveBloomEffect(scene, camera, bloomOptions);
		selectiveBloomEffect.inverted = true;

		this.effectA = bloomEffect;
		this.effectB = selectiveBloomEffect;

		const effectPassA = new EffectPass(camera, smaaEffect, bloomEffect);
		const effectPassB = new EffectPass(camera, smaaEffect, selectiveBloomEffect);

		this.passA = effectPassA;
		this.passB = effectPassB;

		effectPassA.renderToScreen = true;
		effectPassB.renderToScreen = true;
		effectPassB.enabled = false;

		composer.addPass(effectPassA);
		composer.addPass(effectPassB);

		// Important: Make sure your lights are on! (SelectiveBloom)
		ambientLight.layers.enable(selectiveBloomEffect.selection.layer);
		mainLight.layers.enable(selectiveBloomEffect.selection.layer);
		backLight.layers.enable(selectiveBloomEffect.selection.layer);

	}

	/**
	 * Renders this demo.
	 *
	 * @param {Number} delta - The time since the last frame in seconds.
	 */

	render(delta) {

		const object = this.object;
		const PI2 = 2.0 * Math.PI;

		object.rotation.x += 0.05 * delta;
		object.rotation.y += 0.25 * delta;

		if(object.rotation.x >= PI2) {

			object.rotation.x -= PI2;

		}

		if(object.rotation.y >= PI2) {

			object.rotation.y -= PI2;

		}

		super.render(delta);

	}

	/**
	 * Registers configuration options.
	 *
	 * @param {GUI} menu - A menu.
	 */

	registerOptions(menu) {

		const renderer = this.composer.getRenderer();

		const passA = this.passA;
		const passB = this.passB;
		const effectA = this.effectA;
		const effectB = this.effectB;
		const blendModeA = effectA.blendMode;
		const blendModeB = effectB.blendMode;

		const params = {
			"resolution": effectA.resolution.height,
			"kernel size": effectA.blurPass.kernelSize,
			"blur scale": effectA.blurPass.scale,
			"intensity": effectA.intensity,
			"luminance": {
				"filter": effectA.luminancePass.enabled,
				"threshold": effectA.luminanceMaterial.threshold,
				"smoothing": effectA.luminanceMaterial.smoothing
			},
			"selection": {
				"enabled": false,
				"inverted": effectB.inverted,
				"ignore bg": effectB.ignoreBackground
			},
			"opacity": blendModeA.opacity.value,
			"blend mode": blendModeA.blendFunction
		};

		menu.add(params, "resolution", [240, 360, 480, 720, 1080]).onChange(() => {

			effectA.resolution.height = effectB.resolution.height = Number(params.resolution);

		});

		menu.add(params, "kernel size", KernelSize).onChange(() => {

			effectA.blurPass.kernelSize = effectB.blurPass.kernelSize = Number(params["kernel size"]);

		});

		menu.add(params, "blur scale").min(0.0).max(1.0).step(0.01).onChange(() => {

			effectA.blurPass.scale = effectB.blurPass.scale = Number(params["blur scale"]);

		});

		menu.add(params, "intensity").min(0.0).max(3.0).step(0.01).onChange(() => {

			effectA.intensity = effectB.intensity = Number(params.intensity);

		});

		let folder = menu.addFolder("Luminance");

		folder.add(params.luminance, "filter").onChange(() => {

			effectA.luminancePass.enabled = effectB.luminancePass.enabled = params.luminance.filter;

		});

		folder.add(params.luminance, "threshold").min(0.0).max(1.0).step(0.001).onChange(() => {

			effectA.luminanceMaterial.threshold = effectB.luminanceMaterial.threshold = Number(params.luminance.threshold);

		});

		folder.add(params.luminance, "smoothing").min(0.0).max(1.0).step(0.001).onChange(() => {

			effectA.luminanceMaterial.smoothing = effectB.luminanceMaterial.smoothing = Number(params.luminance.smoothing);

		});

		folder.open();

		folder = menu.addFolder("Selection");

		folder.add(params.selection, "enabled").onChange(() => {

			passB.enabled = params.selection.enabled;
			passA.enabled = !passB.enabled;

			if(passB.enabled) {

				renderer.domElement.addEventListener("mousemove", this);
				renderer.domElement.addEventListener("mousedown", this);

			} else {

				renderer.domElement.removeEventListener("mousemove", this);
				renderer.domElement.removeEventListener("mousedown", this);

			}

		});

		folder.add(params.selection, "inverted").onChange(() => {

			effectB.inverted = params.selection.inverted;

		});

		folder.add(params.selection, "ignore bg").onChange(() => {

			effectB.ignoreBackground = params.selection["ignore bg"];

		});

		menu.add(params, "opacity").min(0.0).max(1.0).step(0.01).onChange(() => {

			blendModeA.opacity.value = blendModeB.opacity.value = params.opacity;

		});

		menu.add(params, "blend mode", BlendFunction).onChange(() => {

			blendModeA.blendFunction = blendModeB.blendFunction = Number(params["blend mode"]);

			passA.recompile();
			passB.recompile();

		});

		menu.add(passA, "dithering").onChange(() => {

			passB.dithering = passA.dithering;

		});

	}

	/**
	 * Resets this demo.
	 *
	 * @return {Demo} This demo.
	 */

	reset() {

		super.reset();

		const dom = this.composer.getRenderer().domElement;
		dom.removeEventListener("mousemove", this);
		dom.removeEventListener("mousedown", this);

		return this;

	}

}
