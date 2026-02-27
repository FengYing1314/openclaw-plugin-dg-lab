import * as QRCode from 'qrcode';
import * as path from 'path';

const DG_LAB_URL_BASE = 'https://www.dungeon-lab.com/app-download.php';
const DG_LAB_TAG = 'DGLAB-SOCKET';

/**
 * 构造 DG-Lab 协议要求的 URL 字符串
 */
export function buildQrCodeString(wsUrl: string, clientId: string): string {
  const serverWithClient = `${wsUrl.replace(/\/$/, '')}/${clientId}`;
  return [DG_LAB_URL_BASE, DG_LAB_TAG, serverWithClient].join('#');
}

/**
 * 生成二维码 PNG 文件并保存到本地
 * @param wsUrl WebSocket 服务器公网地址
 * @param clientId 动态生成的控制端 ID
 * @param outputDir 图片保存的目录
 * @returns 完整的图片绝对路径
 */
export async function generateQrCodeImage(wsUrl: string, clientId: string, outputDir: string): Promise<string> {
  const content = buildQrCodeString(wsUrl, clientId);
  // 使用时间戳和 ID 确保文件名唯一，避免并发覆盖
  const fileName = `dg_qr_${clientId.substring(0, 6)}_${Date.now()}.png`;
  const filePath = path.join(outputDir, fileName);

  try {
    await QRCode.toFile(filePath, content, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 400
    });
    return filePath;
  } catch (err) {
    console.error('[DG-Lab] Failed to generate QR Code image:', err);
    throw err;
  }
}
