/**
 * SmartProctor - Heartbeat Hook
 * ==============================
 * 
 * Öğrenci bağlantısını takip etmek için her 30 saniyede bir
 * backend'e heartbeat sinyali gönderir.
 * 
 * Kullanım:
 * const { isConnected, lastHeartbeat } = useHeartbeat({ sessionId, enabled: true });
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { sendHeartbeat } from '../services/violationApi';

const HEARTBEAT_INTERVAL = 30000; // 30 saniye
const MAX_RETRIES = 3;

export function useHeartbeat({ sessionId, enabled = true, onConnectionLost }) {
  const [isConnected, setIsConnected] = useState(true);
  const [lastHeartbeat, setLastHeartbeat] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  
  const intervalRef = useRef(null);
  const mountedRef = useRef(true);
  
  // Heartbeat gönder
  const sendPing = useCallback(async () => {
    if (!enabled || !sessionId) return;
    
    try {
      const response = await sendHeartbeat(sessionId);
      
      if (mountedRef.current) {
        setIsConnected(true);
        setLastHeartbeat(new Date());
        setRetryCount(0);
      }
      
      return response;
    } catch (err) {
      console.error('[Heartbeat] Gönderilemedi:', err);
      
      if (mountedRef.current) {
        setRetryCount((prev) => {
          const newCount = prev + 1;
          
          // Maksimum deneme aşıldıysa bağlantı koptu
          if (newCount >= MAX_RETRIES) {
            setIsConnected(false);
            if (onConnectionLost) {
              onConnectionLost();
            }
          }
          
          return newCount;
        });
      }
      
      throw err;
    }
  }, [sessionId, enabled, onConnectionLost]);
  
  // İlk heartbeat ve interval başlat
  useEffect(() => {
    mountedRef.current = true;
    
    if (!enabled || !sessionId) {
      return;
    }
    
    // İlk heartbeat'i hemen gönder
    sendPing();
    
    // Periyodik heartbeat başlat
    intervalRef.current = setInterval(() => {
      sendPing();
    }, HEARTBEAT_INTERVAL);
    
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [sessionId, enabled, sendPing]);
  
  // Manuel heartbeat tetikleme
  const forceHeartbeat = useCallback(() => {
    return sendPing();
  }, [sendPing]);
  
  return {
    isConnected,
    lastHeartbeat,
    retryCount,
    forceHeartbeat,
  };
}

export default useHeartbeat;
