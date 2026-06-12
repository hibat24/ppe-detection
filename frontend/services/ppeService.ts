import api from '../lib/api';
import {
  HealthResponse,
  ClassesResponse,
  ModelInfoResponse,
  PredictionResponse,
  VideoPredictionResponse,
} from '../types';

export const ppeService = {
  /**
   * Performs system health check on backend.
   */
  getHealth: async (): Promise<HealthResponse> => {
    const response = await api.get<HealthResponse>('/health');
    return response.data;
  },

  /**
   * Retrieves active model inference labels.
   */
  getClasses: async (): Promise<ClassesResponse> => {
    const response = await api.get<ClassesResponse>('/classes');
    return response.data;
  },

  /**
   * Dynamic lookup of model type, class count, and weight configurations.
   */
  getModelInfo: async (): Promise<ModelInfoResponse> => {
    const response = await api.get<ModelInfoResponse>('/model-info');
    return response.data;
  },

  /**
   * Performs object detection inference on a single static image.
   * Supports upload progress tracking.
   */
  predictImage: async (
    file: File,
    onUploadProgress?: (progress: number) => void
  ): Promise<PredictionResponse> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post<PredictionResponse>('/predict/image', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onUploadProgress && progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onUploadProgress(percentCompleted);
        }
      },
    });
    return response.data;
  },

  /**
   * Uploads and samples an MP4/AVI video for temporal PPE checking.
   * Supports upload progress tracking.
   */
  predictVideo: async (
    file: File,
    onUploadProgress?: (progress: number) => void
  ): Promise<VideoPredictionResponse> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post<VideoPredictionResponse>('/predict/video', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onUploadProgress && progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onUploadProgress(percentCompleted);
        }
      },
    });
    return response.data;
  },
};
