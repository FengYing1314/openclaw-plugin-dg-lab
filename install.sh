#!/bin/bash
set -e

echo "🐾 =========================================="
echo "🐾  欢迎安装 OpenClaw DG-Lab 郊狼插件喵！"
echo "🐾 =========================================="

# ─── 工具函数 ───
err() { echo -e "\n❌ $*" >&2; exit 1; }

# ─── 1. 安装插件包 ───
echo -e "\n📦 [1/4] 正在安装插件包 (openclaw-plugin-dg-lab)..."
openclaw plugins install openclaw-plugin-dg-lab || err "插件安装失败，请检查 OpenClaw 是否正确安装"

# ─── 2. 获取公网 IP ───
echo -e "\n🔍 [2/4] 正在获取当前公网 IP..."
DEFAULT_IP=$(
  curl -s --max-time 3 ifconfig.me 2>/dev/null ||
  curl -s --max-time 3 api.ipify.org 2>/dev/null ||
  curl -s --max-time 3 ipecho.net/plain 2>/dev/null ||
  echo "127.0.0.1"
)
echo "   检测到 IP: $DEFAULT_IP"

# ─── 3. 交互式配置 ───
echo -e "\n📝 [3/4] 请配置插件参数 (直接回车使用括号内的默认值)："
echo -e "   提示: serverIp 用于生成供 DG-Lab App 扫描的二维码地址\n"

read -r -p "▶️  服务器公网 IP / 域名 [$DEFAULT_IP]: " USER_IP
USER_IP=${USER_IP:-$DEFAULT_IP}

while true; do
  read -r -p "▶️  WebSocket 监听端口 [18888]: " USER_PORT
  USER_PORT=${USER_PORT:-18888}
  [[ "$USER_PORT" =~ ^[0-9]+$ ]] && (( USER_PORT >= 1 && USER_PORT <= 65535 )) && break
  echo "   ⚠️  端口必须是 1-65535 之间的整数，请重新输入"
done

while true; do
  read -r -p "▶️  强度软上限 (0-200) [40]: " USER_LIMIT
  USER_LIMIT=${USER_LIMIT:-40}
  [[ "$USER_LIMIT" =~ ^[0-9]+$ ]] && (( USER_LIMIT >= 0 && USER_LIMIT <= 200 )) && break
  echo "   ⚠️  强度必须是 0-200 之间的整数，请重新输入"
done

# ─── 4. 写入配置文件 ───
echo -e "\n⚙️  [4/4] 正在写入 ~/.openclaw/openclaw.json ..."

# 通过环境变量传参，避免 Shell 注入
SERVER_IP="$USER_IP" \
SERVER_PORT="$USER_PORT" \
LIMIT_INTENSITY="$USER_LIMIT" \
node -e "
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
const serverIp       = process.env.SERVER_IP;
const port           = parseInt(process.env.SERVER_PORT, 10);
const limitIntensity = parseInt(process.env.LIMIT_INTENSITY, 10);

try {
  // 确保目录存在
  fs.mkdirSync(path.dirname(configPath), { recursive: true });

  let config = {};
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  config.plugins                  = config.plugins || {};
  config.plugins.entries          = config.plugins.entries || {};
  config.plugins.entries['openclaw-plugin-dg-lab'] = {
    enabled: true,
    config: { serverIp, port, limitIntensity }
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  console.log('✅ 配置文件写入成功');
} catch (e) {
  console.error('❌ 写入配置失败:', e.message);
  process.exit(1);
}
" || err "配置写入失败"

# ─── 5. 重启 Gateway ───
echo -e "\n🚀 正在重启 OpenClaw Gateway..."
openclaw gateway restart || err "Gateway 重启失败，请手动执行: openclaw gateway restart"

# ─── 完成提示 ───
echo -e "\n🎉 安装完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   WebSocket 地址 : ws://${USER_IP}:${USER_PORT}"
echo "   强度软上限     : ${USER_LIMIT}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "⚠️  请确保防火墙 / 安全组已放行 TCP 端口 ${USER_PORT}"
echo ""
echo "📱 使用方式："
echo "   1. 让 AI 执行 /dg_qr  →  用 DG-Lab App「Socket控制」扫码连接"
echo "   2. /dg_emotion on    →  开启情感联动调教模式"
echo "   3. /dg_status        →  查看连接与强度状态"
echo "   4. /dg_limit <0-200> →  随时调整强度软上限"
echo "🐾 =========================================="