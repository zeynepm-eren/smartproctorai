/**
 * SmartProctor - Geliştirilmiş useProctoring Hook
 * ================================================
 * 
 * Tüm güvenlik özelliklerini tek hook'ta birleştirir:
 * - Kamera yönetimi
 * - Yüz tespiti (NO_FACE, MULTIPLE_FACES)
 * - Baş yönü analizi (HEAD_TURN)
 * - Video kanıt kaydı (Sliding Buffer)
 * - Heartbeat (bağlantı takibi)
 * 
 * Kullanım:
 * const { videoRef, isReady, violations, faceStatus, headPose } = useProctoring(sessionId, enabled)
 */

import { useRef, useState, useEffect, useCallback } from 'react'
import { violationAPI } from '../services/api'

// ==================== KONFIGÜRASYON ====================
const CONFIG = {
  // Yüz tespiti
  HEAD_TURN_THRESHOLD: 30,        // derece
  DETECTION_INTERVAL: 500,        // ms (saniyede 2 frame)
  VIOLATION_COOLDOWN: 5000,       // ms (aynı tip ihlal için bekleme)
  
  // Heartbeat
  HEARTBEAT_INTERVAL: 30000,      // 30 saniye
  
  // Video buffer
  BUFFER_DURATION: 5,             // saniye
  CHUNK_INTERVAL: 1000,           // ms
  
  // MediaPipe CDN
  FACE_DETECTION_CDN: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_detection@0.4',
  FACE_MESH_CDN: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4',
}

// Face Mesh landmark indeksleri
const LANDMARKS = {
  NOSE_TIP: 1,
  LEFT_EYE_OUTER: 33,
  RIGHT_EYE_OUTER: 263,
  LEFT_EAR: 234,
  RIGHT_EAR: 454,
}

// ==================== HOOK ====================
export function useProctoring(sessionId, enabled = true) {
  const videoRef = useRef(null)
  
  // State
  const [isReady, setIsReady] = useState(false)
  const [violations, setViolations] = useState([])
  const [faceStatus, setFaceStatus] = useState('unknown') // 'ok', 'no_face', 'multiple_faces'
  const [faceCount, setFaceCount] = useState(0)
  const [headPose, setHeadPose] = useState({ yaw: 0, pitch: 0, isLooking: true })
  const [isConnected, setIsConnected] = useState(true)
  
  // Refs
  const streamRef = useRef(null)
  const faceDetectorRef = useRef(null)
  const faceMeshRef = useRef(null)
  const detectionIntervalRef = useRef(null)
  const heartbeatIntervalRef = useRef(null)
  const lastViolationRef = useRef({})
  const mediaRecorderRef = useRef(null)
  const videoChunksRef = useRef([])
  const mediaPipeLoadedRef = useRef(false)
  
  // ==================== İHLAL KAYIT ====================
  const recordViolation = useCallback(async (type, metadata = {}) => {
    if (!sessionId || !enabled) return
    
    const now = Date.now()
    const lastTime = lastViolationRef.current[type] || 0
    
    // Cooldown kontrolü
    if (now - lastTime < CONFIG.VIOLATION_COOLDOWN) {
      console.log(`[Proctoring] ${type} cooldown, atlandı`)
      return
    }
    
    lastViolationRef.current[type] = now
    
    const violation = {
      type,
      timestamp: new Date().toISOString(),
      ...metadata,
    }
    
    setViolations(prev => [...prev, violation])
    
    // Backend'e gönder
    try {
      const res = await violationAPI.log({
        session_id: sessionId,
        violation_type: type,
        confidence: metadata.confidence || 1.0,
        metadata: metadata,
      })
      
      // Kanıt yükle
      if (res.data?.id && videoChunksRef.current.length > 0) {
        await captureEvidence(res.data.id)
      }
    } catch (err) {
      console.error('[Proctoring] İhlal kaydedilemedi:', err)
    }
  }, [sessionId, enabled])
  
  // ==================== KAMERA ====================
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false,
      })
      
      streamRef.current = stream
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      
      // Video kaydını başlat (sliding buffer)
      startVideoRecording(stream)
      
      return true
    } catch (err) {
      console.error('[Proctoring] Kamera başlatılamadı:', err)
      return false
    }
  }, [])
  
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
    }
  }, [])
  
  // ==================== VİDEO KAYIT (SLIDING BUFFER) ====================
  const startVideoRecording = useCallback((stream) => {
    try {
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm'
      
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 500000,
      })
      
      videoChunksRef.current = []
      
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          videoChunksRef.current.push({
            data: event.data,
            timestamp: Date.now(),
          })
          
          // Eski chunk'ları temizle
          const cutoff = Date.now() - (CONFIG.BUFFER_DURATION * 1000)
          videoChunksRef.current = videoChunksRef.current.filter(
            chunk => chunk.timestamp > cutoff
          )
        }
      }
      
      recorder.start(CONFIG.CHUNK_INTERVAL)
      mediaRecorderRef.current = recorder
    } catch (err) {
      console.error('[Proctoring] Video kayıt başlatılamadı:', err)
    }
  }, [])
  
  const captureEvidence = useCallback(async (violationId) => {
    if (videoChunksRef.current.length === 0) return null
    
    try {
      const blobParts = videoChunksRef.current.map(chunk => chunk.data)
      const evidenceBlob = new Blob(blobParts, { type: 'video/webm' })
      
      await violationAPI.uploadEvidence(violationId, evidenceBlob)
      console.log('[Proctoring] Kanıt yüklendi')
    } catch (err) {
      console.error('[Proctoring] Kanıt yüklenemedi:', err)
    }
  }, [])
  
  // ==================== HEARTBEAT ====================
  const startHeartbeat = useCallback(() => {
    if (!sessionId) return
    
    const sendHeartbeat = async () => {
      try {
        await violationAPI.heartbeat(sessionId)
        setIsConnected(true)
      } catch (err) {
        console.error('[Proctoring] Heartbeat hatası:', err)
        setIsConnected(false)
      }
    }
    
    // İlk heartbeat
    sendHeartbeat()
    
    // Periyodik heartbeat
    heartbeatIntervalRef.current = setInterval(sendHeartbeat, CONFIG.HEARTBEAT_INTERVAL)
  }, [sessionId])
  
  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current)
      heartbeatIntervalRef.current = null
    }
  }, [])
  
  // ==================== MEDIAPIPE YÜKLEME ====================
  const loadMediaPipe = useCallback(async () => {
    if (mediaPipeLoadedRef.current) return true
    
    try {
      // Script yükle
      const loadScript = (src) => {
        return new Promise((resolve, reject) => {
          const existing = document.querySelector(`script[src="${src}"]`)
          if (existing) { resolve(); return }
          
          const script = document.createElement('script')
          script.src = src
          script.crossOrigin = 'anonymous'
          script.onload = resolve
          script.onerror = reject
          document.head.appendChild(script)
        })
      }
      
      await loadScript(`${CONFIG.FACE_DETECTION_CDN}/face_detection.js`)
      
      // Face Detection başlat
      if (window.FaceDetection) {
        faceDetectorRef.current = new window.FaceDetection({
          locateFile: (file) => `${CONFIG.FACE_DETECTION_CDN}/${file}`,
        })
        
        faceDetectorRef.current.setOptions({
          model: 'short',
          minDetectionConfidence: 0.5,
        })
        
        faceDetectorRef.current.onResults((results) => {
          const faces = results.detections || []
          processFaceResults(faces)
        })
        
        await faceDetectorRef.current.initialize()
      }
      
      mediaPipeLoadedRef.current = true
      console.log('[Proctoring] MediaPipe yüklendi')
      return true
    } catch (err) {
      console.error('[Proctoring] MediaPipe yüklenemedi:', err)
      // MediaPipe yüklenemezse de devam et (sadece kamera aktif olur)
      return false
    }
  }, [])
  
  // ==================== YÜZ TESPİTİ İŞLEME ====================
  const processFaceResults = useCallback((faces) => {
    setFaceCount(faces.length)
    
    if (faces.length === 0) {
      setFaceStatus('no_face')
      recordViolation('NO_FACE', { reason: 'Yüz tespit edilemedi' })
    } else if (faces.length > 1) {
      setFaceStatus('multiple_faces')
      recordViolation('MULTIPLE_FACES', { 
        reason: `${faces.length} yüz tespit edildi`,
        faceCount: faces.length 
      })
    } else {
      setFaceStatus('ok')
      
      // Baş yönü tahmini (basit bounding box analizi)
      const face = faces[0]
      if (face.boundingBox) {
        const box = face.boundingBox
        const centerX = box.xCenter
        
        // Ekranın ortasından sapma
        const deviation = (centerX - 0.5) * 100
        const yaw = deviation * 0.9 // Yaklaşık derece
        
        const isLookingAway = Math.abs(yaw) > CONFIG.HEAD_TURN_THRESHOLD
        
        setHeadPose({
          yaw: yaw,
          pitch: 0,
          isLooking: !isLookingAway,
        })
        
        if (isLookingAway) {
          recordViolation('HEAD_TURN', {
            reason: 'Baş çevirme tespit edildi',
            yaw: yaw.toFixed(1),
            threshold: CONFIG.HEAD_TURN_THRESHOLD,
          })
        }
      }
    }
  }, [recordViolation])
  
  // ==================== TESPİT DÖNGÜSÜ ====================
  const startDetection = useCallback(() => {
    if (!faceDetectorRef.current || !videoRef.current) return
    
    const detect = async () => {
      const video = videoRef.current
      if (!video || video.readyState < 2) return
      
      try {
        await faceDetectorRef.current.send({ image: video })
      } catch (err) {
        // Sessizce devam et
      }
    }
    
    detectionIntervalRef.current = setInterval(detect, CONFIG.DETECTION_INTERVAL)
  }, [])
  
  const stopDetection = useCallback(() => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current)
      detectionIntervalRef.current = null
    }
  }, [])
  
  // ==================== ANA BAŞLATMA ====================
  useEffect(() => {
    if (!enabled || !sessionId) return
    
    let mounted = true
    
    const init = async () => {
      // 1. Kamera başlat
      const cameraOk = await startCamera()
      if (!cameraOk || !mounted) return
      
      // 2. MediaPipe yükle
      await loadMediaPipe()
      
      // 3. Tespit başlat
      if (mounted && faceDetectorRef.current) {
        startDetection()
      }
      
      // 4. Heartbeat başlat
      startHeartbeat()
      
      if (mounted) {
        setIsReady(true)
      }
    }
    
    init()
    
    return () => {
      mounted = false
      stopDetection()
      stopHeartbeat()
      stopCamera()
      setIsReady(false)
    }
  }, [sessionId, enabled, startCamera, loadMediaPipe, startDetection, startHeartbeat, stopDetection, stopHeartbeat, stopCamera])
  
  return {
    videoRef,
    isReady,
    violations,
    faceStatus,
    faceCount,
    headPose,
    isConnected,
    violationCount: violations.length,
  }
}

export default useProctoring