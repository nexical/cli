
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { execa } from 'execa';

const CLI_ENTRY = path.resolve(__dirname, '../../../index.ts');
const TEST_TMP_DIR = path.resolve(__dirname, '../../.test-tmp/command-loading');

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const tsxPackagePath = require.resolve('tsx/package.json');
const tsxDir = path.dirname(tsxPackagePath);
const TSX_BIN = path.resolve(tsxDir, 'dist/cli.mjs');

console.log('Using TSX binary at:', TSX_BIN);

describe('Command Loading Integration', () => {
    beforeAll(async () => {
        await fs.ensureDir(TEST_TMP_DIR);
    });

    afterAll(async () => {
        await fs.remove(TEST_TMP_DIR);
    });

    it('should load commands from modules', async () => {
        // Create nexical.yaml to mock project root
        await fs.writeFile(path.join(TEST_TMP_DIR, 'nexical.yaml'), 'name: test-project');

        // Setup module structure
        const moduleDir = path.join(TEST_TMP_DIR, 'src/modules/test-mod/src/commands');
        await fs.ensureDir(moduleDir);

        const commandFile = path.join(moduleDir, 'hello.ts');
        const commandContent = `
            import { BaseCommand } from '@nexical/cli-core';
            export default class HelloCommand extends BaseCommand {
                static description = 'Test hello command';
                static args = {
                     args: [{ name: 'name', required: false }]
                };
                
                async run(options: any) {
                    console.log('Hello from test module!');
                }
            }
        `;

        const jsCommandContent = `
            export default class HelloCommand {
                constructor(cli) { this.cli = cli; }
                async init() {}
                async runInit(options) { return this.run(options); }
                async run() { console.log('Hello from test module!'); }
            }
            HelloCommand.description = 'Test hello command';
            HelloCommand.args = {};
        `;

        await fs.writeFile(path.join(moduleDir, 'hello.js'), jsCommandContent);

        const { stdout, stderr } = await execa('node', [TSX_BIN, CLI_ENTRY, 'hello', '--debug'], {
            cwd: TEST_TMP_DIR,
            reject: false,
            env: {
                ...process.env,
                FORCE_COLOR: '0'
            }
        });

        if (!stdout.includes('Hello from test module!')) {
            console.log('STDOUT:', stdout);
            console.log('STDERR:', stderr);
        }

        expect(stdout).toContain('Hello from test module!');
    }, 20000);
});
