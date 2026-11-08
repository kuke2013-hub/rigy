import * as THREE from 'three';
import RAPIER from 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.21.0/dist/rapier.mjs';

// No floor, gravity, collision stage or rendered scenery. A fixed collider
// tracks object's pose while idle, and turns kinematic only during gripping.
export async function createGrabPhysics({renderer, rig, modelAnchor, onStatus}) {
  await RAPIER.init();
  const world = new RAPIER.World({x:0, y:0, z:0});
  world.timestep = 1 / 60;

  let body = null, baseHalf = new THREE.Vector3(0.84,0.40,0.62);
  let objectScale = 1, accumulator = 0, heldMode = 'none';
  // Model-independent start/reset pose. Never force the original model's yaw.
  const initialPosition = new THREE.Vector3();
  const initialQuaternion = new THREE.Quaternion();
  // VR Objects baseline: preserve v13 linear two-hand resize control.
  // User requested linear two-hand resize limits: 10% to 350%.
  const MIN_SCALE = 0.10, MAX_SCALE = 3.50;
  const MODEL_SIDE_SPEED = 1.4;
  const localBox = new THREE.Box3();
  const handPos = new THREE.Vector3(), handQuat = new THREE.Quaternion();
  const tempPosition = new THREE.Vector3(), tempQuat = new THREE.Quaternion();
  const targetPosition = new THREE.Vector3(), targetQuat = new THREE.Quaternion();
  const lastPosition = new THREE.Vector3(), lastQuat = new THREE.Quaternion();
  const throwLinear = new THREE.Vector3(), throwAngular = new THREE.Vector3();
  const deltaQuat = new THREE.Quaternion(), rotationAxis = new THREE.Vector3();
  const handRay = new THREE.Ray(), rayIntersection = new THREE.Vector3();
  // Aim using targetRaySpace (not gripSpace); hand poses remain gripSpace.
  const aimPosition = new THREE.Vector3(), aimQuaternion = new THREE.Quaternion();
  const aimToObject = new THREE.Vector3();
  const AIM_ASSIST = THREE.MathUtils.degToRad(7);
  const AIM_MARGIN = THREE.MathUtils.degToRad(2);
  const REMOTE_START_METRES = 2.25;
  const oneStartHand = new THREE.Vector3(), oneStartModel = new THREE.Vector3();
  const twoStartMid = new THREE.Vector3(), twoStartModel = new THREE.Vector3();
  // Track where BOTH controllers point when a remote hold begins.
  // Aim-direction changes provide visible x/y motion at arbitrary distance.
  const oneStartAim = new THREE.Vector3();
  const twoStartAimA = new THREE.Vector3(), twoStartAimB = new THREE.Vector3();
  const currentAimA = new THREE.Vector3(), currentAimB = new THREE.Vector3();
  const aimDeltaA = new THREE.Vector3(), aimDeltaB = new THREE.Vector3();
  let oneAimReach = 1, twoAimReach = 1;
  let oneMotionGain = 1, twoMotionGain = 1;
  const offset = new THREE.Vector3(), offsetQuat = new THREE.Quaternion();
  // Pull/push is an independent world-space translation, separate from the
  // tracked controller grip offset. It survives one/two-hand manipulation.
  const depthOffset = new THREE.Vector3();
  const depthDirection = new THREE.Vector3();
  const MODEL_DEPTH_SPEED = 1.4; // metres/second at full stick deflection
  const MODEL_NEAR_LIMIT = 0.60;
  const MODEL_FAR_LIMIT = 50000; // Push building-sized object far enough to inspect
  const mid = new THREE.Vector3(), line = new THREE.Vector3(), rotationDelta = new THREE.Quaternion();
  const relativeOffset = new THREE.Vector3();
  let twoStartDistance = 1, twoStartScale = 1;
  const twoStartLine = new THREE.Vector3(), twoStartQuat = new THREE.Quaternion(), twoStartOffset = new THREE.Vector3();
  // V8: both wrist pitch (up/down) and roll (left/right) come from the
  // right controller. Hand separation still sets scale; the hand-to-hand
  // direction supplies overall swing. Only local-Y yaw is excluded here:
  // that component belongs to hand-line swing and the 30° thumbstick snaps.
  const twoStartRightQuat = new THREE.Quaternion();
  const rightExpectedQuat = new THREE.Quaternion();
  const rightResidualLocal = new THREE.Quaternion();
  const rightYawLocal = new THREE.Quaternion();
  const rightPitchRollLocal = new THREE.Quaternion();
  const rightPitchRollWorld = new THREE.Quaternion();
  const twoHandFrame = new THREE.Quaternion();
  const holdPosition = new THREE.Vector3(), holdQuat = new THREE.Quaternion();
  const lastHeldQuat = new THREE.Quaternion();
  let lastSampleValid = false;
  // Store yaw steps in the grip-relative orientation, NOT as a world-space
  // quaternion applied after hand tracking. The old world-space premultiply
  // rotated the *axis of later wrist motion* by the accumulated snap angle.
  const worldUp = new THREE.Vector3(0,1,0);
  const yawStep = new THREE.Quaternion();
  const snapFrameTurn = new THREE.Quaternion();
  const snapHandA = new THREE.Vector3(), snapHandB = new THREE.Vector3();
  const snapHandQA = new THREE.Quaternion(), snapHandQB = new THREE.Quaternion();

  // Register both target-ray events (squeeze button) and grip-space transforms.
  // Do not infer left/right from XR input source enumeration order.
  const hands = [0,1].map(i => {
    const grip = renderer.xr.getControllerGrip(i);
    const controller = renderer.xr.getController(i);
    rig.add(grip);
    rig.add(controller);
    const hand = {index:i, grip, controller, source:null, pressed:false, active:false, snapReady:true};
    controller.addEventListener('connected', e => {hand.source=e.data;});
    controller.addEventListener('disconnected', () => {setPressed(hand,false);hand.source=null;});
    controller.addEventListener('squeezestart', () => setPressed(hand,true));
    controller.addEventListener('squeezeend', () => setPressed(hand,false));
    return hand;
  });

  function activeHands() {return hands.filter(h=>h.active);}
  function twoHandPair() {
    const active=activeHands();
    if(active.length!==2)return null;
    // Do not assume that WebXR's input-source enumeration is left then right.
    const right=active.find(h=>h.source?.handedness==='right')||active[1];
    const left=active.find(h=>h!==right && h.source?.handedness==='left')
      ||active.find(h=>h!==right);
    return [left,right];
  }
  function readTwoHandFrame(pa,pb,qa,qb) {
    const pair=twoHandPair();
    if(!pair)return null;
    handTransform(pair[0],pa,qa);
    handTransform(pair[1],pb,qb);
    line.subVectors(pb,pa);
    const distance=Math.max(0.035,line.length());
    if(line.lengthSq()>1e-8)line.normalize();
    else line.copy(twoStartLine);
    // Swing the model as the hand-to-hand line changes, as in v6.
    rotationDelta.setFromUnitVectors(twoStartLine,line);
    // The controller's predicted pose after hand-line movement alone.
    // Its orientation is the right-wrist neutral grip rotated by swing.
    rightExpectedQuat.copy(rotationDelta).multiply(twoStartRightQuat);
    // Measure physical wrist motion IN THE CONTROLLER frame. This avoids
    // changing the twist axes after joystick turns or moving the hands.
    rightResidualLocal.copy(rightExpectedQuat).invert().multiply(qb).normalize();
    // Swing-twist decomposition: remove rotation around the controller's
    // local Y axis (handled by the hand line), preserve BOTH local X wrist
    // pitch (up/down) and local Z wrist roll (left/right) simultaneously.
    rightYawLocal.set(0,rightResidualLocal.y,0,rightResidualLocal.w);
    if(rightYawLocal.lengthSq()<1e-10)rightYawLocal.identity();
    else rightYawLocal.normalize();
    rightPitchRollLocal.copy(rightResidualLocal)
      .multiply(rightYawLocal.clone().invert()).normalize();
    // Conjugate the two-axis wrist movement into world coordinates before
    // composing with the hand-to-hand swing.
    rightPitchRollWorld.copy(rightExpectedQuat)
      .multiply(rightPitchRollLocal)
      .multiply(rightExpectedQuat.clone().invert()).normalize();
    twoHandFrame.copy(rightPitchRollWorld).multiply(rotationDelta).normalize();
    return distance;
  }
  function handTransform(hand, position, quaternion) {
    hand.grip.updateWorldMatrix(true,false);
    hand.grip.getWorldPosition(position);
    hand.grip.getWorldQuaternion(quaternion);
  }
  function aimTransform(hand, position, quaternion) {
    hand.controller.updateWorldMatrix(true,false);
    hand.controller.getWorldPosition(position);
    hand.controller.getWorldQuaternion(quaternion);
  }
  function remoteGain(distance) {
    return distance>REMOTE_START_METRES?Math.max(1,distance/2):1;
  }
  function controllerAimDirection(hand,out) {
    aimTransform(hand,aimPosition,aimQuaternion);
    return out.set(0,0,-1).applyQuaternion(aimQuaternion).normalize();
  }
  function lateralAimMotion(current,initial,out) {
    // Keep thumbsticks responsible for depth; pointer movement is lateral
    // and vertical in the plane perpendicular to its original direction.
    out.subVectors(current,initial);
    return out.addScaledVector(initial,-out.dot(initial));
  }
  function syncAnchorFromBody() {
    if(!body)return;
    const p=body.translation(), q=body.rotation();
    modelAnchor.position.set(p.x,p.y,p.z);
    modelAnchor.quaternion.set(q.x,q.y,q.z,q.w);
  }
  function changeScale(next) {
    if(!Number.isFinite(next))return;
    next=THREE.MathUtils.clamp(next,MIN_SCALE,MAX_SCALE);
    // Relative tolerance works for microscopic models, unlike the previous
    // absolute 0.003 cutoff, which prevented scale below ~0.3%.
    if(Math.abs(next-objectScale)<=Math.max(1e-10,objectScale*1e-6))return;
    objectScale=next;
    modelAnchor.scale.setScalar(objectScale);
    // No collider is needed: object has zero gravity and no collisions. This
    // avoids constructing enormous Rapier shapes at 1,000m+ object scale.
  }
  function canGrab(hand) {
    if(!body || !renderer.xr.isPresenting)return false;
    // Once one controller holds object, the other can join the remote grab
    // without both pointing precisely at a tiny figure simultaneously.
    if(activeHands().length===1)return true;
    handTransform(hand,handPos,handQuat);
    modelAnchor.updateWorldMatrix(true,false);
    const localHand=modelAnchor.worldToLocal(handPos.clone());
    const nearest=localBox.clampPoint(localHand,new THREE.Vector3());
    if(nearest.distanceTo(localHand)*objectScale < 0.38)return true;
    // Actual Quest pointing ray: getController() is targetRaySpace.
    aimTransform(hand,aimPosition,aimQuaternion);
    handRay.origin.copy(aimPosition);
    handRay.direction.set(0,0,-1).applyQuaternion(aimQuaternion).normalize();
    const localRay=handRay.clone().applyMatrix4(modelAnchor.matrixWorld.clone().invert());
    if(localRay.intersectBox(localBox,rayIntersection)!==null)return true;
    // Tiny/distant objects require modest angular aiming tolerance.
    aimToObject.subVectors(modelAnchor.position,aimPosition);
    const distance=aimToObject.length();
    if(distance<=1e-5)return true;
    aimToObject.divideScalar(distance);
    const cone=Math.max(AIM_ASSIST,Math.atan2(baseHalf.length()*objectScale,distance)+AIM_MARGIN);
    const alignment=handRay.direction.dot(aimToObject);
    return alignment>0 && alignment>=Math.cos(Math.min(Math.PI/2,cone));
  }
  function beginOne(hand) {
    heldMode='one';
    // Captured pose already contains earlier pull/push travel. Reset the extra
    // offset here so switching between one/two-hand holds never double-shifts.
    depthOffset.set(0,0,0);
    handTransform(hand,handPos,handQuat);
    oneStartHand.copy(handPos);
    oneStartModel.copy(modelAnchor.position);
    oneMotionGain=remoteGain(oneStartModel.distanceTo(oneStartHand));
    controllerAimDirection(hand,oneStartAim);
    oneAimReach=Math.max(1,oneStartModel.distanceTo(aimPosition));
    offset.copy(modelAnchor.position).sub(handPos).applyQuaternion(handQuat.clone().invert());
    offsetQuat.copy(handQuat).invert().multiply(modelAnchor.quaternion);
    lastPosition.copy(modelAnchor.position);lastQuat.copy(modelAnchor.quaternion);
    lastSampleValid=false;
  }
  function beginTwo() {
    const pair=twoHandPair();
    if(!pair)return;
    const pa=new THREE.Vector3(),pb=new THREE.Vector3(),qa=new THREE.Quaternion(),qb=new THREE.Quaternion();
    handTransform(pair[0],pa,qa);handTransform(pair[1],pb,qb);
    mid.copy(pa).add(pb).multiplyScalar(0.5);
    twoStartMid.copy(mid);
    twoStartModel.copy(modelAnchor.position);
    twoMotionGain=remoteGain(twoStartModel.distanceTo(twoStartMid));
    controllerAimDirection(pair[0],twoStartAimA);
    controllerAimDirection(pair[1],twoStartAimB);
    twoAimReach=Math.max(1,twoStartModel.distanceTo(twoStartMid));
    line.subVectors(pb,pa);
    twoStartDistance=Math.max(0.10,line.length());
    twoStartLine.copy(line).normalize();
    twoStartRightQuat.copy(qb); // Neutral wrist roll at the precise grab instant.
    twoStartScale=objectScale;
    twoStartQuat.copy(modelAnchor.quaternion);
    twoStartOffset.copy(modelAnchor.position).sub(mid);
    depthOffset.set(0,0,0);
    heldMode='two';
    lastPosition.copy(modelAnchor.position);lastQuat.copy(modelAnchor.quaternion);
    lastSampleValid=false;
  }
  function setPressed(hand, pressed) {
    if(pressed===hand.pressed && (!pressed || hand.active))return;
    hand.pressed=pressed;
    if(!pressed) {
      hand.snapReady=true;
      if(!hand.active)return;
      hand.active=false;
      const remaining=activeHands();
      if(remaining.length===1)beginOne(remaining[0]);
      else if(!remaining.length)freezeReleasedModel();
      return;
    }
    if(!canGrab(hand))return;
    const wasEmpty=activeHands().length===0;
    if(wasEmpty) {
      syncAnchorFromBody();
      body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased,true);
      body.setLinvel({x:0,y:0,z:0},true);
      body.setAngvel({x:0,y:0,z:0},true);
      throwLinear.set(0,0,0);throwAngular.set(0,0,0);
    }
    hand.active=true;
    hand.snapReady=true;
    if(activeHands().length===2) {
      beginTwo();
      onStatus('Version 13: both hands control object at distance. Move or aim each hand up/down/sideways; twist and resize 10%–350%.');
    } else {
      beginOne(hand);
      onStatus('Version 13: remote grab. Move your hand or shift where it points UP/DOWN/LEFT/RIGHT to move object.');
    }
  }
  // Zero gravity / frozen release: when the final grip is released,
  // object becomes a fixed body exactly at her last held world-space pose.
  // No falling, throwing, bouncing, drifting or further spin.
  function freezeReleasedModel() {
    if(!body || heldMode==='none')return;
    heldMode='none';
    const p=modelAnchor.position, q=modelAnchor.quaternion;
    body.setTranslation({x:p.x,y:p.y,z:p.z},true);
    body.setRotation({x:q.x,y:q.y,z:q.z,w:q.w},true);
    body.setBodyType(RAPIER.RigidBodyType.Fixed,true);
    body.setLinvel({x:0,y:0,z:0},true);
    body.setAngvel({x:0,y:0,z:0},true);
    throwLinear.set(0,0,0);throwAngular.set(0,0,0);
    lastSampleValid=false;
    depthOffset.set(0,0,0); // Frozen pose now contains the completed translation.
    onStatus('object released: stays exactly here. Pull/push with EITHER stick, even without a grip.');
  }
  function moveGrabbed(dt) {
    const group=activeHands();
    if(!group.length)return;
    if(group.length===1) {
      handTransform(group[0],handPos,handQuat);
      if(oneMotionGain>1) {
        // A distant object follows BOTH physical grip displacement AND
        // controller pointing changes, so even a wrist-guided pointing
        // movement shifts object visibly up/down and sideways.
        targetPosition.copy(oneStartModel).addScaledVector(
          tempPosition.subVectors(handPos,oneStartHand),oneMotionGain);
        controllerAimDirection(group[0],currentAimA);
        lateralAimMotion(currentAimA,oneStartAim,aimDeltaA);
        targetPosition.addScaledVector(aimDeltaA,oneAimReach);
      } else {
        targetPosition.copy(offset).applyQuaternion(handQuat).add(handPos);
      }
      targetQuat.copy(handQuat).multiply(offsetQuat);
    } else {
      const pa=new THREE.Vector3(),pb=new THREE.Vector3(),qa=new THREE.Quaternion(),qb=new THREE.Quaternion();
      const distance=readTwoHandFrame(pa,pb,qa,qb);
      if(distance===null)return;
      mid.copy(pa).add(pb).multiplyScalar(0.5);
      const ratio=distance/twoStartDistance;
      // Linear spacing-to-size response (as before Version 10).
      // Restrict scale to 10%-350% of normal size.
      changeScale(twoStartScale*ratio);
      targetQuat.copy(twoHandFrame).multiply(twoStartQuat);
      if(twoMotionGain>1) {
        // Both hands affect distant object's position. Combine their
        // physical midpoint translation and BOTH target-ray directions.
        targetPosition.copy(twoStartModel).addScaledVector(
          tempPosition.subVectors(mid,twoStartMid),twoMotionGain);
        const pair=twoHandPair();
        if(pair) {
          controllerAimDirection(pair[0],currentAimA);
          controllerAimDirection(pair[1],currentAimB);
          lateralAimMotion(currentAimA,twoStartAimA,aimDeltaA);
          lateralAimMotion(currentAimB,twoStartAimB,aimDeltaB);
          targetPosition.addScaledVector(aimDeltaA.add(aimDeltaB),twoAimReach*0.5);
        }
      } else {
        // Preserve original close-up two-handed pivot.
        targetPosition.copy(twoStartOffset)
          .applyQuaternion(twoHandFrame).add(mid);
      }
    }
    // Separate model-depth travel from grip pose and two-hand scaling.
    // The extra translation is NOT rotated by the hand/wrist, so pushing
    // or pulling does not unexpectedly change direction when twisting.
    targetPosition.add(depthOffset);
    // Every snap is already baked into the grip-relative offset. The hand's
    // tracked orientation acts first, so physical wrist twist stays one-to-one.
    // No ground clamping: release must preserve the exact position and
    // orientation the user chose, including suspended and upside-down poses.
    modelAnchor.position.copy(targetPosition);
    modelAnchor.quaternion.copy(targetQuat);
    body.setNextKinematicTranslation(targetPosition);
    body.setNextKinematicRotation(targetQuat);
    if(lastSampleValid && dt>0.002) {
      const v=tempPosition.subVectors(targetPosition,lastPosition).multiplyScalar(1/dt).clampLength(0,8);
      throwLinear.lerp(v,0.5);
      deltaQuat.copy(targetQuat).multiply(lastQuat.clone().invert()).normalize();
      if(deltaQuat.w<0)deltaQuat.set(-deltaQuat.x,-deltaQuat.y,-deltaQuat.z,-deltaQuat.w);
      const angle=2*Math.acos(THREE.MathUtils.clamp(deltaQuat.w,-1,1));
      const axisSize=Math.sqrt(Math.max(0,1-deltaQuat.w*deltaQuat.w));
      if(axisSize>0.0001 && angle<Math.PI) {
        rotationAxis.set(deltaQuat.x,deltaQuat.y,deltaQuat.z).multiplyScalar(angle/(axisSize*dt));
        throwAngular.lerp(rotationAxis.clampLength(0,14),0.5);
      }
    }
    lastPosition.copy(targetPosition);lastQuat.copy(targetQuat);
    lastSampleValid=true;
  }
  function attachModel(size) {
    hands.forEach(h=>{h.active=false;h.pressed=false;h.snapReady=true;});
    depthOffset.set(0,0,0);
    heldMode='none';
    if(body) {world.removeRigidBody(body);body=null;}
    baseHalf.copy(size).multiplyScalar(0.5);
    objectScale=1;
    modelAnchor.scale.setScalar(1);
    // app.js chooses the starting pose for each imported object.
    initialPosition.copy(modelAnchor.position);
    initialQuaternion.copy(modelAnchor.quaternion);
    localBox.min.copy(baseHalf).multiplyScalar(-1);
    localBox.max.copy(baseHalf);
    const p=modelAnchor.position,q=modelAnchor.quaternion;
    // Start stationary in midair rather than letting object fall before grabbing.
    body=world.createRigidBody(RAPIER.RigidBodyDesc.fixed()
      .setTranslation(p.x,p.y,p.z)
      .setRotation({x:q.x,y:q.y,z:q.z,w:q.w}));
    // No Rapier collider: the model freezes on release; physics collisions and
    // gravity were removed in earlier versions. Hit-testing uses visual bounds.
    throwLinear.set(0,0,0);throwAngular.set(0,0,0);
    lastSampleValid=false;
  }
  function releaseAll() {
    hands.forEach(h=>{h.active=false;h.pressed=false;h.snapReady=true;});
    depthOffset.set(0,0,0);
    if(body && heldMode!=='none') {
      heldMode='none';
      body.setTranslation(modelAnchor.position,true);
      body.setRotation(modelAnchor.quaternion,true);
      body.setBodyType(RAPIER.RigidBodyType.Fixed,true);
      body.setLinvel({x:0,y:0,z:0},true);
      body.setAngvel({x:0,y:0,z:0},true);
    }
    lastSampleValid=false;
  }
  function reset() {
    releaseAll();
    depthOffset.set(0,0,0);
    if(!body)return;
    changeScale(1);
    modelAnchor.position.copy(initialPosition);
    modelAnchor.quaternion.copy(initialQuaternion);
    body.setTranslation(modelAnchor.position,true);
    body.setRotation(modelAnchor.quaternion,true);
    body.setLinvel({x:0,y:0,z:0},true);
    body.setAngvel({x:0,y:0,z:0},true);
    throwLinear.set(0,0,0);throwAngular.set(0,0,0);
  }
  function adjustModelSide(stickX, dt, viewRight) {
    // Left thumbstick X moves object left/right relative to where the headset
    // faces. Always moves the model, regardless of which grips are held.
    if(!body || !viewRight || !Number.isFinite(stickX)
      || !Number.isFinite(dt) || dt<=0 || Math.abs(stickX)<0.16)return;
    const amount=stickX*MODEL_SIDE_SPEED*Math.min(dt,0.05);
    if(activeHands().length) {
      // Separate post-grip offset survives wrist rotations / two-hand scale.
      depthOffset.addScaledVector(viewRight,amount);
    } else {
      modelAnchor.position.addScaledVector(viewRight,amount);
      body.setTranslation(modelAnchor.position,true);
    }
  }
  function adjustModelDepth(stickY, dt, viewerPosition) {
    // Works with neither, one, or both grips held. Quest axes: pushing
    // forward gives Y<0, pulling backward gives Y>0.
    // No headset/player locomotion occurs on either thumbstick Y axis.
    if(!body || !viewerPosition || !Number.isFinite(stickY)
        || !Number.isFinite(dt) || dt<=0 || Math.abs(stickY)<0.16)return;
    depthDirection.subVectors(modelAnchor.position,viewerPosition);
    const distance=depthDirection.length();
    if(distance<0.001)return;
    depthDirection.divideScalar(distance);
    // Positive distance change sends object away; negative pulls her nearer.
    // Scale-adaptive speed lets you move giant object away without waiting
    // minutes, but remains unchanged at ordinary human scale.
    const desired=THREE.MathUtils.clamp(
      distance - stickY * MODEL_DEPTH_SPEED * Math.min(10000,Math.max(1,objectScale)) * Math.min(dt,0.05),
      MODEL_NEAR_LIMIT,MODEL_FAR_LIMIT);
    const delta=desired-distance;
    if(Math.abs(delta)<1e-7)return;
    if(activeHands().length) {
      // moveGrabbed() applies this after tracking the hands, preventing an
      // unwanted snap back to the unshifted grip location each frame.
      depthOffset.addScaledVector(depthDirection,delta);
    } else {
      // An unheld model is a fixed Rapier body: directly move both its visual
      // pose and collider. Do not move the XR locomotion rig or camera.
      modelAnchor.position.addScaledVector(depthDirection,delta);
      body.setTranslation(modelAnchor.position,true);
    }
  }
  function pollGrips() {
    if(!renderer.xr.isPresenting || !body)return;
    // WebXR squeeze events normally drive this; gamepad state is the fallback.
    // Running this before movement prevents a simultaneous grip+stick action
    // from briefly moving the player instead of manipulating the held model.
    for(const hand of hands) {
      const button=hand.source?.gamepad?.buttons?.[1];
      if(!button)continue;
      const pressed=!!(button.pressed || button.value>0.65);
      if(hand.pressed!==pressed)setPressed(hand,pressed);
      else if(pressed && !hand.active)setPressed(hand,true);
    }
  }
  function isHolding(handedness) {
    return hands.some(hand=>hand.active && hand.source?.handedness===handedness);
  }
  function stickX(gamepad) {
    const a=gamepad?.axes||[];
    const valid=(x,y)=>Number.isFinite(a[x])&&Number.isFinite(a[y]);
    const primary=valid(2,3)?{x:a[2],y:a[3]}:null;
    const secondary=valid(0,1)?{x:a[0],y:a[1]}:null;
    if(primary && (Math.abs(primary.x)>.12||Math.abs(primary.y)>.12))return primary.x;
    if(secondary && (Math.abs(secondary.x)>.12||Math.abs(secondary.y)>.12))return secondary.x;
    return (primary||secondary||{x:0}).x;
  }
  function snapHeldModel(direction) {
    // World-up 30° yaw at the instant of input; then express that same
    // rotation in the hand's CURRENT frame. This makes subsequent wrist
    // roll/pitch/yaw affect object on the same axes as the physical controller.
    yawStep.setFromAxisAngle(worldUp,direction*Math.PI/6);
    if(heldMode==='one') {
      const hand=activeHands()[0];
      if(!hand)return false;
      handTransform(hand,handPos,handQuat);
      // Q = H * O. Want Q' = Y * Q, so O' = inverse(H) * Y * H * O.
      snapFrameTurn.copy(handQuat).invert().multiply(yawStep).multiply(handQuat);
      offsetQuat.premultiply(snapFrameTurn).normalize();
      return true;
    }
    if(heldMode==='two') {
      if(readTwoHandFrame(snapHandA,snapHandB,snapHandQA,snapHandQB)===null)return false;
      // Q = F * twoStartQuat. F now combines hand-line swing with BOTH
      // right-wrist pitch and roll; bake each 30° snap into that entire frame.
      snapFrameTurn.copy(twoHandFrame).invert().multiply(yawStep).multiply(twoHandFrame);
      twoStartQuat.premultiply(snapFrameTurn).normalize();
      return true;
    }
    return false;
  }
  function updateHeldThumbsticks() {
    for(const hand of hands) {
      // Left-stick X is now ALWAYS model-left/right, even during a left grip.
      // Right-stick X retains 30° model turns while holding object.
      if(!hand.active || hand.source?.handedness==='left'
        || !hand.source?.gamepad) {
        hand.snapReady=true;
        continue;
      }
      const x=stickX(hand.source.gamepad);
      if(Math.abs(x)<.30) {
        hand.snapReady=true; // Must centre the stick before the next turn.
        continue;
      }
      if(hand.snapReady && Math.abs(x)>.70) {
        hand.snapReady=false;
        const direction=x>0?1:-1;
        if(!snapHeldModel(direction))continue;
        // Avoid interpreting discrete stick snaps as wrist motion.
        throwAngular.set(0,0,0);
        lastSampleValid=false;
        onStatus('object rotated 30° '+(direction>0?'right':'left')+'. Centre the held-hand joystick for another step.');
      }
    }
  }
  function update(dt) {
    if(!body)return;
    if(renderer.xr.isPresenting) {
      pollGrips();
      updateHeldThumbsticks();
      if(activeHands().length)moveGrabbed(dt);
    }
    accumulator+=Math.min(Math.max(dt,0),0.05);
    let steps=0;
    while(accumulator>=1/60 && steps<3) {world.step();accumulator-=1/60;steps++;}
    if(!activeHands().length)syncAnchorFromBody();
  }

  renderer.xr.addEventListener('sessionend',releaseAll);
  return {attachModel,update,reset,releaseAll,pollGrips,isHolding,adjustModelDepth,adjustModelSide};
}
