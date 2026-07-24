'use server';

import fs from 'fs';
import path from 'path';

export async function getLatestImageFromFolder(): Promise<string | null> {
  try {
    const outputDir = path.join(process.cwd(), 'public', 'output');
    
    console.log('Reading folder:', outputDir);
    
    // Check if directory exists
    if (!fs.existsSync(outputDir)) {
      console.log('Directory does not exist:', outputDir);
      return null;
    }

    // Read all files from the output directory
    const files = fs.readdirSync(outputDir);
    console.log('All files:', files);
    const EXTS = ['.png', '.svg', '.jpg', '.jpeg'];
    // Filter for image files
    const imageFiles = files.filter(file => EXTS.some(ext => file.endsWith(ext)));
    console.log('Image files:', imageFiles);

    if (imageFiles.length === 0) {
      console.log('No image files found');
      return null;
    }

    // Sort by timestamp in filename (e.g., chart_1763373069082.png)
    const sortedFiles = imageFiles.sort((a, b) => {
      const extractTimestamp = (filename: string) => {
        // Look for chart_<timestamp>.png or just numeric timestamp
        const match = filename.match(/chart_(\d+)\.png/) || filename.match(/(\d{13})/) || filename.match(/(\d{8}_\d{6})/);
        return match ? parseInt(match[1]) : 0;
      };
      return extractTimestamp(b) - extractTimestamp(a);
    });

    const latestFile = sortedFiles[0];
    const imagePath = `/output/${latestFile}`;
    
    console.log('Latest file found:', latestFile, 'Path:', imagePath);
    return imagePath;
  } catch (error) {
    console.error('Error reading output folder:', error);
    return null;
  }
}
