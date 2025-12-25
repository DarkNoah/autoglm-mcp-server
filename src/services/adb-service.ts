/**
 * ADB Service for Android Device Control
 *
 * Provides command-line based ADB functionality for controlling Android devices.
 * Based on the Open-AutoGLM Python implementation.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { APP_PACKAGES } from '../config/apps.js';
import { ACTION_TYPES, ActionType } from '../constants.js'
const execAsync = promisify(exec);

/**
 * Action execution result
 */
export interface ActionResult {
  success: boolean;
  shouldFinish?: boolean;
  message?: string;
}

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
      x: Math.round((relativeX / 1000) * screenWidth),
      y: Math.round((relativeY / 1000) * screenHeight)
    };
  }

  /**
   * Execute an AutoGLM action
   */
  async executeAction(action: any, deviceId: string | undefined, width: number, height: number): Promise<ActionResult> {
    const actionType = action["_metadata"];

    // Handle finish action
    if (actionType === "finish") {
      return { success: true, shouldFinish: true, message: action["message"] };
    }

    // Unknown action type
    if (actionType !== "do") {
      return { success: false, shouldFinish: true, message: `Unknown action type: ${actionType}` };
    }

    const actionName = action.action;

    try {
      switch (actionName) {
        case 'Launch':
          return await this.handleLaunch(action, deviceId);
        case 'Tap':
          return await this.handleTap(action, deviceId, width, height);
        case 'Type':
        case 'Type_Name':
          return await this.handleType(action, deviceId);
        case 'Swipe':
          return await this.handleSwipe(action, deviceId, width, height);
        case 'Back':
          return await this.handleBack(deviceId);
        case 'Home':
          return await this.handleHome(deviceId);
        case 'Double Tap':
          return await this.handleDoubleTap(action, deviceId, width, height);
        case 'Long Press':
          return await this.handleLongPress(action, deviceId, width, height);
        case 'Wait':
          return await this.handleWait(action);
        case 'Take_over':
          return this.handleTakeover(action);
        case 'Note':
          return this.handleNote(action);
        case 'Call_API':
          return this.handleCallApi(action);
        case 'Interact':
          return this.handleInteract();
        default:
          return { success: false, message: `Unknown action: ${actionName}` };
      }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Handle app launch action
   */
  private async handleLaunch(action: any, deviceId?: string): Promise<ActionResult> {
    const appName = action["app"];
    if (!appName) {
      return { success: false, shouldFinish: false, message: "No app name specified" };
    }

    const packageName = APP_PACKAGES[appName as keyof typeof APP_PACKAGES];
    if (!packageName) {
      return { success: false, shouldFinish: false, message: `App not found: ${appName}` };
    }

    await this.launchApp(packageName, deviceId);
    return { success: true, shouldFinish: false };
  }

  /**
   * Handle tap action
   */
  private async handleTap(action: any, deviceId: string | undefined, width: number, height: number): Promise<ActionResult> {
    const element = action["element"];
    if (!element || !Array.isArray(element) || element.length < 2) {
      return { success: false, shouldFinish: false, message: "No element coordinates" };
    }

    const { x, y } = this.relativeToAbsolute(element[0], element[1], width, height);

    if ("message" in action) {
      console.log(`Sensitive operation: ${action.message}`);
    }

    await this.tap(x, y, deviceId);
    return { success: true, shouldFinish: false };
  }

  /**
   * Handle text input action
   */
  private async handleType(action: any, deviceId?: string): Promise<ActionResult> {
    const text = action["text"] || "";

    // Get current IME
    const currentIme = await this.execCommand(['shell', 'settings', 'get', 'secure', 'default_input_method'], deviceId);

    // Switch to ADB Keyboard if needed
    if (!currentIme.includes("com.android.adbkeyboard/.AdbIME")) {
      await this.execCommand(['shell', 'ime', 'set', 'com.android.adbkeyboard/.AdbIME'], deviceId);
    }

    await this.sleep(100);
    await this.clearText(deviceId);
    await this.sleep(100);
    await this.typeText(text, deviceId);
    await this.sleep(100);

    // Restore original IME
    await this.execCommand(['shell', 'ime', 'set', currentIme.trim()], deviceId);
    await this.sleep(100);

    return { success: true, shouldFinish: false };
  }

  /**
   * Handle swipe action
   */
  private async handleSwipe(action: any, deviceId: string | undefined, width: number, height: number): Promise<ActionResult> {
    const start = action["start"];
    const end = action["end"];

    if (!start || !end || !Array.isArray(start) || !Array.isArray(end) || start.length < 2 || end.length < 2) {
      return { success: false, shouldFinish: false, message: "Missing swipe coordinates" };
    }

    const startCoords = this.relativeToAbsolute(start[0], start[1], width, height);
    const endCoords = this.relativeToAbsolute(end[0], end[1], width, height);

    await this.swipe(startCoords.x, startCoords.y, endCoords.x, endCoords.y, undefined, deviceId);
    return { success: true, shouldFinish: false };
  }

  /**
   * Handle back button action
   */
  private async handleBack(deviceId?: string): Promise<ActionResult> {
    await this.back(deviceId);
    return { success: true, shouldFinish: false };
  }

  /**
   * Handle home button action
   */
  private async handleHome(deviceId?: string): Promise<ActionResult> {
    await this.home(deviceId);
    return { success: true, shouldFinish: false };
  }

  /**
   * Handle double tap action
   */
  private async handleDoubleTap(action: any, deviceId: string | undefined, width: number, height: number): Promise<ActionResult> {
    const element = action["element"];
    if (!element || !Array.isArray(element) || element.length < 2) {
      return { success: false, shouldFinish: false, message: "No element coordinates" };
    }

    const { x, y } = this.relativeToAbsolute(element[0], element[1], width, height);
    await this.doubleTap(x, y, deviceId);
    return { success: true, shouldFinish: false };
  }

  /**
   * Handle long press action
   */
  private async handleLongPress(action: any, deviceId: string | undefined, width: number, height: number): Promise<ActionResult> {
    const element = action["element"];
    if (!element || !Array.isArray(element) || element.length < 2) {
      return { success: false, shouldFinish: false, message: "No element coordinates" };
    }

    const { x, y } = this.relativeToAbsolute(element[0], element[1], width, height);
    await this.longPress(x, y, 500, deviceId);
    return { success: true, shouldFinish: false };
  }

  /**
   * Handle wait action
   */
  private async handleWait(action: any): Promise<ActionResult> {
    const durationStr = action["duration"] || "1 seconds";
    let duration = 1.0;

    try {
      duration = parseFloat(durationStr.replace("seconds", "").replace("second", "").trim());
      if (isNaN(duration)) duration = 1.0;
    } catch {
      duration = 1.0;
    }

    await this.sleep(duration * 1000);
    return { success: true, shouldFinish: false };
  }

  /**
   * Handle takeover request
   */
  private handleTakeover(action: any): ActionResult {
    const message = action["message"] || "User intervention required";
    console.log(`Takeover: ${message}`);
    return { success: true, shouldFinish: false, message };
  }

  /**
   * Handle note action
   */
  private handleNote(action: any): ActionResult {
    return { success: true, shouldFinish: false, message: action.message };
  }

  /**
   * Handle API call action
   */
  private handleCallApi(action: any): ActionResult {
    return { success: true, shouldFinish: false, message: action.instruction };
  }

  /**
   * Handle interaction request
   */
  private handleInteract(): ActionResult {
    return { success: true, shouldFinish: false, message: "User interaction required" };
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
