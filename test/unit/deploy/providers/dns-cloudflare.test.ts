import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CloudflareDnsProvider from '../../../../src/deploy/providers/dns-cloudflare';
import { DeploymentContext } from '../../../../src/deploy/types';

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
});
