/* three.js 0.170.0 + GLTFLoader + OrbitControls, condivisi da tutte le scene 3D.
 * Bundle offline: vendor/three-runtime.min.js (IIFE, espone window.THREE_RT). */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
window.THREE_RT = { THREE, GLTFLoader, OrbitControls };
