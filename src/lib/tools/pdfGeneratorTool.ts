import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { getPrompt } from "../prompts";

const client = new Anthropic();
function extractFileIds(response: any): string[] {
    const fileIds: string[] = [];
    console.log("extraction called");
    for (const item of response.content) {
        if (item.type === 'bash_code_execution_tool_result') {
        const contentItem = item.content;
        console.log("content found");
        if (contentItem.type === 'bash_code_execution_result') {
            console.log('Content Item:', contentItem.content);
            for (const file of contentItem.content) {
            if ('file_id' in file) {
                fileIds.push(file.file_id);
            }
            }
        }
        }
    }
    return fileIds;
    }
    
export const pdfGenerator_tool = tool(
  "pdfGenerator",
  getPrompt("pdf_generator_prompt"),
  {
    content: z.string().describe("The analysis / report content to embed into the PDF."),
    filename: z.string().optional().describe("Optional desired filename for the generated PDF."),
  },
  async (args: { content: string; filename?: string }) => {
    try {
      if (!process.env.ANTHROPIC_API_KEY) {
        const msg = "PDF generation unavailable: missing ANTHROPIC_API_KEY environment variable.";
        console.warn(msg);
        return {
          content: [
            { type: "text", text: msg },
            { type: "text", text: JSON.stringify({ success: false, error: "Missing ANTHROPIC_API_KEY" }) },
          ],
        };
      }

      // Prepare message for the pdf skill
      const filename = args.filename ?? `tradelab_report_${Date.now()}.pdf`;

      const response = await client.beta.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 10000, 
        betas: ['code-execution-2025-08-25', 'skills-2025-10-02'],
        container: {
          skills: [{ type: 'anthropic', skill_id: 'pdf', version: 'latest' }]
        },
        messages: [
          { role: 'user', content: `Convert this to PDF using the pdf skill:\n\n${args.content}` }
        ],
        tools: [{ type: 'code_execution_20250825', name: 'code_execution' }]
      });
        const fileIds = extractFileIds(response);

      if (fileIds.length === 0) {
        const msg = "PDF skill executed but returned no files.";
        console.warn(msg, response);
        return {
          content: [
            { type: "text", text: msg },
            { type: "text", text: JSON.stringify({ success: false, error: "No files returned from pdf skill" }) },
          ],
        };
      }

      // Always use temp ID - agent will rewrite URLs
      const sessionPrefix = `temp_${Date.now()}`;
      console.log(`🔧 PDF using temp sessionId: ${sessionPrefix}`);
      
      // Save to global PDF directory
      const outDir = path.join(process.cwd(), "generated_files", "pdfs");
      await fs.promises.mkdir(outDir, { recursive: true });
      
      // Capture files BEFORE download
      const beforeFiles = new Set(await fs.promises.readdir(outDir));

      const files: Array<{ filename: string; path: string; file_id?: string }> = [];

      for (const fileId of fileIds) {
        try {
          const fileMetadata = await client.beta.files.retrieveMetadata(fileId, { betas: ['files-api-2025-04-14'] });
          const fileContent = await client.beta.files.download(fileId, { betas: ['files-api-2025-04-14'] });

          const buf = Buffer.from(await fileContent.arrayBuffer());
          // Use session prefix format: <sessionPrefix>__<name>_<timestamp>.pdf
          const timestamp = Date.now();
          const baseName = filename.replace('.pdf', '');
          const safeName = `${sessionPrefix}__${baseName}_${timestamp}.pdf`;
          const outPath = path.join(outDir, safeName);
          await fs.promises.writeFile(outPath, buf);

          files.push({ filename: safeName, path: outPath, file_id: fileId });
        } catch (err: any) {
          // Keep going for other files
          console.error('Error downloading file', fileId, err?.message ?? err);
        }
      }

      // Capture files AFTER download and identify new files with session prefix
      const afterFiles = await fs.promises.readdir(outDir);
      const newFiles = afterFiles.filter(f => 
        !beforeFiles.has(f) && 
        f.startsWith(sessionPrefix + '__') && 
        f.endsWith('.pdf')
      );
      
      if (newFiles.length === 0) {
        const msg = "PDF skill returned file ids but no new files were created.";
        console.warn(msg);
        return {
          content: [
            { type: "text", text: msg },
            { type: "text", text: JSON.stringify({ success: false, error: "No new PDF files detected" }) },
          ],
        };
      }
      
      console.log(`✅ PDF files created: ${newFiles.join(', ')}`);

      // Build human-readable messages for new files
      const fileMessages: string[] = [];

      for (const filename of newFiles) {
        const filePath = path.join(outDir, filename);
        let sizeKB = '0';
        try {
          const stats = await fs.promises.stat(filePath);
          sizeKB = Math.max(1, Math.round(stats.size / 1024)).toString();
        } catch (e) {
          // ignore size retrieval errors
        }
        const relativeGenerated = `generated_files/pdfs/${filename}`;
        fileMessages.push(`✓ PDF generated successfully!\nFile: ${filename}\nSize: ${sizeKB} KB\nLocation: ${relativeGenerated}`);
      }

      const humanMsg = fileMessages.join('\n\n');

      // Include global folder API URL for the first new file
      const firstPdfUrl = newFiles.length > 0 ? `/api/files/pdfs/${newFiles[0]}` : undefined;

      return {
        content: [
          { type: "text", text: humanMsg },
          { type: "text", text: JSON.stringify({ success: true, pdfUrl: firstPdfUrl }) },
        ],
      };
    } catch (err: any) {
      console.error('pdfGenerator_tool error', err);
      return {
        content: [
          { type: "text", text: JSON.stringify({ success: false, error: err?.message ?? String(err) }) },
        ],
      };
    }
  }
);
