/**
 * SmartProctor - Geliştirilmiş Anti-Cheat Hook
 * ============================================
 * 
 * Engellenen davranışlar:
 * 1. Tab değiştirme (visibilitychange)
 * 2. Tam ekrandan çıkış (fullscreenchange)
 * 3. Sağ tık (contextmenu)
 * 4. DevTools (keydown F12, Ctrl+Shift+I/J/C)
 * 5. Kopyala/Yapıştır/Kes (copy, paste, cut) - YENİ
 * 6. Klavye Kısayolları (Ctrl+A, Ctrl+S, Ctrl+P, Alt+Tab, vb.) - YENİ
 * 
 * Kullanım:
 * const { violations, isActive } = useAntiCheat({ sessionId, enabled: true });
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { logViolation } from '../services/violationApi';

// İhlal tipleri enum
const ViolationType = {
  TAB_SWITCH: 'TAB_SWITCH',
  FULLSCREEN_EXIT: 'FULLSCREEN_EXIT',
  RIGHT_CLICK: 'RIGHT_CLICK',
  DEVTOOLS: 'DEVTOOLS',
  COPY_PASTE: 'COPY_PASTE',
  KEYBOARD_SHORTCUT: 'KEYBOARD_SHORTCUT',
};

// Engellenen klavye kısayolları
const BLOCKED_SHORTCUTS = [
  // Kopyala/Yapıştır
  { key: 'c', ctrl: true, type: ViolationType.COPY_PASTE, desc: 'Ctrl+C' },
  { key: 'v', ctrl: true, type: ViolationType.COPY_PASTE, desc: 'Ctrl+V' },
  { key: 'x', ctrl: true, type: ViolationType.COPY_PASTE, desc: 'Ctrl+X' },
  
  // DevTools
  { key: 'F12', type: ViolationType.DEVTOOLS, desc: 'F12' },
  { key: 'i', ctrl: true, shift: true, type: ViolationType.DEVTOOLS, desc: 'Ctrl+Shift+I' },
  { key: 'j', ctrl: true, shift: true, type: ViolationType.DEVTOOLS, desc: 'Ctrl+Shift+J' },
  { key: 'c', ctrl: true, shift: true, type: ViolationType.DEVTOOLS, desc: 'Ctrl+Shift+C' },
  { key: 'u', ctrl: true, type: ViolationType.DEVTOOLS, desc: 'Ctrl+U (Kaynak Kodu)' },
  
  // Yazdırma / Kaydetme
  { key: 'p', ctrl: true, type: ViolationType.KEYBOARD_SHORTCUT, desc: 'Ctrl+P (Yazdır)' },
  { key: 's', ctrl: true, type: ViolationType.KEYBOARD_SHORTCUT, desc: 'Ctrl+S (Kaydet)' },
  
  // Seçim
  { key: 'a', ctrl: true, type: ViolationType.KEYBOARD_SHORTCUT, desc: 'Ctrl+A (Tümünü Seç)' },
  
  // Arama
  { key: 'f', ctrl: true, type: ViolationType.KEYBOARD_SHORTCUT, desc: 'Ctrl+F (Ara)' },
  { key: 'g', ctrl: true, type: ViolationType.KEYBOARD_SHORTCUT, desc: 'Ctrl+G (Sonraki)' },
  
  // Pencere / Tab değiştirme
  { key: 'Tab', alt: true, type: ViolationType.TAB_SWITCH, desc: 'Alt+Tab' },
  { key: 'Tab', ctrl: true, type: ViolationType.TAB_SWITCH, desc: 'Ctrl+Tab' },
  { key: 'w', ctrl: true, type: ViolationType.KEYBOARD_SHORTCUT, desc: 'Ctrl+W (Tab Kapat)' },
  { key: 't', ctrl: true, type: ViolationType.KEYBOARD_SHORTCUT, desc: 'Ctrl+T (Yeni Tab)' },
  { key: 'n', ctrl: true, type: ViolationType.KEYBOARD_SHORTCUT, desc: 'Ctrl+N (Yeni Pencere)' },
  
  // Escape
  { key: 'Escape', type: ViolationType.FULLSCREEN_EXIT, desc: 'Escape' },
];

export function useAntiCheat({ sessionId, enabled = true, onViolation }) {
  const [violations, setViolations] = useState([]);
  const [isActive, setIsActive] = useState(false);
  const lastViolationRef = useRef({});  // Her tip için son ihlal zamanı
  
  // İhlal kaydet (frontend tarafında 3 saniyelik debounce)
  const recordViolation = useCallback(async (type, metadata = {}) => {
    if (!enabled || !sessionId) return;
    
    const now = Date.now();
    const lastTime = lastViolationRef.current[type] || 0;
    
    // Frontend debounce: 3 saniye içinde aynı tip ihlal kaydetme
    if (now - lastTime < 3000) {
      console.log(`[AntiCheat] ${type} ihlali atlandı (debounce)`);
      return;
    }
    
    lastViolationRef.current[type] = now;
    
    const violation = {
      type,
      timestamp: new Date().toISOString(),
      ...metadata,
    };
    
    setViolations((prev) => [...prev, violation]);
    
    // Callback varsa çağır (UI bilgilendirme için)
    if (onViolation) {
      onViolation(violation);
    }
    
    // Backend'e gönder
    try {
      await logViolation({
        session_id: sessionId,
        violation_type: type,
        confidence: 1.0,
        metadata: metadata,
      });
    } catch (err) {
      console.error('[AntiCheat] İhlal kaydedilemedi:', err);
    }
  }, [sessionId, enabled, onViolation]);
  
  // Tab değiştirme (visibility change)
  useEffect(() => {
    if (!enabled) return;
    
    const handleVisibilityChange = () => {
      if (document.hidden) {
        recordViolation(ViolationType.TAB_SWITCH, {
          reason: 'Tab/Pencere değiştirildi',
        });
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [enabled, recordViolation]);
  
  // Tam ekrandan çıkış
  useEffect(() => {
    if (!enabled) return;
    
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isActive) {
        recordViolation(ViolationType.FULLSCREEN_EXIT, {
          reason: 'Tam ekrandan çıkıldı',
        });
      }
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [enabled, isActive, recordViolation]);
  
  // Sağ tık engelle
  useEffect(() => {
    if (!enabled) return;
    
    const handleContextMenu = (e) => {
      e.preventDefault();
      recordViolation(ViolationType.RIGHT_CLICK, {
        reason: 'Sağ tık denendi',
        x: e.clientX,
        y: e.clientY,
      });
      return false;
    };
    
    document.addEventListener('contextmenu', handleContextMenu);
    return () => document.removeEventListener('contextmenu', handleContextMenu);
  }, [enabled, recordViolation]);
  
  // Kopyala/Yapıştır/Kes engelle
  useEffect(() => {
    if (!enabled) return;
    
    const handleCopy = (e) => {
      e.preventDefault();
      recordViolation(ViolationType.COPY_PASTE, {
        reason: 'Kopyalama denendi',
        action: 'copy',
      });
    };
    
    const handlePaste = (e) => {
      e.preventDefault();
      recordViolation(ViolationType.COPY_PASTE, {
        reason: 'Yapıştırma denendi',
        action: 'paste',
      });
    };
    
    const handleCut = (e) => {
      e.preventDefault();
      recordViolation(ViolationType.COPY_PASTE, {
        reason: 'Kesme denendi',
        action: 'cut',
      });
    };
    
    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('cut', handleCut);
    
    return () => {
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('cut', handleCut);
    };
  }, [enabled, recordViolation]);
  
  // Klavye kısayolları engelle
  useEffect(() => {
    if (!enabled) return;
    
    const handleKeyDown = (e) => {
      // Engellenen kısayolları kontrol et
      for (const shortcut of BLOCKED_SHORTCUTS) {
        const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase() || e.key === shortcut.key;
        const ctrlMatch = !shortcut.ctrl || (e.ctrlKey || e.metaKey);  // Mac için metaKey
        const shiftMatch = !shortcut.shift || e.shiftKey;
        const altMatch = !shortcut.alt || e.altKey;
        
        if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
          e.preventDefault();
          e.stopPropagation();
          
          recordViolation(shortcut.type, {
            reason: `Engellenen kısayol: ${shortcut.desc}`,
            key: e.key,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            metaKey: e.metaKey,
          });
          
          return false;
        }
      }
    };
    
    // Capture phase'de yakala (öncelikli)
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [enabled, recordViolation]);
  
  // Text seçimi engelle
  useEffect(() => {
    if (!enabled) return;
    
    const handleSelectStart = (e) => {
      // Input ve textarea'larda seçime izin ver
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return true;
      }
      e.preventDefault();
      return false;
    };
    
    document.addEventListener('selectstart', handleSelectStart);
    return () => document.removeEventListener('selectstart', handleSelectStart);
  }, [enabled]);
  
  // Drag & Drop engelle
  useEffect(() => {
    if (!enabled) return;
    
    const handleDrag = (e) => {
      e.preventDefault();
      return false;
    };
    
    document.addEventListener('dragstart', handleDrag);
    return () => document.removeEventListener('dragstart', handleDrag);
  }, [enabled]);
  
  // Anti-cheat'i aktifleştir (tam ekrana geç)
  const activate = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen();
      setIsActive(true);
    } catch (err) {
      console.error('[AntiCheat] Tam ekran açılamadı:', err);
    }
  }, []);
  
  // Anti-cheat'i deaktifleştir
  const deactivate = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
    setIsActive(false);
  }, []);
  
  return {
    violations,
    isActive,
    activate,
    deactivate,
    violationCount: violations.length,
  };
}

export default useAntiCheat;
