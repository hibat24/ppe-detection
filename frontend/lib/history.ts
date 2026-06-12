import { DetectionHistoryItem } from '../types';

// Extend type definition locally or via casting if needed
export interface EnhancedHistoryItem extends DetectionHistoryItem {
  complianceScore?: number;
  alerts?: string[];
  status?: 'SECURE' | 'WARNING' | 'VIOLATION';
}

const STORAGE_KEY = 'ppe_detection_history';

export const historyService = {
  /**
   * Retrieves all safety logs from localStorage.
   */
  getHistory: (): EnhancedHistoryItem[] => {
    if (typeof window === 'undefined') return [];
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to load logs from localStorage', e);
      return [];
    }
  },

  /**
   * Appends a new safety inspection run to the local history database.
   */
  addHistoryItem: (item: {
    type: 'image' | 'video' | 'live';
    predictedClass: string;
    confidence: number;
    detectionsCount: number;
    fileName?: string;
    complianceScore: number;
    alerts: string[];
    status: 'SECURE' | 'WARNING' | 'VIOLATION';
  }): EnhancedHistoryItem => {
    const history = historyService.getHistory();
    
    const newItem: EnhancedHistoryItem = {
      id: `LOG-${Math.floor(100 + Math.random() * 900)}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + 
                 ' ' + new Date().toLocaleDateString([], { month: 'short', day: 'numeric' }),
      ...item,
    };

    const updatedHistory = [newItem, ...history].slice(0, 50); // Cap history at 50 logs to conserve storage
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedHistory));
    } catch (e) {
      console.error('Failed to save log to localStorage', e);
    }

    return newItem;
  },

  /**
   * Deletes a single log record by ID.
   */
  deleteItem: (id: string): EnhancedHistoryItem[] => {
    const history = historyService.getHistory();
    const updated = history.filter((item) => item.id !== id);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to update logs after deletion', e);
    }
    return updated;
  },

  /**
   * Resets and clears all stored history logs.
   */
  clearHistory: (): void => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.error('Failed to clear logs from localStorage', e);
    }
  },
};
export default historyService;
