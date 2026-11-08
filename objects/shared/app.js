import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createGrabPhysics } from '../../VR_OBJECTS_TEMPLATE/physics-grab.js?v=template-1';
const OBJECT_CONFIG = window.VR_OBJECT_CONFIG || Object.freeze({modelUrl:null,fitToView:true,targetLongestSideMetres:1.67,initialYawRadians:0});

const $ = (id) => document.getElementById(id);
const setStatus = (message) => { $('status').textContent = message; };
const enter = $('enterAR');

// One brightness control for every page that uses this shared application.
// At 100% the source materials are unchanged; at 0% the output fragment is black.
// The existing Zelda v13 controller/physics engine is not modified.
const vrObjectBrightness = {value:1.0};
const vrPatchedMaterials = new WeakSet();
function mountBrightnessSlider() {
  const panel = $('panel');
  if (!panel || $('vrBrightnessSlider')) return;
  const style = document.createElement('style');
  style.textContent = [
    '.vr-brightness{border:1px solid #ffffff26;background:#172733;border-radius:10px;padding:11px 13px 8px;margin:0 0 13px}',
    '.vr-brightness-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;color:#e4f4f3;font-size:13px;font-weight:650}',
    '.vr-brightness-output{font-variant-numeric:tabular-nums;color:#a4e8d9}',
    '#vrBrightnessSlider{display:block;width:100%;height:28px;cursor:pointer;accent-color:#86e8d4;touch-action:pan-x}',
    '.vr-brightness-desc{color:#a8bec9;font-size:11px;line-height:1.35;margin:0 0 2px}'
  ].join('\n');
  document.head.append(style);
  const section = document.createElement('section');
  section.className = 'vr-brightness';
  const heading = document.createElement('div');
  heading.className = 'vr-brightness-heading';
  const label = document.createElement('label');
  label.htmlFor = 'vrBrightnessSlider';
  label.textContent = 'Model brightness';
  const readout = document.createElement('output');
  readout.className = 'vr-brightness-output';
  readout.htmlFor = 'vrBrightnessSlider';
  readout.textContent = '100%';
  heading.append(label,readout);
  const range = document.createElement('input');
  range.type = 'range'; range.id = 'vrBrightnessSlider';
  range.min = '0'; range.max = '100'; range.step = '1'; range.value = '100';
  range.setAttribute('aria-label','Model brightness (0 percent black, 100 percent original)');
  const desc = document.createElement('p');
  desc.className = 'vr-brightness-desc';
  desc.textContent = '100% original appearance · 0% black';
  section.append(heading,range,desc);
  panel.insertBefore(section, enter);
  range.addEventListener('input', () => {
    const percentage = Math.max(0,Math.min(100,Number(range.value)||0));
    vrObjectBrightness.value = percentage / 100;
    readout.value = percentage + '%';
    readout.textContent = percentage + '%';
    range.setAttribute('aria-valuetext', percentage === 0 ? 'Black' : percentage === 100 ? 'Original brightness' : percentage+' percent brightness');
  });
}
mountBrightnessSlider();
function applyBrightnessShader(root) {
  root.traverse(node => {
    if (!node.isMesh) return;
    const list = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of list) {
      if (!material || vrPatchedMaterials.has(material) || material.isShaderMaterial) continue;
      const previous = material.onBeforeCompile;
      const previousCacheKey = material.customProgramCacheKey.bind(material);
      material.onBeforeCompile = function (shader, renderer) {
        if (typeof previous === 'function') previous.call(this, shader, renderer);
        const hook = '#include <dithering_fragment>';
        if (!shader.fragmentShader.includes(hook)) {
          console.warn('Model brightness: custom shader lacks expected output hook', material.name);
          return;
        }
        shader.uniforms.vrObjectBrightness = vrObjectBrightness;
        shader.fragmentShader =
          'uniform float vrObjectBrightness;\n' +
          shader.fragmentShader.replace(hook, hook + '\n gl_FragColor.rgb *= vrObjectBrightness;');
      };
      material.customProgramCacheKey = () => previousCacheKey() + '|vr-brightness-v1';
      material.needsUpdate = true;
      vrPatchedMaterials.add(material);
    }
  });
}

let arSupported = false, arChecked = false, modelReady = false, modelLoading = false, modelLoadFailed = false;
let loadGeneration = 0;
const setLoadProgress = (message, percent = null, state = 'loading') => {
  const shell = $('modelLoad'), progress = $('modelProgress'), label = $('modelProgressText');
  if (!shell) return;
  shell.hidden = false;
  shell.dataset.state = state;
  if (label) label.textContent = message;
  if (progress) {
    if (percent === null) progress.removeAttribute('value');
    else progress.value = Math.max(0, Math.min(100, percent));
  }
};
function refreshEnterButton() {
  if (renderer.xr.isPresenting) return;
  enter.disabled = true;
  if (!window.isSecureContext) enter.textContent = 'HTTPS REQUIRED';
  else if (!navigator.xr) enter.textContent = 'OPEN ON QUEST 3';
  else if (!arChecked) enter.textContent = 'CHECKING QUEST SUPPORT…';
  else if (!arSupported) enter.textContent = 'PASSTHROUGH UNAVAILABLE';
  else if (modelLoading) enter.textContent = 'LOADING MODEL…';
  else if (!modelReady) enter.textContent = modelLoadFailed ? 'MODEL MISSING — CHOOSE GLB' : 'CHOOSE A MODEL FIRST';
  else { enter.disabled = false; enter.textContent = 'ENTER PASSTHROUGH'; }
}
const stage = $('scene');
const scene = new THREE.Scene(); // Transparency is required for passthrough.
const renderer = new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setClearColor(0x000000,0);
renderer.setPixelRatio(Math.min(devicePixelRatio || 1,1.5));
renderer.setSize(innerWidth,innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

const rig = new THREE.Group();scene.add(rig);
const camera = new THREE.PerspectiveCamera(65,innerWidth/innerHeight,0.01,50000);
camera.position.set(0,1.65,2.65);rig.add(camera);
const controls = new OrbitControls(camera,renderer.domElement);
controls.target.set(0,0.75,-1.85);
controls.enableDamping = true;
controls.minDistance=.65;controls.maxDistance=50000;
controls.maxPolarAngle=Math.PI*.55;
controls.update();

scene.add(new THREE.HemisphereLight(0xffffff,0x859ba3,2));
const key=new THREE.DirectionalLight(0xfff5e6,2.1);
key.position.set(-2,4.7,2.5);
key.castShadow=true;
key.shadow.mapSize.set(1024,1024);
key.shadow.camera.left=-5;key.shadow.camera.right=5;
key.shadow.camera.top=5;key.shadow.camera.bottom=-5;
key.shadow.normalBias=.02;
scene.add(key);

// Model-independent anchor: no Zelda, mesh or other 3D object is bundled.
const modelAnchor=new THREE.Group();
modelAnchor.position.set(0,1,-2);
scene.add(modelAnchor);
let avatar=null,physics=null,modelSize=null;
const physicsReady=createGrabPhysics({renderer,rig,modelAnchor,onStatus:setStatus})
  .then(instance=>{
    physics=instance;
    if(modelSize)physics.attachModel(modelSize);
  })
  .catch(error=>{
    console.error('Physics initialisation failed',error);
    setStatus('Physics initialisation failed: '+error.message);
  });
const glbLoader=new GLTFLoader();
glbLoader.setMeshoptDecoder(MeshoptDecoder); // Additive support for EXT_meshopt_compression; Zelda controller engine unchanged.
const objLoader=new OBJLoader();
const fbxLoader=new FBXLoader();
function installObject(root,label='Object') {
  if(!root || !root.isObject3D)throw new Error('The imported file has no Three.js scene.');
  // Compute from a detached root; do not inherit any previous anchor rotation.
  root.updateMatrixWorld(true);
  const raw=new THREE.Box3().setFromObject(root);
  if(raw.isEmpty())throw new Error('The imported object has no renderable geometry.');
  const rawSize=raw.getSize(new THREE.Vector3());
  const longest=Math.max(rawSize.x,rawSize.y,rawSize.z);
  if(!Number.isFinite(longest)||longest<1e-7)throw new Error('Invalid object bounds.');
  if(OBJECT_CONFIG.fitToView) {
    // Uniform scaling only; never stretch the object or change proportions.
    const target=Number(OBJECT_CONFIG.targetLongestSideMetres)||1.67;
    root.scale.multiplyScalar(target/longest);
    root.updateMatrixWorld(true);
  }
  const bounds=new THREE.Box3().setFromObject(root);
  const centre=bounds.getCenter(new THREE.Vector3());
  const dimensions=bounds.getSize(new THREE.Vector3());
  if(avatar)modelAnchor.remove(avatar);
  avatar=root;
  root.position.sub(centre);
  root.traverse(part=>{
    if(part.isMesh){part.castShadow=false;part.receiveShadow=false;}
  });
  applyBrightnessShader(root);
  modelAnchor.add(root);
  modelAnchor.scale.setScalar(1);
  modelAnchor.rotation.set(0,Number(OBJECT_CONFIG.initialYawRadians)||0,0);
  const configuredSpawnY = Number(OBJECT_CONFIG.spawnYMetres);
  const spawnY = Number.isFinite(configuredSpawnY) && configuredSpawnY > 0
    ? configuredSpawnY : Math.max(0.4,Math.min(1.6,dimensions.y/2));
  modelAnchor.position.set(0,spawnY,-2);
  modelSize=dimensions;
  if(physics)physics.attachModel(modelSize);
  setStatus(label+' loaded. Aim at the object, squeeze a side grip and move or twist it. Other controls match VR v13.');
}
function loadObject(url,filename) {
  const extension=(filename.split(/[?#]/)[0].split('.').pop()||'').toLowerCase();
  const revoke=url.startsWith('blob:');
  const requestId=++loadGeneration;
  modelReady=false;
  modelLoading=true;
  modelLoadFailed=false;
  setLoadProgress(filename+' · 0%',0,'loading');
  setStatus('Downloading '+filename+'… 0%');
  refreshEnterButton();
  const cleanup=()=>{if(revoke)URL.revokeObjectURL(url);};
  const fail=(error)=>{
    if(requestId!==loadGeneration){cleanup();return;}
    console.error('Object import failed',error);
    modelLoading=false;
    modelReady=false;
    modelLoadFailed=true;
    const status=Number(error?.target?.status)||Number(error?.status)||0;
    const reason=status?'HTTP '+status:(error?.message||'download or format error');
    const detail=!revoke
      ? 'The hosted model is missing or cannot be read ('+reason+'). Upload it to the configured assets path, or select a local GLB below.'
      : 'The selected file could not be loaded ('+reason+'). Please select a valid self-contained GLB.';
    setLoadProgress('Model unavailable · '+reason,null,'error');
    setStatus(detail);
    refreshEnterButton();
    cleanup();
  };
  const done=loaded=>{
    if(requestId!==loadGeneration){cleanup();return;}
    try {
      installObject(loaded.scene||loaded,filename);
      modelLoading=false;
      modelReady=true;
      modelLoadFailed=false;
      setLoadProgress(filename+' · 100% · Ready',100,'ready');
      refreshEnterButton();
    } catch(error) { fail(error); return; }
    cleanup();
  };
  const progress=event=>{
    if(requestId!==loadGeneration||!modelLoading)return;
    const loaded=Math.max(0,Number(event.loaded)||0);
    const total=Number(event.total)||0;
    if(total>0){
      // 99% is the download cap; 100% means the model is parsed and installed.
      const pct=Math.min(99,Math.floor(100*loaded/total));
      setLoadProgress(filename+' · '+pct+'%',pct,'loading');
      setStatus('Downloading '+filename+'… '+pct+'%');
    }else{
      setLoadProgress(filename+' · '+Math.round(loaded/1024)+' KB received',null,'loading');
      setStatus('Downloading '+filename+'…');
    }
  };
  if(extension==='glb'||extension==='gltf')glbLoader.load(url,done,progress,fail);
  else if(extension==='obj')objLoader.load(url,done,progress,fail);
  else if(extension==='fbx')fbxLoader.load(url,done,progress,fail);
  else fail(new Error('Unsupported extension '+extension+'. Convert to GLB.'));
}
const initialModel=OBJECT_CONFIG.modelUrl;
if(typeof initialModel==='string'&&initialModel.trim()){
  loadObject(initialModel,initialModel);
}else{
  setStatus('Empty VR Objects environment ready. Add a model URL in config.js or choose a local GLB, OBJ or FBX. No model is included.');
}
$('assetFile').addEventListener('change',event=>{
  const file=event.target.files?.[0];
  if(!file)return;
  const ext=file.name.split('.').pop().toLowerCase();
  if(!['glb','obj','fbx'].includes(ext)){
    setStatus('Please choose a .glb, .obj or .fbx file. GLB is recommended.');
    return;
  }
  loadObject(URL.createObjectURL(file),file.name);
});

// No virtual floor, gravity, collision geometry, grid or stage.

// Controllers and their side-grip events are registered in physics-grab.js.
const keys = new Set();
window.addEventListener('keydown', e => {keys.add(e.code); if(e.code.startsWith('Arrow'))e.preventDefault();});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
const xrForward=new THREE.Vector3(),xrRight=new THREE.Vector3();
const xrHeadOrientation=new THREE.Quaternion(),xrRigOrientation=new THREE.Quaternion();
const xrLocalHead=new THREE.Vector3(),xrPivotBefore=new THREE.Vector3(),xrPivotAfter=new THREE.Vector3();
const xrViewerWorld=new THREE.Vector3();
const UP=new THREE.Vector3(0,1,0);
let snapTurnReady=true;
const HOME={x:0,z:0};
function activeStick(gamepad) {
  const axes=gamepad.axes||[];
  const pair=(x,y)=>Number.isFinite(axes[x])&&Number.isFinite(axes[y])?{x:axes[x],y:axes[y]}:null;
  const main=pair(2,3),fallback=pair(0,1);
  if(main&&(Math.abs(main.x)>.12||Math.abs(main.y)>.12)) return main;
  if(fallback&&(Math.abs(fallback.x)>.12||Math.abs(fallback.y)>.12))return fallback;
  return main||fallback||{x:0,y:0};
}
function snapTurn(direction, viewerPose){
  // Preserve physical head position when rotating the locomotion rig.
  const pos=viewerPose.transform.position;
  xrLocalHead.set(pos.x,pos.y,pos.z);
  rig.updateMatrixWorld(true);
  xrPivotBefore.copy(xrLocalHead);rig.localToWorld(xrPivotBefore);
  rig.rotation.y-=direction*THREE.MathUtils.degToRad(30);
  rig.updateMatrixWorld(true);
  xrPivotAfter.copy(xrLocalHead);rig.localToWorld(xrPivotAfter);
  rig.position.x+=xrPivotBefore.x-xrPivotAfter.x;
  rig.position.z+=xrPivotBefore.z-xrPivotAfter.z;
}
function updateXR(dt, frame){
  const session=renderer.xr.getSession();
  const space=renderer.xr.getReferenceSpace();
  const pose=frame&&space?frame.getViewerPose(space):null;
  if(!session||!pose)return;
  let left=null,right=null;
  for(const source of session.inputSources){
    if(!source.gamepad)continue;
    const stick=activeStick(source.gamepad);
    if(source.handedness==='left') left=stick;
    if(source.handedness==='right') right=stick;
  }
  // A held controller's stick rotates object, not the player.
  // When that grip is released, the usual locomotion/snap-turn controls resume.
  if(right && !physics?.isHolding('right')){
    if(Math.abs(right.x)<.30) snapTurnReady=true;
    if(snapTurnReady&&Math.abs(right.x)>.70){snapTurn(right.x>0?1:-1,pose);snapTurnReady=false;}
  } else if(right) {
    snapTurnReady=true; // Re-arm the view control while object is being held.
  }
  // Version 10: both vertical sticks still pull/push the CHARACTER, never
  // move the player. Left-stick X now translates the CHARACTER sideways too,
  // even during a left grip. The right-stick X logic above stays unchanged:
  // free = view snap-turn, right grip = object 30° yaw.
  const side=left && Math.abs(left.x)>.16?left.x:0;
  const leftDepth=left && Math.abs(left.y)>.16?left.y:0;
  const rightDepth=right && Math.abs(right.y)>.16?right.y:0;
  const modelDepth=Math.abs(rightDepth)>=Math.abs(leftDepth)?rightDepth:leftDepth;
  if(!physics || (!modelDepth&&!side))return;
  const eye=pose.transform.position;
  xrViewerWorld.set(eye.x,eye.y,eye.z);
  rig.updateMatrixWorld(true);
  rig.localToWorld(xrViewerWorld);
  if(modelDepth)physics.adjustModelDepth(modelDepth,dt,xrViewerWorld);
  if(side) {
    const o=pose.transform.orientation;
    xrHeadOrientation.set(o.x,o.y,o.z,o.w);
    rig.getWorldQuaternion(xrRigOrientation);
    xrHeadOrientation.premultiply(xrRigOrientation);
    xrRight.set(1,0,0).applyQuaternion(xrHeadOrientation);
    xrRight.y=0;
    if(xrRight.lengthSq()>1e-6) {
      xrRight.normalize();
      physics.adjustModelSide(side,dt,xrRight);
    }
  }
}
function updateDesktop(dt){
  const forward=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0);
  const strafe=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);
  const len=Math.hypot(forward,strafe);
  if(!len)return;
  const cameraForward=new THREE.Vector3();camera.getWorldDirection(cameraForward);cameraForward.y=0;cameraForward.normalize();
  const cameraRight=new THREE.Vector3().crossVectors(cameraForward,UP).normalize();
  const speed=(keys.has('ShiftLeft')?3:1.5)*dt/len;
  rig.position.addScaledVector(cameraForward,forward*speed);
  rig.position.addScaledVector(cameraRight,strafe*speed);
  controls.target.addScaledVector(cameraForward,forward*speed);
  controls.target.addScaledVector(cameraRight,strafe*speed);
}
function resetView(){
  rig.position.set(HOME.x,0,HOME.z);rig.rotation.y=0;snapTurnReady=true;
  if(!renderer.xr.isPresenting){camera.position.set(0,1.65,2.65);controls.target.set(0,.75,-1.85);controls.update();}
  physics?.reset();
  setStatus('VR Object reset. Left X moves object sideways, either Y pulls/pushes. Two-hand resizing is 10% to 350%.');
}
$('reset').addEventListener('click',resetView);

if(!window.isSecureContext){setStatus('Open the secure GitHub Pages URL, not a local file.');}
else if(!navigator.xr){setStatus('Desktop preview is available. Passthrough requires Meta Quest Browser with WebXR AR support.');}
else{
  navigator.xr.isSessionSupported('immersive-ar').then(supported=>{
    arChecked=true;
    arSupported=supported;
    refreshEnterButton();
    if(!supported)setStatus('This browser does not offer immersive-ar. Open the site in Meta Quest Browser and allow the required permissions.');
  }).catch(error=>{
    arChecked=true;
    arSupported=false;
    refreshEnterButton();
    setStatus('Passthrough check failed: '+error.message);
  });
}
refreshEnterButton();
enter.addEventListener('click',async()=>{
  if(!arSupported||!modelReady)return;
  enter.disabled=true;
  try{
    const session=await navigator.xr.requestSession('immersive-ar',{requiredFeatures:['local-floor']});
    await renderer.xr.setSession(session);
    controls.enabled=false;
    camera.position.set(0,0,0); // Never reuse the desktop orbit offset in XR.
    enter.textContent='PASSTHROUGH ACTIVE';
    physics?.releaseAll();
    setStatus('VR Objects: point and squeeze, then move either controller or its aim to move distant object in all directions.');
  }catch(error){console.error(error);enter.textContent='RETRY PASSTHROUGH';setStatus(`Could not start AR: ${error.name}: ${error.message}`);}
  finally{refreshEnterButton();}
});
renderer.xr.addEventListener('sessionend',()=>{
  controls.enabled=true;
  camera.position.set(0,1.65,2.65);
  controls.target.set(0,.75,-1.85); controls.update();
  refreshEnterButton();
  setStatus('Passthrough session ended. Desktop preview active.');
});
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
let previous=0;
renderer.setAnimationLoop((time,frame)=>{
  const dt=previous?Math.min(.05,(time-previous)/1000):0;
  previous=time;
  if(renderer.xr.isPresenting) {
    physics?.pollGrips(); // Resolve grip before routing thumbstick actions.
    updateXR(dt,frame);
  } else {updateDesktop(dt);controls.update();}
  physics?.update(dt);
  renderer.render(scene,camera);
});