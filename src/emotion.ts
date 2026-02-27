/**
 * M向动态情感分析引擎：输出相对增量 (Delta)
 * 支持中英文关键词，分层匹配，优先取最高强度命中
 */
import { punishWave, teaseWave } from './waveforms';

export interface EmotionDelta {
  type: 'neutral' | 'angry' | 'teasing' | 'punishing';
  deltaValue: number;
}

interface PatternRule {
  type: EmotionDelta['type'];
  delta: number;
  patterns: RegExp[];
}

// 从强到弱排列，优先匹配最强的
const RULES: PatternRule[] = [
  {
    type: 'punishing',
    delta: +15,
    patterns: [
      /罚你/, /教训/, /电击/, /最大/, /满功率/, /跪.*下/,
      /punish/i, /maximum/i, /full.?power/i,
    ],
  },
  {
    type: 'angry',
    delta: +8,
    patterns: [
      /生气/, /哼+/, /不听话/, /不乖/, /找打/, /再犯/, /警告/, /不许/,
      /angry/i, /warning/i, /disobey/i,
    ],
  },
  {
    type: 'teasing',
    delta: -3,
    patterns: [
      /乖/, /奖励/, /轻一点/, /舒服/, /安慰/, /摸摸/, /抱抱/, /亲亲/,
      /喜欢你/, /做得好/, /真棒/, /放松/,
      /good\s*(girl|boy)/i, /reward/i, /relax/i, /gentle/i, /well\s*done/i,
    ],
  },
];

export class EmotionEngine {
  static analyze(assistantReplyText: string): EmotionDelta {
    for (const rule of RULES) {
      if (rule.patterns.some(r => r.test(assistantReplyText))) {
        return { type: rule.type, deltaValue: rule.delta };
      }
    }
    return { type: 'neutral', deltaValue: 0 };
  }

  static generateWaveformForEmotion(score: EmotionDelta): string[] | null {
    switch (score.type) {
      case 'punishing': return punishWave(3000);
      case 'angry':     return punishWave(2000);
      case 'teasing':   return teaseWave(5000);
      default:          return null;
    }
  }
}
