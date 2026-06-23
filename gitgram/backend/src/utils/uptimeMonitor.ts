import logger from './logger';

interface UptimeStats {
  startTime: Date;
  uptime: number;
  restarts: number;
  lastRestart?: Date;
}

class UptimeMonitor {
  private startTime: Date;
  private restarts: number = 0;
  private lastRestart?: Date;

  constructor() {
    this.startTime = new Date();
    this.trackRestart();
  }

  private trackRestart() {
    // Check if this is a restart (uptime is less than expected)
    const expectedUptime = Date.now() - this.startTime.getTime();
    const actualUptime = process.uptime() * 1000;

    // If actual uptime is significantly less than expected, it's likely a restart
    if (expectedUptime > 60000 && actualUptime < expectedUptime - 10000) {
      this.restarts++;
      this.lastRestart = new Date();
      logger.warn('Server restart detected', {
        restarts: this.restarts,
        lastRestart: this.lastRestart,
      });
    }
  }

  getStats(): UptimeStats {
    return {
      startTime: this.startTime,
      uptime: process.uptime(),
      restarts: this.restarts,
      lastRestart: this.lastRestart,
    };
  }

  getUptimePercentage(timeWindow: number = 86400000): number {
    // Calculate uptime percentage over time window (default 24 hours)
    const windowStart = Date.now() - timeWindow;
    const uptime = process.uptime() * 1000;
    const startTime = this.startTime.getTime();
    
    if (startTime < windowStart) {
      // Server has been up longer than the window
      return 100;
    }

    const windowUptime = Date.now() - startTime;
    const downtime = this.restarts * 10000; // Estimate 10s downtime per restart
    const uptimeInWindow = windowUptime - downtime;

    return Math.max(0, Math.min(100, (uptimeInWindow / timeWindow) * 100));
  }
}

export const uptimeMonitor = new UptimeMonitor();

