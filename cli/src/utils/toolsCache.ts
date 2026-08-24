import { createHash } from "crypto";
import { promises as fs } from "fs";
import { homedir } from "os";
import path from "path";

interface ToolsCacheOptions {
  cacheDir?: string;
}

type ToolsCacheKeyParams = {
  agentName: string;
  mcpServerName: string;
  toolName: string;
  inputs?: Record<string, unknown>;
};

export class ToolsCache {
  private cacheDir: string;
  private cacheFilePath: string;

  constructor(options: ToolsCacheOptions = {}) {
    this.cacheDir = options.cacheDir ?? path.join(homedir(), ".dust-cli");
    this.cacheFilePath = path.join(this.cacheDir, "tool-cache.json");
  }

  private async ensureCacheDir(): Promise<void> {
    try {
      await fs.access(this.cacheDir);
    } catch {
      await fs.mkdir(this.cacheDir, { recursive: true });
    }
  }

  private async loadCache(): Promise<string[]> {
    try {
      await this.ensureCacheDir();
      try {
        const data = await fs.readFile(this.cacheFilePath, "utf8");
        return JSON.parse(data);
      } catch {
        return [];
      }
    } catch (error) {
      console.warn("Failed to load tools cache:", error);
      return [];
    }
  }

  private async saveCache(cache: string[]): Promise<void> {
    try {
      await this.ensureCacheDir();
      await fs.writeFile(
        this.cacheFilePath,
        JSON.stringify(cache, null, 2),
        "utf-8"
      );
    } catch (error) {
      console.warn("Failed to save tools cache:", error);
    }
  }

  private createInputsHash(inputs: Record<string, unknown>): string {
    // Create a deterministic hash of the inputs by sorting keys and stringifying
    const sortedInputs = Object.keys(inputs)
      .sort()
      .reduce((acc, key) => {
        acc[key] = inputs[key];
        return acc;
      }, {} as Record<string, unknown>);
    
    const inputsString = JSON.stringify(sortedInputs);
    return createHash("sha256").update(inputsString).digest("hex").substring(0, 16);
  }

  private createToolKey({
    agentName,
    mcpServerName,
    toolName,
    inputs,
  }: ToolsCacheKeyParams): string {
    const baseKey = `${agentName}:${mcpServerName}:${toolName}`;
    
    // If inputs are provided, include their hash in the key to bind approval to specific operation
    if (inputs && Object.keys(inputs).length > 0) {
      const inputsHash = this.createInputsHash(inputs);
      return `${baseKey}:${inputsHash}`;
    }
    
    return baseKey;
  }

  public async getCachedApproval({
    agentName,
    mcpServerName,
    toolName,
    inputs,
  }: ToolsCacheKeyParams): Promise<boolean | null> {
    const cache = await this.loadCache();
    const toolKey = this.createToolKey({ agentName, mcpServerName, toolName, inputs });
    const cachedEntry = cache.find((entry) => entry === toolKey);

    if (!cachedEntry) {
      return null;
    }

    return true;
  }

  public async setCachedApproval({
    agentName,
    mcpServerName,
    toolName,
    inputs,
  }: ToolsCacheKeyParams): Promise<void> {
    const cache = await this.loadCache();
    const toolKey = this.createToolKey({ agentName, mcpServerName, toolName, inputs });
    
    // Avoid duplicate entries
    if (!cache.includes(toolKey)) {
      await this.saveCache([...cache, toolKey]);
    }
  }

  async invalidate(): Promise<void> {
    try {
      await fs.unlink(this.cacheFilePath);
    } catch {
      // Ignore if file doesn't exist
    }
  }
}

// Export singleton instance
export const toolsCache = new ToolsCache();
