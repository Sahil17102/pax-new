import axios from "axios";
import axiosInstance from "./axiosInstance";

export interface UploadedFileInfo {
  url: string;
  key: string;
  originalName: string;
  size: number;
  mime: string;
}

export const uploadFileToStorage = async (
  file: File,
  folder?: string,
  onProgress?: (progress: number) => void
): Promise<UploadedFileInfo> => {
  const contentType = file.type || "application/octet-stream";

  const { data } = await axiosInstance.post("/uploads/presign", {
    contentType,
    filename: file.name,
    folder,
  });

  await axios.put(data.uploadUrl, file, {
    withCredentials: false,
    headers: { "Content-Type": contentType },
    onUploadProgress: (event) => {
      if (event.total && onProgress) {
        onProgress(Math.round((event.loaded * 100) / event.total));
      }
    },
  });

  return {
    url: data.publicUrl || data.url,
    key: data.key,
    originalName: file.name,
    size: file.size,
    mime: contentType,
  };
};

export const uploadKycPdfToBackend = async (
  file: File,
  onProgress?: (progress: number) => void,
): Promise<UploadedFileInfo> => {
  return uploadFileToBackend(file, 'kyc', onProgress)
}

export const uploadFileToBackend = async (
  file: File,
  folder: string,
  onProgress?: (progress: number) => void,
): Promise<UploadedFileInfo> => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('folder', folder)

  const { data } = await axiosInstance.post('/uploads/file', formData, {
    onUploadProgress: (event) => {
      if (event.total && onProgress) {
        onProgress(Math.round((event.loaded * 100) / event.total))
      }
    },
  })

  return {
    url: data.url,
    key: data.key,
    originalName: data.originalName || file.name,
    size: data.size || file.size,
    mime: data.mime || file.type || 'application/octet-stream',
  }
}

export const getPresignedDownloadUrls = async (
  keys: string | string[]
): Promise<string | Array<string | null>> => {
  const response = await axiosInstance.post("/uploads/presign-download-url", {
    keys,
  });

  if (Array.isArray(keys)) {
    return (response.data.urls || []) as Array<string | null>;
  } else {
    return response.data.url as string;
  }
};
