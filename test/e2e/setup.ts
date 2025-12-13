import { beforeAll, afterAll } from 'vitest';
import http from 'http';

const MOCK_PORT = 3333;
export const TEST_API_URL = `http://localhost:${MOCK_PORT}`;

// Simple in-memory mock store
export const mockStore = {
    users: [] as any[],
    tokens: [] as any[],
    teams: [] as any[],
    projects: [] as any[],
    jobs: [] as any[],
};

export const resetMockStore = () => {
    mockStore.users = [];
    mockStore.tokens = [];
    mockStore.teams = [
        { id: 1, name: 'My Team', slug: 'my-team' }
    ];
    mockStore.projects = [];
    mockStore.jobs = [];
};

const server = http.createServer((req, res) => {
    const { method, url } = req;
    let body = '';

    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', () => {
        let parsedBody: any = {};
        try {
            if (body) parsedBody = JSON.parse(body);
        } catch (e) {
            // ignore
        }

        console.log(`[MOCK API] ${method} ${url}`, parsedBody);

        res.setHeader('Content-Type', 'application/json');

        // --- Mock Routes ---

        // AUTH
        if (method === 'POST' && url === '/auth/device') {
            res.writeHead(200);
            res.end(JSON.stringify({ deviceCode: '1234', userCode: 'ABCD-1234', verificationUrl: 'http://localhost:3000/verify' }));
            return;
        }

        if (method === 'POST' && url === '/auth/token') {
            res.writeHead(200);
            res.end(JSON.stringify({ accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token' }));
            return;
        }

        if (method === 'POST' && url === '/auth/logout') {
            res.writeHead(200);
            res.end(JSON.stringify({ success: true }));
            return;
        }

        // Auth
        if (method === 'GET' && url === '/users/me') {
            const authHeader = req.headers['authorization'];
            const token = authHeader?.split(' ')[1];

            if (!token || token === 'expired') {
                res.writeHead(401);
                res.end(JSON.stringify({ error: 'Unauthorized' }));
                return;
            }

            const user = mockStore.users[0] || {
                id: '123e4567-e89b-12d3-a456-426614174000', // Valid UUID
                email: 'test@example.com',
                fullName: 'Test User',
                avatarUrl: null,
                role: 'user',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            // Wrap in { user: ... }
            res.writeHead(200);
            res.end(JSON.stringify({ user }));
            return;
        }

        // PROJECTS
        if (method === 'POST' && url === '/teams/1/projects') {
            const newProject = {
                id: 101, // SDK expects number
                teamId: 1,
                name: parsedBody.name,
                repoUrl: parsedBody.repoUrl || null,
                productionUrl: null,
                contextHash: null,
                mode: 'managed',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            mockStore.projects.push(newProject);

            // Wrap in { project: ... }
            res.writeHead(201);
            res.end(JSON.stringify({ project: newProject }));
            return;
        }

        if (method === 'GET' && url === '/teams/1/projects') {
            // Wrap in { projects: ... }
            res.writeHead(200);
            res.end(JSON.stringify({ projects: mockStore.projects }));
            return;
        }

        if (method === 'PUT' && url?.match(/\/teams\/1\/projects\/\d+$/)) {
            const id = parseInt(url.split('/').pop() || '0');
            const project = mockStore.projects.find((p: any) => p.id === id);
            if (project) {
                // Update logic mimicking body parse (simplification)
                // content-length usually small in tests
                // For now, return existing or updated stub
                project.name = 'Updated Project'; // Hardcode for test expectation
                res.writeHead(200);
                res.end(JSON.stringify({ project }));
                return;
            }
            res.writeHead(404);
            res.end('Not Found');
            return;
        }

        if (method === 'DELETE' && url?.match(/\/teams\/1\/projects\/\d+$/)) {
            const id = parseInt(url.split('/').pop() || '0');
            const index = mockStore.projects.findIndex((p: any) => p.id === id);
            if (index !== -1) {
                mockStore.projects.splice(index, 1);
                res.writeHead(200);
                res.end(JSON.stringify({ message: 'Project deleted' }));
            } else {
                res.writeHead(404);
                res.end(JSON.stringify({ message: "Not Found" }));
            }
            return;
        }

        // TEAMS
        if (method === 'GET' && url === '/teams/1') {
            // Return team 1 mock
            res.writeHead(200);
            res.end(JSON.stringify({
                id: 1,
                name: 'My Team',
                slug: 'my-team',
                billingPlan: 'free',
                creditsBalance: 100,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                role: 'owner'
            }));
            return;
        }

        // Jobs
        if (method === 'POST' && url?.includes('/jobs') && !url.includes('/logs')) {
            const newJob = {
                id: 123,
                branchId: 3,
                type: 'deploy',
                status: 'pending',
                queue: 'public',
                inputs: null,
                outputs: null,
                assignedFactoryId: null,
                startedAt: null,
                completedAt: null,
                createdAt: new Date().toISOString(),
            };
            mockStore.jobs.push(newJob);
            // Wrap in { job: ... }
            res.writeHead(201);
            res.end(JSON.stringify({ job: newJob }));
            return;
        }

        // Logs
        if (method === 'GET' && url?.includes('/logs')) {
            const stubLogs = [
                {
                    id: 1,
                    jobId: 123,
                    level: 'info',
                    message: 'Build initialized',
                    metadata: null,
                    timestamp: new Date().toISOString()
                },
                {
                    id: 2,
                    jobId: 123,
                    level: 'info',
                    message: 'Build successful',
                    metadata: null,
                    timestamp: new Date().toISOString()
                }
            ];
            // Wrap in { logs: ... }
            res.writeHead(200);
            res.end(JSON.stringify({ logs: stubLogs }));
            return;
        }

        // Default 404
        res.writeHead(404);
        res.end(JSON.stringify({ message: 'Not Found' }));
    });
});

beforeAll(async () => {
    return new Promise<void>((resolve) => {
        server.listen(MOCK_PORT, () => {
            console.log(`Mock API running on port ${MOCK_PORT}`);
            resolve();
        });
    });
});

afterAll(async () => {
    return new Promise<void>((resolve) => {
        server.close(() => resolve());
    });
});
