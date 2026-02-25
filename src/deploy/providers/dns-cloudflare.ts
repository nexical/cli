import { logger } from '@nexical/cli-core';
import { DnsProvider, DeploymentContext, DnsRecord } from '../types';

export class CloudflareDnsProvider implements DnsProvider {
  name = 'cloudflare';
  type = 'dns' as const;

  async provision(context: DeploymentContext, records: DnsRecord[]): Promise<void> {
    const dnsConfig = context.config.deploy?.dns;

    // Cloudflare specific token handling
    const cfConfig = dnsConfig?.cloudflare as { token?: string; zone?: string } | undefined;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN || cfConfig?.token;
    const zoneId = process.env.CLOUDFLARE_ZONE_ID || cfConfig?.zone;

    if (!apiToken) {
      throw new Error(
        'Cloudflare API token not found. Set CLOUDFLARE_API_TOKEN environment variable or deploy.dns.cloudflare.token in nexical.yaml',
      );
    }
    if (!zoneId) {
      throw new Error(
        'Cloudflare Zone ID not found. Set CLOUDFLARE_ZONE_ID environment variable or deploy.dns.cloudflare.zone in nexical.yaml',
      );
    }

    if (records.length === 0) {
      logger.info(`[Cloudflare DNS] No DNS records to provision.`);
      return;
    }

    logger.info(`[Cloudflare DNS] Provisioning ${records.length} records...`);

    if (context.options.dryRun) {
      for (const record of records) {
        logger.info(
          `[Dry Run] Would create/update DNS record: ${record.name} -> ${record.content} (${record.type})`,
        );
      }
      return;
    }

    // Fetch existing records for this zone to avoid creating duplicates
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to fetch Cloudflare DNS records: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const jsonRes = (await response.json()) as {
      success: boolean;
      result: { id: string; type: string; name: string; content: string; proxied: boolean }[];
    };

    if (!jsonRes.success) {
      throw new Error('Cloudflare API returned success: false when fetching DNS records.');
    }

    const existingRecords = jsonRes.result || [];

    for (const record of records) {
      // Find matching record by name and type
      const match = existingRecords.find((r) => r.name === record.name && r.type === record.type);

      const payload = {
        type: record.type,
        name: record.name,
        content: record.content,
        proxied: record.proxied ?? true, // Default to proxied for Cloudflare
        ttl: 1, // Automatic
      };

      if (match) {
        // Update if content or proxied status differs
        if (match.content !== record.content || match.proxied !== payload.proxied) {
          logger.info(
            `[Cloudflare DNS] Updating ${record.name} (${record.type}) -> ${record.content}`,
          );
          const updateRes = await fetch(
            `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${match.id}`,
            {
              method: 'PUT',
              headers: {
                Authorization: `Bearer ${apiToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(payload),
            },
          );
          if (!updateRes.ok) {
            const errorText = await updateRes.text();
            throw new Error(`Failed to update DNS record ${record.name}: ${errorText}`);
          }
        } else {
          logger.info(`[Cloudflare DNS] Record ${record.name} is already up to date.`);
        }
      } else {
        // Create new record
        logger.info(
          `[Cloudflare DNS] Creating ${record.name} (${record.type}) -> ${record.content}`,
        );
        const createRes = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          },
        );
        if (!createRes.ok) {
          const errorText = await createRes.text();
          throw new Error(`Failed to create DNS record ${record.name}: ${errorText}`);
        }
      }
    }
    logger.success(`[Cloudflare DNS] Finished provisioning DNS records.`);
  }
}

export default CloudflareDnsProvider;
