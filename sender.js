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

const videoElement = document.querySelector('.input_video');
const guideCanvas = document.querySelector("canvas.guides");

// 初始化 FaceMesh
const facemesh = new FaceMesh({
  locateFile: file => "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/" + file
});

facemesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

// 在 Canvas 上绘制面部网格和特征点
const drawResults = landmarks => {
  if (!guideCanvas || !videoElement || !landmarks) {
    return;
  }
  
  guideCanvas.width = videoElement.videoWidth;
  guideCanvas.height = videoElement.videoHeight;
  
  let ctx = guideCanvas.getContext('2d');
  ctx.save();
  ctx.clearRect(0, 0, guideCanvas.width, guideCanvas.height);
  
  // 绘制面部网格连线
  drawConnectors(ctx, landmarks, FACEMESH_TESSELATION, {
    color: "#C0C0C070",
    lineWidth: 1
  });
  
  // 478 是开启 refineLandmarks 后包含虹膜特征点的数组长度
  // 468 和 473 是左右眼虹膜中心的特征点索引
  if (landmarks && landmarks.length === 478) {
    drawLandmarks(ctx, [landmarks[468], landmarks[473]], {
      color: "#ffe603",
      lineWidth: 2
    });
  }
};

// 识别结果回调
facemesh.onResults(results => {
  const faceLandmarks = results.multiFaceLandmarks[0];
  drawResults(results.multiFaceLandmarks[0]);
  
  // 如果识别到人脸，并且 P2P 连接已建立，则向接收端发送数据
  if (faceLandmarks && conn && conn.open) {
    conn.send(faceLandmarks);
  }
});

// 启动摄像头
const startCamera = () => {
  const camera = new Camera(videoElement, {
    onFrame: async () => {
      await facemesh.send({
        image: videoElement
      });
    },
    width: 640,  // 0x280 的十进制
    height: 480  // 0x1e0 的十进制
  });
  camera.start();
};

// 初始化 Peer 节点
const peer = new Peer(null, {
  debug: 2
});

let conn;

// 监听本地节点准备就绪
peer.on("open", peerId => {
  console.log("My peer ID is: " + peerId);
  document.getElementById("myId").value = peerId;
});

// 点击按钮连接到接收端
document.getElementById("connectButton").addEventListener("click", () => {
  const receiverId = document.getElementById("receiverId").value;
  conn = peer.connect(receiverId);
  
  conn.on("open", () => {
    console.log("Connected to receiver");
  });
});

startCamera();
