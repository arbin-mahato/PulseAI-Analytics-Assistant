import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

/**
 * Executes a Python script and returns stdout and stderr
 */
export async function runPythonScript(scriptPath: string, env?: Record<string, string>) {
  try {
    // Check if file exists
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Script file not found: ${scriptPath}`);
    }

    // Execute the script with environment variables
    const stdout = execSync(`python3 "${scriptPath}"`, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      env: { ...process.env, ...env },
    });

    return {
      success: true,
      stdout,
      stderr: "",
    };
  } catch (error: any) {
    return {
      success: false,
      stdout: error.stdout || "",
      stderr: error.stderr || error.message || "Unknown error",
    };
  }
}