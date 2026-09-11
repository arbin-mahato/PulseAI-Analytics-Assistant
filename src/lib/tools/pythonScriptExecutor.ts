import { z } from "zod";
import { runPythonScript } from "../utilities/python_script_executor";
import * as fs from "fs";
import * as path from "path";

/**
 * Tool Implementation: python_script_executor
 * Input: Path to the generated Python script
 * Output: The stdout and stderr of the executed script
 * 
 * Note: Callbacks removed to prevent cross-request contamination.
 * PDF and image detection happens via tool return values only.
 */
export const python_script_executor_tool = {
  implementation: async (args: { script_path: string }) => {
    try {
      // Always use temp ID - agent will rewrite URLs
      const sessionPrefix = `temp_${Date.now()}`;
      console.log(`🔧 Using temp sessionId: ${sessionPrefix}`);
      
      // Global directories (no session-specific folders)
      const imageDir = path.join(process.cwd(), 'generated_files', 'images');
      const pdfDir = path.join(process.cwd(), 'generated_files', 'pdfs');
      
      // Create global directories if they don't exist
      fs.mkdirSync(imageDir, { recursive: true });
      fs.mkdirSync(pdfDir, { recursive: true });
      
      // STEP 1: Capture files BEFORE execution
      const beforeImages = new Set(fs.readdirSync(imageDir));
      const beforePdfs = new Set(fs.readdirSync(pdfDir));
      
      // STEP 2: Execute Python script with session prefix for filenames
      const result = await runPythonScript(args.script_path, {
        IMAGE_DIR: imageDir,
        PDF_DIR: pdfDir,
        SESSION_PREFIX: sessionPrefix
      });

      if (!result.success) {
        return {
          content: [
            {
              type: "text",
              text: `Script execution failed:\n${result.stderr}`,
            },
          ],
        };
      }

      // STEP 3: Capture files AFTER execution
      const afterImages = fs.readdirSync(imageDir);
      const afterPdfs = fs.readdirSync(pdfDir);
      
      // STEP 4: Identify newly created files with session prefix
      const newImages = afterImages.filter(f => 
        !beforeImages.has(f) && 
        f.startsWith(sessionPrefix + '__') && 
        /\.(png|jpg|jpeg|svg)$/i.test(f)
      );
      const newPdfs = afterPdfs.filter(f => 
        !beforePdfs.has(f) && 
        f.startsWith(sessionPrefix + '__') && 
        f.endsWith('.pdf')
      );
      
      console.log(`✅ Session ${sessionPrefix} - New files: ${newImages.length} images, ${newPdfs.length} PDFs`);

      // STEP 5: Build response with global folder URLs
      let responseText = `Python script executed successfully.\n\n---\n${result.stdout}`;
      const fileData: any = { success: true };
      
      if (newPdfs.length > 0) {
        fileData.pdfUrl = `/api/files/pdfs/${newPdfs[0]}`;
        console.log('✅ PDF:', fileData.pdfUrl);
      }
      
      if (newImages.length > 0) {
        fileData.imageUrl = `/api/files/images/${newImages[0]}`;
        console.log('✅ Image:', fileData.imageUrl);
      }
      
      if (fileData.pdfUrl || fileData.imageUrl) {
        responseText += `\n\n${JSON.stringify(fileData)}`;
      }

      return {
        content: [
          {
            type: "text",
            text: responseText,
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error executing Python script: ${err.message}`,
          },
        ],
      };
    } finally {
      // fs.unlinkSync(filePath); // Commented out to keep the script file in temp folder
    }
  }
};
