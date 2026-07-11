const { Application, live2d: { Live2DModel, MotionPreloadStrategy }, Sprite, Texture, Ticker } = PIXI;
const { Face, Vector: { lerp }, Utils: { clamp } } = Kalidokit;

// ==========================================
// 1. 解析 URL 参数与模型配置
// ==========================================
const urlParams = new URLSearchParams(window.location.search);
let modelUrl = urlParams.get("modelUrl") || './models/hiyori/hiyori_pro_t10.model3.json';
console.log('modelUrl:', modelUrl);

if (modelUrl.endsWith('.json')) {
    let json = await fetch(modelUrl).then(res => res.json());
    json.url = json.url || modelUrl;
    
    // 处理特定的动作参数过滤
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
    console.log("modelUrl:", modelUrl);
}

// ==========================================
// 2. 初始化全局变量与 PIXI 舞台
// ==========================================
let currentModel;
let app;
let backgroundSprite;
let conn;
const peer = new Peer(null, { 'debug': 2 });

app = new PIXI.Application({
    'view': document.getElementById("live2d"),
    'autoStart': true,
    'backgroundAlpha': 0,
    'backgroundColor': 0xffffff,
    'resizeTo': window
});

// ==========================================
// 3. 加载 Live2D 模型并绑定交互事件
// ==========================================
Live2DModel.from(modelUrl, {
    'autoInteract': false,
    'motionPreload': MotionPreloadStrategy.NONE
}).then(model => {
    currentModel = model;
    currentModel.scale.set(0.4);
    currentModel.interactive = true;
    currentModel.anchor.set(0.5, 0.5);
    currentModel.position.set(window.innerWidth * 0.5, window.innerHeight * 0.8);

    // 拖拽逻辑
    currentModel.on("pointerdown", e => {
        currentModel.offsetX = e.data.global.x - currentModel.position.x;
        currentModel.offsetY = e.data.global.y - currentModel.position.y;
        currentModel.dragging = true;
    });
    currentModel.on("pointerup", () => {
        currentModel.dragging = false;
    });
    currentModel.on("pointermove", e => {
        if (currentModel.dragging) {
            currentModel.position.set(e.data.global.x - currentModel.offsetX, e.data.global.y - currentModel.offsetY);
        }
    });

    // 滚轮缩放逻辑
    document.querySelector("#live2d").addEventListener("wheel", e => {
        e.preventDefault();
        // 限制缩放比例在 -0.5 到 10 之间
        currentModel.scale.set(clamp(currentModel.scale.x + e.deltaY * -0.001, -0.5, 10)); 
    });

    app.stage.addChild(currentModel);

    // ==========================================
    // 4. 初始化 PeerJS (WebRTC) 接收面捕数据
    // ==========================================
    peer.on('open', peerId => {
        console.log("My peer ID is: " + peerId);
        document.getElementById("myId").value = peerId;
        document.getElementById("senderId").value = "Awaiting...";
    });

    peer.on("connection", function (connection) {
        // 防止重复连接
        if (conn && conn.open) {
            connection.on('open', function () {
                connection.send("Already connected to another client");
                setTimeout(function () {
                    connection.close();
                }, 500);
            });
            return;
        }
        conn = connection;
        console.log("Connected to: " + conn.peer);
        document.getElementById("senderId").value = "Connected";
        
        // 接收到面部数据时驱动模型
        conn.on("data", faceData => {
            animateLive2DModel(faceData);
        });
    });
});

// ==========================================
// 5. 监听背景切换事件 (图片/视频)
// ==========================================
window.addEventListener("clearBackgroundImage", function () {
    if (backgroundSprite) {
        app.stage.removeChild(backgroundSprite);
    }
});

window.addEventListener('setBackgroundImage', function (e) {
    const imageUrl = e.detail;
    if (backgroundSprite) {
        app.stage.removeChild(backgroundSprite);
    }
    const texture = Texture.from(imageUrl);
    backgroundSprite = new Sprite(texture);
    backgroundSprite.width = app.screen.width;
    backgroundSprite.height = app.screen.height;
    app.stage.addChildAt(backgroundSprite, 0); // 放在最底层
});

window.addEventListener("setBackgroundVideo", function (e) {
    const videoElement = e.detail;
    console.log("视频加载中:", videoElement);
    videoElement.play();
    console.log('视频播放中:', videoElement);

    videoElement.addEventListener("canplaythrough", function () {
        if (backgroundSprite) {
            app.stage.removeChild(backgroundSprite);
        }
        console.log("视频加载完成:", videoElement);
        
        const videoTexture = Texture.from(videoElement);
        videoTexture.baseTexture.resource.source.loop = true;
        
        if (!videoTexture || videoTexture.baseTexture.hasLoaded === false) {
            console.error("纹理创建失败或未加载完成");
            return;
        }
        
        console.log("纹理创建成功:", videoTexture);
        backgroundSprite = new Sprite(videoTexture);
        backgroundSprite.preload = 'auto';
        backgroundSprite.width = app.screen.width;
        backgroundSprite.height = app.screen.height;
        app.stage.addChildAt(backgroundSprite, 0);
        
        console.log("舞台子元素数量:", app.stage.children.length);
        Ticker.shared.add(() => {
            videoTexture.update();
        });
    });
    videoElement.play();
});

// ==========================================
// 6. 核心面捕驱动逻辑 (基于 Kalidokit 数据)
// ==========================================
const animateLive2DModel = rawFaceData => {
    if (!currentModel || !rawFaceData) return;

    if (rawFaceData) {
        // 使用 Kalidokit 解析面捕原始数据
        const faceRigData = Face.solve(rawFaceData, {
            'runtime': 'mediapipe',
            'video': null
        });
        
        const coreModel = currentModel.internalModel.coreModel;
        const hasParamFunctions = typeof coreModel.getParameterValueById == "function" && typeof coreModel.setParameterValueById == "function";
        
        // 检查模型是否支持标准的 Live2D 参数
        if (hasParamFunctions) {
            const requiredParams = [
                "ParamEyeBallX", "ParamEyeBallY", "ParamAngleX", "ParamAngleY", 
                "ParamAngleZ", 'ParamBodyAngleX', 'ParamBodyAngleY', "ParamBodyAngleZ", 
                "ParamEyeLOpen", "ParamEyeROpen", "ParamMouthOpenY", 'ParamMouthForm'
            ];
            
            let hasAllParams = true;
            for (const param of requiredParams) {
                if (typeof coreModel.getParameterValueById(param) == "undefined") {
                    hasAllParams = false;
                    break;
                }
            }
            
            // 如果参数齐全，使用高精度参数映射；否则使用基础的 focus 回退方案
            if (hasAllParams) {
                rigFace(faceRigData, 0.5);
            } else {
                focusFace(faceRigData, rawFaceData, 0.5);
            }
        } else {
            focusFace(faceRigData, rawFaceData, 0.5);
        }
    }
};

// 基础回退驱动方案：仅控制目光焦点和嘴巴开合
const focusFace = faceRigData => {
    if (!currentModel || !faceRigData) return;
    
    const coreModel = currentModel.internalModel.coreModel;
    const canvas = document.getElementById('live2d');
    const rect = canvas.getBoundingClientRect();
    const { degrees } = faceRigData.head;
    
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    // 根据头部旋转角度计算目光焦点位置
    const focusX = (degrees.y / 5) * (rect.width / 2);
    const focusY = -(degrees.x / 5) * (rect.height / 2);
    
    currentModel.focus(centerX + focusX, centerY + focusY);
    
    // 基础的面部动作插值
    coreModel.setParamFloat("PARAM_MOUTH_OPEN_Y", lerp(faceRigData.mouth.y, coreModel.getParamFloat("PARAM_MOUTH_OPEN_Y"), 0.3));
    currentModel.internalModel.eyeBlink.setEyeParams(lerp(faceRigData.eye.l, currentModel.internalModel.eyeBlink.eyeParamValue, 0.3));
};

// 高级驱动方案：映射详细的面部参数 (眼球、头部扭转、身体扭转、眼睑、嘴型)
const rigFace = (faceRigData, dampening = 0.7) => {
    if (!currentModel || !faceRigData) return;
    
    const coreModel = currentModel.internalModel.coreModel;
    
    // 接管 Live2D 内部的 motionManager 刷新循环
    currentModel.internalModel.motionManager.update = (...args) => {
        // 禁用内置的自动眨眼，由面捕数据接管
        currentModel.internalModel.eyeBlink = undefined; 
        
        // 眼球转动
        coreModel.setParameterValueById("ParamEyeBallX", lerp(faceRigData.pupil.x, coreModel.getParameterValueById('ParamEyeBallX'), dampening));
        coreModel.setParameterValueById("ParamEyeBallY", lerp(faceRigData.pupil.y, coreModel.getParameterValueById("ParamEyeBallY"), dampening));
        
        // 头部转动 (X, Y, Z)
        coreModel.setParameterValueById('ParamAngleX', lerp(faceRigData.head.degrees.y, coreModel.getParameterValueById("ParamAngleX"), dampening));
        coreModel.setParameterValueById('ParamAngleY', lerp(faceRigData.head.degrees.x, coreModel.getParameterValueById("ParamAngleY"), dampening));
        coreModel.setParameterValueById("ParamAngleZ", lerp(faceRigData.head.degrees.z, coreModel.getParameterValueById("ParamAngleZ"), dampening));
        
        // 身体跟随转动 (通常取头部旋转的 30% 作为联动)
        coreModel.setParameterValueById('ParamBodyAngleX', lerp(faceRigData.head.degrees.y * 0.3, coreModel.getParameterValueById("ParamBodyAngleX"), dampening));
        coreModel.setParameterValueById("ParamBodyAngleY", lerp(faceRigData.head.degrees.x * 0.3, coreModel.getParameterValueById("ParamBodyAngleY"), dampening));
        coreModel.setParameterValueById("ParamBodyAngleZ", lerp(faceRigData.head.degrees.z * 0.3, coreModel.getParameterValueById("ParamBodyAngleZ"), dampening));
        
        // 眨眼稳定器：防止面捕轻微抖动导致的疯狂眨眼
        let blinkData = Kalidokit.Face.stabilizeBlink({
            'l': lerp(faceRigData.eye.l, coreModel.getParameterValueById('ParamEyeLOpen'), 0.7),
            'r': lerp(faceRigData.eye.r, coreModel.getParameterValueById("ParamEyeROpen"), 0.7)
        }, faceRigData.head.y, {
            'enableWink': true,
            'maxRot': 0.5
        });
        
        coreModel.setParameterValueById('ParamEyeLOpen', blinkData.l);
        coreModel.setParameterValueById("ParamEyeROpen", blinkData.r);
        
        // 嘴部开合与形状变形
        coreModel.setParameterValueById("ParamMouthOpenY", lerp(faceRigData.mouth.y, coreModel.getParameterValueById("ParamMouthOpenY"), 0.3));
        coreModel.setParameterValueById('ParamMouthForm', 0.3 + lerp(faceRigData.mouth.x, coreModel.getParameterValueById("ParamMouthForm"), 0.3));
    };
};
