export interface HealthResponse {
  status: string;
  model_loaded: boolean;
}

export interface ClassesResponse {
  classes: string[];
}

export interface ModelInfoResponse {
  model_name: string;
  model_type: string;
  num_classes: number;
  classes: string[];
}

export interface DetectionItem {
  class_name: string;
  confidence: number;
  box: number[]; // [xmin, ymin, xmax, ymax]
}

export interface PredictionResponse {
  predicted_class: string;
  confidence: number;
  all_probabilities: Record<string, number>;
  detections: DetectionItem[];
  annotated_image?: string;
}

export interface FramePrediction {
  frame_index: number;
  predicted_class: string;
  confidence: number;
  detections: DetectionItem[];
}

export interface VideoPredictionResponse {
  predicted_class: string;
  confidence: number;
  frames_processed: number;
  frame_predictions: FramePrediction[];
}

export interface LivePredictionResponse {
  predicted_class: string;
  confidence: number;
  detections: DetectionItem[];
  error?: string;
}

export interface DetectionHistoryItem {
  id: string;
  timestamp: string;
  type: 'image' | 'video' | 'live';
  predictedClass: string;
  confidence: number;
  detectionsCount: number;
  fileName?: string;
  complianceScore?: number;
  alerts?: string[];
  status?: 'SECURE' | 'WARNING' | 'VIOLATION';
}
