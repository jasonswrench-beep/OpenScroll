import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';
if (existsSync('.env')) process.loadEnvFile('.env');
export default defineConfig({ testDir: './tests/browser', workers: 1, use: { baseURL: 'http://127.0.0.1:3000', launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } }, webServer: { command: 'npm start', env: { APP_ORIGIN:'http://127.0.0.1:3000', MAIL_MODE:'outbox', MAIL_OUTBOX_DIR:'.local/test-mail', REQUIRE_EMAIL_VERIFICATION:'false', REGISTRATION_ENABLED:'true' }, url: 'http://127.0.0.1:3000/api/health', reuseExistingServer: false }, projects: [{ name: 'chromium', use: { browserName: 'chromium' } }] });
