class MediaHandler {
    constructor() {
        this.audioContext = null;
        this.mediaStream = null;
        this.audioWorkletNode = null;
        this.nextStartTime = 0;
        this.scheduledSources = [];
        this.isRecording = false;
        this.analyser = null;
        this.freqData = null;
        this.analyserLoopRunning = false;
    }

    async initializeAudio() {
        if (!this.audioContext) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioCtx({ sampleRate: 48000 });
            
            try {
                await this.audioContext.audioWorklet.addModule("/static/js/pcm-processor.js");
            } catch (err) {
                console.warn("[MediaHandler] AudioWorklet module load notice:", err);
            }

            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 64;
            this.analyser.smoothingTimeConstant = 0.6;
            this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
            this.startAnalyserLoop();
        }
        
        if (this.audioContext.state === "suspended") {
            await this.audioContext.resume();
        }
    }

    startAnalyserLoop() {
        if (this.analyserLoopRunning) return;
        this.analyserLoopRunning = true;

        const loop = () => {
            requestAnimationFrame(loop);
            if (!this.analyser || !this.freqData) return;

            this.analyser.getByteFrequencyData(this.freqData);

            let sum = 0;
            for (let i = 0; i < this.freqData.length; i++) {
                sum += this.freqData[i];
            }
            const avg = sum / this.freqData.length / 255;

            if (window.AvatarController && typeof window.AvatarController.updateAudioData === "function") {
                window.AvatarController.updateAudioData(this.freqData, avg);
            }
        };
        requestAnimationFrame(loop);
    }

    async startAudio(onAudioData) {
        await this.initializeAudio();

        this.mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            },
        });

        const source = this.audioContext.createMediaStreamSource(this.mediaStream);
        this.audioWorkletNode = new AudioWorkletNode(this.audioContext, "pcm-processor");

        this.audioWorkletNode.port.onmessage = (event) => {
            if (!this.isRecording) {
                return;
            }
            const downsampled = this.downsampleBuffer(event.data, this.audioContext.sampleRate, 16000);
            const pcm16 = this.convertFloat32ToInt16(downsampled);
            onAudioData(pcm16);
        };

        source.connect(this.audioWorkletNode);

        const muteGain = this.audioContext.createGain();
        muteGain.gain.value = 0;
        this.audioWorkletNode.connect(muteGain);
        muteGain.connect(this.audioContext.destination);

        this.isRecording = true;
    }

    stopAudio() {
        this.isRecording = false;
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach((track) => track.stop());
            this.mediaStream = null;
        }
        if (this.audioWorkletNode) {
            this.audioWorkletNode.disconnect();
            this.audioWorkletNode = null;
        }
    }

    async playAudio(arrayBuffer) {
        if (!arrayBuffer || arrayBuffer.byteLength === 0) return;

        // Auto-initialize AudioContext if not already created (e.g. for text-initiated responses)
        if (!this.audioContext) {
            await this.initializeAudio();
        }

        if (this.audioContext && this.audioContext.state === "suspended") {
            try {
                await this.audioContext.resume();
            } catch (_) {}
        }

        if (!this.audioContext) return;

        try {
            const pcmData = new Int16Array(arrayBuffer);
            const float32Data = new Float32Array(pcmData.length);
            for (let i = 0; i < pcmData.length; i += 1) {
                float32Data[i] = pcmData[i] / 32768.0;
            }

            const buffer = this.audioContext.createBuffer(1, float32Data.length, 24000);
            buffer.getChannelData(0).set(float32Data);

            const source = this.audioContext.createBufferSource();
            source.buffer = buffer;

            if (this.analyser) {
                source.connect(this.analyser);
                this.analyser.connect(this.audioContext.destination);
            } else {
                source.connect(this.audioContext.destination);
            }

            const now = this.audioContext.currentTime;
            this.nextStartTime = Math.max(now, this.nextStartTime);
            source.start(this.nextStartTime);
            this.nextStartTime += buffer.duration;

            this.scheduledSources.push(source);
            source.onended = () => {
                const idx = this.scheduledSources.indexOf(source);
                if (idx > -1) {
                    this.scheduledSources.splice(idx, 1);
                }
            };
        } catch (err) {
            console.error("[MediaHandler] Audio decode playback error:", err);
        }
    }

    stopAudioPlayback() {
        this.scheduledSources.forEach((source) => {
            try {
                source.stop();
            } catch (_) {}
        });
        this.scheduledSources = [];
        if (this.audioContext) {
            this.nextStartTime = this.audioContext.currentTime;
        }
    }

    downsampleBuffer(buffer, inputRate, outputRate) {
        if (inputRate === outputRate) {
            return buffer;
        }
        const ratio = inputRate / outputRate;
        const newLength = Math.round(buffer.length / ratio);
        const result = new Float32Array(newLength);

        let offsetResult = 0;
        let offsetBuffer = 0;

        while (offsetResult < result.length) {
            const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
            let accum = 0;
            let count = 0;
            for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i += 1) {
                accum += buffer[i];
                count += 1;
            }
            result[offsetResult] = accum / count;
            offsetResult += 1;
            offsetBuffer = nextOffsetBuffer;
        }

        return result;
    }

    convertFloat32ToInt16(buffer) {
        const out = new Int16Array(buffer.length);
        for (let i = 0; i < buffer.length; i += 1) {
            out[i] = Math.min(1, Math.max(-1, buffer[i])) * 0x7fff;
        }
        return out.buffer;
    }
}
