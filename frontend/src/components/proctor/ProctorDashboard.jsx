/**
 * SmartProctor - Gözetmen İnceleme Paneli (Güncellenmiş)
 * + Ders bazlı gruplandırma
 * + Öğrenci bilgisi tamamen anonim
 * + Accordion tarzı ders blokları
 */

import { useState, useEffect } from 'react'
import { violationAPI } from '../../services/api'
import { 
  Eye, CheckCircle, XCircle, AlertTriangle, Video, RefreshCw, 
  ChevronDown, ChevronRight, BookOpen, Clock 
} from 'lucide-react'

export default function ProctorDashboard() {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeReview, setActiveReview] = useState(null)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [expandedCourses, setExpandedCourses] = useState({})

  const fetchReviews = () => {
    setLoading(true)
    violationAPI.pendingReviews()
      .then((res) => {
        setReviews(res.data)
        // Tüm dersleri varsayılan olarak aç
        const courses = {}
        res.data.forEach(v => {
          if (v.course_code) courses[v.course_code] = true
        })
        setExpandedCourses(courses)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchReviews() }, [])

  const handleDecision = async (violationId, decision) => {
    setSubmitting(true)
    try {
      await violationAPI.submitReview(violationId, { decision, comment })
      setActiveReview(null)
      setComment('')
      fetchReviews()
    } catch (err) {
      alert(err.response?.data?.detail || 'Hata oluştu')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleCourse = (courseCode) => {
    setExpandedCourses(prev => ({
      ...prev,
      [courseCode]: !prev[courseCode]
    }))
  }

  // Ders bazlı gruplandır
  const groupedByCourse = reviews.reduce((acc, v) => {
    const key = v.course_code || 'Bilinmeyen Ders'
    if (!acc[key]) {
      acc[key] = {
        course_code: v.course_code,
        course_name: v.course_name,
        violations: []
      }
    }
    acc[key].violations.push(v)
    return acc
  }, {})

  const violationLabels = {
    TAB_SWITCH: 'Sekme Değişikliği',
    FULLSCREEN_EXIT: 'Tam Ekran Çıkışı',
    COPY_PASTE: 'Kopyala/Yapıştır',
    RIGHT_CLICK: 'Sağ Tık',
    DEVTOOLS: 'Geliştirici Araçları',
    KEYBOARD_SHORTCUT: 'Klavye Kısayolu',
    GAZE_LEFT: 'Sola Bakış',
    GAZE_RIGHT: 'Sağa Bakış',
    HEAD_TURN: 'Baş Çevirme',
    NO_FACE: 'Yüz Yok',
    MULTIPLE_FACES: 'Çoklu Yüz',
    PHONE_DETECTED: 'Telefon Tespiti',
    MULTIPLE_PERSONS: 'Birden Fazla Kişi',
    CONNECTION_LOST: 'Bağlantı Koptu',
    OTHER: 'Diğer',
  }

  const violationColors = {
    TAB_SWITCH: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    FULLSCREEN_EXIT: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    COPY_PASTE: 'bg-orange-100 text-orange-800 border-orange-200',
    PHONE_DETECTED: 'bg-red-100 text-red-800 border-red-200',
    MULTIPLE_FACES: 'bg-red-100 text-red-800 border-red-200',
    MULTIPLE_PERSONS: 'bg-red-100 text-red-800 border-red-200',
    NO_FACE: 'bg-purple-100 text-purple-800 border-purple-200',
    HEAD_TURN: 'bg-orange-100 text-orange-800 border-orange-200',
    GAZE_LEFT: 'bg-blue-100 text-blue-800 border-blue-200',
    GAZE_RIGHT: 'bg-blue-100 text-blue-800 border-blue-200',
    CONNECTION_LOST: 'bg-gray-100 text-gray-800 border-gray-200',
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">İhlal İncelemeleri</h1>
          <p className="text-gray-500 mt-1">
            Çift kör doğrulama - Öğrenci kimlikleri <span className="font-medium text-red-600">gizlidir</span>
          </p>
        </div>
        <button 
          onClick={fetchReviews}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
        >
          <RefreshCw size={16} /> Yenile
        </button>
      </div>

      {reviews.length === 0 ? (
        <div className="text-center py-20 text-gray-500 bg-white rounded-xl border">
          <CheckCircle className="mx-auto mb-4 text-green-400" size={48} />
          <p className="text-lg font-medium">Bekleyen inceleme yok</p>
          <p className="text-sm mt-1">Tüm ihlaller incelendi. Tebrikler!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedByCourse).map(([courseCode, courseData]) => (
            <div key={courseCode} className="bg-white rounded-xl shadow-sm border overflow-hidden">
              {/* Ders Başlığı */}
              <button
                onClick={() => toggleCourse(courseCode)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <BookOpen size={20} className="text-blue-600" />
                  </div>
                  <div className="text-left">
                    <h2 className="font-semibold text-gray-900">{courseCode}</h2>
                    <p className="text-sm text-gray-500">{courseData.course_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
                    {courseData.violations.length} ihlal
                  </span>
                  {expandedCourses[courseCode] ? (
                    <ChevronDown size={20} className="text-gray-400" />
                  ) : (
                    <ChevronRight size={20} className="text-gray-400" />
                  )}
                </div>
              </button>

              {/* İhlal Listesi */}
              {expandedCourses[courseCode] && (
                <div className="border-t bg-gray-50 p-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    {courseData.violations.map((v) => (
                      <div 
                        key={v.id} 
                        className={`bg-white rounded-lg border p-4 transition ${
                          activeReview === v.id ? 'ring-2 ring-blue-500' : 'hover:shadow-md'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium border ${
                              violationColors[v.violation_type] || 'bg-gray-100 text-gray-700 border-gray-200'
                            }`}>
                              {violationLabels[v.violation_type] || v.violation_type}
                            </span>
                            <p className="text-xs text-gray-400 mt-2">
                              Sınav: {v.exam_title || 'Bilinmiyor'}
                            </p>
                          </div>
                          {v.confidence && (
                            <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                              %{(v.confidence * 100).toFixed(0)}
                            </span>
                          )}
                        </div>

                        {/* Video Kanıtı */}
                        {v.video_path ? (
                          <div className="mb-3 bg-gray-900 rounded-lg overflow-hidden">
                            <video
                              src={v.video_path}
                              controls
                              className="w-full max-h-32 object-contain"
                            />
                          </div>
                        ) : (
                          <div className="mb-3 bg-gray-100 rounded-lg p-4 text-center text-gray-400">
                            <Video className="mx-auto mb-1" size={20} />
                            <p className="text-xs">Video kanıtı yok</p>
                          </div>
                        )}

                        <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
                          <Clock size={12} />
                          <span>{new Date(v.detected_at).toLocaleString('tr-TR')}</span>
                        </div>

                        {activeReview === v.id ? (
                          <div className="space-y-3">
                            <textarea
                              value={comment}
                              onChange={(e) => setComment(e.target.value)}
                              placeholder="Yorum (opsiyonel)"
                              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                              rows={2}
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleDecision(v.id, 'violation_confirmed')}
                                disabled={submitting}
                                className="flex-1 flex items-center justify-center gap-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-xs font-medium disabled:opacity-50"
                              >
                                <AlertTriangle size={14} /> İhlal
                              </button>
                              <button
                                onClick={() => handleDecision(v.id, 'no_violation')}
                                disabled={submitting}
                                className="flex-1 flex items-center justify-center gap-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-xs font-medium disabled:opacity-50"
                              >
                                <CheckCircle size={14} /> Değil
                              </button>
                            </div>
                            <button 
                              onClick={() => { setActiveReview(null); setComment('') }}
                              className="w-full text-xs text-gray-500 hover:text-gray-700"
                            >
                              İptal
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setActiveReview(v.id)}
                            className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                          >
                            <Eye size={16} /> İncele
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Özet Bilgi */}
      {reviews.length > 0 && (
        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-sm text-blue-700">
            <strong>Toplam:</strong> {Object.keys(groupedByCourse).length} ders, {reviews.length} bekleyen ihlal
          </p>
          <p className="text-xs text-blue-600 mt-1">
            Not: Öğrenci kimlikleri gizlidir. Sadece ihlal kanıtlarını değerlendirin.
          </p>
        </div>
      )}
    </div>
  )
}