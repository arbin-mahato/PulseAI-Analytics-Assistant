import * as fs from 'fs';
import * as path from 'path';

// Read from src/lib/prompts.json
const promptsPath = path.join(process.cwd(), 'src', 'lib', 'prompts.json');
const prompts = JSON.parse(fs.readFileSync(promptsPath, 'utf-8'));

export function getPrompt(key: string): string {
  return prompts[key] || '';
}

export function updatePrompt(key: string, value: string) {
  prompts[key] = value;
  fs.writeFileSync(promptsPath, JSON.stringify(prompts, null, 2));
  console.log(`✅ Prompt updated: ${key}`);
}

export function getPrompts() {
  return prompts;
}