/**
 * 波形解析器：解析 Dungeonlab+pulse 格式并转换为 HEX 波形
 * 代码基于和灵感来源于: https://github.com/admilkjs/sse-dg-lab
 */

// 频率数据集
const FREQUENCY_DATASET: number[] = [
  10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
  30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49,
  50, 52, 54, 56, 58, 60, 62, 64, 66, 68, 70, 72, 74, 76, 78, 80, 85, 90, 95, 100,
  110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 233, 266, 300, 333, 366, 400,
  450, 500, 550, 600, 700, 800, 900, 1000,
];

const DURATION_DATASET: number[] = Array.from({ length: 100 }, (_, i) => i + 1);

function getFrequencyFromIndex(index: number): number {
  const clampedIndex = Math.max(0, Math.min(83, Math.floor(index)));
  return FREQUENCY_DATASET[clampedIndex] ?? 10;
}

function getDurationFromIndex(index: number): number {
  const clampedIndex = Math.max(0, Math.min(99, Math.floor(index)));
  return DURATION_DATASET[clampedIndex] ?? 1;
}

function getOutputValue(x: number): number {
  let output: number;
  if (x >= 10 && x <= 100) {
    output = x;
  } else if (x > 100 && x <= 600) {
    output = (x - 100) / 5 + 100;
  } else if (x > 600 && x <= 1000) {
    output = (x - 600) / 10 + 200;
  } else if (x < 10) {
    output = 10;
  } else {
    output = 240;
  }
  return Math.max(10, Math.min(240, Math.round(output)));
}

interface WaveformShapePoint {
  strength: number;
  isAnchor: boolean;
}

interface WaveformSection {
  enabled: boolean;
  frequencyMode: number;
  shape: WaveformShapePoint[];
  startFrequency: number;
  endFrequency: number;
  duration: number;
}

export function parsePlaintextWaveform(data: string): string[] {
  if (!data.startsWith("Dungeonlab+pulse:")) {
    throw new Error("无效的波形格式: 必须以 'Dungeonlab+pulse:' 开头");
  }

  const cleanData = data.replace(/^Dungeonlab\+pulse:/i, "");
  const sectionParts = cleanData.split("+section+");
  
  if (sectionParts.length === 0 || !sectionParts[0]) {
    throw new Error("无效的波形数据: 未找到小节");
  }

  const firstPart = sectionParts[0];
  const equalIdx = firstPart.indexOf("=");
  if (equalIdx === -1) {
    throw new Error("无效的波形格式: 缺少全局设置的 '=' 分隔符");
  }

  const sections: WaveformSection[] = [];
  const firstSectionData = firstPart.substring(equalIdx + 1);
  const allSectionData = [firstSectionData, ...sectionParts.slice(1)];

  for (let i = 0; i < allSectionData.length && i < 10; i++) {
    const sectionData = allSectionData[i];
    if (!sectionData) continue;
    
    const slashIdx = sectionData.indexOf("/");
    if (slashIdx === -1) {
      throw new Error(`无效的小节 ${i + 1}: 缺少 '/' 分隔符`);
    }

    const headerPart = sectionData.substring(0, slashIdx);
    const shapePart = sectionData.substring(slashIdx + 1);

    const headerValues = headerPart.split(",");
    const freqRange1Index = Number(headerValues[0]) || 0;
    const freqRange2Index = Number(headerValues[1]) || 0;
    const durationIndex = Number(headerValues[2]) || 0;
    const freqMode = Number(headerValues[3]) || 1;
    const enabled = headerValues[4] !== "0";

    const shapePoints: WaveformShapePoint[] = [];
    const shapeItems = shapePart.split(",");
    
    for (const item of shapeItems) {
      if (!item) continue;
      const [strengthStr, anchorStr] = item.split("-");
      const strength = Math.round(Number(strengthStr) || 0);
      const isAnchor = anchorStr === "1";
      shapePoints.push({
        strength: Math.max(0, Math.min(100, strength)),
        isAnchor,
      });
    }

    if (shapePoints.length < 2) {
      throw new Error(`无效的小节 ${i + 1}: 必须至少有 2 个形状点`);
    }

    if (enabled) {
      sections.push({
        enabled: true,
        frequencyMode: freqMode,
        shape: shapePoints,
        startFrequency: getFrequencyFromIndex(freqRange1Index),
        endFrequency: getFrequencyFromIndex(freqRange2Index),
        duration: getDurationFromIndex(durationIndex),
      });
    }
  }

  if (sections.length === 0) {
    throw new Error("无效的波形数据: 没有启用的小节");
  }

  return convertToHexWaveforms(sections);
}

function convertToHexWaveforms(sections: WaveformSection[]): string[] {
  const hexWaveforms: string[] = [];

  for (const section of sections) {
    if (section.shape.length === 0) continue;

    const shapeCount = section.shape.length;
    const pulseElementDuration = shapeCount;
    const sectionDuration = section.duration;
    const startFreq = section.startFrequency;
    const endFreq = section.endFrequency;
    const freqMode = section.frequencyMode;

    const pulseElementCount = Math.max(1, Math.ceil(sectionDuration / pulseElementDuration));
    const actualDuration = pulseElementCount * pulseElementDuration;

    const waveformFreq: number[] = [];
    const waveformStrength: number[] = [];

    for (let elementIdx = 0; elementIdx < pulseElementCount; elementIdx++) {
      for (let shapeIdx = 0; shapeIdx < shapeCount; shapeIdx++) {
        const currentPoint = section.shape[shapeIdx];
        const strength = currentPoint?.strength ?? 0;

        const currentTime = elementIdx * pulseElementDuration + shapeIdx;
        const sectionProgress = currentTime / actualDuration;
        const elementProgress = shapeIdx / shapeCount;

        let freq: number;
        switch (freqMode) {
          case 1:
            freq = getOutputValue(startFreq);
            break;
          case 2:
            freq = getOutputValue(startFreq + (endFreq - startFreq) * sectionProgress);
            break;
          case 3:
            freq = getOutputValue(startFreq + (endFreq - startFreq) * elementProgress);
            break;
          case 4:
            const elementProgress4 = pulseElementCount > 1 ? elementIdx / (pulseElementCount - 1) : 0;
            freq = getOutputValue(startFreq + (endFreq - startFreq) * elementProgress4);
            break;
          default:
            freq = getOutputValue(startFreq);
        }

        for (let n = 0; n < 4; n++) {
          waveformStrength.push(Math.max(0, Math.min(100, Math.round(strength))));
          waveformFreq.push(Math.round(freq));
        }
      }
    }

    for (let i = 0; i < waveformFreq.length; i += 4) {
      const freqHex = [
        waveformFreq[i] ?? 10,
        waveformFreq[i + 1] ?? 10,
        waveformFreq[i + 2] ?? 10,
        waveformFreq[i + 3] ?? 10,
      ].map((v) => Math.max(10, Math.min(240, v)).toString(16).padStart(2, "0")).join("");

      const strengthHex = [
        waveformStrength[i] ?? 0,
        waveformStrength[i + 1] ?? 0,
        waveformStrength[i + 2] ?? 0,
        waveformStrength[i + 3] ?? 0,
      ].map((v) => Math.max(0, Math.min(100, v)).toString(16).padStart(2, "0")).join("");

      hexWaveforms.push(freqHex + strengthHex);
    }
  }

  return hexWaveforms;
}
