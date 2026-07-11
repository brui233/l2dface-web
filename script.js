const {
  Application,
  live2d: {
    Live2DModel,
    MotionPreloadStrategy
  },
  Sprite,
  Texture,
  Ticker
} = PIXI;

const {
  Face,
  Vector: {
    lerp
  },
  Utils: {
    clamp
  }
} = Kalidokit;

const urlParams = new URLSearchParams(window.location.search);
let modelUrl = urlParams.get("modelUrl") || "./models/hiyori/hiyori_pro_t10.model3.json";
console.log("modelUrl:", modelUrl);

if (modelUrl.endsWith(".json")) {
  let json = await fetch(modelUrl).then(response => response.json());
  json.url = json.url || modelUrl;
  const selectedMotionsParam = urlParams.get("selectedMotions");
  const selectedMotions = selectedMotionsParam ? selectedMotionsParam.split(',') : [];
  
  if (selectedMotions.length === 0) {
    json.motions = {};
  } else {
    const newMotions = {};
    selectedMotions.forEach(motionName => {
      if (json.motions[motionName]) {
        newMotions[motionName] = json.motions[motionName];
      }
    });
    json.motions = newMotions;
  }
  modelUrl = json;
  console.log('modelUrl:', modelUrl);
}

let currentModel;
let facemesh;
let app;
let backgroundSprite;
const videoElement = document.querySelector(".input_video");
const guideCanvas = document.querySelector("canvas.guides");

(async function () {
  app = new PIXI.Application({
    'view': document.getElementById("live2d"),
    'autoStart': true,
    'backgroundAlpha': 0,
    'backgroundColor': 0xffffff,
    'resizeTo': window
  });
  console.log("to load modelUrl:", modelUrl);
  
  currentModel = await Live2DModel.from(modelUrl, {
    'autoInteract': false,
    'motionPreload': MotionPreloadStrategy.NONE
  });
  console.log(currentModel);
  
  currentModel.scale.set(0.4);
  currentModel.interactive = true;
  currentModel.anchor.set(0.5, 0.5);
  currentModel.position.set(window.innerWidth * 0.5, window.innerHeight * 0.8);
  
  // 拖拽事件还原
  currentModel.on("pointerdown", event => {
    currentModel.offsetX = event.data.global.x - currentModel.position.x;
    currentModel.offsetY = event.data.global.y - currentModel.position.y;
    currentModel.dragging = true;
  });
  
  currentModel.on("pointerup", event => {
    currentModel.dragging = false;
  });
  
  currentModel.on('pointermove', event => {
    if (currentModel.dragging) {
      currentModel.position.set(event.data.global.x - currentModel.offsetX, event.data.global.y - currentModel.offsetY);
    }
  });
  
  // 鼠标滚轮缩放事件还原
  document.querySelector("#live2d").addEventListener('wheel', event => {
    event.preventDefault();
    currentModel.scale.set(clamp(currentModel.scale.x + event.deltaY * -0.001, -0.5, 10));
  });
  app.stage.addChild(currentModel);
  
  // MediaPipe Facemesh 还原
  facemesh = new FaceMesh({
    'locateFile': file => "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/" + file
  });
  facemesh.setOptions({
    'maxNumFaces': 1,
    'refineLandmarks': true,
    'minDetectionConfidence': 0.5,
    'minTrackingConfidence': 0.5
  });
  facemesh.onResults(onResults);
  startCamera();
  
  window.addEventListener('clearBackgroundImage', function () {
    if (backgroundSprite) {
      app.stage.removeChild(backgroundSprite);
    }
  });
  
  window.addEventListener("setBackgroundImage", function (event) {
    const imageUrl = event.detail;
    if (backgroundSprite) {
      app.stage.removeChild(backgroundSprite);
    }
    const texture = Texture.from(imageUrl);
    backgroundSprite = new Sprite(texture);
    backgroundSprite.width = app.screen.width;
    backgroundSprite.height = app.screen.height;
    app.stage.addChildAt(backgroundSprite, 0);
  });
  
  window.addEventListener("setBackgroundVideo", function (event) {
    const videoObj = event.detail;
    console.log("视频加载中:", videoObj);
    videoObj.play();
    console.log("视频播放中:", videoObj);
    
    videoObj.addEventListener("canplaythrough", function () {
      if (backgroundSprite) {
        app.stage.removeChild(backgroundSprite);
      }
      console.log('视频加载完成:', videoObj);
      const videoTexture = Texture.from(videoObj);
      videoTexture.baseTexture.resource.source.loop = true;
      
      if (!videoTexture || videoTexture.baseTexture.hasLoaded === false) {
        console.error("纹理创建失败或未加载完成");
        return;
      }
      console.log("纹理创建成功:", videoTexture);
      
      backgroundSprite = new Sprite(videoTexture);
      backgroundSprite.preload = "auto";
      backgroundSprite.width = app.screen.width;
      backgroundSprite.height = app.screen.height;
      app.stage.addChildAt(backgroundSprite, 0);
      console.log("舞台子元素数量:", app.stage.children.length);
      
      Ticker.shared.add(() => {
        videoTexture.update();
      });
    });
    videoObj.play();
  });
})();

// 处理面部识别结果
const onResults = results => {
  drawResults(results.multiFaceLandmarks[0]);
  animateLive2DModel(results.multiFaceLandmarks[0]);
};

// 绘制面部关键点参考线
const drawResults = landmarks => {
  if (!guideCanvas || !videoElement || !landmarks) {
    return;
  }
  guideCanvas.width = videoElement.videoWidth;
  guideCanvas.height = videoElement.videoHeight;
  let ctx = guideCanvas.getContext('2d');
  ctx.save();
  ctx.clearRect(0, 0, guideCanvas.width, guideCanvas.height);
  drawConnectors(ctx, landmarks, FACEMESH_TESSELATION, {
    'color': "#C0C0C070",
    'lineWidth': 1
  });
  if (landmarks && landmarks.length === 478) { // 0x1de = 478 关键点
    drawLandmarks(ctx, [landmarks[468], landmarks[473]], { // 0x1d4 = 468
      'color': "#ffe603",
      'lineWidth': 2
    });
  }
};

// 驱动 Live2D 模型
const animateLive2DModel = landmarks => {
  if (!currentModel || !landmarks) {
    return;
  }
  let riggedFace;
  if (landmarks) {
    riggedFace = Face.solve(landmarks, {
      'runtime': "mediapipe",
      'video': videoElement
    });
    
    const coreModel = currentModel.internalModel.coreModel;
    const hasParamMethods = typeof coreModel.getParameterValueById == "function" && typeof coreModel.setParameterValueById == "function";
    
    if (hasParamMethods) {
      const requiredParams = ["ParamEyeBallX", "ParamEyeBallY", "ParamAngleX", "ParamAngleY", "ParamAngleZ", "ParamBodyAngleX", "ParamBodyAngleY", "ParamBodyAngleZ", "ParamEyeLOpen", "ParamEyeROpen", "ParamMouthOpenY", 'ParamMouthForm'];
      let hasAllParams = true;
      for (const param of requiredParams) {
        if (typeof coreModel.getParameterValueById(param) == "undefined") {
          hasAllParams = false;
          break;
        }
      }
      if (hasAllParams) {
        rigFace(riggedFace, 0.5);
      } else {
        focusFace(riggedFace, landmarks, 0.5);
      }
    } else {
      focusFace(riggedFace, landmarks, 0.5);
    }
  }
};

// 聚焦面部 (如果缺少某些参数降级使用此方法)
const focusFace = riggedFace => {
  if (!currentModel || !riggedFace) {
    return;
  }
  const coreModel = currentModel.internalModel.coreModel;
  const canvas = document.getElementById("live2d");
  const bounds = canvas.getBoundingClientRect();
  const {
    degrees: headDegrees
  } = riggedFace.head;
  
  const centerX = bounds.width / 2;
  const centerY = bounds.height / 2;
  const offsetX = headDegrees.y / 5 * (bounds.width / 2);
  const offsetY = -headDegrees.x / 5 * (bounds.height / 2);
  const targetX = centerX + offsetX;
  const targetY = centerY + offsetY;
  
  currentModel.focus(targetX, targetY);
  coreModel.setParamFloat("PARAM_MOUTH_OPEN_Y", lerp(riggedFace.mouth.y, coreModel.getParamFloat("PARAM_MOUTH_OPEN_Y"), 0.3));
  currentModel.internalModel.eyeBlink.setEyeParams(lerp(riggedFace.eye.l, currentModel.internalModel.eyeBlink.eyeParamValue, 0.3));
};

// 骨骼绑定 (将识别到的数据绑定到 Live2D 参数上)
const rigFace = (riggedFace, lerpAmount = 0.7) => {
  if (!currentModel || !riggedFace) {
    return;
  }
  const coreModel = currentModel.internalModel.coreModel;
  currentModel.internalModel.motionManager.update = (...args) => {
    currentModel.internalModel.eyeBlink = undefined;
    
    // 眼球
    coreModel.setParameterValueById("ParamEyeBallX", lerp(riggedFace.pupil.x, coreModel.getParameterValueById("ParamEyeBallX"), lerpAmount));
    coreModel.setParameterValueById("ParamEyeBallY", lerp(riggedFace.pupil.y, coreModel.getParameterValueById("ParamEyeBallY"), lerpAmount));
    
    // 头部旋转
    coreModel.setParameterValueById('ParamAngleX', lerp(riggedFace.head.degrees.y, coreModel.getParameterValueById("ParamAngleX"), lerpAmount));
    coreModel.setParameterValueById("ParamAngleY", lerp(riggedFace.head.degrees.x, coreModel.getParameterValueById('ParamAngleY'), lerpAmount));
    coreModel.setParameterValueById('ParamAngleZ', lerp(riggedFace.head.degrees.z, coreModel.getParameterValueById("ParamAngleZ"), lerpAmount));
    
    // 身体旋转 (联动头部)
    coreModel.setParameterValueById("ParamBodyAngleX", lerp(riggedFace.head.degrees.y * 0.3, coreModel.getParameterValueById("ParamBodyAngleX"), lerpAmount));
    coreModel.setParameterValueById("ParamBodyAngleY", lerp(riggedFace.head.degrees.x * 0.3, coreModel.getParameterValueById('ParamBodyAngleY'), lerpAmount));
    coreModel.setParameterValueById("ParamBodyAngleZ", lerp(riggedFace.head.degrees.z * 0.3, coreModel.getParameterValueById("ParamBodyAngleZ"), lerpAmount));
    
    // 眼睛闭合 (防抖处理)
    let blinkState = Kalidokit.Face.stabilizeBlink({
      'l': lerp(riggedFace.eye.l, coreModel.getParameterValueById("ParamEyeLOpen"), 0.7),
      'r': lerp(riggedFace.eye.r, coreModel.getParameterValueById('ParamEyeROpen'), 0.7)
    }, riggedFace.head.y, {
      'enableWink': true,
      'maxRot': 0.5
    });
    
    coreModel.setParameterValueById("ParamEyeLOpen", blinkState.l);
    coreModel.setParameterValueById("ParamEyeROpen", blinkState.r);
    
    // 嘴巴
    coreModel.setParameterValueById('ParamMouthOpenY', lerp(riggedFace.mouth.y, coreModel.getParameterValueById("ParamMouthOpenY"), 0.3));
    coreModel.setParameterValueById('ParamMouthForm', 0.3 + lerp(riggedFace.mouth.x, coreModel.getParameterValueById("ParamMouthForm"), 0.3));
  };
};

// 启动摄像头
const startCamera = () => {
  const camera = new Camera(videoElement, {
    'onFrame': async () => {
      await facemesh.send({
        'image': videoElement
      });
    },
    'width': 640,  // 0x280
    'height': 480  // 0x1e0
  });
  camera.start();
};
