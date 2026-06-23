import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { platform } from './utils/platform.js';

/**
 * Service Installer - Install/uninstall launchd (macOS), systemd (Linux), or Task Scheduler (Windows)
 */
export class ServiceInstaller {
  private serviceName = 'com.aitimemachine.daemon';

  private get launchdPath(): string {
    return path.join(os.homedir(), 'Library', 'LaunchAgents', `${this.serviceName}.plist`);
  }

  private get systemdPath(): string {
    return path.join(os.homedir(), '.config', 'systemd', 'user', 'aitimemachine.service');
  }

  private findNodePath(): string {
    try {
      return execSync('which node', { encoding: 'utf-8' }).trim();
    } catch {
      return platform.isWindows ? 'node.exe' : '/usr/local/bin/node';
    }
  }

  private findCliPath(): string {
    try {
      const aitmPath = execSync(platform.isWindows ? 'where aitm' : 'which aitm', { encoding: 'utf-8' }).trim().split('\n')[0];
      // Get the actual JS file
      if (platform.isWindows) {
        return path.join(path.dirname(aitmPath), 'node_modules', 'aitimemachine', 'lib', 'cli-v2.js');
      }
      return aitmPath.replace(/\/aitm$/, '/..') + '/lib/node_modules/aitimemachine/lib/cli-v2.js';
    } catch {
      return path.join(__dirname, 'cli-v2.js');
    }
  }

  install(): { success: boolean; message: string } {
    if (platform.isWindows) {
      return this.installWindows();
    } else if (platform.isMac) {
      return this.installLaunchd();
    } else {
      return this.installSystemd();
    }
  }

  private installLaunchd(): { success: boolean; message: string } {
    const nodePath = this.findNodePath();
    const jsPath = this.findCliPath();

    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${this.serviceName}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${nodePath}</string>
        <string>${jsPath}</string>
        <string>daemon</string>
        <string>--foreground</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${platform.dataDir()}/daemon.stdout.log</string>
    <key>StandardErrorPath</key>
    <string>${platform.dataDir()}/daemon.stderr.log</string>
</dict>
</plist>`;

    try {
      const dir = path.dirname(this.launchdPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      platform.ensureDir(platform.dataDir());
      
      fs.writeFileSync(this.launchdPath, plist);
      execSync(`launchctl load ${this.launchdPath}`);
      return { success: true, message: 'Service installed and started' };
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }
  }

  private installSystemd(): { success: boolean; message: string } {
    const nodePath = this.findNodePath();
    const jsPath = this.findCliPath();

    const service = `[Unit]
Description=AITimeMachine Daemon
After=network.target

[Service]
Type=simple
ExecStart=${nodePath} ${jsPath} daemon --foreground
Restart=always
RestartSec=10

[Install]
WantedBy=default.target`;

    try {
      const dir = path.dirname(this.systemdPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      
      fs.writeFileSync(this.systemdPath, service);
      execSync('systemctl --user daemon-reload');
      execSync('systemctl --user enable aitimemachine');
      execSync('systemctl --user start aitimemachine');
      return { success: true, message: 'Service installed and started' };
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }
  }

  private installWindows(): { success: boolean; message: string } {
    const nodePath = this.findNodePath();
    const jsPath = this.findCliPath();
    const taskName = 'AITimeMachine';

    try {
      // Create a VBS script to run hidden
      const vbsPath = path.join(platform.dataDir(), 'daemon.vbs');
      const vbs = `Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """${nodePath}"" ""${jsPath}"" daemon --foreground", 0, False`;
      
      platform.ensureDir(platform.dataDir());
      fs.writeFileSync(vbsPath, vbs);

      // Create scheduled task
      execSync(`schtasks /create /tn "${taskName}" /tr "wscript.exe ""${vbsPath}""" /sc onlogon /rl highest /f`, { stdio: 'pipe' });
      
      // Start it now
      execSync(`schtasks /run /tn "${taskName}"`, { stdio: 'pipe' });
      
      return { success: true, message: 'Service installed and started' };
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }
  }

  uninstall(): { success: boolean; message: string } {
    if (platform.isWindows) {
      return this.uninstallWindows();
    } else if (platform.isMac) {
      return this.uninstallLaunchd();
    } else {
      return this.uninstallSystemd();
    }
  }

  private uninstallLaunchd(): { success: boolean; message: string } {
    try {
      if (fs.existsSync(this.launchdPath)) {
        execSync(`launchctl unload ${this.launchdPath}`, { stdio: 'pipe' });
        fs.unlinkSync(this.launchdPath);
      }
      return { success: true, message: 'Service uninstalled' };
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }
  }

  private uninstallSystemd(): { success: boolean; message: string } {
    try {
      execSync('systemctl --user stop aitimemachine', { stdio: 'pipe' });
      execSync('systemctl --user disable aitimemachine', { stdio: 'pipe' });
      if (fs.existsSync(this.systemdPath)) fs.unlinkSync(this.systemdPath);
      execSync('systemctl --user daemon-reload');
      return { success: true, message: 'Service uninstalled' };
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }
  }

  private uninstallWindows(): { success: boolean; message: string } {
    try {
      execSync('schtasks /delete /tn "AITimeMachine" /f', { stdio: 'pipe' });
      const vbsPath = path.join(platform.dataDir(), 'daemon.vbs');
      if (fs.existsSync(vbsPath)) fs.unlinkSync(vbsPath);
      return { success: true, message: 'Service uninstalled' };
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }
  }

  status(): { installed: boolean; running: boolean; type: string } {
    const type = platform.isWindows ? 'task-scheduler' : platform.isMac ? 'launchd' : 'systemd';
    let installed = false;
    let running = false;

    try {
      if (platform.isWindows) {
        const out = execSync('schtasks /query /tn "AITimeMachine"', { encoding: 'utf-8', stdio: 'pipe' });
        installed = out.includes('AITimeMachine');
        running = out.includes('Running');
      } else if (platform.isMac) {
        installed = fs.existsSync(this.launchdPath);
        if (installed) {
          const out = execSync(`launchctl list | grep ${this.serviceName}`, { encoding: 'utf-8', stdio: 'pipe' });
          running = !out.startsWith('-');
        }
      } else {
        installed = fs.existsSync(this.systemdPath);
        if (installed) {
          execSync('systemctl --user is-active aitimemachine', { stdio: 'pipe' });
          running = true;
        }
      }
    } catch {}

    return { installed, running, type };
  }
}
