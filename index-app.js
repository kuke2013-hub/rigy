import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createGrabPhysics } from './VR_OBJECTS_TEMPLATE/physics-grab.js?v=template-1';
import { AnimatedPosePins } from './rigy/animated/animation-pins.js?v=rigy-0.5';
import { loadBundledFbx } from './rigy/animated/model-bundle.js?v=rigy-0.3';
import { OBJECT_CONFIG } from './VR_OBJECTS_TEMPLATE/config.js?v=template-1';

const $ = (id) => document.getElementById(id);
const setStatus = (message) => { $('status').textContent = message; };
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
let mixer=null,posePins=null,clip=null,animationPaused=false;
let modelLoading=false;
const animationSpeedEl=$('animationSpeed');
const showHandlesEl=$('showHandles');
const medicalProfilesPromise=fetch('./anatomy/medical-joints.v1.json').then(r=>{if(!r.ok)throw new Error('Medical reference data unavailable');return r.json();}).then(data=>data.profiles);
async function installAnimation(root, clips){
  posePins?.destroy(); posePins=null;
  mixer?.stopAllAction();mixer=null;clip=null;
  if(!Array.isArray(clips)||!clips.length){
    setStatus('Rig loaded but has no animation clips. Try another FBX/GLB.');return;
  }
  clip=clips[0];
  mixer=new THREE.AnimationMixer(root);
  const action=mixer.clipAction(clip);
  action.setLoop(THREE.LoopRepeat,Infinity);
  action.play();
  mixer.setTime(0);root.updateMatrixWorld(true);
  try{
    const medicalProfiles=await medicalProfilesPromise;
    if(avatar!==root)return;
    posePins=new AnimatedPosePins({avatar:root,renderer,camera,controls,medicalProfiles,onStatus:setStatus});
    posePins.setVisible(showHandlesEl.checked);
    setStatus(`Playing ${clip.name || 'Idle'} (${clip.duration.toFixed(2)} s). Bring a controller within 30 cm of a joint to reveal its point; hold trigger and MOVE that point in 3D. Release to pin; animation continues.`);
  }catch(error){console.warn('Rig pin setup failed',error);setStatus(`Animation running, but posing is unavailable: ${error.message}`);}
}
$('resetPose').addEventListener('click',()=>{posePins?.reset();setStatus('All limb pins cleared. Original animation continues.');});
$('pause').addEventListener('click',()=>{animationPaused=!animationPaused;$('pause').textContent=animationPaused?'Resume animation':'Pause animation';setStatus(animationPaused?'Animation paused; pose pins retained.':'Animation playing; pose pins retained.');});
showHandlesEl.addEventListener('change',()=>posePins?.setVisible(showHandlesEl.checked));

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
const objLoader=new OBJLoader();
const fbxLoader=new FBXLoader();
function installObject(root,label='Object',clips=[]) {
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
  if(posePins){posePins.destroy();posePins=null;}
  if(avatar)modelAnchor.remove(avatar);
  avatar=root;
  root.position.sub(centre);
  root.traverse(part=>{
    if(part.isMesh){part.castShadow=false;part.receiveShadow=false;}
  });
  modelAnchor.add(root);
  modelAnchor.scale.setScalar(1);
  modelAnchor.rotation.set(0,Number(OBJECT_CONFIG.initialYawRadians)||0,0);
  modelAnchor.position.set(0,Math.max(0.4,Math.min(1.6,dimensions.y/2)),-2);
  modelSize=dimensions;
  if(physics)physics.attachModel(modelSize);
  installAnimation(root,clips).catch(error=>{console.error(error);setStatus('Animation/pose setup failed: '+error.message);});
  setStatus(label+' loaded. Preserved Zelda side grips move the model; joint markers activate once animation is ready.');
}
function loadObject(url,filename) {
  const extension=(filename.split(/[?#]/)[0].split('.').pop()||'').toLowerCase();
  const revoke=url.startsWith('blob:');
  const done=loaded=>{
    try{installObject(loaded.scene||loaded,filename,loaded.animations||loaded.scene?.animations||[]);}
    catch(error){console.error(error);setStatus('Object import failed: '+error.message);}
    finally{if(revoke)URL.revokeObjectURL(url);}
  };
  const failed=error=>{
    console.error('Object import failed',error);
    setStatus('Object import failed. Use a self-contained GLB for reliable textures and materials.');
    if(revoke)URL.revokeObjectURL(url);
  };
  setStatus('Loading '+filename+'…');
  if(extension==='glb'||extension==='gltf')glbLoader.load(url,done,undefined,failed);
  else if(extension==='obj')objLoader.load(url,done,undefined,failed);
  else if(extension==='fbx')fbxLoader.load(url,done,undefined,failed);
  else failed(new Error('Unsupported extension '+extension+'. Convert to GLB.'));
}
async function loadFeaturedRig(){
  if(modelLoading)return;modelLoading=true;
  try{
    const binary=await loadBundledFbx('models/standing-idle/manifest.json',(count,total,bytes)=>{
      setStatus(`Loading character: part ${count}/${total} (${(bytes/1048576).toFixed(2)} MiB transferred)…`);
    });
    setStatus('Parsing rig, mesh and all animation tracks…');
    const root=fbxLoader.parse(binary,'./models/standing-idle/');
    installObject(root,'Standing W_Briefcase Idle.fbx',root.animations||[]);
  }catch(error){console.error(error);setStatus(`Automatic model import failed: ${error.message}. Choose the FBX locally as a fallback.`);}
  finally{modelLoading=false;}
}
loadFeaturedRig();

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
  posePins?.reset();
  physics?.reset();
  setStatus('Rigy 0.2 reset. Left X moves object sideways, either Y pulls/pushes. Two-hand resizing is 10% to 350%.');
}
$('reset').addEventListener('click',resetView);

const enter=$('enterAR');
let arSupported=false;
if(!window.isSecureContext){enter.textContent='HTTPS REQUIRED';setStatus('Open the secure GitHub Pages URL, not a local file.');}
else if(!navigator.xr){enter.textContent='OPEN ON QUEST 3';setStatus('Desktop preview is available. Passthrough requires Meta Quest Browser with WebXR AR support.');}
else{
  navigator.xr.isSessionSupported('immersive-ar').then(supported=>{
    arSupported=supported;enter.disabled=!supported;
    enter.textContent=supported?'ENTER PASSTHROUGH':'PASSTHROUGH UNAVAILABLE';
    if(!supported)setStatus('This browser does not offer immersive-ar. Open the site in Meta Quest Browser and allow the required permissions.');
  }).catch(error=>{enter.textContent='PASSTHROUGH CHECK FAILED';setStatus(error.message);});
}
enter.addEventListener('click',async()=>{
  if(!arSupported)return;
  enter.disabled=true;
  try{
    const session=await navigator.xr.requestSession('immersive-ar',{requiredFeatures:['local-floor']});
    await renderer.xr.setSession(session);
    controls.enabled=false;
    camera.position.set(0,0,0); // Never reuse the desktop orbit offset in XR.
    enter.textContent='PASSTHROUGH ACTIVE';
    physics?.releaseAll();
    setStatus('Bring either controller close (30 cm) to a joint to reveal its edit point. Hold trigger and move wrist, ankle, elbow, knee, head, neck, torso or hips; feet remain anchored. Side grips move the whole character.');
  }catch(error){console.error(error);enter.textContent='RETRY PASSTHROUGH';setStatus(`Could not start AR: ${error.name}: ${error.message}`);}
  finally{enter.disabled=false;}
});
renderer.xr.addEventListener('sessionend',()=>{
  controls.enabled=true;
  camera.position.set(0,1.65,2.65);
  controls.target.set(0,.75,-1.85); controls.update();
  enter.textContent='ENTER PASSTHROUGH';
  setStatus('Passthrough session ended. Desktop preview active.');
});
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
// Read-only runtime diagnostics allow the automated browser smoke test to
// distinguish "source files uploaded" from an actually running animated rig.
window.__rigyDiagnostics = () => ({
  ready: !!(avatar && mixer && posePins),
  characterLoaded: !!avatar,
  animationClip: clip?.name || null,
  animationDuration: clip?.duration || 0,
  animationTime: mixer?.time || 0,
  skeletonBones: avatar ? (() => {let n=0;avatar.traverse(o=>{if(o.isBone)n++;});return n;})() : 0,
  handleCount: posePins?.handles?.size || 0,
  footErrors: posePins?.footErrors?.()||null,
  plantedFeet: posePins?.footAnchors?.size||0,
  footErrors: posePins?.footErrors?.()||null,
  plantedFeet: posePins?.footAnchors?.size||0,
  visibleHandleCount: posePins?[...posePins.handles.values()].filter(m=>m.visible).length:0,
  activeJoint: posePins?.active?.limb?.id || null,
  pinnedCount: posePins?.pins?.size || 0,
  status: $('status').textContent,
  vrPresenting: renderer.xr.isPresenting
});
// Test-only desktop hook; not exposed in the standard public UI.
if(new URLSearchParams(location.search).has('rigy_test')) {
  window.__rigyTestPin = (id, offset) => {
    if(!posePins)throw new Error('Pose solver not ready');
    if(!Array.isArray(offset)||offset.length!==3||offset.some(x=>!Number.isFinite(x)))
      throw new Error('Finite XYZ offset required');
    const limb=posePins.limbs.find(x=>x.id===id&&x.kind==='effector');
    if(!limb)throw new Error('No effector named '+id);
    limb.effector.updateWorldMatrix(true,false);
    const target=limb.effector.getWorldPosition(new THREE.Vector3())
      .add(new THREE.Vector3(...offset));
    posePins.storeTarget(limb,target);
    return {target:target.toArray(),pinCount:posePins.pins.size};
  };
  // Browser regression: emulate a controller's physical translation while
  // preserving its grab's initial world position. The public page has no hook.
  window.__rigyTestControllerDrag=(id,offset) => {
    if(!posePins)throw new Error('Pose solver not ready');
    const limb=[...posePins.limbs,...posePins.bodyHandles].find(l=>l.id===id);
    if(!limb)throw new Error('No handle: '+id);
    if(!Array.isArray(offset)||offset.length!==3||offset.some(x=>!Number.isFinite(x)))throw new Error('Finite XYZ offset required');
    avatar.updateMatrixWorld(true);
    const handle=posePins.handles.get(id);
    const before=handle.getWorldPosition(new THREE.Vector3());
    const fake=new THREE.Group();
    fake.position.copy(before).add(new THREE.Vector3(0.015,0,0));
    scene.add(fake);fake.updateWorldMatrix(true,false);
    const nearest=posePins.pickNearby(fake);
    if(nearest?.id!==id)throw new Error('Controller failed to select '+id+'; found '+nearest?.id);
    posePins.begin(limb,fake);
    fake.position.add(new THREE.Vector3(...offset));
    fake.updateWorldMatrix(true,false);
    posePins.update();
    posePins.release(fake);
    scene.remove(fake);
    avatar.updateWorldMatrix(true,true);
    const after=handle.getWorldPosition(new THREE.Vector3());
    const pin=posePins.pins.get(id);
    const goal=pin?.targetLocal?limb.reference.localToWorld(pin.targetLocal.clone()):null;
    return {id,kind:limb.kind,before:before.toArray(),after:after.toArray(),
      goal:goal?.toArray()||null,moved:before.distanceTo(after),
      deviation:goal?after.distanceTo(goal):null,pinCount:posePins.pins.size};
  };
  window.__rigyTestJumpAnimation = time => {
    if(!posePins||!mixer||!Number.isFinite(time))throw new Error('No running animated rig');
    mixer.setTime(time);
    posePins.update();
    return window.__rigyDiagnostics();
  };
  window.__rigyTestReset=()=>posePins?.reset();
}
let previous=0;
renderer.setAnimationLoop((time,frame)=>{
  const dt=previous?Math.min(.05,(time-previous)/1000):0;
  previous=time;
  if(renderer.xr.isPresenting) {
    physics?.pollGrips(); // Resolve grip before routing thumbstick actions.
    updateXR(dt,frame);
  } else {updateDesktop(dt);controls.update();}
  physics?.update(dt);
  if(mixer && !animationPaused) mixer.update(dt*Math.max(0.01,Number(animationSpeedEl.value)||1));
  if(posePins) posePins.update(); // CRITICAL: after mixer; animation cannot overwrite pinned pose
  renderer.render(scene,camera);
});