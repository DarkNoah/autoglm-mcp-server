/**
 * ADB Service for Android Device Control
 *
 * Provides command-line based ADB functionality for controlling Android devices.
 * Based on the Open-AutoGLM Python implementation.
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { APP_PACKAGES } from '../config/apps.js';

const execAsync = promisify(exec);

/**
 * Device information
 */
export interface DeviceInfo {
  device_id: string;
  status: string;
  connection_type: 'usb' | 'wifi' | 'remote';
  model?: string;
  android_version?: string;
  screen_width?: number;
  screen_height?: number;
  connected: boolean;
}

/**
 * ADB Service class
 */
export class ADBService {
  private adbPath: string;

  constructor(adbPath: string = 'adb') {
    this.adbPath = adbPath;
  }

  /**
   * Execute an ADB command
   */
  private async execCommand(args: string[], deviceId?: string): Promise<string> {
    const cmd = deviceId
      ? [this.adbPath, '-s', deviceId, ...args]
      : [this.adbPath, ...args];

    try {
      const { stdout, stderr } = await execAsync(cmd.join(' '), {
        encoding: 'utf-8',
        timeout: 30000
      });
      return stdout + stderr;
    } catch (error: any) {
      throw new Error(`ADB command failed: ${error.message}`);
    }
  }

  /**
   * List all connected devices
   */
  async listDevices(): Promise<DeviceInfo[]> {
    try {
      const output = await this.execCommand(['devices', '-l']);
      const devices: DeviceInfo[] = [];

      for (const line of output.split('\n').slice(1)) {
        if (!line.trim()) continue;

        const parts = line.trim().split(/\s+/);
        if (parts.length < 2) continue;

        const deviceId = parts[0];
        const status = parts[1];

        // Determine connection type
        let connectionType: 'usb' | 'wifi' | 'remote' = 'usb';
        if (deviceId.includes(':')) {
          connectionType = 'remote';
        } else if (deviceId.includes('emulator')) {
          connectionType = 'usb';
        }

        // Parse model
        let model: string | undefined;
        for (const part of parts.slice(2)) {
          if (part.startsWith('model:')) {
            model = part.split(':', 2)[1];
            break;
          }
        }

        // Get screen dimensions
        let screenWidth: number | undefined;
        let screenHeight: number | undefined;
        try {
          const wmSize = await this.execCommand(['shell', 'wm', 'size'], deviceId);
          const match = wmSize.match(/Physical size: (\d+)x(\d+)/);
          if (match) {
            screenWidth = parseInt(match[1], 10);
            screenHeight = parseInt(match[2], 10);
          }
        } catch {
          // Ignore errors getting screen size
        }

        devices.push({
          device_id: deviceId,
          status,
          connection_type: connectionType,
          model,
          screen_width: screenWidth,
          screen_height: screenHeight,
          connected: status === 'device'
        });
      }

      return devices;
    } catch (error) {
      console.error('Error listing devices:', error);
      return [];
    }
  }

  /**
   * Get device info by ID
   */
  async getDeviceInfo(deviceId?: string): Promise<DeviceInfo | null> {
    const devices = await this.listDevices();

    if (!devices.length) return null;

    if (!deviceId) return devices[0];

    return devices.find(d => d.device_id === deviceId) || null;
  }

  /**
   * Get devices by ID (alias for getDeviceInfo for compatibility)
   */
  async getDevices(deviceId?: string): Promise<DeviceInfo[]> {
    const devices = await this.listDevices();

    if (!deviceId) return devices;

    return devices.filter(d => d.device_id === deviceId);
  }

  /**
   * Tap at coordinates
   */
  async tap(x: number, y: number, deviceId?: string): Promise<void> {
    await this.execCommand(['shell', 'input', 'tap', x.toString(), y.toString()], deviceId);
  }

  /**
   * Double tap at coordinates
   */
  async doubleTap(x: number, y: number, deviceId?: string): Promise<void> {
    await this.tap(x, y, deviceId);
    await this.sleep(100); // Small delay between taps
    await this.tap(x, y, deviceId);
  }

  /**
   * Long press at coordinates
   */
  async longPress(x: number, y: number, durationMs: number = 3000, deviceId?: string): Promise<void> {
    // Long press is implemented as a swipe with same start and end coordinates
    await this.execCommand(
      ['shell', 'input', 'swipe', x.toString(), y.toString(), x.toString(), y.toString(), durationMs.toString()],
      deviceId
    );
  }

  /**
   * Swipe from start to end coordinates
   */
  async swipe(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    durationMs?: number,
    deviceId?: string
  ): Promise<void> {
    if (durationMs === undefined) {
      // Calculate duration based on distance
      const distSq = Math.pow(startX - endX, 2) + Math.pow(startY - endY, 2);
      durationMs = Math.max(300, Math.min(2000, Math.floor(distSq / 100)));
    }

    await this.execCommand(
      ['shell', 'input', 'swipe', startX.toString(), startY.toString(), endX.toString(), endY.toString(), durationMs.toString()],
      deviceId
    );
  }

  /**
   * Press back button
   */
  async back(deviceId?: string): Promise<void> {
    await this.execCommand(['shell', 'input', 'keyevent', '4'], deviceId);
  }

  /**
   * Press home button
   */
  async home(deviceId?: string): Promise<void> {
    await this.execCommand(['shell', 'input', 'keyevent', 'KEYCODE_HOME'], deviceId);
  }

  /**
   * Type text (requires ADB Keyboard)
   */
  async typeText(text: string, deviceId?: string): Promise<void> {
    const encodedText = Buffer.from(text, 'utf-8').toString('base64');
    await this.execCommand(
      ['shell', 'am', 'broadcast', '-a', 'ADB_INPUT_B64', '--es', 'msg', encodedText],
      deviceId
    );
  }

  /**
   * Clear text in input field
   */
  async clearText(deviceId?: string): Promise<void> {
    await this.execCommand(['shell', 'am', 'broadcast', '-a', 'ADB_CLEAR_TEXT'], deviceId);
  }

  /**
   * Launch an app by package name
   */
  async launchApp(packageName: string, deviceId?: string): Promise<void> {
    await this.execCommand(
      ['shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1'],
      deviceId
    );
  }

  /**
   * Get current app name by matching package name against APP_PACKAGES
   */
  async getCurrentApp(deviceId?: string): Promise<string> {
    const output = await this.execCommand(['shell', 'dumpsys', 'window'], deviceId);

    for (const line of output.split('\n')) {
      if (line.includes('mCurrentFocus') || line.includes('mFocusedApp')) {
        for (const [appName, packageName] of Object.entries(APP_PACKAGES as Record<string, string>)) {
          if (line.includes(packageName)) {
            return appName;
          }
        }
      }
    }

    return 'unknown';
  }

  /**
   * Take a screenshot
   */
  async screenshot(deviceId?: string): Promise<Buffer> {
    const { stdout } = await execAsync(
      (deviceId ? `${this.adbPath} -s ${deviceId} shell screencap -p` : `${this.adbPath} shell screencap -p`),
      { encoding: null, maxBuffer: 10 * 1024 * 1024 }
    );
    return stdout as Buffer;
  }

  /**
   * Sleep helper
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Wait for a specified duration
   */
  async wait(durationMs: number): Promise<void> {
    await this.sleep(durationMs);
  }

  /**
   * Convert relative coordinates (0-1000) to absolute pixels
   */
  relativeToAbsolute(
    relativeX: number,
    relativeY: number,
    screenWidth: number,
    screenHeight: number
  ): { x: number; y: number } {
    return {
      x: Math.floor((relativeX / 1000) * screenWidth),
      y: Math.floor((relativeY / 1000) * screenHeight)
    };
  }
}

/**
 * Singleton instance
 */
let adbServiceInstance: ADBService | null = null;

export function getADBService(): ADBService {
  if (!adbServiceInstance) {
    adbServiceInstance = new ADBService();
  }
  return adbServiceInstance;
}
