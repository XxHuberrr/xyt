(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const video = $("video");
  const volumeCanvas = $("volumeCanvas");
  const sampleCanvas = $("sampleCanvas");
  const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
  const gl = volumeCanvas.getContext("webgl2", { alpha: false, antialias: true });
  const state = {
    mode: "all", color: "#8ff8e8", opacity: .72, sliceCount: 48, maxSlices: 64,
    gpuMaxSlices: 64, sampleFps: 20, firstSampleTime: 0,
    depth: 2.6, yaw: -.68, pitch: .10, distance: 4.3, autoRotate: false,
    showVolume: true, showBox: true, volumeReady: false, volumeBuilding: false,
    abort: null, texture: null, aspect: 1, objectUrl: null, loaded: false,
    detection: "idle", detectionTimer: null, sampleTimer: null, samples: [], lastSample: null,
    detectionStartedAt: 0, wasPlayingBeforeDetection: false, lastToast: null, drag: null,
    programs: null, quadBuffer: null, boxBuffer: null, boxIndexBuffer: null, timelineBuffer: null, lastRender: performance.now(), raf: 0,
    volumeBuildSeq: 0,
    sourceExtension: "MP4", isReference: true, buildId: 0,
  };
  const refs = {
    videoFrame: $("videoFrame"), dropzone: $("dropzone"), fileInput: $("fileInput"), sourceName: $("sourceName"), profileName: $("profileName"), chooseButton: $("chooseButton"), replaceButton: $("replaceButton"), playButton: $("playButton"), playLabel: $("playLabel"), loopToggle: $("loopToggle"), volumeSlider: $("volumeSlider"), volumeValue: $("volumeValue"), speedSelect: $("speedSelect"), colorPicker: $("colorPicker"), colorValue: $("colorValue"), opacitySlider: $("opacitySlider"), opacityValue: $("opacityValue"), densitySlider: $("densitySlider"), densityValue: $("densityValue"), overlayToggle: $("overlayToggle"), runDetectionButton: $("runDetectionButton"), runButtonLabel: $("runButtonLabel"), timeline: $("timeline"), timelinePlayButton: $("timelinePlayButton"), backButton: $("backButton"), forwardButton: $("forwardButton"), currentTime: $("currentTime"), durationTime: $("durationTime"), timelineStatus: $("timelineStatus"), stageTimecode: $("stageTimecode"), stageResolution: $("stageResolution"), stageMode: $("stageMode"), metaDuration: $("metaDuration"), metaFormat: $("metaFormat"), metaSize: $("metaSize"), metaFps: $("metaFps"), emptyState: $("emptyState"), scanOverlay: $("scanOverlay"), scanPercent: $("scanPercent"), scanProgressBar: $("scanProgressBar"), scanCenterLabel: $("scanCenterLabel"), reportStatus: $("reportStatus"), reportTitle: $("reportTitle"), reportSubtitle: $("reportSubtitle"), reportFootLeft: $("reportFootLeft"), reportFootRight: $("reportFootRight"), metricMotion: $("metricMotion"), metricInterval: $("metricInterval"), metricBrightness: $("metricBrightness"), metricPeak: $("metricPeak"), muteButton: $("muteButton"), muteLabel: $("muteLabel"), fullscreenButton: $("fullscreenButton"), toast: $("toast"), toastText: $("toastText"), headerClock: $("headerClock"), helpButton: $("helpButton"), helpModal: $("helpModal"), closeHelp: $("closeHelp"), closeHelpCta: $("closeHelpCta"),
  };
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const time = (s) => Number.isFinite(s) ? `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "00:00";
  const tc = (s) => Number.isFinite(s) ? `00:${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}:${String(Math.floor((s % 1) * 30)).padStart(2, "0")}` : "00:00:00:00";
  const nameOf = (s) => s.length > 30 ? `${s.slice(0, 27)}…` : s;
  const rgb = (hex) => { const v = hex.replace("#", ""); const n = v.length === 3 ? v.split("").map((x) => x + x).join("") : v; return [parseInt(n.slice(0, 2), 16) / 255, parseInt(n.slice(2, 4), 16) / 255, parseInt(n.slice(4, 6), 16) / 255]; };

  function toast(message) { refs.toastText.textContent = message; refs.toast.classList.add("show"); clearTimeout(state.lastToast); state.lastToast = setTimeout(() => refs.toast.classList.remove("show"), 2800); }
  function clock() { const d = new Date(); refs.headerClock.textContent = [d.getHours(), d.getMinutes(), d.getSeconds()].map((x) => String(x).padStart(2, "0")).join(":"); }
  function updateLabels() { refs.volumeValue.textContent = `${Math.round(Number(refs.volumeSlider.value) * 100)}%`; refs.opacityValue.textContent = `${Math.round(Number(refs.opacitySlider.value) * 100)}%`; refs.densityValue.textContent = `${Math.round(Number(refs.densitySlider.value))} FPS`; refs.colorValue.textContent = refs.colorPicker.value.toUpperCase(); }
  function setName(name) { refs.sourceName.textContent = nameOf(name); refs.profileName.textContent = nameOf(name); refs.profileName.title = name; state.sourceExtension = (name.includes(".") ? name.split(".").pop() : "mp4").toUpperCase(); state.isReference = name === "reference.mp4"; document.title = `${nameOf(name)} · xy+t`; }
  function updateMode() { refs.stageMode.textContent = ({ all: "ALL / XY + Z", stack: "STACK / XY SLICES", box: "BOX / VOLUME FRAME", rail: "TIME-Z / RAIL" })[state.mode] || "ALL / XY + Z"; }
  function updateTime() { refs.currentTime.textContent = time(video.currentTime || 0); refs.stageTimecode.textContent = tc(video.currentTime || 0); if (document.activeElement !== refs.timeline) refs.timeline.value = video.currentTime || 0; }
  function updatePlayback() { const playing = !video.paused && !video.ended; refs.playButton.querySelector(".play-glyph").textContent = playing ? "Ⅱ" : "▶"; refs.timelinePlayButton.textContent = playing ? "Ⅱ" : "▶"; refs.playLabel.textContent = playing ? "正在播放" : (video.currentTime > 0 ? "已暂停" : "准备播放"); refs.playButton.setAttribute("aria-label", playing ? "暂停" : "播放"); refs.timelineStatus.textContent = state.volumeBuilding ? "BUILDING TIME VOLUME" : state.detection === "scanning" ? "SCANNING FRAME SIGNAL" : playing ? "PLAYING REFERENCE" : "READY TO SAMPLE"; }
  async function togglePlay() { if (!state.loaded) { toast("请先载入一段视频"); return; } if (video.paused) { try { await video.play(); } catch { toast("浏览器阻止了播放，请再次点击"); } } else video.pause(); }
  function metadata() {
    const w = video.videoWidth || 0;
    const h = video.videoHeight || 0;
    state.aspect = w && h ? w / h : 1;
    refs.stageResolution.textContent = w && h ? `${w} × ${h}` : "— × —";
    refs.metaSize.textContent = refs.stageResolution.textContent;
    refs.durationTime.textContent = time(video.duration);
    refs.metaDuration.textContent = time(video.duration);
    refs.metaFormat.textContent = state.sourceExtension;
    refs.metaFps.textContent = state.isReference ? "30" : "AUTO";
    refs.timeline.max = Number.isFinite(video.duration) ? video.duration : 100;
    // The temporal texture is user-adjustable, but never exceeds 50 samples per
    // second or the hardware array-texture layer limit. Keep at least two layers
    // so a very short clip still has a visible Z interval.
    if (Number.isFinite(video.duration) && video.duration > 0) {
      const maxForVideo = clamp(Math.floor((state.gpuMaxSlices - 1) / video.duration), 1, 50);
      refs.densitySlider.max = String(maxForVideo);
      const selected = clamp(Math.round(Number(refs.densitySlider.value) || state.sampleFps), 1, maxForVideo);
      refs.densitySlider.value = String(selected);
      state.sampleFps = selected;
    }
    refs.emptyState.classList.toggle("hidden", !state.loaded);
    updateMode();
    updateTime();
  }

  function shader(type, source) { const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  function program(v, f) { const p = gl.createProgram(); gl.attachShader(p, shader(gl.VERTEX_SHADER, v)); gl.attachShader(p, shader(gl.FRAGMENT_SHADER, f)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; }
  function matrixMultiply(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; }
  function perspective(fov, aspect, near, far) { const f = 1 / Math.tan(fov / 2); const nf = 1 / (near - far); return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]); }
  function rotX(r) { const c = Math.cos(r), s = Math.sin(r); return new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]); }
  function rotY(r) { const c = Math.cos(r), s = Math.sin(r); return new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1]); }
  function translate(z) { return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,z,1]); }

  function initGL() {
    if (!gl) { refs.videoFrame.classList.remove("webgl-ready"); toast("当前浏览器不支持 WebGL2，无法显示时间切片体"); return; }
    const sliceV = `#version 300 es\nlayout(location=0) in vec2 aPos; layout(location=1) in vec2 aUV; uniform mat4 uMvp; uniform float uAspect,uDepth; uniform int uLayers,uTextureLayers; out vec2 vUV; flat out int vLayer; void main(){int k=gl_InstanceID;float q=float(k)/max(1.0,float(uLayers-1));float z=(q-.5)*uDepth;gl_Position=uMvp*vec4(aPos*vec2(uAspect,1.),z,1.);vUV=aUV;vLayer=int(q*float(uTextureLayers-1)+.5);}`;
    const sliceF = `#version 300 es\nprecision highp float;precision highp sampler2DArray;uniform sampler2DArray uFrames;uniform vec3 uTint;uniform float uOpacity;in vec2 vUV;flat in int vLayer;out vec4 outColor;void main(){vec4 f=texture(uFrames,vec3(vUV,float(vLayer)));float edge=min(min(vUV.x,1.-vUV.x),min(vUV.y,1.-vUV.y));float feather=.46+.54*smoothstep(0.,.085,edge);float luminance=dot(f.rgb,vec3(.2126,.7152,.0722));float a=uOpacity*(.06+.28*luminance)*feather;vec3 soft=mix(f.rgb,uTint,.16);outColor=vec4(soft,a);}`;
    const currentV = `#version 300 es\nlayout(location=0) in vec2 aPos; layout(location=1) in vec2 aUV; uniform mat4 uMvp; uniform float uAspect,uCurrentZ; out vec2 vUV; void main(){gl_Position=uMvp*vec4(aPos*vec2(uAspect,1.),uCurrentZ,1.);vUV=aUV;}`;
    const currentF = `#version 300 es\nprecision highp float;precision highp sampler2DArray;uniform sampler2DArray uFrames;uniform vec3 uTint;uniform int uLayer;in vec2 vUV;out vec4 outColor;void main(){vec4 f=texture(uFrames,vec3(vUV,float(uLayer)));float edge=min(min(vUV.x,1.-vUV.x),min(vUV.y,1.-vUV.y));float feather=smoothstep(0.,.075,edge);vec3 bright=min(vec3(1.),f.rgb*1.16+vec3(.018));outColor=vec4(mix(bright,uTint,.08),feather*.42);}`;
    const lineV = `#version 300 es\nlayout(location=0) in vec3 aPos;uniform mat4 uMvp;void main(){gl_Position=uMvp*vec4(aPos,1.);}`;
    const lineF = `#version 300 es\nprecision highp float;uniform vec4 uColor;out vec4 outColor;void main(){outColor=uColor;}`;
    try { state.programs = { slices: program(sliceV, sliceF), current: program(currentV, currentF), lines: program(lineV, lineF) }; } catch (e) { console.error(e); toast("时间切片着色器初始化失败"); return; }
    state.gpuMaxSlices = Math.max(2, gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS) || state.maxSlices); state.maxSlices = Math.min(state.maxSlices, state.gpuMaxSlices); state.sliceCount = Math.min(state.sliceCount, state.maxSlices); refs.densitySlider.min = "1"; refs.densitySlider.max = "50"; refs.densitySlider.value = String(state.sampleFps); updateLabels(); state.quadBuffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, state.quadBuffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,0,0,1,-1,1,0,1,1,1,1,-1,-1,0,0,1,1,1,1,-1,1,0,1]), gl.STATIC_DRAW); state.boxBuffer = gl.createBuffer(); state.boxIndexBuffer = gl.createBuffer(); state.timelineBuffer = gl.createBuffer(); boxGeometry(); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); render();
  }
  function boxGeometry() { if (!gl || !state.boxBuffer) return; const w = state.aspect * 1.06, h = 1.06, d = state.depth / 2; const p = [[-w,-h,-d],[w,-h,-d],[w,h,-d],[-w,h,-d],[-w,-h,d],[w,-h,d],[w,h,d],[-w,h,d]]; /* Leave the lower outline and lower side rails open so the time volume does not acquire a second underline. */ const e = [1,2,2,3,3,0,5,6,6,7,7,4,2,6,3,7]; gl.bindBuffer(gl.ARRAY_BUFFER, state.boxBuffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(p.flat()), gl.STATIC_DRAW); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, state.boxIndexBuffer); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(e), gl.STATIC_DRAW); }
  function resizeCanvas() { const r = refs.videoFrame.getBoundingClientRect(); const d = Math.min(devicePixelRatio || 1, 2); const w = Math.floor(r.width * d), h = Math.floor(r.height * d); if (volumeCanvas.width !== w || volumeCanvas.height !== h) { volumeCanvas.width = w; volumeCanvas.height = h; if (gl) gl.viewport(0, 0, w, h); } volumeCanvas.style.width = `${r.width}px`; volumeCanvas.style.height = `${r.height}px`; }
  function drawSegments(p, data, color, mode = gl.LINES) {
    if (!data.length || !state.timelineBuffer) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, state.timelineBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.uniform4f(gl.getUniformLocation(p, "uColor"), color[0], color[1], color[2], color[3]);
    gl.drawArrays(mode, 0, data.length / 3);
  }

  function drawLines(mvp, tint) {
    const p = state.programs.lines;
    gl.useProgram(p);
    gl.uniformMatrix4fv(gl.getUniformLocation(p, "uMvp"), false, mvp);
    gl.bindBuffer(gl.ARRAY_BUFFER, state.boxBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, state.boxIndexBuffer);
    gl.uniform4f(gl.getUniformLocation(p, "uColor"), tint[0], tint[1], tint[2], .78);
    gl.disable(gl.BLEND);
    gl.drawElements(gl.LINES, 16, gl.UNSIGNED_SHORT, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // The time axis is visible on every side of the box. Keeping this geometry
    // separate from boxBuffer avoids overwriting the cube while the playhead moves.
    const timelineVisible = ["all", "box", "rail"].includes(state.mode);
    if (!timelineVisible) return;
    const start = Math.min(state.firstSampleTime || 0, Math.max(0, (video.duration || 0) - .001));
    const span = Math.max(.001, (video.duration || 0) - start);
    const t = video.duration ? clamp((video.currentTime - start) / span, 0, 1) : 0;
    const d = state.depth / 2;
    const w = state.aspect * 1.06;
    const h = 1.06;
    const edgeW = w * 1.015;
    const edgeH = h * 1.015;

    // Four z-axis edge rails expose temporal depth when the object is rotated.
    const railData = [];
    [[edgeW, edgeH], [-edgeW, edgeH]].forEach(([x, y]) => {
      railData.push(x, y, -d, x, y, d);
    });
    drawSegments(p, railData, [tint[0], tint[1], tint[2], .34]);

    // Perimeter rings act as evenly spaced time ticks around all four sides,
    // so the temporal ordering stays legible from any camera angle.
    const rings = [];
    const ringCount = Math.min(12, Math.max(6, Math.round(state.sliceCount / 24)));
    for (let i = 0; i < ringCount; i++) {
      const q = i / (ringCount - 1);
      const z = -d + q * state.depth;
      const r = [[-edgeW, -edgeH, z], [edgeW, -edgeH, z], [edgeW, edgeH, z], [-edgeW, edgeH, z], [-edgeW, -edgeH, z]];
      for (let j = 1; j < 4; j++) rings.push(...r[j], ...r[j + 1]);
    }
    drawSegments(p, rings, [tint[0], tint[1], tint[2], .07]);

    // Highlight the current temporal position as a complete perimeter ring,
    // rather than a front-only line. It follows playback and timeline dragging.
    const z = (t - .5) * state.depth;
    const active = [[-edgeW * 1.025, -edgeH * 1.025, z], [edgeW * 1.025, -edgeH * 1.025, z], [edgeW * 1.025, edgeH * 1.025, z], [-edgeW * 1.025, edgeH * 1.025, z], [-edgeW * 1.025, -edgeH * 1.025, z]];
    const activeData = [];
    for (let j = 1; j < 4; j++) activeData.push(...active[j], ...active[j + 1]);
    drawSegments(p, activeData, [.96, 1, .84, .98]);

    // The side rails and active perimeter carry the temporal cue. Avoid an
    // extra external bottom rail, which reads as two unrelated lines below
    // the volume when the camera is rotated.
  }
    function currentTextureLayer() {
      if (!Number.isFinite(video.duration) || !video.duration || state.maxSlices < 2) return 0;
      const start = Math.min(state.firstSampleTime || 0, Math.max(0, video.duration - .001));
      const span = Math.max(.001, video.duration - start);
      return clamp(Math.round(((video.currentTime - start) / span) * (state.maxSlices - 1)), 0, state.maxSlices - 1);
    }
    function render(now = performance.now()) {
      if (!gl || !state.programs) return;
      const dt = Math.min(80, now - state.lastRender);
      state.lastRender = now;
      if (state.autoRotate && !state.drag) state.yaw += dt * .00022;
      resizeCanvas();
      const mvp = matrixMultiply(perspective(Math.PI / 4, volumeCanvas.width / Math.max(1, volumeCanvas.height), .1, 100), matrixMultiply(translate(-state.distance), matrixMultiply(rotY(state.yaw), rotX(state.pitch))));
      gl.clearColor(.025, .035, .05, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const tint = rgb(state.color);
      const volumeVisible = state.texture && state.volumeReady && state.showVolume && ["all", "stack", "rail"].includes(state.mode);
      if (volumeVisible) {
        const p = state.programs.slices;
        gl.useProgram(p);
        gl.bindBuffer(gl.ARRAY_BUFFER, state.quadBuffer);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
        gl.uniformMatrix4fv(gl.getUniformLocation(p, "uMvp"), false, mvp);
        gl.uniform1f(gl.getUniformLocation(p, "uAspect"), state.aspect);
        gl.uniform1f(gl.getUniformLocation(p, "uDepth"), state.depth);
        gl.uniform1i(gl.getUniformLocation(p, "uLayers"), state.sliceCount);
        gl.uniform1i(gl.getUniformLocation(p, "uTextureLayers"), state.maxSlices);
        gl.uniform3fv(gl.getUniformLocation(p, "uTint"), tint);
        // Keep the stack readable as slice count changes; the selected frame
        // below is a bright, feathered overlay so it cannot hide foreground slices.
        gl.uniform1f(gl.getUniformLocation(p, "uOpacity"), state.opacity / Math.max(1, Math.sqrt(state.sliceCount / 4)));
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, state.texture);
        gl.uniform1i(gl.getUniformLocation(p, "uFrames"), 0);
        gl.disable(gl.DEPTH_TEST);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, state.sliceCount);

        // Draw the frame corresponding to the actual playhead last. Its bright
        // translucent fill and perimeter ring identify it without blocking the volume.
        const current = state.programs.current;
        const layer = currentTextureLayer();
        const z = (layer / Math.max(1, state.maxSlices - 1) - .5) * state.depth;
        gl.useProgram(current);
        gl.bindBuffer(gl.ARRAY_BUFFER, state.quadBuffer);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
        gl.uniformMatrix4fv(gl.getUniformLocation(current, "uMvp"), false, mvp);
        gl.uniform1f(gl.getUniformLocation(current, "uAspect"), state.aspect);
        gl.uniform1f(gl.getUniformLocation(current, "uCurrentZ"), z);
        gl.uniform1i(gl.getUniformLocation(current, "uLayer"), layer);
        gl.uniform3fv(gl.getUniformLocation(current, "uTint"), tint);
        gl.uniform1i(gl.getUniformLocation(current, "uFrames"), 0);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      if (state.showBox && ["all", "box", "rail"].includes(state.mode)) drawLines(mvp, tint);
      state.raf = requestAnimationFrame(render);
    }

  function seek(t) { return new Promise((resolve, reject) => { const target = clamp(t, 0, Math.max(0, video.duration - .03)); const requestTarget = target === 0 ? Math.min(.001, Math.max(0, video.duration - .03)) : target; if (Math.abs(video.currentTime - requestTarget) < .015 && video.readyState >= 2) { resolve(); return; } let timer = 0; const done = () => { clean(); resolve(); }; const fail = () => { clean(); reject(video.error || new Error("seek failed")); }; const clean = () => { video.removeEventListener("seeked", done); video.removeEventListener("error", fail); clearTimeout(timer); }; video.addEventListener("seeked", done, { once: true }); video.addEventListener("error", fail, { once: true }); timer = setTimeout(done, 1600); video.currentTime = requestTarget; }); }
  function frameLuma(ctx, w, h) {
    try {
      const pixels = ctx.getImageData(0, 0, w, h).data;
      let total = 0;
      const count = pixels.length / 4;
      for (let i = 0; i < pixels.length; i += 4) total += .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2];
      return count ? total / (count * 255) : 0;
    } catch {
      return 0;
    }
  }

  async function buildVolume() {
    if (!gl || !state.loaded || !Number.isFinite(video.duration)) return;
    if (state.abort) state.abort.abort();
    const buildSeq = ++state.volumeBuildSeq;
    // A slider change can start a new build while the previous one is still
    // seeking. Give every build its own generation so an aborted worker cannot
    // clear the newer worker's overlay or restore its playhead.
    const buildId = ++state.buildId;
    const controller = new AbortController();
    state.abort = controller;
    state.volumeBuilding = true;
    state.volumeReady = false;
    if (state.texture) {
      gl.deleteTexture(state.texture);
      state.texture = null;
    }
    refs.videoFrame.classList.remove("webgl-ready");
    updatePlayback();

    const duration = Math.max(0, video.duration);
    const maxLayers = Math.max(2, state.gpuMaxSlices || gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS) || 64);
    // A user-selected sampling rate is translated to temporal layers. The
    // hardware cap may lower it for long clips, but it can never exceed 50fps.
    const sampleFps = clamp(Number(state.sampleFps) || 12, 1, 50);
    const layers = clamp(Math.ceil(duration * sampleFps) + 1, 2, maxLayers);
    state.maxSlices = layers;
    state.sliceCount = layers;

    // Keep high sample rates usable by bounding the RGBA array texture. At the
    // default 12–20fps the source can stay at 720px; pushing toward 50fps
    // trades some spatial resolution for temporal density instead of failing
    // allocation on the GPU.
    const sourceH = video.videoHeight || 512;
    const sourceW = video.videoWidth || 512;
    const textureBudget = 512 * 1024 * 1024;
    const budgetDimension = Math.floor(Math.sqrt(textureBudget / (4 * layers)));
    const maxDimension = Math.min(720, gl.getParameter(gl.MAX_TEXTURE_SIZE) || 720, Math.max(256, budgetDimension));
    const scale = Math.min(1, maxDimension / Math.max(sourceW, sourceH));
    const w = Math.max(1, Math.round(sourceW * scale));
    const h = Math.max(1, Math.round(sourceH * scale));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const cctx = c.getContext("2d", { willReadFrequently: true });
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, w, h, layers);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    const playing = !video.paused;
    const old = video.currentTime;
    video.pause();
    refs.scanOverlay.classList.add("active");
    try {
      // Browsers often expose a decoded black backbuffer for a seek at exactly
      // t=0. Probe a few early decoded frames and use the first visibly valid
      // one, keeping the rest of the volume temporally continuous from there.
      const firstLimit = Math.max(0, duration - Math.min(.04, duration / 4));
      const probeTimes = [...new Set([.04, .08, .16, .32].map((t) => clamp(t, 0, firstLimit)).filter((t) => Number.isFinite(t)))];
      let firstSampleTime = probeTimes[0] ?? 0;
      let firstLuma = -1;
      for (let i = 0; i < probeTimes.length; i++) {
        if (controller.signal.aborted) throw new Error("aborted");
        const t = probeTimes[i];
        await seek(t);
        cctx.drawImage(video, 0, 0, w, h);
        const luma = frameLuma(cctx, w, h);
        // Prefer the earliest decoded frame above the black-frame threshold.
        if (luma > .018 || i === probeTimes.length - 1) {
          firstSampleTime = t;
          firstLuma = luma;
          break;
        }
        if (luma > firstLuma) { firstLuma = luma; firstSampleTime = t; }
      }
      state.firstSampleTime = firstSampleTime;
      const endSampleTime = Math.max(firstSampleTime, duration - Math.min(.03, duration / 4));
      for (let i = 0; i < layers; i++) {
        if (controller.signal.aborted) throw new Error("aborted");
        const t = layers === 1 ? firstSampleTime : firstSampleTime + (endSampleTime - firstSampleTime) * i / (layers - 1);
        await seek(t);
        cctx.drawImage(video, 0, 0, w, h);
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, w, h, 1, gl.RGBA, gl.UNSIGNED_BYTE, c);
        const pct = Math.round((i + 1) / layers * 100);
        refs.scanPercent.textContent = `${String(pct).padStart(2, "0")}%`;
        refs.scanProgressBar.style.width = `${pct}%`;
        refs.scanCenterLabel.textContent = `BUILDING XY SLICE ${String(i + 1).padStart(2, "0")} / ${layers}`;
      }
      state.texture = tex;
      state.volumeReady = true;
      refs.videoFrame.classList.add("webgl-ready");
      const effectiveFps = duration > 0 ? ((layers - 1) / duration).toFixed(1) : "0.0";
      toast(`${layers} 帧已沿 Z 轴写入时间体（${w}×${h}，${effectiveFps}fps）`);
    } catch (e) {
      if (e.message !== "aborted") { console.error(e); toast("无法建立时间切片体，请重新载入视频"); }
      gl.deleteTexture(tex);
    } finally {
      if (state.buildId !== buildId || state.volumeBuildSeq !== buildSeq) return;
      video.currentTime = Math.min(old, Math.max(0, video.duration - .03));
      if (playing) video.play().catch(() => {});
      refs.scanOverlay.classList.remove("active");
      state.volumeBuilding = false;
      updatePlayback();
    }
  }

  function setVideo(src, name, object = false) { state.buildId += 1; if (state.abort) state.abort.abort(); state.abort = null; state.volumeBuilding = false; state.firstSampleTime = 0; if (state.objectUrl) URL.revokeObjectURL(state.objectUrl); state.objectUrl = object ? src : null; state.loaded = false; state.volumeReady = false; refs.videoFrame.classList.remove("webgl-ready"); if (state.texture && gl) gl.deleteTexture(state.texture); state.texture = null; video.pause(); video.src = src; video.load(); setName(name); refs.reportStatus.className = "report-status"; refs.reportTitle.textContent = "尚未运行"; refs.reportSubtitle.textContent = "先建立时间切片体，再运行运动检测"; refs.reportFootLeft.textContent = "IDLE / WAITING"; refs.reportFootRight.textContent = "—"; [refs.metricMotion, refs.metricInterval, refs.metricBrightness, refs.metricPeak].forEach((x) => { x.textContent = "—"; }); video.addEventListener("loadedmetadata", () => { state.loaded = true; metadata(); refs.emptyState.classList.add("hidden"); boxGeometry(); buildVolume(); }, { once: true }); video.addEventListener("error", () => toast("无法读取这个视频文件，请尝试 MP4 / WebM / MOV"), { once: true }); }
  function handleFile(file) { if (!file) return; if (!(file.type.startsWith("video/") || /\.(mp4|m4v|mov|webm|ogv|avi|mkv)$/i.test(file.name))) { toast("请选择视频文件"); return; } setVideo(URL.createObjectURL(file), file.name, true); }

  function sample() { if (!state.loaded || video.readyState < 2) return; try { sampleCtx.drawImage(video, 0, 0, sampleCanvas.width, sampleCanvas.height); const d = sampleCtx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data; let total = 0, delta = 0; for (let i = 0; i < d.length; i += 4) { total += .2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2]; if (state.lastSample) delta += Math.abs(d[i] - state.lastSample[i]) + Math.abs(d[i + 1] - state.lastSample[i + 1]) + Math.abs(d[i + 2] - state.lastSample[i + 2]); } state.samples.push({ time: performance.now(), brightness: total / (d.length / 4) / 255, delta: state.lastSample ? delta / ((d.length / 4) * 3 * 255) : 0 }); state.lastSample = d; } catch {} }
  function finishDetection() { clearInterval(state.sampleTimer); clearTimeout(state.detectionTimer); state.detection = "complete"; refs.scanOverlay.classList.remove("active"); refs.runButtonLabel.textContent = "再次检测"; const s = state.samples, deltas = s.slice(1).map((x) => x.delta), bright = s.map((x) => x.brightness), avg = s.length > 1 ? (s.at(-1).time - s[0].time) / (s.length - 1) : 0, motion = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0, peak = deltas.length ? Math.max(...deltas) : 0, score = clamp(Math.round(motion * 1000), 0, 99); refs.reportStatus.className = `report-status ${score < 4 ? "review" : "complete"}`; refs.reportTitle.textContent = score < 4 ? "LOW SIGNAL / REVIEW" : "PASS / MOTION FOUND"; refs.reportSubtitle.textContent = `${s.length} 个本地帧样本已完成分析`; refs.reportFootLeft.textContent = "COMPLETE / LOCAL ONLY"; refs.reportFootRight.textContent = `${Math.round((performance.now() - state.detectionStartedAt) / 10) / 100}s`; refs.metricMotion.textContent = `${score}/99`; refs.metricInterval.textContent = `${Math.round(avg)}ms`; refs.metricBrightness.textContent = bright.length ? `${Math.round(Math.min(...bright) * 100)}–${Math.round(Math.max(...bright) * 100)}` : "—"; refs.metricPeak.textContent = `${Math.round(peak * 100)}%`; if (!state.wasPlayingBeforeDetection) video.pause(); updatePlayback(); toast("检测完成，报告已更新"); }
  async function runDetection() { if (state.detection === "scanning") return; if (!state.loaded) { toast("请先载入一段视频"); return; } if (state.volumeBuilding) { toast("时间切片体仍在建立，请稍候"); return; } state.detection = "scanning"; state.samples = []; state.lastSample = null; state.detectionStartedAt = performance.now(); state.wasPlayingBeforeDetection = !video.paused; refs.scanPercent.textContent = "00%"; refs.scanProgressBar.style.width = "0%"; refs.reportStatus.className = "report-status running"; refs.reportTitle.textContent = "SCANNING / 0%"; refs.reportSubtitle.textContent = "正在读取视频帧的亮度与运动差分"; refs.runButtonLabel.textContent = "取消检测"; refs.scanOverlay.classList.add("active"); try { await video.play(); } catch {} sample(); state.sampleTimer = setInterval(sample, 100); const start = state.detectionStartedAt; const tick = () => { if (state.detection !== "scanning") return; const p = clamp((performance.now() - start) / 5000, 0, 1), pct = Math.round(p * 100); refs.scanPercent.textContent = `${String(pct).padStart(2, "0")}%`; refs.scanProgressBar.style.width = `${pct}%`; refs.reportTitle.textContent = `SCANNING / ${pct}%`; if (p < 1) requestAnimationFrame(tick); }; requestAnimationFrame(tick); state.detectionTimer = setTimeout(finishDetection, 5000); }
  function cancelDetection() { if (state.detection !== "scanning") return; clearInterval(state.sampleTimer); clearTimeout(state.detectionTimer); state.detection = "idle"; refs.scanOverlay.classList.remove("active"); refs.runButtonLabel.textContent = "运行检测"; refs.reportStatus.className = "report-status"; refs.reportTitle.textContent = "已取消"; refs.reportSubtitle.textContent = "可以继续旋转时间体或再次检测"; if (!state.wasPlayingBeforeDetection) video.pause(); updatePlayback(); toast("检测已取消"); }

  function events() {
    refs.chooseButton.addEventListener("click", (e) => { e.stopPropagation(); refs.fileInput.click(); }); refs.replaceButton.addEventListener("click", () => refs.fileInput.click()); refs.dropzone.addEventListener("click", (e) => { if (!e.target.closest("button")) refs.fileInput.click(); }); refs.dropzone.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); refs.fileInput.click(); } }); refs.fileInput.addEventListener("change", (e) => { handleFile(e.target.files[0]); e.target.value = ""; }); ["dragenter", "dragover"].forEach((n) => refs.dropzone.addEventListener(n, (e) => { e.preventDefault(); refs.dropzone.classList.add("dragover"); })); ["dragleave", "drop"].forEach((n) => refs.dropzone.addEventListener(n, (e) => { e.preventDefault(); refs.dropzone.classList.remove("dragover"); })); refs.dropzone.addEventListener("drop", (e) => handleFile(e.dataTransfer.files[0]));
    refs.playButton.addEventListener("click", togglePlay); refs.timelinePlayButton.addEventListener("click", togglePlay); refs.loopToggle.addEventListener("change", () => { video.loop = refs.loopToggle.checked; }); refs.volumeSlider.addEventListener("input", () => { video.volume = Number(refs.volumeSlider.value); updateLabels(); }); refs.speedSelect.addEventListener("change", () => { video.playbackRate = Number(refs.speedSelect.value); }); refs.colorPicker.addEventListener("input", () => { state.color = refs.colorPicker.value; updateLabels(); }); refs.opacitySlider.addEventListener("input", () => { state.opacity = Number(refs.opacitySlider.value); updateLabels(); }); refs.densitySlider.addEventListener("input", () => { state.sampleFps = clamp(Math.round(Number(refs.densitySlider.value)), 1, 50); updateLabels(); }); refs.densitySlider.addEventListener("change", () => { if (state.loaded) buildVolume(); }); refs.overlayToggle.addEventListener("change", () => { state.showVolume = refs.overlayToggle.checked; });
    document.querySelectorAll(".mode-tab").forEach((tab) => tab.addEventListener("click", () => { document.querySelectorAll(".mode-tab").forEach((x) => x.classList.remove("active")); tab.classList.add("active"); state.mode = tab.dataset.mode; state.showVolume = ["all", "stack", "rail"].includes(state.mode); state.showBox = ["all", "box", "rail"].includes(state.mode); refs.overlayToggle.checked = state.showVolume; updateMode(); })); refs.timeline.addEventListener("input", () => { video.currentTime = Number(refs.timeline.value); updateTime(); }); refs.backButton.addEventListener("click", () => { video.currentTime = clamp(video.currentTime - 10, 0, video.duration || 0); }); refs.forwardButton.addEventListener("click", () => { video.currentTime = clamp(video.currentTime + 10, 0, video.duration || 0); }); refs.runDetectionButton.addEventListener("click", () => state.detection === "scanning" ? cancelDetection() : runDetection()); video.addEventListener("loadedmetadata", metadata); video.addEventListener("timeupdate", updateTime); video.addEventListener("play", updatePlayback); video.addEventListener("pause", updatePlayback); refs.muteButton.addEventListener("click", () => { video.muted = !video.muted; refs.muteLabel.textContent = video.muted ? "关" : "开"; }); refs.fullscreenButton.addEventListener("click", () => { (refs.videoFrame.requestFullscreen || refs.videoFrame.webkitRequestFullscreen)?.call(refs.videoFrame); });
    volumeCanvas.addEventListener("pointerdown", (e) => { state.drag = { x: e.clientX, y: e.clientY, yaw: state.yaw, pitch: state.pitch }; volumeCanvas.classList.add("dragging"); volumeCanvas.setPointerCapture(e.pointerId); }); volumeCanvas.addEventListener("pointermove", (e) => { if (!state.drag) return; state.yaw = state.drag.yaw + (e.clientX - state.drag.x) * .008; state.pitch = clamp(state.drag.pitch + (e.clientY - state.drag.y) * .008, -1.2, 1.2); }); ["pointerup", "pointercancel"].forEach((n) => volumeCanvas.addEventListener(n, (e) => { state.drag = null; volumeCanvas.classList.remove("dragging"); try { volumeCanvas.releasePointerCapture(e.pointerId); } catch {} })); volumeCanvas.addEventListener("wheel", (e) => { e.preventDefault(); state.distance = clamp(state.distance + e.deltaY * .003, 2.5, 7); }, { passive: false });
    refs.helpButton.addEventListener("click", () => { refs.helpModal.classList.add("open"); refs.helpModal.setAttribute("aria-hidden", "false"); }); [refs.closeHelp, refs.closeHelpCta].forEach((b) => b.addEventListener("click", () => { refs.helpModal.classList.remove("open"); refs.helpModal.setAttribute("aria-hidden", "true"); })); refs.helpModal.addEventListener("click", (e) => { if (e.target === refs.helpModal) refs.closeHelp.click(); }); window.addEventListener("resize", resizeCanvas); document.addEventListener("keydown", (e) => { if (e.target.matches("input, select, textarea")) return; if (e.code === "Space") { e.preventDefault(); togglePlay(); } if (e.key.toLowerCase() === "r") { e.preventDefault(); state.detection === "scanning" ? cancelDetection() : runDetection(); } if (e.key === "ArrowLeft") video.currentTime = clamp(video.currentTime - 10, 0, video.duration || 0); if (e.key === "ArrowRight") video.currentTime = clamp(video.currentTime + 10, 0, video.duration || 0); });
  }
  async function init() {
    clock(); setInterval(clock, 1000); updateLabels();
    video.volume = Number(refs.volumeSlider.value); video.loop = true;
    if (gl) initGL(); events(); resizeCanvas();
    // A local reference is optional; published packages start ready for upload.
    const sourceVersion = state.buildId;
    try {
      const response = await fetch("reference.mp4", { method: "HEAD" });
      if (response.ok && state.buildId === sourceVersion) setVideo("reference.mp4", "reference.mp4");
    } catch { /* Local files can still be selected when no reference is bundled. */ }
  }
  init();
})();
