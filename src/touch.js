// touch.js
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRM, VRMLoaderPlugin } from '@pixiv/three-vrm'

export function initTouch(canvasElement, vrmPath = './avatar.vrm') {
  // === Scene Setup ===
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(
    30,
    canvasElement.clientWidth / canvasElement.clientHeight,
    0.1,
    1000,
  )
  camera.position.set(0, 1.4, 2)

  const renderer = new THREE.WebGLRenderer({ antialias: true, canvas: canvasElement })
  renderer.setSize(canvasElement.clientWidth, canvasElement.clientHeight)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 1.4, 0)
  controls.update()

  // Lighting
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2))
  scene.add(new THREE.DirectionalLight(0xffffff, 0.8))

  // Loader
  const loader = new GLTFLoader()
  loader.register((parser) => new VRMLoaderPlugin(parser))

  let currentVrm = null
  let hairBones = []
  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2()

  loader.load(vrmPath, (gltf) => {
    VRM.from(gltf).then((vrm) => {
      currentVrm = vrm
      scene.add(vrm.scene)

      // Find hair bones
      hairBones = []
      vrm.scene.traverse((obj) => {
        if (obj.isBone && obj.name.toLowerCase().includes('hair')) {
          hairBones.push(obj)
        }
      })

      console.log(
        '✅ VRM Loaded. Hair bones found:',
        hairBones.map((b) => b.name),
      )
    })
  })

  // Detect Click
  function onClick(event) {
    if (!currentVrm) return

    const rect = renderer.domElement.getBoundingClientRect()
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    raycaster.setFromCamera(mouse, camera)
    const intersects = raycaster.intersectObject(currentVrm.scene, true)

    if (intersects.length > 0) {
      const bone = intersects[0].object
      console.log('👉 You touched:', bone.name)

      // Check humanoid bones
      for (const humanoidName in currentVrm.humanoid.humanBones) {
        const node = currentVrm.humanoid.getNormalizedBoneNode(humanoidName)
        if (node && node === bone) {
          console.log('✅ VRM humanoid bone detected:', humanoidName)
        }
      }

      // Hair bones
      if (bone.name.toLowerCase().includes('hair')) {
        console.log('💇 Hair touched:', bone.name)
      }
    }
  }
  renderer.domElement.addEventListener('click', onClick)

  // Animation loop
  const clock = new THREE.Clock()
  function animate() {
    requestAnimationFrame(animate)

    if (currentVrm) {
      const deltaTime = clock.getDelta()
      currentVrm.update(deltaTime)
    }

    renderer.render(scene, camera)
  }
  animate()

  // Handle resize
  window.addEventListener('resize', () => {
    camera.aspect = canvasElement.clientWidth / canvasElement.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(canvasElement.clientWidth, canvasElement.clientHeight)
  })
}
