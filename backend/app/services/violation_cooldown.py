"""
SmartProctor - İhlal Cooldown Servisi
Aynı oturum için aynı tip ihlalin 10 saniye içinde tekrar kaydedilmesini engeller.
"""

from datetime import datetime, timezone, timedelta
from typing import Dict, Tuple
import asyncio

# In-memory cooldown cache
# Key: (session_id, violation_type) -> Value: last_violation_time
_cooldown_cache: Dict[Tuple[int, str], datetime] = {}
_cache_lock = asyncio.Lock()

# Cooldown süresi (saniye)
COOLDOWN_SECONDS = 10


async def can_log_violation(session_id: int, violation_type: str) -> bool:
    """
    Belirtilen oturum ve ihlal tipi için cooldown kontrolü yapar.
    
    Returns:
        True: İhlal kaydedilebilir
        False: Cooldown süresi dolmadı, ihlal atlanmalı
    """
    cache_key = (session_id, violation_type)
    now = datetime.now(timezone.utc)
    
    async with _cache_lock:
        last_time = _cooldown_cache.get(cache_key)
        
        if last_time is not None:
            elapsed = (now - last_time).total_seconds()
            if elapsed < COOLDOWN_SECONDS:
                return False
        
        # Cooldown geçti veya ilk ihlal, zamanı güncelle
        _cooldown_cache[cache_key] = now
        return True


async def reset_cooldown(session_id: int, violation_type: str = None):
    """
    Belirtilen oturum için cooldown'ı sıfırlar.
    violation_type None ise tüm ihlal tiplerini sıfırlar.
    """
    async with _cache_lock:
        if violation_type:
            _cooldown_cache.pop((session_id, violation_type), None)
        else:
            # Oturumun tüm cooldown'larını temizle
            keys_to_remove = [k for k in _cooldown_cache.keys() if k[0] == session_id]
            for key in keys_to_remove:
                del _cooldown_cache[key]


async def cleanup_expired_cache():
    """
    Süresi dolmuş cache entry'lerini temizler.
    Periyodik olarak çağrılmalı (örn: her 5 dakikada bir).
    """
    now = datetime.now(timezone.utc)
    expiry_threshold = timedelta(minutes=30)  # 30 dakikadan eski entry'leri sil
    
    async with _cache_lock:
        keys_to_remove = [
            key for key, last_time in _cooldown_cache.items()
            if (now - last_time) > expiry_threshold
        ]
        for key in keys_to_remove:
            del _cooldown_cache[key]
    
    return len(keys_to_remove)
