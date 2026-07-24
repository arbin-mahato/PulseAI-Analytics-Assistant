import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { getPrompt } from "../prompts";

/**
 * Tool: python_script_writer
 * Purpose: Saves a Python script string to /temp/<file_name>.py
 * so it can be executed by the python_script_executor tool.
 */
export const python_script_writer_tool = tool(
  "python_script_writer",
  getPrompt("python_script_writer_prompt"),
  {
    script_content: z
      .string()
      .min(1)
      .describe("The complete Python script code to write to disk."),
    file_name: z
      .string()
      .optional()
      .describe(
        "Optional name for the Python script file (without extension). Defaults to 'tradelab_analysis_<timestamp>'."
      ),
  },
  async (args: { script_content: string; file_name?: string }) => {
    try {
      let scriptContent = args.script_content;
      
      // Automatically replace hardcoded paths with environment variables
      const hasHardcodedPath = /os\.path\.join\(os\.getcwd\(\),\s*['"]generated_files['"]/i.test(scriptContent) ||
                               /['"]generated_files\/images['"]/i.test(scriptContent) ||
                               /['"]generated_files\/pdfs['"]/i.test(scriptContent);
      
      if (hasHardcodedPath) {
        console.log('⚠️ Detected hardcoded paths - applying automatic fix...');
        
        // Replace hardcoded image directory paths
        scriptContent = scriptContent.replace(
          /image_dir\s*=\s*os\.path\.join\(os\.getcwd\(\),\s*['"]generated_files['"],\s*['"]images['"]\)/gi,
          "image_dir = os.environ.get('IMAGE_DIR')"
        );
        
        // Replace hardcoded PDF directory paths
        scriptContent = scriptContent.replace(
          /pdf_dir\s*=\s*os\.path\.join\(os\.getcwd\(\),\s*['"]generated_files['"],\s*['"]pdfs['"]\)/gi,
          "pdf_dir = os.environ.get('PDF_DIR')"
        );
        
        // Replace direct string paths
        scriptContent = scriptContent.replace(
          /['"]generated_files\/images['"]/gi,
          "os.environ.get('IMAGE_DIR')"
        );
        scriptContent = scriptContent.replace(
          /['"]generated_files\/pdfs['"]/gi,
          "os.environ.get('PDF_DIR')"
        );
        
        console.log('✅ Paths automatically fixed to use environment variables');
      }
      
      // Ensure /temp exists
      const tempDir = "/tmp";
      await fs.mkdir(tempDir, { recursive: true });

      // Create file name and path
      const safeName =
        args.file_name?.replace(/[^a-zA-Z0-9_\-]/g, "_") ||
        `tradelab_analysis_${Date.now()}`;
      const filePath = path.join('/tmp', `${safeName}.py`);

      // Write fixed script content to /temp
      await fs.writeFile(filePath, scriptContent, "utf-8");
      console.log('Python script created at:', filePath);

      return {
        content: [
          {
            type: "text",
            text: `✅ Python script saved successfully.\nFile path: ${filePath}`,
          },
        ],
        data: {
          file_path: filePath,
        },
      };
    } catch (err: any) {
        console.error("python_script_writer error:", err);
      return {
        content: [
          {
            type: "text",
            text: `❌ Error writing Python script: ${err.message}`,
          },
        ],
      };
    }
  }
);
