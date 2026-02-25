import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface WorkflowTemplateData {
  APP_NAME: string;
  PROVIDER_NAME: string;
  [key: string]: string;
}

export class TemplateManager {
  private templatesDir: string;

  constructor() {
    this.templatesDir = path.join(__dirname, 'templates');
  }

  async loadWorkflow(name: string, data: WorkflowTemplateData): Promise<unknown> {
    const templatePath = path.join(this.templatesDir, `${name}.yaml`);
    let content = await fs.readFile(templatePath, 'utf-8');

    // Simple placeholder replacement
    for (const [key, value] of Object.entries(data)) {
      content = content.split(`\${${key}}`).join(value);
    }

    return YAML.parse(content);
  }
}
