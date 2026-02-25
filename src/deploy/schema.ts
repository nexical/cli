import { z } from 'zod';

export const AppConfigSchema = z
  .object({
    provider: z.string(),
    projectName: z.string().optional(),
    target: z.string().optional(),
    buildCommand: z.string().optional(),
    artifactPath: z.string().optional(),
    paths: z.array(z.string()).optional(),
    options: z.record(z.string(), z.any()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    secrets: z.record(z.string(), z.string()).optional(),
    domain: z.union([z.string(), z.array(z.string())]).optional(),
    dnsTarget: z.string().optional(),
  })
  .passthrough();

export const DeploymentSchema = z.object({
  deploy: z
    .object({
      repository: z
        .object({
          provider: z.string(),
          options: z.record(z.string(), z.any()).optional(),
        })
        .optional(),
      dns: z
        .object({
          provider: z.string(),
        })
        .passthrough()
        .optional(),
      apps: z.record(z.string(), AppConfigSchema).optional(),
    })
    .optional(),
});

export type ValidatedNexicalConfig = z.infer<typeof DeploymentSchema>;
