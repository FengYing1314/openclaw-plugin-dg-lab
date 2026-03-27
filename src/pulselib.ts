/**
 * 波形库管理 + .pulses / JSON5 文件解析
 *
 * 支持格式:
 * 1. Coyote-Game-Hub pulse.json5: [{ id, name, pulseData: string[] }]
 * 2. 单个波形 JSON: { id?, name, pulseData: string[] }
 * 3. 纯 pulseData 数组: ["0A0A0A0A64646464", ...]
 */
import * as fs from 'fs';
import * as path from 'path';
import { parsePlaintextWaveform } from './waveform-parser';

export interface PulsePreset {
  id: string;
  name: string;
  pulseData: string[];
}

// ─── 内存波形库 ───
const library: Map<string, PulsePreset> = new Map();

/** 获取整个波形库 */
export function getLibrary(): PulsePreset[] {
  return Array.from(library.values());
}

/** 按 id 或 name 查找波形 */
export function findPreset(idOrName: string): PulsePreset | undefined {
  const lower = idOrName.toLowerCase();
  // 先精确 id 匹配
  if (library.has(lower)) return library.get(lower);
  // 再 name 模糊匹配
  for (const p of library.values()) {
    if (p.name.toLowerCase() === lower) return p;
    if (p.name.toLowerCase().includes(lower)) return p;
  }
  return undefined;
}

/** 添加单个波形到库 */
export function addPreset(preset: PulsePreset): void {
  library.set(preset.id.toLowerCase(), preset);
}

/** 删除波形 */
export function removePreset(id: string): boolean {
  return library.delete(id.toLowerCase());
}

// ─── 验证 ───

/** 验证单条 hex 是否为合法的 8 字节 (16 hex chars) */
function isValidHex(hex: string): boolean {
  return /^[0-9A-Fa-f]{16}$/.test(hex);
}

/** 验证 pulseData 数组 */
function validatePulseData(data: unknown): data is string[] {
  if (!Array.isArray(data) || data.length === 0) return false;
  return data.every((item) => typeof item === 'string' && isValidHex(item));
}

// ─── 简易 JSON5 解析（去除注释 + 允许尾逗号 + 无引号 key）───

function stripJson5(text: string): string {
  // 去掉单行 // 注释和多行 /* */ 注释（简单处理，不处理字符串内的情况）
  let result = text.replace(/\/\/.*$/gm, '');
  result = result.replace(/\/\*[\s\S]*?\*\//g, '');
  // 尾逗号
  result = result.replace(/,\s*([\]}])/g, '$1');
  // 无引号 key → 加引号
  result = result.replace(/([{,]\s*)([a-zA-Z_$][\w$]*)\s*:/g, '$1"$2":');
  // 单引号 → 双引号（简单处理）
  result = result.replace(/'/g, '"');
  return result;
}

function parseJson5(text: string): unknown {
  return JSON.parse(stripJson5(text));
}

// ─── 解析入口 ───

function generateId(): string {
  return Math.random().toString(16).slice(2, 10);
}

/**
 * 解析 .pulses / .json5 / .json 文件内容
 * @returns 解析出的波形列表
 */
export function parsePulsesContent(content: string, fileName?: string): PulsePreset[] {

  const contentTrimmed = content.trim();
  if (contentTrimmed.startsWith('Dungeonlab+pulse:')) {
    const pulseData = parsePlaintextWaveform(contentTrimmed);
    return [{
      id: generateId(),
      name: fileName ? path.basename(fileName, path.extname(fileName)) : 'Imported Plaintext Waveform',
      pulseData: pulseData
    }];
  }

  const parsed = parseJson5(content);
  const results: PulsePreset[] = [];

  // 格式 1: 数组
  if (Array.isArray(parsed)) {
    // 可能是 [{ id, name, pulseData }] 或纯 ["hex", "hex"]
    if (parsed.length > 0 && typeof parsed[0] === 'string') {
      // 纯 pulseData 数组
      if (!validatePulseData(parsed)) {
        throw new Error('Invalid pulseData: hex strings must be exactly 16 hex characters');
      }
      results.push({
        id: generateId(),
        name: fileName ? path.basename(fileName, path.extname(fileName)) : 'Imported Waveform',
        pulseData: parsed as string[],
      });
    } else {
      // 对象数组
      for (const item of parsed) {
        if (item && typeof item === 'object' && 'pulseData' in item) {
          const obj = item as Record<string, unknown>;
          if (!validatePulseData(obj.pulseData)) {
            console.warn(`[PulseLib] Skipping invalid pulseData for "${obj.name || 'unknown'}"`);
            continue;
          }
          results.push({
            id: (typeof obj.id === 'string' ? obj.id : generateId()),
            name: (typeof obj.name === 'string' ? obj.name : `Waveform ${results.length + 1}`),
            pulseData: obj.pulseData as string[],
          });
        }
      }
    }
  } else if (parsed && typeof parsed === 'object') {
    // 格式 2: 单个 { id?, name, pulseData }
    const obj = parsed as Record<string, unknown>;
    if ('pulseData' in obj && validatePulseData(obj.pulseData)) {
      results.push({
        id: (typeof obj.id === 'string' ? obj.id : generateId()),
        name: (typeof obj.name === 'string' ? obj.name : fileName || 'Imported Waveform'),
        pulseData: obj.pulseData as string[],
      });
    } else {
      throw new Error('Invalid pulse file: missing or invalid pulseData field');
    }
  } else {
    throw new Error('Invalid pulse file format: expected array or object');
  }

  if (results.length === 0) {
    throw new Error('No valid waveforms found in file');
  }

  return results;
}

/**
 * 从文件路径加载波形并添加到库
 */
export function loadPulsesFile(filePath: string): PulsePreset[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const presets = parsePulsesContent(content, path.basename(filePath));
  for (const p of presets) {
    addPreset(p);
  }
  return presets;
}

/**
 * 将当前库导出为 JSON5 格式字符串
 */
export function exportLibrary(): string {
  const items = getLibrary();
  return JSON.stringify(items, null, 2);
}

/**
 * 从 data 目录自动加载所有 .pulses / .json5 / .json 文件
 */
export function autoLoadFromDir(dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0;
  let count = 0;
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    if (/\.(pulses|json5?|pulse)$/i.test(file)) {
      try {
        const presets = loadPulsesFile(path.join(dirPath, file));
        count += presets.length;
        console.log(`[PulseLib] Loaded ${presets.length} waveform(s) from ${file}`);
      } catch (e: any) {
        console.warn(`[PulseLib] Failed to load ${file}: ${e.message}`);
      }
    }
  }
  return count;
}
