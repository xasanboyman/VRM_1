<template>
  <div
    class="loader-container relative flex h-full w-full items-center justify-center bg-[#030305] overflow-hidden select-none perspective-1000"
  >
    <!-- Background: Hex Grid & Vignette -->
    <div
      class="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.1)_0%,transparent_90%)]"
    ></div>

    <!-- Moving Grid Floor (Deep perspective) -->
    <div
      class="absolute -bottom-[30%] -left-[50%] -right-[50%] h-[120vh] bg-[linear-gradient(rgba(34,211,238,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.05)_1px,transparent_1px)] bg-[size:80px_80px] opacity-30 transform-style-3d rotate-x-70 animate-grid-flow"
    ></div>

    <!-- Ceiling Grid (Mirror) -->
    <div
      class="absolute -top-[30%] -left-[50%] -right-[50%] h-[120vh] bg-[linear-gradient(rgba(168,85,247,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(168,85,247,0.05)_1px,transparent_1px)] bg-[size:80px_80px] opacity-20 transform-style-3d rotate-x-minus-70 animate-grid-flow-reverse"
    ></div>

    <!-- Digital Rain / Matrix Effect -->
    <div class="absolute inset-0 pointer-events-none opacity-20 overflow-hidden">
      <div
        v-for="n in 12"
        :key="`rain-${n}`"
        class="absolute top-[-100%] w-[1px] bg-gradient-to-b from-transparent via-cyan-500 to-transparent animate-digital-rain"
        :style="{
          left: `${n * 8.33}%`,
          height: `${Math.random() * 50 + 20}%`,
          animationDuration: `${Math.random() * 2 + 1}s`,
          animationDelay: `${Math.random() * 2}s`,
        }"
      ></div>
    </div>

    <!-- CRT Scanline Overlay -->
    <div
      class="absolute inset-0 z-40 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.3)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.01),rgba(0,0,255,0.03))] bg-[size:100%_3px,4px_100%] pointer-events-none"
    ></div>

    <!-- The Quantum Reactor (3D Scene) -->
    <div
      class="reactor-core relative flex items-center justify-center transform-style-3d zoom-in-out-aggressive"
    >
      <!-- Core Energy Sphere (The Singularity) -->
      <div
        class="absolute h-10 w-10 rounded-full bg-white shadow-[0_0_80px_rgba(6,182,212,1)] animate-pulse-hyper z-30 mix-blend-screen"
      ></div>
      <div
        class="absolute h-14 w-14 rounded-full border border-white/80 animate-ping-rapid z-20"
      ></div>

      <!-- Holographic Cone -->
      <div
        class="absolute bottom-0 h-40 w-40 bg-gradient-to-t from-cyan-500/0 via-cyan-500/10 to-transparent clip-triangle animate-pulse-slow transform-style-3d rotate-x-30"
      ></div>

      <!-- Inner High-Speed Gyros -->
      <div
        class="absolute h-20 w-20 rounded-full border-[1px] border-cyan-300/80 animate-spin-3d-hyper"
      ></div>
      <div
        class="absolute h-24 w-24 rounded-full border-[1px] border-dashed border-purple-400/80 animate-spin-3d-hyper-reverse"
      ></div>

      <!-- Ring 1: Main Accelerator (Cyan) -->
      <div
        class="absolute h-48 w-48 rounded-full border-[3px] border-transparent border-l-cyan-400 border-r-cyan-400 shadow-[0_0_50px_rgba(34,211,238,0.6)] animate-spin-3d-1"
      ></div>
      <div
        class="absolute h-44 w-44 rounded-full border-[1px] border-cyan-500/20 animate-spin-3d-1-reverse"
      ></div>

      <!-- Ring 2: Stabilizer (Purple) -->
      <div
        class="absolute h-64 w-64 rounded-full border-[2px] border-transparent border-t-purple-500 border-b-purple-500 shadow-[0_0_50px_rgba(168,85,247,0.6)] animate-spin-3d-2"
      ></div>

      <!-- Ring 3: Vertical Scanner (White) -->
      <div
        class="absolute h-72 w-72 rounded-full border-[1px] border-transparent border-l-white/40 border-r-white/40 animate-spin-3d-vertical"
      ></div>

      <!-- Ring 4: Outer Data Field -->
      <div
        class="ring-outer absolute rounded-full border border-white/5 opacity-50 animate-spin-slow-reverse"
      >
        <!-- Orbiting Data Points -->
        <div class="absolute top-1/2 -left-1 h-2 w-1 bg-cyan-400 shadow-[0_0_15px_cyan]"></div>
        <div class="absolute top-1/2 -right-1 h-2 w-1 bg-purple-400 shadow-[0_0_15px_purple]"></div>
        <div class="absolute -top-1 left-1/2 h-1 w-2 bg-white shadow-[0_0_15px_white]"></div>
        <div class="absolute -bottom-1 left-1/2 h-1 w-2 bg-white shadow-[0_0_15px_white]"></div>
      </div>

      <!-- Floating Particles -->
      <div class="particle-field absolute pointer-events-none">
        <div
          v-for="n in 12"
          :key="n"
          class="absolute h-0.5 w-0.5 bg-cyan-300 rounded-full animate-float-particle"
          :style="{
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 2}s`,
          }"
        ></div>
      </div>
    </div>

    <!-- HUD Overlay -->
    <div class="absolute bottom-10 flex flex-col items-center gap-6 z-50">
      <!-- Audio Visualizer (Fake) -->
      <div class="flex gap-1 h-6 items-end">
        <div
          v-for="n in 10"
          :key="`bar-${n}`"
          class="w-1 bg-cyan-500/50 animate-pulse-eq"
          :style="{
            height: `${Math.random() * 100}%`,
            animationDuration: `${0.2 + Math.random() * 0.3}s`,
          }"
        ></div>
      </div>

      <!-- Glitch Text -->
      <h1
        class="glitch-text text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-[0.15em] sm:tracking-[0.25em] text-white font-mono drop-shadow-[0_0_20px_rgba(6,182,212,1)]"
        data-text="QUANTUM SYNC AI"
      >
        QUANTUM AI SYNC
      </h1>

      <div class="w-[min(420px,calc(100vw-2rem))] space-y-3 relative">
        <!-- Tech Progress Bar -->
        <div
          class="relative h-2 w-full bg-white/5 overflow-hidden clip-tech backdrop-blur-sm border-x border-cyan-500/30"
        >
          <div
            class="h-full bg-gradient-to-r from-cyan-400 via-white to-purple-600 shadow-[0_0_30px_rgba(34,211,238,1)] transition-all duration-75 ease-linear"
            :style="{ width: `${Math.max(2, progress)}%` }"
          ></div>
          <div
            class="absolute top-0 bottom-0 w-32 bg-white/40 skew-x-12 blur-md animate-scan"
          ></div>
        </div>

        <div
          class="flex justify-between font-mono text-[10px] text-cyan-300/90 mix-blend-screen px-1"
        >
          <span class="uppercase tracking-widest animate-pulse font-bold flex gap-2">
            <span class="text-purple-400">>></span> {{ stage }}
          </span>
          <span class="font-bold tracking-wider">
            BUFFER: {{ Math.round(progress) }}% <span class="text-purple-400">/ 100%</span>
          </span>
        </div>

        <!-- Terminal Output -->
        <div class="h-10 overflow-hidden relative border-l-2 border-cyan-500/20 pl-3">
          <p
            class="text-[10px] font-mono text-cyan-400/80 uppercase tracking-wider animate-typewriter"
          >
            > {{ detail }}...
          </p>
          <p
            class="text-[9px] font-mono text-purple-400/50 uppercase tracking-wider absolute top-5 animate-pulse"
          >
            > D.STREAM: 0x{{
              Math.floor(Math.random() * 9999)
                .toString(16)
                .toUpperCase()
            }}F2 // SECURE
          </p>
        </div>

        <!-- Decorative HUD Corners -->
        <div class="absolute top-0 -left-4 w-2 h-2 border-t border-l border-cyan-500/50"></div>
        <div class="absolute top-0 -right-4 w-2 h-2 border-t border-r border-cyan-500/50"></div>
        <div class="absolute bottom-0 -left-4 w-2 h-2 border-b border-l border-cyan-500/50"></div>
        <div class="absolute bottom-0 -right-4 w-2 h-2 border-b border-r border-cyan-500/50"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  progress: {
    type: Number,
    default: 0,
  },
  stage: {
    type: String,
    default: 'Initializing',
  },
  detail: {
    type: String,
    default: 'Handshake protocol',
  },
})
</script>

<style scoped>
.perspective-1000 {
  perspective: 1400px;
}
.transform-style-3d {
  transform-style: preserve-3d;
}

/* Responsive ring + particle container */
.ring-outer {
  width: clamp(220px, 55vmin, 420px);
  height: clamp(220px, 55vmin, 420px);
}
.particle-field {
  width: clamp(300px, 80vmin, 600px);
  height: clamp(300px, 80vmin, 600px);
}

/* Responsive reactor rings */
.reactor-core > .absolute.h-48 {
  width: clamp(100px, 25vmin, 192px);
  height: clamp(100px, 25vmin, 192px);
}
.reactor-core > .absolute.h-64 {
  width: clamp(130px, 33vmin, 256px);
  height: clamp(130px, 33vmin, 256px);
}
.reactor-core > .absolute.h-72 {
  width: clamp(150px, 37vmin, 288px);
  height: clamp(150px, 37vmin, 288px);
}
.rotate-x-70 {
  transform: rotateX(70deg) scale(3);
}
.rotate-x-minus-70 {
  transform: rotateX(-70deg) scale(3);
}
.rotate-x-30 {
  transform: rotateX(70deg);
}

/* Animations */
@keyframes spin-3d-1 {
  0% {
    transform: rotateX(65deg) rotateY(10deg) rotateZ(0deg);
  }
  100% {
    transform: rotateX(65deg) rotateY(10deg) rotateZ(360deg);
  }
}
@keyframes spin-3d-1-reverse {
  0% {
    transform: rotateX(65deg) rotateY(10deg) rotateZ(360deg);
  }
  100% {
    transform: rotateX(65deg) rotateY(10deg) rotateZ(0deg);
  }
}
@keyframes spin-3d-2 {
  0% {
    transform: rotateY(70deg) rotateX(-10deg) rotateZ(0deg);
  }
  100% {
    transform: rotateY(70deg) rotateX(-10deg) rotateZ(-360deg);
  }
}
@keyframes spin-3d-vertical {
  0% {
    transform: rotateY(0deg) rotateX(90deg);
  }
  100% {
    transform: rotateY(360deg) rotateX(90deg);
  }
}
@keyframes spin-3d-hyper {
  to {
    transform: rotateX(60deg) rotateY(60deg) rotateZ(360deg);
  }
}
@keyframes spin-3d-hyper-reverse {
  to {
    transform: rotateX(-60deg) rotateY(-60deg) rotateZ(-360deg);
  }
}
@keyframes spin-slow-reverse {
  to {
    transform: rotate(-360deg);
  }
}
@keyframes pulse-hyper {
  0%,
  100% {
    opacity: 0.8;
    transform: scale(1);
    box-shadow: 0 0 60px rgba(6, 182, 212, 0.8);
  }
  50% {
    opacity: 1;
    transform: scale(1.3);
    box-shadow: 0 0 120px rgba(6, 182, 212, 1);
  }
}
@keyframes zoom-in-out-aggressive {
  0%,
  100% {
    transform: scale(0.9);
  }
  50% {
    transform: scale(1.05);
  }
}
@keyframes grid-flow {
  from {
    background-position: 0 0;
  }
  to {
    background-position: 0 160px;
  }
}
@keyframes grid-flow-reverse {
  from {
    background-position: 0 0;
  }
  to {
    background-position: 0 -160px;
  }
}
@keyframes scan {
  0% {
    left: -100%;
  }
  100% {
    left: 200%;
  }
}
@keyframes float-particle {
  0%,
  100% {
    transform: translateY(0) scale(0);
    opacity: 0;
  }
  50% {
    transform: translateY(-40px) scale(1);
    opacity: 0.6;
  }
}
@keyframes digital-rain {
  to {
    top: 100%;
  }
}
@keyframes pulse-eq {
  0%,
  100% {
    height: 10%;
  }
  50% {
    height: 90%;
  }
}

.animate-spin-3d-1 {
  animation: spin-3d-1 3s linear infinite;
}
.animate-spin-3d-1-reverse {
  animation: spin-3d-1-reverse 4s linear infinite;
}
.animate-spin-3d-2 {
  animation: spin-3d-2 4.5s linear infinite;
}
.animate-spin-3d-vertical {
  animation: spin-3d-vertical 6s linear infinite;
}
.animate-spin-3d-hyper {
  animation: spin-3d-hyper 0.8s linear infinite;
}
.animate-spin-3d-hyper-reverse {
  animation: spin-3d-hyper-reverse 1s linear infinite;
}
.animate-spin-slow-reverse {
  animation: spin-slow-reverse 15s linear infinite;
}
.animate-pulse-hyper {
  animation: pulse-hyper 0.4s ease-in-out infinite;
}
.zoom-in-out-aggressive {
  animation: zoom-in-out-aggressive 3s ease-in-out infinite;
}
.animate-grid-flow {
  animation: grid-flow 3s linear infinite;
}
.animate-grid-flow-reverse {
  animation: grid-flow-reverse 3s linear infinite;
}
.animate-scan {
  animation: scan 1.5s linear infinite;
}
.animate-float-particle {
  animation: float-particle 2s ease-in-out infinite;
}
.animate-digital-rain {
  animation: digital-rain 2s linear infinite;
}
.animate-ping-rapid {
  animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;
}
.animate-pulse-eq {
  animation: pulse-eq 0.5s ease-in-out infinite;
}

/* Glitch Effect */
.glitch-text {
  position: relative;
}
.glitch-text::before,
.glitch-text::after {
  content: attr(data-text);
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: #030305;
}
.glitch-text::before {
  left: 3px;
  text-shadow: -2px 0 #00ffff;
  clip: rect(24px, 550px, 90px, 0);
  animation: glitch-anim 2.5s infinite linear alternate-reverse;
}
.glitch-text::after {
  left: -3px;
  text-shadow: -2px 0 #ff00ff;
  clip: rect(85px, 550px, 140px, 0);
  animation: glitch-anim-2 3s infinite linear alternate-reverse;
}

@keyframes glitch-anim {
  0% {
    clip: rect(44px, 9999px, 56px, 0);
  }
  20% {
    clip: rect(10px, 9999px, 90px, 0);
  }
  40% {
    clip: rect(60px, 9999px, 20px, 0);
  }
  60% {
    clip: rect(10px, 9999px, 80px, 0);
  }
  80% {
    clip: rect(90px, 9999px, 10px, 0);
  }
  100% {
    clip: rect(30px, 9999px, 70px, 0);
  }
}
@keyframes glitch-anim-2 {
  0% {
    clip: rect(10px, 9999px, 80px, 0);
  }
  20% {
    clip: rect(80px, 9999px, 10px, 0);
  }
  40% {
    clip: rect(30px, 9999px, 60px, 0);
  }
  60% {
    clip: rect(70px, 9999px, 30px, 0);
  }
  80% {
    clip: rect(20px, 9999px, 90px, 0);
  }
  100% {
    clip: rect(50px, 9999px, 40px, 0);
  }
}

.clip-tech {
  clip-path: polygon(0 0, 100% 0, 97% 100%, 3% 100%);
}
.clip-triangle {
  clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
}
</style>
