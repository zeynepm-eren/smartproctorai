/**
 * SmartProctor - MediaPipe Face Detection Hook
 * =============================================
 * 
 * Özellikler:
 * - Yüz tespiti (NO_FACE, MULTIPLE_FACES)
 * - Baş yönü analizi (HEAD_TURN)
 * - Face Mesh ile landmark tabanlı yaw/pitch hesabı
 * 
 * Kullanım:
 * const { faceStatus, headPose, startDetection, stopDetection } = useFaceDetection({
 *   videoRef,
 *   sessionId,
 *   enabled: true,
 *   onViolation: (type, meta) => {}
 * });
 */

import { useEffect, useRef, useState, useCallback } from 'react';

// MediaPipe CDN URL'leri
const FACE_DETECTION_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_detection';
const FACE_MESH_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh';
const CAMERA_UTILS_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils';

// Eşik değerleri
const HEAD_TURN_THRESHOLD = 30; // derece
const DETECTION_INTERVAL = 500; // ms (saniyede 2 frame)
const VIOLATION_COOLDOWN = 3000; // ms

// Face Mesh landmark indeksleri (baş yönü hesabı için)
const NOSE_TIP = 1;
const NOSE_BOTTOM = 2;
const LEFT_EYE_OUTER = 33;
const RIGHT_EYE_OUTER = 263;
const LEFT_EAR = 234;
const RIGHT_EAR = 454;

export function useFaceDetection({ 
  videoRef, 
  sessionId, 
  enabled = true,
  onViolation 
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [faceStatus, setFaceStatus] = useState('unknown'); // 'ok', 'no_face', 'multiple_faces'
  const [headPose, setHeadPose] = useState({ yaw: 0, pitch: 0, isLooking: true });
  const [faceCount, setFaceCount] = useState(0);
  
  const faceDetectorRef = useRef(null);
  const faceMeshRef = useRef(null);
  const animationRef = useRef(null);
  const lastViolationRef = useRef({});
  const lastDetectionRef = useRef(0);
  
  // İhlal kaydet (cooldown ile)
  const recordViolation = useCallback((type, metadata) => {
    const now = Date.now();
    const lastTime = lastViolationRef.current[type] || 0;
    
    if (now - lastTime < VIOLATION_COOLDOWN) {
      return; // Cooldown süresi dolmadı
    }
    
    lastViolationRef.current[type] = now;
    
    if (onViolation) {
      onViolation(type, metadata);
    }
  }, [onViolation]);
  
  // Baş yönünü landmark'lardan hesapla
  const calculateHeadPose = useCallback((landmarks) => {
    if (!landmarks || landmarks.length < 468) {
      return { yaw: 0, pitch: 0, roll: 0 };
    }
    
    // Kilit noktaları al
    const noseTip = landmarks[NOSE_TIP];
    const noseBottom = landmarks[NOSE_BOTTOM];
    const leftEyeOuter = landmarks[LEFT_EYE_OUTER];
    const rightEyeOuter = landmarks[RIGHT_EYE_OUTER];
    const leftEar = landmarks[LEFT_EAR];
    const rightEar = landmarks[RIGHT_EAR];
    
    // Yaw (sağa-sola bakış) hesabı
    // Burun ile kulaklar arasındaki mesafe oranı
    const leftDist = Math.hypot(noseTip.x - leftEar.x, noseTip.y - leftEar.y);
    const rightDist = Math.hypot(noseTip.x - rightEar.x, noseTip.y - rightEar.y);
    const yawRatio = (leftDist - rightDist) / (leftDist + rightDist);
    const yaw = yawRatio * 90; // Yaklaşık derece
    
    // Pitch (yukarı-aşağı bakış) hesabı
    // Burun ucu ile göz hizası arasındaki fark
    const eyeLevel = (leftEyeOuter.y + rightEyeOuter.y) / 2;
    const noseLevel = noseTip.y;
    const pitchRatio = (noseLevel - eyeLevel) / 0.1; // Normalize
    const pitch = pitchRatio * 30; // Yaklaşık derece
    
    // Roll (kafa eğimi) hesabı
    const eyeDiff = rightEyeOuter.y - leftEyeOuter.y;
    const eyeDist = rightEyeOuter.x - leftEyeOuter.x;
    const roll = Math.atan2(eyeDiff, eyeDist) * (180 / Math.PI);
    
    return { yaw, pitch, roll };
  }, []);
  
  // MediaPipe yükle
  const loadMediaPipe = useCallback(async () => {
    if (isLoaded) return;
    
    try {
      // Dinamik import (script injection)
      const loadScript = (src) => {
        return new Promise((resolve, reject) => {
          const existing = document.querySelector(`script[src="${src}"]`);
          if (existing) {
            resolve();
            return;
          }
          
          const script = document.createElement('script');
          script.src = src;
          script.crossOrigin = 'anonymous';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      };
      
      // MediaPipe kütüphanelerini yükle
      await loadScript(`${FACE_DETECTION_CDN}/face_detection.js`);
      await loadScript(`${FACE_MESH_CDN}/face_mesh.js`);
      
      // Face Detection başlat
      if (window.FaceDetection) {
        faceDetectorRef.current = new window.FaceDetection({
          locateFile: (file) => `${FACE_DETECTION_CDN}/${file}`,
        });
        
        await faceDetectorRef.current.initialize();
        faceDetectorRef.current.setOptions({
          model: 'short',
          minDetectionConfidence: 0.5,
        });
      }
      
      // Face Mesh başlat (baş yönü için)
      if (window.FaceMesh) {
        faceMeshRef.current = new window.FaceMesh({
          locateFile: (file) => `${FACE_MESH_CDN}/${file}`,
        });
        
        await faceMeshRef.current.initialize();
        faceMeshRef.current.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      }
      
      setIsLoaded(true);
      console.log('[FaceDetection] MediaPipe yüklendi');
    } catch (err) {
      console.error('[FaceDetection] MediaPipe yüklenemedi:', err);
    }
  }, [isLoaded]);
  
  // Frame işle
  const processFrame = useCallback(async () => {
    if (!isRunning || !videoRef?.current) {
      return;
    }
    
    const video = videoRef.current;
    
    // Video hazır mı?
    if (video.readyState < 2) {
      animationRef.current = requestAnimationFrame(processFrame);
      return;
    }
    
    // Throttle (çok sık işleme)
    const now = Date.now();
    if (now - lastDetectionRef.current < DETECTION_INTERVAL) {
      animationRef.current = requestAnimationFrame(processFrame);
      return;
    }
    lastDetectionRef.current = now;
    
    try {
      // 1. Face Detection - yüz sayısı
      if (faceDetectorRef.current) {
        const detections = await faceDetectorRef.current.send({ image: video });
        const faces = detections?.detections || [];
        
        setFaceCount(faces.length);
        
        if (faces.length === 0) {
          setFaceStatus('no_face');
          recordViolation('NO_FACE', {
            reason: 'Yüz tespit edilemedi',
            timestamp: new Date().toISOString(),
          });
        } else if (faces.length > 1) {
          setFaceStatus('multiple_faces');
          recordViolation('MULTIPLE_FACES', {
            reason: `${faces.length} yüz tespit edildi`,
            faceCount: faces.length,
            timestamp: new Date().toISOString(),
          });
        } else {
          setFaceStatus('ok');
        }
      }
      
      // 2. Face Mesh - baş yönü (sadece 1 yüz varsa)
      if (faceMeshRef.current && faceCount === 1) {
        const meshResult = await faceMeshRef.current.send({ image: video });
        const faceLandmarks = meshResult?.multiFaceLandmarks?.[0];
        
        if (faceLandmarks) {
          const pose = calculateHeadPose(faceLandmarks);
          
          const isLookingAway = 
            Math.abs(pose.yaw) > HEAD_TURN_THRESHOLD ||
            Math.abs(pose.pitch) > HEAD_TURN_THRESHOLD;
          
          setHeadPose({
            yaw: pose.yaw,
            pitch: pose.pitch,
            roll: pose.roll,
            isLooking: !isLookingAway,
          });
          
          if (isLookingAway) {
            recordViolation('HEAD_TURN', {
              reason: 'Baş çevirme tespit edildi',
              yaw: pose.yaw.toFixed(1),
              pitch: pose.pitch.toFixed(1),
              threshold: HEAD_TURN_THRESHOLD,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }
    } catch (err) {
      console.error('[FaceDetection] Frame işleme hatası:', err);
    }
    
    // Sonraki frame
    animationRef.current = requestAnimationFrame(processFrame);
  }, [isRunning, videoRef, faceCount, calculateHeadPose, recordViolation]);
  
  // Tespiti başlat
  const startDetection = useCallback(async () => {
    if (!enabled) return;
    
    await loadMediaPipe();
    setIsRunning(true);
  }, [enabled, loadMediaPipe]);
  
  // Tespiti durdur
  const stopDetection = useCallback(() => {
    setIsRunning(false);
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }, []);
  
  // İşleme döngüsünü başlat
  useEffect(() => {
    if (isRunning && isLoaded) {
      processFrame();
    }
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isRunning, isLoaded, processFrame]);
  
  // Cleanup
  useEffect(() => {
    return () => {
      stopDetection();
      faceDetectorRef.current = null;
      faceMeshRef.current = null;
    };
  }, [stopDetection]);
  
  return {
    isLoaded,
    isRunning,
    faceStatus,
    faceCount,
    headPose,
    startDetection,
    stopDetection,
  };
}

export default useFaceDetection;
