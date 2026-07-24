"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import FileUpload from "@/components/FileUpload";
import logger from "@/lib/logger"; // ✅ structured logger

interface UploadedFile {
  id: string;
  filename: string;
  url: string;
  size: number;
  isPublic: boolean;
  createdAt: string;
}

export default function UploadPage() {
  const sessionData = useSession();
  const session = sessionData?.data;
  const status = sessionData?.status || "loading";
  const router = useRouter();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingUrl, setLoadingUrl] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      logger.warn("User unauthenticated — redirecting to /signin");
      router.push("/signin");
    }
  }, [status, router]);

  useEffect(() => {
    if (session) {
      fetchFiles();
    }
  }, [session]);

  const fetchFiles = async () => {
    try {
      logger.info("Fetching uploaded files...");
      const response = await fetch("/api/upload");
      const data = await response.json();
      setFiles(data.files || []);
      logger.info({ count: data.files?.length || 0 }, "Fetched user files");
    } catch (error) {
      logger.error({ err: error }, "Error fetching files");
    } finally {
      setLoading(false);
    }
  };

  const handleViewFile = async (file: UploadedFile) => {
    if (file.isPublic) {
      logger.info({ fileId: file.id, type: "public" }, "Opening public file");
      window.open(file.url, "_blank");
      return;
    }

    setLoadingUrl(file.id);
    try {
      logger.info({ fileId: file.id }, "Fetching signed URL for private file");
      const response = await fetch(`/api/files/${file.id}`);
      const data = await response.json();

      if (response.ok) {
        logger.info({ fileId: file.id }, "Signed URL generated");
        window.open(data.url, "_blank");
      } else {
        logger.warn({ fileId: file.id, error: data.error }, "Failed to get signed URL");
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      logger.error({ err: error, fileId: file.id }, "Error getting file URL");
      alert("Failed to generate file URL");
    } finally {
      setLoadingUrl(null);
    }
  };

  if (status === "loading" || loading) {
    logger.debug("Loading upload page...");
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-600 dark:text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!session) {
    logger.warn("No session found, returning null");
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
          File Upload
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Upload files as public (anyone can access) or private (15 min auth)
        </p>

        <FileUpload onUploadSuccess={fetchFiles} />

        <div className="mt-12">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Your Uploaded Files
          </h2>

          {files.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-400">
              No files uploaded yet.
            </p>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Filename
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Size
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Uploaded
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {files.map((file) => (
                    <tr key={file.id}>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-300">
                        <div className="flex items-center gap-2">
                          {file.isPublic ? "🌍" : "🔒"}
                          <span className="truncate max-w-xs">{file.filename}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            file.isPublic
                              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                              : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                          }`}
                        >
                          {file.isPublic ? "Public" : "Private"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {(file.size / 1024).toFixed(2)} KB
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {new Date(file.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => handleViewFile(file)}
                          disabled={loadingUrl === file.id}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 disabled:opacity-50"
                        >
                          {loadingUrl === file.id ? "Loading..." : "View"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-8">
          <a
            href="/"
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400"
          >
            ← Back to Home
          </a>
        </div>
      </div>
    </div>
  );
}
