class MediaHandler {
    constructor() {
        this.audioContext = null;
        this.mediaStream = null;
        this.audioWorkletNode = null;
        this.nextStartTime = 0;
        this.scheduledSources = [];
        this.isRecording = false;
    }

    async initializeAudio() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
            await this.audioContext.audioWorklet.addModule("/static/js/pcm-processor.js");
        }
        if (this.audioContext.state === "suspended") {
            await this.audioContext.resume();
        }
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

    playAudio(arrayBuffer) {
        if (!this.audioContext) {
            return;
        }

        if (this.audioContext.state === "suspended") {
            this.audioContext.resume();
        }

        const pcmData = new Int16Array(arrayBuffer);
        const float32Data = new Float32Array(pcmData.length);
        for (let i = 0; i < pcmData.length; i += 1) {
            float32Data[i] = pcmData[i] / 32768.0;
        }

        const buffer = this.audioContext.createBuffer(1, float32Data.length, 24000);
        buffer.getChannelData(0).set(float32Data);

        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);

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
    }

    stopAudioPlayback() {
        this.scheduledSources.forEach((source) => {
            try {
                source.stop();
            } catch (_) {
                // ignore
            }
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
