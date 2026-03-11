const WORKLET_PROCESSOR_NAME = 'buddy-lipsync-processor';

let workletModuleUrl: string | null = null;

function createWorkletSource(): string {
  return `
class BuddyLipSyncProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frameSize = 1024;
    this.hopSize = 512;
    this.buffer = new Float32Array(this.frameSize);
    this.bufferIndex = 0;
    this.sampleCount = 0;
    this.hopCounter = 0;
    this.reportCounter = 0;
    this.window = new Float32Array(this.frameSize);
    for (let i = 0; i < this.frameSize; i += 1) {
      this.window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (this.frameSize - 1));
    }
    this.melFilters = this.createMelFilterBank(20, this.frameSize, sampleRate, 80, 7600);
  }

  hzToMel(hz) {
    return 2595 * Math.log10(1 + hz / 700);
  }

  melToHz(mel) {
    return 700 * (Math.pow(10, mel / 2595) - 1);
  }

  createMelFilterBank(filterCount, fftSize, sr, minHz, maxHz) {
    const melMin = this.hzToMel(minHz);
    const melMax = this.hzToMel(maxHz);
    const melPoints = [];
    for (let i = 0; i < filterCount + 2; i += 1) {
      melPoints.push(melMin + ((melMax - melMin) * i) / (filterCount + 1));
    }
    const hzPoints = melPoints.map((value) => this.melToHz(value));
    const binPoints = hzPoints.map((value) => Math.max(0, Math.min(
      Math.floor(((fftSize + 1) * value) / sr),
      fftSize / 2,
    )));

    const filters = [];
    for (let m = 1; m <= filterCount; m += 1) {
      const filter = new Float32Array(fftSize / 2 + 1);
      const left = binPoints[m - 1];
      const center = binPoints[m];
      const right = binPoints[m + 1];
      for (let k = left; k < center; k += 1) {
        filter[k] = center === left ? 0 : (k - left) / (center - left);
      }
      for (let k = center; k < right; k += 1) {
        filter[k] = right === center ? 0 : (right - k) / (right - center);
      }
      filters.push(filter);
    }
    return filters;
  }

  computeSpectrum(frame) {
    const n = frame.length;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      real[i] = frame[i] * this.window[i];
    }

    for (let i = 1, j = 0; i < n; i += 1) {
      let bit = n >> 1;
      while (j & bit) {
        j ^= bit;
        bit >>= 1;
      }
      j ^= bit;
      if (i < j) {
        const tempReal = real[i];
        real[i] = real[j];
        real[j] = tempReal;
        const tempImag = imag[i];
        imag[i] = imag[j];
        imag[j] = tempImag;
      }
    }

    for (let len = 2; len <= n; len <<= 1) {
      const angle = (-2 * Math.PI) / len;
      const wLenCos = Math.cos(angle);
      const wLenSin = Math.sin(angle);
      for (let i = 0; i < n; i += len) {
        let wCos = 1;
        let wSin = 0;
        for (let j = 0; j < len / 2; j += 1) {
          const evenIndex = i + j;
          const oddIndex = evenIndex + len / 2;
          const evenReal = real[evenIndex];
          const evenImag = imag[evenIndex];
          const oddReal = real[oddIndex];
          const oddImag = imag[oddIndex];
          const vReal = oddReal * wCos - oddImag * wSin;
          const vImag = oddReal * wSin + oddImag * wCos;
          real[evenIndex] = evenReal + vReal;
          imag[evenIndex] = evenImag + vImag;
          real[oddIndex] = evenReal - vReal;
          imag[oddIndex] = evenImag - vImag;
          const nextCos = wCos * wLenCos - wSin * wLenSin;
          const nextSin = wCos * wLenSin + wSin * wLenCos;
          wCos = nextCos;
          wSin = nextSin;
        }
      }
    }

    const power = new Float32Array(n / 2 + 1);
    for (let i = 0; i < power.length; i += 1) {
      power[i] = real[i] * real[i] + imag[i] * imag[i];
    }
    return power;
  }

  computeMfcc(powerSpectrum) {
    const melEnergies = new Float32Array(this.melFilters.length);
    for (let i = 0; i < this.melFilters.length; i += 1) {
      let energy = 0;
      const filter = this.melFilters[i];
      for (let j = 0; j < filter.length; j += 1) {
        energy += powerSpectrum[j] * filter[j];
      }
      melEnergies[i] = Math.log(energy + 1e-8);
    }

    const coeffs = new Float32Array(6);
    for (let k = 0; k < coeffs.length; k += 1) {
      let sum = 0;
      for (let n = 0; n < melEnergies.length; n += 1) {
        sum += melEnergies[n] * Math.cos((Math.PI * k * (n + 0.5)) / melEnergies.length);
      }
      coeffs[k] = sum;
    }
    return coeffs;
  }

  bandEnergy(powerSpectrum, fromHz, toHz) {
    const nyquistBins = powerSpectrum.length - 1;
    const fromBin = Math.max(0, Math.floor((fromHz / sampleRate) * this.frameSize));
    const toBin = Math.min(nyquistBins, Math.ceil((toHz / sampleRate) * this.frameSize));
    let sum = 0;
    for (let i = fromBin; i <= toBin; i += 1) {
      sum += powerSpectrum[i] || 0;
    }
    return sum;
  }

  classifyPhonemes(rms, powerSpectrum, mfcc) {
    if (rms < 0.008) {
      return { A: 0, E: 0, I: 0, O: 0, U: 0, S: 1 };
    }

    const low = this.bandEnergy(powerSpectrum, 180, 420);
    const lowMid = this.bandEnergy(powerSpectrum, 420, 900);
    const mid = this.bandEnergy(powerSpectrum, 900, 1600);
    const upper = this.bandEnergy(powerSpectrum, 1600, 2600);
    const air = this.bandEnergy(powerSpectrum, 2600, 4200);

    const brightness = Math.max(0, mfcc[1] || 0);
    const frontness = Math.max(0, mfcc[2] || 0);

    const weights = {
      A: Math.max(0, lowMid * 1.15 + upper * 0.45 + brightness * 0.15),
      E: Math.max(0, lowMid * 0.5 + mid * 1.0 + upper * 0.8 + frontness * 0.2),
      I: Math.max(0, mid * 0.45 + upper * 0.75 + air * 1.25 + frontness * 0.35),
      O: Math.max(0, low * 1.2 + lowMid * 0.7 + upper * 0.2),
      U: Math.max(0, low * 1.05 + lowMid * 0.45 + mid * 0.18),
      S: Math.max(0, 0.02 - rms) * 10,
    };

    const total = Object.values(weights).reduce((sum, value) => sum + value, 0) || 1;
    return {
      A: weights.A / total,
      E: weights.E / total,
      I: weights.I / total,
      O: weights.O / total,
      U: weights.U / total,
      S: weights.S / total,
    };
  }

  dominantPhoneme(phonemes) {
    let bestKey = 'S';
    let bestValue = -1;
    const keys = ['A', 'E', 'I', 'O', 'U', 'S'];
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      const value = phonemes[key] || 0;
      if (value > bestValue) {
        bestValue = value;
        bestKey = key;
      }
    }
    return bestKey;
  }

  analyzeCurrentFrame() {
    const frame = new Float32Array(this.frameSize);
    for (let i = 0; i < this.frameSize; i += 1) {
      frame[i] = this.buffer[(this.bufferIndex + i) % this.frameSize];
    }

    let sumSquares = 0;
    for (let i = 0; i < frame.length; i += 1) {
      sumSquares += frame[i] * frame[i];
    }
    const rms = Math.sqrt(sumSquares / frame.length);
    const powerSpectrum = this.computeSpectrum(frame);
    const mfcc = this.computeMfcc(powerSpectrum);
    const phonemes = this.classifyPhonemes(rms, powerSpectrum, mfcc);

    this.reportCounter += 1;
    if (this.reportCounter % 2 === 0) {
      this.port.postMessage({
        rms,
        phonemes,
        dominantPhoneme: this.dominantPhoneme(phonemes),
        mfcc: Array.from(mfcc),
      });
    }
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (input && output) {
      for (let channel = 0; channel < output.length; channel += 1) {
        const source = input[Math.min(channel, input.length - 1)];
        if (source) {
          output[channel].set(source);
        }
      }
    }

    if (!input || input.length === 0 || input[0].length === 0) {
      return true;
    }

    const sampleLength = input[0].length;
    for (let i = 0; i < sampleLength; i += 1) {
      let mono = 0;
      for (let channel = 0; channel < input.length; channel += 1) {
        mono += input[channel][i] || 0;
      }
      mono /= input.length;

      this.buffer[this.bufferIndex] = mono;
      this.bufferIndex = (this.bufferIndex + 1) % this.frameSize;
      this.sampleCount = Math.min(this.sampleCount + 1, this.frameSize);
      this.hopCounter += 1;

      if (this.sampleCount >= this.frameSize && this.hopCounter >= this.hopSize) {
        this.hopCounter = 0;
        this.analyzeCurrentFrame();
      }
    }

    return true;
  }
}

registerProcessor('${WORKLET_PROCESSOR_NAME}', BuddyLipSyncProcessor);
`;
}

export function getBuddyLipSyncProcessorName(): string {
  return WORKLET_PROCESSOR_NAME;
}

export function getBuddyLipSyncWorkletUrl(): string {
  if (!workletModuleUrl) {
    workletModuleUrl = URL.createObjectURL(new Blob([createWorkletSource()], {
      type: 'application/javascript',
    }));
  }
  return workletModuleUrl;
}
