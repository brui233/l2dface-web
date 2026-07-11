var uploadvideo = null;
const controlElement = document.getElementById('controllive2d');
const toggleControlButton = document.getElementById("toggleControlButton");
const origincontrolElementDisplay = controlElement.style.display;

// 清除背景
document.getElementById("clearButton").addEventListener("click", function () {
  if (uploadvideo) {
    uploadvideo.pause();
    uploadvideo = null;
    document.getElementById("backgroundVideoUpload").value = '';
    document.getElementById('backgroundUpload').value = '';
  }
  window.dispatchEvent(new CustomEvent('clearBackgroundImage'));
});

// 触发背景图片上传
document.getElementById("uploadButton").addEventListener('click', function () {
  document.getElementById('backgroundUpload').click();
});

// 处理背景图片上传逻辑
document.getElementById("backgroundUpload").addEventListener("change", function (event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function (readerEvent) {
      const image = new Image();
      image.src = readerEvent.target.result;
      image.onload = function () {
        window.dispatchEvent(new CustomEvent("setBackgroundImage", {
          'detail': image
        }));
      };
    };
    reader.readAsDataURL(file);
  }
});

// 触发背景视频上传
document.getElementById("uploadVideoButton").addEventListener("click", function () {
  document.getElementById("backgroundVideoUpload").click();
});

// 处理背景视频上传逻辑
document.getElementById('backgroundVideoUpload').addEventListener('change', function (event) {
  const videoFile = event.target.files[0];
  if (videoFile) {
    uploadvideo = document.createElement("video");
    console.log(uploadvideo);
    uploadvideo.src = URL.createObjectURL(videoFile);
    uploadvideo.loop = true;
    uploadvideo.muted = true;
    uploadvideo.autoplay = true;
    console.log(uploadvideo);
    
    uploadvideo.addEventListener("loadstart", function () {
      uploadvideo.onloadedmetadata = function () {
        console.log("视频元数据已加载");
        window.dispatchEvent(new CustomEvent("setBackgroundVideo", {
          'detail': uploadvideo
        }));
      };
    });
    
    uploadvideo.addEventListener("error", function () {
      console.log("视频加载出错:", uploadvideo.error);
    });
    
    uploadvideo.play().catch(error => {
      console.log('视频播放被阻止:', error);
    });
  }
});

const videoElement = document.querySelector('.input_video');
const toggleButton = document.getElementById("toggleVideoButton");
const live2dcanvas = document.getElementById("live2d");
const canvas2video = document.createElement("video");
const params = new URLSearchParams(location.search);

// 根据 URL 参数设置画布视频自动播放
if (params.has('autoplay')) {
  canvas2video.autoplay = true;
  canvas2video.srcObject = live2dcanvas.captureStream();
} else if (params.has("autoplay-muted")) {
  canvas2video.autoplay = true;
  canvas2video.muted = true;
  canvas2video.srcObject = live2dcanvas.captureStream();
} else {
  canvas2video.srcObject = live2dcanvas.captureStream();
  canvas2video.muted = true;
  canvas2video.play();
}

// 视频显示/隐藏切换
if (toggleButton) {
  toggleButton.addEventListener("click", function () {
    if (videoElement.style.display === "none") {
      videoElement.style.display = "block";
      toggleButton.textContent = "隐藏视频";
    } else {
      videoElement.style.display = "none";
      toggleButton.textContent = "显示视频";
    }
  });
}

// 鼠标移动监听：靠近屏幕边缘显示控制按钮
document.body.addEventListener('mousemove', function (event) {
  // 将原本的 0x32 转换为了十进制的 50
  if (event.clientX < 50 || event.clientX > window.innerWidth - 50) {
    if (toggleButton) {
      toggleButton.style.display = 'block';
    }
    toggleControlButton.style.display = 'block';
  } else {
    if (toggleButton) {
      toggleButton.style.display = "none";
    }
    toggleControlButton.style.display = "none";
  }
});

// 画中画模式切换
const pipButton = document.getElementById("pipButton");
pipButton.addEventListener("click", function () {
  if (document.pictureInPictureElement) {
    document.exitPictureInPicture();
  } else {
    canvas2video.requestPictureInPicture();
  }
});

// 控制面板显示/隐藏切换
toggleControlButton.addEventListener("click", function () {
  if (controlElement.style.display === "none") {
    controlElement.style.display = origincontrolElementDisplay;
    toggleControlButton.textContent = "隐藏控制";
  } else {
    controlElement.style.display = "none";
    toggleControlButton.textContent = '显示控制';
  }
});
