/**
 * AutoGLM API Client
 *
 * This service handles communication with the AutoGLM online model API.
 * It uses the OpenAI-compatible API format to interact with AutoGLM-Phone.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ADBService } from './adb-service.js';
import { APP_PACKAGES } from '../config/apps.js';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface AutoGLMConfig {
  baseUrl: string;
  apiKey: string;
  modelName: string;
  maxSteps: number;
  lang: 'cn' | 'en';
}

export interface AutoGLMConfigInput extends Partial<AutoGLMConfig> {
  model?: string; // Alias for modelName
}

export interface AutoGLMResponse {
  thinking: string;
  action: string;
}

export interface AutoGLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

export interface AutoGLMTaskResult {
  success: boolean;
  finished: boolean;
  completed: boolean; // Alias for finished
  steps: number;
  totalSteps: number; // Alias for steps
  actions: Array<{
    step: number;
    thinking: string;
    action: any;
    success: boolean;
    result?: string;
    error?: string;
  }>;
  message?: string;
  finalState?: string; // Alias for message
  error?: string;
  deviceId?: string;
}

export class AutoGLMAPIClient {
  private config: AutoGLMConfig;

  constructor(config: AutoGLMConfigInput = {}) {
    this.config = {
      baseUrl: config.baseUrl || process.env.AUTOGLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
      apiKey: config.apiKey || process.env.AUTOGLM_API_KEY || '',
      modelName: config.modelName || config.model || process.env.AUTOGLM_MODEL || 'autoglm-phone-9b',
      maxSteps: config.maxSteps || parseInt(process.env.AUTOGLM_MAX_STEPS || '100'),
      lang: config.lang || (process.env.AUTOGLM_LANG as 'cn' | 'en') || 'cn',
    };
  }

  /**
   * Get the system prompt for AutoGLM
   */
  private getSystemPrompt(): string {
    if (this.config.lang === 'en') {
      return `The current date: ${new Date().toLocaleDateString()}
# Setup
You are a professional Android operation agent assistant that can fulfill the user's high-level instructions. Given a screenshot of the Android interface at each step, you first analyze the situation, then plan the best course of action using Python-style pseudo-code.

# More details about the code
Your response format must be structured as follows:

Think first: Use <think>...</think> to analyze the current screen, identify key elements, and determine the most efficient action.
Provide the action: Use <answer>...</answer> to return a single line of pseudo-code representing the operation.

Your output should STRICTLY follow the format:
<think>
[Your thought]
</think>
<answer>
[Your operation code]
</answer>

- **Tap**
  Perform a tap action on a specified screen area. The element is a list of 2 integers, representing the coordinates of the tap point.
  **Example**:
  <answer>
  do(action="Tap", element=[x,y])
  </answer>
- **Type**
  Enter text into the currently focused input field.
  **Example**:
  <answer>
  do(action="Type", text="Hello World")
  </answer>
- **Swipe**
  Perform a swipe action with start point and end point.
  **Examples**:
  <answer>
  do(action="Swipe", start=[x1,y1], end=[x2,y2])
  </answer>
- **Long Press**
  Perform a long press action on a specified screen area.
  You can add the element to the action to specify the long press area. The element is a list of 2 integers, representing the coordinates of the long press point.
  **Example**:
  <answer>
  do(action="Long Press", element=[x,y])
  </answer>
- **Launch**
  Launch an app. Try to use launch action when you need to launch an app. Check the instruction to choose the right app before you use this action.
  **Example**:
  <answer>
  do(action="Launch", app="Settings")
  </answer>
- **Back**
  Press the Back button to navigate to the previous screen.
  **Example**:
  <answer>
  do(action="Back")
  </answer>
- **Finish**
  Terminate the program and optionally print a message.
  **Example**:
  <answer>
  finish(message="Task completed.")
  </answer>


REMEMBER:
- Think before you act: Always analyze the current UI and the best course of action before executing any step, and output in <think> part.
- Only ONE LINE of action in <answer> part per response: Each step must contain exactly one line of executable code.
- Generate execution code strictly according to format requirements.`;
    } else {
      return `今天的日期是: ${new Date().toLocaleDateString()}
你是一个智能体分析专家，可以根据操作历史和当前状态图执行一系列操作来完成任务。
你必须严格按照要求输出以下格式：
<think>{think}</think>
<answer>{action}</answer>

其中：
- {think} 是对你为什么选择这个操作的简短推理说明。
- {action} 是本次执行的具体操作指令，必须严格遵循下方定义的指令格式。

操作指令及其作用如下：
- do(action="Launch", app="xxx")  
    Launch是启动目标app的操作，这比通过主屏幕导航更快。此操作完成后，您将自动收到结果状态的截图。
- do(action="Tap", element=[x,y])  
    Tap是点击操作，点击屏幕上的特定点。可用此操作点击按钮、选择项目、从主屏幕打开应用程序，或与任何可点击的用户界面元素进行交互。坐标系统从左上角 (0,0) 开始到右下角（999,999)结束。此操作完成后，您将自动收到结果状态的截图。
- do(action="Tap", element=[x,y], message="重要操作")  
    基本功能同Tap，点击涉及财产、支付、隐私等敏感按钮时触发。
- do(action="Type", text="xxx")  
    Type是输入操作，在当前聚焦的输入框中输入文本。使用此操作前，请确保输入框已被聚焦（先点击它）。输入的文本将像使用键盘输入一样输入。重要提示：手机可能正在使用 ADB 键盘，该键盘不会像普通键盘那样占用屏幕空间。要确认键盘已激活，请查看屏幕底部是否显示 'ADB Keyboard {ON}' 类似的文本，或者检查输入框是否处于激活/高亮状态。不要仅仅依赖视觉上的键盘显示。自动清除文本：当你使用输入操作时，输入框中现有的任何文本（包括占位符文本和实际输入）都会在输入新文本前自动清除。你无需在输入前手动清除文本——直接使用输入操作输入所需文本即可。操作完成后，你将自动收到结果状态的截图。
- do(action="Type_Name", text="xxx")  
    Type_Name是输入人名的操作，基本功能同Type。
- do(action="Interact")  
    Interact是当有多个满足条件的选项时而触发的交互操作，询问用户如何选择。
- do(action="Swipe", start=[x1,y1], end=[x2,y2])  
    Swipe是滑动操作，通过从起始坐标拖动到结束坐标来执行滑动手势。可用于滚动内容、在屏幕之间导航、下拉通知栏以及项目栏或进行基于手势的导航。坐标系统从左上角 (0,0) 开始到右下角（999,999)结束。滑动持续时间会自动调整以实现自然的移动。此操作完成后，您将自动收到结果状态的截图。
- do(action="Note", message="True")  
    记录当前页面内容以便后续总结。
- do(action="Call_API", instruction="xxx")  
    总结或评论当前页面或已记录的内容。
- do(action="Long Press", element=[x,y])  
    Long Pres是长按操作，在屏幕上的特定点长按指定时间。可用于触发上下文菜单、选择文本或激活长按交互。坐标系统从左上角 (0,0) 开始到右下角（999,999)结束。此操作完成后，您将自动收到结果状态的屏幕截图。
- do(action="Double Tap", element=[x,y])  
    Double Tap在屏幕上的特定点快速连续点按两次。使用此操作可以激活双击交互，如缩放、选择文本或打开项目。坐标系统从左上角 (0,0) 开始到右下角（999,999)结束。此操作完成后，您将自动收到结果状态的截图。
- do(action="Take_over", message="xxx")  
    Take_over是接管操作，表示在登录和验证阶段需要用户协助。
- do(action="Back")  
    导航返回到上一个屏幕或关闭当前对话框。相当于按下 Android 的返回按钮。使用此操作可以从更深的屏幕返回、关闭弹出窗口或退出当前上下文。此操作完成后，您将自动收到结果状态的截图。
- do(action="Home") 
    Home是回到系统桌面的操作，相当于按下 Android 主屏幕按钮。使用此操作可退出当前应用并返回启动器，或从已知状态启动新任务。此操作完成后，您将自动收到结果状态的截图。
- do(action="Wait", duration="x seconds")  
    等待页面加载，x为需要等待多少秒。
- finish(message="xxx")  
    finish是结束任务的操作，表示准确完整完成任务，message是终止信息。 

必须遵循的规则：
1. 在执行任何操作前，先检查当前app是否是目标app，如果不是，先执行 Launch。
2. 如果进入到了无关页面，先执行 Back。如果执行Back后页面没有变化，请点击页面左上角的返回键进行返回，或者右上角的X号关闭。
3. 如果页面未加载出内容，最多连续 Wait 三次，否则执行 Back重新进入。
4. 如果页面显示网络问题，需要重新加载，请点击重新加载。
5. 如果当前页面找不到目标联系人、商品、店铺等信息，可以尝试 Swipe 滑动查找。
6. 遇到价格区间、时间区间等筛选条件，如果没有完全符合的，可以放宽要求。
7. 在做小红书总结类任务时一定要筛选图文笔记。
8. 购物车全选后再点击全选可以把状态设为全不选，在做购物车任务时，如果购物车里已经有商品被选中时，你需要点击全选后再点击取消全选，再去找需要购买或者删除的商品。
9. 在做外卖任务时，如果相应店铺购物车里已经有其他商品你需要先把购物车清空再去购买用户指定的外卖。
10. 在做点外卖任务时，如果用户需要点多个外卖，请尽量在同一店铺进行购买，如果无法找到可以下单，并说明某个商品未找到。
11. 请严格遵循用户意图执行任务，用户的特殊要求可以执行多次搜索，滑动查找。比如（i）用户要求点一杯咖啡，要咸的，你可以直接搜索咸咖啡，或者搜索咖啡后滑动查找咸的咖啡，比如海盐咖啡。（ii）用户要找到XX群，发一条消息，你可以先搜索XX群，找不到结果后，将"群"字去掉，搜索XX重试。（iii）用户要找到宠物友好的餐厅，你可以搜索餐厅，找到筛选，找到设施，选择可带宠物，或者直接搜索可带宠物，必要时可以使用AI搜索。
12. 在选择日期时，如果原滑动方向与预期日期越来越远，请向反方向滑动查找。
13. 执行任务过程中如果有多个可选择的项目栏，请逐个查找每个项目栏，直到完成任务，一定不要在同一项目栏多次查找，从而陷入死循环。
14. 在执行下一步操作前请一定要检查上一步的操作是否生效，如果点击没生效，可能因为app反应较慢，请先稍微等待一下，如果还是不生效请调整一下点击位置重试，如果仍然不生效请跳过这一步继续任务，并在finish message说明点击不生效。
15. 在执行任务中如果遇到滑动不生效的情况，请调整一下起始点位置，增大滑动距离重试，如果还是不生效，有可能是已经滑到底了，请继续向反方向滑动，直到顶部或底部，如果仍然没有符合要求的结果，请跳过这一步继续任务，并在finish message说明但没找到要求的项目。
16. 在做游戏任务时如果在战斗页面如果有自动战斗一定要开启自动战斗，如果多轮历史状态相似要检查自动战斗是否开启。
17. 如果没有合适的搜索结果，可能是因为搜索页面不对，请返回到搜索页面的上一级尝试重新搜索，如果尝试三次返回上一级搜索后仍然没有符合要求的结果，执行 finish(message="原因")。
18. 在结束任务前请一定要仔细检查任务是否完整准确的完成，如果出现错选、漏选、多选的情况，请返回之前的步骤进行纠正。`;
    }
  }

  /**
   * Parse AutoGLM response
   */
  private parseResponse(content: string): AutoGLMResponse {
    let thinking = '';
    let action = '';

    // Rule 1: Check for finish(message=
    if (content.includes('finish(message=')) {
      const parts = content.split('finish(message=');
      thinking = parts[0].trim();
      action = 'finish(message=' + parts[1];
      return { thinking, action };
    }

    // Rule 2: Check for do(action=
    if (content.includes('do(action=')) {
      const parts = content.split('do(action=');
      thinking = parts[0].trim();
      action = 'do(action=' + parts[1];
      return { thinking, action };
    }

    // Rule 3: Fallback to legacy XML tag parsing
    if (content.includes('<answer>')) {
      const parts = content.split('<answer>');
      thinking = parts[0].replace('<think>', '').replace('</think>', '').trim();
      action = parts[1].replace('</answer>', '').trim();
      return { thinking, action };
    }

    // Default fallback: treat entire content as action
    return { thinking: '', action: content.trim() };
  }

  /**
   * Call AutoGLM API
   */
  private async callAPI(messages: AutoGLMMessage[]): Promise<string> {
    const url = `${this.config.baseUrl}/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.modelName,
        messages: messages.map(msg => ({
          role: msg.role,
          content: typeof msg.content === 'string' ? msg.content : msg.content,
        })),
        max_tokens: 3000,
        temperature: 0.0,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AutoGLM API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as any;
    return data.choices[0]?.message?.content || '';
  }

  /**
   * Execute a task using AutoGLM
   */
  async executeTask(
    task: string,
    deviceId?: string,
    onStep?: (step: number, thinking: string, action: any) => void
  ): Promise<AutoGLMTaskResult> {
    const result: AutoGLMTaskResult = {
      success: false,
      finished: false,
      completed: false,
      steps: 0,
      totalSteps: 0,
      actions: [],
      deviceId: deviceId,
    };

    const context: AutoGLMMessage[] = [
      {
        role: 'system',
        content: this.getSystemPrompt(),
      },
    ];

    let stepCount = 0;
    let finished = false;

    const adbService = new ADBService()

    while (stepCount < this.config.maxSteps && !finished) {
      stepCount++;
      result.steps = stepCount;
      result.totalSteps = stepCount;

      try {
        // Capture screenshot
        const screenshot = await this.captureScreenshot(deviceId);
        const { width, height, base64_data } = screenshot

        // Save screenshot to tmp directory
        // await this.saveScreenshot(base64_data, stepCount);

        const currentApp = await adbService.getCurrentApp(deviceId);

        // Build user message
        let userContent: string;

        if (stepCount === 1) {
          // First step: include task
          const screenInfo = this.buildScreenInfo(currentApp);
          userContent = `${task}\n\n${screenInfo}`;
        } else {
          // Subsequent steps: just screen info
          const screenInfo = this.buildScreenInfo(currentApp);
          userContent = `** Screen Info **\n\n${screenInfo}`;
        }

        // Add image to content
        const userMessage: AutoGLMMessage = {
          role: 'user',
          content: [
            { type: 'text', text: userContent },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${base64_data}` } },
          ],
        };

        context.push(userMessage);

        // Call AutoGLM API
        const responseText = await this.callAPI(context);
        const parsed = this.parseResponse(responseText);

        // Parse action
        const action = this.parseAction(parsed.action);


        const lastMessage = context[context.length - 1];
        lastMessage.content = (lastMessage.content as {
          type: string;
          text?: string | undefined;
          image_url?: {
            url: string;
          } | undefined;
        }[]).find(x => x.type == 'text')?.text as string;
        context[context.length - 1] = lastMessage


        // Execute action
        const actionResult = await this.executeAction(action, deviceId, width, height);
        await new Promise((resolve, reject) => { setTimeout(resolve, 2000) });
        // Record step
        const stepRecord = {
          step: stepCount,
          thinking: parsed.thinking,
          action: action,
          success: actionResult.success,
          result: actionResult.message,
          error: actionResult.success ? undefined : actionResult.message,
        };
        result.actions.push(stepRecord);

        // Call step callback
        if (onStep) {
          onStep(stepCount, parsed.thinking, action);
        }

        // Add assistant response to context (without image)
        context.push({
          role: 'assistant',
          content: `<answer>${parsed.thinking}\n\n${parsed.action}</answer>`,
        });
        console.log('thinking:' + parsed.thinking)
        console.log('action:' + parsed.action)
        // Check if finished
        if (action._metadata === 'finish' || actionResult.shouldFinish) {
          finished = true;
          result.finished = true;
          result.completed = true;
          result.success = actionResult.success;
          result.message = actionResult.message || action.message;
          result.finalState = actionResult.message || action.message;
        }

      } catch (error) {
        result.error = error instanceof Error ? error.message : String(error);
        result.success = false;
        finished = true;
      }
    }

    return result;
  }

  /**
   * Save screenshot to tmp directory
   */
  private async saveScreenshot(base64Data: string, stepCount: number): Promise<string> {
    const projectRoot = join(__dirname, '..', '..');
    const tmpDir = join(projectRoot, 'tmp');

    // Ensure tmp directory exists
    await mkdir(tmpDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `screenshot_step${stepCount}_${timestamp}.png`;
    const filepath = join(tmpDir, filename);

    // Decode base64 and save as PNG
    const buffer = Buffer.from(base64Data, 'base64');
    await writeFile(filepath, buffer);

    console.log(`Screenshot saved: ${filepath}`);
    return filepath;
  }

  /**
   * Capture screenshot using ADB
   * Based on Python screenshot.py: get_screenshot
   */
  private async captureScreenshot(deviceId?: string): Promise<{ base64_data: string; width: number; height: number }> {
    const adbPrefix = deviceId ? ['-s', deviceId] : [];
    const tempPath = `/tmp/screenshot_${Date.now()}_${Math.random().toString(36).substring(7)}.png`;

    try {
      // Execute screenshot command to save to device
      await execAsync(`adb ${adbPrefix.join(' ')} shell screencap -p /sdcard/tmp.png`);

      // Pull screenshot to local temp path
      await execAsync(`adb ${adbPrefix.join(' ')} pull /sdcard/tmp.png ${tempPath}`);

      // Read the file and convert to base64
      const fs = await import('fs/promises');
      const imageBuffer = await fs.readFile(tempPath);

      // Get image dimensions by parsing PNG header
      // PNG dimensions are stored at bytes 16-24 (big-endian)
      let width = 1080;
      let height = 2400;

      if (imageBuffer.length >= 24) {
        // PNG signature: 89 50 4E 47 0D 0A 1A 0A
        // IHDR chunk starts at byte 8
        // Width at bytes 16-19, Height at bytes 20-23
        width = imageBuffer.readUInt32BE(16);
        height = imageBuffer.readUInt32BE(20);
      }

      // Convert to base64
      const base64_data = imageBuffer.toString('base64');

      // Cleanup temp file
      await fs.unlink(tempPath).catch(() => { });

      return {
        base64_data,
        width,
        height,
      };
    } catch (error) {
      console.error(`Screenshot error: ${error instanceof Error ? error.message : String(error)}`);

      // Create fallback black screenshot
      const defaultWidth = 1080;
      const defaultHeight = 2400;
      const blackBuffer = Buffer.alloc(defaultWidth * defaultHeight * 3); // RGB
      blackBuffer.fill(0);

      return {
        base64_data: blackBuffer.toString('base64'),
        width: defaultWidth,
        height: defaultHeight,
      };
    }
  }

  /**
   * Get current app using ADB
   */
  // private async getCurrentApp(deviceId?: string): Promise<string> {
  //   const adbPrefix = deviceId ? ['-s', deviceId] : [];
  //   try {
  //     const { stdout } = await execAsync(`adb ${adbPrefix.join(' ')} shell dumpsys window | grep mCurrentFocus`);
  //     const match = stdout.match(/mCurrentFocus=Window\\{[^}]* ([^\\s]+)/);
  //     return match ? match[1] : 'Unknown';
  //   } catch {
  //     return 'Unknown';
  //   }
  // }

  /**
   * Build screen info string
   */
  private buildScreenInfo(currentApp: string): string {
    if (this.config.lang === 'en') {
      return `Current App: ${currentApp}`;
    } else {
      return `当前应用: ${currentApp}`;
    }
  }

  /**
   * Parse action string to object
   * Based on Python implementation with safe parsing
   */
  private parseAction(actionStr: string): any {
    try {
      let response = actionStr.trim();

      // Handle Type and Type_Name actions specially (extract text directly)
      if (response.startsWith('do(action="Type"') || response.startsWith('do(action="Type_Name"')) {
        const textMatch = response.match(/text=["'](.*)["']\)$/);
        if (textMatch) {
          const text = textMatch[1];
          const actionType = response.includes('Type_Name') ? 'Type_Name' : 'Type';
          return { _metadata: 'do', action: actionType, text };
        }
      }

      // Handle do() actions
      if (response.startsWith('do(')) {
        // Escape special characters for parsing
        response = response.replace(/\n/g, '\\n');
        response = response.replace(/\r/g, '\\r');
        response = response.replace(/\t/g, '\\t');

        // Extract content inside do(...)
        const doContentMatch = response.match(/^do\((.*)\)$/s);
        if (!doContentMatch) {
          throw new Error('Invalid do() format');
        }

        const content = doContentMatch[1];
        const action: any = { _metadata: 'do' };

        // Parse keyword arguments using regex
        // Match patterns like: key="value", key='value', key=[1,2], key=123
        const keyValuePattern = /(\w+)\s*=\s*(?:"([^"]*?)"|'([^']*?)'|\[([^\]]*)\]|(\d+(?:\.\d+)?))/g;
        let match;

        while ((match = keyValuePattern.exec(content)) !== null) {
          const key = match[1];
          let value: any;

          if (match[2] !== undefined) {
            // Double-quoted string
            value = match[2];
          } else if (match[3] !== undefined) {
            // Single-quoted string
            value = match[3];
          } else if (match[4] !== undefined) {
            // Array like [x, y]
            try {
              value = JSON.parse(`[${match[4]}]`);
            } catch {
              value = match[4].split(',').map(s => {
                const trimmed = s.trim();
                const num = parseFloat(trimmed);
                return isNaN(num) ? trimmed : num;
              });
            }
          } else if (match[5] !== undefined) {
            // Number
            value = parseFloat(match[5]);
          }

          action[key] = value;
        }

        return action;
      }

      // Handle finish() action
      if (response.startsWith('finish(') || response.startsWith('Finish(')) {
        // Extract message from finish(message="...")
        const messageMatch = response.match(/finish\(message\s*=\s*["'](.*)["']\)/i);
        if (messageMatch) {
          return {
            _metadata: 'finish',
            message: messageMatch[1],
          };
        }
        // Fallback: extract everything after "message="
        const fallbackMatch = response.match(/message\s*=\s*["']?([^"')]+)/i);
        return {
          _metadata: 'finish',
          message: fallbackMatch ? fallbackMatch[1] : response,
        };
      }

      // Unknown format
      throw new Error(`Failed to parse action: ${response}`);
    } catch (error) {
      throw new Error(`Failed to parse action: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Convert relative coordinates (0-1000) to absolute pixels.
   * Based on Python handler.py: _convert_relative_to_absolute
   */
  private convertRelativeToAbsolute(element: number[], screen_width: number, screen_height: number): [number, number] {
    const x = Math.round(element[0] / 1000 * screen_width);
    const y = Math.round(element[1] / 1000 * screen_height);
    return [x, y];
  }

  /**
   * Execute action using ADB
   * Based on Python handler.py: ActionHandler.execute
   */
  private async executeAction(action: any, deviceId: string | undefined, width: number, height: number): Promise<{ success: boolean; shouldFinish?: boolean; message?: string }> {
    const adbPrefix = deviceId ? ['-s', deviceId] : [];
    const action_type = action["_metadata"];

    // Handle finish action
    if (action_type === "finish") {
      return { success: true, shouldFinish: true, message: action["message"] };
    }

    // Unknown action type
    if (action_type !== "do") {
      return { success: false, shouldFinish: true, message: `Unknown action type: ${action_type}` };
    }

    const action_name = action.action;

    try {
      switch (action_name) {
        case 'Launch':
          return await this._handleLaunch(action, adbPrefix);

        case 'Tap':
          return await this._handleTap(action, adbPrefix, width, height);

        case 'Type':
        case 'Type_Name':
          return await this._handleType(action, adbPrefix);

        case 'Swipe':
          return await this._handleSwipe(action, adbPrefix, width, height);

        case 'Back':
          return await this._handleBack(adbPrefix);

        case 'Home':
          return await this._handleHome(adbPrefix);

        case 'Double Tap':
          return await this._handleDoubleTap(action, adbPrefix, width, height);

        case 'Long Press':
          return await this._handleLongPress(action, adbPrefix, width, height);

        case 'Wait':
          return await this._handleWait(action);

        case 'Take_over':
          return await this._handleTakeover(action);

        case 'Note':
          return await this._handleNote(action);

        case 'Call_API':
          return await this._handleCallApi(action);

        case 'Interact':
          return await this._handleInteract(action);

        default:
          return { success: false, message: `Unknown action: ${action_name}` };
      }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Handle app launch action
   * Based on Python handler.py: _handle_launch
   */
  private async _handleLaunch(action: any, adbPrefix: string[]): Promise<{ success: boolean; shouldFinish?: boolean; message?: string }> {
    const app_name = action["app"];
    if (!app_name) {
      return { success: false, shouldFinish: false, message: "No app name specified" };
    }

    const _package = APP_PACKAGES[app_name as keyof typeof APP_PACKAGES];
    if (!_package) {
      return { success: false, shouldFinish: false, message: `App not found: ${app_name}` };
    }

    await execAsync(`adb ${adbPrefix.join(' ')} shell monkey -p ${_package} -c android.intent.category.LAUNCHER 1`);
    return { success: true, shouldFinish: false };
  }

  /**
   * Handle tap action
   * Based on Python handler.py: _handle_tap
   */
  private async _handleTap(action: any, adbPrefix: string[], width: number, height: number): Promise<{ success: boolean; shouldFinish?: boolean; message?: string }> {
    const element = action["element"];
    if (!element || !Array.isArray(element) || element.length < 2) {
      return { success: false, shouldFinish: false, message: "No element coordinates" };
    }

    // Convert relative coordinates (0-1000) to absolute pixels
    const [x, y] = this.convertRelativeToAbsolute(element, width, height);

    // Check for sensitive operation (message parameter)
    if ("message" in action) {
      // In a real implementation, you would call a confirmation callback here
      // For now, we'll proceed with the action
      console.log(`Sensitive operation: ${action.message}`);
    }

    await execAsync(`adb ${adbPrefix.join(' ')} shell input tap ${x} ${y}`);
    return { success: true, shouldFinish: false };
  }

  /**
   * Handle text input action
   * Based on Python handler.py: _handle_type
   */
  private async _handleType(action: any, adbPrefix: string[]): Promise<{ success: boolean; shouldFinish?: boolean; message?: string }> {
    const text = action["text"] || "";

    const { stdout, stderr } = await execAsync(`adb ${adbPrefix.join(' ')} shell settings get secure default_input_method`);
    const current_ime = (stdout + stderr).trim();

    if (!current_ime.includes("com.android.adbkeyboard/.AdbIME")) {
      await execAsync(`adb ${adbPrefix.join(' ')} shell ime set com.android.adbkeyboard/.AdbIME`);
    }




    // const encoded_text = Buffer.from("", 'utf-8').toString('base64')

    // await execAsync(`adb ${adbPrefix.join(' ')} shell am broadcast -a ADB_INPUT_B64 --es msg ${encoded_text}`);
    await execAsync('sleep 0.1');


    await execAsync(`adb ${adbPrefix.join(' ')} shell am broadcast -a ADB_CLEAR_TEXT`);
    await execAsync('sleep 0.1');


    const type_encoded_text = Buffer.from(text, 'utf-8').toString('base64')

    await execAsync(`adb ${adbPrefix.join(' ')} shell am broadcast -a ADB_INPUT_B64 --es msg ${type_encoded_text}`);
    await execAsync('sleep 0.1');

    await execAsync(`adb ${adbPrefix.join(' ')} shell ime set ${current_ime}`);
    await execAsync('sleep 0.1');

    return { success: true, shouldFinish: false };
  }

  /**
   * Handle swipe action
   * Based on Python handler.py: _handle_swipe
   */
  private async _handleSwipe(action: any, adbPrefix: string[], width: number, height: number): Promise<{ success: boolean; shouldFinish?: boolean; message?: string }> {
    const start = action["start"];
    const end = action["end"];

    if (!start || !end || !Array.isArray(start) || !Array.isArray(end) || start.length < 2 || end.length < 2) {
      return { success: false, shouldFinish: false, message: "Missing swipe coordinates" };
    }

    // Convert relative coordinates (0-1000) to absolute pixels
    const [start_x, start_y] = this.convertRelativeToAbsolute(start, width, height);
    const [end_x, end_y] = this.convertRelativeToAbsolute(end, width, height);

    await execAsync(`adb ${adbPrefix.join(' ')} shell input swipe ${start_x} ${start_y} ${end_x} ${end_y}`);
    return { success: true, shouldFinish: false };
  }

  /**
   * Handle back button action
   * Based on Python handler.py: _handle_back
   */
  private async _handleBack(adbPrefix: string[]): Promise<{ success: boolean; shouldFinish?: boolean; message?: string }> {
    await execAsync(`adb ${adbPrefix.join(' ')} shell input keyevent KEYCODE_BACK`);
    return { success: true, shouldFinish: false };
  }

  /**
   * Handle home button action
   * Based on Python handler.py: _handle_home
   */
  private async _handleHome(adbPrefix: string[]): Promise<{ success: boolean; shouldFinish?: boolean; message?: string }> {
    await execAsync(`adb ${adbPrefix.join(' ')} shell input keyevent KEYCODE_HOME`);
    return { success: true, shouldFinish: false };
  }

  /**
   * Handle double tap action
   * Based on Python handler.py: _handle_double_tap
   */
  private async _handleDoubleTap(action: any, adbPrefix: string[], width: number, height: number): Promise<{ success: boolean; shouldFinish?: boolean; message?: string }> {
    const element = action["element"];
    if (!element || !Array.isArray(element) || element.length < 2) {
      return { success: false, shouldFinish: false, message: "No element coordinates" };
    }

    // Convert relative coordinates (0-1000) to absolute pixels
    const [x, y] = this.convertRelativeToAbsolute(element, width, height);

    await execAsync(`adb ${adbPrefix.join(' ')} shell input tap ${x} ${y}`);
    await execAsync('sleep 0.1');
    await execAsync(`adb ${adbPrefix.join(' ')} shell input tap ${x} ${y}`);
    return { success: true, shouldFinish: false };
  }

  /**
   * Handle long press action
   * Based on Python handler.py: _handle_long_press
   */
  private async _handleLongPress(action: any, adbPrefix: string[], width: number, height: number): Promise<{ success: boolean; shouldFinish?: boolean; message?: string }> {
    const element = action["element"];
    if (!element || !Array.isArray(element) || element.length < 2) {
      return { success: false, shouldFinish: false, message: "No element coordinates" };
    }

    // Convert relative coordinates (0-1000) to absolute pixels
    const [x, y] = this.convertRelativeToAbsolute(element, width, height);

    // Long press is implemented as a swipe with same start and end coordinates
    await execAsync(`adb ${adbPrefix.join(' ')} shell input swipe ${x} ${y} ${x} ${y} 500`);
    return { success: true, shouldFinish: false };
  }

  /**
   * Handle wait action
   * Based on Python handler.py: _handle_wait
   */
  private async _handleWait(action: any): Promise<{ success: boolean; shouldFinish?: boolean; message?: string }> {
    const duration_str = action["duration"] || "1 seconds";
    let duration = 1.0;

    try {
      duration = parseFloat(duration_str.replace("seconds", "").replace("second", "").trim());
      if (isNaN(duration)) {
        duration = 1.0;
      }
    } catch {
      duration = 1.0;
    }

    await execAsync(`sleep ${duration}`);
    return { success: true, shouldFinish: false };
  }

  /**
   * Handle takeover request (login, captcha, etc.)
   * Based on Python handler.py: _handle_takeover
   */
  private async _handleTakeover(action: any): Promise<{ success: boolean; shouldFinish?: boolean; message?: string }> {
    const message = action["message"] || "User intervention required";
    // In a real implementation, you would call a takeover callback here
    console.log(`Takeover: ${message}`);
    return { success: true, shouldFinish: false, message };
  }

  /**
   * Handle note action (placeholder for content recording)
   * Based on Python handler.py: _handle_note
   */
  private async _handleNote(action: any): Promise<{ success: boolean; shouldFinish?: boolean; message?: string }> {
    // This action is typically used for recording page content
    // Implementation depends on specific requirements
    return { success: true, shouldFinish: false, message: action.message };
  }

  /**
   * Handle API call action (placeholder for summarization)
   * Based on Python handler.py: _handle_call_api
   */
  private async _handleCallApi(action: any): Promise<{ success: boolean; shouldFinish?: boolean; message?: string }> {
    // This action is typically used for content summarization
    // Implementation depends on specific requirements
    return { success: true, shouldFinish: false, message: action.instruction };
  }

  /**
   * Handle interaction request (user choice needed)
   * Based on Python handler.py: _handle_interact
   */
  private async _handleInteract(action: any): Promise<{ success: boolean; shouldFinish?: boolean; message?: string }> {
    // This action signals that user input is needed
    return { success: true, shouldFinish: false, message: "User interaction required" };
  }
}


