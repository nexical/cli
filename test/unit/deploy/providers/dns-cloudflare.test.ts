import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CloudflareDnsProvider from '../../../../src/deploy/providers/dns-cloudflare';
import { DeploymentContext } from '../../../../src/deploy/types';
import { logger } from '@nexical/cli-core';

vi.mock('@nexical/cli-core', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('CloudflareDnsProvider', () => {
  let provider: CloudflareDnsProvider;
  let mockContext: DeploymentContext;

  beforeEach(() => {
    provider = new CloudflareDnsProvider();
    mockContext = {
      cwd: '/test/cwd',
      config: {
        deploy: {
          dns: {
            provider: 'cloudflare',
            cloudflare: {
              token: 'test-token',
              zone: 'test-zone-id',
            },
          },
        },
      },
      options: {},
    };

    // Reset env vars and mocks
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.CLOUDFLARE_ZONE_ID;
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should be named cloudflare and use type dns', () => {
    expect(provider.name).toBe('cloudflare');
    expect(provider.type).toBe('dns');
  });

  it('should throw if api token is missing', async () => {
    (
      mockContext.config.deploy!.dns as {
        cloudflare?: { token?: string };
      }
    ).cloudflare!.token = undefined;
    await expect(
      provider.provision(mockContext, [{ type: 'A', name: 'ex.com', content: '1.2.3.4' }]),
    ).rejects.toThrow(/Cloudflare API token not found/);
  });

  it('should throw if zone id is missing', async () => {
    (
      mockContext.config.deploy!.dns as {
        cloudflare?: { zone?: string };
      }
    ).cloudflare!.zone = undefined;
    await expect(
      provider.provision(mockContext, [{ type: 'A', name: 'ex.com', content: '1.2.3.4' }]),
    ).rejects.toThrow(/Cloudflare Zone ID not found/);
  });

  it('should skip provisioning if no records are provided', async () => {
    await provider.provision(mockContext, []);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should create new DNS record if it does not exist', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        result: [], // No existing records
      }),
    } as unknown as Response);

    mockFetch.mockResolvedValueOnce({
      ok: true,
    } as unknown as Response);

    await provider.provision(mockContext, [{ type: 'A', name: 'test.com', content: '1.2.3.4' }]);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'https://api.cloudflare.com/client/v4/zones/test-zone-id/dns_records',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
      }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'https://api.cloudflare.com/client/v4/zones/test-zone-id/dns_records',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          type: 'A',
          name: 'test.com',
          content: '1.2.3.4',
          proxied: true,
          ttl: 1,
        }),
      }),
    );
  });

  it('should update existing DNS record if content differs', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        result: [
          { id: 'rec-1', type: 'CNAME', name: 'app.com', content: 'old.target.com', proxied: true },
        ],
      }),
    } as unknown as Response);

    mockFetch.mockResolvedValueOnce({
      ok: true,
    } as unknown as Response);

    await provider.provision(mockContext, [
      { type: 'CNAME', name: 'app.com', content: 'new.target.com', proxied: false },
    ]);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'https://api.cloudflare.com/client/v4/zones/test-zone-id/dns_records/rec-1',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          type: 'CNAME',
          name: 'app.com',
          content: 'new.target.com',
          proxied: false,
          ttl: 1,
        }),
      }),
    );
  });

  it('should throw if fetch records fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'Error body',
    } as unknown as Response);

    await expect(
      provider.provision(mockContext, [{ type: 'A', name: 'ex.com', content: '1.2.3.4' }]),
    ).rejects.toThrow(
      'Failed to fetch Cloudflare DNS records: 500 Internal Server Error - Error body',
    );
  });

  it('should throw if Cloudflare API returns success: false', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: false }),
    } as unknown as Response);

    await expect(
      provider.provision(mockContext, [{ type: 'A', name: 'ex.com', content: '1.2.3.4' }]),
    ).rejects.toThrow('Cloudflare API returned success: false');
  });

  it('should throw if update record fails', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: [{ id: 'rec-1', type: 'A', name: 'ex.com', content: 'old', proxied: true }],
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: false,
        text: async () => 'Update fail',
      } as unknown as Response);

    await expect(
      provider.provision(mockContext, [{ type: 'A', name: 'ex.com', content: 'new' }]),
    ).rejects.toThrow('Failed to update DNS record ex.com: Update fail');
  });

  it('should throw if create record fails', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, result: [] }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: false,
        text: async () => 'Create fail',
      } as unknown as Response);

    await expect(
      provider.provision(mockContext, [{ type: 'A', name: 'ex.com', content: '1.2.3.4' }]),
    ).rejects.toThrow('Failed to create DNS record ex.com: Create fail');
  });

  it('should skip if record is up to date', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        result: [{ id: 'rec-1', type: 'A', name: 'ex.com', content: '1.2.3.4', proxied: true }],
      }),
    } as unknown as Response);

    await provider.provision(mockContext, [{ type: 'A', name: 'ex.com', content: '1.2.3.4' }]);
    expect(fetch).toHaveBeenCalledTimes(1); // Only GET
  });

  it('should handle dry run', async () => {
    mockContext.options.dryRun = true;
    await provider.provision(mockContext, [{ type: 'A', name: 'ex.com', content: '1.2.3.4' }]);
    expect(fetch).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('[Dry Run] Would create/update DNS record'),
    );
  });
});
