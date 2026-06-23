import { ConfigManager } from '../src/config.js';
import * as fs from 'fs';
import * as path from 'path';

describe('ConfigManager', () => {
    const testDir = path.join(process.cwd(), '.test-config-tmp');
    let configManager: ConfigManager;

    beforeEach(() => {
        // Create a temporary test directory
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
        configManager = new ConfigManager(testDir);
    });

    afterEach(() => {
        // Cleanup
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    test('should create instance with default config', () => {
        expect(configManager).toBeDefined();
        const config = configManager.getConfig();
        expect(config.autoConfirm).toBe(false);
        expect(config.watchEnabled).toBe(true);
        expect(config.maxSnapshots).toBe(100);
    });

    test('should update config', () => {
        configManager.updateConfig({ autoConfirm: true });
        const config = configManager.getConfig();
        expect(config.autoConfirm).toBe(true);
    });

    test('should persist config to file', () => {
        configManager.updateConfig({ maxSnapshots: 50 });

        // Create a new instance to verify persistence
        const newConfigManager = new ConfigManager(testDir);
        const config = newConfigManager.getConfig();
        expect(config.maxSnapshots).toBe(50);
    });

    test('should update multiple config values', () => {
        configManager.updateConfig({
            autoConfirm: true,
            watchEnabled: false,
            maxSnapshots: 200,
        });

        const config = configManager.getConfig();
        expect(config.autoConfirm).toBe(true);
        expect(config.watchEnabled).toBe(false);
        expect(config.maxSnapshots).toBe(200);
    });

    test('should handle partial updates', () => {
        configManager.updateConfig({ autoConfirm: true });
        configManager.updateConfig({ maxSnapshots: 75 });

        const config = configManager.getConfig();
        expect(config.autoConfirm).toBe(true);
        expect(config.watchEnabled).toBe(true); // Should retain default
        expect(config.maxSnapshots).toBe(75);
    });
});
