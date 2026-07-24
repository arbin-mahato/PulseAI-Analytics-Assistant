"use client";

import { useState } from "react";
import logger from "../lib/logger";

export default function FileUpload({ onUploadSuccess }: { onUploadSuccess?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(true);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      setError(null);
      setUploadedUrl(null);

      logger.info(
        { filename: selected.name, size: selected.size },
        "File selected for upload"
      );
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a file first");
      logger.warn("Upload attempted with no file selected");
      return;
    }

    setUploading(true);
    setError(null);
    logger.info({ filename: file.name, isPublic }, "Starting file upload");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("isPublic", isPublic.toString());

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload failed");
      }

      setUploadedUrl(data.file.url);
      setFile(null);

      // Reset file input
      const fileInput = document.getElementById("file-input") as HTMLInputElement;
      if (fileInput) fileInput.value = "";

      if (onUploadSuccess) onUploadSuccess();

      logger.info(
        { uploadedUrl: data.file.url, visibility: isPublic ? "public" : "private" },
        "File uploaded successfully"
      );
    } catch (err: any) {
      setError(err.message);
      logger.error({ err, filename: file?.name }, "File upload failed");
    } finally {
      setUploading(false);
      logger.debug("Upload process completed");
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
        Upload File
      </h2>

      <div className="space-y-4">
        {/* Visibility Selection */}
        <div className="flex items-center space-x-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-md">
          <label className="flex items-center cursor-pointer">
            <input
              type="radio"
              name="visibility"
              checked={isPublic}
              onChange={() => setIsPublic(true)}
              className="w-4 h-4 text-blue-600 focus:ring-blue-500"
            />
            <span className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">
              🌍 Public
              <span className="block text-xs text-gray-500 dark:text-gray-400">
                Anyone can access
              </span>
            </span>
          </label>

          <label className="flex items-center cursor-pointer">
            <input
              type="radio"
              name="visibility"
              checked={!isPublic}
              onChange={() => setIsPublic(false)}
              className="w-4 h-4 text-blue-600 focus:ring-blue-500"
            />
            <span className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">
              🔒 Private
              <span className="block text-xs text-gray-500 dark:text-gray-400">
                Requires auth (15 min)
              </span>
            </span>
          </label>
        </div>

        <div>
          <label
            htmlFor="file-input"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Choose a file
          </label>
          <input
            id="file-input"
            type="file"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-900 dark:text-gray-300 
                     border border-gray-300 dark:border-gray-600 rounded-lg 
                     cursor-pointer bg-gray-50 dark:bg-gray-700 
                     focus:outline-none"
          />
        </div>

        {file && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p>Selected: {file.name}</p>
            <p>Size: {(file.size / 1024).toFixed(2)} KB</p>
            <p className="flex items-center gap-2 mt-1">
              {isPublic ? "🌍 Public" : "🔒 Private"}
            </p>
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-md 
                   hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed
                   transition-colors"
        >
          {uploading ? "Uploading..." : "Upload"}
        </button>

        {error && (
          <div className="p-3 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 rounded-md">
            {error}
          </div>
        )}

        {uploadedUrl && (
          <div className="p-3 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200 rounded-md">
            <p className="font-semibold mb-2">Upload successful!</p>
            {isPublic ? (
              <a
                href={uploadedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm underline break-all"
              >
                {uploadedUrl}
              </a>
            ) : (
              <p className="text-sm">View in your files list below</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
