import { logger } from '@nexical/cli-core';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import PreviewCommand from '../../../src/commands/preview.js';
import fs from 'fs-extra';
import cp from 'child_process';
import EventEmitter from 'events';

vi.mock('@nexical/cli-core', async (importOriginal) => {
    const mod = await importOriginal<typeof import('@nexical/cli-core')>();
    return {
        ...mod,
        logger: { code: vi.fn(), debug: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn(), warn: vi.fn() }
    }
});
vi.mock('fs-extra');
vi.mock('child_process');

describe('PreviewCommand', () => {
    let command: PreviewCommand;
    let mockChild: any;

    beforeEach(async () => {
        vi.clearAllMocks();
        command = new PreviewCommand({}, { rootDir: '/mock/root' });

        mockChild = new EventEmitter();
        mockChild.kill = vi.fn();
        mockChild.stdout = new EventEmitter();
        mockChild.stderr = new EventEmitter();
        vi.mocked(cp.spawn).mockReturnValue(mockChild as any);

        vi.spyOn(command, 'error').mockImplementation((() => { }) as any);
        vi.spyOn(command, 'info').mockImplementation((() => { }) as any);
        vi.spyOn(command, 'warn').mockImplementation((() => { }) as any);
        vi.spyOn(command, 'success').mockImplementation((() => { }) as any);

        vi.spyOn(process, 'exit').mockImplementation((() => { }) as any);
        await command.init();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    it('should have correct static properties', () => {
        expect(PreviewCommand.usage).toBe('preview');
        expect(PreviewCommand.description).toBeDefined();
        expect(PreviewCommand.requiresProject).toBe(true);
    });

    it('should error if project root is missing', async () => {
        command = new PreviewCommand({}, { rootDir: undefined });
        vi.spyOn(command, 'init').mockImplementation(async () => { });
        vi.spyOn(command, 'error').mockImplementation((() => { }) as any);

        await command.runInit({});
        expect(command.error).toHaveBeenCalledWith(expect.stringContaining('requires to be run within an app project'), 1);
    });

    it('should spawn astro preview if dist exists', async () => {
        vi.mocked(fs.pathExists).mockResolvedValue(true as any);
        setTimeout(() => {
            mockChild.emit('close', 0);
        }, 10);

        await command.run({});

        expect(cp.spawn).toHaveBeenCalledWith(
            expect.stringContaining('astro'),
            ['preview'],
            expect.objectContaining({
                cwd: expect.stringContaining('site')
            })
        );
    });

    it('should error if dist does not exist', async () => {
        vi.mocked(fs.pathExists).mockResolvedValue(false as any);

        await command.run({});

        expect(command.error).toHaveBeenCalledWith(expect.stringContaining('run \'nexical build\' first'));
        expect(cp.spawn).not.toHaveBeenCalled();
    });

    it('should handle spawn error', async () => {
        vi.mocked(fs.pathExists).mockResolvedValue(true as any);
        setTimeout(() => {
            mockChild.emit('error', new Error('Spawn failed'));
            mockChild.emit('close', 1);
        }, 10);
        await command.run({});
        expect(command.error).toHaveBeenCalledWith(expect.stringContaining('Failed to start preview'));
    });

    it('should handle cleanup signals', async () => {
        vi.mocked(fs.pathExists).mockResolvedValue(true as any);
        const listeners: Record<string, Function> = {};
        vi.spyOn(process, 'on').mockImplementation((event: string | symbol, listener: any) => {
            listeners[event.toString()] = listener;
            return process;
        });

        const runPromise = command.run({});
        await new Promise(resolve => setTimeout(resolve, 0));

        // Signal
        if (listeners['SIGINT']) listeners['SIGINT']();
        mockChild.emit('close', 0);

        await runPromise;
        expect(mockChild.kill).toHaveBeenCalled();
        expect(process.exit).toHaveBeenCalled();
    });
});
