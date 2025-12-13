import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['test/integration/**/*.test.ts'],
        // Increase timeout for integration tests as they do real IO
        testTimeout: 60000,
        fileParallelism: false,
        server: {
            deps: {
                inline: ['@nexical/cli-core'],
            },
        },
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['src/**/*.ts'],
        },
    },
});
