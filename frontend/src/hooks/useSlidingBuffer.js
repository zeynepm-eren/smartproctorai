/**
 * SmartProctor - Sliding Buffer Hook
 * ===================================
 * 
 * Son 5 saniyelik video kaydını tutar ve ihlal anında
 * bu kaydı kanıt olarak backend'e gönderir.
 * 
 * Kullanım:
 * const { startRecording, stopRecording, captureEvidence } = useSlidingBuffer({
 *   videoRef,
 *   bufferDuration: 5
 * });
 */

import { useRef, useCallback, useState, useEffect } from 'react';
import { uploadEvidence } from '../services/violationApi';

const DEFAULT_BUFFER_DURATION = 5; // saniye
const CHUNK_INTERVAL = 1000; // ms (her saniye chunk al)

export function useSlidingBuffer({ 
  videoRef, 
  bufferDuration = DEFAULT_BUFFER_DURATION 
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [bufferSize, setBufferSize] = useState(0);
  
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  
  // Kaydı başlat
  const startRecording = useCallback(async () => {
    if (isRecording) return;
    
    try {
      // Video elementinden stream al veya yeni stream oluştur
      let stream = videoRef?.current?.srcObject;
      
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false,
        });
        
        if (videoRef?.current) {
          videoRef.current.srcObject = stream;
        }
      }
      
      streamRef.current = stream;
      
      // MediaRecorder oluştur
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 1000000, // 1 Mbps
      });
      
      chunksRef.current = [];
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push({
            data: event.data,
            timestamp: Date.now(),
          });
          
          // Eski chunk'ları temizle (buffer süresi dışındakileri)
          const cutoff = Date.now() - (bufferDuration * 1000);
          chunksRef.current = chunksRef.current.filter(
            (chunk) => chunk.timestamp > cutoff
          );
          
          setBufferSize(chunksRef.current.length);
        }
      };
      
      // Her saniye chunk al
      mediaRecorderRef.current.start(CHUNK_INTERVAL);
      setIsRecording(true);
      
      console.log('[SlidingBuffer] Kayıt başladı');
    } catch (err) {
      console.error('[SlidingBuffer] Kayıt başlatılamadı:', err);
    }
  }, [isRecording, videoRef, bufferDuration]);
  
  // Kaydı durdur
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      chunksRef.current = [];
      setBufferSize(0);
      console.log('[SlidingBuffer] Kayıt durduruldu');
    }
  }, [isRecording]);
  
  // Kanıt yakala ve yükle
  const captureEvidence = useCallback(async (violationId) => {
    if (chunksRef.current.length === 0) {
      console.warn('[SlidingBuffer] Buffer boş, kanıt yok');
      return null;
    }
    
    try {
      // Chunk'ları birleştir
      const blobParts = chunksRef.current.map((chunk) => chunk.data);
      const evidenceBlob = new Blob(blobParts, { type: 'video/webm' });
      
      console.log(`[SlidingBuffer] Kanıt oluşturuldu: ${(evidenceBlob.size / 1024).toFixed(1)} KB`);
      
      // Backend'e yükle
      if (violationId) {
        const result = await uploadEvidence(violationId, evidenceBlob);
        console.log('[SlidingBuffer] Kanıt yüklendi:', result.video_path);
        return result.video_path;
      }
      
      return evidenceBlob;
    } catch (err) {
      console.error('[SlidingBuffer] Kanıt yakalanamadı:', err);
      return null;
    }
  }, []);
  
  // Buffer'ın mevcut Blob'ını al (yüklemeden)
  const getBufferBlob = useCallback(() => {
    if (chunksRef.current.length === 0) return null;
    
    const blobParts = chunksRef.current.map((chunk) => chunk.data);
    return new Blob(blobParts, { type: 'video/webm' });
  }, []);
  
  // Cleanup
  useEffect(() => {
    return () => {
      stopRecording();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [stopRecording]);
  
  return {
    isRecording,
    bufferSize,
    startRecording,
    stopRecording,
    captureEvidence,
    getBufferBlob,
  };
}

export default useSlidingBuffer;
