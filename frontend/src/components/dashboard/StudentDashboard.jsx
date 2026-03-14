/**
 * SmartProctor - Öğrenci Dashboard
 * Atanan ve geçmiş sınavları listeler.
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { examAPI, sessionAPI } from '../../services/api'
import { BookOpen, Clock, CheckCircle, AlertTriangle, Play } from 'lucide-react'

export default function StudentDashboard() {
  const [exams, setExams] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Sınavları ve oturumları ayrı ayrı çek — biri başarısız olursa diğeri etkilenmesin
        const [examRes, sessionRes] = await Promise.allSettled([
          examAPI.list(),
          sessionAPI.mySessions(),
        ])

        if (examRes.status === 'fulfilled') {
          console.log('Exam API response:', examRes.value.data)
          setExams(examRes.value.data)
        } else {
          console.error('Exam API error:', examRes.reason)
          setError('Sınavlar yüklenirken hata oluştu: ' + (examRes.reason?.response?.data?.detail || examRes.reason?.message))
        }

        if (sessionRes.status === 'fulfilled') {
          setSessions(sessionRes.value.data)
        } else {
          console.warn('Sessions API error (non-critical):', sessionRes.reason)
          // Oturum hatası kritik değil, sınavlar yine de gösterilir
        }
      } catch (err) {
        console.error('Dashboard fetch error:', err)
        setError('Veriler yüklenirken beklenmeyen bir hata oluştu')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const getSessionForExam = (examId) => sessions.find((s) => s.exam_id === examId)

  const startExam = (examId) => navigate(`/student/exam/${examId}`)

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Sınavlarım</h1>

      {/* Hata mesajı */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        </div>
      )}

      {exams.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <BookOpen className="mx-auto mb-4 text-gray-300" size={48} />
          <p>Henüz atanmış sınavınız yok.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {exams.map((exam) => {
            const session = getSessionForExam(exam.id)
            const isCompleted = session && ['submitted', 'timed_out', 'terminated'].includes(session.status)
            const isActive = exam.status === 'active'

            return (
              <div key={exam.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-900">{exam.title}</h3>
                    <p className="text-sm text-gray-500 mt-1">{exam.description}</p>
                  </div>
                  {isCompleted ? (
                    <span className="flex items-center gap-1 text-green-600 text-xs font-medium bg-green-50 px-2 py-1 rounded-full">
                      <CheckCircle size={14} /> Tamamlandı
                    </span>
                  ) : isActive ? (
                    <span className="flex items-center gap-1 text-blue-600 text-xs font-medium bg-blue-50 px-2 py-1 rounded-full">
                      <Play size={14} /> Aktif
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-yellow-600 text-xs font-medium bg-yellow-50 px-2 py-1 rounded-full">
                      <Clock size={14} /> {exam.status === 'scheduled' ? 'Planlanmış' : exam.status}
                    </span>
                  )}
                </div>

                <div className="text-sm text-gray-500 mb-4 space-y-1">
                  <p className="flex items-center gap-2">
                    <Clock size={14} /> {exam.duration_minutes} dakika
                  </p>
                  {exam.question_count > 0 && (
                    <p>{exam.question_count} soru</p>
                  )}
                  {session?.score !== null && session?.score !== undefined && (
                    <p className="font-medium text-gray-700">Puan: {session.score}</p>
                  )}
                </div>

                {!isCompleted && isActive && (
                  <button
                    onClick={() => startExam(exam.id)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition"
                  >
                    <Play size={18} /> {session ? 'Devam Et' : 'Sınava Başla'}
                  </button>
                )}

                {!isCompleted && !isActive && (
                  <div className="w-full py-2.5 text-center text-gray-400 text-sm border border-dashed rounded-lg">
                    Sınav henüz aktif değil
                  </div>
                )}

                {isCompleted && (
                  <div className="w-full py-2.5 text-center text-green-600 text-sm bg-green-50 rounded-lg font-medium">
                    Sınav tamamlandı
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}